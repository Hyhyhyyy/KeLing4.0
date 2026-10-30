param([switch]$Lint)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$buildRoot = $projectRoot
$mappedDrive = $null
$propertiesFile = Join-Path $projectRoot 'apps/android/local.properties'
$savedProperties = if (Test-Path -LiteralPath $propertiesFile) { [IO.File]::ReadAllBytes($propertiesFile) } else { $null }
$propertiesChanged = $false
$locationPushed = $false
$tasks = @('testDebugUnitTest', 'assembleDebug')
if ($Lint) { $tasks += 'lintDebug' }
try {
    # AGP and Gradle's JVM test worker need an ASCII path on Windows/JDK 17.
    if ($projectRoot -match '[^\x00-\x7F]') {
        $letter = 90..75 | ForEach-Object { [string][char]$_ } | Where-Object { -not (Test-Path ($_ + ':\')) } | Select-Object -First 1
        if (-not $letter) { throw 'No free drive letter for the temporary build path.' }
        $mappedDrive = $letter + ':'
        subst.exe $mappedDrive $projectRoot
        if ($LASTEXITCODE -ne 0) { throw 'Could not map the temporary build path.' }
        $buildRoot = $mappedDrive + '\'
    }
    $androidRoot = Join-Path $buildRoot 'apps/android'
    $localSdk = Join-Path $buildRoot '.cache/tools/android-sdk'
    if (Test-Path -LiteralPath $localSdk) {
        [IO.File]::WriteAllText($propertiesFile, ('sdk.dir=' + $localSdk.Replace('\','/') + "`n"), [Text.Encoding]::ASCII)
        $propertiesChanged = $true
    }
    $localGradle = Join-Path $buildRoot '.cache/tools/gradle-8.5/bin/gradle.bat'
    $runner = if (Test-Path -LiteralPath $localGradle) { $localGradle } else { Join-Path $androidRoot 'gradlew.bat' }
    Push-Location $androidRoot
    $locationPushed = $true
    & $runner @tasks '--console=plain'
    if ($LASTEXITCODE -ne 0) { throw "Android validation failed (exit $LASTEXITCODE)." }
} finally {
    if ($locationPushed) { Pop-Location }
    if ($propertiesChanged) {
        if ($null -ne $savedProperties) { [IO.File]::WriteAllBytes($propertiesFile, $savedProperties) }
        else { Remove-Item -LiteralPath $propertiesFile }
    }
    if ($mappedDrive) { subst.exe $mappedDrive /d }
}
