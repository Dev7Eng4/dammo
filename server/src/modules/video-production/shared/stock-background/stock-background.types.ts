import type { StockBackgroundMode } from './stock-background.constants.js';

export interface PrepareStockBackgroundResult {
  stockClipPath: string;
  stockTempDir: string;
}

export interface PrepareStockBackgroundOptions {
  mode: StockBackgroundMode;
  backgroundFootageSourceIds?: string[];
}
