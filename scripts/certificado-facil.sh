#!/usr/bin/env bash
# Sobe o certificado do escritorio SEM F12/token: faz login com seu e-mail e senha do
# sistema (os mesmos do site), sobe o .pfx da Downloads com a senha ja conhecida e confirma.
set -euo pipefail
API="https://backend-production-9eeec.up.railway.app"
SENHA_CERT="Domo2025"

PFX=$(ls -t "$HOME/Downloads"/*.pfx "$HOME/Downloads"/*.p12 2>/dev/null | head -1 || true)
[ -z "$PFX" ] && { echo "Nao achei .pfx na Downloads."; exit 1; }
echo "Certificado: $(basename "$PFX")"
echo
echo "Entre com o MESMO e-mail e senha que voce usa pra logar no sistema:"
read -rp "  E-mail: " EMAIL
read -rsp "  Senha do sistema: " SENHA_SIS; echo
echo

python3 - "$API" "$EMAIL" "$SENHA_SIS" "$SENHA_CERT" "$PFX" << 'PY'
import sys, json, base64, urllib.request
api, email, senha_sis, senha_cert, pfx_path = sys.argv[1:6]

def post(path, body, token=None):
    data = json.dumps(body).encode()
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    req = urllib.request.Request(api + path, data=data, headers=h, method="POST")
    try:
        return json.loads(urllib.request.urlopen(req, timeout=40).read().decode() or "null"), None
    except urllib.error.HTTPError as e:
        return None, (e.code, e.read().decode()[:160])

# 1) login
log, err = post("/api/v1/auth/login", {"email": email, "password": senha_sis})
if err or not (log or {}).get("access_token"):
    print("LOGIN FALHOU:", err[1] if err else "sem token", "\n-> confira o e-mail/senha do sistema (os do site).")
    sys.exit(1)
token = log["access_token"]
print("Login OK como:", (log.get("user") or {}).get("name") or email)

# 2) upload
b64 = base64.b64encode(open(pfx_path, "rb").read()).decode()
nome = pfx_path.split("/")[-1]
res, err = post("/api/v1/sefaz/certificado-escritorio", {"pfxBase64": b64, "senha": senha_cert, "nome": nome}, token)
if err:
    print("UPLOAD FALHOU:", err[1]); sys.exit(1)
print("Certificado enviado. CNPJ", res.get("cnpj"), "validade", str(res.get("validade"))[:10])

# 3) verifica
import time; time.sleep(2)
prog = json.loads(urllib.request.urlopen(api + "/api/v1/sefaz/progresso", timeout=20).read().decode())
if prog.get("certificadoUsavel"):
    print("\n>> CONFIRMADO: o certificado ABRE com a senha. A busca no SEFAZ comeca no proximo ciclo (~15 min).")
else:
    print("\n>> ATENCAO: ainda nao abre. A senha do .pfx pode nao ser 'Domo2025' — me avise.")
PY
