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
import { IncidentStatus, Role } from '@prisma/client';
import { IsEnum } from 'class-validator';
import { CreateIncidentDto, IncidentsService } from './incidents.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';

class UpdateIncidentStatusDto {
  @IsEnum(IncidentStatus)
  status!: IncidentStatus;
}

@Controller('incidents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('projectId') projectId?: string,
  ) {
    return this.incidents.list(user.id, user.role, projectId);
  }

  @Post()
  create(@Body() dto: CreateIncidentDto, @CurrentUser() user: AuthUser) {
    return this.incidents.create(dto, user.id, user.role);
  }

  @Patch(':id/status')
  @Roles(Role.SUPERVISOR)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateIncidentStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.incidents.updateStatus(id, dto.status, user.id, user.role);
  }
}