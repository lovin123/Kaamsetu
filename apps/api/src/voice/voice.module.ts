import { Module } from '@nestjs/common';
import { VoiceService } from './voice.service';
import { VoiceController } from './voice.controller';
import { TasksModule } from '../tasks/tasks.module';
import { IncidentsModule } from '../incidents/incidents.module';
import { MaterialsModule } from '../materials/materials.module';
import { BlockersModule } from '../blockers/blockers.module';
import { SummariesModule } from '../summaries/summaries.module';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [
    TasksModule,
    IncidentsModule,
    MaterialsModule,
    BlockersModule,
    SummariesModule,
    ProjectsModule,
  ],
  providers: [VoiceService],
  controllers: [VoiceController],
  exports: [VoiceService],
})
export class VoiceModule {}
