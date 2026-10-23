# LINKA para iPhone

A vitrine do LINKA no iOS. Fala com o **mesmo servidor** do agente Android
(`agent-provision`, `agent-heartbeat`, `agent-content`, `agent-events`), então o
iPhone aparece no painel como mais um aparelho da frota.

## O que já faz (degrau 1)

- Instala pelo **código da loja** (o mesmo do QR do Android, digitado)
- Baixa a campanha inteira e só exibe do aparelho, nunca da nuvem em laço
- **Rodízio sincronizado** com o Android: `floor(epoch / período) % total`, e peça
  única alinhada por `epoch % duração`
- Sinal de vida no ritmo do painel, com bateria, rede, tela e o vídeo no ar
- Eventos de exibição (`media_play`) e de vitrine na tela (`showcase`), com fila
  guardada no aparelho
- Cinco recusas do servidor e esquece a credencial, como o Android

## O que NÃO faz, e por quê

Sem MDM, o app não é dono do aparelho, e a Apple não deixa um app comum travar a
tela, voltar sozinho para a vitrine, aplicar travas, se atualizar sozinho ou saber
qual app o cliente abriu. Para a vitrine ficar presa enquanto o MDM não existe,
use o **Acesso Guiado** (Ajustes › Acessibilidade › Acesso Guiado).

O plano completo está no BACKLOG, épico **E23 · LINKA no iPhone**.

## Compilar

Não precisa de Mac: o GitHub compila a cada mudança nesta pasta
(`.github/workflows/ios.yml`). O projeto do Xcode é gerado de `project.yml` pelo
XcodeGen e não fica no repositório.

Com Mac: `brew install xcodegen && xcodegen generate && open Linka.xcodeproj`.
