export interface PrepareStockBackgroundResult {
  stockClipPath: string;
  stockTempDir: string;
}

export interface PrepareStockBackgroundOptions {
  backgroundFootageSourceIds?: string[];
}
