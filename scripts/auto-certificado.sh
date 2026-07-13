#!/usr/bin/env bash
# VIGIA da area de transferencia: assim que um token do sistema for copiado (F12 ->
# copy(localStorage.aura_token)), sobe o certificado do escritorio sozinho, com a senha
# ja conhecida, e confirma que abre. Nao imprime o token nem a senha.
set -euo pipefail
API="https://backend-production-9eeec.up.railway.app"
SENHA_CERT="Domo2025"
PFX=$(ls -t "$HOME/Downloads"/*.pfx "$HOME/Downloads"/*.p12 2>/dev/null | head -1 || true)
[ -z "$PFX" ] && { echo "Nao achei .pfx na Downloads."; exit 1; }
echo "Certificado: $(basename "$PFX")"
echo "Aguardando voce copiar o token no navegador (F12 -> Console -> copy(localStorage.aura_token) -> Enter)..."

TOKEN=""
for i in $(seq 1 240); do   # ate ~20 min (5s * 240)
  # extrai um JWT de QUALQUER coisa na area de transferencia (com aspas, espacos, ruido)
  T=$(pbpaste 2>/dev/null | python3 -c 'import sys,re
m=re.search(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", sys.stdin.read())
print(m.group(0) if m else "")' 2>/dev/null || true)
  if [ -n "$T" ]; then TOKEN="$T"; break; fi
  sleep 5
done
[ -z "$TOKEN" ] && { echo "Token nao apareceu em 20 min. Veja as instrucoes e rode de novo."; exit 1; }
echo "Token detectado. Enviando o certificado..."

B64=$(base64 < "$PFX" | tr -d '\n'); NOME=$(basename "$PFX")
RESP=$(python3 - "$API" "$TOKEN" "$B64" "$SENHA_CERT" "$NOME" << 'PY'
import sys,json,urllib.request
api,token,b64,senha,nome=sys.argv[1:6]
body=json.dumps({"pfxBase64":b64,"senha":senha,"nome":nome}).encode()
req=urllib.request.Request(api+"/api/v1/sefaz/certificado-escritorio",data=body,
  headers={"Content-Type":"application/json","Authorization":"Bearer "+token.strip()},method="POST")
try: print(urllib.request.urlopen(req,timeout=40).read().decode())
except urllib.error.HTTPError as e: print(json.dumps({"_http":e.code,"body":e.read().decode()[:200]}))
PY
)
echo "$RESP" | python3 -c 'import sys,json
raw=sys.stdin.read()
try:
  d=json.loads(raw)
  if d.get("ok"): print("OK: certificado salvo. CNPJ",d.get("cnpj"),"validade",str(d.get("validade"))[:10])
  elif d.get("_http")==401: print("TOKEN_EXPIRADO: recopie o token no navegador e rode de novo."); sys.exit(2)
  else: print("RESPOSTA:",d.get("message") or d.get("body") or d)
except Exception: print(raw)'

echo "Verificando se a senha abre o PFX..."
sleep 2
curl -s -m 20 "$API/api/v1/sefaz/progresso" | python3 -c 'import sys,json
d=json.load(sys.stdin)
print("CONFIRMADO: certificado ABRE — a varredura vai puxar os XMLs no proximo ciclo." if d.get("certificadoUsavel")
      else "ATENCAO: ainda nao abre; confira a senha do .pfx.")'
