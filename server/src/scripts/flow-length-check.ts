/**
 * Flow Length slider check, no video made: opens the first Flow video profile, picks the video settings
 * like a clip run, sets the Length slider to the given seconds, and leaves the settings popover open in a
 * visible Chrome window so a person can check it. Prints the slider's DOM before and after.
 * Chrome stays open while this runs (15 minutes, or until the process is stopped).
 *
 *   npm run -s flow-length-check -- [seconds] [--profile <name>] [--keep <minutes>]
 *
 * Stop the app server first: a Chrome profile cannot be opened by two processes.
 */
import { closeChromeProfiles } from '../modules/chrome-profiles/chrome-profile.runner.js';
import { chromeProfilesService } from '../modules/chrome-profiles/chrome-profiles.service.js';
import { flowBrowserService } from '../modules/llm-browser/flow/flow.service.js';

const argv = process.argv.slice(2);
const flag = (name: string) => {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? undefined : argv[at + 1];
};
const seconds = Number(argv.find((arg, index) => /^\d+$/.test(arg) && !argv[index - 1]?.startsWith('--')) ?? 0) || undefined;
const keepMinutes = Number(flag('keep') ?? 15);

async function main() {
  const profiles = chromeProfilesService.listProfilesForLlm('video', 'flow');
  const wanted = flag('profile');
  const profile = wanted ? profiles.find(entry => entry.name === wanted || entry.id === wanted) : profiles[0];
  if (!profile) throw new Error(wanted ? `Không thấy profile Flow "${wanted}" (có: ${profiles.map(entry => entry.name).join(', ')})` : 'Chưa có profile Flow cho video');

  console.log(`Profile ${profile.name} · Length muốn đặt: ${seconds ?? '(không đặt, chỉ xem)'}s`);
  try {
    const result = await flowBrowserService.checkVideoSettings(profile.id, { lengthSec: seconds });
    console.log('=== TRƯỚC ===');
    console.log(result.before);
    console.log('=== SAU ===');
    console.log(result.after);
    console.log(`Length app đọc được: ${result.length ?? '-'}s`);
  } catch (error) {
    console.error(`LỖI: ${error instanceof Error ? error.message : String(error)}`);
  }
  console.log(`READY: bảng cài đặt đang mở trong Chrome ${profile.name}. Giữ ${keepMinutes} phút rồi tự đóng (hoặc dừng lệnh).`);
  const stop = async () => {
    await closeChromeProfiles([profile.id]).catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
  setTimeout(() => void stop(), keepMinutes * 60_000);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
