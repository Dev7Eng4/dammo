import { chromeProfilesService } from '../../../chrome-profiles/chrome-profiles.service.js';
import { llmBrowserService } from '../../../llm-browser/llm-browser.service.js';
import { promptsSettingsService } from '../../../prompts/prompts-settings.service.js';
import type { PromptLanguage } from '../../../prompts/prompts.types.js';
import { executeMetaStep3, type MetaStep3Progress } from './meta-step3.js';
import type { MetaLlmSession } from './meta-session.js';
import { runMetaStep2, type MetaStep2Progress } from './meta-step2.js';
import type {
  MetaPipelineResult,
  MetaStep1ChunkDigest,
  MetaStep2StoryBlock,
} from './metadata.types.js';

export interface RunMetaPipelineOptions {
  outputDir?: string;
  onStep2Progress?: (progress: MetaStep2Progress) => void;
  onStep3Progress?: (progress: MetaStep3Progress) => void;
}

export async function runMetaPipelineAfterStep1(
  chunkDigests: MetaStep1ChunkDigest[],
  language: PromptLanguage,
  videoId: string,
  options?: RunMetaPipelineOptions,
): Promise<MetaPipelineResult> {
  let step3Items: MetaStep2StoryBlock[] | MetaStep1ChunkDigest[];

  if (chunkDigests.length < 2) {
    console.log(`[meta-pipeline] skip step 2 (${chunkDigests.length} chunk_digests)`);
    step3Items = chunkDigests;
  } else {
    console.log(`[meta-pipeline] running step 2 (${chunkDigests.length} chunk_digests)`);

    const storyBlocks = await runMetaStep2(chunkDigests, language, videoId, {
      outputDir: options?.outputDir,
      onProgress: options?.onStep2Progress,
    });

    step3Items = storyBlocks;
    console.log(`[meta-pipeline] step 2 done → ${storyBlocks.length} story_blocks`);
  }

  const provider = promptsSettingsService.get().defaultLlmProvider;
  const profile = chromeProfilesService.pickSubProfile();

  console.log(`[meta-pipeline] Mở Chrome profile ${profile.name} cho step 3...`);

  try {
    await llmBrowserService.open(profile.id, provider);

    const session: MetaLlmSession = {
      profileId: profile.id,
      profileName: profile.name,
      provider,
    };

    console.log('[meta-pipeline] running step 3...');
    const step3 = await executeMetaStep3(session, step3Items, language, videoId, {
      outputDir: options?.outputDir,
      onProgress: options?.onStep3Progress,
    });

    return { step3 };
  } finally {
    // await chromeProfilesService.closeSubProfiles([profile.id]);
  }
}
