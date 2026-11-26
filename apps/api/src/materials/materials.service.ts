import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { isFieldWorker } from '@kaamsetu/shared';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ProjectsService } from '../projects/projects.service';

export class CreateMaterialRequestDto {
  @IsUUID()
  projectId!: string;

  @IsOptional()
  @IsUUID()
  taskId?: string;

  @IsString()
  @MaxLength(200)
  materialName!: string;

  @IsNumber()
  @Min(0.01)
  quantity!: number;

  @IsString()
  @MaxLength(40)
  unit!: string;

  @IsOptional()
  @IsIn(['normal', 'urgent'])
  urgency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  transcript?: string;
}

@Injectable()
export class MaterialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
    private readonly projects: ProjectsService,
  ) {}

  async list(userId: string, role: Role, projectId?: string) {
    if (isFieldWorker(role)) {
      if (projectId) {
        await this.projects.assertAccess(projectId, userId, role);
      }
      return this.prisma.materialRequest.findMany({
        where: {
          requesterId: userId,
          ...(projectId ? { projectId } : {}),
        },
        include: {
          requester: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
          task: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    }
    if (projectId) {
      await this.projects.assertAccess(projectId, userId, role);
    }
    const scope = await this.projects.accessibleProjectIds(userId, role);
    return this.prisma.materialRequest.findMany({
      where: projectId
        ? { projectId }
        : scope === 'ALL'
          ? {}
          : { projectId: { in: scope } },
      include: {
        requester: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        task: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateMaterialRequestDto, requesterId: string, role: Role) {
    await this.projects.assertAccess(dto.projectId, requesterId, role);
    if (dto.taskId) {
      await this.projects.assertTaskInProject(dto.taskId, dto.projectId);
    }
    const req = await this.prisma.materialRequest.create({
      data: {
        projectId: dto.projectId,
        taskId: dto.taskId,
        requesterId,
        materialName: dto.materialName,
        quantity: dto.quantity,
        unit: dto.unit,
        urgency: dto.urgency ?? 'normal',
        notes: dto.notes,
        transcript: dto.transcript,
      },
      include: {
        requester: { select: { id: true, name: true } },
        project: true,
      },
    });

    const staffIds = await this.projects.listStaffMemberIds(dto.projectId);
    await Promise.all(
      staffIds.map((staffId) =>
        this.notifications.create({
          userId: staffId,
          type: 'material_request',
          title: 'Material request',
          body: `${req.quantity} ${req.unit} ${req.materialName}`,
          data: { materialRequestId: req.id },
        }),
      ),
    );
    this.realtime.emitToProject(dto.projectId, 'material.created', req);
    return req;
  }

  async updateStatus(
    id: string,
    status: import('@prisma/client').MaterialRequestStatus,
    userId: string,
    role: Role,
  ) {
    const existing = await this.prisma.materialRequest.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Material request not found');
    await this.projects.assertStaffAccess(existing.projectId, userId, role);
    return this.prisma.materialRequest.update({
      where: { id },
      data: { status },
    });
  }
}
