import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) {
          if (process.env.NODE_ENV === 'production') {
            throw new Error('JWT_SECRET ausente em produção. Configure a variável de ambiente antes de subir o serviço.');
          }
          // dev only fallback — nunca usado em prod (erro acima)
          console.warn('[AUTH] JWT_SECRET ausente — usando fallback de desenvolvimento. NUNCA use em produção.');
        }
        return {
          secret: secret ?? 'dev-only-not-secure-rotate-me',
          signOptions: { expiresIn: config.get('JWT_EXPIRES_IN', '7d') },
        };
      },
    }),
  ],
  providers: [AuthService, JwtStrategy, PrismaService],
  controllers: [AuthController],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
