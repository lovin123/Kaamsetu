import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PERMISSIONS } from '@kaamsetu/shared';
import { ProjectsService } from './projects.service';
import {
  AddProjectMemberDto,
  CreateProjectDto,
  JoinProjectDto,
  UpdateProjectDto,
} from './projects.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import {
  AuthUser,
  CurrentUser,
  RequirePermissions,
  Roles,
} from '../common/decorators';

@Controller('projects')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.projects.listForUser(user.id, user.role);
  }

  @Post()
  @RequirePermissions(PERMISSIONS['projects:create'])
  create(@Body() dto: CreateProjectDto, @CurrentUser() user: AuthUser) {
    return this.projects.create(dto, user.role);
  }

  @Post('join')
  join(@Body() dto: JoinProjectDto, @CurrentUser() user: AuthUser) {
    return this.projects.joinByCode(user.id, user.role, dto.code);
  }

  @Get(':id/members')
  listMembers(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projects.listMembers(id, user.id, user.role);
  }

  @Post(':id/members')
  @Roles(Role.SUPERVISOR)
  addMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddProjectMemberDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projects.addMember(id, dto, user.id, user.role);
  }

  @Delete(':id/members/:userId')
  @Roles(Role.SUPERVISOR)
  removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projects.removeMember(id, userId, user.id, user.role);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS['projects:update'])
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projects.update(id, dto, user.role);
  }

  @Get(':id')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projects.getOne(id, user.id, user.role);
  }
}
