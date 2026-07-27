# LINKA - Provisionamento de aparelho em campo.
#
# Feito para ser rodado por tecnico, nao por desenvolvedor: nenhum comando
# digitado, nenhuma decisao tecnica. O script confere as pre-condicoes, instala,
# assume o controle do aparelho e VERIFICA se as travas pegaram de fato.
# Se algo falhar, ele diz em portugues o que fazer.

$ErrorActionPreference = "Stop"
$base = Split-Path -Parent $MyInvocation.MyCommand.Path
$adb = Join-Path $base "adb.exe"
if (-not (Test-Path $adb)) { $adb = "adb" }
$apk = Join-Path $base "linka-agente.apk"
$admin = "com.linka.agent/.LinkaDeviceAdminReceiver"

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

# 3. Instalacao ---------------------------------------------------------------
Titulo "Instalando o aplicativo LINKA"
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

if ($saidaInstall -match "Success") { Ok "Aplicativo instalado" }
else { Fim $false "Falha ao instalar o aplicativo:`n$saidaInstall" }

# 4. Assumir o controle -------------------------------------------------------
Titulo "Assumindo o controle do aparelho"
$saidaOwner = (& $adb shell cmd device_policy set-device-owner $admin 2>&1) -join " "
if ($saidaOwner -notmatch "Success") {
  Fim $false @"
Nao foi possivel assumir o controle do aparelho.

Resposta do aparelho:
$saidaOwner

O QUE FAZER: confira contas e usuarios (passos anteriores) e tente de novo.
Se insistir, separe o aparelho e avise o suporte.
"@
}
Ok "Controle assumido"

# Sem esta permissao o Android proibe o app de voltar sozinho para a frente
# quando o cliente deixa o aparelho em outra tela.
& $adb shell appops set com.linka.agent SYSTEM_ALERT_WINDOW allow 2>&1 | Out-Null
Ok "Permissao de retorno automatico concedida"

# Medicao de uso (quais telas o cliente abriu e por quanto tempo). Sem isto o
# Android nao entrega esse dado a nenhum app comum.
& $adb shell appops set com.linka.agent GET_USAGE_STATS allow 2>&1 | Out-Null
Ok "Permissao de medicao de uso concedida"

# 5. Verificacao (o que vale e o que o aparelho confirma) ---------------------
Titulo "Conferindo se as travas pegaram"
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

if ($faltando.Count -gt 0) {
  Fim $false @"
O controle foi assumido, mas estas travas nao confirmaram:
 - $($faltando -join "`n - ")

Tire foto desta tela e avise o suporte ANTES de devolver o aparelho a vitrine.
"@
}

Fim $true @"
Aparelho: $modelo (Android $android)

O QUE FALTA (no proprio aparelho):
 1. Abra o app LINKA Agente.
 2. Digite o CODIGO DE PAREAMENTO da etiqueta deste aparelho.
 3. Aguarde ate o video comecar a tocar sozinho.

Nao precisa mexer em mais nada. O aparelho ja aparece no painel.
"@
