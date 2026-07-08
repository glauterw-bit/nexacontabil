import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Request,
  Query,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, IsOptional, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Public } from '../../common/public.decorator';

class UpdateProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Request() req: any) {
    return this.authService.me(req.user.id);
  }

  @Get('users')
  @UseGuards(JwtAuthGuard)
  listUsers(@Request() req: any, @Query('role') role?: string) {
    return this.authService.listUsers(req.user, role);
  }

  // Cria os logins dos analistas a partir dos responsáveis da carteira.
  @Post('provisionar-equipe')
  @UseGuards(JwtAuthGuard)
  provisionarEquipe(@Body() body: { senhaPadrao?: string }) {
    return this.authService.provisionarEquipe(body?.senhaPadrao);
  }

  // ── ADMIN: gestão de contas da equipe (só gestor) ──
  @Post('admin/criar-analista')
  @UseGuards(JwtAuthGuard)
  criarAnalista(@Request() req: any, @Body() body: { name: string; email: string; password: string; role?: string }) {
    return this.authService.criarAnalista(req.user, body);
  }

  @Post('admin/redefinir-senha')
  @UseGuards(JwtAuthGuard)
  redefinirSenha(@Request() req: any, @Body() body: { userId: string; novaSenha: string }) {
    return this.authService.redefinirSenha(req.user, body?.userId, body?.novaSenha);
  }

  @Post('admin/definir-ativo')
  @UseGuards(JwtAuthGuard)
  definirAtivo(@Request() req: any, @Body() body: { userId: string; ativo: boolean }) {
    return this.authService.definirAtivo(req.user, body?.userId, body?.ativo);
  }

  @Put('profile')
  @UseGuards(JwtAuthGuard)
  updateProfile(@Request() req: any, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(req.user.id, dto);
  }
}
