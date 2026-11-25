import { Injectable, NotFoundException } from '@nestjs/common';
import { BlockerStatus, Role, TaskStatus } from '@prisma/client';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ProjectsService } from '../projects/projects.service';

export class CreateBlockerDto {
  @IsUUID()
  projectId!: string;

  @IsUUID()
  taskId!: string;

  @IsString()
  @MaxLength(1000)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  transcript?: string;
}

@Injectable()
export class BlockersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
    private readonly projects: ProjectsService,
  ) {}

  list(userId: string, role: Role, projectId?: string) {
    return this.prisma.blocker.findMany({
      where: {
        ...(projectId ? { projectId } : {}),
        ...(role === Role.WORKER ? { reporterId: userId } : {}),
      },
      include: {
        task: { select: { id: true, title: true } },
        reporter: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateBlockerDto, reporterId: string, role: Role) {
    await this.projects.assertAccess(dto.projectId, reporterId, role);
    await this.projects.assertTaskInProject(dto.taskId, dto.projectId);

    const [blocker] = await this.prisma.$transaction([
      this.prisma.blocker.create({
        data: {
          projectId: dto.projectId,
          taskId: dto.taskId,
          reporterId,
          reason: dto.reason,
          category: dto.category ?? 'other',
          transcript: dto.transcript,
        },
        include: {
          task: true,
          reporter: { select: { id: true, name: true } },
        },
      }),
      this.prisma.task.update({
        where: { id: dto.taskId },
        data: { status: TaskStatus.blocked },
      }),
    ]);

    const supervisors = await this.prisma.projectMember.findMany({
      where: { projectId: dto.projectId, role: Role.SUPERVISOR },
    });
    await Promise.all(
      supervisors.map((s) =>
        this.notifications.create({
          userId: s.userId,
          type: 'blocker',
          title: 'Task blocked',
          body: `${blocker.task.title}: ${dto.reason}`,
          data: { blockerId: blocker.id, taskId: dto.taskId },
        }),
      ),
    );
    this.realtime.emitToProject(dto.projectId, 'blocker.created', blocker);
    return blocker;
  }

  async resolve(id: string, userId: string, role: Role) {
    const existing = await this.prisma.blocker.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Blocker not found');
    await this.projects.assertAccess(existing.projectId, userId, role);
    const blocker = await this.prisma.blocker.update({
      where: { id },
      data: { status: BlockerStatus.resolved },
      include: { task: true },
    });
    const open = await this.prisma.blocker.count({
      where: { taskId: blocker.taskId, status: BlockerStatus.open },
    });
    if (open === 0) {
      await this.prisma.task.update({
        where: { id: blocker.taskId },
        data: { status: TaskStatus.in_progress },
      });
    }
    return blocker;
  }
}