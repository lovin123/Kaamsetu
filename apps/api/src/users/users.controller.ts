import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PERMISSIONS } from '@kaamsetu/shared';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CurrentUser,
  RequirePermissions,
  Roles,
  AuthUser,
} from '../common/decorators';
import { RolesGuard } from '../common/roles.guard';
import { UpdateProfileDto } from '../auth/dto';
import { AdminCreateUserDto, UpdateUserRoleDto } from './users.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.users.me(user.id);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.id, dto);
  }

  @Get('workers')
  @Roles(Role.SUPERVISOR)
  workers(
    @CurrentUser() user: AuthUser,
    @Query('projectId', new ParseUUIDPipe({ optional: true }))
    projectId?: string,
  ) {
    return this.users.listWorkers(user.id, user.role, projectId);
  }

  @Get()
  @RequirePermissions(PERMISSIONS['users:list_all'])
  listAll() {
    return this.users.listAll();
  }

  @Post()
  @RequirePermissions(PERMISSIONS['users:create'])
  create(@Body() dto: AdminCreateUserDto, @CurrentUser() user: AuthUser) {
    return this.users.adminCreate(dto, user.id, user.role);
  }

  @Patch(':id/role')
  @RequirePermissions(PERMISSIONS['users:manage_roles'])
  updateRole(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserRoleDto,
  ) {
    return this.users.updateRole(user.id, id, dto);
  }
}
