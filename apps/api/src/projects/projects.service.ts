import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';

export class AddProjectMemberDto {
  @IsUUID()
  userId!: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

export class JoinProjectDto {
  @IsString()
  code!: string;
}

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string, role: Role) {
    if (role === Role.SUPERVISOR) {
      return this.prisma.project.findMany({
        where: { active: true },
        include: {
          _count: { select: { tasks: true, members: true, incidents: true } },
        },
        orderBy: { name: 'asc' },
      });
    }
    return this.prisma.project.findMany({
      where: {
        active: true,
        members: { some: { userId } },
      },
      include: {
        _count: { select: { tasks: true, members: true, incidents: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getOne(projectId: string, userId: string, role: Role) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, role: true, phone: true },
            },
          },
        },
        tasks: {
          include: { assignee: { select: { id: true, name: true } } },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    if (role !== Role.SUPERVISOR) {
      const member = project.members.some((m) => m.userId === userId);
      if (!member) throw new ForbiddenException();
    }
    return project;
  }

  async assertAccess(projectId: string, userId: string, role: Role) {
    if (role === Role.SUPERVISOR) {
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
      });
      if (!project) throw new ForbiddenException('Project not found');
      return;
    }
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!member) throw new ForbiddenException('Not a project member');
  }

  async assertTaskInProject(taskId: string, projectId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Task not found');
    if (task.projectId !== projectId) {
      throw new BadRequestException('Task does not belong to this project');
    }
    return task;
  }

  async assertAssigneeInProject(assigneeId: string, projectId: string) {
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: assigneeId } },
    });
    if (!member) {
      throw new BadRequestException('Assignee is not a project member');
    }
  }

  async addMember(
    projectId: string,
    dto: AddProjectMemberDto,
    actorId: string,
    actorRole: Role,
  ) {
    if (actorRole !== Role.SUPERVISOR) {
      throw new ForbiddenException('Only supervisors can add members');
    }
    await this.assertAccess(projectId, actorId, actorRole);
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });
    if (!user) throw new NotFoundException('User not found');

    try {
      return await this.prisma.projectMember.create({
        data: {
          projectId,
          userId: dto.userId,
          role: dto.role ?? user.role,
        },
        include: {
          user: { select: { id: true, name: true, role: true, phone: true } },
        },
      });
    } catch {
      throw new ConflictException('User is already a project member');
    }
  }

  /** Workers can join via project code (e.g. PTP-B from seed). */
  async joinByCode(userId: string, role: Role, code: string) {
    if (role === Role.SUPERVISOR) {
      throw new ForbiddenException('Supervisors are added by admin, not join code');
    }
    const project = await this.prisma.project.findFirst({
      where: { code: code.trim().toUpperCase(), active: true },
    });
    if (!project) throw new NotFoundException('Invalid project code');

    const existing = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: project.id, userId } },
    });
    if (existing) return project;

    await this.prisma.projectMember.create({
      data: { projectId: project.id, userId, role: Role.WORKER },
    });
    return project;
  }

  /** Used after worker self-register so they land on the default site. */
  async autoJoinDefaultProject(userId: string) {
    const project = await this.prisma.project.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!project) return null;
    const existing = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: project.id, userId } },
    });
    if (existing) return project;
    await this.prisma.projectMember.create({
      data: { projectId: project.id, userId, role: Role.WORKER },
    });
    return project;
  }
}
