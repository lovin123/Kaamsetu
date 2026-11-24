import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import {
  AssignTaskDto,
  CreateTaskDto,
  UpdateProgressDto,
  UpdateTaskStatusDto,
} from './tasks.dto';

@Controller('tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('projectId') projectId?: string,
  ) {
    return this.tasks.list(user.id, user.role, projectId);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.tasks.getOne(id, user.id, user.role);
  }

  @Post()
  @Roles(Role.SUPERVISOR)
  create(@Body() dto: CreateTaskDto, @CurrentUser() user: AuthUser) {
    return this.tasks.create(dto, user.id, user.role);
  }

  @Patch(':id/assign')
  @Roles(Role.SUPERVISOR)
  assign(
    @Param('id') id: string,
    @Body() dto: AssignTaskDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tasks.assign(id, dto.assigneeId, user.id, user.role);
  }

  @Patch(':id/progress')
  progress(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProgressDto,
  ) {
    return this.tasks.updateProgress(id, user.id, user.role, dto);
  }

  @Patch(':id/status')
  @Roles(Role.SUPERVISOR)
  status(
    @Param('id') id: string,
    @Body() dto: UpdateTaskStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tasks.setStatus(id, dto.status, user.id, user.role);
  }
}
