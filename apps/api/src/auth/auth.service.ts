import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { RequestOtpDto, VerifyOtpDto } from './dto';
import { SmsProvider } from './sms.provider';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { assertRateLimit } from '../common/throttle';
import { normalizePhone, phoneLookupKeys } from '../common/phone';

const OTP_TTL_MS = 5 * 60_000;
const OTP_MAX_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly projects: ProjectsService,
    private readonly sms: SmsProvider,
    private readonly adminBootstrap: AdminBootstrapService,
  ) {}

  bootstrapStatus() {
    return this.adminBootstrap.publicStatus();
  }

  async requestOtp(dto: RequestOtpDto) {
    const phone = this.canonicalPhone(dto.phone);
    assertRateLimit(`otp-req:${phone}`, 5, 60_000);
    assertRateLimit(`otp-req-hour:${phone}`, 12, 60 * 60_000);

    const existing = await this.findUserByPhone(phone);

    let intendedRole: Role | null = null;
    let bootstrapGranted = false;

    if (dto.purpose === 'login') {
      if (!existing) {
        // Uniform message — do not reveal register vs missing
        throw new UnauthorizedException('Unable to send OTP for this number');
      }
      intendedRole = existing.role;
    } else {
      if (existing) {
        throw new ConflictException(
          'Phone already registered — sign in with OTP instead',
        );
      }
      const resolved = await this.resolveRegisterRoleOrThrow(dto.bootstrapSecret);
      intendedRole = resolved.role;
      bootstrapGranted = resolved.bootstrapGranted;
    }

    const code = String(randomInt(100000, 999999));
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await this.prisma.$transaction([
      this.prisma.otpChallenge.updateMany({
        where: {
          phone,
          purpose: dto.purpose,
          consumedAt: null,
        },
        data: { consumedAt: new Date() },
      }),
      this.prisma.otpChallenge.create({
        data: {
          phone,
          purpose: dto.purpose,
          codeHash,
          intendedRole,
          bootstrapGranted,
          expiresAt,
        },
      }),
    ]);

    try {
      await this.sms.sendOtp({ phone, code, purpose: dto.purpose });
    } catch (err) {
      // Do not leave a usable OTP if SMS delivery failed
      await this.prisma.otpChallenge.updateMany({
        where: { phone, purpose: dto.purpose, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      throw err;
    }

    const expose = this.shouldExposeDevCode();

    this.logger.log(
      `OTP issued phone=${phone.slice(0, 4)}… purpose=${dto.purpose} role=${intendedRole}`,
    );

    return {
      ok: true as const,
      expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
      // Only hint role after binding to challenge (still pre-verify — keep generic for login)
      ...(dto.purpose === 'register' ? { assignedRole: intendedRole } : {}),
      ...(expose ? { devCode: code } : {}),
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const phone = this.canonicalPhone(dto.phone);
    assertRateLimit(`otp-verify:${phone}`, 20, 60_000);

    const cc = this.config.get<string>('OTP_PHONE_DEFAULT_COUNTRY') ?? '91';
    const challenge = await this.prisma.otpChallenge.findFirst({
      where: {
        phone: { in: phoneLookupKeys(phone, cc) },
        purpose: dto.purpose,
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge) {
      throw new UnauthorizedException('No active OTP — request a new code');
    }
    if (challenge.expiresAt.getTime() < Date.now()) {
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });
      throw new UnauthorizedException('OTP expired — request a new code');
    }
    if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });
      throw new UnauthorizedException(
        'Too many incorrect attempts — request a new code',
      );
    }

    const ok = await bcrypt.compare(dto.code.trim(), challenge.codeHash);
    if (!ok) {
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Invalid OTP');
    }

    // Atomic claim — concurrent verifies with the same OTP cannot both succeed
    const claimed = await this.prisma.otpChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new UnauthorizedException('OTP already used — request a new code');
    }

    if (dto.purpose === 'login') {
      return this.loginWithOtp(phone);
    }
    return this.registerWithOtp(dto, phone, challenge);
  }

  private async loginWithOtp(phone: string) {
    const user = await this.findUserByPhone(phone);
    if (!user) throw new UnauthorizedException('No account for this phone');
    // Migrate legacy 10-digit rows to canonical storage on successful login
    if (user.phone !== phone) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { phone },
      });
      user.phone = phone;
    }
    return this.tokenResponse(user);
  }

  private async registerWithOtp(
    dto: VerifyOtpDto,
    phone: string,
    challenge: {
      intendedRole: string | null;
      bootstrapGranted: boolean;
    },
  ) {
    const name = dto.name?.trim();
    if (!name) {
      throw new BadRequestException('Name is required to create an account');
    }

    // Role is bound at OTP request — ignore any verify-time secret upgrade
    let role = (challenge.intendedRole as Role) || Role.WORKER;
    if (role !== Role.WORKER && role !== Role.ADMIN) {
      role = Role.WORKER;
    }

    const cc = this.config.get<string>('OTP_PHONE_DEFAULT_COUNTRY') ?? '91';
    const user = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findFirst({
        where: { phone: { in: phoneLookupKeys(phone, cc) } },
      });
      if (existing) {
        throw new ConflictException('Phone already registered');
      }

      // Close first-admin race: if challenge said ADMIN without bootstrap but an admin appeared, demote
      if (role === Role.ADMIN && !challenge.bootstrapGranted) {
        const adminCount = await tx.user.count({ where: { role: Role.ADMIN } });
        if (adminCount > 0) {
          role = Role.WORKER;
          this.logger.warn(
            `First-admin race for ${phone.slice(0, 4)}… — creating as WORKER`,
          );
        }
      }

      return tx.user.create({
        data: {
          phone,
          name,
          role,
          preferredLanguage: dto.preferredLanguage ?? 'hi-IN',
        },
      });
    });

    await this.projects.autoJoinDefaultProject(user.id, user.role);
    return this.tokenResponse(user);
  }

  private async resolveRegisterRoleOrThrow(
    bootstrapSecret?: string,
  ): Promise<{ role: Role; bootstrapGranted: boolean }> {
    try {
      return await this.adminBootstrap.resolveRegisterRole(bootstrapSecret);
    } catch (err) {
      const code = (err as Error).message;
      if (code === 'ADMIN_SECRET_INVALID') {
        throw new ForbiddenException('Invalid admin bootstrap secret');
      }
      if (code === 'ADMIN_SECRET_REQUIRED') {
        throw new ForbiddenException(
          'Admin bootstrap secret is required to create the first admin',
        );
      }
      throw new ForbiddenException('Cannot register with this configuration');
    }
  }

  async refresh(refreshToken: string) {
    assertRateLimit(`refresh:${refreshToken.slice(-16)}`, 20, 60_000);
    try {
      const refreshSecret = this.config.get<string>('JWT_REFRESH_SECRET');
      if (!refreshSecret) {
        throw new UnauthorizedException('Server misconfigured');
      }
      const payload = this.jwt.verify(refreshToken, {
        secret: refreshSecret,
      }) as { sub: string; typ?: string };
      // Strict: missing typ must not be treated as refresh
      if (payload.typ !== 'refresh') {
        throw new UnauthorizedException('Invalid refresh token');
      }
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
      if (!user?.refreshTokenHash) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      const matches = await bcrypt.compare(refreshToken, user.refreshTokenHash);
      if (!matches) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { refreshTokenHash: null },
        });
        throw new UnauthorizedException('Invalid refresh token');
      }
      // Claim slot atomically so concurrent refreshes cannot both succeed
      const claimed = await this.prisma.user.updateMany({
        where: {
          id: user.id,
          refreshTokenHash: user.refreshTokenHash,
        },
        data: { refreshTokenHash: null },
      });
      if (claimed.count === 0) {
        throw new UnauthorizedException('Refresh token already used');
      }
      return this.tokenResponse(user);
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
    return { ok: true };
  }

  /** Revoke by refresh token so logout works after access token expiry */
  async logoutByRefreshToken(refreshToken: string) {
    assertRateLimit(`logout:${refreshToken.slice(-16)}`, 20, 60_000);
    try {
      const refreshSecret = this.config.get<string>('JWT_REFRESH_SECRET');
      if (!refreshSecret) return { ok: true };
      const payload = this.jwt.verify(refreshToken, {
        secret: refreshSecret,
      }) as { sub: string; typ?: string };
      if (payload.typ !== 'refresh' || !payload.sub) return { ok: true };
      await this.prisma.user.updateMany({
        where: { id: payload.sub },
        data: { refreshTokenHash: null },
      });
    } catch {
      // Always succeed to avoid token oracle
    }
    return { ok: true };
  }

  private shouldExposeDevCode(): boolean {
    const env = this.config.get<string>('NODE_ENV') ?? 'development';
    // Never leak OTP codes in production responses
    if (env === 'production') return false;
    if (this.config.get<string>('OTP_DEV_EXPOSE') === 'true') return true;
    if (this.config.get<string>('OTP_DEV_EXPOSE') === 'false') return false;
    const provider = (
      this.config.get<string>('OTP_SMS_PROVIDER') ?? 'console'
    ).toLowerCase();
    return provider === 'console';
  }

  private canonicalPhone(phone: string): string {
    try {
      const cc = this.config.get<string>('OTP_PHONE_DEFAULT_COUNTRY') ?? '91';
      return normalizePhone(phone, cc);
    } catch {
      throw new BadRequestException(
        'phone must be 8–15 digits (optional leading +)',
      );
    }
  }

  private async findUserByPhone(phone: string) {
    const cc = this.config.get<string>('OTP_PHONE_DEFAULT_COUNTRY') ?? '91';
    const keys = phoneLookupKeys(phone, cc);
    return this.prisma.user.findFirst({
      where: { phone: { in: keys } },
    });
  }

  private async tokenResponse(user: {
    id: string;
    phone: string;
    name: string;
    role: string;
    preferredLanguage: string;
  }) {
    const secret = this.config.get<string>('JWT_SECRET');
    const refreshSecret = this.config.get<string>('JWT_REFRESH_SECRET');
    if (!secret || !refreshSecret) {
      throw new UnauthorizedException(
        'JWT_SECRET and JWT_REFRESH_SECRET are required',
      );
    }
    const accessPayload = { sub: user.id, role: user.role, typ: 'access' };
    const refreshPayload = { sub: user.id, role: user.role, typ: 'refresh' };
    const accessToken = this.jwt.sign(accessPayload, {
      secret,
      expiresIn: (this.config.get<string>('JWT_EXPIRES_IN') ?? '15m') as
        | `${number}m`
        | `${number}d`
        | `${number}h`,
    });
    const refreshToken = this.jwt.sign(refreshPayload, {
      secret: refreshSecret,
      expiresIn: (this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ??
        '30d') as `${number}d`,
    });
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash },
    });
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        role: user.role,
        preferredLanguage: user.preferredLanguage,
      },
    };
  }
}
