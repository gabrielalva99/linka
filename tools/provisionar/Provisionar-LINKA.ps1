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
$urlVersao = "https://xkzktmsqtvpkxmzftars.supabase.co/rest/v1/agent_releases?is_current=eq.true&select=version,url"
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
# E um codigo so para o cliente inteiro, guardado em codigo-de-inscricao.txt no
# kit. Se o arquivo nao existir, o script pergunta uma vez por visita.
Titulo "Entrando na frota"
$arquivoCodigo = Join-Path $base "codigo-de-inscricao.txt"
$codigo = ""
if (Test-Path $arquivoCodigo) {
  $codigo = (Get-Content $arquivoCodigo -Raw).Trim().ToUpper()
}
if (-not $codigo) {
  Write-Host ""
  $codigo = (Read-Host "  Codigo de inscricao (aparece no painel, em Dispositivos)").Trim().ToUpper()
}

if ($codigo) {
  & $adb shell am start -n com.linka.agent/.MainActivity -e enroll $codigo 2>&1 | Out-Null
  Start-Sleep -Seconds 8
  Ok "Codigo enviado ao aparelho"
  Fim $true @"
Aparelho: $modelo (Android $android)

O aparelho ja entrou na frota sozinho. Ele aparece no painel em
Dispositivos, em ate 1 minuto, com modelo e versao do Android
preenchidos.

NO ESCRITORIO: falta so dizer em que loja ele fica.

Se a tela ainda pedir codigo, digite $codigo nela e aguarde.
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
