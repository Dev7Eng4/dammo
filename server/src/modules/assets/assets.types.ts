export type AssetKind = 'audioBar' | 'fonts' | 'smallVideo' | 'siLocalStock' | 'subscribe';

export interface AssetFileItem {
  name: string;
  size: number;
  updatedAt: string;
}
