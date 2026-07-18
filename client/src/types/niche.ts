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

export interface AddNicheFormValues {
  label: string;
}
