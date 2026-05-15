import { Injectable, Logger } from '@nestjs/common';

/**
 * Service de e-mail transacional via Resend.
 * Se RESEND_API_KEY ausente, opera em modo DEV (apenas loga).
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  private get apiKey() {
    return process.env.RESEND_API_KEY;
  }

  private get fromAddress() {
    return process.env.EMAIL_FROM ?? 'NexaContabil <onboarding@resend.dev>';
  }

  async send(to: string | string[], subject: string, html: string): Promise<{ ok: boolean; id?: string; dev?: boolean }> {
    const recipients = Array.isArray(to) ? to : [to];
    if (!this.apiKey) {
      this.logger.warn(`[Email DEV] to=${recipients.join(',')} subject="${subject}"`);
      return { ok: true, dev: true };
    }
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.fromAddress,
          to: recipients,
          subject,
          html,
        }),
      });
      const data = await res.json();
      return { ok: res.ok, id: data?.id };
    } catch (err: any) {
      this.logger.error(`Resend send failed: ${err.message}`);
      return { ok: false };
    }
  }

  // Templates
  taskSlaTomorrow(opts: { analystName: string; companyName: string; stageLabel: string; dueDate: string; taskUrl: string }) {
    const html = `
      <div style="font-family:-apple-system,Segoe UI,system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#0f1117;color:#e5e7eb">
        <div style="border-bottom:1px solid #1e2740;padding-bottom:16px;margin-bottom:16px">
          <h2 style="color:#fff;margin:0;font-size:18px">⏰ SLA vence amanhã</h2>
        </div>
        <p style="color:#9ca3af;font-size:14px">Olá <strong>${opts.analystName}</strong>,</p>
        <p style="color:#e5e7eb;font-size:14px">
          A tarefa <strong>${opts.stageLabel}</strong> da empresa <strong>${opts.companyName}</strong>
          vence em <strong>${opts.dueDate}</strong>.
        </p>
        <a href="${opts.taskUrl}" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-size:13px;margin-top:8px">
          Abrir tarefa
        </a>
        <p style="color:#6b7280;font-size:11px;margin-top:24px">
          NexaContábil · Sistema de gestão contábil
        </p>
      </div>`;
    return this.send(opts.analystName + '@example.com', `[NexaContábil] SLA amanhã: ${opts.stageLabel}`, html);
  }
}
