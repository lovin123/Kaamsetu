import { Injectable, Logger } from '@nestjs/common';

/** Sends to Expo Push API when device registered an ExponentPushToken / ExpoPushToken. */
@Injectable()
export class ExpoPushProvider {
  private readonly logger = new Logger(ExpoPushProvider.name);

  isExpoToken(token: string) {
    return (
      token.startsWith('ExponentPushToken[') ||
      token.startsWith('ExpoPushToken[')
    );
  }

  async send(
    token: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ) {
    if (!this.isExpoToken(token)) return null;
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: token,
        title,
        body,
        sound: 'default',
        data: data ?? {},
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      this.logger.warn(`Expo push failed: ${res.status} ${text}`);
      return null;
    }
    return res.json();
  }
}