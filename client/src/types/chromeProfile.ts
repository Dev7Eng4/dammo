export type ChromeProfileRole = 'main' | 'sub';

export interface ChromeProfile {
  id: string;
  name: string;
  userDataDir: string;
  createdAt: string;
  role: ChromeProfileRole;
  /** Flow main-profile pick order. Absent when newly added. */
  usageOrder?: number;
}

export interface ChromeProfilesResponse {
  items: ChromeProfile[];
}

export interface CreateChromeProfilePayload {
  name: string;
}

export interface UpdateChromeProfilePayload {
  name: string;
}

export interface AddChromeProfileFormValues {
  name: string;
}

export interface EditChromeProfileFormValues {
  name: string;
}

export interface ResetSubProfilesResponse {
  deletedCount: number;
  items: ChromeProfile[];
}
