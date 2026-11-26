import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const PHONE = /^\+?[0-9]{8,15}$/;

/** Strip spaces/dashes so "9000 000 001" and "+91-9000000001" validate. */
function compactPhone(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  return hasPlus ? `+${digits}` : digits;
}

export class RequestOtpDto {
  @Transform(({ value }) => compactPhone(value))
  @IsString()
  @Matches(PHONE, {
    message: 'phone must be 8–15 digits (optional leading +)',
  })
  phone!: string;

  @IsIn(['login', 'register'])
  purpose!: 'login' | 'register';

  /**
   * Optional. Only for Admin recovery when an admin already exists.
   * Normal register does not send a role — server assigns ADMIN (first user) or WORKER.
   */
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  bootstrapSecret?: string;
}

export class VerifyOtpDto {
  @Transform(({ value }) => compactPhone(value))
  @IsString()
  @Matches(PHONE, {
    message: 'phone must be 8–15 digits (optional leading +)',
  })
  phone!: string;

  @IsString()
  @Matches(/^[0-9]{4,8}$/, { message: 'code must be a 4–8 digit OTP' })
  code!: string;

  @IsIn(['login', 'register'])
  purpose!: 'login' | 'register';

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  preferredLanguage?: string;

  /** Ignored at verify — role is bound when OTP was requested. */
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  bootstrapSecret?: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  preferredLanguage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  fcmToken?: string;
}

export class RefreshDto {
  @IsString()
  @MinLength(10)
  refreshToken!: string;
}
