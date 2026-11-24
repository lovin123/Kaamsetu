import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { MediaStorageProvider } from './interfaces';

@Injectable()
export class CloudinaryMediaProvider implements MediaStorageProvider {
  private readonly logger = new Logger(CloudinaryMediaProvider.name);
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    const cloudName = config.get('CLOUDINARY_CLOUD_NAME');
    const apiKey = config.get('CLOUDINARY_API_KEY');
    const apiSecret = config.get('CLOUDINARY_API_SECRET');
    this.enabled = Boolean(cloudName && apiKey && apiSecret);
    if (this.enabled) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
      });
    }
  }

  isEnabled() {
    return this.enabled && this.config.get('AUDIO_STORE_ENABLED') === 'true';
  }

  async uploadAudio(
    buffer: Buffer,
    filename: string,
  ): Promise<{ url: string } | null> {
    if (!this.isEnabled()) {
      return null;
    }
    try {
      const result = await new Promise<{ secure_url: string }>(
        (resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              resource_type: 'video',
              folder: 'kaamsetu/audio',
              public_id: filename.replace(/\.[^.]+$/, ''),
            },
            (err, res) => {
              if (err || !res) reject(err ?? new Error('Cloudinary empty'));
              else resolve(res as { secure_url: string });
            },
          );
          stream.end(buffer);
        },
      );
      return { url: result.secure_url };
    } catch (err) {
      this.logger.warn(`Cloudinary upload failed: ${(err as Error).message}`);
      return null;
    }
  }
}
