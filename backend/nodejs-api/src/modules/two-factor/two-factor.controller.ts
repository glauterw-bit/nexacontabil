import { Body, Controller, Post } from '@nestjs/common';
import { TwoFactorService } from './two-factor.service';

@Controller('two-factor')
export class TwoFactorController {
  constructor(private readonly service: TwoFactorService) {}

  @Post('start')
  start(@Body() body: { userId: string; issuer?: string }) {
    return this.service.start(body.userId, body.issuer);
  }

  @Post('enable')
  enable(@Body() body: { userId: string; code: string }) {
    return this.service.enableAfterVerify(body.userId, body.code);
  }

  @Post('disable')
  disable(@Body() body: { userId: string; code: string }) {
    return this.service.disable(body.userId, body.code);
  }

  @Post('verify')
  async verify(@Body() body: { userId: string; code: string }) {
    return { valid: await this.service.verifyForLogin(body.userId, body.code) };
  }
}
