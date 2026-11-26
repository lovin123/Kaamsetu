import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VoiceIntent, VoiceIntentSchema } from '@kaamsetu/shared';
import { LlmContext, LlmProvider } from './interfaces';

const INTENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'emit_voice_intent',
      description:
        'Emit a structured workforce intent. Always set originalTranscript. Set requiresConfirmation true when ambiguous. Required extras by intent: update_task_progress→progressPercent; create_incident→category,title,description (category: electrical|plumbing|structural|safety|equipment|other); create_material_request→materialName,quantity,unit; create_blocker→reason; clarify→question; query_tasks optional statusFilter all|pending|in_progress|blocked|completed.',
      parameters: {
        type: 'object',
        properties: {
          intent: {
            type: 'string',
            enum: [
              'update_task_progress',
              'create_incident',
              'create_material_request',
              'create_blocker',
              'query_tasks',
              'daily_summary',
              'clarify',
            ],
          },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          requiresConfirmation: { type: 'boolean' },
          clarificationQuestion: { type: 'string' },
          originalTranscript: { type: 'string' },
          languageDetected: { type: 'string' },
          taskId: { type: 'string', format: 'uuid' },
          taskReference: { type: 'string' },
          progressPercent: { type: 'number', minimum: 0, maximum: 100 },
          notes: { type: 'string' },
          locationHint: { type: 'string' },
          category: {
            type: 'string',
            description:
              'Incident: electrical|plumbing|structural|safety|equipment|other. Blocker: materials|access|weather|safety|other.',
            enum: [
              'electrical',
              'plumbing',
              'structural',
              'safety',
              'equipment',
              'other',
              'materials',
              'access',
              'weather',
            ],
          },
          title: { type: 'string' },
          description: { type: 'string' },
          location: { type: 'string' },
          severity: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'critical'],
          },
          materialName: { type: 'string' },
          quantity: { type: 'number', exclusiveMinimum: 0 },
          unit: { type: 'string' },
          urgency: { type: 'string', enum: ['normal', 'urgent'] },
          reason: { type: 'string' },
          statusFilter: {
            type: 'string',
            enum: ['all', 'pending', 'in_progress', 'blocked', 'completed'],
          },
          query: { type: 'string' },
          projectId: { type: 'string', format: 'uuid' },
          date: { type: 'string' },
          question: { type: 'string' },
          possibleIntents: {
            type: 'array',
            items: {
              type: 'string',
              enum: [
                'update_task_progress',
                'create_incident',
                'create_material_request',
                'create_blocker',
                'query_tasks',
                'daily_summary',
                'clarify',
              ],
            },
          },
        },
        required: [
          'intent',
          'confidence',
          'requiresConfirmation',
          'originalTranscript',
        ],
      },
    },
  },
];

/** Models tried when Groq returns model_not_found / decommissioned. */
const GROQ_MODEL_FALLBACKS = [
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
  'qwen/qwen3.8-27b',
  'meta-models/muse-spark-open',
  'gemma2-9b-it',
];

@Injectable()
export class GrokLlmProvider implements LlmProvider {
  private readonly logger = new Logger(GrokLlmProvider.name);
  private resolvedModel: string | null = null;

  constructor(private readonly config: ConfigService) {}

  private get clientConfig() {
    const apiKey = this.config.get<string>('XAI_API_KEY') ?? '';
    let base =
      this.config.get<string>('XAI_API_BASE') ?? 'https://api.x.ai/v1';
    let model = this.config.get<string>('XAI_MODEL') ?? 'grok-4-latest';
    const isGroq =
      apiKey.startsWith('gsk_') || /api\.groq\.com/i.test(base);

    if (apiKey.startsWith('gsk_') && /api\.x\.ai/i.test(base)) {
      base = 'https://api.groq.com/openai/v1';
    }
    if (isGroq && (model.startsWith('grok') || model.startsWith('llama-3.'))) {
      // Free/dev Llama 3.x on Groq was shut down Aug 2026 — use GPT-OSS.
      model = 'openai/gpt-oss-20b';
    }
    if (this.resolvedModel) {
      model = this.resolvedModel;
    }

    return { apiKey, base, model, isGroq };
  }

  private async chatCompletions(
    body: Record<string, unknown>,
  ): Promise<Response> {
    const { apiKey, base, model, isGroq } = this.clientConfig;
    const models = isGroq
      ? [model, ...GROQ_MODEL_FALLBACKS.filter((m) => m !== model)]
      : [model];

    let last: Response | null = null;
    let lastBody = '';
    for (const candidate of models) {
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...body, model: candidate }),
      });
      if (res.ok) {
        if (candidate !== model) {
          this.logger.warn(`LLM model fallback succeeded: ${candidate}`);
        }
        this.resolvedModel = candidate;
        return res;
      }
      lastBody = await res.text();
      last = new Response(lastBody, { status: res.status, statusText: res.statusText });
      // Cached model went bad — clear so next request re-probes the chain
      if (candidate === this.resolvedModel) {
        this.resolvedModel = null;
      }
      const modelMissing =
        res.status === 404 ||
        /model_not_found|model_decommissioned|does not exist|not have access|no longer supported|decommissioned/i.test(
          lastBody,
        );
      if (!modelMissing || !isGroq) {
        this.logger.error(`LLM failed (${candidate}): ${res.status} ${lastBody}`);
        return last;
      }
      this.logger.warn(
        `Model unavailable (${candidate}): ${lastBody.slice(0, 180)} — trying next…`,
      );
    }
    this.logger.error(`LLM failed after fallbacks: ${last?.status} ${lastBody}`);
    return last ?? new Response('LLM unavailable', { status: 503 });
  }

  async extractIntent(
    transcript: string,
    context: LlmContext,
  ): Promise<VoiceIntent> {
    const { apiKey } = this.clientConfig;
    if (!apiKey) {
      throw new Error(
        'XAI_API_KEY is missing. Add it to apps/api/.env for intent extraction.',
      );
    }

    const system = `You are KaamSetu, an AI coordinator for Indian construction/field workforce.
Languages: Hindi, Marathi, Hinglish, English (code-mixed OK).
Map utterances to ONE structured intent via the emit_voice_intent tool.
Never invent task IDs — use taskReference matching assigned tasks when unsure.
If ambiguous about task, quantity, or high-impact action, set requiresConfirmation=true and optionally use clarify intent.
Always set originalTranscript to the exact user transcript.
User role: ${context.role}. Preferred language: ${context.preferredLanguage}.
Project: ${context.projectName ?? 'unknown'} (${context.projectId ?? 'n/a'}).
Assigned tasks JSON: ${JSON.stringify(context.assignedTasks)}
Open incidents: ${JSON.stringify(context.openIncidents ?? [])}
Open blockers: ${JSON.stringify(context.openBlockers ?? [])}`;

    const messages = [
      { role: 'system', content: system },
      ...context.recentMessages.slice(-6),
      { role: 'user', content: transcript },
    ];

    const res = await this.chatCompletions({
      messages,
      tools: INTENT_TOOLS,
      tool_choice: {
        type: 'function',
        function: { name: 'emit_voice_intent' },
      },
      temperature: 0.2,
    });

    if (!res.ok) {
      throw new Error(`Grok API failed: ${res.status}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{
        message?: {
          tool_calls?: Array<{
            function?: { arguments?: string };
          }>;
          content?: string;
        };
      }>;
    };

    const argsRaw =
      data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!argsRaw) {
      return {
        intent: 'clarify',
        confidence: 0.3,
        requiresConfirmation: true,
        originalTranscript: transcript,
        question:
          'Samajh nahi aaya. Progress update, incident, material, ya blocker?',
      };
    }

    const parsed = JSON.parse(argsRaw) as Record<string, unknown>;
    parsed.originalTranscript = transcript;
    const result = VoiceIntentSchema.safeParse(parsed);
    if (!result.success) {
      this.logger.warn(`Intent schema mismatch: ${result.error.message}`);
      return {
        intent: 'clarify',
        confidence: 0.4,
        requiresConfirmation: true,
        originalTranscript: transcript,
        question: 'Please confirm what you want to do.',
        clarificationQuestion: result.error.message,
      };
    }
    return result.data;
  }

  async summarizeDay(context: {
    projectName: string;
    date: string;
    tasks: unknown[];
    incidents: unknown[];
    materials: unknown[];
    blockers: unknown[];
    progressUpdates: unknown[];
  }): Promise<string> {
    const { apiKey } = this.clientConfig;
    if (!apiKey) {
      throw new Error('XAI_API_KEY is missing for daily summary.');
    }

    const res = await this.chatCompletions({
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content:
            'You are KaamSetu supervisor assistant. Write a concise daily site summary in clear Hinglish/English using ONLY the provided records. Include progress, incidents, materials, blockers. No fabrication.',
        },
        {
          role: 'user',
          content: JSON.stringify(context),
        },
      ],
    });

    if (!res.ok) {
      throw new Error(`Grok summary failed: ${res.status}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? 'No summary available.';
  }
}
