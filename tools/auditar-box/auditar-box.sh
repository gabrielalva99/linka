#!/usr/bin/env bash
# LINKA — auditoria de TV box em 30 segundos.
#
# POR QUE ISTO EXISTE. Em 20/08 chegou um box "Android 13" que era Android 7.1
# de 2016, com patch de segurança de 2017, RAM inventada (dizia 500 GB) e chave
# pública de assinatura. A tela de "Sobre" dele mostrava 13.1 em letras garrafais.
# Custou uma tarde descobrir, e o LINKA simplesmente não instalava.
#
# A caixa mente. O sistema não consegue mentir sobre o que obedece — e é isso que
# este script pergunta. Rode ANTES de comprar em quantidade.
#
#   ./auditar-box.sh 192.168.20.248      (pela rede)
#   ./auditar-box.sh                     (pelo cabo, se só houver um aparelho)
set -u
ALVO="${1:-}"
if [ -n "$ALVO" ]; then
  case "$ALVO" in *:*) : ;; *) ALVO="$ALVO:5555" ;; esac
  adb connect "$ALVO" >/dev/null 2>&1
  S=(-s "$ALVO")
else
  S=()
fi
g() { adb "${S[@]}" shell getprop "$1" 2>/dev/null | tr -d '\r'; }
ok=0; nok=0
diz()  { printf "  \033[32m✓\033[0m %-34s %s\n" "$1" "$2"; ok=$((ok+1)); }
nao()  { printf "  \033[31m✗\033[0m %-34s %s\n" "$1" "$2"; nok=$((nok+1)); }
aviso(){ printf "  \033[33m!\033[0m %-34s %s\n" "$1" "$2"; }

if ! adb "${S[@]}" shell true >/dev/null 2>&1; then
  echo "Não consegui falar com o aparelho. Ligue a depuração nas Opções do desenvolvedor."
  exit 1
fi

echo
echo "════ IDENTIDADE ════"
echo "  fabricante: $(g ro.product.manufacturer) · modelo: $(g ro.product.model) · placa: $(g ro.board.platform)"
echo "  build: $(g ro.build.fingerprint)"
echo
echo "════ OS SEIS PONTOS QUE DECIDEM ════"

# 1. Versão REAL (o número que o sistema obedece, não o texto da tela)
SDK=$(g ro.build.version.sdk); TXT=$(g ro.build.version.release)
case "$SDK" in 30) A="11";; 31|32) A="12";; 33) A="13";; 34) A="14";; 35) A="15";; 36) A="16";;
  29) A="10";; 28) A="9";; 27) A="8.1";; 26) A="8.0";; 25) A="7.1";; *) A="?";; esac
if [ "${SDK:-0}" -ge 30 ] 2>/dev/null; then diz "Android real" "$A (API $SDK)"
else nao "Android real" "$A (API $SDK) — precisamos de 11+ (API 30)"; fi
[ "$TXT" != "$A" ] && [ "$A" != "?" ] && aviso "A tela dele diz" "\"$TXT\" — NÃO confere com a versão real"

# 2. Build de fabricante, não chave pública
K=$(g ro.build.tags)
case "$K" in *release-keys*) diz "Assinatura do sistema" "$K";;
  *) nao "Assinatura do sistema" "$K — build não oficial";; esac

# 3. Patch de segurança
P=$(g ro.build.version.security_patch)
ANO="${P%%-*}"
if [ "${ANO:-0}" -ge 2024 ] 2>/dev/null; then diz "Patch de segurança" "$P"
else nao "Patch de segurança" "${P:-ausente} — desatualizado"; fi

# 4. 64 bits
ABI=$(g ro.product.cpu.abilist)
case "$ABI" in *arm64*) diz "Arquitetura" "$ABI";; *) nao "Arquitetura" "$ABI — 32 bits";; esac

# 5. Resolução de saída
R=$(adb "${S[@]}" shell wm size 2>/dev/null | tr -d '\r' | awk -F': ' '{print $2}')
case "$R" in *1920x1080*|*3840x2160*) diz "Saída de vídeo" "$R";; *) nao "Saída de vídeo" "${R:-?} — abaixo de 1080p";; esac

# 6. O LINKA instala?
MIN=$(g ro.build.version.sdk)
if [ "${MIN:-0}" -ge 26 ] 2>/dev/null; then diz "O LINKA instala" "sim (exige API 26)"
else nao "O LINKA instala" "NÃO — o app exige API 26"; fi

echo
echo "════ O QUE MUDA NO AGENTE ════"
F=$(adb "${S[@]}" shell pm list features 2>/dev/null | tr -d '\r')
echo "$F" | grep -q leanback && echo "  Android TV (leanback) — precisa do manifesto leanback" \
                            || echo "  AOSP de media box — manifesto leanback dispensável"
echo "$F" | grep -q hdmi.cec && echo "  HDMI-CEC presente — ligar/desligar a TV é possível (a testar)" \
                            || echo "  sem HDMI-CEC — a TV fica ligada o tempo todo"
echo "$F" | grep -q touchscreen && echo "  tem toque" || echo "  sem toque — saída de manutenção pelo controle"
echo "$F" | grep -q "android.hardware.ethernet" && echo "  tem porta de rede"
echo "$(echo "$F" | grep -c wifi) rede(s) sem fio"
C=$(adb "${S[@]}" shell dumpsys account 2>/dev/null | grep -cE "^[[:space:]]+Account \{")
[ "${C:-1}" -eq 0 ] && echo "  zero contas — pode virar dono do aparelho" \
                    || echo "  $C conta(s) — REMOVER antes de tentar virar dono do aparelho"
echo "$(adb "${S[@]}" shell pm list packages 2>/dev/null | grep -c com.android.vending) Play Store (0 = push do Google não funciona; a batida de 60s cobre)"

echo
if [ "$nok" -eq 0 ]; then echo "════ VEREDITO: aprovado nos $ok pontos ════"
else echo "════ VEREDITO: REPROVADO em $nok de $((ok+nok)) pontos ════"; fi
echo
