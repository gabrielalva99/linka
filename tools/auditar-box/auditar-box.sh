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
# Os recursos do sistema sao consultados UMA vez e usados nos dois blocos:
# eles decidem tanto um ponto de aprovacao (dono do aparelho) quanto o que
# muda no agente. Antes esta lista so nascia depois dos pontos — e era por
# isso que o ponto 7 nao podia existir.
F=$(adb "${S[@]}" shell pm list features 2>/dev/null | tr -d '
')

echo
echo "════ OS SETE PONTOS QUE DECIDEM ════"

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

# 4. 64 bits — AVISO, NAO REPROVACAO.
#
# ISTO JA REPROVOU UM APARELHO POR ENGANO, em 04/09: a Intelbras/Homatics veio
# com userspace de 32 bits e caiu aqui. So que o APK do LINKA nao tem UMA
# biblioteca nativa sequer (e Java/Kotlin puro: o ExoPlayer usa o MediaCodec do
# sistema, e o Firebase Messaging nao traz .so). Conferido abrindo o APK. Ele
# instalou e rodou no aparelho de 32 bits sem reclamar.
#
# Fica como aviso porque volta a importar no dia em que alguem adicionar
# biblioteca nativa ao agente. Reprovar por isso hoje e reprovar por um problema
# que nao existe.
ABI=$(g ro.product.cpu.abilist)
case "$ABI" in
  *arm64*) diz "Arquitetura" "$ABI";;
  *) aviso "Arquitetura" "$ABI — 32 bits (o APK nao tem lib nativa: instala igual)";;
esac

# 5. Resolucao — so cobra 1080p de quem MANDA imagem para uma TV.
#
# Num aparelho de mao a resolucao e o painel dele, e nao uma saida de video que
# alguem configura. Cobrar 1080p de um tablet reprovava por engano: o Galaxy Tab
# A7 Lite (800x1340, painel nativo) apareceu como "abaixo de 1080p" na primeira
# versao desta checagem. A presenca de toque e o que separa os dois mundos.
R=$(adb "${S[@]}" shell wm size 2>/dev/null | tr -d '\r' | awk -F': ' '{print $2}')
if adb "${S[@]}" shell pm list features 2>/dev/null | grep -q touchscreen; then
  diz "Resolucao do painel" "$R (aparelho de mao — 1080p nao se aplica)"
else
  case "$R" in *1920x1080*|*3840x2160*) diz "Saida de video" "$R";;
    *) nao "Saida de video" "${R:-?} — abaixo de 1080p para uma TV";; esac
fi

# 6. O LINKA instala?
MIN=$(g ro.build.version.sdk)
if [ "${MIN:-0}" -ge 26 ] 2>/dev/null; then diz "O LINKA instala" "sim (exige API 26)"
else nao "O LINKA instala" "NÃO — o app exige API 26"; fi

# 7. VIRA DONO DO APARELHO? Sem isto nao existe quiosque, e sem quiosque nao
#    existe vitrine: o cliente sai do app pelo controle e ninguem devolve.
#
# ESTE PONTO NASCEU DE UM FALSO POSITIVO, em 31/08. O box "RPCplus" passou por
# aqui com "zero contas — pode virar dono do aparelho", e na hora de provisionar
# o Android recusou sem dizer o motivo. A causa: a build dele nao tem
# `android.software.device_admin` — o fabricante arrancou a administracao de
# dispositivo do sistema inteiro.
#
# Contar contas NAO descobre isso. A linha antiga afirmava "pode" olhando so
# metade do problema, que e o pior tipo de checagem: a que passa confianca
# errada. Agora a pergunta e feita ao sistema, e a contagem de contas virou o
# segundo filtro em vez do unico.
CONTAS=$(adb "${S[@]}" shell dumpsys account 2>/dev/null | grep -cE "^[[:space:]]+Account \{")
if ! echo "$F" | grep -q "android.software.device_admin"; then
  nao "Vira dono do aparelho" "NAO — sistema sem device_admin; quiosque impossivel"
elif [ "${CONTAS:-1}" -ne 0 ]; then
  nao "Vira dono do aparelho" "$CONTAS conta(s) cadastrada(s) — remover e auditar de novo"
else
  diz "Vira dono do aparelho" "sim — recurso presente e zero contas"
fi

echo
echo "════ O QUE MUDA NO AGENTE ════"
# O QUE PERGUNTAR MUDA COM O APARELHO.
#
# A primeira versao disto despejava as perguntas de TV em tudo: um tablet
# Samsung recebia "sem HDMI-CEC, a TV fica ligada o tempo todo", que nao quer
# dizer nada num aparelho de mao. A presenca de toque e o divisor.
if echo "$F" | grep -q touchscreen; then
  echo "  Aparelho de mao (tem toque) — vitrine com interacao do cliente"
  echo "  Saida de manutencao pelos 7 toques: funciona"
  echo "  Painel $R — conferir se a vitrine (travada em retrato) casa com o suporte da loja"
else
  echo "$F" | grep -q leanback && echo "  Android TV (leanback) — precisa do manifesto leanback" || echo "  AOSP de media box — manifesto leanback dispensavel"
  echo "$F" | grep -q hdmi.cec && echo "  HDMI-CEC presente — ligar/desligar a TV e possivel (a testar)" || echo "  sem HDMI-CEC — a TV fica ligada o tempo todo"
  echo "  Sem toque — saida de manutencao precisa ser pelo controle remoto"
fi
echo "$F" | grep -q "android.hardware.ethernet" && echo "  tem porta de rede"
echo "$(echo "$F" | grep -c wifi) rede(s) sem fio"
echo "$(adb "${S[@]}" shell pm list packages 2>/dev/null | grep -c com.android.vending) Play Store (0 = push do Google não funciona; a batida de 60s cobre)"
# MEMORIA E COTA DE HEAP. O defeito numero 1 do projeto foi a vitrine estourar a
# COTA do app (192 a 384 MB conforme o aparelho), que nao tem relacao nenhuma com
# a RAM da maquina. Box de vitrine roda 12 horas seguidas e cai na menor cota que
# existe, entao esta e a pergunta que decide se ele aguenta o dia inteiro.
RAMKB=$(adb "${S[@]}" shell cat /proc/meminfo 2>/dev/null | awk '/MemTotal/{print $2}')
echo "  RAM $(awk -v k="${RAMKB:-0}" 'BEGIN{printf "%.1f GB", k/1048576}') · cota de heap do app $(g dalvik.vm.heapgrowthlimit) (quanto menor a cota, maior o risco de a vitrine estourar)"

echo
if [ "$nok" -eq 0 ]; then echo "════ VEREDITO: aprovado nos $ok pontos ════"
else echo "════ VEREDITO: REPROVADO em $nok de $((ok+nok)) pontos ════"; fi
echo
