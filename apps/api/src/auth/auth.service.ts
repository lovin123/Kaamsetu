import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { LoginDto, RegisterDto } from './dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly projects: ProjectsService,
  ) {}

  async register(dto: RegisterDto) {
    if (dto.role === 'SUPERVISOR') {
      throw new ForbiddenException('Supervisor accounts cannot self-register');
    }
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

  async refresh(refreshToken: string) {
    try {
      const refreshSecret = this.config.get<string>('JWT_REFRESH_SECRET');
      if (!refreshSecret) throw new UnauthorizedException('Server misconfigured');
      const payload = this.jwt.verify(refreshToken, {
        secret: refreshSecret,
      }) as { sub: string };
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) throw new UnauthorizedException('Invalid refresh token');
      return this.tokenResponse(user);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return this.tokenResponse(user);
  }

  private tokenResponse(user: {
    id: string;
    phone: string;
    name: string;
    role: string;
    preferredLanguage: string;
  }) {
    const secret = this.config.get<string>('JWT_SECRET');
    const refreshSecret = this.config.get<string>('JWT_REFRESH_SECRET');
    if (!secret || !refreshSecret) {
      throw new UnauthorizedException('JWT_SECRET and JWT_REFRESH_SECRET are required');
    }
    const payload = { sub: user.id, role: user.role };
    const accessToken = this.jwt.sign(payload, {
      secret,
      expiresIn: (this.config.get<string>('JWT_EXPIRES_IN') ?? '7d') as `${number}d`,
    });
    const refreshToken = this.jwt.sign(payload, {
      secret: refreshSecret,
      expiresIn: (this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ??
        '30d') as `${number}d`,
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
