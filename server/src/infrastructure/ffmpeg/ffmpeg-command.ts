import fs from 'node:fs/promises';
import path from 'node:path';

export function quoteShellArg(value: string): string {
  if (value.length === 0) return '""';
  if (!/[\s"'\\]/.test(value)) return value;
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function formatFfmpegCommand(ffmpegPath: string, args: string[]): string {
  return [quoteShellArg(ffmpegPath), ...args.map(quoteShellArg)].join(' ');
}

export async function buildFfmpegCommandLog(
  ffmpegPath: string,
  args: string[],
  label?: string,
): Promise<string[]> {
  const prefix = label ? `[ffmpeg] ${label}` : '[ffmpeg]';
  const lines = [`${prefix} Command: ${formatFfmpegCommand(ffmpegPath, args)}`];

  const scriptIdx = args.indexOf('-filter_complex_script');
  if (scriptIdx !== -1 && scriptIdx + 1 < args.length) {
    const scriptPath = args[scriptIdx + 1];
    try {
      const content = (await fs.readFile(scriptPath, 'utf8')).trim();
      const scriptName = path.basename(scriptPath);
      const oneLine = content.replace(/\s+/g, ' ');
      if (oneLine.length <= 500) {
        lines.push(`[ffmpeg] Filter script (${scriptName}): ${oneLine}`);
      } else {
        lines.push(`[ffmpeg] Filter script (${scriptName}): ${oneLine.slice(0, 500)}...`);
      }
    } catch {
      lines.push(`[ffmpeg] Filter script: unable to read ${scriptPath}`);
    }
  }

  return lines;
}

export function emitFfmpegCommandLog(lines: string[], onLog?: (msg: string) => void): void {
  for (const line of lines) {
    console.log(line);
    onLog?.(line);
  }
}
