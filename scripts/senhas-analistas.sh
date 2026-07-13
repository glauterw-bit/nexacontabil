#!/usr/bin/env bash
# Gera a TABELA de logins dos analistas p/ o Painel do Analista.
# Senhas nao podem ser LIDAS (ficam com hash). Entao define uma senha temporaria conhecida
# para cada analista e imprime a tabela. Cada um troca no primeiro acesso, se quiser.
# Reaproveita seu login do navegador (nao digita e-mail/senha do sistema).
#
# COMO PEGAR O TOKEN (uma vez): no navegador logado, F12 -> Console ->
#   copy(localStorage.aura_token)   -> Enter. Depois rode este script.
set -euo pipefail
API="${API:-https://backend-production-9eeec.up.railway.app}"
SENHA_TEMP="${1:-Domo@2026}"   # senha temporaria (pode passar outra: bash senhas-analistas.sh MinhaSenha)

TOKEN=$(pbpaste 2>/dev/null | tr -d '\n' || true)
if [ -z "$TOKEN" ] || [ "${TOKEN:0:3}" != "eyJ" ]; then
  echo "Token nao encontrado na area de transferencia."
  echo "No navegador logado: F12 -> Console -> cole  copy(localStorage.aura_token)  -> Enter. Depois rode de novo."
  read -rp "Ou cole o token aqui: " TOKEN
fi
[ -z "$TOKEN" ] && { echo "sem token"; exit 1; }

python3 - "$API" "$TOKEN" "$SENHA_TEMP" << 'PY'
import sys, json, urllib.request
api, token, senha = sys.argv[1:4]
def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(api+path, data=data, method=method,
        headers={"Content-Type":"application/json","Authorization":"Bearer "+token})
    try:
        return json.loads(urllib.request.urlopen(r, timeout=30).read().decode() or "null")
    except urllib.error.HTTPError as e:
        return {"_erro": e.code, "_msg": e.read().decode()[:120]}

users = req("GET", "/api/v1/auth/users")
if isinstance(users, dict) and users.get("_erro"):
    print("Falha ao listar usuarios:", users); sys.exit(1)
# equipe operacional que usa o Painel do Analista
alvo = [u for u in users if (u.get("role") or "").lower() in ("analista","contador","assistente")]
if not alvo:
    print("Nenhum analista/contador/assistente encontrado. Crie em /gestao-equipe."); sys.exit(0)

print("\nRedefinindo senha temporaria de %d conta(s)...\n" % len(alvo))
linhas = []
for u in sorted(alvo, key=lambda x: (x.get("role",""), x.get("name",""))):
    r = req("POST", "/api/v1/auth/admin/redefinir-senha", {"userId": u["id"], "novaSenha": senha})
    ok = not (isinstance(r, dict) and r.get("_erro"))
    linhas.append((u.get("name","?"), u.get("email","?"), u.get("role","?"), "OK" if ok else "ERRO"))

w1 = max(len(x[0]) for x in linhas); w2 = max(len(x[1]) for x in linhas); w3 = max(len(x[2]) for x in linhas)
print("| %-*s | %-*s | %-*s | %-10s | %s" % (w1,"Analista",w2,"Login (e-mail)",w3,"Papel","Senha","status"))
print("|-%s-|-%s-|-%s-|-%s-|--------" % ("-"*w1,"-"*w2,"-"*w3,"-"*10))
for n,e,role,st in linhas:
    print("| %-*s | %-*s | %-*s | %-10s | %s" % (w1,n,w2,e,w3,role,senha,st))
print("\nAcesso: %s/login  ->  Painel do Analista (/painel-analista)" % api.replace("backend-production-9eeec","frontend-production-2825"))
print("Peca para cada um trocar a senha no primeiro acesso (Configuracoes).")
PY
