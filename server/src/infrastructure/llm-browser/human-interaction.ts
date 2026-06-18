import type { Locator, Page } from 'playwright';

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function randomDelay(minMs = 120, maxMs = 420): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, randomInt(minMs, maxMs)));
}

async function getMousePosition(page: Page): Promise<{ x: number; y: number }> {
  const fallback = { x: randomInt(80, 200), y: randomInt(80, 200) };
  return page.evaluate((fb) => {
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

export async function humanType(page: Page, locator: Locator, text: string): Promise<void> {
  await humanTypeSequential(page, locator, text);
}

export async function humanTypeSequential(page: Page, locator: Locator, text: string): Promise<void> {
  await humanClick(page, locator);
  await randomDelay(120, 300);

  try {
    await locator.pressSequentially(text, { delay: randomInt(40, 120) });
  } catch {
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

  await randomDelay(150, 350);
}

export async function humanPaste(page: Page, locator: Locator, text: string): Promise<void> {
  try {
    await humanClick(page, locator);
    await randomDelay(120, 300);
    await page.evaluate(async (content) => {
      await navigator.clipboard.writeText(content);
    }, text);
    await randomDelay(80, 180);
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+v`, { delay: randomInt(30, 90) });
    await randomDelay(150, 350);
  } catch {
    await humanTypeSequential(page, locator, text);
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

export async function humanPressEnter(page: Page): Promise<void> {
  await randomDelay(100, 250);
  await page.keyboard.press('Enter', { delay: randomInt(30, 90) });
  await randomDelay(120, 280);
}
