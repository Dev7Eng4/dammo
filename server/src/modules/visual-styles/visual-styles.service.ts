import { AppError } from '../../shared/http/errors.js';
import { generateId } from '../../shared/id.js';
import { visualStylesRepository } from './visual-styles.repository.js';
import type {
  CreateVisualStyleInput,
  UpdateVisualStyleInput,
  VisualStyle,
} from './visual-styles.types.js';

export class VisualStylesService {
  list(): VisualStyle[] {
    return visualStylesRepository.findAll();
  }

  getById(id: string): VisualStyle {
    const style = visualStylesRepository.findById(id);
    if (!style) {
      throw new AppError('Visual style not found', 404, 'NOT_FOUND');
    }
    return style;
  }

  create(input: CreateVisualStyleInput): VisualStyle {
    const now = new Date().toISOString();
    const style: VisualStyle = {
      id: generateId(),
      name: input.name.trim(),
      rule: input.rule.trim(),
      niche: input.niche.trim(),
      createdAt: now,
      updatedAt: now,
    };

    return visualStylesRepository.prepend(style);
  }

  update(id: string, input: UpdateVisualStyleInput): VisualStyle {
    this.getById(id);
    const now = new Date().toISOString();

    const updated = visualStylesRepository.update(id, (style) => ({
      ...style,
      name: input.name?.trim() ?? style.name,
      rule: input.rule?.trim() ?? style.rule,
      niche: input.niche?.trim() ?? style.niche,
      updatedAt: now,
    }));

    if (!updated) {
      throw new AppError('Visual style not found', 404, 'NOT_FOUND');
    }

    return updated;
  }

  delete(id: string): void {
    const removed = visualStylesRepository.remove(id);
    if (!removed) {
      throw new AppError('Visual style not found', 404, 'NOT_FOUND');
    }
  }
}

export const visualStylesService = new VisualStylesService();
