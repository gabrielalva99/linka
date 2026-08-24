# LINKA — Agente Android

App nativo em Kotlin que roda nos aparelhos de demonstração da loja. Ele é a vitrine,
o vigia e o executor: mostra a campanha, mede o que aconteceu, obedece comandos do
painel e impede que o aparelho saia do lugar.

**Versão atual: 0.111.0** (`app/build.gradle.kts`). Pacote: `com.linka.agent`.
**Em campo desde 18/08/2026.**

## Duas decisões que não se reabrem sem ADR nova

**Só API pura do Android (AOSP), nenhum SDK de fabricante.** Isso foi validado na
prática em 20/08 com um Galaxy Tab A7 Lite: dono do aparelho, quiosque e as travas
funcionaram idênticos numa Samsung. É o que permite o produto ser multi-marca.

**Um APK só para tudo.** Celular, tablet e TV box são a mesma frota e o mesmo binário.
Quem decide o comportamento é o `device_type`, que o próprio aparelho declara. Não
existe "versão para TV".

## O que ele já faz

| Área | O que está no ar |
|---|---|
| Entrada na frota | Provisionamento por QR e por cabo; o aparelho já nasce na loja certa |
| Proteção | Dono do aparelho, quiosque (lock task), 12 travas conferidas e reportadas |
| Conteúdo | Campanha com rodízio sincronizado, criativo escolhido por formato de tela, cache local |
| Prova | Registra o que tocou, por quanto tempo, com fila local que não perde em queda de rede |
| Telemetria | Saúde, bateria, temperatura, rede, memória do próprio app, inventário de apps |
| Operação | Saída de manutenção por PIN, retirada para venda, faxina diária de fotos do cliente |
| Atualização | Baixa e instala sozinho, em silêncio, com sorteio que espalha a carga da frota |
| Identidade | Declara sozinho se é celular, tablet ou TV, e recebe a versão publicada para o seu tipo |

## Mapa do código

`app/src/main/java/com/linka/agent/`

| Arquivo | Responsabilidade |
|---|---|
| `MainActivity.kt` | A vitrine: tela, tocador de vídeo, menu de testes, medição da tela |
| `HeartbeatService.kt` | Serviço em primeiro plano; relógios de 60 s e de 5 s |
| `Kiosk.kt` | Dono do aparelho, travas, quiosque, manutenção |
| `LinkaDeviceAdminReceiver.kt` | Recebe e larga o cargo de dono do aparelho |
| `BootReceiver.kt` | Sobe a vitrine depois de reiniciar e depois de atualizar |
| `Perfil.kt` | Decide se o aparelho é celular, tablet ou TV |
| `SelfUpdate.kt` | Baixa e instala versão nova sem ninguém tocar no aparelho |
| `Telemetry.kt` / `Health.kt` | O que o aparelho conta de si mesmo |
| `MediaCache.kt` / `MediaLog.kt` | Guardar o vídeo e provar que ele tocou |
| `EventQueue.kt` / `Interaction.kt` | Fila local de uso; só limpa com confirmação do servidor |
| `CrashLog.kt` | O aparelho relata a própria queda |
| `Prefs.kt` | Memória local (token, pendências, estado) |

## Compilar e instalar

```bash
# Compilar (a partir de apps/agent/)
./gradlew assembleRelease

# Instalar num aparelho no cabo
adb install -r linka-agente.apk
```

O APK entregue para instalação manual tem **sempre o mesmo nome**, `linka-agente.apk`,
sobrescrevendo o anterior. Nunca com a versão no nome: aparelho de loja se atualiza
sozinho, e arquivo versionado na área de trabalho só serve para instalar a errada.

Provisionamento por cabo em `tools/provisionar/` (roteiro em `.bat`, para Windows).

## Duas armadilhas conhecidas

**`am force-stop` não mata o app depois que ele vira dono do aparelho.** O Android
protege o dono. Provisionar com o app já aberto deixa o aparelho dono e **sem trava
nenhuma**, com aparência de tudo certo. Descoberto no tablet Samsung, 20/08.

**Erro nosso durante o boot não quebra o app, trava o aparelho.** Como o LINKA é a tela
inicial destes aparelhos, exceção no `BootReceiver` deixa o sistema esperando uma tela
que nunca sobe. Por isso tudo lá dentro é à prova de exceção, sem exceção.

## Defeito aberto

**O aparelho não volta sozinho depois de reiniciar, e não se sabe por quê.** Em 22/08
o aparelho 009 ficou **17 horas ligado com o LINKA fora do ar**, dentro de uma janela de
41 horas sem contato. O `BootReceiver` existe e deveria cobrir isso, mas ele tem
duas formas de falhar em silêncio (o serviço não subir e a tela não abrir), e as duas
são engolidas de propósito pelo motivo da armadilha acima.

Próximo passo: fazer o boot **deixar rastro** antes de tentar consertar. Sem medição, o
conserto é chute.

## Contrato com o servidor

Base: `https://xkzktmsqtvpkxmzftars.supabase.co/functions/v1`

| Rota | Quando |
|---|---|
| `POST /agent-provision` | Uma vez, ao entrar na frota. Devolve `device_token` |
| `POST /agent-heartbeat` | A cada 60 s. Estado, saúde e comandos pendentes |
| `POST /agent-content` | Campanha, criativos e versão publicada para este tipo de aparelho |
| `POST /agent-events` | Lote de uso medido, esvaziando a fila local |

Todas autenticam com `Authorization: Bearer <device_token>` e rodam com
`verify_jwt = false`. O detalhe do contrato de cada campo vive no código das funções em
`supabase/functions/`, que é onde ele é validado de verdade.
