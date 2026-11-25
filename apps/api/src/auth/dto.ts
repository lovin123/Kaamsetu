import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @Matches(/^\+?[0-9]{8,15}$/, {
    message: 'phone must be 8–15 digits (optional leading +)',
  })
  phone!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password!: string;
}

export class RegisterDto {
  @IsString()
  @Matches(/^\+?[0-9]{8,15}$/, {
    message: 'phone must be 8–15 digits (optional leading +)',
  })
  phone!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'password must include at least one letter and one number',
  })
  password!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  preferredLanguage?: string;
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
