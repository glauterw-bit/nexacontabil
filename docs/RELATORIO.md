# Relatório técnico — NexaContábil

**Data:** 2026-05-14
**Versão:** após commit `a53a203` (e documentação posterior)
**Ambiente:** produção em Railway (`nexacontabil` project, projeto-id `13950cf7-4eb4-481c-9496-d8cb64fdced6`)

---

## 1. Estado anterior (antes desta sessão)

O sistema tinha **45 models Prisma, 42 módulos NestJS, 42 rotas Next.js**, mas:

- `DATABASE_URL = file:./prod.db` (SQLite em filesystem efêmero do container) — **dados se perdiam a cada deploy**.
- Backend retornando 502 após Prisma generate; Nest nem iniciava (sem error handlers de bootstrap).
- Frontend retornando "Cannot resolve `@/contexts/CompanyContext`" no build do Nixpacks, mesmo com o arquivo existindo.
- Sem health endpoint para monitoring.
- RBAC só com string genérica `role`.
- Sem 2FA.
- Sem calendário fiscal automatizado.
- Plano de contas não-customizável.
- Sem DFC e DMPL.
- Sem endpoints LGPD para titular de dados.

---

## 2. O que foi entregue nesta rodada

### 2.1 Infraestrutura

| Antes | Depois |
|---|---|
| SQLite efêmero | **PostgreSQL 16** com volume persistente (`/var/lib/postgresql/data`) |
| Backend NIXPACKS | **Dockerfile multistage** node:20-alpine |
| Sem healthcheck | `/health` retornando `{ status, db, uptime, latencyMs, env, version }` |
| Dockerfile com `echo '[start]...'` para debug | `CMD` final limpo |
| Sem `.gitignore` no backend | Adicionado, e `prod.db` removido do histórico |
| `app.listen(port)` localhost-only | `app.listen(port, '0.0.0.0')` + uncaughtException/unhandledRejection handlers |
| Frontend Nixpacks com cache de erro | Frontend com Dockerfile `output: standalone` |

### 2.2 Camada contábil

| Recurso | Implementação |
|---|---|
| **Plano de contas hierárquico** | `ChartAccount` (4 graus, código único por empresa, devedora/credora, SPED-code opcional). CRUD + tree + `seed-pcasp` com ~85 contas brasileiras padrão (Ativo, Passivo, PL, Receitas, Despesas, Apuração do Resultado). |
| **Centros de custo** | `CostCenter` hierárquico, ativo/inativo, responsável. |
| **DFC (Fluxo de Caixa)** | `CashFlowStatement` direto/indireto com totalizadores FCO/FCI/FCF, geração manual e automática a partir de `Transaction` aprovadas. |
| **DMPL** | `EquityMutationStatement` por exercício, com colunas (capital social, reservas de capital, reservas de lucros, ações em tesouraria, lucros acumulados, ajustes de avaliação, outros) e linhas detalhadas (movimentos). |

### 2.3 Compliance & operação

| Recurso | Implementação |
|---|---|
| **Calendário fiscal automático** | `FiscalCalendarItem` + gerador anual por regime tributário. Gera DAS / DARF / FGTS / eSocial / DCTFWeb / EFD-REINF / ECD / ECF / DEFIS / DASN-SIMEI / IRPJ / CSLL conforme o regime da empresa. Status, prioridade, responsável, anexo de comprovante. Endpoint `mark-overdue` para batch diário. |
| **2FA TOTP** | `TwoFactorService` puro em Node crypto (sem deps externas), conforme RFC 6238. Compatível com Google Authenticator, Authy, 1Password, Microsoft Authenticator, Bitwarden. Tolerância de drift de ±90 s. |
| **RBAC granular** | `@Roles('owner', 'contador', 'assistente', 'cliente')` + `RolesGuard` pronto para uso em handlers. |
| **LGPD art. 18** | `DataSubjectRequest` cobrindo export, delete, rectify, object. Export gera JSON portável (base64 data URL). Delete faz anonimização preservando registros contábeis (retenção 5 anos, art. 173 CTN). |
| **User enriquecido** | `totpSecret`, `totpEnabled`, `totpVerifiedAt`, `lastLoginAt`, `lastLoginIp`, `permissions` (JSON granular para overrides). |

### 2.4 URLs públicas verificadas

- **Backend**: `https://backend-production-9eeec.up.railway.app` — HTTP 200
- **Frontend**: `https://frontend-production-2825.up.railway.app` — HTTP 200
- **Health**: `https://backend-production-9eeec.up.railway.app/health` — `{ "status": "ok", "db": "ok", "uptime": 116, "latencyMs": 10, "env": "production", "version": "69c3d042" }`
- **GraphQL**: `https://backend-production-9eeec.up.railway.app/graphql` — Apollo respondendo

### 2.5 Resumo numérico do incremento

| Categoria | Antes | Depois | Δ |
|---|---|---|---|
| Models Prisma | 45 | **52** | +7 |
| Módulos NestJS | 42 | **48** | +6 |
| Endpoints REST novos | — | **~25** | — |
| Linhas de código adicionadas | — | ~1100 | — |
| Bloqueadores resolvidos | — | 4 (Postgres + Dockerfile + health + boot bind 0.0.0.0) | — |

---

## 3. Endpoints REST adicionados

### Saúde
```
GET  /health
```

### Plano de contas
```
GET    /api/v1/chart-accounts?companyId={id}&tipo={t}
GET    /api/v1/chart-accounts/tree?companyId={id}
POST   /api/v1/chart-accounts
PATCH  /api/v1/chart-accounts/:id
DELETE /api/v1/chart-accounts/:id
POST   /api/v1/chart-accounts/seed-pcasp      # popula ~85 contas brasileiras
```

### Centros de custo
```
GET    /api/v1/cost-centers?companyId={id}
POST   /api/v1/cost-centers
PATCH  /api/v1/cost-centers/:id
DELETE /api/v1/cost-centers/:id
```

### Calendário fiscal
```
GET    /api/v1/fiscal-calendar?companyId={id}&status={s}&from={iso}&to={iso}
GET    /api/v1/fiscal-calendar/upcoming?companyId={id}&days=30
POST   /api/v1/fiscal-calendar                 # cria obrigação manual
PATCH  /api/v1/fiscal-calendar/:id
POST   /api/v1/fiscal-calendar/:id/pagar       # body: { valorPago, comprovanteUrl }
POST   /api/v1/fiscal-calendar/generate        # body: { companyId, ano }
POST   /api/v1/fiscal-calendar/mark-overdue    # batch para chamar em cron
```

### Demonstrações
```
POST   /api/v1/financial-statements/dfc        # cria DFC manual
POST   /api/v1/financial-statements/dfc/auto   # gera DFC automaticamente
GET    /api/v1/financial-statements/dfc?companyId={id}
GET    /api/v1/financial-statements/dfc/:id
POST   /api/v1/financial-statements/dmpl       # upsert por (companyId, exercicio)
GET    /api/v1/financial-statements/dmpl?companyId={id}
```

### LGPD
```
POST   /api/v1/lgpd/requests
GET    /api/v1/lgpd/requests?status={s}
POST   /api/v1/lgpd/requests/:id/execute-export
POST   /api/v1/lgpd/requests/:id/execute-delete
POST   /api/v1/lgpd/requests/:id/reject        # body: { motivo }
```

### 2FA
```
POST   /api/v1/two-factor/start                # body: { userId }      -> { secret, otpauth }
POST   /api/v1/two-factor/enable               # body: { userId, code }
POST   /api/v1/two-factor/disable              # body: { userId, code }
POST   /api/v1/two-factor/verify               # body: { userId, code }
```

---

## 4. O que **ficou pendente** (precisa de credenciais externas ou homologação)

Esses gaps não dependem de código adicional do lado de cá — dependem de credenciais que só o cliente pode obter:

| Item | Pré-requisito | Esforço de implementação |
|---|---|---|
| Transmissão DCTFWeb / EFD-REINF / eSocial S-1200 | Certificado digital A1 homologado + ambiente SEFAZ/RFB | 3 semanas após credencial |
| Emissão NFC-e / MDF-e / CT-e | Certificado A1 + homologação SEFAZ estadual | 2-3 semanas por documento |
| CNAB 240 (Itaú, Bradesco, BB, CEF) | Convênio bancário + agência de cobrança | 1-2 semanas por banco |
| PIX cobrança dinâmica | PSP (Sicoob, Itaú, Inter, Banco Inter API) | 2 semanas |
| Open Finance | Conta Pluggy ou Belvo | 1-2 semanas |
| WhatsApp Business | Conta Twilio ou Evolution + verificação Meta | 1 semana |
| App mobile | Apenas decisão de produto | 6-8 semanas |
| Conciliação adquirentes (Stone, Cielo, Rede) | API key de cada adquirente | 1 semana cada |

---

## 5. Riscos remanescentes e mitigações

| Risco | Mitigação aplicada agora | Próximo passo |
|---|---|---|
| **Performance com muitos clientes** | Postgres + connection pooling do Prisma | Adicionar Redis para cache do dashboard, jobs em queue (BullMQ) |
| **Multi-tenant** | Todos os models têm `companyId` indexado | Adicionar middleware Prisma para filtro automático por companyId do JWT |
| **Reforma Tributária (CBS/IBS 2026-2033)** | Schema preparado para coexistir | Implementar `taxRegime` versionado e simulador CBS/IBS quando legislação madurar |
| **Auditoria de mudanças** | `AuditTrail` model existe (hash-chain imutável) | Aplicar interceptor em todas as mutações sensíveis |
| **Backup do Postgres** | Volume persistente Railway | Configurar `pg_dump` automatizado em S3/B2 (recomendado: cron diário) |

---

## 6. Próximos passos sugeridos por ordem de impacto

1. **Adicionar Redis** ao projeto Railway e usar para cache do dashboard + sessões.
2. **Popular plano de contas da empresa-piloto** via `POST /chart-accounts/seed-pcasp`.
3. **Gerar calendário fiscal do ano corrente** via `POST /fiscal-calendar/generate`.
4. **Habilitar 2FA obrigatório para role `contador` e `owner`** (infra pronta, falta exigir no login).
5. Configurar **cron diário** chamando `POST /fiscal-calendar/mark-overdue` (Railway Cron ou GitHub Actions).
6. **Backup automatizado do Postgres** (5 anos é exigência legal — não pode depender só do volume Railway).
7. **Obter certificado digital A1 PFX** da empresa-piloto para destravar DCTFWeb, EFD-REINF, eSocial S-1200.
8. **Adicionar middleware multi-tenant** que injeta `companyId` do JWT em todas as queries.

---

## 7. Commits desta rodada

```
58744e3  feat(infra): Postgres + healthcheck + Dockerfile limpo (Fase 1+2)
a7bd929  feat: plano de contas + calendario fiscal + DFC/DMPL + LGPD + 2FA + RBAC
a53a203  chore: gitignore + remove prod.db do controle de versao
```

Histórico anterior (sessões prévias que destravaram o deploy):

```
b41810b  fix(deploy): backend usa DOCKERFILE em vez de NIXPACKS
4be9328  debug: instrumenta CMD para descobrir onde o backend trava silencioso
7fce8f1  fix(deploy): logar erros no boot do backend + Dockerfile dedicado pro frontend
c6e52de  fix(deploy): prisma binaryTargets para alpine + baseUrl no tsconfig do frontend
```

---

## 8. Verificação final em produção

Endpoints validados em `https://backend-production-9eeec.up.railway.app`:

```
GET /health
{ "status": "ok", "db": "ok", "uptime": 116, "latencyMs": 10, "env": "production", "version": "69c3d042" }

GET /api/v1/chart-accounts/tree?companyId=missing
[]

GET /api/v1/fiscal-calendar/upcoming?companyId=missing
[]

GET /api/v1/lgpd/requests
[]
```

Todos respondem com Postgres real, sem 502, e em latência < 30 ms.
