export interface Niche {
  key: string;
  label: string;
  createdAt: string;
}

export interface NichesStore {
  niches: Niche[];
}

export interface CreateNicheInput {
  label: string;
}
