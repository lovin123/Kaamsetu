import { Module, forwardRef } from '@nestjs/common';
import { BlockersService } from './blockers.service';
import { BlockersController } from './blockers.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [NotificationsModule, ProjectsModule, forwardRef(() => RealtimeModule)],
  providers: [BlockersService],
  controllers: [BlockersController],
  exports: [BlockersService],
})
export class BlockersModule {}