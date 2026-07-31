#!/usr/bin/env bash
# LINKA — varredura de isolamento entre clientes, com sessao REAL.
#
# POR QUE ESTE ARQUIVO EXISTE. A forma "facil" de testar RLS e impersonar dentro do
# banco (`set local role authenticated` + set_config das claims). Ela me enganou
# duas vezes em 31/07: o escopo nao sobrevive entre statements, `auth.uid()` volta
# NULO, toda funcao de permissao responde false, e eu li isso como "o usuario nao
# alcanca" — quando na verdade nao havia usuario nenhum. Conclusao errada com cara
# de prova.
#
# Aqui nao ha imitacao: cria-se um usuario de verdade, faz-se login pela API de
# Auth, e os ataques passam pelo PostgREST exatamente como um navegador. Se passar
# aqui, passou de verdade.
#
# REGRA: mede LINHAS, nunca "nao deu erro". SELECT barrado por RLS devolve lista
# vazia com 200, e UPDATE/DELETE barrados afetam zero linhas sem reclamar. So o
# INSERT estoura.
#
# CENARIO. Precisa de um cliente-alvo com dados que o usuario NAO pode alcancar, e
# de um usuario de agencia de OUTRO cliente. Os dois se criam por SQL (o script nao
# tem acesso ao banco, so a API). Ver o commit que introduziu este arquivo para o
# bloco pronto — e APAGAR os dois no fim: cliente de teste no painel do Gabriel
# vira duvida sobre o que e real.
set -u
cd "$(dirname "$0")/.."

ANON=$(grep "^NEXT_PUBLIC_SUPABASE_ANON_KEY=" apps/admin/.env.local | cut -d= -f2- | tr -d '"')
URL=$(grep "^NEXT_PUBLIC_SUPABASE_URL=" apps/admin/.env.local | cut -d= -f2- | tr -d '"')
EMAIL="${1:?uso: varredura-rls.sh <email> <senha> <tenant_alvo_uuid>}"
SENHA="${2:?}"
ALVO="${3:?}"

JWT=$(curl -s -X POST "$URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$SENHA\"}" |
  python -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))")

if [ -z "$JWT" ]; then echo "FALHOU: nao consegui a sessao"; exit 1; fi
echo "sessao real obtida (agencia do cliente Teste)"
echo

# $1 rotulo · $2 esperado · $3... curl
alvo() {
  local rotulo="$1" esperado="$2"; shift 2
  local corpo n
  corpo=$(curl -s "$@" -H "apikey: $ANON" -H "Authorization: Bearer $JWT")
  n=$(printf '%s' "$corpo" | python -c "
import sys,json
try:
    d=json.load(sys.stdin)
    print(len(d) if isinstance(d,list) else ('ERRO:'+str(d.get('message',d))[:45]))
except Exception: print('?')")
  # "ERRO" e prefixo: o INSERT barrado devolve a mensagem inteira do Postgres, e
  # ela E o resultado esperado. Marcador que grita em cima de acerto ensina a
  # ignorar o alerta — que e o oposto do que um teste serve.
  local marca="OK"
  case "$esperado" in
    ERRO) case "$n" in ERRO*) ;; *) marca="<<< OLHAR" ;; esac ;;
    *)    [ "$n" != "$esperado" ] && marca="<<< OLHAR" ;;
  esac
  printf '  %-46s linhas=%-28s %s\n' "$rotulo" "$n" "$marca"
}

R="$URL/rest/v1"
echo "LEITURA — o que a agencia do cliente Teste enxerga"
alvo "aparelhos do ALVO"            0 "$R/devices?tenant_id=eq.$ALVO&select=id"
alvo "videos do ALVO"               0 "$R/media_assets?tenant_id=eq.$ALVO&select=id"
alvo "clientes (deve ver so o dele)" 1 "$R/tenants?select=id"
alvo "auditoria do ALVO"            0 "$R/audit_log?tenant_id=eq.$ALVO&select=id"
alvo "PIN de manutencao (qualquer)"  0 "$R/tenant_secrets?select=tenant_id"
alvo "push_token do ALVO"           0 "$R/devices?tenant_id=eq.$ALVO&select=push_token"
alvo "codigo de entrada do ALVO"    0 "$R/tenants?id=eq.$ALVO&select=enrollment_code"

echo
echo "ESCRITA — INSERT estoura, entao aqui o erro E a prova"
alvo "criar aparelho no ALVO" "ERRO" -X POST "$R/devices" -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{\"tenant_id\":\"$ALVO\",\"code\":\"INVASOR\",\"name\":\"invasor\",\"device_token\":\"x-invasor\"}"
alvo "criar video no ALVO" "ERRO" -X POST "$R/media_assets" -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{\"tenant_id\":\"$ALVO\",\"name\":\"invasor\",\"url\":\"https://x/y.mp4\",\"storage_path\":\"$ALVO/y.mp4\"}"
alvo "alterar aparelho do ALVO (0 linhas = barrado)" 0 -X PATCH \
  "$R/devices?tenant_id=eq.$ALVO" -H "Content-Type: application/json" \
  -H "Prefer: return=representation" -d '{"name":"INVADIDO"}'
alvo "apagar aparelho do ALVO (0 linhas = barrado)" 0 -X DELETE \
  "$R/devices?tenant_id=eq.$ALVO" -H "Prefer: return=representation"

echo
echo "SEGREDOS E ARQUIVOS"
alvo "ler_segredo (cofre)" "ERRO" -X POST "$R/rpc/ler_segredo" \
  -H "Content-Type: application/json" -d '{"p_nome":"fcm_service_account"}'
printf '  %-46s ' "listar APKs publicados"
curl -s -X POST "$URL/storage/v1/object/list/releases" -H "apikey: $ANON" \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"prefix":"","limit":100}' | head -c 70; echo
printf '  %-46s ' "listar videos do ALVO no Storage"
curl -s -X POST "$URL/storage/v1/object/list/content" -H "apikey: $ANON" \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d "{\"prefix\":\"$ALVO\",\"limit\":100}" | head -c 70; echo
