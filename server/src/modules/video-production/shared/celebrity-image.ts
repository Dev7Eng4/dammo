import path from 'node:path';
import { celebrityDir } from '../../../config/paths.js';
import { AppError } from '../../../shared/http/errors.js';
import { celebritiesService } from '../../celebrities/celebrities.service.js';

/** Absolute path of one random image from the celebrity's media folder. */
export function pickRandomCelebrityImagePath(celebrityId: string): string {
  celebritiesService.getById(celebrityId);

  const images = celebritiesService.listMedia(celebrityId).filter(item => item.kind === 'image');
  if (images.length === 0) {
    throw new AppError(`No celebrity images found for celebrityId "${celebrityId}"`, 400, 'CELEBRITY_IMAGES_EMPTY');
  }

  const picked = images[Math.floor(Math.random() * images.length)]!;
  return path.join(celebrityDir(celebrityId), picked.name);
}
