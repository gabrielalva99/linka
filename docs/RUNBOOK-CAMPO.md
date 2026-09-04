# Runbook de campo — LINKA

O que fazer quando um aparelho da loja dá problema. Escrito para quem está com o
aparelho na mão, não para quem conhece o código.

Cada procedimento diz **o que você vê**, **o que fazer** e **como saber que deu certo**.

---

## 0. Chegou um e-mail do LINKA

Desde 24/08 o painel manda e-mail quando um aparelho entra em estado crítico, e outro
quando ele volta ao normal. Antes disso ele só mostrava na tela, e um aparelho chegou a
passar **41 horas apagado** sem ninguém saber.

**O que o e-mail é.** Um resumo por cliente, com o código do aparelho, a loja, o problema
e há quanto tempo. Um e-mail só, mesmo que sejam treze aparelhos.

**O que ele não é.** Ele não chega para tudo. Só para o que é crítico **com a loja
aberta**: fora do ar, tela sem vídeo, parado no menu, aplicativo removido. Bateria baixa e
travas incompletas continuam só no painel, porque acordar alguém às 22h por isso ensina a
ignorar o aviso inteiro.

**O que fazer.** Abra o painel pelo botão do e-mail e vá pelo procedimento do problema
citado, aqui embaixo. Se o aparelho voltar sozinho, chega um segundo e-mail dizendo isso,
e você não precisa fazer nada.

**Se você não recebe os e-mails:** eles vão para superadmin e para quem tem papel de
agência no cliente. Quem é da loja não recebe. Ver **Clientes → o cliente → Usuários**.

---

## 1. Preciso trocar a rede Wi-Fi da loja

Senha nova do roteador, roteador trocado, ou o aparelho foi remanejado para outra loja.

**Não desprovisione.** Com o aparelho protegido, trocar de rede pela tela dos Ajustes é
impossível de propósito — o cliente não pode derrubar a vitrine. Existe uma saída própria.

1. Toque **sete vezes** na vitrine (no vídeo).
2. Digite o **PIN de manutenção** do cliente (definido no painel, em Clientes).
3. Toque em **"Trocar rede Wi-Fi"**. O seletor de redes abre direto.
4. Escolha a rede e digite a senha.

**Como saber que deu certo:** o aparelho volta a aparecer como "No ar" no painel dentro de
1 minuto, e a ficha volta a mostrar todas as proteções confirmadas.

**Se a senha estiver errada:** não tem problema. A rede continua destravada até o aparelho
conseguir falar com o servidor — é só tentar de novo. Ele nunca se tranca fora da rede.

> Disponível a partir da versão **0.71.0** do aplicativo. Em versões anteriores não existe
> caminho nenhum, e a única saída era desprovisionar.

---

## 2. O painel diz "sem bloqueio" / "o aplicativo não está no controle do aparelho"

Significa que o aplicativo perdeu o cargo de dono do aparelho. Nesse estado o cliente
consegue desligar o Wi-Fi e o app não se atualiza sozinho.

**Na maioria dos casos NÃO precisa restauração de fábrica.** O Android só exige que o
aparelho **não tenha nenhuma conta** cadastrada — e a nossa própria proteção
`no_modify_accounts` impede que alguém adicione conta, então essa condição costuma estar
satisfeita.

Com o aparelho ligado no cabo, num computador com adb:

```bash
# 1. Confirme que o aparelho está visível
adb devices -l

# 2. Confirme que NÃO há contas (tem que responder 0)
adb shell dumpsys account | grep -cE "^\s+Account \{"

# 3. Instale a versão mais recente ANTES de travar,
#    para o aparelho não nascer com uma versão velha
adb install -r linka-agente.apk

# 4. Devolva o cargo de dono
adb shell dpm set-device-owner com.linka.agent/.LinkaDeviceAdminReceiver

# 5. NÃO PULE ESTE. Acesso a arquivos, sem o qual a faxina diária
#    não apaga foto nenhuma do cliente
adb shell appops set com.linka.agent MANAGE_EXTERNAL_STORAGE allow
```

Resposta esperada no passo 4:

```
Success: Device owner set to package com.linka.agent/.LinkaDeviceAdminReceiver
```

**O passo 5 é o que eu esqueci na primeira vez, e o defeito é silencioso.** O cargo de
dono não traz junto o acesso a arquivos: é uma permissão especial, fora do que o aparelho
consegue conceder a si mesmo. Sem ela o aparelho volta bonito no painel — protegido, no
ar, tocando campanha — e a faxina noturna deixa de apagar as fotos que o cliente tirou.
Ninguém percebe olhando a lista de aparelhos.

**Como saber que deu certo:** em até 1 minuto o painel mostra o aparelho como protegido,
com todas as proteções confirmadas. E na ficha do aparelho, a última faxina tem que dizer
`N arquivo(s)` — se disser `SEM PERMISSÃO de arquivos`, o passo 5 não pegou. Para conferir
na hora, sem esperar a noite, use **Limpar agora** na ficha do aparelho.

**Se o passo 2 responder diferente de 0:** existe conta no aparelho. Remova a conta pelos
Ajustes e repita. Se não for possível, aí sim é restauração de fábrica.

**Ordem importa:** instalar o aplicativo **antes** de travar. Ao contrário, o aparelho fica
protegido rodando uma versão antiga, e a atualização remota depende justamente do que você
acabou de configurar.

---

## 3. O aparelho está com a tela escura

A partir da versão **0.72.0** isso se resolve sozinho: o brilho volta a 100% toda vez que a
vitrine reaparece, e também quando o aparelho é reiniciado. O cliente pode baixar o brilho
no menu de testes à vontade — é um teste de tela, e ele volta ao normal em seguida.

Em versões anteriores, o brilho que o cliente baixasse ficava baixo o resto do dia.

**Se continuar escuro na 0.72.0 ou mais nova:** o aparelho provavelmente não está com o
cargo de dono (sem ele o aplicativo não consegue mexer no brilho). Veja o item 2.

---

## 4. O aparelho chegou e não aparece na loja certa

Aparelho que se cadastra sozinho chega **sem loja**. É o único dado que ele não tem como
descobrir, e sem loja nenhuma campanha o alcança.

No painel: **Dispositivos → o aparelho → Editar cadastro → escolher a loja**.

O aviso na Visão geral nomeia quais aparelhos estão nessa situação, com link direto.

---

## 5. O aparelho saiu de operação (app removido, roubado, quebrado, devolvido)

**Não apague o cadastro.** Arquive: no painel, **Dispositivos → o aparelho → Arquivar**,
com o motivo.

Arquivar não apaga nada — o que ele mediu enquanto estava na loja continua nos relatórios,
porque aconteceu. O que muda é que ele para de gerar alerta todo dia. Alerta que ninguém
pode fechar ensina a equipe a ignorar a tela inteira, e aí o aparelho que caiu de verdade
some no meio do ruído.

Se um dia ele voltar a se conectar, aparece na lista de arquivados como "visto agora" — que
é exatamente o que interessa saber de um aparelho roubado.

**Escreva um motivo que se explique sozinho daqui a seis meses.** "Trocado" não distingue
nada quando houver trinta aparelhos arquivados.

---

## 6. Cliente deixou senha na tela de bloqueio

O painel acusa **"senha de tela"**. No próximo reinício a vitrine para numa tela pedindo
PIN, e ninguém na loja sabe o PIN.

Neste hardware **o token de reset do Android é recusado**, então não dá para apagar a senha
remotamente. O que o sistema faz é denunciar, para alguém agir antes do próximo reinício.

Presencialmente: sete toques, PIN de manutenção, e remova a senha pelos Ajustes.

---

## 7. O painel diz "o aplicativo foi removido deste aparelho"

Alguém tirou o cargo de dono e, quase sempre, desinstalou o app. O aparelho avisa antes de
morrer, e por isso o painel sabe a hora exata.

Este aviso **substitui os outros**: o mesmo aparelho não vai mostrar "sem contato" nem
"parado no menu" junto. Eles seriam consequência de um fato já explicado, e nunca fechariam
sozinhos, porque não existe mais ninguém do outro lado para reportar que melhorou.

**Se foi de propósito** (aparelho saindo do piloto, indo para outro uso): arquive, com o
motivo **"Aplicativo removido"**. O alerta fecha e ele para de contar como frota.

**Se não foi:** alguém precisa ir até o aparelho. Sem o aplicativo, o painel não alcança
mais ele, e nenhum comando remoto funciona. O caminho de volta é o do item 2.

> O alerta continua vermelho até alguém confirmar, de propósito. Numa loja, aplicativo
> removido é grave, e ficar quieto é exatamente o que não pode acontecer.

---

## 8. O aparelho está ligado, mas o LINKA não está na tela

**Defeito conhecido e ainda em aberto.** Em 22/08 um aparelho ficou 17 horas assim.

Acontece depois de o aparelho reiniciar, geralmente porque a bateria acabou e alguém
plugou de novo. O aplicativo deveria voltar sozinho e nem sempre volta. Ainda não se sabe
se o mecanismo não roda ou se roda e falha, porque as duas falhas são silenciosas.

**Na hora, o que resolve:** abrir o LINKA à mão no aparelho. Em um minuto ele volta ao
painel e despeja tudo que mediu enquanto estava sozinho. **Nada se perde:** a fila local
guarda o que tocou e entrega depois, mesmo que demore um dia.

**O que ajuda a consertar:** anote a hora em que você encontrou o aparelho assim e se ele
estava plugado. É a informação que falta para fechar o diagnóstico.

---

## 9. Os aparelhos estão descarregando na loja

Se um aparelho zera a bateria, ele desliga, e ao voltar cai no item 8.

O painel avisa em duas etapas: **"fora do carregador"** depois de 30 minutos desligado da
tomada, e **"bateria baixa"** abaixo de 15%. O primeiro é o que importa, porque o segundo
só acende quando já é quase tarde, e não acende nunca se a rede cair antes da bateria.

**Quando o mesmo aparelho repete isso**, o problema não é descuido, é a instalação: tomada
de menos no ponto, cabo que sai fácil, ou alguém desligando para carregar outra coisa.
Vale olhar o ponto físico em vez de pedir para plugar de novo toda semana.

---

## 10. TV box: a vitrine sobe, mas o aparelho não vira dono de si mesmo

**Como reconhecer:** `tools/auditar-box/auditar-box.sh <ip>` responde
`Vira dono do aparelho: NAO — sistema sem device_admin`, e `dpm set-device-owner`
devolve `Can't set package as device owner` mesmo com zero contas. O próprio sistema
confirma em `dumpsys device_policy`: `mHasFeature=false`.

**O que significa:** a build da TV veio sem administração de dispositivo. Não é conta
sobrando, não é configuração, e não tem contorno: o Google não exige esse recurso em
Android TV, e dois de dois boxes de consumo vieram sem ele (RPCplus em 31/08,
Intelbras/Homatics em 04/09).

**O que fazer:** o box ainda serve de vitrine. Rode `tools/auditar-box/preparar-box.sh <ip>`
com o LINKA já instalado. Ele desliga o launcher de fábrica (sem dono o Android TV não
troca a tela inicial, mas com o launcher desligado o botão de início cai no LINKA),
concede por ADB a janela por cima e as estatísticas de uso, e tira o agente da soneca
do sistema. Depois reinicie o box e confira que a vitrine voltou sozinha: foi assim que
se provou, com reinício frio, em 04/09.

**O que sobrevive ao reinício e o que não** (medido duas vezes no mesmo box): o launcher
desligado, a lista da soneca e o LINKA como tela inicial sobrevivem. As duas permissões
concedidas por `appops` (janela por cima e estatísticas de uso) **voltam a `default` a cada
boot** neste modelo. Na TV isso não faz diferença: nada da vitrine usa janela por cima, e
estatística de uso mede app aberto por cliente, que não existe numa vitrine pura. Não perca
tempo reaplicando.

**O que não existe nesse modo, e a loja precisa saber:**

- Quiosque: com o controle remoto na mão dá para abrir Ajustes. Guarde o controle.
- Autoatualização: `SelfUpdate` exige dono. Versão nova entra por `adb install -r` pela
  rede, com a depuração ligada. Enquanto isso não muda no agente, cada box é uma visita
  (ou um acesso remoto) por versão.
- As 12 travas do dono (Wi-Fi, modo avião, senha de tela, bloqueio de apps).

**Para desfazer:** `adb -s <ip>:5555 shell pm enable com.google.android.tvlauncher`.

## Ao chamar por ajuda

Diga sempre estas quatro coisas, que são as que respondem a maioria dos casos:

- **Código do aparelho** (aparece na lista do painel, ex.: `114`)
- **Versão do aplicativo** (na ficha do aparelho)
- **O que o painel diz** — o texto do aviso, não o resumo dele
- **O que você já tentou**
