import { Injectable, NotFoundException } from '@nestjs/common';
import { IncidentSeverity, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ProjectsService } from '../projects/projects.service';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateIncidentDto {
  @IsUUID()
  projectId!: string;

  @IsOptional()
  @IsUUID()
  taskId?: string;

  @IsIn([
    'electrical',
    'plumbing',
    'structural',
    'safety',
    'equipment',
    'other',
  ])
  category!: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(2000)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @IsOptional()
  @IsEnum(IncidentSeverity)
  severity?: IncidentSeverity;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  transcript?: string;
}

@Injectable()
export class IncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
    private readonly projects: ProjectsService,
  ) {}

  list(userId: string, role: Role, projectId?: string) {
    return this.prisma.incident.findMany({
      where: {
        ...(projectId ? { projectId } : {}),
        ...(role === Role.WORKER ? { reporterId: userId } : {}),
      },
      include: {
        reporter: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        task: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateIncidentDto, reporterId: string, role: Role) {
    await this.projects.assertAccess(dto.projectId, reporterId, role);
    if (dto.taskId) {
      await this.projects.assertTaskInProject(dto.taskId, dto.projectId);
    }
    const incident = await this.prisma.incident.create({
      data: {
        projectId: dto.projectId,
        taskId: dto.taskId,
        reporterId,
        category: dto.category,
        title: dto.title,
        description: dto.description,
        location: dto.location,
        severity: dto.severity ?? IncidentSeverity.medium,
        transcript: dto.transcript,
      },
      include: {
        reporter: { select: { id: true, name: true } },
        project: true,
      },
    });

    const supervisors = await this.prisma.projectMember.findMany({
      where: { projectId: dto.projectId, role: Role.SUPERVISOR },
    });
    await Promise.all(
      supervisors.map((s) =>
        this.notifications.create({
          userId: s.userId,
          type: 'incident',
          title: `Incident: ${incident.title}`,
          body: incident.description,
          data: { incidentId: incident.id, severity: incident.severity },
        }),
      ),
    );
    this.realtime.emitToProject(dto.projectId, 'incident.created', incident);
    return incident;
  }

  async updateStatus(
    id: string,
    status: import('@prisma/client').IncidentStatus,
    userId: string,
    role: Role,
  ) {
    const existing = await this.prisma.incident.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Incident not found');
    await this.projects.assertAccess(existing.projectId, userId, role);
    return this.prisma.incident.update({ where: { id }, data: { status } });
  }
}