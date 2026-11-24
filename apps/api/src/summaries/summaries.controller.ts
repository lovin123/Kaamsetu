import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { SummariesService } from './summaries.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';

@Controller('summaries')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SummariesController {
  constructor(private readonly summaries: SummariesService) {}

  @Get('daily')
  @Roles(Role.SUPERVISOR)
  daily(
    @CurrentUser() user: AuthUser,
    @Query('projectId') projectId?: string,
    @Query('date') date?: string,
  ) {
    return this.summaries.generate(user.id, user.role, projectId, date);
  }
}
