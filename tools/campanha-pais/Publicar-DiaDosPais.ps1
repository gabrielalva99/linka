# LINKA — publica a campanha do Dia dos Pais nos dois clientes.
#
# POR QUE ESTE PROGRAMA EXISTE. São catorze arquivos da mesma peça, um por
# formato de tela, e eles precisam ir para DOIS clientes (Teste e Motorola) — 28
# envios. Além de subir, cada arquivo precisa entrar na biblioteca com a
# resolução certa, ser ligado à peça principal como "versão para outra tela", e
# a campanha precisa ser criada e apontada. Feito à mão são mais de sessenta
# passos, e basta errar um para a vitrine receber o arquivo errado.
#
# O QUE ELE FAZ, na ordem:
#   1. Sobe os catorze vídeos para cada cliente
#   2. Cadastra cada um na biblioteca com a resolução LIDA DO ARQUIVO
#   3. Elege 1080x2400 como peça principal e liga as outras treze a ela
#   4. Cria a campanha "Dia dos Pais 2026", ativa, valendo para o cliente inteiro
#
# Rodar de novo NÃO duplica nada: ele confere o que já existe antes de criar.

$ErrorActionPreference = "Stop"
$SB = "https://xkzktmsqtvpkxmzftars.supabase.co"

# A pasta do pack. Troque aqui se os arquivos estiverem em outro lugar.
$PASTA = "C:\Users\GabrielNevesdeAlvare\Downloads\drive-download-20260808T024815Z-1-001"

# A peça PRINCIPAL: é para ela que a campanha aponta, e é ela que o aparelho
# recebe quando o formato dele não casa com nenhuma versão. 20:9 é a proporção
# mais comum em celular hoje, então é a que erra menos no aparelho imprevisto.
$PRINCIPAL_W = 1080
$PRINCIPAL_H = 2400

$CLIENTES = @("Teste", "Motorola")

function Titulo($t) { Write-Host ""; Write-Host "=== $t" -ForegroundColor Cyan }
function Ok($t)     { Write-Host "  [OK] $t" -ForegroundColor Green }
function Aviso($t)  { Write-Host "  [!] $t" -ForegroundColor Yellow }
function Erro($t)   { Write-Host "  [X] $t" -ForegroundColor Red }

Clear-Host
Write-Host "LINKA - Campanha Dia dos Pais" -ForegroundColor White
Write-Host "-----------------------------"

# ── A chave ──────────────────────────────────────────────────────────────────
#
# É a `service_role` do Supabase: Dashboard > Project Settings > API Keys.
# Ela passa por cima de todas as travas de acesso, então NÃO fica salva em
# arquivo nenhum — é pedida a cada execução e vive só na memória deste programa.
Titulo "Chave de acesso"
$segura = Read-Host "  Cole a chave service_role do Supabase" -AsSecureString
$KEY = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura))
if (-not $KEY -or $KEY.Length -lt 40) { Erro "Chave vazia ou curta demais."; Read-Host "ENTER"; exit 1 }
$H = @{ Authorization = "Bearer $KEY"; apikey = $KEY; "Content-Type" = "application/json" }

try {
  $null = Invoke-RestMethod -Uri "$SB/rest/v1/tenants?select=id&limit=1" -Headers $H -TimeoutSec 20
  Ok "Chave aceita"
} catch { Erro "A chave nao foi aceita: $($_.Exception.Message)"; Read-Host "ENTER"; exit 1 }

# ── Os arquivos ──────────────────────────────────────────────────────────────
#
# A resolução sai do ARQUIVO, pelas propriedades do Windows, e nunca do nome:
# este mesmo pack veio com "1056 x 1066" e "1066x1056" no mesmo lote, e um leitor
# de nome erraria justo no formato incomum, que é o que mais importa acertar.
Titulo "Lendo os arquivos"
if (-not (Test-Path $PASTA)) { Erro "Pasta nao encontrada: $PASTA"; Read-Host "ENTER"; exit 1 }
$shell = New-Object -ComObject Shell.Application
$dir = $shell.Namespace($PASTA)
$arquivos = @()
Get-ChildItem $PASTA -Filter *.mp4 | Sort-Object Name | ForEach-Object {
  $i = $dir.ParseName($_.Name)
  $h = [int](($dir.GetDetailsOf($i,328)) -replace '[^\d]','')
  $w = [int](($dir.GetDetailsOf($i,330)) -replace '[^\d]','')
  if ($w -gt 0 -and $h -gt 0) {
    $arquivos += [pscustomobject]@{ Caminho=$_.FullName; W=$w; H=$h; Destino="pais2026-${w}x${h}.mp4" }
  } else {
    Aviso "Sem resolucao legivel, ficou de fora: $($_.Name)"
  }
}
if ($arquivos.Count -eq 0) { Erro "Nenhum video legivel na pasta."; Read-Host "ENTER"; exit 1 }
Ok "$($arquivos.Count) videos lidos"
if (-not ($arquivos | Where-Object { $_.W -eq $PRINCIPAL_W -and $_.H -eq $PRINCIPAL_H })) {
  Erro "A peca principal ${PRINCIPAL_W}x${PRINCIPAL_H} nao esta na pasta. Sem ela a campanha nao tem para onde apontar."
  Read-Host "ENTER"; exit 1
}

# ── Por cliente ──────────────────────────────────────────────────────────────
foreach ($nomeCliente in $CLIENTES) {
  Titulo "Cliente: $nomeCliente"

  $t = Invoke-RestMethod -Uri "$SB/rest/v1/tenants?select=id,name&name=eq.$([uri]::EscapeDataString($nomeCliente))" -Headers $H
  if (-not $t) { Aviso "Cliente '$nomeCliente' nao existe. Pulando."; continue }
  $tid = $t[0].id

  # 1. Enviar e cadastrar
  $porFormato = @{}
  foreach ($a in $arquivos) {
    $path = "$tid/$($a.Destino)"
    $url  = "$SB/storage/v1/object/public/content/$path"

    $ja = Invoke-RestMethod -Uri "$SB/rest/v1/media_assets?select=id,width,height&url=eq.$([uri]::EscapeDataString($url))" -Headers $H
    if ($ja) {
      $porFormato["$($a.W)x$($a.H)"] = $ja[0].id
      continue
    }

    # upsert no armazenamento: reenviar por cima é seguro e deixa o programa
    # repetivel quando a rede cai no meio de um lote de 28 envios.
    $bytes = [IO.File]::ReadAllBytes($a.Caminho)
    Invoke-RestMethod -Uri "$SB/storage/v1/object/content/$path" -Method Post -Body $bytes `
      -Headers @{ Authorization="Bearer $KEY"; apikey=$KEY; "Content-Type"="video/mp4"; "x-upsert"="true" } -TimeoutSec 300 | Out-Null

    $linha = @{
      tenant_id = $tid
      name = "Dia dos Pais 2026 - $($a.W)x$($a.H)"
      storage_path = $path
      url = $url
      content_type = "video/mp4"
      size_bytes = (Get-Item $a.Caminho).Length
      width = $a.W
      height = $a.H
    } | ConvertTo-Json
    $novo = Invoke-RestMethod -Uri "$SB/rest/v1/media_assets" -Method Post -Body $linha `
      -Headers ($H + @{ Prefer = "return=representation" })
    $porFormato["$($a.W)x$($a.H)"] = $novo[0].id
    Write-Host ("    enviado {0}x{1}" -f $a.W, $a.H)
  }
  Ok "$($porFormato.Count) arquivos na biblioteca"

  # 2. Ligar as versões à peça principal
  $idPrincipal = $porFormato["${PRINCIPAL_W}x${PRINCIPAL_H}"]
  $ligadas = 0
  foreach ($chave in $porFormato.Keys) {
    if ($chave -eq "${PRINCIPAL_W}x${PRINCIPAL_H}") { continue }
    $corpo = @{ variant_of = $idPrincipal } | ConvertTo-Json
    Invoke-RestMethod -Uri "$SB/rest/v1/media_assets?id=eq.$($porFormato[$chave])" -Method Patch -Body $corpo -Headers $H | Out-Null
    $ligadas++
  }
  Ok "$ligadas versoes ligadas a peca ${PRINCIPAL_W}x${PRINCIPAL_H}"

  # 3. A campanha
  $nomeCamp = "Dia dos Pais 2026"
  $c = Invoke-RestMethod -Uri "$SB/rest/v1/campaigns?select=id&tenant_id=eq.$tid&name=eq.$([uri]::EscapeDataString($nomeCamp))" -Headers $H
  if ($c) {
    $cid = $c[0].id
    Aviso "Campanha ja existia, reaproveitada"
  } else {
    $corpo = @{ tenant_id = $tid; name = $nomeCamp; is_active = $true; rotation_seconds = 180 } | ConvertTo-Json
    $nova = Invoke-RestMethod -Uri "$SB/rest/v1/campaigns" -Method Post -Body $corpo -Headers ($H + @{ Prefer = "return=representation" })
    $cid = $nova[0].id
    Ok "Campanha criada"
  }

  # O item aponta para a PEÇA PRINCIPAL, e só para ela. As outras treze entram
  # sozinhas na hora da entrega, escolhidas pela tela de cada aparelho.
  $it = Invoke-RestMethod -Uri "$SB/rest/v1/campaign_items?select=id&campaign_id=eq.$cid" -Headers $H
  if (-not $it) {
    $corpo = @{ tenant_id = $tid; campaign_id = $cid; media_id = $idPrincipal; position = 1 } | ConvertTo-Json
    Invoke-RestMethod -Uri "$SB/rest/v1/campaign_items" -Method Post -Body $corpo -Headers $H | Out-Null
    Ok "Peca principal adicionada a campanha"
  }

  $tg = Invoke-RestMethod -Uri "$SB/rest/v1/campaign_targets?select=id&campaign_id=eq.$cid" -Headers $H
  if (-not $tg) {
    $corpo = @{ tenant_id = $tid; campaign_id = $cid; scope = "tenant" } | ConvertTo-Json
    Invoke-RestMethod -Uri "$SB/rest/v1/campaign_targets" -Method Post -Body $corpo -Headers $H | Out-Null
    Ok "Campanha vale para todos os aparelhos do cliente"
  }
}

Write-Host ""
Write-Host "###############################################" -ForegroundColor Green
Write-Host "#  CAMPANHA PUBLICADA                         #" -ForegroundColor Green
Write-Host "###############################################" -ForegroundColor Green
Write-Host ""
Write-Host "CONFIRA NO PAINEL, em Biblioteca: a peca ${PRINCIPAL_W}x${PRINCIPAL_H} aparece"
Write-Host "com 'Outros formatos desta peca (13)' embaixo dela."
Write-Host ""
Write-Host "E preencha a TELA DE CADA MODELO em Frota > Modelos. Sem isso a"
Write-Host "escolha por formato nao acontece e todo aparelho recebe a peca"
Write-Host "principal - que e exatamente o comportamento de antes."
Write-Host ""
Read-Host "Pressione ENTER para fechar"
