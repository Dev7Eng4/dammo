export type FacebookPageStatus = 'draft' | 'created' | 'active' | 'paused';
export type FacebookPageStatusFilter = 'all' | FacebookPageStatus;

export interface FacebookPage {
  id: string;
  name: string;
  topic: string;
  category: string;
  bio: string;
  linkedEmail: string;
  pageUrl: string;
  status: FacebookPageStatus | 'deleted';
  followers?: number;
  notes?: string;
  lastPostAt?: string;
  createdAt: string;
}

export interface FacebookPagesResponse {
  items: FacebookPage[];
  total: number;
}

export interface FacebookPageFormValues {
  name: string;
  topic: string;
  category: string;
  bio: string;
  mailAccountId: string;
  pageUrl: string;
  notes: string;
}

export type CreateFacebookPagePayload = FacebookPageFormValues;
export type UpdateFacebookPagePayload = Partial<FacebookPageFormValues> & {
  status?: FacebookPageStatus;
};

export interface PostFacebookPagePayload {
  text: string;
  imageFile?: string;
}

export interface UploadFacebookVideoPayload {
  videoFile: string;
  caption: string;
}
