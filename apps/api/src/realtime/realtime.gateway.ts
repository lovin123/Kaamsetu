import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

@WebSocketGateway({
  cors: { origin: '*' },
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

  async handleConnection(client: Socket) {
    try {
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
        role?: Role;
      };
      client.data.userId = payload.sub;
      client.data.role = payload.role;
      client.join(`user:${payload.sub}`);

      const projectId = client.handshake.query.projectId as string | undefined;
      if (projectId) {
        const allowed = await this.canJoinProject(
          payload.sub,
          payload.role,
          projectId,
        );
        if (!allowed) {
          client.disconnect();
          return;
        }
        client.join(`project:${projectId}`);
      } else if (payload.role === Role.SUPERVISOR) {
        const projects = await this.prisma.project.findMany({
          where: { active: true },
          select: { id: true },
        });
        for (const p of projects) client.join(`project:${p.id}`);
      } else {
        const memberships = await this.prisma.projectMember.findMany({
          where: { userId: payload.sub },
          select: { projectId: true },
        });
        for (const m of memberships) client.join(`project:${m.projectId}`);
      }
      this.logger.debug(`WS connected user=${payload.sub}`);
    } catch {
      client.disconnect();
    }
  }

  private async canJoinProject(
    userId: string,
    role: Role | undefined,
    projectId: string,
  ) {
    if (role === Role.SUPERVISOR) {
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
      });
      return Boolean(project);
    }
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
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