import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
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

  const port = process.env.PORT || process.env.APP_PORT || 3001;
  await app.listen(port);
  logger.log(`DomoSYS API running on port ${port}`);
  logger.log(`GraphQL playground: http://localhost:${port}/graphql`);
}

bootstrap();
