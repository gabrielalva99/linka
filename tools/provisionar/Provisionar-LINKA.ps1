# LINKA - Provisionamento de aparelho em campo.
#
# Feito para ser rodado por tecnico, nao por desenvolvedor: nenhum comando
# digitado, nenhuma decisao tecnica. O script confere as pre-condicoes, instala,
# assume o controle do aparelho e VERIFICA se as travas pegaram de fato.
# Se algo falhar, ele diz em portugues o que fazer.

# "Continue" de proposito: o adb escreve avisos e falhas esperadas na saida de
# erro (assinatura incompativel, por exemplo). Com "Stop", o PowerShell matava o
# programa com um monte de vermelho ANTES da mensagem em portugues que o tecnico
# precisa ler. Cada passo aqui e conferido explicitamente.
$ErrorActionPreference = "Continue"
$base = Split-Path -Parent $MyInvocation.MyCommand.Path
$adb = Join-Path $base "adb.exe"
if (-not (Test-Path $adb)) { $adb = "adb" }
$apk = Join-Path $base "linka-agente.apk"
$admin = "com.linka.agent/.LinkaDeviceAdminReceiver"
# Chave publica (anon) do LINKA: so le a lista de versoes publicadas, protegida
# por RLS. Mesma chave embutida no aplicativo.
$anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhremt0bXNxdHZwa3htemZ0YXJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4NTQ3MzksImV4cCI6MjEwMDQzMDczOX0.SdqYO4RAxNr6Z3s-EJVzHJyAdhzXG7t213YHj7P-9D8"

function Titulo($texto) {
  Write-Host ""
  Write-Host "=== $texto" -ForegroundColor Cyan
}
function Ok($texto)    { Write-Host "  [OK] $texto" -ForegroundColor Green }
function Falha($texto) { Write-Host "  [X] $texto" -ForegroundColor Red }
function Aviso($texto) { Write-Host "  [!] $texto" -ForegroundColor Yellow }

function Fim($sucesso, $mensagem) {
  Write-Host ""
  if ($sucesso) {
    Write-Host "###############################################" -ForegroundColor Green
    Write-Host "#  APARELHO PRONTO                            #" -ForegroundColor Green
    Write-Host "###############################################" -ForegroundColor Green
  } else {
    Write-Host "###############################################" -ForegroundColor Red
    Write-Host "#  NAO CONCLUIDO - LEIA A INSTRUCAO ABAIXO    #" -ForegroundColor Red
    Write-Host "###############################################" -ForegroundColor Red
  }
  Write-Host ""
  Write-Host $mensagem
  Write-Host ""
  Read-Host "Pressione ENTER para fechar"
  exit ($(if ($sucesso) { 0 } else { 1 }))
}

Clear-Host
Write-Host "LINKA - Provisionamento de aparelho" -ForegroundColor White
Write-Host "-----------------------------------"

# 1. Aparelho conectado -------------------------------------------------------
Titulo "Procurando o aparelho"
& $adb start-server | Out-Null
$linhas = & $adb devices | Select-Object -Skip 1 | Where-Object { $_ -match "\S" }
$conectados = @($linhas | Where-Object { $_ -match "device$" })

if ($conectados.Count -eq 0) {
  $naoAutorizado = @($linhas | Where-Object { $_ -match "unauthorized" })
  if ($naoAutorizado.Count -gt 0) {
    Fim $false @"
O aparelho esta conectado mas NAO AUTORIZOU este computador.

O QUE FAZER:
 1. Olhe a tela do aparelho: apareceu uma janela perguntando se permite
    a depuracao USB.
 2. Marque "Sempre permitir" e toque em PERMITIR.
 3. Rode este programa de novo.
"@
  }
  Fim $false @"
Nenhum aparelho encontrado.

O QUE FAZER:
 1. Conecte o cabo USB no aparelho e no computador.
 2. No aparelho, deslize a notificacao de USB e escolha
    "Transferencia de arquivos".
 3. Confira se a DEPURACAO USB esta ligada:
    Ajustes > Sistema > Opcoes do desenvolvedor > Depuracao USB.
    (Se nao existir "Opcoes do desenvolvedor": Ajustes > Sobre o telefone
     e toque 7 vezes em "Numero da versao".)
 4. Rode este programa de novo.
"@
}
if ($conectados.Count -gt 1) {
  Fim $false "Tem mais de um aparelho conectado. Deixe SO UM e rode de novo."
}

$modelo = (& $adb shell getprop ro.product.model).Trim()
$android = (& $adb shell getprop ro.build.version.release).Trim()
Ok "Encontrado: $modelo (Android $android)"

# 2. Pre-condicoes ------------------------------------------------------------
Titulo "Conferindo se o aparelho pode ser provisionado"

$donos = (& $adb shell cmd device_policy list-owners) -join " "
if ($donos -match "com.linka.agent") {
  Fim $true @"
Este aparelho JA ESTAVA provisionado pelo LINKA. Nada a fazer.

Se o app nao estiver aparecendo na tela, abra o app LINKA Agente e
confira se ele pede codigo de pareamento.
"@
}
if ($donos -notmatch "no owners") {
  Fim $false @"
Este aparelho ja tem OUTRO aplicativo como dono do aparelho:
$donos

Nao da para provisionar por cima. Separe este aparelho e avise o suporte.
"@
}
Ok "Nenhum outro aplicativo controlando o aparelho"

# ADMINISTRADORES DE DISPOSITIVO ATIVOS.
#
# `list-owners` NAO enxerga isto. Ele lista dono do aparelho e dono de perfil; um
# app registrado como "administrador de dispositivo" comum nao aparece la — e o
# Android recusa `set-device-owner` quando existe QUALQUER admin ativo.
#
# Isto e exatamente o caso da frota atual: o Product.Me nao e dono do aparelho, e
# administrador + tela inicial. Sem esta checagem, o script passava por todas as
# pre-condicoes dizendo OK e sO quebrava no passo 4, com uma mensagem que mandava
# "conferir contas e usuarios" — que estao certos — e depois "separe o aparelho".
# Numa loja, com dez aparelhos iguais, isso e a viagem inteira perdida no mesmo
# ponto sem ninguem entender por que.
$saidaAdmins = (& $adb shell dumpsys device_policy 2>&1) -join "`n"
$admins = @()
foreach ($m in [regex]::Matches($saidaAdmins, 'ComponentInfo\{([^/]+)/')) {
  $pacote = $m.Groups[1].Value
  if ($pacote -ne "com.linka.agent" -and $admins -notcontains $pacote) { $admins += $pacote }
}
if ($admins.Count -gt 0) {
  $lista = ($admins | ForEach-Object { "   - $_" }) -join "`n"
  Fim $false @"
Outro aplicativo esta registrado como ADMINISTRADOR do aparelho:
$lista

O Android nao deixa o LINKA assumir o controle enquanto isso existir. Nao e
conta, nao e senha, nao e usuario extra: e o app anterior da vitrine.

O QUE FAZER:
 1. No aparelho: Ajustes > Seguranca > Mais configuracoes de seguranca >
    Apps de administracao do dispositivo.
    (Em alguns aparelhos: Ajustes > Seguranca > Apps de administracao.)
 2. DESATIVAR o aplicativo da lista acima.
 3. Se ele for a tela inicial do aparelho, troque a tela inicial antes:
    Ajustes > Apps > Aplicativos padrao > Tela inicial.
 4. Rode este programa de novo.

NAO desinstale o aplicativo anterior sem combinar: em shadow ele continua
medindo, e desinstalar apaga o historico do aparelho.
"@
}
Ok "Nenhum administrador de dispositivo concorrente"

$contas = (& $adb shell dumpsys account | Select-String -Pattern "Accounts:\s*(\d+)" | Select-Object -First 1)
$qtdContas = 0
if ($contas -and $contas.Matches.Count -gt 0) { $qtdContas = [int]$contas.Matches[0].Groups[1].Value }
if ($qtdContas -gt 0) {
  $listaContas = (& $adb shell dumpsys account | Select-String -Pattern "Account \{name=" | ForEach-Object { "   - " + $_.ToString().Trim() }) -join "`n"
  Fim $false @"
O aparelho ainda tem $qtdContas conta(s) cadastrada(s):
$listaContas

O Android NAO deixa assumir o controle com contas no aparelho.

O QUE FAZER:
 1. No aparelho: Ajustes > Contas (ou Senhas e contas).
 2. Toque em cada conta e escolha REMOVER CONTA.
 3. Rode este programa de novo.
"@
}
Ok "Nenhuma conta cadastrada"

$usuarios = @((& $adb shell pm list users) | Select-String -Pattern "UserInfo\{")
if ($usuarios.Count -gt 1) {
  Fim $false @"
O aparelho tem mais de um usuario/perfil ($($usuarios.Count)).

O QUE FAZER:
 1. Ajustes > Sistema > Varios usuarios: remova os usuarios extras.
 2. Se houver "app clonado" ou "espaco seguro", remova tambem.
 3. Rode este programa de novo.
"@
}
Ok "Um unico usuario no aparelho"

# Senha de tela: este hardware recusa o token de reset do Android, entao NAO ha
# como apagar a senha remotamente. Se o aparelho for para a prateleira com uma
# senha que ninguem sabe, no primeiro reinicio a loja fica com uma vitrine
# pedindo PIN. Melhor parar aqui do que descobrir na loja.
#
# A checagem nao gasta tentativa de senha: "clear" sem credencial devolve erro
# quando existe senha, e simplesmente remove o bloqueio por deslizar quando nao.
$saidaLock = (& $adb shell locksettings clear 2>&1) -join " "
if ($saidaLock -match "Credential can't be null|didn't match|IllegalArgumentException") {
  Fim $false @"
O aparelho tem SENHA (PIN, padrao ou digital) na tela de bloqueio.

Nao da para remover pelo computador, e um aparelho de vitrine nao pode ter
senha: depois de qualquer reinicio a loja fica com a tela pedindo o PIN.

O QUE FAZER:
 1. No aparelho: Ajustes > Seguranca > Bloqueio de tela.
 2. Escolher NENHUM (vai pedir o PIN atual uma vez).
 3. Rode este programa de novo.

Se ninguem souber o PIN, separe o aparelho e avise o suporte.
"@
}
Ok "Sem senha na tela de bloqueio"

# 3. Instalacao ---------------------------------------------------------------
Titulo "Instalando o aplicativo LINKA"

# O kit fica desatualizado sozinho: ele e copiado em pendrive e usado meses
# depois. Um aparelho de teste foi provisionado com a versao 0.15.0 quando a
# frota ja estava na 0.19.0, e ninguem percebeu ate abrir o painel.
# Por isso o script busca a versao publicada antes de instalar; o arquivo local
# so entra em campo quando a loja esta sem internet.
# target_device_type=is.null NAO e detalhe: desde 20/08 a versao publicada pode
# mirar so a TV ou so o celular, entao esta consulta passou a poder devolver MAIS
# DE UMA linha. Como o codigo abaixo pega $r[0] de um resultado sem ordem, um
# celular podia sair da bancada com o APK da TV — e ninguem descobriria ate o
# aparelho estar na loja. Este filtro fixa a versao GERAL, que e a que serve
# qualquer aparelho; quem tiver versao mirada se atualiza sozinho no primeiro
# contato com o painel, em ate um minuto.
$urlVersao = "https://xkzktmsqtvpkxmzftars.supabase.co/rest/v1/agent_releases?is_current=eq.true&target_device_type=is.null&select=version,url"
try {
  $r = Invoke-RestMethod -Uri $urlVersao -Headers @{ apikey = $anonKey } -TimeoutSec 20
  if ($r -and $r[0].url) {
    $baixado = Join-Path $env:TEMP ("linka-agente-" + $r[0].version + ".apk")
    if (-not (Test-Path $baixado)) {
      Invoke-WebRequest -Uri $r[0].url -OutFile $baixado -TimeoutSec 180
    }
    $apk = $baixado
    Ok ("Versao publicada: " + $r[0].version)
  }
} catch {
  Aviso "Sem internet para buscar a versao publicada. Usando o arquivo do pendrive."
}

if (-not (Test-Path $apk)) {
  Fim $false "Arquivo linka-agente.apk nao encontrado nesta pasta. Avise o suporte."
}
# ATENCAO: comparar array com -match no PowerShell FILTRA em vez de devolver
# verdadeiro/falso. Sem o -join, uma saida de varias linhas dava "falhou" num
# aparelho que tinha sido provisionado com sucesso.
$saidaInstall = (& $adb install -r $apk 2>&1) -join " "

# Aparelho que ja teve uma versao antiga do LINKA (assinada com outra chave) nao
# aceita instalar por cima. Nesse caso o app precisa sair antes.
if ($saidaInstall -match "INSTALL_FAILED_UPDATE_INCOMPATIBLE|signatures do not match") {
  Aviso "Ja existe um LINKA antigo neste aparelho, com assinatura diferente"
  if ($donos -match "com.linka.agent") {
    Fim $false @"
Este aparelho tem um LINKA antigo que ainda esta como dono do aparelho.

O QUE FAZER:
 1. No painel, abra este aparelho e clique em DESPROVISIONAR.
 2. Espere ate o painel mostrar "Sem bloqueio" (ate 1 minuto).
 3. Rode este programa de novo.
"@
  }
  $saidaRemove = (& $adb uninstall com.linka.agent 2>&1) -join " "
  if ($saidaRemove -match "Success") {
    Ok "Versao antiga removida"
    $saidaInstall = (& $adb install -r $apk 2>&1) -join " "
  } else {
    Fim $false "Nao foi possivel remover a versao antiga:`n$saidaRemove"
  }
}

# Aparelho com uma versao MAIS NOVA que a publicada: nao e erro, e um aparelho
# que ja tinha o app. O Android recusa a instalacao para baixo, e o kit tratava
# isso como falha e parava o provisionamento no meio.
if ($saidaInstall -match "INSTALL_FAILED_VERSION_DOWNGRADE") {
  $instalada = ((& $adb shell dumpsys package com.linka.agent) -join " ") -replace ".*versionName=([0-9.]+).*", '$1'
  Aviso "O aparelho ja tem uma versao mais nova ($instalada). Mantendo a que esta."
  $saidaInstall = "Success"
}

if ($saidaInstall -match "Success") { Ok "Aplicativo instalado" }
else { Fim $false "Falha ao instalar o aplicativo:`n$saidaInstall" }

# 4. Assumir o controle -------------------------------------------------------
Titulo "Assumindo o controle do aparelho"
$saidaOwner = (& $adb shell cmd device_policy set-device-owner $admin 2>&1) -join " "
if ($saidaOwner -notmatch "Success") {
  # A recusa do Android vem em texto, e cada motivo tem conserto diferente. Sem
  # traduzir, todos viram "avise o suporte" — e o promotor na loja fica sem saber
  # que bastava desativar um app no menu de seguranca.
  $comoResolver = if ($saidaOwner -match "already some device admins|device admin") {
@"
MOTIVO: ainda existe um administrador de dispositivo ativo (o app anterior
da vitrine). Ele pode ter sido reativado desde a conferencia.

 1. Ajustes > Seguranca > Apps de administracao do dispositivo.
 2. Desativar o aplicativo anterior.
 3. Rodar este programa de novo.
"@
  } elseif ($saidaOwner -match "already set|already provisioned") {
@"
MOTIVO: o aparelho ja passou pela configuracao inicial com um dono definido.
Este caminho nao resolve. Separe o aparelho e avise o suporte.
"@
  } elseif ($saidaOwner -match "accounts|account") {
@"
MOTIVO: sobrou conta cadastrada no aparelho.

 1. Ajustes > Contas (ou Senhas e contas): remover TODAS.
 2. Rodar este programa de novo.
"@
  } else {
@"
O QUE FAZER: confira contas e usuarios (passos anteriores) e tente de novo.
Se insistir, separe o aparelho e avise o suporte.
"@
  }
  Fim $false @"
Nao foi possivel assumir o controle do aparelho.

Resposta do aparelho:
$saidaOwner

$comoResolver
"@
}

Ok "Controle assumido"

# Permissoes que so existem por aqui. CONFERIR e obrigatorio: o comando de
# concessao roda sem erro mesmo quando nao surte efeito (foi o que aconteceu com
# a medicao de uso, que ficava "default" e o script dizia OK).
$permissoes = @(
  @{ op = "SYSTEM_ALERT_WINDOW";     nome = "Retorno automatico a vitrine" }
  @{ op = "GET_USAGE_STATS";         nome = "Medicao de uso (telemetria)" }
  @{ op = "MANAGE_EXTERNAL_STORAGE"; nome = "Limpeza de fotos e videos" }
)
$permFaltando = @()
foreach ($p in $permissoes) {
  & $adb shell appops set com.linka.agent $($p.op) allow 2>&1 | Out-Null
  $estado = (& $adb shell appops get com.linka.agent $($p.op) 2>&1) -join " "
  if ($estado -match "allow") { Ok $p.nome }
  else { Falha "$($p.nome) - nao foi concedida"; $permFaltando += $p.nome }
}

# 5. Verificacao (o que vale e o que o aparelho confirma) ---------------------
Titulo "Conferindo se as travas pegaram"
# REINICIAR O APP AQUI NAO FUNCIONA MAIS, e e importante saber disso.
#
# Depois que o aplicativo vira dono do aparelho, o Android PROTEGE o processo:
# 'am force-stop' roda sem erro e nao mata nada. Descoberto em 20/08
# provisionando um tablet Samsung com o app ja aberto.
#
# Antes isso passava despercebido porque no fluxo normal o app acabou de ser
# instalado e nao esta rodando: o 'am start' abaixo criava um processo novo, e
# era ESSE processo que aplicava as travas no onCreate. Quando o app ja estava
# aberto, nada reiniciava e o aparelho ficava dono SEM TRAVA NENHUMA — parecendo
# protegido no painel e aceitando modo aviao na mao do cliente.
#
# A partir da 0.106.0 quem aplica as travas e o proprio receptor, no instante em
# que o cargo chega (LinkaDeviceAdminReceiver.onEnabled). Este passo deixou de
# ser o que garante a protecao e virou so 'traga a vitrine para a frente'.
# O force-stop continua aqui de proposito: em aparelho que ainda NAO virou dono
# ele funciona, e nao custa nada onde nao funciona.
& $adb shell am force-stop com.linka.agent | Out-Null
& $adb shell am start -n com.linka.agent/.MainActivity | Out-Null
Start-Sleep -Seconds 4

$restricoes = (& $adb shell dumpsys user) -join "`n"
$travas = @{
  "Modo aviao bloqueado"      = "no_airplane_mode"
  "Wi-Fi nao pode ser desligado" = "no_change_wifi_state"
  "Rede Wi-Fi nao pode ser trocada" = "no_config_wifi"
}
$faltando = @()
foreach ($nome in $travas.Keys) {
  if ($restricoes -match $travas[$nome]) { Ok $nome } else { Falha $nome; $faltando += $nome }
}

# Teste pratico: tentar ligar o modo aviao. Tem que falhar.
& $adb shell cmd connectivity airplane-mode enable 2>&1 | Out-Null
Start-Sleep -Seconds 2
$aviao = (& $adb shell settings get global airplane_mode_on).Trim()
if ($aviao -eq "0") {
  Ok "Teste pratico: tentei ligar o modo aviao e o aparelho recusou"
} else {
  & $adb shell cmd connectivity airplane-mode disable 2>&1 | Out-Null
  $faltando += "Teste pratico do modo aviao"
  Falha "Teste pratico: o modo aviao LIGOU (nao deveria)"
}

$faltando += $permFaltando
if ($faltando.Count -gt 0) {
  Fim $false @"
O controle foi assumido, mas estes itens nao confirmaram:
 - $($faltando -join "`n - ")

Tire foto desta tela e avise o suporte ANTES de devolver o aparelho a vitrine.
"@
}

# 6. Entrada na frota ---------------------------------------------------------
# O aparelho se cadastra sozinho: o codigo vai pelo cabo, o tecnico nao digita.
#
# Sao DOIS codigos: o do cliente (um so, vale para a marca inteira, fica em
# codigo-de-inscricao.txt) e o da LOJA onde a visita esta acontecendo. Juntos,
# o aparelho entra na frota ja vinculado a loja certa.
#
# O da loja e perguntado UMA VEZ por visita e guardado em loja-atual.txt: sao
# quinze aparelhos por loja, e digitar quinze vezes o mesmo codigo e como se
# erra na decima. Apagar esse arquivo (ou responder outro codigo) e o que muda
# de loja.
Titulo "Entrando na frota"
$arquivoCodigo = Join-Path $base "codigo-de-inscricao.txt"
$codigo = ""
if (Test-Path $arquivoCodigo) {
  $codigo = (Get-Content $arquivoCodigo -Raw).Trim().ToUpper()
}
if (-not $codigo) {
  Write-Host ""
  $codigo = (Read-Host "  Codigo do cliente (esta na folha do kit)").Trim().ToUpper()
}

$arquivoLoja = Join-Path $base "loja-atual.txt"
$loja = ""
if (Test-Path $arquivoLoja) {
  $loja = (Get-Content $arquivoLoja -Raw).Trim().ToUpper()
}
Write-Host ""
if ($loja) {
  $resposta = (Read-Host "  Codigo da loja [$loja] (Enter mantem, ou digite outro)").Trim().ToUpper()
  if ($resposta) { $loja = $resposta }
} else {
  $loja = (Read-Host "  Codigo da loja desta visita (esta na ordem de servico)").Trim().ToUpper()
}
if ($loja) { Set-Content -Path $arquivoLoja -Value $loja }

if ($codigo) {
  $completo = if ($loja) { "$codigo-$loja" } else { $codigo }
  # -S para o app antes de abrir. Sem isso o Android entrega o codigo a uma tela
  # que ja esta aberta, e o pareamento nao acontece.
  # O codigo vai por ARQUIVO, nao por comando.
  #
  # Mandar junto com o comando de abrir o app nao funciona quando o app ja esta
  # aberto: depois do provisionamento a vitrine sobe sozinha, e o Android
  # descarta o codigo. Na pratica o tecnico digitava a mao em todo aparelho, o
  # que em 250 aparelhos e meia hora de atraso e um erro de digitacao garantido.
  #
  # O arquivo nao depende de nada disso. O app le e apaga.
  & $adb shell "echo $completo > /sdcard/linka-enroll.txt" 2>&1 | Out-Null
  & $adb shell am start -S -n com.linka.agent/.MainActivity -e enroll $completo 2>&1 | Out-Null

  # ── Conferir em vez de contar ate oito ─────────────────────────────────────
  #
  # Antes aqui havia um "Start-Sleep 8" e um "deu certo" logo em seguida. Isso
  # nao verificava nada: se um pedido de permissao aparecesse por cima da tela,
  # o aparelho ficava parado esperando um toque humano, o script anunciava
  # sucesso, e o tecnico ia embora com um aparelho que nunca entrou na frota.
  # Aconteceu.
  #
  # Agora espera de verdade, ate 90 segundos, olhando a tela do aparelho. E
  # quando o que esta na frente e um pedido de permissao, ele DIZ isso, em vez
  # de deixar a pessoa olhando para um "aguarde" sem pista nenhuma.
  Write-Host ""
  $entrou = $false
  $avisouPermissao = $false
  $digitou = $false
  for ($t = 0; $t -lt 45; $t++) {
    Start-Sleep -Seconds 2
    & $adb shell uiautomator dump /sdcard/linka-tela.xml 2>&1 | Out-Null
    $tela = (& $adb shell cat /sdcard/linka-tela.xml 2>&1) -join " "

    # Pedido de permissao na frente: so a pessoa resolve, e ela precisa saber.
    if ($tela -match 'Permitir|PERMITIR|Allow|ALLOW|Continuar|permission') {
      if (-not $avisouPermissao) {
        Write-Host ""
        Write-Host "  >>> OLHE A TELA DO APARELHO <<<" -ForegroundColor Yellow
        Write-Host "  Ele esta pedindo uma permissao. Toque em PERMITIR." -ForegroundColor Yellow
        Write-Host "  O programa continua sozinho assim que voce liberar." -ForegroundColor Yellow
        Write-Host ""
        $avisouPermissao = $true
      }
      continue
    }

    # Saiu da tela de pareamento = entrou na frota.
    if ($tela -notmatch 'Codigo de pareamento|Código de pareamento') {
      $entrou = $true
      break
    }

    # Ainda na tela de pareamento: DIGITA o codigo, como uma pessoa faria.
    #
    # Mandar o codigo junto com o comando de abrir o app nao e confiavel: quando
    # o app ja esta aberto, o Android entrega o codigo por outra porta e ele se
    # perde. Na pratica o tecnico tinha que digitar a mao toda vez, e o kit
    # dizia que estava tudo certo. Aqui a gente para de torcer: acha o campo na
    # tela, digita e toca no botao.
    if (-not $digitou -and $t -ge 2) {
      if ($tela -match 'text="Código de pareamento"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"') {
        $cx = [int](([int]$Matches[1] + [int]$Matches[3]) / 2)
        $cy = [int](([int]$Matches[2] + [int]$Matches[4]) / 2)
        if ($tela -match 'text="Parear"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"') {
          $bx = [int](([int]$Matches[1] + [int]$Matches[3]) / 2)
          $by = [int](([int]$Matches[2] + [int]$Matches[4]) / 2)
          & $adb shell input tap $cx $cy 2>&1 | Out-Null
          Start-Sleep -Milliseconds 600
          & $adb shell input text $completo 2>&1 | Out-Null
          Start-Sleep -Milliseconds 600
          & $adb shell input tap $bx $by 2>&1 | Out-Null
          $digitou = $true
          Write-Host "  codigo digitado no aparelho"
        }
      }
    }

    if ($t % 5 -eq 0) { Write-Host "  aguardando o aparelho entrar na frota..." }
  }

  if ($entrou) {
    Ok "Aparelho entrou na frota"
  } else {
    # Fim $false encerra o programa. Nao pode seguir para a mensagem de
    # "APARELHO PRONTO": foi exatamente esse "pronto" mentiroso que fez um
    # aparelho voltar para a vitrine sem estar na frota.
    Fim $false @"
O aparelho NAO entrou na frota.

Ele continua na tela de pareamento depois de 90 segundos. Os motivos
mais comuns, nesta ordem:

 1. Um pedido de permissao ficou aberto na tela e ninguem tocou
 2. O aparelho esta sem internet (confira o Wi-Fi)
 3. O codigo do kit esta desatualizado

Olhe a tela do aparelho AGORA e diga ao suporte o que aparece nela.
NAO devolva o aparelho para a vitrine assim.
"@
  }

  $recado = if ($loja) {
@"
CONFIRA NA TELA DO APARELHO: ele mostra por 5 segundos o cliente e a
LOJA em que entrou. Se a loja estiver errada, avise agora - depois
alguem tem que corrigir aparelho por aparelho no escritorio.

Se aparecer "Loja nao encontrada", o codigo da loja esta errado.
Confira na ordem de servico e rode de novo.
"@
  } else {
@"
ATENCAO: este aparelho entrou SEM LOJA, porque nenhum codigo de loja
foi informado. Alguem vai ter que dizer no escritorio em que loja ele
esta. Da proxima vez, informe o codigo da loja.
"@
  }

  Fim $true @"
Aparelho: $modelo (Android $android)

O aparelho ja entrou na frota sozinho. Ele aparece no painel em
Dispositivos, em ate 1 minuto, com modelo e versao do Android
preenchidos.

$recado
Se a tela ainda pedir codigo, digite $completo nela e aguarde.
"@
}

Fim $true @"
Aparelho: $modelo (Android $android)

O QUE FALTA (no proprio aparelho):
 1. Abra o app LINKA.
 2. Digite o CODIGO DE INSCRICAO (o mesmo para todos os aparelhos
    deste cliente; esta no painel, em Dispositivos).
 3. Aguarde ate o video comecar a tocar sozinho.

Nao precisa mexer em mais nada. O aparelho ja aparece no painel.
"@
