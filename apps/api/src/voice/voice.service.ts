import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { isFieldWorker, isStaffRole, VoiceIntent } from '@kaamsetu/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  LLM_PROVIDER,
  MEDIA_PROVIDER,
  STT_PROVIDER,
  TRANSLATE_PROVIDER,
  TTS_PROVIDER,
} from '../providers/provider.tokens';
import {
  LlmProvider,
  MediaStorageProvider,
  SttProvider,
  TranslateProvider,
  TtsProvider,
} from '../providers/interfaces';
import { TasksService } from '../tasks/tasks.service';
import { IncidentsService } from '../incidents/incidents.service';
import { MaterialsService } from '../materials/materials.service';
import { BlockersService } from '../blockers/blockers.service';
import { SummariesService } from '../summaries/summaries.service';
import { ProjectsService } from '../projects/projects.service';
import { AuthUser } from '../common/decorators';
import { randomUUID } from 'crypto';

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(STT_PROVIDER) private readonly stt: SttProvider,
    @Inject(TTS_PROVIDER) private readonly tts: TtsProvider,
    @Inject(TRANSLATE_PROVIDER) private readonly translate: TranslateProvider,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    @Inject(MEDIA_PROVIDER) private readonly media: MediaStorageProvider,
    private readonly tasks: TasksService,
    private readonly incidents: IncidentsService,
    private readonly materials: MaterialsService,
    private readonly blockers: BlockersService,
    private readonly summaries: SummariesService,
    private readonly projects: ProjectsService,
  ) {}

  async processAudio(params: {
    user: AuthUser;
    audio: Buffer;
    filename?: string;
    mimeType?: string;
    projectId?: string;
    conversationId?: string;
    idempotencyKey?: string;
  }) {
    if (params.idempotencyKey) {
      const existing = await this.findIdempotent(
        params.idempotencyKey,
        params.user.id,
      );
      if (existing) return existing;
    }

    const sttResult = await this.stt.transcribe(params.audio, {
      filename: params.filename,
      mimeType: params.mimeType,
    });
    if (!sttResult.transcript?.trim()) {
      throw new BadRequestException('Empty transcript');
    }

    const uploaded = await this.media.uploadAudio(
      params.audio,
      `voice-${randomUUID()}.wav`,
    );

    return this.processTranscript({
      user: params.user,
      transcript: sttResult.transcript,
      language: sttResult.language,
      projectId: params.projectId,
      conversationId: params.conversationId,
      audioUrl: uploaded?.url,
      idempotencyKey: params.idempotencyKey,
    });
  }

  async processTranscript(params: {
    user: AuthUser;
    transcript: string;
    language?: string;
    projectId?: string;
    conversationId?: string;
    audioUrl?: string;
    idempotencyKey?: string;
  }) {
    if (params.idempotencyKey) {
      const existing = await this.findIdempotent(
        params.idempotencyKey,
        params.user.id,
      );
      if (existing) return existing;
    }

    const fullUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: params.user.id },
    });

    // Confirmation only via /voice/confirm — never from client body.
    const confirmed = false;

    const role = params.user.role as Role;
    let projectId = params.projectId;
    if (!projectId) {
      const scope = await this.projects.accessibleProjectIds(
        params.user.id,
        role,
      );
      if (scope === 'ALL') {
        throw new BadRequestException(
          'projectId is required for admin voice actions',
        );
      }
      if (scope.length === 0) {
        throw new BadRequestException('Join a project before using voice');
      }
      if (scope.length > 1) {
        throw new BadRequestException(
          'projectId is required when you belong to multiple projects',
        );
      }
      projectId = scope[0];
    }

    await this.projects.assertAccess(projectId, params.user.id, role);

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    const assignedTasks = await this.prisma.task.findMany({
      where: isFieldWorker(role)
        ? { assigneeId: params.user.id, projectId }
        : { projectId },
      select: {
        id: true,
        title: true,
        location: true,
        status: true,
        progressPercent: true,
      },
      take: 30,
    });

    let conversation = params.conversationId
      ? await this.prisma.conversation.findUnique({
          where: { id: params.conversationId },
        })
      : null;

    if (params.conversationId) {
      if (!conversation) {
        throw new BadRequestException('Conversation not found');
      }
      if (conversation.userId !== params.user.id) {
        throw new ForbiddenException('Conversation does not belong to user');
      }
      if (
        conversation.projectId &&
        projectId &&
        conversation.projectId !== projectId
      ) {
        throw new BadRequestException('Conversation project mismatch');
      }
    } else {
      conversation = await this.prisma.conversation.create({
        data: {
          userId: params.user.id,
          projectId: projectId ?? null,
        },
      });
    }

    const recentMessages = await this.prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'desc' },
      take: 8,
    });

    const openIncidents = projectId
      ? await this.prisma.incident.findMany({
          where: { projectId, status: 'open' },
          select: { title: true, location: true },
          take: 10,
        })
      : [];

    const openBlockers = projectId
      ? await this.prisma.blocker.findMany({
          where: { projectId, status: 'open' },
          include: { task: { select: { title: true } } },
          take: 10,
        })
      : [];

    await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: params.transcript,
        audioUrl: params.audioUrl,
        language: params.language,
      },
    });

    let intent: VoiceIntent;
    try {
      intent = await this.llm.extractIntent(params.transcript, {
        userId: params.user.id,
        role: params.user.role,
        preferredLanguage: fullUser.preferredLanguage,
        projectId: project?.id,
        projectName: project?.name,
        assignedTasks,
        recentMessages: recentMessages
          .reverse()
          .map((m) => ({ role: m.role, content: m.content })),
        openIncidents,
        openBlockers: openBlockers.map((b) => ({
          reason: b.reason,
          taskTitle: b.task.title,
        })),
      });
    } catch (err) {
      this.logger.error(`Intent extraction failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException(
        'Voice processing unavailable — please try again',
      );
    }

    const threshold = Number(
      this.config.get('VOICE_REQUIRE_CONFIRMATION_BELOW') ?? 0.75,
    );
    const needsConfirm =
      intent.requiresConfirmation ||
      intent.confidence < threshold ||
      intent.intent === 'clarify';

    let actionLog;
    try {
      actionLog = await this.prisma.actionLog.create({
        data: {
          userId: params.user.id,
          idempotencyKey: params.idempotencyKey
            ? `${params.user.id}:${params.idempotencyKey}`
            : undefined,
          intent: intent.intent,
          transcript: params.transcript,
          payload: { ...intent, _projectId: projectId } as object,
          confidence: intent.confidence,
          confirmed,
          status: needsConfirm ? 'awaiting_confirmation' : 'pending',
        },
      });
    } catch (err) {
      if (params.idempotencyKey) {
        const existing = await this.findIdempotent(
          params.idempotencyKey,
          params.user.id,
        );
        if (existing) return existing;
      }
      throw err;
    }

    if (needsConfirm) {
      const question =
        intent.intent === 'clarify'
          ? intent.question
          : intent.clarificationQuestion ??
            `Confirm: ${intent.intent} (confidence ${Math.round(intent.confidence * 100)}%)?`;

      const replyText = await this.maybeTranslate(
        question,
        fullUser.preferredLanguage,
      );
      const tts = await this.safeTts(replyText, fullUser.preferredLanguage);

      await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: 'assistant',
          content: replyText,
          intentJson: intent as object,
          language: fullUser.preferredLanguage,
        },
      });

      const response = {
        status: 'needs_confirmation',
        conversationId: conversation.id,
        actionId: actionLog.id,
        transcript: params.transcript,
        intent,
        replyText,
        ttsAudioBase64: tts?.audioBase64,
        ttsMimeType: tts?.mimeType,
      };
      await this.storeIdempotent(params.idempotencyKey, params.user.id, response);
      return response;
    }

    const execution = await this.executeIntent(
      intent,
      params.user,
      projectId,
    );

    await this.prisma.actionLog.update({
      where: { id: actionLog.id },
      data: {
        status: 'executed',
        confirmed: true,
        result: execution as object,
      },
    });

    const replyText = await this.maybeTranslate(
      execution.message,
      fullUser.preferredLanguage,
    );
    const tts = await this.safeTts(replyText, fullUser.preferredLanguage);

    await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: replyText,
        intentJson: intent as object,
        language: fullUser.preferredLanguage,
      },
    });

    const response = {
      status: 'executed',
      conversationId: conversation.id,
      actionId: actionLog.id,
      transcript: params.transcript,
      intent,
      result: execution.data,
      replyText,
      ttsAudioBase64: tts?.audioBase64,
      ttsMimeType: tts?.mimeType,
    };
    await this.storeIdempotent(params.idempotencyKey, params.user.id, response);
    return response;
  }

  async confirmAction(user: AuthUser, actionId: string) {
    const log = await this.prisma.actionLog.findFirst({
      where: { id: actionId, userId: user.id },
    });
    if (!log) throw new BadRequestException('Action not found');
    if (log.status === 'executed') {
      return { status: 'executed', result: log.result };
    }
    if (log.status !== 'awaiting_confirmation') {
      throw new BadRequestException('Action is not awaiting confirmation');
    }

    const claimed = await this.prisma.actionLog.updateMany({
      where: {
        id: actionId,
        userId: user.id,
        status: 'awaiting_confirmation',
      },
      data: { status: 'confirming', confirmed: true },
    });
    if (claimed.count === 0) {
      const again = await this.prisma.actionLog.findFirst({
        where: { id: actionId, userId: user.id },
      });
      if (again?.status === 'executed') {
        return { status: 'executed', result: again.result };
      }
      throw new BadRequestException('Action already being confirmed');
    }

    const raw = log.payload as VoiceIntent & { _projectId?: string };
    const { _projectId, ...intentFields } = raw;
    const intent = intentFields as VoiceIntent;
    const projectId = _projectId;
    if (!projectId) {
      await this.prisma.actionLog.update({
        where: { id: actionId },
        data: { status: 'awaiting_confirmation', confirmed: false },
      });
      throw new BadRequestException('Action is missing project context');
    }

    let execution: { message: string; data?: unknown };
    try {
      execution = await this.executeIntent(intent, user, projectId);
      await this.prisma.actionLog.update({
        where: { id: actionId },
        data: {
          status: 'executed',
          confirmed: true,
          result: execution as object,
        },
      });
    } catch (err) {
      // Roll back claim so the user can retry /voice/confirm
      await this.prisma.actionLog.update({
        where: { id: actionId },
        data: { status: 'awaiting_confirmation', confirmed: false },
      });
      this.logger.error(
        `confirmAction execute failed actionId=${actionId}: ${(err as Error).message}`,
      );
      throw err;
    }

    const fullUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    const replyText = await this.maybeTranslate(
      execution.message,
      fullUser.preferredLanguage,
    );
    const tts = await this.safeTts(replyText, fullUser.preferredLanguage);

    let conversation = await this.prisma.conversation.findFirst({
      where: { userId: user.id, ...(projectId ? { projectId } : {}) },
      orderBy: { updatedAt: 'desc' },
    });
    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: { userId: user.id, projectId: projectId ?? null },
      });
    }
    await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: replyText,
        intentJson: intent as object,
        language: fullUser.preferredLanguage,
      },
    });

    return {
      status: 'executed',
      actionId,
      conversationId: conversation.id,
      intent,
      result: execution.data,
      replyText,
      ttsAudioBase64: tts?.audioBase64,
      ttsMimeType: tts?.mimeType,
    };
  }

  private async executeIntent(
    intent: VoiceIntent,
    user: AuthUser,
    projectId?: string,
  ): Promise<{ message: string; data: unknown }> {
    switch (intent.intent) {
      case 'update_task_progress': {
        let taskId = intent.taskId;
        if (!taskId && intent.taskReference && projectId) {
          const matches = await this.tasks.findByReference(
            projectId,
            intent.taskReference,
            isFieldWorker(user.role) ? user.id : undefined,
          );
          if (matches.length === 1) taskId = matches[0].id;
          else if (matches.length === 0) {
            return {
              message: 'Task nahi mila. Kaunsa task update karna hai?',
              data: { matches },
            };
          } else {
            return {
              message: `Multiple tasks mile: ${matches.map((m) => m.title).join(', ')}. Confirm karein.`,
              data: { matches },
            };
          }
        }
        if (!taskId) {
          return {
            message: 'Task identify nahi hua. Thoda detail dein.',
            data: null,
          };
        }
        const result = await this.tasks.updateProgress(
          taskId,
          user.id,
          user.role,
          {
            progressPercent: intent.progressPercent,
            notes: intent.notes,
            transcript: intent.originalTranscript,
            source: 'voice',
          },
        );
        return {
          message: `Progress update ho gaya: ${intent.progressPercent}%.`,
          data: result,
        };
      }
      case 'create_incident': {
        if (!projectId) {
          return { message: 'Project select karein pehle.', data: null };
        }
        const incident = await this.incidents.create(
          {
            projectId,
            taskId: intent.taskId,
            category: intent.category,
            title: intent.title,
            description: intent.description,
            location: intent.location,
            severity: intent.severity,
            transcript: intent.originalTranscript,
          },
          user.id,
          user.role,
        );
        return {
          message: `Incident report ho gaya: ${incident.title}. Supervisor ko notify kiya.`,
          data: incident,
        };
      }
      case 'create_material_request': {
        if (!projectId) {
          return { message: 'Project select karein pehle.', data: null };
        }
        const req = await this.materials.create(
          {
            projectId,
            taskId: intent.taskId,
            materialName: intent.materialName,
            quantity: intent.quantity,
            unit: intent.unit,
            urgency: intent.urgency,
            notes: intent.notes,
            transcript: intent.originalTranscript,
          },
          user.id,
          user.role,
        );
        return {
          message: `Material request: ${req.quantity} ${req.unit} ${req.materialName}.`,
          data: req,
        };
      }
      case 'create_blocker': {
        if (!projectId) {
          return { message: 'Project select karein pehle.', data: null };
        }
        let taskId = intent.taskId;
        if (!taskId && intent.taskReference) {
          const matches = await this.tasks.findByReference(
            projectId,
            intent.taskReference,
            isFieldWorker(user.role) ? user.id : undefined,
          );
          if (matches.length === 1) taskId = matches[0].id;
        }
        if (!taskId) {
          return {
            message: 'Kaunsa task block hai? Task bataiye.',
            data: null,
          };
        }
        const blocker = await this.blockers.create(
          {
            projectId,
            taskId,
            reason: intent.reason,
            category: intent.category,
            transcript: intent.originalTranscript,
          },
          user.id,
          user.role,
        );
        return {
          message: 'Task blocked mark ho gaya. Supervisor alerted.',
          data: blocker,
        };
      }
      case 'query_tasks': {
        const tasks = await this.tasks.list(user.id, user.role, projectId);
        const filtered =
          intent.statusFilter && intent.statusFilter !== 'all'
            ? tasks.filter((t) => t.status === intent.statusFilter)
            : tasks;
        const lines = filtered
          .slice(0, 8)
          .map(
            (t) =>
              `${t.title}: ${t.progressPercent}% (${t.status})`,
          )
          .join('\n');
        return {
          message: lines || 'Koi task nahi mila.',
          data: filtered,
        };
      }
      case 'daily_summary': {
        if (!isStaffRole(user.role)) {
          throw new ForbiddenException(
            'Daily summary is only available to supervisors and admins',
          );
        }
        const summary = await this.summaries.generate(
          user.id,
          user.role,
          intent.projectId ?? projectId,
          intent.date,
        );
        return { message: summary.text, data: summary };
      }
      case 'clarify':
        return { message: intent.question, data: null };
      default:
        return { message: 'Intent handle nahi hua.', data: null };
    }
  }

  private async maybeTranslate(text: string, preferred: string) {
    if (!preferred || preferred === 'en-IN' || preferred === 'hinglish') {
      return text;
    }
    try {
      return await this.translate.translate(text, preferred, 'auto');
    } catch (err) {
      this.logger.warn(`Translate skipped: ${(err as Error).message}`);
      return text;
    }
  }

  private async safeTts(text: string, language: string) {
    try {
      return await this.tts.synthesize(text, language);
    } catch (err) {
      this.logger.warn(`TTS skipped: ${(err as Error).message}`);
      return null;
    }
  }

  private idempotencyStorageKey(key: string, userId: string) {
    return `${userId}:${key}`;
  }

  private async findIdempotent(key: string, userId: string) {
    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: { key: this.idempotencyStorageKey(key, userId) },
    });
    if (!existing) return null;
    if (existing.userId !== userId) return null;
    return existing.response;
  }

  private async storeIdempotent(
    key: string | undefined,
    userId: string,
    response: unknown,
  ) {
    if (!key) return;
    const storageKey = this.idempotencyStorageKey(key, userId);
    await this.prisma.idempotencyRecord.upsert({
      where: { key: storageKey },
      create: { key: storageKey, userId, response: response as object },
      update: { response: response as object, userId },
    });
  }
}
