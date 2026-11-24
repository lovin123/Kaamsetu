import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TtsProvider, TtsResult } from './interfaces';

@Injectable()
export class SarvamTtsProvider implements TtsProvider {
  private readonly logger = new Logger(SarvamTtsProvider.name);

  constructor(private readonly config: ConfigService) {}

  async synthesize(text: string, languageCode: string): Promise<TtsResult> {
    const apiKey = this.config.get<string>('SARVAM_API_KEY') ?? '';
    if (!apiKey) {
      throw new Error('SARVAM_API_KEY is missing for TTS.');
    }

    const lang = languageCode === 'hinglish' ? 'hi-IN' : languageCode;
    const res = await fetch('https://api.sarvam.ai/text-to-speech', {
      method: 'POST',
      headers: {
        'api-subscription-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        language_code: lang,
        model: this.config.get('SARVAM_TTS_MODEL') ?? 'bulbul:v4-flash',
        speaker: this.config.get('SARVAM_TTS_SPEAKER') ?? 'shubh_enhi_ads',
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`Sarvam TTS failed: ${res.status} ${body}`);
      throw new Error(`Sarvam TTS failed: ${res.status} ${body}`);
    }

    const data = (await res.json()) as { audios?: string[] };
    const audioBase64 = data.audios?.[0] ?? '';
    if (!audioBase64) {
      throw new Error('Sarvam TTS returned empty audio');
    }
    return { audioBase64, mimeType: 'audio/wav' };
  }
}