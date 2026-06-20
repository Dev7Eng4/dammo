import { chromeProfilesService } from '../chrome-profiles/chrome-profiles.service.js';
import { llmBrowserService } from '../llm-browser/llm-browser.service.js';
import { promptsSettingsService } from '../prompts/prompts-settings.service.js';
import type { PromptLanguage } from '../prompts/prompts.types.js';
import { executeMetaStep3, type MetaStep3Progress } from './reup-meta-step3.js';
import { executeMetaStep4, type MetaStep4Progress } from './reup-meta-step4.js';
import type { MetaLlmSession } from './reup-meta-session.js';
import { runMetaStep2, type MetaStep2Progress } from './reup-meta-step2.js';
import type { MetaPipelineResult, MetaStep1MicroSegment, MetaSynthesisInput } from './reup-metadata.types.js';

const STEP2_THRESHOLD = 12;

export interface RunMetaPipelineOptions {
  outputDir?: string;
  onStep2Progress?: (progress: MetaStep2Progress) => void;
  onStep3Progress?: (progress: MetaStep3Progress) => void;
  onStep4Progress?: (progress: MetaStep4Progress) => void;
}

export async function runMetaPipelineAfterStep1(
  microSegments: MetaStep1MicroSegment[],
  language: PromptLanguage,
  videoId: string,
  options?: RunMetaPipelineOptions,
): Promise<MetaPipelineResult> {
  let synthesisInput: MetaSynthesisInput;

  if (microSegments.length <= STEP2_THRESHOLD) {
    console.log(`[meta-pipeline] skip step 2 (${microSegments.length} micro_segments)`);
    synthesisInput = { micro_segments: microSegments };
  } else {
    console.log(`[meta-pipeline] running step 2 (${microSegments.length} micro_segments)`);

    const sections = await runMetaStep2(microSegments, language, videoId, {
      outputDir: options?.outputDir,
      onProgress: options?.onStep2Progress,
    });

    synthesisInput = { sections };
    console.log(`[meta-pipeline] step 2 done → ${sections.length} sections`);
  }

  const provider = promptsSettingsService.get().defaultLlmProvider;
  const profile = chromeProfilesService.pickSubProfile();

  console.log(`[meta-pipeline] Mở Chrome profile ${profile.name} cho step 3 + 4...`);

  try {
    await llmBrowserService.open(profile.id, provider);

    const session: MetaLlmSession = {
      profileId: profile.id,
      profileName: profile.name,
      provider,
    };

    console.log('[meta-pipeline] running step 3...');
    const step3 = await executeMetaStep3(session, synthesisInput, language, videoId, {
      outputDir: options?.outputDir,
      onProgress: options?.onStep3Progress,
    });

    console.log('[meta-pipeline] running step 4 on same profile...');
    const step4 = await executeMetaStep4(session, step3, language, videoId, {
      outputDir: options?.outputDir,
      onProgress: options?.onStep4Progress,
    });

    return { step3, step4 };
  } finally {
    // await chromeProfilesService.closeSubProfiles([profile.id]);
  }
}
