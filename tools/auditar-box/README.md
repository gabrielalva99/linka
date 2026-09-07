# Auditar TV box antes de comprar

A caixa mente. Em 20/08 chegou um box vendido como **Android 13** que era
**Android 7.1.2 de 2016**, com patch de segurança de 2017, chave pública de
assinatura e 500 GB de RAM inventados. A tela de "Sobre" dele mostrava 13.1 em
letras garrafais, e o LINKA simplesmente não instalava.

O sistema não consegue mentir sobre o que ele **obedece**. Este script pergunta
isso, e não o que está escrito na tela.

## Depois de aprovar: preparar o box sem dono

Se o script disser "Vira dono do aparelho: NAO", o aparelho ainda pode servir de
vitrine. `./preparar-box.sh <ip>` desliga o launcher de fabrica (o botao de inicio
passa a cair no LINKA), concede por ADB o que o dono daria, e tira o agente da soneca
do sistema, e concede tambem o de INSTALAR APLICATIVOS, que e o que permite atualizacao
sem ser dono. Provado com reinicio frio na Intelbras/Homatics: tudo sobrevive, DESDE QUE o
script grave em disco no fim (`appops write-settings`). A versao de 04/09 dizia que os
appops nao sobreviviam; estava errado, o teste e que reiniciava antes de o Android gravar. O que se perde
sem dono esta no cabecalho do script: quiosque, autoatualizacao e as 12 travas.

## Como usar

Ligue a depuração no box (Ajustes → Sobre → 7 toques em "Número da versão" →
Opções do desenvolvedor → **Depuração USB** e **Depuração por rede**), ligue o box
na mesma rede e rode:

```bash
./auditar-box.sh 192.168.20.248     # pela rede
./auditar-box.sh                    # pelo cabo, se só houver um aparelho
```

## O que ele responde

Seis pontos que decidem se o aparelho serve:

1. **Android real** — o nível de API, que o sistema obedece, e não o texto da tela
2. **Assinatura do sistema** — `release-keys` (fabricante) ou `test-keys` (qualquer um assina)
3. **Patch de segurança** — 2024 ou mais recente
4. **Arquitetura** — precisa de 64 bits
5. **Saída de vídeo** — 1080p ou mais
6. **O LINKA instala** — o teste que encerra a discussão

E mais o que muda no agente: Android TV ou AOSP, HDMI-CEC, toque, rede, contas
configuradas (que impedem virar dono do aparelho) e Play Store.

## Exemplo real — o box reprovado de 20/08

```
✗ Android real          7.1 (API 25) — precisamos de 11+ (API 30)
! A tela dele diz       "13.1" — NÃO confere com a versão real
✗ Assinatura do sistema test-keys — build não oficial
✗ Patch de segurança    2017-12-01 — desatualizado
✗ Arquitetura           armeabi-v7a — 32 bits
✗ Saída de vídeo        1280x720 — abaixo de 1080p
✗ O LINKA instala       NÃO — o app exige API 26

VEREDITO: REPROVADO em 6 de 6 pontos
```

## Nunca rode `adb root` num box pela rede

Em 04/09 um `adb root` num box `userdebug` (Amlogic/WYST, Android 9) reiniciou o `adbd`
e levou o Wi‑Fi junto: o aparelho sumiu da rede e parou de mandar imagem até ser tirado da
tomada. Não é necessário para nada que o script faz. Para saber se a build é de depuração,
leia `ro.build.type` e `ro.build.tags`, que o script já mostra.
