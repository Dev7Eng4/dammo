export interface MetaSubmitSnapshot {
  /** Composer text length right before submit; -1 when it could not be read. */
  inputLenBefore: number;
  /** Composer text length now; -1 when it could not be read. */
  inputLen: number;
  /** Message items before submit. */
  baselineMessages: number;
  /** Message items now. */
  messages: number;
  /** Composer shows the stop button: Meta is generating. */
  generating: boolean;
}

/**
 * - `sent`: the prompt left the composer and Meta reacted to it.
 * - `pending`: nothing was submitted yet (Enter ignored, reference image still uploading...).
 * - `hijacked`: the chat moved on while the prompt is still in the composer, so Meta received
 *   something else (e.g. a follow-up suggestion chip). Its answer must not be used.
 */
export type MetaSubmitState = 'sent' | 'pending' | 'hijacked';

/** Letters and digits only: the editor may change spacing, line breaks and markdown marks. */
function comparableText(text: string): string {
  return text.replace(/[^\p{L}\p{N}]+/gu, '');
}

/** True when the composer holds exactly this prompt: not a cut-off one, not one with leftovers around it. */
export function composerMatchesPrompt(composerText: string, prompt: string): boolean {
  return comparableText(composerText) === comparableText(prompt);
}

/** True when the composer holds at least half of `expectedLen` (an empty one may still report its placeholder). */
export function composerHoldsPrompt(inputLen: number, expectedLen: number): boolean {
  return inputLen > 0 && expectedLen > 0 && inputLen >= expectedLen / 2;
}

export function classifyMetaSubmit(snapshot: MetaSubmitSnapshot): MetaSubmitState {
  const reacted = snapshot.messages > snapshot.baselineMessages || snapshot.generating;
  if (!reacted) return 'pending';
  return composerHoldsPrompt(snapshot.inputLen, snapshot.inputLenBefore) ? 'hijacked' : 'sent';
}
