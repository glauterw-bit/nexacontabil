#!/usr/bin/env bash
# Varredura DELTA (Graph) de TODOS os clientes → traz 2026 esteja onde estiver na pasta.
# Depois salva o diagnóstico do acervo e as entregas por mês para o Claude analisar.
# A senha é lida localmente e NUNCA é gravada em lugar nenhum.
set -euo pipefail
API="${API:-https://backend-production-9eeec.up.railway.app}"
OUT="$(cd "$(dirname "$0")" && pwd)/dados"; mkdir -p "$OUT"

read -rp "E-mail (dono/gestor): " EMAIL
read -rsp "Senha: " SENHA; echo
TOKEN=$(curl -s -X POST "$API/api/v1/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$SENHA\"}" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))')
[ -z "$TOKEN" ] && { echo "Falha no login (e-mail/senha?)."; exit 1; }
H="Authorization: Bearer $TOKEN"

echo "== Sincronização Delta de toda a carteira (pode levar alguns minutos) =="
PROC=0; NOVOS=0; TOTAL=0; SEMPROG=0; R=0
while true; do
  RESP=$(curl -s -X POST "$API/api/v1/analise-cliente/delta-lote" -H "Content-Type: application/json" -H "$H" -d '{"limit":6}')
  read -r P N T <<<"$(echo "$RESP" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("processados",0),d.get("novos",0),d.get("deUmTotal",0))' 2>/dev/null || echo "0 0 0")"
  R=$((R+1)); PROC=$((PROC+P)); NOVOS=$((NOVOS+N)); TOTAL=$T
  printf "  rodada %d | +%s clientes (acum %d/%s) | +%s arquivos (acum %d)\n" "$R" "$P" "$PROC" "$TOTAL" "$N" "$NOVOS"
  if [ "${N:-0}" = "0" ]; then SEMPROG=$((SEMPROG+1)); else SEMPROG=0; fi
  # para quando processou a carteira toda OU deu voltas sem novidade
  if [ "${TOTAL:-0}" != "0" ] && [ "$PROC" -ge "$TOTAL" ]; then break; fi
  if [ "$SEMPROG" -ge $(( TOTAL/6 + 2 )) ]; then break; fi
  [ "$R" -ge 80 ] && break
done
echo "-> Delta concluído: $NOVOS arquivo(s) novo(s)."

echo "== Diagnóstico do acervo =="
curl -s -H "$H" "$API/api/v1/analise-cliente/diagnostico" > "$OUT/diagnostico.json"
curl -s -H "$H" "$API/api/v1/paineis/entregas-mensais" > "$OUT/entregas.json"
python3 -c '
import json
d=json.load(open("'"$OUT"'/diagnostico.json"))
print("  total docs:", d.get("totalDocs"), "| por tipo:", d.get("porTipo"))
pa=d.get("porAno",{})
print("  2024:",pa.get("2024",0),"2025:",pa.get("2025",0),"2026:",pa.get("2026",0),"| sem data:",d.get("semData"))
print("  emissao mais recente:", d.get("maxEmissao"))
'
echo "Pronto. Me diga: FEITO — eu leio o diagnóstico e faço a análise."
