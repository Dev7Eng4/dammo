export type ChromeProfileRole = 'main' | 'sub';

export interface ChromeProfile {
  id: string;
  name: string;
  userDataDir: string;
  createdAt: string;
  role: ChromeProfileRole;
}

export interface ChromeProfilesStore {
  profiles: ChromeProfile[];
}

export interface CreateChromeProfileInput {
  name: string;
}

export interface UpdateChromeProfileInput {
  name: string;
}

export interface ResetSubProfilesResult {
  deletedCount: number;
  items: ChromeProfile[];
}

export const SUB_PROFILE_COUNT = 8;
