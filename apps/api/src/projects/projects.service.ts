import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { isAdminRole, isFieldWorker, isStaffRole } from '@kaamsetu/shared';
import { PrismaService } from '../prisma/prisma.service';
import { phoneLookupKeys } from '../common/phone';
import { assertRateLimit } from '../common/throttle';
import {
  AddProjectMemberDto,
  CreateProjectDto,
  JoinProjectDto,
  UpdateProjectDto,
} from './projects.dto';

const PROJECT_LIST_INCLUDE = {
  _count: { select: { tasks: true, members: true, incidents: true } },
} as const;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Project IDs the actor may see/act on.
   * ADMIN → all active (or every if includeInactive).
   * Others → ProjectMember rows only.
   */
  async accessibleProjectIds(
    userId: string,
    role: Role,
    opts?: { includeInactive?: boolean },
  ): Promise<string[] | 'ALL'> {
    if (isAdminRole(role)) return 'ALL';
    const memberships = await this.prisma.projectMember.findMany({
      where: {
        userId,
        ...(opts?.includeInactive
          ? {}
          : { project: { active: true } }),
      },
      select: { projectId: true },
    });
    return memberships.map((m) => m.projectId);
  }

  async assertAccess(projectId: string, userId: string, role: Role) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    // Uniform message — avoid project existence oracle; block inactive sites
    if (!project?.active) {
      throw new ForbiddenException('Not a member of this project/team');
    }

    if (isAdminRole(role)) return project;

    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!member) {
      throw new ForbiddenException('Not a member of this project/team');
    }
    return project;
  }

  /**
   * Site staff actions: org ADMIN, or ProjectMember with SUPERVISOR/ADMIN role.
   * Account-level SUPERVISOR who is only a WORKER on this site is denied.
   */
  async assertStaffAccess(projectId: string, userId: string, role: Role) {
    await this.assertAccess(projectId, userId, role);
    if (isAdminRole(role)) return;
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!member || !isStaffRole(member.role)) {
      throw new ForbiddenException(
        'Supervisor access on this team is required',
      );
    }
  }

  /** Staff who can manage a project's roster (admin or supervisor member) */
  async assertCanManageMembers(
    projectId: string,
    userId: string,
    role: Role,
  ) {
    await this.assertStaffAccess(projectId, userId, role);
  }

  async listForUser(userId: string, role: Role) {
    if (isAdminRole(role)) {
      return this.prisma.project.findMany({
        where: { active: true },
        include: PROJECT_LIST_INCLUDE,
        orderBy: { name: 'asc' },
      });
    }
    return this.prisma.project.findMany({
      where: {
        active: true,
        members: { some: { userId } },
      },
      include: PROJECT_LIST_INCLUDE,
      orderBy: { name: 'asc' },
    });
  }

  async getOne(projectId: string, userId: string, role: Role) {
    await this.assertAccess(projectId, userId, role);
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, role: true, phone: true },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
        tasks: {
          include: { assignee: { select: { id: true, name: true } } },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    // Workers see roster without peer phone numbers
    if (isFieldWorker(role)) {
      return {
        ...project,
        members: project.members.map((m) => ({
          ...m,
          user: {
            ...m.user,
            phone: m.userId === userId ? m.user.phone : null,
          },
        })),
      };
    }
    return project;
  }

  async create(dto: CreateProjectDto, actorRole: Role) {
    if (!isAdminRole(actorRole)) {
      throw new ForbiddenException('Only admins can create projects/teams');
    }
    const code = dto.code.trim().toUpperCase();
    try {
      return await this.prisma.project.create({
        data: {
          name: dto.name.trim(),
          code,
          location: dto.location?.trim(),
          description: dto.description?.trim(),
        },
        include: PROJECT_LIST_INCLUDE,
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException('Project code already exists');
      }
      throw err;
    }
  }

  async update(
    projectId: string,
    dto: UpdateProjectDto,
    actorRole: Role,
  ) {
    if (!isAdminRole(actorRole)) {
      throw new ForbiddenException('Only admins can update projects/teams');
    }
    const existing = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!existing) throw new NotFoundException('Project not found');
    return this.prisma.project.update({
      where: { id: projectId },
      data: {
        name: dto.name?.trim(),
        location: dto.location?.trim(),
        description: dto.description?.trim(),
        active: dto.active,
      },
      include: PROJECT_LIST_INCLUDE,
    });
  }

  async listMembers(projectId: string, userId: string, role: Role) {
    await this.assertStaffAccess(projectId, userId, role);
    return this.prisma.projectMember.findMany({
      where: { projectId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            role: true,
            preferredLanguage: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }

  async addMember(
    projectId: string,
    dto: AddProjectMemberDto,
    actorId: string,
    actorRole: Role,
  ) {
    await this.assertCanManageMembers(projectId, actorId, actorRole);

    if (!dto.userId && !dto.phone) {
      throw new BadRequestException('userId or phone is required');
    }

    let user =
      dto.userId
        ? await this.prisma.user.findUnique({ where: { id: dto.userId } })
        : null;
    if (!user && dto.phone) {
      try {
        const cc = this.config.get<string>('OTP_PHONE_DEFAULT_COUNTRY') ?? '91';
        const keys = phoneLookupKeys(dto.phone, cc);
        user = await this.prisma.user.findFirst({
          where: { phone: { in: keys } },
        });
      } catch {
        throw new BadRequestException('Invalid phone number');
      }
    }
    if (!user) throw new NotFoundException('User not found');

    const membershipRole = (dto.role ?? user.role) as Role;

    // Supervisors may only add workers to their team
    if (!isAdminRole(actorRole)) {
      if (membershipRole !== Role.WORKER || user.role !== Role.WORKER) {
        throw new ForbiddenException(
          'Supervisors can only add workers to their team. Ask an admin to assign supervisors.',
        );
      }
    }

    // Keep User.role as source of truth for staff; membership mirrors it
    if (
      isStaffRole(user.role) &&
      membershipRole !== user.role &&
      !isAdminRole(actorRole)
    ) {
      throw new BadRequestException(
        'Membership role must match the user account role for staff',
      );
    }

    try {
      return await this.prisma.projectMember.create({
        data: {
          projectId,
          userId: user.id,
          role: isAdminRole(actorRole) ? membershipRole : Role.WORKER,
        },
        include: {
          user: { select: { id: true, name: true, role: true, phone: true } },
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException('User is already a project member');
      }
      throw err;
    }
  }

  async removeMember(
    projectId: string,
    targetUserId: string,
    actorId: string,
    actorRole: Role,
  ) {
    await this.assertCanManageMembers(projectId, actorId, actorRole);

    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: targetUserId } },
    });
    if (!member) throw new NotFoundException('Member not found');

    if (!isAdminRole(actorRole) && isStaffRole(member.role)) {
      throw new ForbiddenException(
        'Supervisors cannot remove other supervisors. Ask an admin.',
      );
    }

    if (targetUserId === actorId && isAdminRole(actorRole)) {
      // allow admin to leave a team
    }

    await this.prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId: targetUserId } },
    });
    return { ok: true };
  }

  /** Workers can join via project code (e.g. PTP-B from seed). */
  async joinByCode(userId: string, role: Role, code: string) {
    assertRateLimit(`join-code:${userId}`, 10, 60_000);
    if (!isFieldWorker(role)) {
      throw new ForbiddenException(
        'Only workers join by project code; staff are assigned by admin',
      );
    }
    const project = await this.prisma.project.findFirst({
      where: { code: code.trim().toUpperCase(), active: true },
    });
    if (!project) throw new NotFoundException('Invalid project code');

    const existing = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: project.id, userId } },
    });
    if (existing) return project;

    try {
      await this.prisma.projectMember.create({
        data: { projectId: project.id, userId, role: Role.WORKER },
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') return project;
      throw err;
    }
    return project;
  }

  /** After worker self-register — join default site as worker. */
  async autoJoinDefaultProject(userId: string, role: Role = Role.WORKER) {
    if (!isFieldWorker(role)) return null;
    const project = await this.prisma.project.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!project) return null;
    const existing = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: project.id, userId } },
    });
    if (existing) return project;
    try {
      await this.prisma.projectMember.create({
        data: { projectId: project.id, userId, role: Role.WORKER },
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') return project;
      throw err;
    }
    return project;
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

  /** Staff notification targets: project supervisors/admins + all org admins */
  async listStaffMemberIds(projectId: string): Promise<string[]> {
    const [members, orgAdmins] = await Promise.all([
      this.prisma.projectMember.findMany({
        where: {
          projectId,
          role: { in: [Role.SUPERVISOR, Role.ADMIN] },
        },
        select: { userId: true },
      }),
      this.prisma.user.findMany({
        where: { role: Role.ADMIN },
        select: { id: true },
      }),
    ]);
    return [
      ...new Set([
        ...members.map((m) => m.userId),
        ...orgAdmins.map((a) => a.id),
      ]),
    ];
  }
}
