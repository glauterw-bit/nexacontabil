@echo off
title NexaContabil - Iniciando...
color 0A

echo.
echo  ==========================================
echo   NEXACONTABIL - Iniciando servicos...
echo  ==========================================
echo.

:: Mata processos anteriores nas portas usadas
echo [1/5] Limpando portas anteriores...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3001 "') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3010 "') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":8001 "') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":8080 "') do taskkill /F /PID %%a >nul 2>&1

:: Inicia a Evolution API (WhatsApp) em janela separada
echo [2/5] Iniciando Evolution API / WhatsApp (porta 8080)...
start "NexaContabil - Evolution API" cmd /k "cd /d "%~dp0evolution-api" && color 06 && echo  Evolution API rodando na porta 8080 && echo. && npx ts-node --files --transpile-only ./src/main.ts"

:: Aguarda a Evolution API iniciar
timeout /t 5 /nobreak >nul

:: Inicia o Python AI (FastAPI) em janela separada
echo [3/5] Iniciando Python AI (porta 8001)...
start "NexaContabil - Python AI" cmd /k "cd /d "%~dp0backend\python-ai" && color 0E && echo  Python AI rodando na porta 8001 && echo. && venv\Scripts\python -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload"

:: Aguarda o Python AI iniciar
timeout /t 4 /nobreak >nul

:: Inicia a API NestJS em janela separada
echo [4/5] Iniciando API NestJS (porta 3001)...
start "NexaContabil - API" cmd /k "cd /d "%~dp0backend\nodejs-api" && color 0B && echo  Compilando API... && npm run build && echo. && echo  API rodando na porta 3001 && echo. && node dist/main.js"

:: Aguarda a API iniciar
timeout /t 10 /nobreak >nul

:: Inicia o Frontend em janela separada
echo [5/5] Iniciando Frontend (porta 3010)...
start "NexaContabil - Frontend" cmd /k "cd /d "%~dp0frontend" && color 0D && echo  Frontend rodando na porta 3010 && echo. && npm run dev -- -p 3010"

:: Aguarda o frontend compilar
echo.
echo  Aguardando servicos iniciarem (~20 segundos)...
timeout /t 20 /nobreak >nul

:: Abre o navegador
echo  Abrindo navegador...
start "" "http://localhost:3010"

echo.
echo  ==========================================
echo   Sistema iniciado com sucesso!
echo   Frontend:      http://localhost:3010
echo   API:           http://localhost:3001/graphql
echo   Python AI:     http://localhost:8001/docs
echo   Evolution API: http://localhost:8080
echo  ==========================================
echo.
echo  Para parar, feche as 4 janelas abertas
echo  ou execute parar.bat
echo.
pause
