import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { VoiceService } from './voice.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/decorators';

const AUDIO_MIME =
  /^(audio\/(wav|wave|x-wav|mpeg|mp3|mp4|m4a|x-m4a|aac|ogg|webm|flac)|application\/octet-stream)$/i;

class TranscriptDto {
  @IsString()
  @MaxLength(4000)
  transcript!: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}

class AudioBodyDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}

class ConfirmDto {
  @IsUUID()
  actionId!: string;
}

@Controller('voice')
@UseGuards(JwtAuthGuard)
export class VoiceController {
  constructor(private readonly voice: VoiceService) {}

  @Post('audio')
  @UseInterceptors(
    FileInterceptor('audio', {
      storage: memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype || !AUDIO_MIME.test(file.mimetype)) {
          cb(
            new BadRequestException(
              'Invalid audio type — use wav/mp3/m4a/ogg/webm',
            ) as any,
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  async audio(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: AudioBodyDto,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('audio file is required');
    }
    return this.voice.processAudio({
      user,
      audio: file.buffer,
      filename: file.originalname,
      mimeType: file.mimetype,
      projectId: body.projectId,
      conversationId: body.conversationId,
      idempotencyKey: body.idempotencyKey,
    });
  }

  @Post('transcript')
  transcript(@CurrentUser() user: AuthUser, @Body() dto: TranscriptDto) {
    return this.voice.processTranscript({
      user,
      transcript: dto.transcript,
      projectId: dto.projectId,
      conversationId: dto.conversationId,
      idempotencyKey: dto.idempotencyKey,
    });
  }

  @Post('confirm')
  confirm(@CurrentUser() user: AuthUser, @Body() dto: ConfirmDto) {
    return this.voice.confirmAction(user, dto.actionId);
  }
}
