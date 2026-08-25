import path from 'node:path';
import { mapPool } from '../../../../shared/async/map-pool.js';
import { renderSlideClip } from '../slideshow/slideshow-clip-renderer.js';
import type { SlideSpec } from '../slideshow/slideshow.types.js';
import { resolveAiSlideRenderOptions } from './ai-video-slide-spec.js';

const DEFAULT_MAX_CONCURRENCY = 4;

export class AiClipPrebakePool {
  private readonly workDir: string;
  private readonly maxConcurrency: number;
  private readonly onLog?: (msg: string) => void;
  private readonly queue: SlideSpec[] = [];
  private active = 0;
  private readonly tasks = new Set<Promise<void>>();

  constructor(workDir: string, options?: { maxConcurrency?: number; onLog?: (msg: string) => void }) {
    this.workDir = workDir;
    this.maxConcurrency = options?.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
    this.onLog = options?.onLog;
  }

  enqueueProvisionalSlide(slide: SlideSpec): void {
    this.queue.push(slide);
    this.pump();
  }

  private pump(): void {
    while (this.active < this.maxConcurrency && this.queue.length > 0) {
      const slide = this.queue.shift()!;
      this.active += 1;
      this.onLog?.(
        `[ai-video] Ken Burns prebake start ${path.basename(slide.imagePath)} ` +
          `(active ${this.active}/${this.maxConcurrency}, ${slide.durationSec.toFixed(1)}s)`,
      );
      const task = this.renderOne(slide)
        .finally(() => {
          this.active -= 1;
          this.tasks.delete(task);
          this.pump();
        });
      this.tasks.add(task);
    }
  }

  private async renderOne(slide: SlideSpec): Promise<void> {
    try {
      const opts = resolveAiSlideRenderOptions(this.workDir, this.onLog);
      await renderSlideClip(slide, opts);
      this.onLog?.(
        `[ai-video] Prebaked Ken Burns clip → ${path.basename(slide.imagePath)} (${slide.durationSec.toFixed(1)}s)`,
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.onLog?.(`[ai-video] Ken Burns prebake failed for ${path.basename(slide.imagePath)}: ${reason}`);
    }
  }

  async drain(): Promise<void> {
    this.pump();
    while (this.queue.length > 0 || this.active > 0) {
      if (this.tasks.size > 0) {
        await Promise.race([...this.tasks]);
      } else {
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    }
    await Promise.all([...this.tasks]);
  }

  async reconcileFinalSlides(slides: SlideSpec[]): Promise<void> {
    if (slides.length === 0) return;

    const opts = resolveAiSlideRenderOptions(this.workDir, this.onLog);
    this.onLog?.(`[ai-video] Reconciling ${slides.length} Ken Burns clip(s)...`);

    await mapPool(slides, this.maxConcurrency, async (slide, index) => {
      try {
        await renderSlideClip(slide, opts);
        this.onLog?.(
          `[ai-video] Reconciled clip ${index + 1}/${slides.length} → ${path.basename(slide.imagePath)}`,
        );
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        this.onLog?.(
          `[ai-video] Ken Burns reconcile failed for ${path.basename(slide.imagePath)}: ${reason}`,
        );
      }
    });
  }
}
