export interface SmallVideoGroup {
  id: string;
  name: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SmallVideoGroupListItem extends SmallVideoGroup {
  mediaCount: number;
}

export interface SmallVideoGroupsStore {
  groups: SmallVideoGroup[];
}

export interface CreateSmallVideoGroupInput {
  name: string;
  note?: string;
}

export interface SmallVideoGroupMediaItem {
  name: string;
  size: number;
  updatedAt: string;
}
