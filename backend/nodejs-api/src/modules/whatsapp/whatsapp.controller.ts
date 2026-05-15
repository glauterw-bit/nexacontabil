import { Body, Controller, Get, Post, Query, Logger } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { Public } from '../../common/public.decorator';

@Controller('whatsapp')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(private readonly service: WhatsappService) {}

  /**
   * Endpoint chamado pela Meta (Facebook) para verificacao inicial.
   * Configurar no Webhooks do app: BACKEND/api/v1/whatsapp/webhook.
   */
  @Public()
  @Get('webhook')
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const expected = process.env.WHATSAPP_VERIFY_TOKEN ?? 'nexa-verify-default';
    if (mode === 'subscribe' && verifyToken === expected) {
      return challenge;
    }
    return { error: 'verify failed' };
  }

  /**
   * Receive incoming messages (Meta Cloud API webhook).
   * Payload: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
   */
  @Public()
  @Post('webhook')
  async incoming(@Body() body: any) {
    try {
      const change = body?.entry?.[0]?.changes?.[0]?.value;
      const msg = change?.messages?.[0];
      if (!msg) return { ok: true };

      const from = msg.from as string;
      const text = msg.text?.body ?? msg.button?.text ?? '';

      const reply = await this.service.handleIncoming({ from, body: text });
      await this.service.sendMessage(from, reply.text);
    } catch (err: any) {
      this.logger.error(`Webhook err: ${err.message}`);
    }
    return { ok: true };
  }

  /**
   * Endpoint de teste manual — usado pelo frontend para simular mensagem
   * sem precisar configurar Twilio/Meta.
   */
  @Post('test')
  async test(@Body() body: { from?: string; text: string; companyPhone?: string }) {
    // se um companyPhone foi passado, finge que veio dele (pra associar a empresa)
    const from = body.from ?? body.companyPhone ?? '5511999999999';
    return this.service.handleIncoming({ from, body: body.text });
  }
}
