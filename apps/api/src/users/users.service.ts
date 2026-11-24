import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from '../auth/dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phone: true,
        name: true,
        role: true,
        preferredLanguage: true,
        fcmToken: true,
        createdAt: true,
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
        id: true,
        phone: true,
        name: true,
        role: true,
        preferredLanguage: true,
        fcmToken: true,
      },
    });
  }

  async listWorkers(projectId?: string) {
    // Prefer project-scoped workforce. Without projectId, still require membership filter via first active project for supervisors viewing seed demo — return empty if none.
    if (!projectId) {
      const first = await this.prisma.project.findFirst({
        where: { active: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      projectId = first?.id;
      if (!projectId) return [];
    }
    const members = await this.prisma.projectMember.findMany({
      where: { projectId, role: 'WORKER' },
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
