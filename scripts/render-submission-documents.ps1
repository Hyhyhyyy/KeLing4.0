param([Parameter(Mandatory=$true)][string]$SourceDirectory,[Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
[void](New-Item -ItemType Directory -Path $OutputDirectory -Force)
foreach ($taskFile in Get-ChildItem -LiteralPath $SourceDirectory -Filter '*.docx' -File) {
  $taskWord = New-Object -ComObject Word.Application
  try {
    $taskWord.Visible = $false
    $taskWord.DisplayAlerts = 0
    $taskWord.AutomationSecurity = 3
        $taskDocument = $null
        try {
            $taskDocument = $taskWord.Documents.Open($taskFile.FullName, $false, $true, $false)
            $taskDocument.Repaginate()
            $taskPdf = Join-Path $OutputDirectory ($taskFile.BaseName + '.pdf')
            $taskDocument.ExportAsFixedFormat($taskPdf, 17)
            Write-Output ($taskFile.Name + ': rendered')
        } finally {
            if ($null -ne $taskDocument) {
                try { $taskDocument.Close(0) } catch [System.Runtime.InteropServices.COMException] { Write-Verbose 'Document already closed after export.' }
                [void][Runtime.InteropServices.Marshal]::ReleaseComObject($taskDocument)
            }
        }
  } finally {
    try { $taskWord.Quit(0) } catch [System.Runtime.InteropServices.COMException] { Write-Verbose 'Word instance already closed.' }
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($taskWord)
  }
}
