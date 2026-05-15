# Checklist de implantação amanhã no escritório Sandro Domo

## Antes de sair de casa

- [ ] Verifique que `/health` retorna `ok`: https://backend-production-9eeec.up.railway.app/health
- [ ] Confirme que o frontend abre: https://frontend-production-2825.up.railway.app
- [ ] Pegue: notebook + cabo HDMI/USB-C + carregador
- [ ] Pegue o pendrive com backup do A1 do Sandro (caso ele queira usar o dele para testes)

## O que pedir ao Sandro ao chegar

1. **CSV ou lista** com clientes ativos: CNPJ, Razão Social, Regime Tributário, E-mail principal
2. **Quantos usuários** vão usar o sistema (você falou 5) — me passa nome, e-mail e função (contador/assistente)
3. **Endereço completo do escritório** (para cabeçalho dos relatórios)
4. **Logo do escritório** (PNG/SVG, idealmente fundo transparente)
5. **A1 do escritório** disponível? (senha pode ficar com ele — só sobe quando ele quiser)

## Roteiro de configuração (estimativa 90 min)

### 1. Cadastrar usuários do escritório (15 min)
Use o frontend ou direto via API: `/api/v1/auth/register` para cada um. Definir roles:
- Sandro = `owner`
- Demais contadores = `contador`
- Assistentes = `assistente`

### 2. Ativar 2FA para cada usuário (15 min)
Cada um instala Google Authenticator no celular. Em **Configurações** ou via endpoint:
```bash
POST /api/v1/two-factor/start  { "userId": "..." }
# Mostra QR code, usuário escaneia, retorna código de 6 dígitos
POST /api/v1/two-factor/enable { "userId": "...", "code": "123456" }
```

### 3. Cadastrar clientes (30 min)
- Pelo frontend em **Empresas → Nova Empresa**
- Ou via script em lote (passar CSV pro Sandro me devolver e eu rodo aqui)

### 4. Para cada cliente, popular plano de contas e gerar calendário fiscal (30 min)
Pode ser feito do frontend (em desenvolvimento) ou via API:

```bash
# Plano de contas brasileiro padrão (~85 contas):
POST /api/v1/chart-accounts/seed-pcasp  { "companyId": "..." }

# Calendário fiscal do ano (gera 30-90 obrigações conforme regime):
POST /api/v1/fiscal-calendar/generate   { "companyId": "...", "ano": 2026 }
```

A página `/agenda` já tem botão **"Gerar Calendário 2026"** que faz isso pelo frontend.

## Funcionalidades-chave para mostrar ao Sandro

1. **Cmd+K** (Ctrl+K no Windows) — busca global de qualquer página
2. **Bell de notificações** — vai mostrar alertas D-7/D-3/D-1 de obrigações (em rollout)
3. **Switcher de empresa** — sidebar superior esquerdo, troca cliente em 1 clique
4. **Agenda Fiscal** — calendário e lista, com botão de gerar e marcar como paga
5. **Plano de contas** — ~85 contas brasileiras prontas
6. **DFC + DMPL** — Demonstrações que muitos sistemas não têm
7. **LGPD** — endpoints para atender requisições do titular
8. **Copilot IA** — fala com Claude

## Limitações conhecidas (alinhar com Sandro)

- **Emissão NF-e/NFS-e**: precisa configurar API key NFe.io (~R$ 50/mês). Hoje retorna stub.
- **Transmissão eSocial real**: precisa do A1 do cliente OU procuração e-CAC do Sandro.
- **CNAB / PIX**: precisa convênio bancário (recomendo Banco Inter API).
- **WhatsApp**: precisa verificação Meta Business (1-7 dias).
- **Dados de algumas páginas** ainda em modo demonstração: `fiscal`, `folha`, `banking`, `relatorios/balanco`,
  `relatorios/dre`, `saude-fiscal`, `cashflow`. A `/agenda` já está conectada ao backend real.

## Após a visita

- Implementar conexão real das demais páginas (fiscal, folha, banking) — 2-3 dias
- Configurar Resend para envio de e-mails de lembrete
- Configurar Cloudflare R2 para upload de XMLs e comprovantes
- Configurar Anthropic API key real para o Copilot
- Configurar backup automático do Postgres em Backblaze B2

## URLs importantes

- App: https://frontend-production-2825.up.railway.app
- API: https://backend-production-9eeec.up.railway.app
- Health: https://backend-production-9eeec.up.railway.app/health
- GraphQL: https://backend-production-9eeec.up.railway.app/graphql
- Railway Dashboard: https://railway.com/project/13950cf7-4eb4-481c-9496-d8cb64fdced6
- GitHub: https://github.com/glauterw-bit/nexacontabil

## Plano B se algo der errado

- Se o frontend não abrir: rodar `railway logs --service frontend` para ver erro
- Se o backend retornar 502: rodar `railway logs --service backend`
- Se o Postgres falhar: o volume é persistente, não há perda de dados — reiniciar via dashboard
- Backup local do que estiver fazendo durante a reunião (screenshots de telas-chave)
- Você sempre pode voltar pro último deploy estável via dashboard Railway → Deployments → Rollback
