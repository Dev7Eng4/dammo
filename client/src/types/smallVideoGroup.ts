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

export interface SmallVideoGroupMediaItem {
  name: string;
  size: number;
  updatedAt: string;
}

export interface CreateSmallVideoGroupInput {
  name: string;
  note?: string;
}

export interface DownloadSmallVideoInput {
  url: string;
  groupId?: string;
}

export interface DownloadSmallVideoFormValues {
  url: string;
  /** Empty string = save as ungrouped. */
  groupId: string;
}

export interface SmallVideoGroupFormValues {
  name: string;
  note: string;
}
