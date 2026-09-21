export interface ShortCardEngagement {
  likes?: string;
  comments?: string;
  reposts?: string;
  shares?: string;
}

export interface ShortCardContent {
  /** Black header box (top). */
  title: string;
  /** White body box (center), may contain newlines. */
  body: string;
  /** Brown footer box (bottom), may contain emoji. */
  footer: string;
  /** Outline engagement icons; omit to hide the bar. */
  engagement?: ShortCardEngagement;
}

export interface AssembleShortCardInput {
  /** Still image or video used as full-frame background. */
  backgroundPath: string;
  audioPath: string;
  content: ShortCardContent;
  outputPath: string;
  /** Temp dir for overlay PNG. Defaults next to outputPath. */
  workDir?: string;
  /** Soft Ken Burns on still backgrounds. Default false. */
  kenBurns?: boolean;
  onLog?: (msg: string) => void;
}

export interface AssembleShortCardResult {
  outputPath: string;
  overlayPath: string;
  durationSec: number;
}
