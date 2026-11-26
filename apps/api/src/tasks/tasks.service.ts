import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, TaskStatus } from '@prisma/client';
import { isFieldWorker } from '@kaamsetu/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateTaskDto, UpdateProgressDto } from './tasks.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async list(userId: string, role: Role, projectId?: string) {
    if (isFieldWorker(role)) {
      if (projectId) {
        await this.projects.assertAccess(projectId, userId, role);
      }
      return this.prisma.task.findMany({
        where: {
          assigneeId: userId,
          ...(projectId ? { projectId } : {}),
        },
        include: {
          project: { select: { id: true, name: true, code: true } },
          assignee: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: 'desc' },
      });
    }

    if (projectId) {
      await this.projects.assertAccess(projectId, userId, role);
    }
    const scope = await this.projects.accessibleProjectIds(userId, role);
    const projectFilter =
      projectId
        ? { projectId }
        : scope === 'ALL'
          ? {}
          : { projectId: { in: scope } };

    return this.prisma.task.findMany({
      where: projectFilter,
      include: {
        project: { select: { id: true, name: true, code: true } },
        assignee: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getOne(taskId: string, userId: string, role: Role) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        project: true,
        assignee: { select: { id: true, name: true, phone: true } },
        progressUpdates: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { user: { select: { id: true, name: true } } },
        },
        blockers: { where: { status: 'open' } },
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    if (isFieldWorker(role) && task.assigneeId !== userId) {
      throw new ForbiddenException();
    }
    // Membership + active project (workers included — not just historical assignee)
    await this.projects.assertAccess(task.projectId, userId, role);
    return task;
  }

  async create(dto: CreateTaskDto, creatorId: string, role: Role = Role.SUPERVISOR) {
    await this.projects.assertStaffAccess(dto.projectId, creatorId, role);
    if (dto.assigneeId) {
      await this.projects.assertAssigneeInProject(dto.assigneeId, dto.projectId);
    }
    const task = await this.prisma.task.create({
      data: {
        projectId: dto.projectId,
        title: dto.title,
        description: dto.description,
        location: dto.location,
        assigneeId: dto.assigneeId,
        createdById: creatorId,
        status: dto.assigneeId ? TaskStatus.in_progress : TaskStatus.pending,
      },
      include: { assignee: true, project: true },
    });
    if (dto.assigneeId) {
      await this.notifications.create({
        userId: dto.assigneeId,
        type: 'task_assigned',
        title: 'New task assigned',
        body: `${task.title} — ${task.project.name}`,
        data: { taskId: task.id, projectId: task.projectId },
      });
    }
    this.realtime.emitToProject(task.projectId, 'task.created', task);
    return task;
  }

  async assign(
    taskId: string,
    assigneeId: string,
    actorId: string,
    role: Role,
  ) {
    const existing = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!existing) throw new NotFoundException('Task not found');
    await this.projects.assertStaffAccess(existing.projectId, actorId, role);
    await this.projects.assertAssigneeInProject(assigneeId, existing.projectId);
    const task = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        assigneeId,
        status: TaskStatus.in_progress,
      },
      include: { project: true, assignee: true },
    });
    await this.notifications.create({
      userId: assigneeId,
      type: 'task_assigned',
      title: 'Task assigned to you',
      body: task.title,
      data: { taskId: task.id },
    });
    return task;
  }

  async updateProgress(
    taskId: string,
    userId: string,
    role: Role,
    dto: UpdateProgressDto,
  ) {
    const task = await this.getOne(taskId, userId, role);
    // Non-workers need site staff membership (not mere project membership)
    if (!isFieldWorker(role)) {
      await this.projects.assertStaffAccess(task.projectId, userId, role);
    }
    // Always count open blockers — do not rely on current status alone
    const openBlockers = await this.prisma.blocker.count({
      where: { taskId, status: 'open' },
    });
    let status = task.status;
    if (openBlockers > 0) {
      status = TaskStatus.blocked;
    } else if (dto.progressPercent >= 100) {
      status = TaskStatus.completed;
    } else if (dto.progressPercent > 0) {
      status = TaskStatus.in_progress;
    }

    const [updated, progress] = await this.prisma.$transaction([
      this.prisma.task.update({
        where: { id: taskId },
        data: {
          progressPercent: dto.progressPercent,
          status,
        },
      }),
      this.prisma.taskProgress.create({
        data: {
          taskId,
          userId,
          progressPercent: dto.progressPercent,
          notes: dto.notes,
          transcript: dto.transcript,
          // Never accept client-forged supervisor_override
          source: dto.source === 'voice' ? 'voice' : 'manual',
        },
      }),
    ]);

    const staffIds = await this.projects.listStaffMemberIds(task.projectId);
    await Promise.all(
      staffIds.map((staffId) =>
        this.notifications.create({
          userId: staffId,
          type: 'progress_update',
          title: 'Progress update',
          body: `${task.title}: ${dto.progressPercent}%`,
          data: { taskId, progressPercent: dto.progressPercent },
        }),
      ),
    );

    this.realtime.emitToProject(task.projectId, 'task.progress', {
      task: updated,
      progress,
    });
    return { task: updated, progress };
  }

  async setStatus(
    taskId: string,
    status: TaskStatus,
    actorId: string,
    role: Role,
  ) {
    const existing = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!existing) throw new NotFoundException('Task not found');
    await this.projects.assertStaffAccess(existing.projectId, actorId, role);

    const allowed: Record<TaskStatus, TaskStatus[]> = {
      [TaskStatus.pending]: [
        TaskStatus.in_progress,
        TaskStatus.blocked,
        TaskStatus.completed,
      ],
      [TaskStatus.in_progress]: [
        TaskStatus.pending,
        TaskStatus.blocked,
        TaskStatus.completed,
      ],
      [TaskStatus.blocked]: [
        TaskStatus.in_progress,
        TaskStatus.pending,
        TaskStatus.completed,
      ],
      [TaskStatus.completed]: [
        TaskStatus.in_progress,
        TaskStatus.pending,
      ],
    };
    if (
      existing.status !== status &&
      !allowed[existing.status]?.includes(status)
    ) {
      throw new BadRequestException(
        `Cannot transition task from ${existing.status} to ${status}`,
      );
    }

    if (status === TaskStatus.completed) {
      const openBlockers = await this.prisma.blocker.count({
        where: { taskId, status: 'open' },
      });
      if (openBlockers > 0) {
        throw new BadRequestException(
          'Cannot complete a task with open blockers — resolve them first',
        );
      }
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.task.update({ where: { id: taskId }, data: { status } }),
      this.prisma.taskProgress.create({
        data: {
          taskId,
          userId: actorId,
          progressPercent: existing.progressPercent,
          notes: `Status set to ${status} by supervisor`,
          source: 'supervisor_override',
        },
      }),
    ]);

    if (existing.assigneeId && existing.assigneeId !== actorId) {
      await this.notifications.create({
        userId: existing.assigneeId,
        type: 'task_status_changed',
        title: 'Task status updated',
        body: `${existing.title}: ${existing.status} → ${status}`,
        data: { taskId, status },
      });
    }

    this.realtime.emitToProject(existing.projectId, 'task.progress', {
      task: updated,
    });
    return updated;
  }

  async findByReference(
    projectId: string,
    reference: string,
    assigneeId?: string,
  ) {
    const q = reference.toLowerCase();
    const tasks = await this.prisma.task.findMany({
      where: {
        projectId,
        ...(assigneeId ? { assigneeId } : {}),
        OR: [
          { title: { contains: reference, mode: 'insensitive' } },
          { location: { contains: reference, mode: 'insensitive' } },
          { description: { contains: reference, mode: 'insensitive' } },
        ],
      },
      take: 5,
    });
    if (tasks.length) return tasks;
    // fuzzy: split words
    const words = q.split(/\s+/).filter((w) => w.length > 2);
    if (!words.length) return [];
    return this.prisma.task.findMany({
      where: {
        projectId,
        ...(assigneeId ? { assigneeId } : {}),
        OR: words.flatMap((w) => [
          { title: { contains: w, mode: 'insensitive' as const } },
          { location: { contains: w, mode: 'insensitive' as const } },
        ]),
      },
      take: 5,
    });
  }
}
