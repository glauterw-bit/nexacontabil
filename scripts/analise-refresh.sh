#!/usr/bin/env bash
# Atualiza os dumps de análise (diagnóstico do acervo + operação + faróis + gerencial)
# para o Claude reler e refazer a análise com dados ATUAIS. Senha só na sua máquina.
set -euo pipefail
API="${API:-https://backend-production-9eeec.up.railway.app}"
OUT="$(cd "$(dirname "$0")" && pwd)/dados"; mkdir -p "$OUT"

read -rp "E-mail (dono/gestor): " EMAIL
read -rsp "Senha: " SENHA; echo
TOKEN=$(curl -s -X POST "$API/api/v1/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$SENHA\"}" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin).get("access_token",""))')
[ -z "$TOKEN" ] && { echo "Falha no login."; exit 1; }
H="-H Authorization: Bearer $TOKEN"

echo "-> baixando análises..."
curl -s $H "$API/api/v1/analise-cliente/diagnostico" > "$OUT/diagnostico.json"
curl -s $H "$API/api/v1/paineis/gerencial"           > "$OUT/gerencial.json"
curl -s $H "$API/api/v1/paineis/farois"              > "$OUT/farois.json"
curl -s $H "$API/api/v1/paineis/operacao"            > "$OUT/operacao.json"
curl -s $H "$API/api/v1/sync-drive/status"           > "$OUT/sync.json"

echo "-> pronto. Resumo do acervo:"
python3 -c '
import json
d=json.load(open("'"$OUT"'/diagnostico.json"))
print("  total docs:", d.get("totalDocs"))
print("  por tipo:", d.get("porTipo"))
print("  docs de 2026:", d.get("docsDe2026"), "| emissao mais recente:", d.get("maxEmissao"))
'
echo "Agora me avise: 'refresh feito' — eu releio e refaço a análise."
