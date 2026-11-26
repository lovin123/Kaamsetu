import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { isAdminRole } from '@kaamsetu/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { UpdateProfileDto } from '../auth/dto';
import { AdminCreateUserDto, UpdateUserRoleDto } from './users.dto';
import { normalizePhone, phoneLookupKeys } from '../common/phone';

const USER_SAFE_SELECT = {
  id: true,
  phone: true,
  name: true,
  role: true,
  preferredLanguage: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly config: ConfigService,
  ) {}

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...USER_SAFE_SELECT,
        fcmToken: true,
        memberships: {
          include: { project: true },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        name: dto.name,
        preferredLanguage: dto.preferredLanguage,
        fcmToken: dto.fcmToken,
      },
      select: {
        ...USER_SAFE_SELECT,
        fcmToken: true,
      },
    });
  }

  async listAll() {
    return this.prisma.user.findMany({
      select: {
        ...USER_SAFE_SELECT,
        memberships: {
          select: {
            role: true,
            project: { select: { id: true, name: true, code: true } },
          },
        },
      },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
  }

  async adminCreate(
    dto: AdminCreateUserDto,
    actorId: string,
    actorRole: Role,
  ) {
    if (!isAdminRole(actorRole)) {
      throw new ForbiddenException('Only admins can create users');
    }
    const cc = this.config.get<string>('OTP_PHONE_DEFAULT_COUNTRY') ?? '91';
    let phone: string;
    try {
      phone = normalizePhone(dto.phone, cc);
    } catch {
      throw new BadRequestException('Invalid phone number');
    }
    const keys = phoneLookupKeys(phone, cc);
    const existing = await this.prisma.user.findFirst({
      where: { phone: { in: keys } },
    });
    if (existing) {
      throw new ConflictException('Phone already registered');
    }

    const user = await this.prisma.user.create({
      data: {
        phone,
        name: dto.name.trim(),
        role: dto.role as Role,
        preferredLanguage: dto.preferredLanguage ?? 'hi-IN',
      },
      select: USER_SAFE_SELECT,
    });

    if (dto.projectId) {
      await this.projects.addMember(
        dto.projectId,
        { userId: user.id, role: dto.role as Role },
        actorId,
        actorRole,
      );
    }

    return user;
  }

  async updateRole(
    actorId: string,
    targetUserId: string,
    dto: UpdateUserRoleDto,
  ) {
    if (actorId === targetUserId && dto.role !== Role.ADMIN) {
      throw new ForbiddenException('Admins cannot demote themselves');
    }
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!target) throw new NotFoundException('User not found');

    if (target.role === Role.ADMIN && dto.role !== Role.ADMIN) {
      const adminCount = await this.prisma.user.count({
        where: { role: Role.ADMIN },
      });
      if (adminCount <= 1) {
        throw new ForbiddenException('Cannot demote the last admin');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        role: dto.role as Role,
        // Force re-login after privilege change
        refreshTokenHash: null,
      },
      select: USER_SAFE_SELECT,
    });

    await this.prisma.projectMember.updateMany({
      where: { userId: targetUserId },
      data: { role: dto.role as Role },
    });

    return updated;
  }

  async listWorkers(
    actorId: string,
    actorRole: Role,
    projectId?: string,
  ) {
    if (!projectId) {
      const projects = await this.projects.listForUser(actorId, actorRole);
      projectId = projects[0]?.id;
      if (!projectId) return [];
    }

    await this.projects.assertStaffAccess(projectId, actorId, actorRole);

    const members = await this.prisma.projectMember.findMany({
      where: {
        projectId,
        role: Role.WORKER,
        user: { role: Role.WORKER },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            preferredLanguage: true,
            role: true,
          },
        },
      },
    });
    return members.map((m) => m.user);
  }
}
