import { Controller, Get, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { FcmProvider } from './providers/fcm.provider';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './common/roles.guard';
import { Roles } from './common/decorators';

@Controller('health')
export class HealthController {
  constructor(
    private readonly config: ConfigService,
    private readonly fcm: FcmProvider,
  ) {}

  @Get()
  check() {
    return {
      status: 'ok',
      service: 'kaamsetu-api',
      ts: new Date().toISOString(),
    };
  }

  /** Supervisor-only — do not expose provider config publicly. */
  @Get('providers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPERVISOR)
  providers() {
    const sarvam = Boolean(this.config.get('SARVAM_API_KEY'));
    const xai = Boolean(this.config.get('XAI_API_KEY'));
    const cloudinary = Boolean(
      this.config.get('CLOUDINARY_CLOUD_NAME') &&
        this.config.get('CLOUDINARY_API_KEY') &&
        this.config.get('CLOUDINARY_API_SECRET'),
    );
    const audioStore =
      cloudinary && this.config.get('AUDIO_STORE_ENABLED') === 'true';
    return {
      status: 'ok',
      providers: {
        sarvam,
        llm: xai,
        cloudinary,
        audioStore,
        fcm: this.fcm.isReady(),
      },
    };
  }
}
