import { Module } from '@nestjs/common';
import { SummariesService } from './summaries.service';
import { SummariesController } from './summaries.controller';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [ProjectsModule],
  providers: [SummariesService],
  controllers: [SummariesController],
  exports: [SummariesService],
})
export class SummariesModule {}
