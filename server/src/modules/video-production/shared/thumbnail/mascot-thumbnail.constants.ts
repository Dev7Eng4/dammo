/** Mascot thumbnail: how many AI-designed candidates a channel may ask for. */
export const MIN_MASCOT_THUMBNAIL_CANDIDATES = 2;
export const MAX_MASCOT_THUMBNAIL_CANDIDATES = 4;

/** Thumbnail Director prompt (LLM → candidate concepts), `data/prompts/all/mascot_thumbnail_director/step-1.js`. */
export const MASCOT_THUMBNAIL_DIRECTOR_PROMPT_KEY = 'mascot_thumbnail_director';

/** Candidates are kept next to thumbnail.jpg so another one can be picked later. */
export const THUMBNAIL_CANDIDATES_DIRNAME = 'thumbnail-candidates';
export const THUMBNAIL_CANDIDATES_FILENAME = 'candidates.json';

/** Thumbnail Judge prompt (LLM with images → scores per candidate), `data/prompts/all/mascot_thumbnail_judge/step-1.js`. */
export const MASCOT_THUMBNAIL_JUDGE_PROMPT_KEY = 'mascot_thumbnail_judge';

/** Draw rounds: when no candidate has correct text after judging, every concept is drawn once more. */
export const MASCOT_THUMBNAIL_DRAW_ROUNDS = 2;
