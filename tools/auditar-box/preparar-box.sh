#!/usr/bin/env bash
# LINKA — prepara um Android TV box SEM dono do aparelho para servir de vitrine.
#
# POR QUE ISTO EXISTE. Em 04/09 o box Intelbras/Homatics (Android TV 14, build
# legitima) reprovou em `dpm set-device-owner`: a build nao tem device_admin,
# e nao existe contorno para isso. Foi declarado morto em dois comandos. Estava
# errado: sem dono, ainda da para conquistar o que uma vitrine precisa, e tudo
# por ADB, e TUDO sobrevive a reinicio.
#
# -- A CORRECAO DE 05/09, QUE VALE MAIS QUE O SCRIPT -----------------------
# Em 04/09 este cabecalho afirmava que os appops NAO sobreviviam a reinicio.
# Estava errado, e o erro era do teste: o Android grava o estado dos appops
# COM ATRASO, e o reinicio vinha segundos depois de conceder, dentro dessa
# janela. Com `appops write-settings` forcando a gravacao antes, os tres
# sobreviveram a dois reinicios seguidos.
#
# POR QUE ISSO IMPORTA EM LOJA: o medo era queda de energia, que e reinicio
# sujo. Com a gravacao forcada isso deixa de importar, porque o estado vai
# para o disco NA PREPARACAO, na bancada, e nao no desligamento.
#
# O QUE ELE FAZ (e por que):
#   1. Desliga o launcher do Google. Sem dono, o Android TV nao deixa trocar a
#      tela inicial (`set-home-activity` responde Success e ignora). Mas com o
#      launcher do Google DESLIGADO, o botao de inicio cai no proximo que
#      declara HOME: o LINKA. Reversivel com `pm enable`.
#   2. Concede por appops o que o agente pediria ao dono, e GRAVA em disco:
#      janela por cima, estatisticas de uso e INSTALAR APLICATIVOS. O terceiro
#      e o que permite a autoatualizacao sem ser dono do aparelho; sem ele o
#      box so atualiza por cabo, e uma TV em loja congela na versao que foi.
#      O write-settings do fim nao e enfeite: sem ele nada disso persiste.
#   3. Tira o agente da otimizacao de bateria. Box nao tem bateria, mas o
#      Android aplica a mesma soneca e mata servico do mesmo jeito.
#   4. Aperta o botao de inicio e mostra quem assumiu a tela.
#
# O QUE ELE NAO FAZ, e voce precisa saber antes de por na loja:
#   - Nao existe quiosque: com o controle na mao, da para abrir Ajustes.
#   - A AUTOATUALIZACAO FICA DESLIGADA (SelfUpdate.kt exige dono). Atualizar e
#     por cabo ou por `adb install -r` pela rede, ate o agente declarar
#     UPDATE_PACKAGES_WITHOUT_USER_ACTION e usar USER_ACTION_NOT_REQUIRED.
#   - Nenhuma das 12 travas do dono (Wi-Fi, modo aviao, senha de tela...).
#
#   ./preparar-box.sh 192.168.20.147     (pela rede, com a depuracao ligada)
set -u
ALVO="${1:-}"
[ -z "$ALVO" ] && { echo "uso: $0 <ip-do-box>"; exit 1; }
case "$ALVO" in *:*) : ;; *) ALVO="$ALVO:5555" ;; esac
adb connect "$ALVO" >/dev/null 2>&1
S=(-s "$ALVO")
sh() { adb "${S[@]}" shell "$@" 2>/dev/null | tr -d '\r'; }

if ! adb "${S[@]}" shell true >/dev/null 2>&1; then
  echo "Nao consegui falar com $ALVO. Depuracao por rede ligada? Autorizou na tela?"
  exit 1
fi
if ! sh pm list packages | grep -q "^package:com.linka.agent$"; then
  echo "O LINKA nao esta instalado neste aparelho. Instale antes: adb -s $ALVO install -r linka-agente.apk"
  exit 1
fi

echo
echo "════ 1. TELA INICIAL ════"
# O launcher do Google TV muda de nome conforme a geracao. Desliga o que existir.
for p in com.google.android.tvlauncher com.google.android.apps.tv.launcherx; do
  if sh pm list packages | grep -q "^package:$p$"; then
    printf "  %-45s " "$p"; sh pm disable-user --user 0 "$p"
  fi
done

echo
echo "════ 2. PERMISSOES ESPECIAIS (o que o dono daria) ════"
for op in SYSTEM_ALERT_WINDOW GET_USAGE_STATS REQUEST_INSTALL_PACKAGES; do
  sh appops set com.linka.agent "$op" allow >/dev/null
  printf "  %-24s %s
" "$op" "$(sh appops get com.linka.agent "$op" | head -1)"
done
# SEM ESTA LINHA NADA ACIMA PERSISTE. O AppOpsService grava com atraso; um
# reinicio dentro da janela apaga tudo, e foi assim que a medicao de 04/09
# concluiu errado que o aparelho nao guardava os ajustes.
printf "  %-24s %s
" "gravando em disco" "$(sh appops write-settings)"

echo
echo "════ 3. FORA DA SONECA DO SISTEMA ════"
printf "  %s\n" "$(sh dumpsys deviceidle whitelist +com.linka.agent)"

echo
echo "════ 4. QUEM ASSUME O BOTAO DE INICIO ════"
sh input keyevent KEYCODE_HOME
sleep 4
TOPO=$(sh dumpsys activity activities | grep -E "topResumedActivity" | head -1 | sed -E 's/.* (u0 [^ ]+).*/\1/')
case "$TOPO" in
  *com.linka.agent*) echo "  ✓ $TOPO";;
  *) echo "  ✗ $TOPO  (esperava com.linka.agent; o launcher de fabrica ainda manda)";;
esac

echo
echo "Pronto. Para provar de verdade: adb -s $ALVO reboot, espere ~90s e confira que a vitrine voltou sozinha."
echo "Para desfazer: adb -s $ALVO shell pm enable com.google.android.tvlauncher"
echo
