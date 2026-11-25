import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { LoginDto, RegisterDto } from './dto';
import { assertRateLimit } from '../common/throttle';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly projects: ProjectsService,
  ) {}

  async register(dto: RegisterDto) {
    assertRateLimit(`register:${dto.phone}`, 5, 60_000);
    const existing = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });
    if (existing) throw new ConflictException('Phone already registered');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        phone: dto.phone,
        passwordHash,
        name: dto.name,
        role: 'WORKER',
        preferredLanguage: dto.preferredLanguage ?? 'hi-IN',
      },
    });
    await this.projects.autoJoinDefaultProject(user.id);
    return this.tokenResponse(user);
  }

  async login(dto: LoginDto) {
    assertRateLimit(`login:${dto.phone}`, 10, 60_000);
    const user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return this.tokenResponse(user);
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
      }) as { sub: string };
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
      if (!user?.refreshTokenHash) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      const matches = await bcrypt.compare(refreshToken, user.refreshTokenHash);
      if (!matches) {
        // Possible reuse of a rotated token — revoke all sessions for this user
        await this.prisma.user.update({
          where: { id: user.id },
          data: { refreshTokenHash: null },
        });
        throw new UnauthorizedException('Invalid refresh token');
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
    const payload = { sub: user.id, role: user.role };
    const accessToken = this.jwt.sign(payload, {
      secret,
      expiresIn: (this.config.get<string>('JWT_EXPIRES_IN') ?? '15m') as
        | `${number}m`
        | `${number}d`
        | `${number}h`,
    });
    const refreshToken = this.jwt.sign(payload, {
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
