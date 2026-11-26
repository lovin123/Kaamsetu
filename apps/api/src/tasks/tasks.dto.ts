import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TaskStatus } from '@prisma/client';

export class CreateTaskDto {
  @IsUUID()
  projectId!: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;
}

export class UpdateProgressDto {
  @IsInt()
  @Min(0)
  @Max(100)
  progressPercent!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  transcript?: string;

  @IsOptional()
  @IsIn(['manual', 'voice'])
  source?: 'manual' | 'voice';
}

export class AssignTaskDto {
  @IsUUID()
  assigneeId!: string;
}

export class UpdateTaskStatusDto {
  @IsEnum(TaskStatus)
  status!: TaskStatus;
}
