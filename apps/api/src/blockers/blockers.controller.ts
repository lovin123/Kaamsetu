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
import { BlockersService, CreateBlockerDto } from './blockers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';

@Controller('blockers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BlockersController {
  constructor(private readonly blockers: BlockersService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('projectId') projectId?: string,
  ) {
    return this.blockers.list(user.id, user.role, projectId);
  }

  @Post()
  create(@Body() dto: CreateBlockerDto, @CurrentUser() user: AuthUser) {
    return this.blockers.create(dto, user.id, user.role);
  }

  @Patch(':id/resolve')
  @Roles(Role.SUPERVISOR)
  resolve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.blockers.resolve(id, user.id, user.role);
  }
}