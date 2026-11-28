import { ensureDataDirs } from '../config/paths.js';
import { museBrowserService } from '../modules/llm-browser/muse/muse.service.js';

/**
 * Generate one image or video with Muse (muse.ai) on a Chrome profile that has Muse ticked in LLM Image / LLM Video.
 *
 *   npm run muse:generate-image -- "a quiet Japanese garden with a stone lantern" [--profile-id ID]
 *     [--output-dir DIR] [--file-name NAME] [--ref path/to/ref.png ...] [--ratio 16:9|3:4] [--full-size]
 *
 *   npm run muse:generate-video -- "she slowly lifts her head and smiles" --ref scene.jpg --seconds 5
 *     (3–10 s; same --profile-id / --output-dir / --file-name options)
 */
interface CliOptions {
  prompt: string;
  profileId?: string;
  outputDir?: string;
  fileName?: string;
  referenceImagePaths: string[];
  aspectRatio: '16:9' | '3:4';
  skipResize: boolean;
  video: boolean;
  seconds?: number;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { prompt: '', referenceImagePaths: [], aspectRatio: '16:9', skipResize: false, video: false };
  const words: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    const next = (): string => {
      const value = argv[index + 1];
      if (!value) throw new Error(`${arg} needs a value`);
      index += 1;
      return value;
    };
    if (arg === '--profile-id') options.profileId = next();
    else if (arg === '--output-dir' || arg === '-o') options.outputDir = next();
    else if (arg === '--file-name') options.fileName = next();
    else if (arg === '--ref') options.referenceImagePaths.push(next());
    else if (arg === '--full-size') options.skipResize = true;
    else if (arg === '--video') options.video = true;
    else if (arg === '--seconds') {
      const seconds = Number(next());
      if (!Number.isInteger(seconds) || seconds < 3 || seconds > 10) throw new Error('--seconds must be a whole number from 3 to 10');
      options.seconds = seconds;
    }
    else if (arg === '--ratio') {
      const ratio = next();
      if (ratio !== '16:9' && ratio !== '3:4') throw new Error('--ratio must be 16:9 or 3:4');
      options.aspectRatio = ratio;
    } else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else words.push(arg);
  }
  options.prompt = words.join(' ').trim();
  if (!options.prompt) throw new Error('Give the image prompt as the first argument');
  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  ensureDataDirs();
  const common = {
    profileId: options.profileId,
    outputDir: options.outputDir,
    fileName: options.fileName,
    referenceImagePaths: options.referenceImagePaths,
  };
  const response = options.video
    ? await museBrowserService.generateVideo(options.prompt, { ...common, durationSeconds: options.seconds })
    : await museBrowserService.generateImage(options.prompt, {
        ...common,
        aspectRatio: options.aspectRatio,
        skipResize: options.skipResize,
      });
  const saved = response.mediaAssets?.find(asset => asset.localPath)?.localPath;
  console.log(`[muse] done in ${Math.round(response.elapsedMs / 1000)}s -> ${saved}`);
}

main().then(
  () => process.exit(0),
  err => {
    console.error('[muse] failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
