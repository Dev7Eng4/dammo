import { chromeProfilesService } from '../chrome-profiles/chrome-profiles.service.js';
import type { ChromeProfile } from '../chrome-profiles/chrome-profiles.types.js';

/**
 * Hands Flow main profiles to concurrent batch workers, one worker at a time
 * per profile.
 *
 * Flow drives a real Chrome user-data-dir, so two batches on the same profile
 * fight over one browser session. The default failover rule ("first main
 * profile that is not exhausted") is fine for a single sequential caller but
 * would hand the same profile to two workers the moment one of them fails over.
 * This pool leases instead, and remembers exhaustion across all workers so a
 * profile that ran out of daily quota is never retried by the next one.
 */
export class FlowMainProfilePool {
  private readonly leased = new Set<string>();
  private readonly exhausted = new Set<string>();
  private readonly onLog?: (msg: string) => void;

  constructor(options?: { onLog?: (msg: string) => void }) {
    this.onLog = options?.onLog;
  }

  /** Main profiles configured, in the service's usage order. */
  static listMain(): ChromeProfile[] {
    return chromeProfilesService.listMainProfiles();
  }

  /** How many workers can usefully run right now. */
  get capacity(): number {
    return FlowMainProfilePool.listMain().length;
  }

  /**
   * Lease a free, unexhausted profile. `releaseId` gives up the caller's
   * current profile first, so a failing-over worker can swap in one step
   * without briefly holding two.
   */
  acquire(releaseId?: string): ChromeProfile | undefined {
    if (releaseId) this.leased.delete(releaseId);

    const next = FlowMainProfilePool.listMain().find(
      profile => !this.leased.has(profile.id) && !this.exhausted.has(profile.id),
    );
    if (!next) return undefined;

    this.leased.add(next.id);
    return next;
  }

  release(profileId: string): void {
    this.leased.delete(profileId);
  }

  /** Mark a profile out of quota for every worker, not just the one that hit it. */
  markExhausted(profileId: string): void {
    this.exhausted.add(profileId);
    this.leased.delete(profileId);
    this.onLog?.(`[flow-pool] profile ${profileId} marked exhausted for this run`);
  }

  /** Profile ids any worker has held, for cleanup once the run finishes. */
  get exhaustedIds(): ReadonlySet<string> {
    return this.exhausted;
  }
}
