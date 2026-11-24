import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const corsOrigin = process.env.CORS_ORIGIN;
  const origins =
    !corsOrigin || corsOrigin.trim() === '*'
      ? true
      : corsOrigin.split(',').map((o) => o.trim());
  app.enableCors({
    origin: origins,
    // credentials + wildcard Origin is invalid in browsers; only enable when explicit origins set
    credentials: origins !== true,
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`KaamSetu API listening on http://localhost:${port}/api`);
}

bootstrap();
