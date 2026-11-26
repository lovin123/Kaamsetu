import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LLM_PROVIDER } from '../providers/provider.tokens';
import { LlmProvider } from '../providers/interfaces';
import { ProjectsService } from '../projects/projects.service';

@Injectable()
export class SummariesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    private readonly projects: ProjectsService,
  ) {}

  async generate(
    actorId: string,
    actorRole: Role,
    projectId?: string,
    dateIso?: string,
  ) {
    if (!projectId) {
      const projects = await this.projects.listForUser(actorId, actorRole);
      if (!projects.length) throw new NotFoundException('No accessible project');
      projectId = projects[0].id;
    }

    await this.projects.assertStaffAccess(projectId, actorId, actorRole);

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new NotFoundException('Project not found');

    // Day window in Asia/Kolkata (app locale), independent of server TZ
    const dateKey =
      dateIso?.trim().slice(0, 10) ||
      new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      throw new BadRequestException('date must be YYYY-MM-DD');
    }
    const [y, m, d] = dateKey.split('-').map(Number);
    // IST = UTC+5:30
    const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) - 5.5 * 60 * 60 * 1000);
    const end = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) - 5.5 * 60 * 60 * 1000);

    const [tasks, incidents, materials, blockers, progressUpdates] =
      await Promise.all([
        this.prisma.task.findMany({
          where: { projectId },
          select: {
            id: true,
            title: true,
            status: true,
            progressPercent: true,
            location: true,
          },
          take: 100,
        }),
        this.prisma.incident.findMany({
          where: { projectId, createdAt: { gte: start, lte: end } },
          select: {
            title: true,
            category: true,
            severity: true,
            status: true,
            location: true,
          },
          take: 50,
        }),
        this.prisma.materialRequest.findMany({
          where: { projectId, createdAt: { gte: start, lte: end } },
          select: {
            materialName: true,
            quantity: true,
            unit: true,
            status: true,
            urgency: true,
          },
          take: 50,
        }),
        this.prisma.blocker.findMany({
          where: { projectId, createdAt: { gte: start, lte: end } },
          select: {
            reason: true,
            status: true,
            category: true,
            task: { select: { title: true } },
          },
          take: 50,
        }),
        this.prisma.taskProgress.findMany({
          where: {
            createdAt: { gte: start, lte: end },
            task: { projectId },
          },
          select: {
            progressPercent: true,
            notes: true,
            task: { select: { title: true } },
            user: { select: { name: true } },
          },
          take: 50,
        }),
      ]);

    const text = await this.llm.summarizeDay({
      projectName: project.name,
      date: dateKey,
      tasks,
      incidents,
      materials,
      blockers,
      progressUpdates,
    });

    return {
      projectId,
      projectName: project.name,
      date: dateKey,
      text,
      stats: {
        tasks: tasks.length,
        incidentsToday: incidents.length,
        materialsToday: materials.length,
        blockersToday: blockers.length,
        progressUpdatesToday: progressUpdates.length,
      },
    };
  }
}
