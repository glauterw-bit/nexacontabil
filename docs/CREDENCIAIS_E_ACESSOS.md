# Credenciais e acessos do sistema

⚠️ **Este documento não deve conter secrets em texto puro.** Use somente referências (onde achar).

---

## 1. Railway (deploys e banco)

| Item | Como acessar |
|---|---|
| Painel | https://railway.com/project/13950cf7-4eb4-481c-9496-d8cb64fdced6 |
| CLI logado como | `glauterw@gmail.com` |
| Token CLI (refresh automático) | `~/.railway/config.json` (campo `user.accessToken`) |
| Senha do Postgres | Variável `PGPASSWORD` em https://railway.com/project/13950cf7.../service/3d4bd9e8-e266-4b06-b2e3-4e68dcbe81f2/variables |
| `DATABASE_URL` interna | `${{ Postgres.DATABASE_URL }}` (já configurado no backend) |
| `DATABASE_PUBLIC_URL` externa | Variável do serviço Postgres — use **somente** em GitHub Actions secret `DATABASE_PUBLIC_URL` |

**Como pegar a senha do Postgres se precisar:**
```bash
# Via CLI logado:
cd /tmp && rm -rf pgcreds && mkdir pgcreds && cd pgcreds
railway link --project nexacontabil
railway variables --service Postgres | grep PGPASSWORD
```

Ou via dashboard → Postgres → Variables → ícone do olho ao lado de `PGPASSWORD`.

---

## 2. Backend API

| Item | Valor |
|---|---|
| URL pública | https://backend-production-9eeec.up.railway.app |
| Health | /health (sem auth) |
| GraphQL | /graphql |
| REST namespace | /api/v1/* |
| `JWT_SECRET` | Variável env do serviço backend — não anote em lugar nenhum, gere novo se vazar |
| `APP_SECRET` | Mesmo |
| `JWT_EXPIRES_IN` | `7d` (7 dias) |

**Como rotacionar JWT_SECRET em emergência:**
1. Railway → serviço backend → Variables → editar `JWT_SECRET` (gerar `openssl rand -hex 32`)
2. Salvar — backend reinicia automaticamente
3. Todos os usuários precisam logar de novo (esperado)

---

## 3. Frontend

| Item | Valor |
|---|---|
| URL pública | https://frontend-production-2825.up.railway.app |
| `NEXT_PUBLIC_API_URL` | Já aponta para o backend via referência Railway |

---

## 4. GitHub

| Item | Onde |
|---|---|
| Repositório | https://github.com/glauterw-bit/nexacontabil |
| Branch principal | `master` |
| Secrets necessários | `DATABASE_PUBLIC_URL` (para backup workflow) — Settings → Secrets → Actions → New repository secret |
| GitHub App Railway | Verificar em https://github.com/settings/installations → Railway → "Save" |

---

## 5. Conta demo para apresentação

| Item | Valor |
|---|---|
| E-mail | `demo.sandro@nexacontabil.local` |
| Senha | **`/tmp/nexa-creds/demo-account.txt`** (apenas local, não commitado) |
| User ID | `3f83cc1c-75e1-4586-87d2-f41e220c1d3a` |
| Role | `admin` |
| Empresa cadastrada | `Padaria Pao Quente Ltda (demo)` — `48674c79-be24-4f26-a7fb-fe4246898eab` |
| Plano de contas | 95 contas (PCASP seedado) |
| Calendário fiscal 2026 | 37 obrigações geradas (regime Simples Nacional) |

**Deletar conta demo após apresentação:**
```sql
-- via Railway → Postgres → Database → Query
DELETE FROM users WHERE email = 'demo.sandro@nexacontabil.local';
DELETE FROM companies WHERE id = '48674c79-be24-4f26-a7fb-fe4246898eab';
-- (cascade limpa chart_accounts, fiscal_calendar_items, etc.)
```

---

## 6. Anthropic Claude (IA)

| Item | Onde |
|---|---|
| Console | https://console.anthropic.com |
| Conta | (você gerencia separadamente) |
| `ANTHROPIC_API_KEY` | Adicionar no Railway → backend → Variables quando obtiver |
| Sem essa key | Módulos `ai`, `executive-reports` retornam stubs |

---

## 7. NFe.io

| Item | Onde |
|---|---|
| Console | https://nfe.io |
| `NFEIO_API_KEY` | Adicionar no Railway → backend → Variables |
| `NFEIO_COMPANY_ID` | ID da empresa do Sandro no NFe.io |
| Sem essas keys | Módulos `nfe`, `nfse` retornam stubs |

---

## 8. Onde NÃO procurar senhas

- ❌ Repositório Git (nada commitado)
- ❌ `.env` no projeto (não tem `.env` versionado)
- ❌ Logs do Railway (não imprimimos senhas)

## 9. Procedimento se você suspeitar de vazamento

1. **Rotacione** `JWT_SECRET`, `APP_SECRET` no Railway
2. **Force logout** de todos os usuários — JWT antigo deixa de ser aceito
3. **Verifique audit trail**: `SELECT * FROM audit_trails ORDER BY createdAt DESC LIMIT 100`
4. **Avise o Sandro** se houver acesso indevido aos dados dele
5. Se PFX vazou: revogue na AC emissora imediatamente
6. **LGPD**: comunique à ANPD em até 72h se houver vazamento de dados pessoais (art. 48)
