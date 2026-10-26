param([string]$PipeName = 'focuswalk-system')

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# --- WinRT (SMTC) ---------------------------------------------------------

Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]

function Await($op, $resultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($resultType)
  $task = $asTask.Invoke($null, @($op))
  $task.Wait(-1) | Out-Null
  $task.Result
}

# --- Audio del sistema (WASAPI) + estado del teclado ----------------------

$csAudio = @'
using System;
using System.Runtime.InteropServices;

namespace FocusWalk {

  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
  internal class MMDeviceEnumeratorComObject { }

  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  internal interface IMMDeviceEnumerator {
    int NotImpl1();
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice);
  }

  [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  internal interface IMMDevice {
    int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
  }

  [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  internal interface IAudioEndpointVolume {
    int RegisterControlChangeNotify(IntPtr pNotify);
    int UnregisterControlChangeNotify(IntPtr pNotify);
    int GetChannelCount(out int pnChannelCount);
    int SetMasterVolumeLevel(float fLevelDB, Guid pguidEventContext);
    int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
    int GetMasterVolumeLevel(out float pfLevelDB);
    int GetMasterVolumeLevelScalar(out float pfLevel);
    int SetChannelVolumeLevel(uint nChannel, float fLevelDB, Guid pguidEventContext);
    int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, Guid pguidEventContext);
    int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
    int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
    int GetMute([MarshalAs(UnmanagedType.Bool)] out bool pbMute);
    int GetVolumeStepInfo(out uint pnStep, out uint pnStepCount);
    int VolumeStepUp(Guid pguidEventContext);
    int VolumeStepDown(Guid pguidEventContext);
    int QueryHardwareSupport(out uint pdwHardwareSupportMask);
    int GetVolumeRange(out float pflVolumeMindB, out float pflVolumeMaxdB, out float pflVolumeIncrementdB);
  }

  public static class SystemAudio {
    [DllImport("user32.dll")] private static extern short GetKeyState(int nVirtKey);

    private static IAudioEndpointVolume Endpoint() {
      var enumType = Type.GetTypeFromCLSID(new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E"));
      var enumerator = (IMMDeviceEnumerator)Activator.CreateInstance(enumType);
      IMMDevice device;
      Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out device));
      var iid = typeof(IAudioEndpointVolume).GUID;
      object o;
      Marshal.ThrowExceptionForHR(device.Activate(ref iid, 23, IntPtr.Zero, out o));
      return (IAudioEndpointVolume)o;
    }

    public static int GetVolume() {
      float v;
      Marshal.ThrowExceptionForHR(Endpoint().GetMasterVolumeLevelScalar(out v));
      return (int)Math.Round(v * 100.0);
    }

    public static void SetVolume(int percent) {
      if (percent < 0) percent = 0;
      if (percent > 100) percent = 100;
      Marshal.ThrowExceptionForHR(Endpoint().SetMasterVolumeLevelScalar(percent / 100f, Guid.Empty));
    }

    public static bool GetMute() {
      bool m;
      Marshal.ThrowExceptionForHR(Endpoint().GetMute(out m));
      return m;
    }

    public static void SetMute(bool mute) {
      Marshal.ThrowExceptionForHR(Endpoint().SetMute(mute, Guid.Empty));
    }

    public static bool CapsLock() {
      return (GetKeyState(0x14) & 1) != 0;
    }
  }
}
'@

Add-Type -TypeDefinition $csAudio -Language CSharp

# --- Brillo (WMI en portátiles, DDC/CI en monitores externos) ------------

$csDdc = @'
using System;
using System.Runtime.InteropServices;

public static class Ddc {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct PHYSICAL_MONITOR {
    public IntPtr hPhysicalMonitor;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string szPhysicalMonitorDescription;
  }

  public delegate bool MonitorEnumProc(IntPtr hMonitor, IntPtr hdc, IntPtr rect, IntPtr data);

  [DllImport("user32.dll")]
  public static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr clip, MonitorEnumProc cb, IntPtr data);

  [DllImport("dxva2.dll", SetLastError = true)]
  public static extern bool GetNumberOfPhysicalMonitorsFromHMONITOR(IntPtr hMonitor, ref uint count);

  [DllImport("dxva2.dll", SetLastError = true)]
  public static extern bool GetPhysicalMonitorsFromHMONITOR(IntPtr hMonitor, uint size, [Out] PHYSICAL_MONITOR[] monitors);

  [DllImport("dxva2.dll", SetLastError = true)]
  public static extern bool GetMonitorBrightness(IntPtr h, out uint min, out uint cur, out uint max);

  [DllImport("dxva2.dll", SetLastError = true)]
  public static extern bool SetMonitorBrightness(IntPtr h, uint value);

  [DllImport("dxva2.dll", SetLastError = true)]
  public static extern bool DestroyPhysicalMonitor(IntPtr h);

  private static IntPtr FirstMonitor() {
    IntPtr found = IntPtr.Zero;
    MonitorEnumProc cb = delegate(IntPtr h, IntPtr hdc, IntPtr r, IntPtr d) {
      found = h;
      return false;
    };
    EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, cb, IntPtr.Zero);
    return found;
  }

  private static IntPtr OpenPhysical(out int min, out int max) {
    min = 0; max = 0;
    IntPtr hm = FirstMonitor();
    if (hm == IntPtr.Zero) return IntPtr.Zero;
    uint count = 0;
    if (!GetNumberOfPhysicalMonitorsFromHMONITOR(hm, ref count) || count == 0) return IntPtr.Zero;
    PHYSICAL_MONITOR[] arr = new PHYSICAL_MONITOR[count];
    if (!GetPhysicalMonitorsFromHMONITOR(hm, count, arr)) return IntPtr.Zero;
    uint lo, cur, hi;
    if (!GetMonitorBrightness(arr[0].hPhysicalMonitor, out lo, out cur, out hi)) {
      DestroyPhysicalMonitor(arr[0].hPhysicalMonitor);
      return IntPtr.Zero;
    }
    min = (int)lo; max = (int)hi;
    return arr[0].hPhysicalMonitor;
  }

  public static int Get() {
    int min, max;
    IntPtr h = OpenPhysical(out min, out max);
    if (h == IntPtr.Zero || max <= min) {
      if (h != IntPtr.Zero) DestroyPhysicalMonitor(h);
      return -1;
    }
    uint lo, cur, hi;
    GetMonitorBrightness(h, out lo, out cur, out hi);
    DestroyPhysicalMonitor(h);
    return (int)Math.Round((cur - (double)lo) * 100.0 / (hi - lo));
  }

  public static bool Set(int percent) {
    int min, max;
    IntPtr h = OpenPhysical(out min, out max);
    if (h == IntPtr.Zero || max <= min) {
      if (h != IntPtr.Zero) DestroyPhysicalMonitor(h);
      return false;
    }
    if (percent < 0) percent = 0;
    if (percent > 100) percent = 100;
    uint value = (uint)(min + (max - min) * percent / 100.0);
    bool ok = SetMonitorBrightness(h, value);
    DestroyPhysicalMonitor(h);
    return ok;
  }
}
'@

try { Add-Type -TypeDefinition $csDdc -Language CSharp } catch { }

$brightnessMode = 'none'
try {
  $null = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop
  $brightnessMode = 'wmi'
} catch {
  try {
    if ([Ddc]::Get() -ge 0) { $brightnessMode = 'ddc' }
  } catch { }
}

function Get-Brightness {
  if ($brightnessMode -eq 'wmi') {
    try {
      $b = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop
      return [int]$b.CurrentBrightness
    } catch { return $null }
  }
  if ($brightnessMode -eq 'ddc') {
    $v = [Ddc]::Get()
    if ($v -ge 0) { return $v }
  }
  return $null
}

function Set-Brightness([int]$percent) {
  if ($brightnessMode -eq 'wmi') {
    try {
      $m = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction Stop
      $null = Invoke-CimMethod -InputObject $m -MethodName WmiSetBrightness -Arguments @{ Timeout = 1; Brightness = $percent }
      return $true
    } catch { return $false }
  }
  if ($brightnessMode -eq 'ddc') { return [Ddc]::Set($percent) }
  return $false
}

# --- Sesión multimedia ----------------------------------------------------

$manager = $null
$cache = @{ key = ''; props = $null; at = [datetime]::MinValue }

function Get-Manager {
  if ($script:manager) { return $script:manager }
  $script:manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
  return $script:manager
}

$sessionTicks = 0

function Get-Media {
  $mgr = Get-Manager
  if (-not $mgr) { return $null }
  $session = $mgr.GetCurrentSession()
  if (-not $session) { return $null }

  $key = $session.SourceAppUserModelId
  $needsProps = ($script:cache.key -ne $key) -or (-not $script:cache.props) -or
                (((Get-Date) - $script:cache.at).TotalSeconds -gt 4)

  if ($needsProps) {
    try {
      $script:cache.props = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
      $script:cache.key = $key
      $script:cache.at = Get-Date
    } catch {
      if (-not $script:cache.props) { return $null }
    }
  }

  $info = $session.GetPlaybackInfo()
  $timeline = $session.GetTimelineProperties()

  $start = 0.0
  $end = 0.0
  $pos = 0.0
  try {
    $start = $timeline.StartTime.TotalSeconds
    $end = $timeline.EndTime.TotalSeconds
    $pos = $timeline.Position.TotalSeconds - $start
  } catch { }

  if ($pos -lt 0) { $pos = 0 }

  # Muchas apps no empujan la posición: la corregimos con la hora del último cambio.
  if ($info.PlaybackStatus.ToString() -eq 'Playing') {
    try {
      $drift = ((Get-Date) - $timeline.LastUpdatedTime.LocalDateTime).TotalSeconds
      if ($drift -gt 0 -and $drift -lt 7200) { $pos = $pos + $drift }
    } catch { }
  }

  $duration = [math]::Max(0, $end - $start)
  if ($duration -gt 0 -and $pos -gt $duration) { $pos = $duration }

  return [ordered]@{
    title    = [string]$script:cache.props.Title
    artist   = [string]$script:cache.props.Artist
    album    = [string]$script:cache.props.AlbumTitle
    app      = [string]$key
    playing  = ($info.PlaybackStatus.ToString() -eq 'Playing')
    position = [math]::Round($pos, 2)
    duration = [math]::Round($duration, 2)
    canSeek  = [bool]$info.Controls.IsPlaybackPositionEnabled
    canSkip  = ([bool]$info.Controls.IsNextEnabled) -or ([bool]$info.Controls.IsPreviousEnabled)
  }
}

$currentSession = { (Get-Manager).GetCurrentSession() }

# --- Pipe ----------------------------------------------------------------

$pipe = New-Object System.IO.Pipes.NamedPipeServerStream(
  $PipeName,
  [System.IO.Pipes.PipeDirection]::InOut,
  1,
  [System.IO.Pipes.PipeTransmissionMode]::Byte,
  [System.IO.Pipes.PipeOptions]::Asynchronous
)
$pipe.WaitForConnection()

$utf8 = New-Object System.Text.UTF8Encoding($false)
$reader = New-Object System.IO.StreamReader($pipe, $utf8)
$writer = New-Object System.IO.StreamWriter($pipe, $utf8)
$writer.AutoFlush = $true

$readTask = $reader.ReadLineAsync()
$lastJson = ''
$lastPoll = [datetime]::MinValue
$lastBrightness = Get-Brightness

function Send($payload) {
  $script:writer.WriteLine(($payload | ConvertTo-Json -Compress -Depth 5))
}

try {
  while ($true) {
    if ($readTask.IsCompleted) {
      $line = $readTask.Result
      if ($null -eq $line) { break }
      if ($line.Trim()) {
        try { $msg = $line | ConvertFrom-Json } catch { $msg = $null }
        if ($msg -and $msg.cmd) {
          $session = & $currentSession
          switch ($msg.cmd) {
            'toggle' { if ($session) { $null = Await ($session.TryTogglePlayPauseAsync()) ([bool]) } }
            'next' { if ($session) { $null = Await ($session.TrySkipNextAsync()) ([bool]) } }
            'prev' { if ($session) { $null = Await ($session.TrySkipPreviousAsync()) ([bool]) } }
            'seek' {
              if ($session) {
                $ticks = [long]([double]$msg.seconds * 10000000)
                $null = Await ($session.TryChangePlaybackPositionAsync($ticks)) ([bool])
              }
            }
            'volume' {
              [FocusWalk.SystemAudio]::SetVolume([int]$msg.value)
              $lastPoll = [datetime]::MinValue
            }
            'mute' {
              [FocusWalk.SystemAudio]::SetMute([bool]$msg.value)
              $lastPoll = [datetime]::MinValue
            }
            'brightness' {
              if ($brightnessMode -eq 'none') { Send @{ type = 'error'; cmd = 'brightness'; reason = 'unsupported' } }
              else {
                $null = Set-Brightness ([int]$msg.value)
                $lastPoll = [datetime]::MinValue
              }
            }
            'refresh' { $lastPoll = [datetime]::MinValue }
          }
        }
      }
      $readTask = $reader.ReadLineAsync()
      continue
    }

    if (((Get-Date) - $lastPoll).TotalMilliseconds -ge 350) {
      $lastPoll = Get-Date
      $state = [ordered]@{ type = 'state' }

      try { $state.media = Get-Media } catch { $state.media = $null }
      try {
        $state.volume = [FocusWalk.SystemAudio]::GetVolume()
        $state.muted = [FocusWalk.SystemAudio]::GetMute()
      } catch { $state.volume = $null; $state.muted = $null }
      try { $state.caps = [FocusWalk.SystemAudio]::CapsLock() } catch { $state.caps = $null }
      $state.brightnessSupported = ($brightnessMode -ne 'none')
      $state.brightness = Get-Brightness

      $json = ($state | ConvertTo-Json -Compress -Depth 5)
      if ($json -ne $lastJson) {
        $lastJson = $json
        $writer.WriteLine($json)
      }
    }

    Start-Sleep -Milliseconds 80
  }
} catch {
  try { Send @{ type = 'error'; reason = $_.Exception.Message } } catch { }
} finally {
  try { $pipe.Dispose() } catch { }
}
