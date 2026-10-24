export type FacebookPageStatus = 'draft' | 'created' | 'active' | 'paused' | 'deleted';

export interface FacebookPage {
  id: string;
  name: string;
  /** Niche key (see niches module); drives the Facebook category suggestion. */
  topic: string;
  /** Facebook page category label typed into the create-page form. */
  category: string;
  bio: string;
  /** Email of the GPM profile that owns this page. */
  linkedEmail: string;
  pageUrl: string;
  status: FacebookPageStatus;
  followers?: number;
  notes?: string;
  lastPostAt?: string;
  createdAt: string;
}

export interface FacebookPagesStore {
  pages: FacebookPage[];
}

export interface FacebookPageStats {
  total: number;
  draft: number;
  created: number;
  active: number;
  paused: number;
}
