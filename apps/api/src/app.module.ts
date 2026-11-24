import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { IncidentsModule } from './incidents/incidents.module';
import { MaterialsModule } from './materials/materials.module';
import { BlockersModule } from './blockers/blockers.module';
import { VoiceModule } from './voice/voice.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SummariesModule } from './summaries/summaries.module';
import { ProvidersModule } from './providers/providers.module';
import { RealtimeModule } from './realtime/realtime.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    PrismaModule,
    ProvidersModule,
    AuthModule,
    UsersModule,
    ProjectsModule,
    TasksModule,
    IncidentsModule,
    MaterialsModule,
    BlockersModule,
    VoiceModule,
    NotificationsModule,
    SummariesModule,
    RealtimeModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
