import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { LOGIN_ROLES } from '@kaamsetu/shared';

const ROLE_VALUES = [...LOGIN_ROLES] as string[];

export class AdminCreateUserDto {
  @IsString()
  @Matches(/^\+?[0-9]{8,15}$/, {
    message: 'phone must be 8–15 digits (optional leading +)',
  })
  phone!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsIn(ROLE_VALUES)
  role!: 'WORKER' | 'SUPERVISOR' | 'ADMIN';

  @IsOptional()
  @IsString()
  @MaxLength(32)
  preferredLanguage?: string;

  /** Optional: assign to a project/team immediately */
  @IsOptional()
  @IsUUID()
  projectId?: string;
}

export class UpdateUserRoleDto {
  @IsIn(ROLE_VALUES)
  role!: 'WORKER' | 'SUPERVISOR' | 'ADMIN';
}
