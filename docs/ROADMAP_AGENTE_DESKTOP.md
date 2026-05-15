# Roadmap: Agente desktop para varredura contínua da rede local

## Problema que resolve

Hoje a página `/inteligencia` exige que o usuário (Sandro ou um assistente) clique "Selecionar pasta" e autorize manualmente. Os limites:

- Browser fechado → não indexa nada
- Mesmo aberto, só lê pastas autorizadas naquela sessão
- Network shares (`\\servidor\contabil\`) só funcionam se mapeadas como letra (`Z:\`)
- Não consegue dizer "encontrei um arquivo novo, analisa" — só processa o que o usuário arrastou

Para o caso de uso real do escritório do Sandro (centenas de documentos chegando por mês, espalhados em pastas de rede com convenção tipo `\\servidor\contabil\<cliente>\<ano>\<mes>\`), um agente desktop dedicado é o caminho certo.

---

## Arquitetura proposta

```
┌─────────────────────────────────────────┐
│  PC do escritório (Windows / Mac / Linux)│
│                                          │
│   ┌─────────────────────────────────┐   │
│   │  NexaContabil Agent             │   │
│   │  (Electron + chokidar + sqlite) │   │
│   │                                 │   │
│   │  - Tray icon                    │   │
│   │  - Watch folders configuradas   │   │
│   │  - Index local (SQLite FTS5)    │   │
│   │  - Upload incremental p/ cloud  │   │
│   │  - Cache offline                │   │
│   └────────────┬────────────────────┘   │
│                │                         │
└────────────────┼─────────────────────────┘
                 │ HTTPS + JWT
                 ▼
   ┌─────────────────────────────┐
   │  NexaContabil Backend       │
   │  (Railway)                  │
   │                             │
   │  POST /documents/analyze    │
   │  POST /documents/search     │
   │  GET  /documents/sync       │
   └─────────────────────────────┘
```

## Funcionalidades v1

1. **Tray icon** (Windows tray / Mac menu bar / Linux notification area)
   - Status: 🟢 sincronizado · 🟡 processando · 🔴 erro
   - Menu: "Abrir Dashboard", "Configurar pastas", "Pausar", "Sair"

2. **Watch folders configuráveis**
   ```
   Pastas monitoradas:
   - \\servidor\contabil\*  (todas as subpastas)
   - C:\Backups\Notas\
   - Z:\eSocial\
   ```
   Usando [chokidar](https://github.com/paulmillr/chokidar) (cross-platform, baseado em fsevents/inotify/ReadDirectoryChangesW).

3. **Indexação local SQLite FTS5**
   - Para cada arquivo: path absoluto, mtime, hash SHA-256, tipo detectado, texto extraído (PDF: `pdf-parse`, imagem: Tesseract.js local), CNPJ, valor, data
   - Permite busca offline mesmo sem internet
   - Sincroniza com cloud em background

4. **Upload incremental**
   - Detecta arquivo novo → calcula SHA-256 → consulta cloud "já tem?"
   - Se não tem, upload base64 → `/documents/analyze`
   - Atualiza índice local com `documentId` retornado

5. **Busca natural integrada**
   - Cmd+Shift+F (atalho global do sistema) abre janela de busca
   - "imposto 2023 empresa X" → consulta primeiro local (rápido), depois cloud (autoritativo)
   - Resultado mostra path do arquivo na rede + link pra abrir no Explorer/Finder
   - Click duplo abre o arquivo nativo

6. **Modo offline**
   - Funciona sem internet (indexação local continua)
   - Quando voltar online, processa fila acumulada

7. **Pausa inteligente**
   - Não processa em horário de pico (configurável)
   - Não consome mais de X% CPU
   - Throttle de upload (não satura rede)

## Stack técnica

| Camada | Tecnologia | Razão |
|---|---|---|
| Runtime | Electron 34+ | Cross-platform, mantido, pequeno (~120 MB) |
| File watch | chokidar 4 | Padrão de fato no Node |
| Index local | better-sqlite3 + FTS5 | Mais rápido que LokiJS/Realm para FTS |
| OCR local | tesseract.js | Funciona offline; opcional, IA cloud é mais precisa |
| PDF extract | pdf-parse | Confiável, sem deps nativas |
| Updater | electron-updater + GitHub Releases | Auto-update sem servidor próprio |
| Auth | JWT do backend (mesmo que web) | Reuso direto |
| Telemetria | Sentry electron | Erros + crashes |
| Empacotamento | electron-builder | Instaladores .exe / .dmg / .deb assinados |

## Esforço estimado

| Fase | Trabalho | Tempo |
|---|---|---|
| 1 | Setup Electron + tray + auth login (reaproveita web) | 2 dias |
| 2 | Watch folders + indexação SQLite + sync inicial | 3 dias |
| 3 | Upload incremental + reconciliação com cloud | 2 dias |
| 4 | Janela de busca (Cmd+Shift+F) + abrir arquivo | 2 dias |
| 5 | OCR local opcional + modo offline | 2 dias |
| 6 | Auto-update + assinatura digital de instalador | 1 dia |
| 7 | Testes manuais em Windows 10/11 e Mac | 1 dia |
| 8 | Instalador, documentação, vídeo de setup | 1 dia |
| **Total** | | **~2 semanas** |

## Custos extras

- **Code signing certificate** (necessário para Windows não dar alerta): R$ 1500-3000/ano
  - Soluti, Certisign, DigiCert oferecem certificado de software (diferente do A1)
- **Apple Developer Program** (para Mac): US$ 99/ano (notarização)
- **Auto-update**: GitHub Releases é gratuito

## Roadmap pós-v1

- **v2**: integração nativa com Outlook/Gmail para puxar anexos automaticamente
- **v3**: scanner de e-mail SMTP/IMAP — escritório cadastra `contato@escritorio.com.br`, agente lê inbox e processa anexos
- **v4**: integração com sistemas legados (Domínio, Alterdata) via leitura de pasta de exportação
- **v5**: modo "scanner" — botão "escanear documento" que abre câmera do PC (USB) e captura página por página

## Decisão pra discutir

**Pra começar nesse projeto agora:**
- Você bancaria como produto separado (R$ 50-100/mês por instalação)
- Ou seria parte do plano premium do NexaContábil?

**Pra começar quando:**
- Após Sandro estar usando o sistema atual e validar que o limite web realmente incomoda
- Depois de fechar 3-5 escritórios pagantes (pra ter caixa do projeto)

Por ora a página `/inteligencia` + drag-drop + File System Access API resolvem ~80% dos casos. O agente desktop é o último 20% que justifica preço premium e diferencial competitivo claro contra Domínio/Alterdata.
