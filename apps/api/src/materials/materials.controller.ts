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
import { IsEnum } from 'class-validator';
import { MaterialRequestStatus } from '@prisma/client';
import {
  CreateMaterialRequestDto,
  MaterialsService,
} from './materials.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';

class UpdateMaterialStatusDto {
  @IsEnum(MaterialRequestStatus)
  status!: MaterialRequestStatus;
}

@Controller('materials')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MaterialsController {
  constructor(private readonly materials: MaterialsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('projectId', new ParseUUIDPipe({ optional: true }))
    projectId?: string,
  ) {
    return this.materials.list(user.id, user.role, projectId);
  }

  @Post()
  create(
    @Body() dto: CreateMaterialRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.materials.create(dto, user.id, user.role);
  }

  @Patch(':id/status')
  @Roles(Role.SUPERVISOR)
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaterialStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.materials.updateStatus(id, dto.status, user.id, user.role);
  }
}