export type FacebookPageStatus = 'draft' | 'created' | 'active' | 'paused';
export type FacebookVideoFormat = '9:16' | '16:9';
export type FacebookPageStatusFilter = 'all' | FacebookPageStatus;

export interface FacebookPage {
  id: string;
  name: string;
  topic: string;
  category: string;
  bio: string;
  /** Missing on older records; treated as 9:16. */
  videoFormat?: FacebookVideoFormat;
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
  videoFormat: FacebookVideoFormat;
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
