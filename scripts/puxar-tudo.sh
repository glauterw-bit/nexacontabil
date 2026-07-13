#!/usr/bin/env bash
# Puxa TODO e QUALQUER arquivo do drive de todos os clientes (resync completo).
# Roda em loop até acabar. A senha é lida localmente e NUNCA é gravada em lugar nenhum.
set -euo pipefail

API="${API:-https://backend-production-9eeec.up.railway.app}"

echo "== Puxar tudo do drive =="
read -rp "E-mail (dono/gestor): " EMAIL
read -rsp "Senha: " SENHA; echo

echo "-> autenticando..."
TOKEN=$(curl -s -X POST "$API/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$SENHA\"}" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin).get("access_token",""))')

if [ -z "$TOKEN" ]; then echo "Falha no login (e-mail/senha?)."; exit 1; fi
echo "-> ok. iniciando varredura completa (Ctrl+C para parar)..."

DESDE=$(python3 -c 'import datetime; print(datetime.datetime.utcnow().isoformat()+"Z")')
TOTAL_NOVOS=0; TOTAL_PROC=0; RODADA=0

while true; do
  RESP=$(curl -s -X POST "$API/api/v1/analise-cliente/resync" \
    -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
    -d "{\"desde\":\"$DESDE\",\"limit\":6}")
  read -r PROC REST NOVOS <<<"$(echo "$RESP" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("processados",0),d.get("restantes",0),d.get("novosDocs",0))' 2>/dev/null || echo "0 0 0")"
  RODADA=$((RODADA+1)); TOTAL_PROC=$((TOTAL_PROC+PROC)); TOTAL_NOVOS=$((TOTAL_NOVOS+NOVOS))
  printf "rodada %d | +%s clientes (total %d) | +%s arquivos (total %d) | restam %s\n" "$RODADA" "$PROC" "$TOTAL_PROC" "$NOVOS" "$TOTAL_NOVOS" "$REST"
  if [ "${REST:-0}" = "0" ] || [ "${PROC:-0}" = "0" ]; then break; fi
  sleep 1
done

echo "== Concluído: $TOTAL_NOVOS arquivo(s) novo(s) em $TOTAL_PROC clientes. =="
