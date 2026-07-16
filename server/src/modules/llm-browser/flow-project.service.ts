import type { Page } from 'playwright';
import { FLOW_PROJECT_MAX_USAGE_COUNT } from '../../infrastructure/llm-browser/flow.config.js';
import {
  getFlowProject,
  incrementFlowProjectUsage,
  saveFlowProject,
} from '../../infrastructure/llm-browser/flow-project.store.js';
import {
  createNewFlowProject,
  ensureInitialProjectSetup,
  openFlowProjectPage,
} from '../../infrastructure/llm-browser/providers/flow-llm.provider.js';

export interface ResolveFlowProjectOptions {
  explicitProjectId?: string;
  skipInitialSetup?: boolean;
}

async function createAndSaveFlowProject(profileId: string, page: Page, reason: string): Promise<string> {
  console.log(`[flow-project] profile ${profileId}: ${reason}`);
  const projectId = await createNewFlowProject(page);
  saveFlowProject(profileId, projectId, 0);
  console.log(`[flow-project] profile ${profileId}: saved new project ${projectId} (usage 0)`);
  return projectId;
}

export async function resolveFlowProjectId(
  profileId: string,
  page: Page,
  options?: ResolveFlowProjectOptions,
): Promise<string> {
  if (options?.explicitProjectId) {
    return options.explicitProjectId;
  }

  const saved = getFlowProject(profileId);

  if (!saved?.projectId) {
    return createAndSaveFlowProject(profileId, page, 'no saved project, creating new...');
  }

  if (saved.usageCount >= FLOW_PROJECT_MAX_USAGE_COUNT) {
    return createAndSaveFlowProject(
      profileId,
      page,
      `usage ${saved.usageCount}/${FLOW_PROJECT_MAX_USAGE_COUNT}, rotating project...`,
    );
  }

  console.log(`[flow-project] profile ${profileId}: using project ${saved.projectId} (usage ${saved.usageCount})`);

  const valid = await openFlowProjectPage(page, saved.projectId);
  if (!valid) {
    return createAndSaveFlowProject(
      profileId,
      page,
      `saved project ${saved.projectId} invalid, recreating...`,
    );
  }

  if (!options?.skipInitialSetup) {
    await ensureInitialProjectSetup(page, saved.projectId);
  }

  return saved.projectId;
}

export function recordFlowProjectUsage(profileId: string, explicitProjectId?: string): void {
  if (explicitProjectId) return;

  const updated = incrementFlowProjectUsage(profileId);
  if (updated) {
    console.log(`[flow-project] profile ${profileId}: usage now ${updated.usageCount}`);
  }
}
