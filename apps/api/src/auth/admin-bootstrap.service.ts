import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { createHash, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhone } from '../common/phone';

/**
 * Admin onboarding:
 * 1. First public OTP register → ADMIN (when no admin exists)
 * 2. Later public OTP register → WORKER
 * 3. ADMIN_BOOTSTRAP_SECRET → force ADMIN register (recovery)
 * 4. ADMIN_BOOTSTRAP_PHONE → provision on API boot (create only; promote only if forced)
 */
@Injectable()
export class AdminBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.provisionFromEnv();
  }

  /** Narrow public payload — no adminCount / secretConfigured leak */
  async publicStatus() {
    const full = await this.status();
    return {
      firstAdminOpen: full.firstAdminOpen,
      defaultRegisterRole: full.defaultRegisterRole,
    };
  }

  async status() {
    const adminCount = await this.prisma.user.count({
      where: { role: Role.ADMIN },
    });
    const secretConfigured = Boolean(
      this.config.get<string>('ADMIN_BOOTSTRAP_SECRET')?.trim(),
    );
    const requireSecretAlways =
      this.config.get<string>('ADMIN_BOOTSTRAP_REQUIRE_SECRET') === 'true';
    const firstAdminOpen = adminCount === 0 && !requireSecretAlways;

    return {
      adminCount,
      firstAdminOpen,
      secretAccepted: secretConfigured,
      requireSecret: requireSecretAlways || (adminCount > 0 && secretConfigured),
      defaultRegisterRole: (firstAdminOpen ? 'ADMIN' : 'WORKER') as
        | 'ADMIN'
        | 'WORKER',
    };
  }

  async resolveRegisterRole(
    bootstrapSecret?: string,
  ): Promise<{ role: Role; bootstrapGranted: boolean }> {
    const status = await this.status();

    if (bootstrapSecret?.trim()) {
      const expected = this.config.get<string>('ADMIN_BOOTSTRAP_SECRET')?.trim();
      if (!expected || !this.secretsMatch(bootstrapSecret, expected)) {
        throw new Error('ADMIN_SECRET_INVALID');
      }
      return { role: Role.ADMIN, bootstrapGranted: true };
    }

    if (status.firstAdminOpen) {
      return { role: Role.ADMIN, bootstrapGranted: false };
    }

    if (
      this.config.get<string>('ADMIN_BOOTSTRAP_REQUIRE_SECRET') === 'true' &&
      status.adminCount === 0
    ) {
      throw new Error('ADMIN_SECRET_REQUIRED');
    }

    return { role: Role.WORKER, bootstrapGranted: false };
  }

  private secretsMatch(provided: string | undefined, expected: string): boolean {
    if (!provided) return false;
    const a = createHash('sha256').update(provided).digest();
    const b = createHash('sha256').update(expected).digest();
    return timingSafeEqual(a, b);
  }

  private async provisionFromEnv() {
    const raw = this.config.get<string>('ADMIN_BOOTSTRAP_PHONE')?.trim();
    if (!raw) return;

    const cc = this.config.get<string>('OTP_PHONE_DEFAULT_COUNTRY') ?? '91';
    let phone: string;
    try {
      phone = normalizePhone(raw, cc);
    } catch {
      this.logger.error('ADMIN_BOOTSTRAP_PHONE is invalid — skipping provision');
      return;
    }

    const name =
      this.config.get<string>('ADMIN_BOOTSTRAP_NAME')?.trim() ||
      'Organization Admin';
    const forcePromote =
      this.config.get<string>('ADMIN_BOOTSTRAP_FORCE_PROMOTE') === 'true';

    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing) {
      if (existing.role === Role.ADMIN) return;
      if (!forcePromote) {
        this.logger.error(
          `ADMIN_BOOTSTRAP_PHONE ${phone.slice(0, 4)}… already exists as ${existing.role}. Set ADMIN_BOOTSTRAP_FORCE_PROMOTE=true to elevate.`,
        );
        return;
      }
      await this.prisma.user.update({
        where: { id: existing.id },
        data: { role: Role.ADMIN, refreshTokenHash: null },
      });
      await this.prisma.projectMember.updateMany({
        where: { userId: existing.id },
        data: { role: Role.ADMIN },
      });
      this.logger.warn(
        `Force-promoted ${phone.slice(0, 4)}… to ADMIN via ADMIN_BOOTSTRAP_FORCE_PROMOTE`,
      );
      return;
    }

    await this.prisma.user.create({
      data: {
        phone,
        name,
        role: Role.ADMIN,
        preferredLanguage: 'en-IN',
      },
    });
    this.logger.log(
      `Provisioned ADMIN ${phone.slice(0, 4)}… from ADMIN_BOOTSTRAP_PHONE`,
    );
  }
}
