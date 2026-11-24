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
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';
import { VoiceService } from './voice.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/decorators';

class TranscriptDto {
  @IsString()
  transcript!: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsBoolean()
  confirmed?: boolean;
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
    }),
  )
  async audio(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body()
    body: {
      projectId?: string;
      conversationId?: string;
      idempotencyKey?: string;
      confirmed?: string;
    },
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
      confirmed: body.confirmed === 'true' || body.confirmed === '1',
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
      confirmed: dto.confirmed,
    });
  }

  @Post('confirm')
  confirm(@CurrentUser() user: AuthUser, @Body() dto: ConfirmDto) {
    return this.voice.confirmAction(user, dto.actionId);
  }
}