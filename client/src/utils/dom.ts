const INTERACTIVE_SELECTOR = 'a, button, input, select, textarea, label, [role="button"], [data-no-card-select]'

/** True when the click landed on (or inside) a control that has its own behavior. */
export function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(INTERACTIVE_SELECTOR) !== null
}
