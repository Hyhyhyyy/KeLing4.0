param([Parameter(Mandatory=$true)][string]$taskSource)
$ErrorActionPreference = 'Stop'
$taskOut = Join-Path (Split-Path $PSScriptRoot -Parent) '.cache\submission-references'
$taskItems = @(
    @{ Source = '附件4：《XXXXXX需求文档》模板.docx'; Output = 'requirements-reference.pdf' },
    @{ Source = '附件5：《XXXXXX技术设计》模板.docx'; Output = 'technical-reference.pdf' }
)
$taskWord = New-Object -ComObject Word.Application
try {
    $taskWord.Visible = $false
    $taskWord.DisplayAlerts = 0
    $taskWord.AutomationSecurity = 3
    foreach ($taskItem in $taskItems) {
        $taskDocument = $null
        try {
            $taskDocument = $taskWord.Documents.Open((Join-Path $taskSource $taskItem.Source), $false, $true, $false)
            $taskDocument.ExportAsFixedFormat((Join-Path $taskOut $taskItem.Output), 17)
            Write-Output $taskItem.Output
        } finally {
            if ($null -ne $taskDocument) {
                $taskDocument.Close(0)
                [void][Runtime.InteropServices.Marshal]::ReleaseComObject($taskDocument)
            }
        }
    }
} finally {
    try { $taskWord.Quit(0) } catch [System.Runtime.InteropServices.COMException] { Write-Verbose 'Word instance already closed.' }
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($taskWord)
}
