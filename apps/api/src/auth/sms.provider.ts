import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizePhone } from '../common/phone';

export interface SmsSendResult {
  provider: string;
  delivered: boolean;
}

/**
 * Real OTP SMS delivery:
 * - msg91  — India DLT OTP API (https://control.msg91.com/api/v5/otp)
 * - twilio — international SMS
 * - console — local-only fallback (forbidden when NODE_ENV=production)
 */
@Injectable()
export class SmsProvider {
  private readonly logger = new Logger(SmsProvider.name);

  constructor(private readonly config: ConfigService) {}

  async sendOtp(params: {
    phone: string;
    code: string;
    purpose: string;
  }): Promise<SmsSendResult> {
    const provider = this.resolveProvider();
    const mobile = this.toSmsMobile(params.phone);
    const message = `KaamSetu OTP: ${params.code}. Valid for 5 minutes. Do not share.`;

    if (provider === 'msg91') {
      return this.sendMsg91(mobile, params.code);
    }
    if (provider === 'twilio') {
      return this.sendTwilio(mobile, message);
    }
    if (provider === 'console') {
      if (this.isProduction()) {
        throw new ServiceUnavailableException(
          'OTP_SMS_PROVIDER=console is not allowed in production. Configure MSG91 or Twilio.',
        );
      }
      return this.logConsole(mobile, message);
    }

    throw new ServiceUnavailableException(
      `Unsupported OTP_SMS_PROVIDER="${provider}"`,
    );
  }

  private resolveProvider(): string {
    const explicit = (
      this.config.get<string>('OTP_SMS_PROVIDER') ?? ''
    ).toLowerCase();
    if (explicit) return explicit;

    if (this.config.get<string>('MSG91_AUTH_KEY')) return 'msg91';
    if (
      this.config.get<string>('TWILIO_ACCOUNT_SID') &&
      this.config.get<string>('TWILIO_AUTH_TOKEN')
    ) {
      return 'twilio';
    }
    return 'console';
  }

  private isProduction(): boolean {
    return (this.config.get<string>('NODE_ENV') ?? 'development') === 'production';
  }

  /** Digits only, with default country prefix when a 10-digit local number is given */
  toSmsMobile(phone: string): string {
    try {
      const cc = this.config.get<string>('OTP_PHONE_DEFAULT_COUNTRY') ?? '91';
      return normalizePhone(phone, cc);
    } catch {
      throw new ServiceUnavailableException('Invalid phone for SMS delivery');
    }
  }

  private async sendMsg91(
    mobile: string,
    code: string,
  ): Promise<SmsSendResult> {
    const authkey = this.config.get<string>('MSG91_AUTH_KEY');
    const templateId = this.config.get<string>('MSG91_OTP_TEMPLATE_ID');
    if (!authkey || !templateId) {
      throw new ServiceUnavailableException(
        'MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID are required',
      );
    }

    // OTP only in JSON body — never in query string (access logs)
    const url = new URL('https://control.msg91.com/api/v5/otp');
    const sender = this.config.get<string>('MSG91_SENDER_ID');

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authkey,
      },
      body: JSON.stringify({
        template_id: templateId,
        mobile,
        otp: code,
        OTP: code,
        otp_expiry: 5,
        ...(sender ? { sender } : {}),
      }),
    });

    const bodyText = await res.text().catch(() => '');
    let parsed: { type?: string; message?: string } = {};
    try {
      parsed = JSON.parse(bodyText) as typeof parsed;
    } catch {
      /* plain text */
    }

    if (!res.ok || (parsed.type && parsed.type !== 'success')) {
      this.logger.error(
        `MSG91 OTP failed status=${res.status} body=${bodyText.slice(0, 300)}`,
      );
      throw new ServiceUnavailableException(
        parsed.message || 'Failed to send OTP via MSG91',
      );
    }

    this.logger.log(`MSG91 OTP sent to ${mobile}`);
    return { provider: 'msg91', delivered: true };
  }

  private async sendTwilio(
    mobile: string,
    message: string,
  ): Promise<SmsSendResult> {
    const sid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const token = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const from = this.config.get<string>('TWILIO_FROM_NUMBER');
    if (!sid || !token || !from) {
      throw new ServiceUnavailableException(
        'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER are required',
      );
    }

    const to = mobile.startsWith('+') ? mobile : `+${mobile}`;
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const form = new URLSearchParams({
      To: to,
      From: from,
      Body: message,
    });

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      },
    );

    const bodyText = await res.text().catch(() => '');
    if (!res.ok) {
      this.logger.error(
        `Twilio SMS failed status=${res.status} body=${bodyText.slice(0, 300)}`,
      );
      throw new ServiceUnavailableException('Failed to send OTP via Twilio');
    }

    this.logger.log(`Twilio OTP sent to ${to}`);
    return { provider: 'twilio', delivered: true };
  }

  private logConsole(phone: string, message: string): SmsSendResult {
    this.logger.warn(
      `[console SMS → ${phone}] ${message} (set MSG91_* or TWILIO_* for real delivery)`,
    );
    return { provider: 'console', delivered: true };
  }
}
