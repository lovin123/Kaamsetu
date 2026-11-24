import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import FormData = require('form-data');
import { SttProvider, SttResult } from './interfaces';

@Injectable()
export class SarvamSttProvider implements SttProvider {
  private readonly logger = new Logger(SarvamSttProvider.name);
  private readonly apiKey: string;
  private readonly model: string;
  private readonly mode: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = config.get<string>('SARVAM_API_KEY') ?? '';
    this.model = config.get<string>('SARVAM_STT_MODEL') ?? 'saaras:v4';
    this.mode = config.get<string>('SARVAM_STT_MODE') ?? 'codemix';
  }

  async transcribe(
    audio: Buffer,
    options?: { filename?: string; mimeType?: string; mode?: string },
  ): Promise<SttResult> {
    if (!this.apiKey) {
      throw new Error(
        'SARVAM_API_KEY is missing. Add it to apps/api/.env to enable transcription.',
      );
    }

    const form = new FormData();
    form.append('file', audio, {
      filename: options?.filename ?? 'audio.wav',
      contentType: options?.mimeType ?? 'audio/wav',
    });
    form.append('model', this.model);
    form.append('mode', options?.mode ?? this.mode);

    const buffer = form.getBuffer();
    const res = await fetch('https://api.sarvam.ai/speech-to-text', {
      method: 'POST',
      headers: {
        'api-subscription-key': this.apiKey,
        ...form.getHeaders(),
        'Content-Length': String(buffer.length),
      },
      body: buffer as unknown as BodyInit,
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Sarvam STT failed: ${res.status} ${text}`);
      throw new Error(`Sarvam STT failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as {
      transcript?: string;
      language_code?: string;
    };
    return {
      transcript: data.transcript ?? '',
      language: data.language_code,
      raw: data,
    };
  }
}