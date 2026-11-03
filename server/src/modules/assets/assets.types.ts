export type AssetKind = 'audioBar' | 'fonts' | 'smallVideo' | 'siLocalStock' | 'subscribe' | 'mascot';

export interface AssetFileItem {
  name: string;
  size: number;
  updatedAt: string;
  prepared?: boolean;
}
