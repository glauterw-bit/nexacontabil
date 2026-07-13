#!/usr/bin/env bash
# Sobe o certificado A1 do ESCRITÓRIO reaproveitando o LOGIN QUE JÁ ESTÁ NO NAVEGADOR.
# Você não digita e-mail nem senha do sistema — só cola o token (uma vez) e a senha do .pfx.
#
# COMO PEGAR O TOKEN (uma vez):
#   1) No navegador, já logado no sistema, aperte F12 (ou Cmd+Option+I) -> aba "Console"
#   2) Cole isto e Enter:   copy(localStorage.aura_token)
#      (isso copia o token pra área de transferência; a tela pode mostrar "undefined", tudo bem)
#   3) Volte aqui e cole quando pedir.
set -euo pipefail
API="${API:-https://backend-production-9eeec.up.railway.app}"

# 1) localizar o .pfx
PFX="${1:-}"
if [ -z "$PFX" ]; then
  PFX=$(ls -t "$HOME/Downloads"/*.pfx "$HOME/Downloads"/*.p12 2>/dev/null | head -1 || true)
fi
[ -z "$PFX" ] && { echo "Não achei .pfx/.p12 em ~/Downloads. Rode: bash subir-certificado.sh /caminho/arquivo.pfx"; exit 1; }
echo "Certificado encontrado: $(basename "$PFX")"

# 2) token: pega da área de transferência (o que você copiou no navegador)
TOKEN=$(pbpaste 2>/dev/null | tr -d '\n' || true)
if [ -z "$TOKEN" ] || [ "$TOKEN" = "undefined" ]; then
  echo "Não achei o token na área de transferência."
  echo "No navegador logado: F12 -> Console -> cole  copy(localStorage.aura_token)  -> Enter. Depois rode de novo."
  read -rp "Ou cole o token aqui e Enter: " TOKEN
  [ -z "$TOKEN" ] && exit 1
fi
read -rsp "Senha do CERTIFICADO (.pfx): " SENHA_CERT; echo

# 3) enviar (base64 do pfx no corpo) — endpoint autenticado normal
echo "-> enviando…"
B64=$(base64 < "$PFX" | tr -d '\n')
NOME=$(basename "$PFX")
RESP=$(python3 - "$API" "$TOKEN" "$B64" "$SENHA_CERT" "$NOME" << 'PY'
import sys,json,urllib.request
api,token,b64,senha,nome=sys.argv[1:6]
body=json.dumps({"pfxBase64":b64,"senha":senha,"nome":nome}).encode()
req=urllib.request.Request(api+"/api/v1/sefaz/certificado-escritorio",data=body,
  headers={"Content-Type":"application/json","Authorization":"Bearer "+token.strip()},method="POST")
try:
  print(urllib.request.urlopen(req,timeout=30).read().decode())
except urllib.error.HTTPError as e:
  print(json.dumps({"_http":e.code,"body":e.read().decode()}))
PY
)
echo "$RESP" | python3 -c 'import sys,json
raw=sys.stdin.read()
try:
  d=json.loads(raw)
  if d.get("ok"): print("== OK! Certificado do escritorio salvo. CNPJ:",d.get("cnpj"),"| valido ate:",str(d.get("validade"))[:10])
  elif d.get("_http")==401: print("Token invalido/expirado -> faca login de novo no navegador e copie o token outra vez.")
  else: print("Resposta:",d.get("message") or d.get("body") or d)
except Exception:
  print(raw)'
echo "Pronto. Se deu OK, o cert do escritorio vale p/ todos os clientes com procuracao e-CAC."
