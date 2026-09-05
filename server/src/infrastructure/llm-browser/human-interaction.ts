import type { BrowserContext, Locator, Page } from 'playwright';

export type PasteStrategy = 'human' | 'direct' | 'insertText';

export const MOUSE_TRACKING_INIT_SCRIPT = `
(() => {
  const update = (e) => {
    window.__pwMouseX = e.clientX;
    window.__pwMouseY = e.clientY;
  };
  window.addEventListener('mousemove', update, { capture: true, passive: true });
  window.addEventListener('pointermove', update, { capture: true, passive: true });
})();
`;

export async function installMouseTracking(context: BrowserContext): Promise<void> {
  await context.addInitScript(MOUSE_TRACKING_INIT_SCRIPT);
}

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function randomDelay(minMs = 120, maxMs = 420): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, randomInt(minMs, maxMs)));
}

async function getMousePosition(page: Page): Promise<{ x: number; y: number }> {
  const fallback = { x: randomInt(80, 200), y: randomInt(80, 200) };
  return page.evaluate(fb => {
    const w = window as unknown as { __pwMouseX?: number; __pwMouseY?: number };
    return {
      x: w.__pwMouseX ?? fb.x,
      y: w.__pwMouseY ?? fb.y,
    };
  }, fallback);
}

export async function humanMove(page: Page, targetX: number, targetY: number): Promise<void> {
  const start = await getMousePosition(page);
  const steps = randomInt(12, 24);

  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    const eased = t * t * (3 - 2 * t);
    const x = start.x + (targetX - start.x) * eased + randomInt(-1, 1);
    const y = start.y + (targetY - start.y) * eased + randomInt(-1, 1);
    await page.mouse.move(x, y, { steps: 1 });
    await randomDelay(8, 24);
  }

  await page.mouse.move(targetX, targetY, { steps: 1 });
}

export async function humanWander(page: Page): Promise<void> {
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  const x = randomInt(Math.floor(viewport.width * 0.2), Math.floor(viewport.width * 0.8));
  const y = randomInt(Math.floor(viewport.height * 0.2), Math.floor(viewport.height * 0.7));
  await humanMove(page, x, y);
  await randomDelay(200, 500);
}

export async function humanClick(page: Page, locator: Locator): Promise<void> {
  await locator.waitFor({ state: 'visible', timeout: 30_000 });
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('Element is not clickable');
  }

  const x = box.x + box.width * (0.35 + Math.random() * 0.3);
  const y = box.y + box.height * (0.35 + Math.random() * 0.3);

  await humanMove(page, x, y);
  await randomDelay(80, 220);
  await page.mouse.click(x, y, { delay: randomInt(40, 120) });
  await randomDelay(100, 280);
}

/** Precise click for popover/setup flows — no wander, no scrollIntoView. */
export async function setupClick(locator: Locator): Promise<void> {
  await locator.waitFor({ state: 'visible', timeout: 15_000 });
  await locator.click({ delay: randomInt(20, 60) });
  await randomDelay(200, 400);
}

export async function humanType(page: Page, locator: Locator, text: string): Promise<void> {
  await humanTypeSequential(page, locator, text);
}

async function getInputTextLength(locator: Locator): Promise<number> {
  return locator.evaluate(el => {
    const target = el as HTMLElement;
    const nested =
      target.isContentEditable ||
      target.getAttribute('role') === 'textbox' ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLInputElement
        ? target
        : target.querySelector<HTMLElement>('[contenteditable="true"], [role="textbox"], textarea, input');
    if (!nested) return 0;
    if (nested instanceof HTMLTextAreaElement || nested instanceof HTMLInputElement) return nested.value.length;
    return (nested.textContent ?? '').length;
  });
}

function keyboardModifier(): string {
  return process.platform === 'darwin' ? 'Meta' : 'Control';
}

/** Clear focused input via Ctrl/Meta+A then Backspace — safe for Slate/contenteditable. */
export async function humanClearInput(page: Page): Promise<void> {
  const modifier = keyboardModifier();
  await page.keyboard.press(`${modifier}+a`, { delay: randomInt(30, 90) });
  await randomDelay(80, 150);
  await page.keyboard.press('Backspace', { delay: randomInt(30, 90) });
  await randomDelay(80, 150);
}

async function pasteViaClipboard(page: Page, text: string): Promise<void> {
  await page.evaluate(async content => {
    await navigator.clipboard.writeText(content);
  }, text);
  await randomDelay(80, 180);
  const modifier = keyboardModifier();
  await page.keyboard.press(`${modifier}+v`, { delay: randomInt(30, 90) });
}

async function clearInput(locator: Locator): Promise<void> {
  await locator.evaluate(el => {
    const target = el as HTMLElement;
    target.focus();
    if (target.isContentEditable) {
      target.textContent = '';
      target.dispatchEvent(new InputEvent('input', { bubbles: true }));
      return;
    }
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
      target.value = '';
      target.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
}

async function setInputTextContent(locator: Locator, text: string): Promise<void> {
  await locator.evaluate((el, content) => {
    const target = el as HTMLElement;
    target.focus();
    if (target.isContentEditable) {
      target.textContent = content;
      target.dispatchEvent(new InputEvent('input', { bubbles: true }));
      return;
    }
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
      target.value = content;
      target.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, text);
}

export async function waitForInputText(locator: Locator, minLength: number, timeoutMs = 15_000): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let length = 0;

  while (Date.now() < deadline) {
    length = await getInputTextLength(locator);
    if (length >= minLength) return length;
    await randomDelay(100, 200);
  }

  return length;
}

function logPasteResult(method: string, promptLength: number, inputLength: number): void {
  console.log(`[human-paste] method=${method} promptLength=${promptLength} inputLength=${inputLength}`);
}

export async function setInputTextDirect(
  page: Page,
  locator: Locator,
  text: string,
  options?: { skipClear?: boolean },
): Promise<void> {
  await humanClick(page, locator);
  await randomDelay(120, 300);
  if (!options?.skipClear) {
    await clearInput(locator);
  }
  await setInputTextContent(locator, text);
  await randomDelay(150, 350);
}

export async function humanTypeSequential(
  page: Page,
  locator: Locator,
  text: string,
  options?: { skipClear?: boolean },
): Promise<void> {
  await humanClick(page, locator);
  await randomDelay(120, 300);
  if (!options?.skipClear) {
    await clearInput(locator);
  }

  try {
    await locator.pressSequentially(text, { delay: randomInt(40, 120) });
  } catch {
    await setInputTextContent(locator, text);
  }

  await randomDelay(150, 350);
}

export async function humanPaste(
  page: Page,
  locator: Locator,
  text: string,
  options?: { pasteStrategy?: PasteStrategy; skipClear?: boolean },
): Promise<void> {
  const strategy = options?.pasteStrategy ?? 'human';
  const skipClear = options?.skipClear === true;
  const promptLength = text.length;

  if (strategy === 'direct') {
    await setInputTextDirect(page, locator, text, { skipClear });
    const inputLength = await getInputTextLength(locator);
    logPasteResult('direct', promptLength, inputLength);
    if (inputLength < promptLength) {
      throw new Error(`Direct fill incomplete: expected ${promptLength}, got ${inputLength}`);
    }
    return;
  }

  if (strategy === 'insertText') {
    try {
      await humanClick(page, locator);
      await randomDelay(120, 300);
      await locator.focus();
      if (!skipClear) {
        await humanClearInput(page);
      }
      await randomDelay(80, 180);
      await page.keyboard.insertText(text);
      let inputLength = await waitForInputText(locator, promptLength);
      logPasteResult('insertText', promptLength, inputLength);

      if (inputLength < promptLength) {
        if (!skipClear) {
          await humanClearInput(page);
        }
        await pasteViaClipboard(page, text);
        inputLength = await waitForInputText(locator, promptLength);
        logPasteResult('insertText-fallback-clipboard', promptLength, inputLength);
      }

      if (inputLength < promptLength) {
        throw new Error(`InsertText incomplete: expected ${promptLength}, got ${inputLength}`);
      }
    } catch {
      await humanClick(page, locator);
      await randomDelay(120, 300);
      await locator.focus();
      if (!skipClear) {
        await humanClearInput(page);
      }
      await locator.pressSequentially(text, { delay: randomInt(40, 120) });
      const inputLength = await getInputTextLength(locator);
      logPasteResult('insertText-fallback-sequential', promptLength, inputLength);
    }
    return;
  }

  try {
    await humanClick(page, locator);
    await randomDelay(120, 300);
    await locator.focus();
    if (!skipClear) {
      await humanClearInput(page);
    }
    await pasteViaClipboard(page, text);
    const inputLength = await waitForInputText(locator, promptLength);
    logPasteResult('clipboard', promptLength, inputLength);

    if (inputLength < promptLength) {
      await setInputTextDirect(page, locator, text, { skipClear });
      const finalLength = await getInputTextLength(locator);
      logPasteResult('clipboard-fallback-direct', promptLength, finalLength);
      if (finalLength < promptLength) {
        throw new Error(`Paste incomplete after fallback: expected ${promptLength}, got ${finalLength}`);
      }
    }
  } catch {
    await humanTypeSequential(page, locator, text, { skipClear });
    const inputLength = await getInputTextLength(locator);
    logPasteResult('sequential', promptLength, inputLength);
  }
}

export async function humanScroll(page: Page, deltaY: number): Promise<void> {
  const steps = randomInt(3, 8);
  const stepDelta = deltaY / steps;

  for (let i = 0; i < steps; i += 1) {
    await page.mouse.wheel(0, stepDelta + randomInt(-8, 8));
    await randomDelay(40, 120);
  }
}

export async function humanReadLatestResponse(page: Page, locator: Locator, containerSelector?: string): Promise<void> {
  const fallbackSelector = containerSelector ?? '';

  const scrollEvaluate = async () => {
    await locator.evaluate((el, selector) => {
      let node = el.parentElement;
      while (node) {
        const overflowY = getComputedStyle(node).overflowY;
        if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && node.scrollHeight > node.clientHeight + 4) {
          node.scrollTop = node.scrollHeight;
          return;
        }
        node = node.parentElement;
      }

      if (selector) {
        const parts = selector.split(',');
        for (let i = 0; i < parts.length; i++) {
          const candidate = parts[i].trim();
          if (!candidate) continue;
          const container = document.querySelector(candidate);
          if (!container) continue;
          const containerOverflowY = getComputedStyle(container).overflowY;
          if (
            (containerOverflowY === 'auto' || containerOverflowY === 'scroll' || containerOverflowY === 'overlay') &&
            container.scrollHeight > container.clientHeight + 4
          ) {
            container.scrollTop = container.scrollHeight;
            return;
          }
        }
      }

      el.scrollIntoView({ block: 'end' });
    }, fallbackSelector);
  };

  for (let pass = 0; pass < 3; pass += 1) {
    await scrollEvaluate();
    await randomDelay(250, 500);
  }

  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  const x = randomInt(Math.floor(viewport.width * 0.25), Math.floor(viewport.width * 0.75));
  const y = randomInt(Math.floor(viewport.height * 0.25), Math.floor(viewport.height * 0.55));
  await humanMove(page, x, y);
  await randomDelay(200, 400);

  await humanScroll(page, randomInt(150, 350));
  await scrollEvaluate();
  await randomDelay(400, 800);
  await humanScroll(page, randomInt(100, 200));
  await scrollEvaluate();
  await randomDelay(1_000, 2_500);
}

export async function humanPressEnter(page: Page): Promise<void> {
  await randomDelay(100, 250);
  await page.keyboard.press(' ', { delay: randomInt(30, 90) });
  await randomDelay(100, 250);
  await page.keyboard.press('Enter', { delay: randomInt(30, 90) });
  await randomDelay(120, 280);
}
