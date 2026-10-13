# Renders app/debug_scenarios.json to WAV files with Windows TTS, alternating Polish voices per line
# to imitate several people at the table. Output: debug-samples/
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech

$root = Split-Path $PSScriptRoot -Parent
$outDir = Join-Path $root "debug-samples"
New-Item -ItemType Directory -Force $outDir | Out-Null
$scenarios = Get-Content (Join-Path $root "app\debug_scenarios.json") -Raw -Encoding UTF8 | ConvertFrom-Json

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voices = @($synth.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq "pl-PL" } | ForEach-Object { $_.VoiceInfo.Name })
if ($voices.Count -eq 0) { throw "Brak polskiego głosu TTS w systemie" }
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)

function Render($lines, $path) {
    $builder = New-Object System.Speech.Synthesis.PromptBuilder
    $i = 0
    foreach ($line in $lines) {
        $builder.StartVoice($voices[$i % $voices.Count])
        $builder.AppendText($line)
        $builder.EndVoice()
        $builder.AppendBreak([TimeSpan]::FromMilliseconds(700))
        $i++
    }
    $synth.SetOutputToWaveFile($path, $format)
    $synth.Speak($builder)
    $synth.SetOutputToNull()
    Write-Host "  $path"
}

for ($s = 0; $s -lt $scenarios.Count; $s++) {
    $scenario = $scenarios[$s]
    Write-Host "Scenariusz $($s + 1): $($scenario.name)"
    $all = @()
    for ($g = 0; $g -lt $scenario.segments.Count; $g++) {
        $segment = $scenario.segments[$g]
        Render $segment.lines (Join-Path $outDir ("s{0}-{1}-{2}.wav" -f ($s + 1), ($g + 1), $segment.expected))
        $all += $segment.lines
    }
    Render $all (Join-Path $outDir ("s{0}-cala-sesja.wav" -f ($s + 1)))
}
$synth.Dispose()
Write-Host "Głosy: $($voices -join ', ')"
