# Manual de uso — NexaContábil

Guia operacional dos novos módulos. Todos os endpoints HTTP usam o prefixo `/api/v1`. Para autenticação, envie `Authorization: Bearer <jwt>`. As respostas são JSON.

URLs públicas:
- **Backend API**: `https://backend-production-9eeec.up.railway.app/api/v1`
- **Frontend**: `https://frontend-production-2825.up.railway.app`
- **GraphQL playground**: `https://backend-production-9eeec.up.railway.app/graphql`

---

## 1. Onboarding de um novo escritório/empresa

### 1.1 Criar a empresa

Via frontend: `/companies` → "Nova empresa". Informar CNPJ, regime tributário (`SIMPLES_NACIONAL`, `MEI`, `LUCRO_PRESUMIDO`, `LUCRO_REAL`), endereço, IE, IM, CNAE.

### 1.2 Popular o plano de contas padrão

Após criar a empresa, popule o plano de contas:

```bash
curl -X POST https://backend-production-9eeec.up.railway.app/api/v1/chart-accounts/seed-pcasp \
  -H "Content-Type: application/json" \
  -d '{"companyId":"<COMPANY_ID>"}'
```

Resposta esperada:
```json
{ "seeded": true, "count": 85 }
```

Para visualizar a árvore:
```bash
curl "https://backend-production-9eeec.up.railway.app/api/v1/chart-accounts/tree?companyId=<COMPANY_ID>"
```

### 1.3 Gerar o calendário fiscal do ano

```bash
curl -X POST https://backend-production-9eeec.up.railway.app/api/v1/fiscal-calendar/generate \
  -H "Content-Type: application/json" \
  -d '{"companyId":"<COMPANY_ID>","ano":2026}'
```

Resposta:
```json
{ "generated": 36 }
```

Quantidades aproximadas por regime:
- MEI: 12 DAS + 12 FGTS + 12 eSocial + 1 DASN-SIMEI = **37**
- Simples Nacional: 12 DAS + 12 FGTS + 12 eSocial + 1 DEFIS = **37**
- Lucro Presumido: 12 PIS + 12 COFINS + 12 ICMS + 12 DCTFWeb + 12 EFD-REINF + 12 FGTS + 12 eSocial + 4 IRPJ + 4 CSLL + 1 ECD + 1 ECF = **94**
- Lucro Real: igual ao Presumido + ECD/ECF = **94**

### 1.4 Listar obrigações próximas

Dashboard "o que vence nos próximos 30 dias":
```bash
curl "https://backend-production-9eeec.up.railway.app/api/v1/fiscal-calendar/upcoming?companyId=<COMPANY_ID>&days=30"
```

### 1.5 Marcar obrigação como paga

```bash
curl -X POST https://backend-production-9eeec.up.railway.app/api/v1/fiscal-calendar/<ITEM_ID>/pagar \
  -H "Content-Type: application/json" \
  -d '{"valorPago": 1284.50, "comprovanteUrl": "s3://bucket/comp.pdf"}'
```

### 1.6 Marcar vencidos (cron diário recomendado)

```bash
curl -X POST https://backend-production-9eeec.up.railway.app/api/v1/fiscal-calendar/mark-overdue
```

Configure como Railway Cron (recomendado) rodando 1x/dia às 06:00 BRT.

---

## 2. Demonstrações financeiras

### 2.1 DFC (Demonstração do Fluxo de Caixa)

#### Manual (controle total):

```bash
curl -X POST https://backend-production-9eeec.up.railway.app/api/v1/financial-statements/dfc \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": "<COMPANY_ID>",
    "periodoInicio": "2026-01-01",
    "periodoFim": "2026-12-31",
    "metodo": "indireto",
    "rubricas": {
      "operacionais": [
        { "descricao": "Resultado liquido do exercicio", "valor": 250000 },
        { "descricao": "Depreciacoes", "valor": 18000 },
        { "descricao": "Variacao em clientes", "valor": -32000 },
        { "descricao": "Variacao em fornecedores", "valor": 8000 }
      ],
      "investimento": [
        { "descricao": "Aquisicao de imobilizado", "valor": -45000 }
      ],
      "financiamento": [
        { "descricao": "Distribuicao de dividendos", "valor": -80000 }
      ],
      "saldoInicial": 120000,
      "saldoFinal": 239000
    }
  }'
```

#### Automático (a partir de lançamentos contábeis):

```bash
curl -X POST https://backend-production-9eeec.up.railway.app/api/v1/financial-statements/dfc/auto \
  -H "Content-Type: application/json" \
  -d '{"companyId":"<COMPANY_ID>","periodoInicio":"2026-01-01","periodoFim":"2026-12-31","metodo":"indireto"}'
```

> O modo automático usa as Transactions aprovadas como proxy. Use o manual para entregas oficiais.

### 2.2 DMPL (Mutações do Patrimônio Líquido)

```bash
curl -X POST https://backend-production-9eeec.up.railway.app/api/v1/financial-statements/dmpl \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": "<COMPANY_ID>",
    "exercicio": 2026,
    "capitalSocial": 1000000,
    "reservasLucros": 220000,
    "lucrosAcumulados": 85000,
    "linhas": [
      { "descricao": "Saldo em 31/12/2025", "capitalSocial": 1000000, "reservasLucros": 180000, "lucrosAcumulados": 0 },
      { "descricao": "Lucro liquido do exercicio", "lucrosAcumulados": 250000 },
      { "descricao": "Constituicao reserva legal", "reservasLucros": 40000, "lucrosAcumulados": -40000 },
      { "descricao": "Dividendos", "lucrosAcumulados": -125000 },
      { "descricao": "Saldo em 31/12/2026", "capitalSocial": 1000000, "reservasLucros": 220000, "lucrosAcumulados": 85000 }
    ]
  }'
```

---

## 3. Centros de custo

Criar:
```bash
curl -X POST https://backend-production-9eeec.up.railway.app/api/v1/cost-centers \
  -H "Content-Type: application/json" \
  -d '{"companyId":"<COMPANY_ID>","codigo":"01","nome":"Administracao","responsavel":"Maria Silva"}'
```

Listar:
```bash
curl "https://backend-production-9eeec.up.railway.app/api/v1/cost-centers?companyId=<COMPANY_ID>"
```

---

## 4. Segurança

### 4.1 Habilitar 2FA TOTP para um usuário

Passo 1 — Iniciar enrollment (gera secret + URL para QR Code):

```bash
curl -X POST https://backend-production-9eeec.up.railway.app/api/v1/two-factor/start \
  -H "Content-Type: application/json" \
  -d '{"userId":"<USER_ID>","issuer":"NexaContabil"}'
```

Resposta:
```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "otpauth": "otpauth://totp/NexaContabil%3Auser%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=NexaContabil&algorithm=SHA1&digits=6&period=30"
}
```

O frontend deve renderizar a `otpauth` URL como QR Code (use `qrcode` lib). Apps compatíveis:
- Google Authenticator (iOS/Android)
- Microsoft Authenticator
- Authy
- 1Password
- Bitwarden

Passo 2 — Confirmar com o primeiro código de 6 dígitos:

```bash
curl -X POST https://backend-production-9eeec.up.railway.app/api/v1/two-factor/enable \
  -H "Content-Type: application/json" \
  -d '{"userId":"<USER_ID>","code":"123456"}'
```

Após enabled, o login passa a exigir o código TOTP.

### 4.2 Verificar TOTP no login

```bash
curl -X POST https://backend-production-9eeec.up.railway.app/api/v1/two-factor/verify \
  -H "Content-Type: application/json" \
  -d '{"userId":"<USER_ID>","code":"654321"}'
```

Resposta:
```json
{ "valid": true }
```

### 4.3 RBAC nos endpoints (para devs)

No NestJS, proteja com `@Roles()`:

```ts
import { UseGuards } from '@nestjs/common';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('owner', 'contador')
@Delete(':id')
delete(@Param('id') id: string) { ... }
```

Roles disponíveis:
- `owner` — dono do escritório, vê tudo
- `contador` — contador responsável, vê tudo dos clientes atribuídos
- `assistente` — vê e edita apenas módulos liberados
- `cliente` — vê apenas seus próprios dados via portal

---

## 5. LGPD — Atendimento ao titular

### 5.1 Receber uma requisição (vinda do site, e-mail ou formulário)

```bash
curl -X POST https://backend-production-9eeec.up.railway.app/api/v1/lgpd/requests \
  -H "Content-Type: application/json" \
  -d '{"userEmail":"titular@example.com","tipo":"export","motivo":"Pedido do titular conforme LGPD art. 18 II"}'
```

### 5.2 Listar requisições pendentes (DPO)

```bash
curl "https://backend-production-9eeec.up.railway.app/api/v1/lgpd/requests?status=recebida"
```

### 5.3 Atender export

```bash
curl -X POST https://backend-production-9eeec.up.railway.app/api/v1/lgpd/requests/<ID>/execute-export
```

Resposta inclui `arquivoUrl` (data URL com JSON portável). Enviar ao titular.

### 5.4 Atender delete (anonimização com retenção fiscal)

```bash
curl -X POST https://backend-production-9eeec.up.railway.app/api/v1/lgpd/requests/<ID>/execute-delete \
  -H "Content-Type: application/json" \
  -d '{"legalBasis":"Anonimizacao parcial; dados contabeis retidos por 5 anos conforme art. 173 CTN."}'
```

### 5.5 Rejeitar (quando há base legal)

```bash
curl -X POST https://backend-production-9eeec.up.railway.app/api/v1/lgpd/requests/<ID>/reject \
  -H "Content-Type: application/json" \
  -d '{"motivo":"Solicitacao indeferida — dados fiscais sob obrigacao legal de retencao por 5 anos (IN RFB)."}'
```

> **Importante:** A LGPD reconhece a exceção quando há obrigação legal (art. 7º II e III + art. 16 II). Sempre cite a base legal em caso de rejeição.

---

## 6. Operação e monitoramento

### 6.1 Healthcheck

```bash
curl https://backend-production-9eeec.up.railway.app/health
```

Resposta saudável:
```json
{
  "status": "ok",
  "db": "ok",
  "uptime": 1284,
  "latencyMs": 12,
  "env": "production",
  "version": "a53a2030"
}
```

Resposta degradada (DB fora):
```json
{ "status": "degraded", "db": "error", ... }
```

Configure no monitoring (UptimeRobot, Better Stack etc) com alerta quando `status != ok`.

### 6.2 Backup do Postgres

O volume é persistente no Railway, mas para conformidade fiscal (5 anos) configure backup externo:

```bash
# Exemplo: dump diario para S3
docker run --rm -e PGPASSWORD=$PGPASSWORD postgres:16 \
  pg_dump -h $PGHOST -U postgres -d railway -F c \
  | aws s3 cp - s3://nexacontabil-backups/$(date +%Y-%m-%d).dump
```

Recomendado: cron diário às 03:00 BRT, retenção mensal por 6 anos.

### 6.3 Logs em produção

```bash
railway logs --service backend
railway logs --service frontend
```

---

## 7. Fluxo típico mensal do contador

1. **Dia 1 do mês**: `GET /fiscal-calendar/upcoming?days=30` para ver tudo que vence
2. **Diariamente**: dashboard mostra obrigações por status
3. **Ao realizar pagamento**: `POST /fiscal-calendar/:id/pagar` com comprovante
4. **Diariamente às 06:00 (cron)**: `POST /fiscal-calendar/mark-overdue` para marcar atrasados
5. **Encerramento mensal**:
   - Lançar Transactions do mês
   - Gerar DFC do mês: `POST /financial-statements/dfc/auto`
   - Conferir contra Balanço/DRE existentes
6. **Encerramento anual**:
   - Atualizar DMPL: `POST /financial-statements/dmpl`
   - Gerar SPED (módulo já existente)
   - Gerar `fiscal-calendar` do próximo ano: `POST /fiscal-calendar/generate { ano: <ano+1> }`

---

## 8. Solução de problemas comuns

| Sintoma | Causa provável | Resolução |
|---|---|---|
| `/health` retorna `db: error` | Postgres fora do ar ou DATABASE_URL inválida | Verificar `railway service Postgres` + variáveis |
| Backend retorna 502 | Container caiu | `railway logs --service backend` para ver stack |
| `seed-pcasp` retorna `seeded: false` | Empresa já tem plano de contas | Esperado; usar PATCH para alterar contas existentes |
| TOTP código rejeitado | Drift > 90s | Sincronizar relógio do dispositivo (NTP) |
| `mark-overdue` atualiza poucos itens | Já foi rodado hoje ou items já fora dos status `pendente/em_apuracao/apurada` | Comportamento esperado, idempotente |

---

## 9. Glossário

- **PCASP**: Plano de Contas Aplicado ao Setor Público (referência também para iniciativa privada via SPED Contábil)
- **SPED**: Sistema Público de Escrituração Digital (federal)
- **ECD**: Escrituração Contábil Digital (anual, módulo SPED)
- **ECF**: Escrituração Contábil Fiscal (anual, IRPJ/CSLL)
- **DCTFWeb**: Declaração de Débitos e Créditos Tributários Federais Web (mensal)
- **EFD-REINF**: Escrituração Fiscal Digital de Retenções e Informações Fiscais
- **DAS**: Documento de Arrecadação do Simples Nacional
- **DEFIS**: Declaração de Informações Socioeconômicas e Fiscais (Simples, anual)
- **DASN-SIMEI**: Declaração Anual do Simples Nacional para o MEI
- **DFC**: Demonstração do Fluxo de Caixa
- **DMPL**: Demonstração das Mutações do Patrimônio Líquido
- **TOTP**: Time-based One-Time Password (RFC 6238)
- **LGPD**: Lei Geral de Proteção de Dados (Lei 13.709/2018)
