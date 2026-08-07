export type CelebrityMediaKind = 'image' | 'video';

export interface Celebrity {
  id: string;
  name: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CelebrityListItem extends Celebrity {
  mediaCount: number;
}

export interface CelebrityMediaItem {
  name: string;
  kind: CelebrityMediaKind;
  size: number;
  updatedAt: string;
}

export interface CreateCelebrityInput {
  name: string;
  note?: string;
}

export interface CelebrityFormValues {
  name: string;
  note: string;
}
