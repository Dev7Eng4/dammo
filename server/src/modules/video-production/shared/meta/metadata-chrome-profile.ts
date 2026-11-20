import type { ChromeProfile } from '../../../chrome-profiles/chrome-profiles.types.js';
import { pickContentTaskProfile } from '../../../prompts/content-task.js';

/**
 * Chrome profile for metadata generation: the profile chosen in Settings → AI tools → Metadata when it
 * has the metadata LLM ticked, otherwise the first profile that does.
 */
export function pickMetadataChromeProfile(): ChromeProfile {
  return pickContentTaskProfile('metadata');
}
