#!/usr/bin/env bash
# 1) Corrige a data dos documentos (NFS-e/CT-e sem data) em loop até acabar.
# 2) Mostra o acervo por ano/tipo e quantos são de 2026 e deste mês.
# Salva o diagnóstico em scripts/dados/ para o Claude reler. Senha só na sua máquina.
set -euo pipefail
API="${API:-https://backend-production-9eeec.up.railway.app}"
OUT="$(cd "$(dirname "$0")" && pwd)/dados"; mkdir -p "$OUT"

read -rp "E-mail (dono/gestor): " EMAIL
read -rsp "Senha: " SENHA; echo
TOKEN=$(curl -s -X POST "$API/api/v1/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$SENHA\"}" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))')
[ -z "$TOKEN" ] && { echo "Falha no login."; exit 1; }

echo "== 1/2 Corrigindo datas dos documentos =="
TOTAL=0; REST=1; R=0
while [ "${REST:-0}" != "0" ]; do
  RESP=$(curl -s -X POST "$API/api/v1/analise-cliente/reparsear-sem-data" \
    -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{"limit":400}')
  read -r COR REST <<<"$(echo "$RESP" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("corrigidos",0),d.get("restantes",0))' 2>/dev/null || echo "0 0")"
  R=$((R+1)); TOTAL=$((TOTAL+COR))
  printf "  rodada %d: +%s corrigidos (total %d) | restam %s\n" "$R" "$COR" "$TOTAL" "$REST"
  [ "${COR:-0}" = "0" ] && [ "${REST:-0}" != "0" ] && { echo "  (sem progresso — parando)"; break; }
done
echo "-> $TOTAL documentos tiveram a data corrigida."

echo "== 2/2 Acervo atual =="
curl -s -H "Authorization: Bearer $TOKEN" "$API/api/v1/analise-cliente/diagnostico" > "$OUT/diagnostico.json"
MES=$(python3 -c 'import datetime;print(datetime.date.today().strftime("%Y-%m"))')
python3 -c '
import json,sys
d=json.load(open("'"$OUT"'/diagnostico.json"))
print("  total docs:", d.get("totalDocs"))
print("  por tipo :", d.get("porTipo"))
pa=d.get("porAno",{})
print("  2025:", pa.get("2025",0), "| 2026:", pa.get("2026",0), "| sem data:", d.get("semData"))
print("  emissao mais recente:", d.get("maxEmissao"))
'
echo "Pronto. Me diga 'feito' que eu releio o diagnóstico e confirmo 2026/este mês."
