export interface VisualStyle {
  id: string;
  name: string;
  rule: string;
  niche: string;
  createdAt: string;
  updatedAt: string;
}

export interface VisualStylesResponse {
  items: VisualStyle[];
}

export interface VisualStyleFormValues {
  name: string;
  rule: string;
  niche: string;
}

export interface CreateVisualStylePayload {
  name: string;
  rule: string;
  niche: string;
}

export interface UpdateVisualStylePayload {
  name?: string;
  rule?: string;
  niche?: string;
}
