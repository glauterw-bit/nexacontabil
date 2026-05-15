# Checklist de visita — Escritório Sandro Domo (amanhã)

**Objetivo:** subir o NexaContábil para uso real do escritório (5 usuários, A1 válido já em mãos do Sandro).

URLs ao vivo:
- **App:** https://frontend-production-2825.up.railway.app
- **API:** https://backend-production-9eeec.up.railway.app
- **Health:** https://backend-production-9eeec.up.railway.app/health

---

## 1. Antes de sair de casa (hoje à noite)

- [ ] Confirmar `/health` retorna `{ status: ok, db: ok }`
- [ ] Abrir o app no celular para testar mobile (sidebar colapsa? tabela rola?)
- [ ] Tirar print da tela de login + dashboard vazio para mostrar como onboarding começa
- [ ] Confirmar que ainda tem o `.pfx` do A1 do escritório (vai pedir ao Sandro amanhã)
- [ ] Levar notebook carregado + cabo USB para token (caso A3)
- [ ] Levar pen drive com cópia de segurança do `.pfx` se o Sandro entregar
- [ ] Anotar a senha do banco do `DATABASE_URL` (caso precise restaurar)

---

## 2. Materiais para levar

- [ ] `docs/MANUAL.md` impresso ou no tablet
- [ ] `docs/RECURSOS_NECESSARIOS.md` (lista do que falta adquirir)
- [ ] Modelos de DPA LGPD + Termo de Procuração + Contrato de Prestação
- [ ] App Google Authenticator no celular (para ajudar o Sandro a configurar 2FA dele)
- [ ] Cabo HDMI (caso precise espelhar tela)

---

## 3. Roteiro de instalação no escritório (1.5 a 2h)

### Passo 1 — Acesso e cadastro de usuários (15 min)
1. Sandro acessa `https://frontend-production-2825.up.railway.app/signup`
2. Cria a conta dele com e-mail profissional do escritório
3. Você criar 4 contas adicionais (assistentes):
   - Acessar como Sandro
   - Em "Configurações" → criar usuário (ou via SQL direto se UI não tem ainda)
4. Definir roles:
   - Sandro: `owner`
   - Assistente sênior: `contador`
   - Assistentes: `assistente`
   - (se houver) cliente: `cliente`

### Passo 2 — Habilitar 2FA do Sandro (10 min)
1. No painel do Sandro: `POST /api/v1/two-factor/start` (a UI ainda usa endpoint direto)
2. Mostrar o QR code com `otpauth://` no celular Google Authenticator
3. Verificar com o código de 6 dígitos
4. Confirmar `totpEnabled = true` no perfil
5. (Recomendado) repetir para os outros 4 usuários

### Passo 3 — Upload do A1 do escritório (10 min)
1. Sandro abre o `.pfx` e fornece a senha
2. Upload via endpoint do módulo `certificado-digital`
3. Confirmar que o sistema armazena criptografado (AES-256-GCM no banco)
4. **NÃO compartilhar a senha em texto plano** — você não precisa anotar

### Passo 4 — Importar empresas-clientes (20 min)
1. Pedir ao Sandro um CSV ou planilha com clientes:
   ```
   nome,cnpj,taxRegime,email,phone
   "Empresa X","12.345.678/0001-00","SIMPLES_NACIONAL","contato@x.com",""
   ```
2. Se ele tiver pouco (~5 empresas), cadastre uma a uma via UI
3. Se tiver muitas (50+), use script via API:
   ```bash
   for cnpj in ...; do
     curl -X POST $API/companies -H "Authorization: Bearer $JWT" \
       -H "Content-Type: application/json" \
       -d '{"name":"...","cnpj":"...","taxRegime":"..."}'
   done
   ```

### Passo 5 — Para cada empresa, seedar plano de contas + calendário (5 min cada)
```bash
# Para cada companyId:
curl -X POST $API/api/v1/chart-accounts/seed-pcasp \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d "{\"companyId\":\"<ID>\"}"

curl -X POST $API/api/v1/fiscal-calendar/generate \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d "{\"companyId\":\"<ID>\",\"ano\":2026}"
```

### Passo 6 — Treinamento rápido dos 5 usuários (30 min)
Mostrar em telão:
- Como trocar de cliente (dropdown no sidebar)
- Cmd+K para buscar (mostrar atalho)
- Bell de notificações
- Dashboard com saúde fiscal
- Onde ficam as obrigações do mês (`/agenda` ou `/obrigacoes`)
- Como marcar uma obrigação como paga
- Portal do cliente (como o cliente final vê)
- Saudar 2FA (mostrar a importância — não anotar senha no caderno)

### Passo 7 — Validação ao vivo (15 min)
- Sandro escolhe um cliente real
- Faz upload de uma nota fiscal real
- Documenta tempo de cada etapa
- Anota objeções para corrigir depois

---

## 4. Coisas a coletar do Sandro durante a visita

- [ ] Confirmação que o `.pfx` do A1 está válido (data de expiração)
- [ ] Lista completa de clientes (CSV ou planilha)
- [ ] Regimes tributários de cada cliente
- [ ] Lista de UFs onde clientes operam (pra integrações SEFAZ futuras)
- [ ] Quais bancos os clientes mais usam (pra CNAB futuro)
- [ ] Se ele tem conta NFe.io / Plug Notas / eNotas hoje
- [ ] Conta de e-mail profissional do escritório (Google Workspace? Microsoft 365?)
- [ ] Telefone(s) que vão usar para WhatsApp Business futuro

---

## 5. Riscos conhecidos e mitigação

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Postgres lento com 50+ clientes | Baixa hoje, alta em 6 meses | Plano: subir pra Postgres Pro do Railway (US$ 50/mês) |
| `DATABASE_URL=file:./prod.db` em algum lugar legado | Já corrigido | Confirmado: aponta para Postgres `${{ Postgres.DATABASE_URL }}` |
| Sandro esquecer a senha do `.pfx` | Média | Recomendar 1Password ou Bitwarden no celular dele |
| Token JWT expirar no meio do uso | Média | Hoje expira em 7d (`JWT_EXPIRES_IN=7d`); se incomodar, aumentar |
| Erros 500 silenciosos | Baixa | Já há error handlers no main.ts + uncaughtException → logs no Railway |
| Backup não rodando | Alta sem ação | **Configurar hoje** cron `pg_dump` para Backblaze B2 |
| Onboarding modal não aparecer | Baixa | Limpar `localStorage.removeItem('nexa_onboarding_dismissed')` na DevTools |

---

## 6. Pós-visita (mesmo dia à noite)

- [ ] Subir backup `pg_dump` diário em B2 (urgente — Sandro tem dados reais agora)
- [ ] Verificar logs do Railway por erros 500
- [ ] Configurar cron `mark-overdue` no Railway Cron ou GitHub Actions
- [ ] Subir notificações reais (bell vai começar a ter conteúdo quando obrigação D-7 disparar)
- [ ] Conferir o `/health` umas 3-4 vezes no dia seguinte
- [ ] Pedir feedback do Sandro em 48h: o que mais incomodou? o que ele mais usou?

---

## 7. Estado atual do sistema (confirmado em produção)

✅ Backend Postgres com volume persistente
✅ Healthcheck respondendo (DB ok, uptime trackeado)
✅ Frontend renderizando (HTTP 200)
✅ TopBar com bell de notificações, breadcrumb, Cmd+K hint
✅ CommandPalette (Cmd+K) com ~30 atalhos de navegação
✅ Toast system global integrado
✅ WelcomeOnboarding modal aparece em primeira sessão (0 empresas)
✅ EmptyState component padronizado
✅ Plano de contas hierárquico + seed PCASP (85 contas BR)
✅ Calendário fiscal automático por regime tributário
✅ DFC + DMPL (demonstrações)
✅ 2FA TOTP (RFC 6238, sem deps externas)
✅ RBAC (`@Roles` + `RolesGuard`)
✅ LGPD endpoints (export, delete, reject)

⚠️ Pendentes técnicos não-bloqueadores:
- Dados mockados em `/fiscal`, `/folha`, `/relatorios/dre`, `/relatorios/balanco`, `/banking`, `/cashflow` — mostram placeholders. Conectar a GraphQL real em próxima sessão.
- Notification bell ainda mostra estado vazio (precisa puxar `/notifications` real do backend)
- Theme toggle não implementado (dark mode é fixo)
- Sem paginação em `/transactions` (mostra todos os lançamentos)
- Sem mobile-first em tabelas (overflow-x funciona, mas não é ideal)
