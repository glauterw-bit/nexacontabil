# Setup OAuth — Google Drive + Microsoft OneDrive

Passo-a-passo para destravar a integração de Drive na página `/drive-conectado` do NexaContábil.

---

## Google Drive (15 min)

### 1. Criar projeto no Google Cloud

1. https://console.cloud.google.com → cabeçalho → **Selecionar projeto** → **Novo projeto**
2. Nome: `NexaContabil` · Org: deixar em branco · Criar
3. Aguardar 30s

### 2. Habilitar a API

1. Menu lateral → **APIs e serviços** → **Biblioteca**
2. Buscar **Google Drive API** → habilitar
3. Repita para **Google People API** (precisa para userinfo)

### 3. Tela de consentimento OAuth

1. **APIs e serviços** → **Tela de consentimento OAuth**
2. Tipo de usuário: **Externo** (a menos que tenha Workspace)
3. Preencher:
   - App name: `NexaContabil`
   - User support email: seu e-mail
   - Developer contact: mesmo
4. **Escopos** → adicionar:
   - `https://www.googleapis.com/auth/drive`
   - `https://www.googleapis.com/auth/userinfo.email`
5. **Test users**: adicionar o e-mail do Sandro (até estar em produção)
6. Salvar

### 4. Criar credenciais OAuth 2.0

1. **APIs e serviços** → **Credenciais** → **Criar credenciais** → **ID do cliente OAuth**
2. Tipo: **Aplicativo da Web**
3. Nome: `NexaContabil Backend`
4. **Origens JavaScript autorizadas**:
   ```
   https://frontend-production-2825.up.railway.app
   ```
5. **URIs de redirecionamento autorizados**:
   ```
   https://backend-production-9eeec.up.railway.app/api/v1/cloud/google/callback
   ```
6. Criar → anotar **Client ID** e **Client Secret**

### 5. Adicionar no Railway

Railway → projeto NexaContábil → serviço **backend** → **Variables** → New:

```
GOOGLE_CLIENT_ID=xxxxxxxx-xxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxx
```

Backend reinicia automaticamente em ~30s.

### 6. Testar

1. Acesse `https://frontend-production-2825.up.railway.app/drive-conectado`
2. Clica **Conectar Google Drive**
3. Autoriza
4. Volta com badge verde "Drive conectado"

---

## Microsoft OneDrive (15 min)

### 1. App Registration no Azure

1. https://portal.azure.com → busca **Azure Active Directory** (ou **Microsoft Entra ID**)
2. **App registrations** → **+ New registration**
3. Nome: `NexaContabil`
4. Supported account types:
   - Para uso pessoal/Microsoft 365 misto: **Accounts in any organizational directory and personal Microsoft accounts**
   - Apenas Microsoft 365 empresarial: **Accounts in any organizational directory**
5. **Redirect URI** → tipo **Web** → URL:
   ```
   https://backend-production-9eeec.up.railway.app/api/v1/cloud/microsoft/callback
   ```
6. Registrar

### 2. Anotar IDs

Na tela de overview do app:
- **Application (client) ID** → será seu `MICROSOFT_CLIENT_ID`
- **Directory (tenant) ID** → se for multi-tenant, use `common`. Senão, copie o valor.

### 3. Criar Client Secret

1. App → **Certificates & secrets** → **+ New client secret**
2. Description: `Railway production`
3. Expires: **24 months** (renova)
4. Add → **copia o Value imediatamente** (não dá pra ver depois)

### 4. Adicionar permissões

1. App → **API permissions** → **+ Add permission**
2. **Microsoft Graph** → **Delegated permissions**
3. Selecionar:
   - `Files.ReadWrite.All`
   - `User.Read`
   - `offline_access`
4. Add → **Grant admin consent** (se for org)

### 5. Adicionar no Railway

```
MICROSOFT_TENANT_ID=common         # ou tenant específico
MICROSOFT_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
MICROSOFT_CLIENT_SECRET=value_que_copiou
```

### 6. Testar

1. `/drive-conectado` → **Conectar OneDrive**
2. Login Microsoft → consentir
3. Volta com badge verde

---

## Variável adicional (segurança)

Adicione também no Railway → backend → Variables:

```
CLOUD_ENCRYPTION_KEY=<openssl rand -hex 32>
```

Usada para criptografar AES-256-GCM os access/refresh tokens armazenados no banco.
Sem ela, o sistema cai no fallback de `JWT_SECRET`.

---

## Como usar depois de conectado

### Buscar e analisar

1. Abre `https://frontend-production-2825.up.railway.app/copilot-drive`
2. Pergunta em português:
   - "Analisa todas as NF-e de janeiro de 2026"
   - "Resume os contratos com a empresa Padaria"
   - "Compare os holerites dos últimos 3 meses"
3. Sistema busca em **TODAS as conexões ativas** (Google + Microsoft)
4. Mostra arquivos encontrados → você seleciona quais analisar
5. Adiciona instrução específica (opcional)
6. Clica **Analisar com IA** → Claude processa e gera resumo
7. Imprime em PDF ou refaz a busca

### Limites

- Máximo **30 arquivos** por análise
- Máximo **25 MB** por arquivo
- Tipos suportados para extração: PDF, XML, JPG/PNG/WebP
- Análise dura **10s-2min** dependendo do volume

### Custos esperados

| Item | Custo |
|---|---|
| Google Drive API | Gratuito (1 bilhão req/dia) |
| Microsoft Graph API | Gratuito |
| Claude (Anthropic) | ~R$ 0,02-0,15 por análise dependendo do tamanho |

---

## Troubleshooting

| Sintoma | Solução |
|---|---|
| `Google OAuth nao configurado` | Faltam env vars `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` no Railway |
| `redirect_uri_mismatch` | URL no Google Console não bate com a do backend. Confira `https://backend-production-9eeec.up.railway.app/api/v1/cloud/google/callback` |
| `invalid_grant` na Microsoft | Tenant ID errado. Use `common` se for multi-tenant |
| `Sem access_token` | Faltou `prompt=consent`. O service já força isso. Limpe cookies e refaça |
| Token expirado | Sistema renova automaticamente via refresh token. Se persistir, revogue e reconecte |
| Configure ANTHROPIC_API_KEY | Análise IA precisa do Claude. Adicione `ANTHROPIC_API_KEY` no Railway → backend |

---

## Privacidade e LGPD

- Tokens são criptografados AES-256-GCM antes de ir pro banco
- Sistema usa scope `drive` (full) — pode ler, criar e modificar arquivos do Drive conectado
- Cada busca grava `DocumentQuery` (auditoria)
- Para revogar: `/drive-conectado` → ícone lixeira na conexão (revoga apenas localmente; revogue também no console.cloud.google.com → permissões para revogar pelo lado do Google)
