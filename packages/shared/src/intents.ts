import { z } from 'zod';

export const IntentTypeSchema = z.enum([
  'update_task_progress',
  'create_incident',
  'create_material_request',
  'create_blocker',
  'query_tasks',
  'daily_summary',
  'clarify',
]);

export type IntentType = z.infer<typeof IntentTypeSchema>;

const ConfidenceSchema = z.object({
  confidence: z.number().min(0).max(1),
  requiresConfirmation: z.boolean().default(false),
  clarificationQuestion: z.string().optional(),
  originalTranscript: z.string(),
  languageDetected: z.string().optional(),
});

export const UpdateTaskProgressPayloadSchema = ConfidenceSchema.extend({
  intent: z.literal('update_task_progress'),
  taskId: z.string().uuid().optional(),
  taskReference: z.string().optional(),
  progressPercent: z.number().min(0).max(100),
  notes: z.string().optional(),
  locationHint: z.string().optional(),
});

export const CreateIncidentPayloadSchema = ConfidenceSchema.extend({
  intent: z.literal('create_incident'),
  category: z.enum([
    'electrical',
    'plumbing',
    'structural',
    'safety',
    'equipment',
    'other',
  ]),
  title: z.string().min(1),
  description: z.string().min(1),
  location: z.string().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  taskId: z.string().uuid().optional(),
});

export const CreateMaterialRequestPayloadSchema = ConfidenceSchema.extend({
  intent: z.literal('create_material_request'),
  materialName: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  taskId: z.string().uuid().optional(),
  urgency: z.enum(['normal', 'urgent']).default('normal'),
  notes: z.string().optional(),
});

export const CreateBlockerPayloadSchema = ConfidenceSchema.extend({
  intent: z.literal('create_blocker'),
  taskId: z.string().uuid().optional(),
  taskReference: z.string().optional(),
  reason: z.string().min(1),
  category: z
    .enum(['materials', 'access', 'weather', 'safety', 'other'])
    .default('other'),
});

export const QueryTasksPayloadSchema = ConfidenceSchema.extend({
  intent: z.literal('query_tasks'),
  statusFilter: z
    .enum(['all', 'pending', 'in_progress', 'blocked', 'completed'])
    .default('all'),
  query: z.string().optional(),
});

export const DailySummaryPayloadSchema = ConfidenceSchema.extend({
  intent: z.literal('daily_summary'),
  projectId: z.string().uuid().optional(),
  date: z.string().optional(),
});

export const ClarifyPayloadSchema = ConfidenceSchema.extend({
  intent: z.literal('clarify'),
  question: z.string().min(1),
  possibleIntents: z.array(IntentTypeSchema).optional(),
});

export const VoiceIntentSchema = z.discriminatedUnion('intent', [
  UpdateTaskProgressPayloadSchema,
  CreateIncidentPayloadSchema,
  CreateMaterialRequestPayloadSchema,
  CreateBlockerPayloadSchema,
  QueryTasksPayloadSchema,
  DailySummaryPayloadSchema,
  ClarifyPayloadSchema,
]);

export type VoiceIntent = z.infer<typeof VoiceIntentSchema>;

export const DenoiseModeSchema = z.enum(['deepfilternet', 'android_ns', 'off']);
export type DenoiseMode = z.infer<typeof DenoiseModeSchema>;

export const TaskStatusSchema = z.enum([
  'pending',
  'in_progress',
  'blocked',
  'completed',
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
