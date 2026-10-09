#Requires -Version 7.0
param([int]$Year = 2026)
$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
$publicDataPath = Join-Path $projectPath 'public/data'
$geometryPath = Join-Path $publicDataPath 'municipalities'
New-Item -ItemType Directory -Path $geometryPath -Force | Out-Null

$catalogUrl = 'https://resultados.tse.jus.br/oficial/comum/config/ele-c.json'
$catalog = Invoke-RestMethod -Uri $catalogUrl -TimeoutSec 45
$pleito = $catalog.pl | Where-Object { $_.c -eq ('ele' + $Year) } | Select-Object -First 1
$election = $pleito.e | Where-Object { $_.t -eq '1' -and ($_.abr.cp.cd -contains '6') } | Select-Object -First 1
if (-not $election.cd) { throw "A configuração pública do TSE não contém a eleição estadual de $Year." }
$electionId = [string]$election.cd
$electionUrl = 'https://resultados.tse.jus.br/oficial/ele' + $Year + '/' + $electionId + '/config/mun-e' + $electionId.PadLeft(6, '0') + '-cm.json'
$electionConfig = Invoke-RestMethod -Uri $electionUrl -TimeoutSec 45
$municipalitiesUrl = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome'
$ibgeMunicipalities = Invoke-RestMethod -Uri $municipalitiesUrl -TimeoutSec 45
$byId = @{}
foreach ($municipality in $ibgeMunicipalities) { $byId[[string]$municipality.id] = $municipality }
$municipalities = [System.Collections.Generic.List[object]]::new()
$zonesByState = @{}
foreach ($scope in $electionConfig.abr) {
  $state = ([string]$scope.cd).ToUpper()
  if ($state -eq 'ZZ') { continue }
  $zonesByState[$state] = @{}
  foreach ($row in $scope.mu) {
    $id = [string]$row.cdi
    $tseCode = ([string]$row.cd).PadLeft(5, '0')
    $ibge = $byId[$id]
    if (-not $ibge -or $id -notmatch '^[0-9]{7}$' -or $tseCode -notmatch '^[0-9]{5}$') { throw "Código municipal inválido: $id / $tseCode." }
    $municipalityState = $ibge.microrregiao.mesorregiao.UF.sigla
    if (-not $municipalityState) { $municipalityState = $ibge.'regiao-imediata'.'regiao-intermediaria'.UF.sigla }
    if ($municipalityState -ne $state) { throw "UF inconsistente para o município $id." }
    $municipalities.Add(@{ id = $id; name = $ibge.nome; state = $state; tseCode = $tseCode })
    $zoneNumbers = @($row.z | ForEach-Object { [int]$_ } | Sort-Object -Unique)
    if (-not $zoneNumbers.Count -or ($zoneNumbers | Where-Object { $_ -lt 1 })) { throw "Zonas inválidas para $id." }
    $zonesByState[$state][$tseCode] = $zoneNumbers
  }
}
if ($municipalities.Count -ne $ibgeMunicipalities.Count) { throw 'O cadastro TSE não cobre todos os municípios IBGE; revise as duas fontes antes de gerar o snapshot.' }

$stateCodes = @{RO=11;AC=12;AM=13;RR=14;PA=15;AP=16;TO=17;MA=21;PI=22;CE=23;RN=24;PB=25;PE=26;AL=27;SE=28;BA=29;MG=31;ES=32;RJ=33;SP=35;PR=41;SC=42;RS=43;MS=50;MT=51;GO=52;DF=53}
$geometryIds = [System.Collections.Generic.HashSet[string]]::new()
foreach ($state in $stateCodes.Keys) {
  $url = 'https://servicodados.ibge.gov.br/api/v3/malhas/estados/' + $stateCodes[$state] + '?intrarregiao=municipio&formato=application/vnd.geo%2Bjson&qualidade=minima'
  $path = Join-Path $geometryPath ($state.ToLower() + '.json')
  Invoke-WebRequest -Uri $url -OutFile $path -TimeoutSec 45
  $geometry = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
  if ($geometry.type -ne 'FeatureCollection') { throw "Malha inválida de $state." }
  foreach ($feature in $geometry.features) {
    $id = [string]$feature.properties.codarea
    if (-not $byId.ContainsKey($id) -or -not $id.StartsWith([string]$stateCodes[$state])) { throw "Código inesperado na malha de $state : $id." }
    if (-not $geometryIds.Add($id)) { throw "Polígono municipal repetido: $id." }
  }
  Write-Host "$state : $($geometry.features.Count) polígonos oficiais"
}
$zonesByYear = @{}
$zonesByYear[[string]$Year] = $zonesByState
$sources = @{
  municipalities = $municipalitiesUrl
  tseGeneratedAt = $electionConfig.dg + ' ' + $electionConfig.hg
  geometries = 'https://servicodados.ibge.gov.br/api/v3/malhas/estados/{IBGE_UF}?intrarregiao=municipio&formato=application/vnd.geo%2Bjson&qualidade=minima'
}
$sources['election' + $Year] = $electionUrl
$result = @{
  version = 1
  preparedAt = [DateTime]::UtcNow.ToString('o')
  sources = $sources
  municipalities = @($municipalities | Sort-Object state,name)
  zones = $zonesByYear
  geometryUnavailable = @($municipalities | Where-Object { -not $geometryIds.Contains($_.id) } | ForEach-Object { $_.id })
}
$result | ConvertTo-Json -Depth 40 -Compress | Set-Content -LiteralPath (Join-Path $publicDataPath 'territories.json') -Encoding utf8NoBOM
Write-Host "Snapshot pronto: $($municipalities.Count) municípios / $($geometryIds.Count) polígonos."
