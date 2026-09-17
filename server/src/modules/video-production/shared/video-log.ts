import { appSettingsService } from '../../app-settings/app-settings.service.js';

/** Runtime switch for ffmpeg progress / per-clip detail logs during video production. */
export function isVerboseVideoLogsEnabled(): boolean {
  return appSettingsService.get().verboseVideoLogs;
}

/** Detail-only dual-write: no-op when verbose video logs are disabled. */
export function emitDetailLog(msg: string, onLog?: (msg: string) => void): void {
  if (!isVerboseVideoLogsEnabled()) return;
  console.log(msg);
  onLog?.(msg);
}
