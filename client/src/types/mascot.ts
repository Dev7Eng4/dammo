export interface MascotListItem {
  id: string;
  name: string;
  /** Prompt used to generate the mascot reference image. */
  prompt: string;
  imageFile?: string;
  hasImage: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MascotInput {
  name: string;
  prompt: string;
}

export interface MascotFormValues {
  name: string;
  prompt: string;
}
