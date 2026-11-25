import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { listVoicevoxSpeakers } from '../../infrastructure/tts/voicevox.client.js';
import { readVoiceSettings } from '../../infrastructure/tts/voice-settings.store.js';
import type { NarrationVoice } from './narration-voice.js';

/**
 * VOICEVOX's terms of use ask every video read with a VOICEVOX character to credit it where viewers can see it,
 * as 「VOICEVOX:キャラクター名」. The narration step records which voice read a folder; the metadata step and the
 * upload step add the credit line to the description from that record.
 */
export const NARRATION_VOICE_FILE = 'narration-voice.json';

export interface NarrationVoiceRecord {
  provider: 'voicevox' | 'elevenlabs';
  label: string;
  /** VOICEVOX style id that read the narration. */
  voicevoxSpeaker?: number;
  /** As stored on the saved voice, e.g. 「青山龍星 — ノーマル (#13)」. */
  speakerName?: string;
  at: string;
}

/** Written next to the narration files every time a narration is synthesized. */
export async function recordNarrationVoice(dir: string, voice: NarrationVoice): Promise<void> {
  const record: NarrationVoiceRecord = {
    provider: voice.provider,
    label: voice.label,
    ...(voice.voicevoxSpeaker !== undefined ? { voicevoxSpeaker: voice.voicevoxSpeaker } : {}),
    ...(voice.speakerName ? { speakerName: voice.speakerName } : {}),
    at: new Date().toISOString(),
  };
  await fsp.writeFile(path.join(dir, NARRATION_VOICE_FILE), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}

/** 「青山龍星 — ノーマル (#13)」 / 「青山龍星・ノーマル」 → 「青山龍星」. */
export function voicevoxCharacterName(speakerName: string): string {
  return speakerName.split(/\s+[—–-]\s+|・|（|\s*\(/)[0]!.trim();
}

function readJsonFile(file: string): any {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

/** Which VOICEVOX style read this folder: the narration record, else the voice a channel video saved before records existed. */
function readNarrationSpeaker(workDir: string): { speaker: number; speakerName?: string } | null {
  for (const file of [path.join(workDir, NARRATION_VOICE_FILE), path.join(workDir, 'narration', NARRATION_VOICE_FILE)]) {
    const record = readJsonFile(file) as NarrationVoiceRecord | undefined;
    if (!record) continue;
    if (record.provider !== 'voicevox' || typeof record.voicevoxSpeaker !== 'number') return null;
    return { speaker: record.voicevoxSpeaker, ...(record.speakerName ? { speakerName: record.speakerName } : {}) };
  }
  const legacy = readJsonFile(path.join(workDir, 'remake-state.json'))?.voice;
  if (!legacy || typeof legacy.speaker !== 'number') return null;
  const presets = readVoiceSettings().voicevox.presets;
  const preset = presets.find(item => item.id === legacy.presetId) ?? presets.find(item => item.speaker === legacy.speaker);
  return { speaker: legacy.speaker, ...(preset?.speakerName ? { speakerName: preset.speakerName } : {}) };
}

/** 「VOICEVOX:青山龍星」 for a folder narrated with VOICEVOX, null otherwise (or when the name cannot be found). */
export async function resolveVoicevoxCredit(workDir: string): Promise<string | null> {
  const narration = readNarrationSpeaker(workDir);
  if (!narration) return null;
  let name = narration.speakerName ? voicevoxCharacterName(narration.speakerName) : '';
  if (!name) {
    try {
      const speakers = await listVoicevoxSpeakers();
      name = speakers.find(speaker => speaker.styles.some(style => style.id === narration.speaker))?.name ?? '';
    } catch {
      // Engine off: no name to credit.
    }
  }
  return name ? `VOICEVOX:${name}` : null;
}

/** The description with the credit line added once at the end. */
export function withVoicevoxCredit(description: string, credit: string | null): string {
  if (!credit) return description;
  // Already credited, however it was typed: 「VOICEVOX：青山龍星」, 「VOICEVOX: 青山龍星」, 「voicevox:青山龍星」.
  const squash = (text: string) => text.replace(/：/g, ':').replace(/\s+/g, '').toLowerCase();
  if (squash(description).includes(squash(credit))) return description;
  return description.trim() ? `${description.trimEnd()}\n\n${credit}` : credit;
}
