import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TranslateProvider } from './interfaces';

@Injectable()
export class SarvamTranslateProvider implements TranslateProvider {
  private readonly logger = new Logger(SarvamTranslateProvider.name);

  constructor(private readonly config: ConfigService) {}

  async translate(
    text: string,
    targetLanguage: string,
    sourceLanguage = 'auto',
  ): Promise<string> {
    const apiKey = this.config.get<string>('SARVAM_API_KEY') ?? '';
    if (!apiKey) {
      throw new Error('SARVAM_API_KEY is missing for Translate.');
    }
    const target =
      targetLanguage === 'hinglish' ? 'hi-IN' : targetLanguage;

    const res = await fetch('https://api.sarvam.ai/translate', {
      method: 'POST',
      headers: {
        'api-subscription-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: text,
        source_language_code: sourceLanguage,
        target_language_code: target,
        speaker_gender: 'Male',
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`Sarvam Translate failed: ${res.status} ${body}`);
      throw new Error(`Sarvam Translate failed: ${res.status}`);
    }

    const data = (await res.json()) as { translated_text?: string };
    return data.translated_text ?? text;
  }
}
