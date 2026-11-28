import { z } from 'zod';

const unit = z.number().min(0).max(1);

const speechEngineSettingsSchema = z.object({
  url: z.string().trim().max(500).optional(),
  defaultSpeaker: z.number().int().min(0).nullable().optional(),
  defaultPresetId: z.string().trim().max(100).nullable().optional(),
});

export const updateVoiceSettingsSchema = z.object({
  voicevox: speechEngineSettingsSchema.optional(),
  aivisspeech: speechEngineSettingsSchema.optional(),
  elevenlabs: z
    .object({
      defaultPresetId: z.string().trim().max(100).nullable().optional(),
      outputFormat: z.string().trim().min(1).max(50).optional(),
    })
    .optional(),
});

export const voicePresetSchema = z.object({
  name: z.string().trim().min(1).max(100),
  voiceId: z.string().trim().min(1).max(100),
  voiceName: z.string().trim().max(200).optional(),
  modelId: z.string().trim().min(1).max(100),
  stability: unit,
  similarityBoost: unit,
  style: unit,
  speed: z.number().min(0.7).max(1.2),
});

export const updateVoicePresetSchema = voicePresetSchema.partial();

export const voicevoxPresetSchema = z.object({
  name: z.string().trim().min(1).max(100),
  // AivisSpeech style ids are large (e.g. 888753760).
  speaker: z.number().int().min(0),
  speakerName: z.string().trim().max(200).optional(),
  speedScale: z.number().min(0.5).max(2),
  pitchScale: z.number().min(-0.15).max(0.15),
  intonationScale: z.number().min(0).max(2),
  volumeScale: z.number().min(0).max(2),
  pauseLengthScale: z.number().min(0).max(2),
});

export const updateVoicevoxPresetSchema = voicevoxPresetSchema.partial();

/** Voice settings chosen for one run only (not saved as a voice). */
export const customVoicevoxVoiceSchema = voicevoxPresetSchema.omit({ name: true });
export const customElevenLabsVoiceSchema = voicePresetSchema.omit({ name: true });
export const customNarrationVoiceSchema = z.union([customVoicevoxVoiceSchema, customElevenLabsVoiceSchema]);

export const addElevenLabsKeySchema = z.object({
  label: z.string().trim().max(100).optional(),
  apiKey: z.string().trim().min(10).max(200),
});

export const updateElevenLabsKeySchema = z.object({
  label: z.string().trim().max(100).optional(),
  enabled: z.boolean().optional(),
});

export const synthesizeSpeechSchema = z.object({
  provider: z.enum(['voicevox', 'aivisspeech', 'elevenlabs']),
  text: z.string().trim().min(1).max(5000),
  speaker: z.number().int().min(0).optional(),
  /** ElevenLabs saved voice; falls back to the default preset. */
  presetId: z.string().trim().max(100).optional(),
  voiceId: z.string().trim().max(100).optional(),
  modelId: z.string().trim().max(100).optional(),
  stability: unit.optional(),
  similarityBoost: unit.optional(),
  style: unit.optional(),
  speed: z.number().min(0.5).max(2).optional(),
  pitchScale: z.number().min(-0.15).max(0.15).optional(),
  intonationScale: z.number().min(0).max(2).optional(),
  volumeScale: z.number().min(0).max(2).optional(),
  pauseLengthScale: z.number().min(0).max(2).optional(),
});
