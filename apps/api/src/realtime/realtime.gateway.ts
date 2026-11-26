import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { isAdminRole } from '@kaamsetu/shared';
import { PrismaService } from '../prisma/prisma.service';

@WebSocketGateway({
  // Decorator runs before ConfigModule loads .env — tighten in handleConnection
  cors: { origin: true, credentials: true },
  namespace: '/realtime',
})
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private originAllowed(origin: string | undefined): boolean {
    const allowed = this.config.get<string>('CORS_ORIGIN');
    if (!allowed || allowed.trim() === '*') return true;
    // Native clients often omit Origin
    if (!origin) return true;
    const list = allowed.split(',').map((o) => o.trim()).filter(Boolean);
    return list.includes(origin);
  }

  async handleConnection(client: Socket) {
    try {
      const origin = client.handshake.headers.origin;
      if (!this.originAllowed(typeof origin === 'string' ? origin : undefined)) {
        client.disconnect();
        return;
      }

      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.headers.authorization?.replace('Bearer ', '') ?? '');
      if (!token) {
        client.disconnect();
        return;
      }
      const secret = this.config.get<string>('JWT_SECRET');
      if (!secret) {
        client.disconnect();
        return;
      }
      const payload = this.jwt.verify(token, { secret }) as {
        sub: string;
        typ?: string;
      };
      if (payload.typ === 'refresh') {
        client.disconnect();
        return;
      }

      // Always load role from DB (never trust JWT role claim after demotion)
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, role: true },
      });
      if (!user) {
        client.disconnect();
        return;
      }

      client.data.userId = user.id;
      client.data.role = user.role;
      client.join(`user:${user.id}`);

      const projectId = client.handshake.query.projectId as string | undefined;
      if (projectId) {
        const allowed = await this.canJoinProject(user.id, user.role, projectId);
        if (!allowed) {
          client.disconnect();
          return;
        }
        client.join(`project:${projectId}`);
      } else if (isAdminRole(user.role)) {
        const projects = await this.prisma.project.findMany({
          where: { active: true },
          select: { id: true },
        });
        for (const p of projects) client.join(`project:${p.id}`);
      } else {
        const memberships = await this.prisma.projectMember.findMany({
          where: { userId: user.id, project: { active: true } },
          select: { projectId: true },
        });
        for (const m of memberships) client.join(`project:${m.projectId}`);
      }
      this.logger.debug(`WS connected user=${user.id}`);
    } catch {
      client.disconnect();
    }
  }

  private async canJoinProject(
    userId: string,
    role: Role,
    projectId: string,
  ) {
    if (isAdminRole(role)) {
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
      });
      return Boolean(project?.active);
    }
    const member = await this.prisma.projectMember.findFirst({
      where: {
        projectId,
        userId,
        project: { active: true },
      },
    });
    return Boolean(member);
  }

  emitToUser(userId: string, event: string, data: unknown) {
    this.server?.to(`user:${userId}`).emit(event, data);
  }

  emitToProject(projectId: string, event: string, data: unknown) {
    this.server?.to(`project:${projectId}`).emit(event, data);
  }
}
