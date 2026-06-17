export type ChromeProfileRole = 'main' | 'sub';

export interface ChromeProfile {
  id: string;
  name: string;
  userDataDir: string;
  createdAt: string;
  role: ChromeProfileRole;
}

export interface ChromeProfilesResponse {
  items: ChromeProfile[];
}

export interface CreateChromeProfilePayload {
  name: string;
}

export interface AddChromeProfileFormValues {
  name: string;
}

export interface ResetSubProfilesResponse {
  deletedCount: number;
  items: ChromeProfile[];
}
