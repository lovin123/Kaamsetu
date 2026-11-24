import { Global, Module } from '@nestjs/common';
import {
  LLM_PROVIDER,
  MEDIA_PROVIDER,
  STT_PROVIDER,
  TRANSLATE_PROVIDER,
  TTS_PROVIDER,
} from './provider.tokens';
import { SarvamSttProvider } from './sarvam-stt.provider';
import { SarvamTtsProvider } from './sarvam-tts.provider';
import { SarvamTranslateProvider } from './sarvam-translate.provider';
import { GrokLlmProvider } from './grok-llm.provider';
import { CloudinaryMediaProvider } from './cloudinary.provider';
import { FcmProvider } from './fcm.provider';
import { ExpoPushProvider } from './expo-push.provider';

@Global()
@Module({
  providers: [
    SarvamSttProvider,
    SarvamTtsProvider,
    SarvamTranslateProvider,
    GrokLlmProvider,
    CloudinaryMediaProvider,
    FcmProvider,
    ExpoPushProvider,
    { provide: STT_PROVIDER, useExisting: SarvamSttProvider },
    { provide: TTS_PROVIDER, useExisting: SarvamTtsProvider },
    { provide: TRANSLATE_PROVIDER, useExisting: SarvamTranslateProvider },
    { provide: LLM_PROVIDER, useExisting: GrokLlmProvider },
    { provide: MEDIA_PROVIDER, useExisting: CloudinaryMediaProvider },
  ],
  exports: [
    STT_PROVIDER,
    TTS_PROVIDER,
    TRANSLATE_PROVIDER,
    LLM_PROVIDER,
    MEDIA_PROVIDER,
    FcmProvider,
    ExpoPushProvider,
    SarvamSttProvider,
    SarvamTtsProvider,
    SarvamTranslateProvider,
    GrokLlmProvider,
    CloudinaryMediaProvider,
  ],
})
export class ProvidersModule {}