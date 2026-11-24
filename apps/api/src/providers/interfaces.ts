import { VoiceIntent } from '@kaamsetu/shared';

export interface SttResult {
  transcript: string;
  language?: string;
  raw?: unknown;
}

export interface SttProvider {
  transcribe(
    audio: Buffer,
    options?: { filename?: string; mimeType?: string; mode?: string },
  ): Promise<SttResult>;
}

export interface TtsResult {
  audioBase64: string;
  mimeType: string;
}

export interface TtsProvider {
  synthesize(
    text: string,
    languageCode: string,
  ): Promise<TtsResult>;
}

export interface TranslateProvider {
  translate(
    text: string,
    targetLanguage: string,
    sourceLanguage?: string,
  ): Promise<string>;
}

export interface LlmContext {
  userId: string;
  role: string;
  preferredLanguage: string;
  projectId?: string;
  projectName?: string;
  assignedTasks: Array<{
    id: string;
    title: string;
    location?: string | null;
    status: string;
    progressPercent: number;
  }>;
  recentMessages: Array<{ role: string; content: string }>;
  openIncidents?: Array<{ title: string; location?: string | null }>;
  openBlockers?: Array<{ reason: string; taskTitle: string }>;
}

export interface LlmProvider {
  extractIntent(
    transcript: string,
    context: LlmContext,
  ): Promise<VoiceIntent>;
  summarizeDay(context: {
    projectName: string;
    date: string;
    tasks: unknown[];
    incidents: unknown[];
    materials: unknown[];
    blockers: unknown[];
    progressUpdates: unknown[];
  }): Promise<string>;
}

export interface MediaStorageProvider {
  uploadAudio(
    buffer: Buffer,
    filename: string,
  ): Promise<{ url: string } | null>;
}
