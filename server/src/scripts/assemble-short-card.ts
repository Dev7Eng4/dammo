import fs from 'node:fs/promises';
import path from 'node:path';
import {
  assembleShortCardVideo,
  shortCardSpecFileSchema,
} from '../modules/video-production/shared/short-card/index.js';

interface CliOptions {
  specPath?: string;
  backgroundPath?: string;
  audioPath?: string;
  outputPath?: string;
  workDir?: string;
  kenBurns: boolean;
  title?: string;
  body?: string;
  footer?: string;
}

function printUsage(): void {
  console.log(`Usage:
  npx tsx src/scripts/assemble-short-card.ts --spec path/to/card.json
  npx tsx src/scripts/assemble-short-card.ts --bg bg.jpg --audio a.mp3 --out out.mp4 --title "..." --body "..." --footer "..."

Options:
  --spec, -s     JSON spec file (see shared/short-card/card.example.json)
  --bg           Background image or video (overrides spec)
  --audio        Audio file (overrides spec)
  --out, -o      Output mp4 path (overrides spec)
  --work-dir     Temp directory for overlay PNG
  --ken-burns    Enable mild Ken Burns on still backgrounds
  --title        Header text (when not using --spec content)
  --body         Body text
  --footer       Footer text
`);
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { kenBurns: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    const readValue = (flag: string): string => {
      const value = argv[i + 1]?.trim() ?? '';
      if (!value) throw new Error(`${flag} requires a value`);
      i += 1;
      return value;
    };

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--spec' || arg === '-s') {
      options.specPath = path.resolve(readValue(arg));
      continue;
    }
    if (arg === '--bg') {
      options.backgroundPath = path.resolve(readValue(arg));
      continue;
    }
    if (arg === '--audio') {
      options.audioPath = path.resolve(readValue(arg));
      continue;
    }
    if (arg === '--out' || arg === '-o') {
      options.outputPath = path.resolve(readValue(arg));
      continue;
    }
    if (arg === '--work-dir') {
      options.workDir = path.resolve(readValue(arg));
      continue;
    }
    if (arg === '--ken-burns') {
      options.kenBurns = true;
      continue;
    }
    if (arg === '--title') {
      options.title = readValue(arg);
      continue;
    }
    if (arg === '--body') {
      options.body = readValue(arg);
      continue;
    }
    if (arg === '--footer') {
      options.footer = readValue(arg);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));

  let backgroundPath = cli.backgroundPath;
  let audioPath = cli.audioPath;
  let outputPath = cli.outputPath;
  let workDir = cli.workDir;
  let kenBurns = cli.kenBurns;
  let content =
    cli.title && cli.body && cli.footer
      ? { title: cli.title, body: cli.body, footer: cli.footer }
      : undefined;

  if (cli.specPath) {
    const raw = JSON.parse(await fs.readFile(cli.specPath, 'utf8')) as unknown;
    const spec = shortCardSpecFileSchema.parse(raw);
    const specDir = path.dirname(cli.specPath);

    backgroundPath =
      backgroundPath ??
      (spec.backgroundPath ? path.resolve(specDir, spec.backgroundPath) : undefined);
    audioPath = audioPath ?? (spec.audioPath ? path.resolve(specDir, spec.audioPath) : undefined);
    outputPath = outputPath ?? (spec.outputPath ? path.resolve(specDir, spec.outputPath) : undefined);
    workDir = workDir ?? (spec.workDir ? path.resolve(specDir, spec.workDir) : undefined);
    kenBurns = cli.kenBurns || spec.kenBurns === true;
    content = content ?? spec.content;
  }

  if (!backgroundPath || !audioPath || !outputPath || !content) {
    printUsage();
    throw new Error('Require background, audio, output, and content (via --spec or flags)');
  }

  const result = await assembleShortCardVideo({
    backgroundPath,
    audioPath,
    outputPath,
    content,
    ...(workDir ? { workDir } : {}),
    kenBurns,
    onLog: msg => console.log(msg),
  });

  console.log(
    `[assemble-short-card] ok duration=${result.durationSec.toFixed(1)}s → ${result.outputPath}`,
  );
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
