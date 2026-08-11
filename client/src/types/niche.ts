export interface Niche {
  key: string;
  label: string;
  createdAt: string;
}

export interface NichesResponse {
  items: Niche[];
}

export interface CreateNichePayload {
  label: string;
}

export interface UpdateNichePayload {
  label: string;
}

export interface AddNicheFormValues {
  label: string;
}

export type NicheMutationAction = 'create' | 'update' | 'delete';

export interface NicheUsageItem {
  id: string;
  name: string;
}

export interface NicheUsage {
  inUse: boolean;
  prompts: NicheUsageItem[];
  sourceChannels: NicheUsageItem[];
  youtubeChannels: NicheUsageItem[];
}
