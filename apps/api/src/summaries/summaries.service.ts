import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LLM_PROVIDER } from '../providers/provider.tokens';
import { LlmProvider } from '../providers/interfaces';
import { ProjectsService } from '../projects/projects.service';

@Injectable()
export class SummariesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    private readonly projects: ProjectsService,
  ) {}

  async generate(
    actorId: string,
    actorRole: Role,
    projectId?: string,
    dateIso?: string,
  ) {
    if (!projectId) {
      const project = await this.prisma.project.findFirst({
        where: { active: true },
        orderBy: { createdAt: 'asc' },
      });
      if (!project) throw new NotFoundException('No project');
      projectId = project.id;
    }

    await this.projects.assertAccess(projectId, actorId, actorRole);

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new NotFoundException('Project not found');

    const day = dateIso ? new Date(dateIso) : new Date();
    if (Number.isNaN(day.getTime())) {
      throw new BadRequestException('date must be a valid ISO 8601 date');
    }
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(day);
    end.setHours(23, 59, 59, 999);

    const [tasks, incidents, materials, blockers, progressUpdates] =
      await Promise.all([
        this.prisma.task.findMany({
          where: { projectId },
          select: {
            id: true,
            title: true,
            status: true,
            progressPercent: true,
            location: true,
          },
          take: 100,
        }),
        this.prisma.incident.findMany({
          where: { projectId, createdAt: { gte: start, lte: end } },
          select: {
            title: true,
            category: true,
            severity: true,
            status: true,
            location: true,
          },
          take: 50,
        }),
        this.prisma.materialRequest.findMany({
          where: { projectId, createdAt: { gte: start, lte: end } },
          select: {
            materialName: true,
            quantity: true,
            unit: true,
            status: true,
            urgency: true,
          },
          take: 50,
        }),
        this.prisma.blocker.findMany({
          where: { projectId, createdAt: { gte: start, lte: end } },
          select: {
            reason: true,
            status: true,
            category: true,
            task: { select: { title: true } },
          },
          take: 50,
        }),
        this.prisma.taskProgress.findMany({
          where: {
            createdAt: { gte: start, lte: end },
            task: { projectId },
          },
          select: {
            progressPercent: true,
            notes: true,
            task: { select: { title: true } },
            user: { select: { name: true } },
          },
          take: 50,
        }),
      ]);

    const text = await this.llm.summarizeDay({
      projectName: project.name,
      date: start.toISOString().slice(0, 10),
      tasks,
      incidents,
      materials,
      blockers,
      progressUpdates,
    });

    return {
      projectId,
      projectName: project.name,
      date: start.toISOString().slice(0, 10),
      text,
      stats: {
        tasks: tasks.length,
        incidentsToday: incidents.length,
        materialsToday: materials.length,
        blockersToday: blockers.length,
        progressUpdatesToday: progressUpdates.length,
      },
    };
  }
}
