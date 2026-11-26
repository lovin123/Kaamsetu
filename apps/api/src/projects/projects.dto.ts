import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Role } from '@prisma/client';

export class CreateProjectDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @Matches(/^[A-Za-z0-9-]{2,32}$/, {
    message: 'code must be 2–32 letters, numbers, or hyphens',
  })
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class AddProjectMemberDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  /** Resolve an existing user by phone when userId is omitted */
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{8,15}$/)
  phone?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

export class JoinProjectDto {
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  code!: string;
}
