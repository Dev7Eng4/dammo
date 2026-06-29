export interface VisualStyle {
  id: string;
  name: string;
  rule: string;
  niche: string;
  createdAt: string;
  updatedAt: string;
}

export interface VisualStylesStore {
  styles: VisualStyle[];
}

export interface CreateVisualStyleInput {
  name: string;
  rule: string;
  niche: string;
}

export interface UpdateVisualStyleInput {
  name?: string;
  rule?: string;
  niche?: string;
}
