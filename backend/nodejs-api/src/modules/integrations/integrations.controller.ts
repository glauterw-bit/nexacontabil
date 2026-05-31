import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/public.decorator';

type Status = 'configured' | 'missing' | 'partial';

interface IntegrationStatus {
  key: string;
  name: string;
  status: Status;
  required: boolean;
  prioridade: 1 | 2 | 3; // 1=essencial pra operação · 2=fiscal/cobrança · 3=avançada
  usadoEm?: string;      // qual recurso do NexaContábil consome
  helps: string[];
  signupUrl?: string;
  setupSteps: string[];
}

@Controller('integrations')
export class IntegrationsController {
  /**
   * Retorna status das integrações externas que o sistema PODE usar.
   * O frontend renderiza isso em /integracoes com instruções passo-a-passo.
   */
  @Public()
  @Get('status')
  status(): { integrations: IntegrationStatus[]; summary: { total: number; configured: number; missing: number } } {
    const integrations: IntegrationStatus[] = [
      {
        key: 'google_drive',
        name: 'Google Drive (captura de documentos)',
        status: process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? 'configured' : 'missing',
        required: false,
        prioridade: 1,
        usadoEm: 'Esteira Fiscal (varre a pasta e roteia por cliente), Busca IA em drives',
        helps: [
          'A Esteira Fiscal lê a pasta do Drive e roteia cada documento ao cliente certo',
          'Busca em linguagem natural dentro dos arquivos do escritório',
          'Sem precisar baixar tudo manualmente',
        ],
        signupUrl: 'https://console.cloud.google.com',
        setupSteps: [
          'Acesse console.cloud.google.com e crie um projeto (ou use um existente).',
          'Ative a "Google Drive API" em APIs e Serviços → Biblioteca.',
          'Em "Tela de consentimento OAuth", configure como Externo e adicione seu e-mail como usuário de teste.',
          'Em Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web.',
          'Em URIs de redirecionamento autorizados, adicione: BACKEND_URL/api/v1/cloud/google/callback.',
          'Copie o Client ID e o Client Secret.',
          'No Railway → backend → Variables: GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.',
          'No NexaContábil, vá em /drive-conectado e clique em Conectar — autorize a conta do escritório.',
        ],
      },
      {
        key: 'onvio',
        name: 'Onvio / Domínio (Thomson Reuters)',
        status: process.env.ONVIO_CLIENT_ID && process.env.ONVIO_CLIENT_SECRET ? 'configured' : 'missing',
        required: false,
        prioridade: 2,
        usadoEm: 'Integração Onvio (envio de NF, baixa de parcelas e rubricas pro Domínio)',
        helps: [
          'Envia NF, baixas de parcela e rubricas de folha direto pro Domínio',
          'Alternativa: se não conseguir o Onvio, use /exportar-dominio (gera arquivo de importação, sem credencial)',
        ],
        signupUrl: 'https://onvio.com.br',
        setupSteps: [
          'No Portal Onvio, abra chamado pedindo "Acesso à Plataforma de Integração (Developer Portal)".',
          'A Thomson Reuters envia client_id e client_secret (pode levar 3-7 dias úteis).',
          'Informe as URLs de callback: BACKEND_URL/api/v1/onvio/callback.',
          'No Railway → backend → Variables: ONVIO_CLIENT_ID e ONVIO_CLIENT_SECRET.',
          'Se a TR informar URLs próprias, ajuste também ONVIO_AUTHORIZE_URL, ONVIO_TOKEN_URL, ONVIO_API_BASE_URL.',
          'No NexaContábil, vá em /onvio e clique em Conectar.',
          'ALTERNATIVA SEM ESPERAR A TR: use /exportar-dominio — gera o arquivo de importação de lançamentos que o Domínio lê nativamente.',
        ],
      },
      {
        key: 'anthropic',
        name: 'Anthropic Claude (IA contábil)',
        status: process.env.ANTHROPIC_API_KEY ? 'configured' : 'missing',
        required: false,
        prioridade: 1,
        usadoEm: 'OCR de documentos, Banco de NCM (classificação), Copilot, Esteira Fiscal, Risco Fiscal',
        helps: [
          'Classificação automática de documentos (NF-e, NFS-e, boleto, holerite...)',
          'Extração estruturada via OCR',
          'Busca em linguagem natural',
          'Sugestões contábeis automáticas',
          'Reconciliação inteligente de extratos bancários',
        ],
        signupUrl: 'https://console.anthropic.com',
        setupSteps: [
          'Acesse console.anthropic.com e faça login (ou crie conta).',
          'Vá em API Keys → Create Key e copie o valor (formato sk-ant-api03-...).',
          'Em Billing, adicione US$ 5-10 de crédito (suficiente para ~500 documentos).',
          'No Railway, abra o serviço backend → Variables → New Variable.',
          'Adicione ANTHROPIC_API_KEY com o valor copiado.',
          'O backend reinicia em ~30s — a partir daí toda análise IA usa Claude real.',
        ],
      },
      {
        key: 'nfeio',
        name: 'NFe.io (emissão NF-e / NFS-e)',
        status: process.env.NFEIO_API_KEY && process.env.NFEIO_COMPANY_ID ? 'configured'
              : (process.env.NFEIO_API_KEY || process.env.NFEIO_COMPANY_ID) ? 'partial' : 'missing',
        required: false,
        prioridade: 2,
        usadoEm: 'Módulo /fiscal (emissão real de NF-e/NFS-e)',
        helps: [
          'Emissão real de NF-e e NFS-e em nome do cliente',
          'Cancelamento e consulta de notas',
          'Webhook de atualizações fiscais',
        ],
        signupUrl: 'https://nfe.io',
        setupSteps: [
          'Crie conta em nfe.io e escolha um plano (a partir de R$ 50/mês).',
          'Cadastre o CNPJ da empresa cliente — vai pedir o A1 .pfx do cliente.',
          'Em Configurações → API → copie API Key e Company ID.',
          'Adicione no Railway → backend → Variables: NFEIO_API_KEY e NFEIO_COMPANY_ID.',
          'Pronto: o módulo /fiscal passa a emitir notas reais via SEFAZ.',
        ],
      },
      {
        key: 'banco_inter',
        name: 'Banco Inter API (PIX + Boleto)',
        status: process.env.INTER_CLIENT_ID && process.env.INTER_CLIENT_SECRET ? 'configured' : 'missing',
        required: false,
        prioridade: 2,
        usadoEm: 'Módulo /boletos (cobrança real com retorno bancário)',
        helps: [
          'Emissão real de boletos com retorno bancário',
          'PIX cobrança dinâmica com QR Code',
          'Webhook de pagamentos recebidos',
          'Sem custo até limites generosos',
        ],
        signupUrl: 'https://www.bancointer.com.br/pra-empresas/',
        setupSteps: [
          'Abra conta PJ no Banco Inter (gratuito, online em 1 dia).',
          'Solicite acesso à API: developers.inter.co → Aplicações → Nova Aplicação.',
          'Baixe o certificado mTLS gerado e guarde em local seguro.',
          'Anote Client ID e Client Secret.',
          'No Railway → backend → Variables, adicione: INTER_CLIENT_ID, INTER_CLIENT_SECRET, INTER_CERT_PFX (base64 do certificado), INTER_CERT_PASS.',
          'O módulo /boletos passa a gerar cobranças reais.',
        ],
      },
      {
        key: 'whatsapp',
        name: 'WhatsApp Business API (Meta)',
        status: process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID ? 'configured' : 'missing',
        required: false,
        prioridade: 1,
        usadoEm: 'Esteira Fiscal (relatório por WhatsApp), atendimento IA, lembretes de cobrança',
        helps: [
          'Envio automático de lembretes de obrigações ao cliente',
          'Chat oficial com cliente (não risco de banimento como WhatsApp pessoal)',
          'Templates aprovados de comunicação',
        ],
        signupUrl: 'https://business.facebook.com',
        setupSteps: [
          'Crie Meta Business Manager em business.facebook.com (gratuito).',
          'Em "WhatsApp Manager", adicione um número de telefone exclusivo do escritório.',
          'Aguarde verificação Meta (1-7 dias).',
          'Após aprovado: System Users → New → role "Admin".',
          'Gere Permanent Token com permissões whatsapp_business_messaging + whatsapp_business_management.',
          'Anote o Token e o Phone Number ID.',
          'No Railway, adicione: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_VERIFY_TOKEN.',
          'Configure webhook em https://developers.facebook.com → seu app → Webhooks → URL: BACKEND_URL/api/v1/whatsapp/webhook.',
        ],
      },
      {
        key: 'pluggy',
        name: 'Pluggy (Open Finance — conciliação bancária)',
        status: process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET ? 'configured' : 'missing',
        required: false,
        prioridade: 3,
        usadoEm: 'Conciliação bancária automática (/banking)',
        helps: [
          'Conecta extratos automaticamente de 50+ bancos brasileiros',
          'Conciliação inteligente entre vendas, NF-e e crédito bancário',
          'Dashboard de saúde financeira por cliente',
        ],
        signupUrl: 'https://pluggy.ai',
        setupSteps: [
          'Crie conta em pluggy.ai (free tier permite testar com 5 contas).',
          'Em Dashboard → API Credentials, copie Client ID e Client Secret.',
          'No Railway: PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET.',
          'O cliente final faz o consentimento Open Finance via Pluggy Connect Widget.',
          'A partir daí extratos sincronizam automaticamente.',
        ],
      },
      {
        key: 'storage',
        name: 'Cloudflare R2 / Backblaze B2 (Storage de arquivos)',
        status: process.env.STORAGE_BUCKET && process.env.STORAGE_ACCESS_KEY ? 'configured' : 'missing',
        required: false,
        prioridade: 3,
        usadoEm: 'Guarda legal de XMLs/PDFs (retenção 5 anos RFB)',
        helps: [
          'Guarda XMLs/PDFs originais (não pode depender só de volume Railway por lei)',
          'Backup criptografado',
          'Retenção legal de 5 anos exigida pela RFB',
        ],
        signupUrl: 'https://www.cloudflare.com/products/r2/',
        setupSteps: [
          'Cloudflare R2 (recomendado por sem egress fee): cloudflare.com/products/r2 → crie bucket.',
          'Em R2 → Manage R2 API Tokens → Create API Token → Object Read & Write.',
          'Copie Access Key ID, Secret Access Key e Endpoint URL.',
          'No Railway: STORAGE_BUCKET, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY, STORAGE_ENDPOINT.',
          'Custo: ~US$ 0.015/GB armazenado, US$ 0 de saída.',
        ],
      },
      {
        key: 'email',
        name: 'Resend ou AWS SES (E-mail transacional)',
        status: process.env.RESEND_API_KEY || process.env.SES_REGION ? 'configured' : 'missing',
        required: false,
        prioridade: 1,
        usadoEm: 'Esteira Fiscal (relatório ao cliente), lembretes de obrigações, alertas',
        helps: [
          'Lembretes automáticos D-7/D-3/D-1 de obrigações fiscais',
          'Alertas de certificado vencendo',
          'Relatórios mensais ao cliente',
        ],
        signupUrl: 'https://resend.com',
        setupSteps: [
          'Resend (recomendado): resend.com → crie conta, free tier permite 3000 e-mails/mês.',
          'Verifique seu domínio (adiciona DNS records SPF/DKIM).',
          'API Keys → Create.',
          'No Railway: RESEND_API_KEY.',
          'Custo após free tier: US$ 20/mês para 50k e-mails.',
        ],
      },
      {
        key: 'cert_a1',
        name: 'Certificado Digital A1 (ICP-Brasil)',
        status: 'missing', // sempre marcado missing, é gerenciado por empresa
        required: true,
        prioridade: 2,
        usadoEm: 'Emissão NF-e/NFS-e, eSocial, DCTFWeb, EFD-REINF, e-CAC (por cliente)',
        helps: [
          'OBRIGATÓRIO para emitir NF-e/NFS-e em nome do cliente',
          'Necessário para transmissão eSocial, DCTFWeb, EFD-REINF',
          'Permite consulta autenticada no e-CAC',
        ],
        signupUrl: 'https://www.soluti.com.br',
        setupSteps: [
          'Compre A1 PJ em Soluti, Certisign, Serasa ou similar (R$ 220-400/ano por CNPJ).',
          'Faça validação por videoconferência (mesmo dia).',
          'Baixe o arquivo .pfx + anote a senha.',
          'No NexaContábil, em Empresas → certificado digital, faça upload do .pfx + senha.',
          'O sistema armazena criptografado AES-256-GCM no banco.',
        ],
      },
    ];

    integrations.sort((a, b) => a.prioridade - b.prioridade);

    const summary = {
      total: integrations.length,
      configured: integrations.filter((i) => i.status === 'configured').length,
      missing: integrations.filter((i) => i.status === 'missing').length,
    };

    return { integrations, summary };
  }
}
