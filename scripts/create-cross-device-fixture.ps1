param([switch]$Execute)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$base = 'https://ucn5aajxnx7f.feishuapp.com/app/app_17h4dw5jwdg'
if (-not $Execute) {
  Write-Output 'No network. With -Execute: create one isolated 演示验收 account, course, task and note; retain them for Web/Android verification. Credentials stay in .cache/cross-device-fixture/.'
  exit 0
}
$runId = [guid]::NewGuid().ToString()
$suffix = $runId.Substring(0, 8)
$privateDirectory = [IO.Path]::GetFullPath((Join-Path $taskRoot '.cache/cross-device-fixture'))
$statePath = [IO.Path]::GetFullPath((Join-Path $privateDirectory ($runId + '.private.json')))
if (-not $statePath.StartsWith($privateDirectory + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected state path' }
New-Item -ItemType Directory -Path $privateDirectory -Force | Out-Null
$state = [ordered]@{
  kind = 'KELING_CROSS_DEVICE_ACCEPTANCE'; createdAt = [DateTime]::UtcNow.ToString('o'); baseUrl = $base
  name = "演示验收 $suffix"; email = "acceptance-$runId@example.invalid"
  password = ([Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(24)))
  token = $null; userId = $null; courseId = $null; taskId = $null; noteId = $null
  courseTitle = "演示验收·数据结构 $suffix"; taskTitle = "演示验收·跨端任务 $suffix"; noteTitle = "演示验收·跨端笔记 $suffix"
  expectedTaskStatus = 'PENDING'; retainForRehearsal = $true; status = 'PREPARING'
}
function Save-State { $state | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $statePath -Encoding utf8 }
Save-State
$null = Invoke-WebRequest -Uri $base -SessionVariable apiSession -TimeoutSec 30
function Call-Api([string]$Path, [string]$Method = 'GET', $Body = $null, [int]$Expected = 200) {
  $headers = @{ 'Accept' = 'application/json'; 'Origin' = ([Uri]$base).GetLeftPart([UriPartial]::Authority) }
  $csrfCookie = @($apiSession.Cookies.GetCookies([Uri]($base + '/api')) | Where-Object Name -eq 'suda-csrf-token' | Sort-Object { $_.Path.Length } -Descending)[0]
  if ($null -ne $csrfCookie) { $headers['X-Suda-Csrf-Token'] = $csrfCookie.Value }
  if ($state.token) { $headers['Authorization'] = 'Bearer ' + $state.token }
  $params = @{ Uri = $base + '/api' + $Path; Method = $Method; Headers = $headers; WebSession = $apiSession; TimeoutSec = 45; SkipHttpErrorCheck = $true }
  if ($null -ne $Body) { $params['ContentType'] = 'application/json; charset=utf-8'; $params['Body'] = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 12 -Compress)) }
  try { $response = Invoke-WebRequest @params } catch { throw "Network request failed for $Path" }
  if ([int]$response.StatusCode -ne $Expected) { throw "Unexpected HTTP $($response.StatusCode) for $Path" }
  try { return ($response.Content | ConvertFrom-Json) } catch { throw "Expected JSON for $Path" }
}
try {
  $health = Call-Api '/health'
  if ($health.version -ne '4.0.6-defense-rc7') { throw 'Current RC7 is not deployed' }
  $registered = Call-Api '/auth/register' 'POST' @{ name = $state.name; email = $state.email; password = $state.password } 201
  $state.userId = $registered.user.id; $state.token = $registered.token; Save-State
  $course = Call-Api '/courses' 'POST' @{ name = $state.courseTitle; code = "ACCEPT-$suffix"; schedule = @() } 201
  $state.courseId = $course.course.id; Save-State
  $task = Call-Api '/tasks' 'POST' @{ title = $state.taskTitle; courseId = $state.courseId; type = 'STUDY'; estimatedMinutes = 10; description = '演示验收专用：Android 完成后，由网页核对同一条任务的状态。' } 201
  $state.taskId = $task.task.id; Save-State
  $note = Call-Api '/notes' 'POST' @{ title = $state.noteTitle; content = '演示验收专用：这条笔记与任务由同一账号在网页和 Android 共享。可保留用于比赛演练。'; sourceType = 'USER_CREATED' } 201
  $state.noteId = $note.note.id; Save-State
  $profile = Call-Api '/user/profile'
  $tasks = Call-Api '/tasks'
  $notes = Call-Api '/notes'
  if ($profile.user.id -ne $state.userId -or $profile.user.email -ne $state.email -or -not ($tasks.tasks.id -contains $state.taskId) -or -not ($notes.notes.id -contains $state.noteId)) { throw 'Created fixture could not be read back under the same account' }
  $state.status = 'READY'; Save-State
  [ordered]@{ status = 'READY'; privateState = $statePath; name = $state.name; taskTitle = $state.taskTitle; noteTitle = $state.noteTitle; retained = $true } | ConvertTo-Json -Compress
} catch {
  $state.status = 'INCOMPLETE'; Save-State
  Write-Output ([ordered]@{ status = 'INCOMPLETE'; privateState = $statePath; reason = $_.Exception.Message } | ConvertTo-Json -Compress)
  exit 1
}
