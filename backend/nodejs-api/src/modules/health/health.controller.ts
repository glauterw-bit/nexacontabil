import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    const startedAt = Date.now();
    let db: 'ok' | 'error' = 'ok';
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
    } catch {
      db = 'error';
    }
    return {
      status: db === 'ok' ? 'ok' : 'degraded',
      db,
      uptime: Math.round(process.uptime()),
      latencyMs: Date.now() - startedAt,
      env: process.env.NODE_ENV ?? 'unknown',
      version: process.env.RAILWAY_DEPLOYMENT_ID?.slice(0, 8) ?? 'local',
    };
  }
}
