# NexaContabil Agent — Desktop

Agente Electron que monitora pastas locais ou de rede mapeadas (Windows: `Z:\contabil\...`; Mac: `/Volumes/share/...`) e sincroniza documentos contábeis com o sistema NexaContabil em cloud.

## Recursos

- 🔍 **Watch contínuo** de pastas configuradas (subpastas recursivo, baseado em chokidar)
- 💾 **Índice local SQLite FTS5** — busca offline instantânea
- ☁️ **Sincronização automática** para `https://backend-production-9eeec.up.railway.app/api/v1/documents/analyze`
- 🤖 **IA contábil**: cada documento é classificado pela Claude (NF-e, NFS-e, boleto, extrato, recibo, etc) e tem dados extraídos
- 🔎 **Busca natural global**: pressione `Ctrl+Shift+F` em qualquer aplicação
- 🖥️ **System tray**: status sempre visível, sem janela aberta
- 🚀 **Auto-start** no boot do Windows
- ⬆️ **Auto-update** via GitHub Releases

## Build

```bash
cd agent
npm install
npm run build          # compila TypeScript
npm run pack           # gera instalador NSIS .exe (Windows)
```

O instalador fica em `agent/release/NexaContabil Agent Setup X.X.X.exe`.

## Instalação no Windows (para os usuários do escritório)

1. Baixar o `.exe` do botão "Instalar Agent" no sistema web
2. Se Windows mostrar SmartScreen alerta:
   - Clicar "Mais informações"
   - Clicar "Executar mesmo assim"
   - (esse alerta some quando comprarmos um code signing certificate)
3. Seguir o instalador
4. Na primeira execução, abrirá janela de configuração:
   - Fazer login com mesmas credenciais do sistema web
   - Selecionar a empresa
   - Adicionar pastas para monitorar
5. Pronto — o ícone fica no tray (bandeja do sistema, próximo ao relógio)

## Desinstalação

Painel de Controle → Programas → NexaContabil Agent → Desinstalar.

## Arquitetura

```
chokidar (watch)
    ↓
SQLite local (better-sqlite3 + FTS5)
    ↓
sync queue (concorrência 3)
    ↓
POST /api/v1/documents/analyze (cloud)
    ↓
Document persistido no Postgres central
```

## Segurança

- JWT armazenado em `electron-store` (criptografado pelo sistema operacional)
- Arquivos enviados para a cloud apenas após autenticação
- Comunicação HTTPS com backend Railway
- Filas locais não vazam dados em logs

## Limitações conhecidas (v0.1)

- Sem code signing → SmartScreen warning na primeira execução (resolver comprando cert R$ 1500-3000/ano)
- Sem OCR local nativo (depende da cloud para imagens) — futuro v0.2 com Tesseract embarcado
- Suporte apenas Windows x64 (Mac/Linux funcionam mas não testados)
- Em pastas com >100k arquivos, primeira indexação pode levar minutos
