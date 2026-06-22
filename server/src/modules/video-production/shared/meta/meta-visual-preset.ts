export interface MetaStep3VisualStylePreset {
  name: string;
  rules: string[];
}

export const DEFAULT_VISUAL_STYLE: MetaStep3VisualStylePreset = {
  name: 'cinematic',
  rules: [
    'realistic human proportions',
    'film-like composition',
    'natural facial expressions',
    'low-key dramatic lighting',
    'shallow depth of field',
    'muted color grading',
  ],
};
