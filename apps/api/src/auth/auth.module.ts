import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { SmsProvider } from './sms.provider';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [
    PassportModule,
    ProjectsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error('JWT_SECRET is required');
        }
        // expiresIn is set explicitly in AuthService.tokenResponse
        return { secret };
      },
    }),
  ],
  providers: [AuthService, JwtStrategy, SmsProvider, AdminBootstrapService],
  controllers: [AuthController],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
