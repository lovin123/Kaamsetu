import { Injectable, Logger } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FcmProvider } from '../providers/fcm.provider';
import { ExpoPushProvider } from '../providers/expo-push.provider';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fcm: FcmProvider,
    private readonly expoPush: ExpoPushProvider,
  ) {}

  list(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markRead(userId: string, id: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { read: true },
    });
  }

  async create(input: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    data?: Record<string, unknown>;
  }) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: input.data as object | undefined,
      },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { fcmToken: true },
    });
    const token = user?.fcmToken;
    if (token) {
      try {
        if (this.expoPush.isExpoToken(token)) {
          await this.expoPush.send(token, input.title, input.body, input.data);
        } else {
          await this.fcm.send(token, input.title, input.body, input.data);
        }
      } catch (err) {
        this.logger.warn(`Push send failed: ${(err as Error).message}`);
      }
    }
    return notification;
  }
}