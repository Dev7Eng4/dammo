export interface Mascot {
  id: string;
  name: string;
  /** Prompt used to generate the mascot reference image. */
  prompt: string;
  /** File name of the reference image inside the mascot's folder, when uploaded. */
  imageFile?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MascotListItem extends Mascot {
  hasImage: boolean;
}

export interface MascotsStore {
  mascots: Mascot[];
}

export interface CreateMascotInput {
  name: string;
  prompt: string;
}

export interface UpdateMascotInput {
  name?: string;
  prompt?: string;
}
