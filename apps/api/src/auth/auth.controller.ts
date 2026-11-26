import { Body, Controller, Get, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RefreshDto, RequestOtpDto, VerifyOtpDto } from './dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Public: first-admin open + default register role (no secret existence leak) */
  @Get('bootstrap-status')
  bootstrapStatus() {
    return this.auth.bootstrapStatus();
  }

  @Post('otp/request')
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.auth.requestOtp(dto);
  }

  @Post('otp/verify')
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  /** Uses refresh token so logout works after access JWT expiry */
  @Post('logout')
  logout(@Body() dto: RefreshDto) {
    return this.auth.logoutByRefreshToken(dto.refreshToken);
  }
}
