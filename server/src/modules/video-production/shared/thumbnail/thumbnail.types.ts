export interface ThumbnailHorizontalCharacter {
  role: string;
  appearance: string;
  expression: string;
  pose: string;
}

export interface ThumbnailHorizontalStep1Output {
  detected_niche: string;
  sub_niche: string;
  dominant_emotion: string;
  secondary_emotion: string;
  core_conflict: string;
  clickable_reveal: string;
  best_thumbnail_moment: string;
  evidence_object: string;
  setting: string;
  characters: {
    character_1: ThumbnailHorizontalCharacter;
    character_2: ThumbnailHorizontalCharacter;
  };
  visual_tone: string;
  visual_scene: string;
  safe_visual_description: string;
  ctr_reasoning: {
    why_this_moment_is_clickable: string;
    what_viewer_will_wonder: string;
    main_curiosity_gap: string;
  };
  thumbnail_angle: {
    line_1_concept: string;
    line_2_concept: string;
    line_3_concept: string;
    twist_line_concept: string;
  };
  risk_flags: {
    real_person_risk: boolean;
    minor_risk: boolean;
    explicit_sexual_content_risk: boolean;
    graphic_violence_risk: boolean;
    copyright_or_logo_risk: boolean;
    defamation_risk: boolean;
  };
  safety_notes: string;
}

export interface ThumbnailHorizontalCopy {
  line_1: string;
  line_2: string;
  line_3: string;
  twist_line: string;
}

export interface ThumbnailHorizontalStep2Output {
  thumbnail_copy: ThumbnailHorizontalCopy;
  copy_intent: {
    line_1_role: string;
    line_2_role: string;
    line_3_role: string;
    twist_line_role: string;
  };
  length_check: {
    line_1_visual_length: string;
    line_2_visual_length: string;
    line_3_visual_length: string;
    twist_line_visual_length: string;
    top_lines_balanced: boolean;
  };
  safety_check: {
    no_explicit_sexual_wording: boolean;
    no_real_person_claim: boolean;
    no_copyrighted_reference: boolean;
    no_unsupported_fact: boolean;
  };
}

export interface ThumbnailHorizontalStep3Output {
  thumbnail_copy: ThumbnailHorizontalCopy;
  layout_tokens: Record<string, unknown>;
  typography_tokens: Record<string, unknown>;
  color_strategy: Record<string, unknown>;
  visual_prompt: string;
  negative_prompt: string;
  image_generation_rules: Record<string, unknown>;
  renderer_notes: Record<string, unknown>;
}

export interface ThumbnailHorizontalPlan {
  thumbnailCopy: ThumbnailHorizontalCopy;
  colorStrategy: Record<string, unknown>;
  visualPrompt: string;
  negativePrompt: string;
}

export interface ThumbnailHorizontalOutput {
  step1: ThumbnailHorizontalStep1Output;
  step2: ThumbnailHorizontalStep2Output;
  step3: ThumbnailHorizontalStep3Output;
  plan: ThumbnailHorizontalPlan;
}

export type ThumbnailHorizontalStep = 1 | 2 | 3;
export type ThumbnailHorizontalStatus = 'started' | 'retry';

export interface ThumbnailHorizontalProgress {
  step: ThumbnailHorizontalStep;
  attempt: number;
  profileId: string;
  profileName: string;
  status: ThumbnailHorizontalStatus;
}

export interface RunThumbnailHorizontalOptions {
  onProgress?: (progress: ThumbnailHorizontalProgress) => void;
  outputDir?: string;
}
