import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import {
  addElevenLabsKeySchema,
  customNarrationVoiceSchema,
  synthesizeSpeechSchema,
  updateElevenLabsKeySchema,
  updateVoicePresetSchema,
  updateVoiceSettingsSchema,
  updateVoicevoxPresetSchema,
  voicePresetSchema,
  voicevoxPresetSchema,
} from './voice.schema.js';
import { z } from 'zod';
import { applyNarrationReadings, readNarrationReadings, removeNarrationReading, upsertNarrationReading } from './narration-readings.js';
import { resolveNarrationVoice } from './narration-voice.js';
import { voiceService } from './voice.service.js';

/** /api/v1/voice — voice settings (VOICEVOX, ElevenLabs keys) and text-to-speech. */
export function createVoiceRoutes() {
  const app = new Hono();

  app.get('/settings', c => c.json({ item: voiceService.getSettings() }));

  app.patch('/settings', zValidator('json', updateVoiceSettingsSchema), c =>
    c.json({ item: voiceService.updateSettings(c.req.valid('json')) }),
  );

  app.get('/voicevox/status', async c => c.json(await voiceService.voicevoxStatus()));

  /** Reading dictionary: words the narration voice reads as the given katakana (script and captions unchanged). */
  app.get('/readings', c => c.json({ items: readNarrationReadings() }));

  app.post(
    '/readings',
    zValidator(
      'json',
      z.object({
        surface: z.string().trim().min(1).max(40),
        reading: z.string().trim().min(1).max(80),
        note: z.string().trim().max(200).optional(),
      }),
    ),
    c => c.json({ items: upsertNarrationReading(c.req.valid('json')) }),
  );

  app.delete('/readings/:surface', c => c.json({ items: removeNarrationReading(c.req.param('surface')) }));

  /** Saved VOICEVOX voices: a speaker style + its own prosody settings. */
  app.get('/voicevox/presets', c => c.json({ items: voiceService.listVoicevoxPresets() }));

  app.post('/voicevox/presets', zValidator('json', voicevoxPresetSchema), c =>
    c.json({ item: voiceService.createVoicevoxPreset(c.req.valid('json')) }, 201),
  );

  app.patch('/voicevox/presets/:id', zValidator('json', updateVoicevoxPresetSchema), c =>
    c.json({ item: voiceService.updateVoicevoxPreset(c.req.param('id'), c.req.valid('json')) }),
  );

  app.delete('/voicevox/presets/:id', c => {
    voiceService.deleteVoicevoxPreset(c.req.param('id'));
    return c.json({ ok: true });
  });

  app.post('/voicevox/presets/:id/default', c =>
    c.json({ item: voiceService.setDefaultVoicevoxPreset(c.req.param('id')) }),
  );

  app.post('/elevenlabs/keys', zValidator('json', addElevenLabsKeySchema), async c =>
    c.json({ item: await voiceService.addElevenLabsKey(c.req.valid('json')) }, 201),
  );

  app.post('/elevenlabs/keys/check', async c => c.json({ items: await voiceService.checkAllElevenLabsKeys() }));

  app.patch('/elevenlabs/keys/:id', zValidator('json', updateElevenLabsKeySchema), c =>
    c.json({ item: voiceService.updateElevenLabsKey(c.req.param('id'), c.req.valid('json')) }),
  );

  app.delete('/elevenlabs/keys/:id', c => {
    voiceService.removeElevenLabsKey(c.req.param('id'));
    return c.json({ ok: true });
  });

  app.post('/elevenlabs/keys/:id/check', async c =>
    c.json({ item: await voiceService.checkElevenLabsKey(c.req.param('id')) }),
  );

  app.get('/elevenlabs/voices', async c => c.json({ items: await voiceService.listElevenLabsVoices() }));

  app.get('/elevenlabs/models', async c => c.json({ items: await voiceService.listElevenLabsModels() }));

  /** Saved ElevenLabs voices: a named voice + its own settings. */
  app.get('/elevenlabs/presets', c => c.json({ items: voiceService.listPresets() }));

  app.post('/elevenlabs/presets', zValidator('json', voicePresetSchema), c =>
    c.json({ item: voiceService.createPreset(c.req.valid('json')) }, 201),
  );

  app.patch('/elevenlabs/presets/:id', zValidator('json', updateVoicePresetSchema), c =>
    c.json({ item: voiceService.updatePreset(c.req.param('id'), c.req.valid('json')) }),
  );

  app.delete('/elevenlabs/presets/:id', c => {
    voiceService.deletePreset(c.req.param('id'));
    return c.json({ ok: true });
  });

  app.post('/elevenlabs/presets/:id/default', c =>
    c.json({ item: voiceService.setDefaultPreset(c.req.param('id')) }),
  );

  /** A sample read exactly the way the narration step will read it (same voice, pacing and speed). */
  app.post(
    '/narration-preview',
    zValidator(
      'json',
      z.object({
        provider: z.enum(['voicevox', 'elevenlabs']),
        presetId: z.string().trim().min(1).max(100).optional(),
        custom: customNarrationVoiceSchema.optional(),
        voicevoxSpeaker: z.number().int().min(0).optional(),
        speed: z.number().min(0.5).max(2).optional(),
        text: z.string().trim().min(1).max(500),
      }),
    ),
    async c => {
      const body = c.req.valid('json');
      const voice = resolveNarrationVoice(
        { provider: body.provider, presetId: body.presetId, custom: body.custom, voicevoxSpeaker: body.voicevoxSpeaker ?? 13 },
        body.speed ?? 1,
      );
      const { wav } = await voice.synthesize(applyNarrationReadings(body.text), 0);
      return new Response(new Uint8Array(wav), { headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' } });
    },
  );

  /** Text → audio bytes (WAV for VOICEVOX, MP3 for ElevenLabs by default). */
  app.post('/tts', zValidator('json', synthesizeSpeechSchema), async c => {
    const { audio, contentType, provider } = await voiceService.synthesize(c.req.valid('json'));
    return new Response(new Uint8Array(audio), {
      headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store', 'X-Voice-Provider': provider },
    });
  });

  return app;
}
