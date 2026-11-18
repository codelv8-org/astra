param([ValidateSet('setup','api','web','stop')][string]$Action='setup')
$ErrorActionPreference='Stop'
$taskRoot=Join-Path $PSScriptRoot '..\.local\phase3-dev'
$taskRoot=[IO.Path]::GetFullPath($taskRoot)
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if(!$taskRoot.StartsWith($repo+[IO.Path]::DirectorySeparatorChar)){throw 'Invalid local development path'}
$pgBin=Split-Path (Get-Command postgres.exe).Source
$configPath=Join-Path $taskRoot 'config.json'
if($Action -eq 'setup'){
 New-Item -ItemType Directory -Force $taskRoot | Out-Null
 if(!(Test-Path $configPath)){
  $bytes=New-Object byte[] 32;$rng=[Security.Cryptography.RandomNumberGenerator]::Create();$rng.GetBytes($bytes);$rng.Dispose()
  $password=([BitConverter]::ToString($bytes) -replace '-','')
  @{databaseUrl="postgresql://crewnest:$password@127.0.0.1:55439/crewnest_phase3";password=$password;ownerName='owner';ownerPassword=[Guid]::NewGuid().ToString()+[Guid]::NewGuid().ToString()} | ConvertTo-Json | Set-Content $configPath
 }
 $config=Get-Content $configPath -Raw | ConvertFrom-Json
 if(!(Test-Path (Join-Path $taskRoot 'pg\PG_VERSION'))){
  $passwordFile=Join-Path $taskRoot 'pg-password';$config.password | Set-Content $passwordFile -NoNewline
  & (Join-Path $pgBin 'initdb.exe') -D (Join-Path $taskRoot 'pg') -U crewnest -A scram-sha-256 --pwfile=$passwordFile --encoding=UTF8 --locale=C
  if($LASTEXITCODE -ne 0){throw 'initdb failed'}
  Remove-Item -LiteralPath $passwordFile
 }
 if(!(Test-Path (Join-Path $taskRoot 'tls.crt'))){
  $opensslConfig=Join-Path $taskRoot 'openssl.cnf'
  "[req]`ndistinguished_name=dn`n[dn]" | Set-Content $opensslConfig
  & openssl req -config $opensslConfig -x509 -newkey rsa:3072 -nodes -keyout (Join-Path $taskRoot 'tls.key') -out (Join-Path $taskRoot 'tls.crt') -days 30 -subj '/CN=CrewNest local development' -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1' -addext 'basicConstraints=critical,CA:TRUE'
  if($LASTEXITCODE -ne 0){throw 'Local TLS certificate generation failed'}
 }
 & (Join-Path $pgBin 'pg_ctl.exe') -D (Join-Path $taskRoot 'pg') status *> $null
 if($LASTEXITCODE -ne 0){& (Join-Path $pgBin 'pg_ctl.exe') -D (Join-Path $taskRoot 'pg') -l (Join-Path $taskRoot 'postgres.log') -o '-h 127.0.0.1 -p 55439' start;if($LASTEXITCODE -ne 0){throw 'PostgreSQL startup failed'}}
 $env:PGPASSWORD=$config.password
 $exists=& (Join-Path $pgBin 'psql.exe') -h 127.0.0.1 -p 55439 -U crewnest -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='crewnest_phase3'"
 if($exists -ne '1'){& (Join-Path $pgBin 'createdb.exe') -h 127.0.0.1 -p 55439 -U crewnest crewnest_phase3;if($LASTEXITCODE -ne 0){throw 'Create CrewNest database failed'}}
 Remove-Item Env:PGPASSWORD
 Write-Output 'Local PostgreSQL/TLS ready. Credentials remain in .local/phase3-dev/config.json; no OS trust/service changes.'
} elseif($Action -in @('api','web')) {
 $config=Get-Content $configPath -Raw | ConvertFrom-Json
 $env:DATABASE_URL=$config.databaseUrl;$env:TLS_KEY=Join-Path $taskRoot 'tls.key';$env:TLS_CERT=Join-Path $taskRoot 'tls.crt';$env:NODE_EXTRA_CA_CERTS=$env:TLS_CERT;$env:WEB_ORIGIN='https://127.0.0.1:7444';$env:API_URL='https://127.0.0.1:7443'
 if($Action -eq 'api'){
 & pnpm --filter '@crewnest/api' migrate
 if($LASTEXITCODE -ne 0){throw 'API migration failed'}
 $env:CREWNEST_OWNER_NAME=$config.ownerName;$env:CREWNEST_OWNER_PASSWORD=$config.ownerPassword
 & pnpm --filter '@crewnest/api' owner
 Remove-Item Env:CREWNEST_OWNER_PASSWORD
 }
 if($Action -eq 'api'){ & pnpm api } else { & pnpm web }
} else {& (Join-Path $pgBin 'pg_ctl.exe') -D (Join-Path $taskRoot 'pg') -m fast stop}
