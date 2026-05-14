import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] unhandledRejection:', reason);
  process.exit(1);
});

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  console.log('[boot] creating Nest application…');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api/v1', { exclude: ['/health', '/graphql'] });

  const port = Number(process.env.PORT || process.env.APP_PORT || 3001);
  await app.listen(port, '0.0.0.0');
  logger.log(`DomoSYS API running on 0.0.0.0:${port}`);
  logger.log(`GraphQL playground: http://localhost:${port}/graphql`);
}

bootstrap().catch((err) => {
  console.error('[FATAL] bootstrap failed:', err);
  process.exit(1);
});
