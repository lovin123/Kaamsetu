import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class FcmProvider implements OnModuleInit {
  private readonly logger = new Logger(FcmProvider.name);
  private ready = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    try {
      const fromFile = this.loadFromFile();
      if (fromFile) {
        if (!admin.apps.length) {
          admin.initializeApp({ credential: admin.credential.cert(fromFile) });
        }
        this.ready = true;
        this.logger.log('Firebase Admin ready (service account file)');
        return;
      }

      const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
      const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL');
      let privateKey = this.config.get<string>('FIREBASE_PRIVATE_KEY');
      if (!projectId || !clientEmail || !privateKey) {
        this.logger.warn('Firebase Admin not configured — FCM disabled');
        return;
      }
      privateKey = privateKey.replace(/\\n/g, '\n');
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        });
      }
      this.ready = true;
      this.logger.log('Firebase Admin ready (env credentials)');
    } catch (err) {
      this.logger.error(
        `Firebase Admin init failed: ${(err as Error).message}`,
      );
      this.ready = false;
    }
  }

  private loadFromFile(): admin.ServiceAccount | null {
    const configured = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH');
    const candidates = [
      configured,
      path.join(process.cwd(), 'secrets', 'firebase-adminsdk.json'),
    ].filter(Boolean) as string[];

    for (const candidate of candidates) {
      const resolved = path.isAbsolute(candidate)
        ? candidate
        : path.resolve(process.cwd(), candidate);
      if (!fs.existsSync(resolved)) continue;
      const raw = JSON.parse(fs.readFileSync(resolved, 'utf8')) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
      if (!raw.project_id || !raw.client_email || !raw.private_key) continue;
      return {
        projectId: raw.project_id,
        clientEmail: raw.client_email,
        privateKey: raw.private_key,
      };
    }
    return null;
  }

  isReady() {
    return this.ready;
  }

  async send(
    token: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ) {
    if (!this.ready) return null;
    const stringData: Record<string, string> = {};
    if (data) {
      for (const [k, v] of Object.entries(data)) {
        stringData[k] = typeof v === 'string' ? v : JSON.stringify(v);
      }
    }
    return admin.messaging().send({
      token,
      notification: { title, body },
      data: stringData,
    });
  }
}
