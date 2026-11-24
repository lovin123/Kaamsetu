import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  AddProjectMemberDto,
  JoinProjectDto,
  ProjectsService,
} from './projects.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';

@Controller('projects')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.projects.listForUser(user.id, user.role);
  }

  /** Must be declared before :id routes */
  @Post('join')
  join(@Body() dto: JoinProjectDto, @CurrentUser() user: AuthUser) {
    return this.projects.joinByCode(user.id, user.role, dto.code);
  }

  @Post(':id/members')
  @Roles(Role.SUPERVISOR)
  addMember(
    @Param('id') id: string,
    @Body() dto: AddProjectMemberDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projects.addMember(id, dto, user.id, user.role);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.projects.getOne(id, user.id, user.role);
  }
}
