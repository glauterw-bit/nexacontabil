#!/usr/bin/env bash
# NexaContábil — Re-mapeia a carteira no drive, roda a varredura completa e coleta
# os dados para a análise/dashboard. Roda 100% via API pública do sistema.
# Uso:  bash scripts/analise-drive.sh
set -euo pipefail

API="${API:-https://backend-production-9eeec.up.railway.app}"
OUT="$(cd "$(dirname "$0")" && pwd)/dados"
mkdir -p "$OUT"
EMAIL="analise.temp.$(date +%s)@nexacontabil.local"
PASS="Tmp-$(openssl rand -hex 8)"

j() { python3 -c "import json,sys;d=json.load(sys.stdin);$1" 2>/dev/null || true; }

echo "→ conta técnica temporária: $EMAIL"
REG=$(curl -s -X POST "$API/api/v1/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Analise Temp (apagar)\",\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
TOKEN=$(printf '%s' "$REG" | j "print(d.get('access_token') or d.get('token') or (d.get('data') or {}).get('access_token',''))")
if [ -z "${TOKEN:-}" ]; then
  LOGN=$(curl -s -X POST "$API/api/v1/auth/login" -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
  TOKEN=$(printf '%s' "$LOGN" | j "print(d.get('access_token') or d.get('token',''))")
fi
[ -z "${TOKEN:-}" ] && { echo "!! falha na autenticação: $REG"; exit 1; }
H="Authorization: Bearer $TOKEN"
echo "✓ autenticado"

echo "→ 1/6 conexões de drive"
curl -s -H "$H" "$API/api/v1/cloud/connections" > "$OUT/connections.json"

echo "→ 2/6 RE-MAPEANDO a carteira no SharePoint (importar-carteira)…"
curl -s -X POST -H "$H" -H "Content-Type: application/json" -d '{}' \
  "$API/api/v1/cloud/importar-carteira" > "$OUT/importar.json"
head -c 400 "$OUT/importar.json"; echo ""

echo "→ 3/6 disparando ciclo de sincronização…"
curl -s -X POST -H "$H" "$API/api/v1/sync-drive/run" > "$OUT/sync1.json"
printf '%s' "$(cat "$OUT/sync1.json")" | j "print('   sync:', d.get('competencia'), '| xmls novos:', (d.get('capturaIncremental') or {}).get('novosDocs'), '| recibos:', (d.get('recibosNovos') or {}))"

echo "→ 4/6 varrendo clientes pendentes (lotes até zerar, máx 12 rodadas)…"
for i in $(seq 1 12); do
  RL=$(curl -s -X POST -H "$H" -H "Content-Type: application/json" -d '{}' "$API/api/v1/analise-cliente/lote")
  REST=$(printf '%s' "$RL" | j "print(d.get('restantes',0))")
  echo "   lote $i: restantes=${REST:-?}"
  [ "${REST:-1}" = "0" ] && break
done

echo "→ 5/6 segundo ciclo de sync (recibos re-checados)…"
curl -s -X POST -H "$H" "$API/api/v1/sync-drive/run" > "$OUT/sync2.json" || true

echo "→ 6/6 coletando dados para a análise…"
for EP in "paineis/operacao:operacao" "paineis/farois:farois" "paineis/gerencial:gerencial" \
          "analise-cliente/progresso:progresso" "fluxo/competencias:competencias" \
          "apuracao/overview:apuracao" "insights/overview:insights" \
          "solicitacoes/overview:solicitacoes" "torre-controle/overview:torre"; do
  EPPATH="${EP%%:*}"; NAME="${EP##*:}"
  curl -s -H "$H" "$API/api/v1/$EPPATH" > "$OUT/$NAME.json" && echo "   $NAME.json ✓" || echo "   $NAME falhou"
done

echo "$EMAIL" > "$OUT/CONTA_TEMP.txt"
echo ""
echo "================================================================"
echo "PRONTO. Dados salvos em: $OUT"
echo "Volte ao chat e diga: 'dados coletados' — o Claude lê os arquivos"
echo "e monta a análise completa + dashboard."
echo "(conta temporária $EMAIL — o Claude te passa o SQL p/ apagar)"
echo "================================================================"
