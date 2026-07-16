import { paths } from '../../config/paths.js';
import { readJson, updateJson } from '../storage/json-store.js';

export interface FlowProjectRecord {
  projectId: string;
  usageCount: number;
  updatedAt: string;
}

export interface FlowProjectsStore {
  profiles: Record<string, FlowProjectRecord>;
}

const EMPTY_STORE: FlowProjectsStore = { profiles: {} };

function loadStore(): FlowProjectsStore {
  return readJson<FlowProjectsStore>(paths.flowProjects) ?? EMPTY_STORE;
}

export function getFlowProject(profileId: string): FlowProjectRecord | null {
  const record = loadStore().profiles[profileId];
  if (!record?.projectId) return null;
  return record;
}

export function saveFlowProject(profileId: string, projectId: string, usageCount = 0): FlowProjectRecord {
  const record: FlowProjectRecord = {
    projectId,
    usageCount,
    updatedAt: new Date().toISOString(),
  };

  updateJson<FlowProjectsStore>(
    paths.flowProjects,
    store => ({
      profiles: {
        ...store.profiles,
        [profileId]: record,
      },
    }),
    EMPTY_STORE,
  );

  return record;
}

export function incrementFlowProjectUsage(profileId: string): FlowProjectRecord | null {
  let updated: FlowProjectRecord | null = null;

  updateJson<FlowProjectsStore>(
    paths.flowProjects,
    store => {
      const current = store.profiles[profileId];
      if (!current?.projectId) return store;

      updated = {
        ...current,
        usageCount: current.usageCount + 1,
        updatedAt: new Date().toISOString(),
      };

      return {
        profiles: {
          ...store.profiles,
          [profileId]: updated,
        },
      };
    },
    EMPTY_STORE,
  );

  return updated;
}

export function clearFlowProject(profileId: string): void {
  updateJson<FlowProjectsStore>(
    paths.flowProjects,
    store => {
      const { [profileId]: _removed, ...profiles } = store.profiles;
      return { profiles };
    },
    EMPTY_STORE,
  );
}
