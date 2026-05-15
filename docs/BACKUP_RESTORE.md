# Backup e restauração do Postgres

## Como o backup roda

Workflow GitHub Actions: `.github/workflows/postgres-backup.yml`

- **Schedule:** diariamente às 03:00 BRT (06:00 UTC)
- **Execução manual:** Actions → "Backup Postgres" → "Run workflow"
- **Formato:** `pg_dump --format=custom --compress=9` (mais compacto que SQL plano, restauração mais rápida)
- **Destino:** GitHub Artifact com retenção de 90 dias

## Configuração inicial (uma vez)

1. Acesse https://github.com/glauterw-bit/nexacontabil/settings/secrets/actions
2. Clique em **New repository secret**
3. Crie um secret chamado **`DATABASE_PUBLIC_URL`** com o valor:
   - Obtenha em `railway variables --service Postgres` → `DATABASE_PUBLIC_URL`
   - Ou no dashboard Railway → serviço Postgres → Variables → `DATABASE_PUBLIC_URL`
   - Formato: `postgresql://postgres:<password>@<host>.proxy.rlwy.net:<port>/railway`
4. **Não use `DATABASE_URL` interno** (`postgres.railway.internal`) — GitHub Actions não tem acesso à rede interna do Railway.

## Operação mensal recomendada (retenção legal 5 anos)

Como a retenção do GitHub é de 90 dias, faça download mensal:

1. Vá em Actions → último run do "Backup Postgres"
2. Baixe o artifact (ex: `nexacontabil-2026-01-15T06-00-00Z.dump`)
3. Suba para Backblaze B2 ou AWS S3 numa pasta `nexacontabil/year=YYYY/`
4. Mantenha por **5 anos** (exigência fiscal — art. 173 CTN, IN RFB)

Script sugerido para automatizar o upload mensal (rodar no seu macOS):
```bash
gh run download -n "nexacontabil-$(date +%Y-%m-%d)*.dump"
b2 upload-file YOUR_BUCKET *.dump nexacontabil/$(date +%Y)/
rm nexacontabil-*.dump
```

## Restauração (procedimento de disaster recovery)

### Restaurar em ambiente de teste/staging

```bash
# 1. Crie um banco temporário
createdb -h <host> -U postgres nexacontabil_restore_test

# 2. Restaure o dump
pg_restore --no-owner --clean --if-exists \
  -d "postgresql://postgres:<senha>@<host>/nexacontabil_restore_test" \
  nexacontabil-2026-01-15T06-00-00Z.dump

# 3. Valide
psql ... -c "SELECT COUNT(*) FROM companies;"
```

### Restaurar em produção (apenas em emergência)

⚠️ **Coloque o backend em manutenção antes** — usuários não devem operar durante restore.

```bash
# 1. Pause o backend no Railway
railway service backend
railway service down # (ou via dashboard)

# 2. Drop+recreate do schema atual
psql "$DATABASE_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# 3. Restore
pg_restore --no-owner --clean --if-exists -d "$DATABASE_URL" backup.dump

# 4. Suba o backend de volta
railway service up

# 5. Smoke test
curl https://backend-production-9eeec.up.railway.app/health
```

## Indicadores que indicam que o backup está saudável

| Métrica | Valor saudável |
|---|---|
| Tamanho do dump | Cresce gradualmente, ~5-50 MB para um escritório de até 100 clientes no primeiro ano |
| Tempo de pg_dump | < 2 min para até 10 GB de dados |
| Falhas seguidas | 0 — qualquer falha precisa ser investigada no mesmo dia |
| Última execução | Não passar 48h sem um backup bem-sucedido |

## Alertas

Configure o GitHub para te notificar de falhas:

1. https://github.com/glauterw-bit/nexacontabil/settings/notifications
2. Marque "Actions" → "Send notifications for failed workflows only"
3. Use e-mail ou Slack/Discord webhook

Adicionalmente, recomendado:
- Better Stack monitoring no `/health` (alerta se DB cair)
- Página de status pública em statuspage.io ou cstate
