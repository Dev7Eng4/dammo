export type AssetKind = 'audioBar' | 'fonts' | 'smallVideo' | 'siLocalStock';

export interface AssetFileItem {
  name: string;
  size: number;
  updatedAt: string;
}
