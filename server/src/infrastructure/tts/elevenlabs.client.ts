import { AppError } from '../../shared/http/errors.js';

const BASE_URL = 'https://api.elevenlabs.io';
/** Catalog / account calls should answer in seconds; a stuck request must not hang the UI. */
const DEFAULT_TIMEOUT_MS = 20_000;
/** Speech for a long script chunk can legitimately take a while. */
const TTS_TIMEOUT_MS = 180_000;

export interface ElevenLabsVoice {
  voiceId: string;
  name: string;
  category?: string;
  previewUrl?: string;
  labels?: Record<string, string>;
}

export interface ElevenLabsModel {
  modelId: string;
  name: string;
  languages: string[];
}

export interface ElevenLabsSubscription {
  tier: string;
  characterCount: number;
  characterLimit: number;
}

export interface ElevenLabsSynthOptions {
  voiceId: string;
  modelId: string;
  outputFormat: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  speed?: number;
}

/** Error from the ElevenLabs API, classified so the key pool can rotate on bad / exhausted keys. */
export class ElevenLabsApiError extends AppError {
  constructor(
    message: string,
    statusCode: number,
    public readonly kind: 'invalid' | 'quota_exceeded' | 'missing_permission' | 'error',
  ) {
    super(message, statusCode, `ELEVENLABS_${kind.toUpperCase()}`);
  }
}

function classify(status: number, body: string): ElevenLabsApiError['kind'] {
  if (/quota_exceeded|insufficient|exceeds your quota/i.test(body)) return 'quota_exceeded';
  // Restricted key: authenticated, but this endpoint's scope isn't granted.
  if (/missing_permissions/i.test(body)) return 'missing_permission';
  if (status === 401 || status === 403) return 'invalid';
  return 'error';
}

async function request(
  apiKey: string,
  pathname: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${pathname}`, {
      ...init,
      headers: { ...(init?.headers as Record<string, string> | undefined), 'xi-api-key': apiKey },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    throw new ElevenLabsApiError(
      timedOut
        ? `ElevenLabs ${pathname.split('?')[0]} không phản hồi sau ${Math.round(timeoutMs / 1000)}s — thử lại sau hoặc kiểm tra key`
        : `Không kết nối được ElevenLabs (${err instanceof Error ? err.message : err})`,
      timedOut ? 504 : 503,
      'error',
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const kind = classify(res.status, body);
    throw new ElevenLabsApiError(
      `ElevenLabs ${pathname.split('?')[0]} lỗi ${res.status}: ${body.slice(0, 300)}`,
      res.status === 401 || res.status === 403 ? 400 : 502,
      kind,
    );
  }
  return res;
}

export async function getElevenLabsSubscription(apiKey: string): Promise<ElevenLabsSubscription> {
  const res = await request(apiKey, '/v1/user/subscription');
  const raw = (await res.json()) as { tier?: string; character_count?: number; character_limit?: number };
  return {
    tier: raw.tier ?? 'unknown',
    characterCount: raw.character_count ?? 0,
    characterLimit: raw.character_limit ?? 0,
  };
}

export async function listElevenLabsVoices(apiKey: string): Promise<ElevenLabsVoice[]> {
  const res = await request(apiKey, '/v1/voices');
  const raw = (await res.json()) as {
    voices?: Array<{ voice_id: string; name: string; category?: string; preview_url?: string; labels?: Record<string, string> }>;
  };
  return (raw.voices ?? []).map(voice => ({
    voiceId: voice.voice_id,
    name: voice.name,
    category: voice.category,
    previewUrl: voice.preview_url,
    labels: voice.labels,
  }));
}

export async function listElevenLabsModels(apiKey: string): Promise<ElevenLabsModel[]> {
  const res = await request(apiKey, '/v1/models');
  const raw = (await res.json()) as Array<{
    model_id: string;
    name: string;
    can_do_text_to_speech?: boolean;
    languages?: Array<{ language_id: string }>;
  }>;
  return raw
    .filter(model => model.can_do_text_to_speech !== false)
    .map(model => ({
      modelId: model.model_id,
      name: model.name,
      languages: (model.languages ?? []).map(lang => lang.language_id),
    }));
}

/** Text → audio bytes in `outputFormat` (mp3_44100_128 by default). */
export async function synthesizeElevenLabs(apiKey: string, text: string, options: ElevenLabsSynthOptions): Promise<Buffer> {
  const params = new URLSearchParams({ output_format: options.outputFormat });
  const res = await request(apiKey, `/v1/text-to-speech/${encodeURIComponent(options.voiceId)}?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: options.modelId,
      voice_settings: {
        stability: options.stability ?? 0.5,
        similarity_boost: options.similarityBoost ?? 0.75,
        style: options.style ?? 0,
        speed: options.speed ?? 1,
        use_speaker_boost: true,
      },
    }),
  }, TTS_TIMEOUT_MS);
  return Buffer.from(await res.arrayBuffer());
}

/** Content-Type for an ElevenLabs output_format value. */
export function elevenLabsContentType(outputFormat: string): string {
  if (outputFormat.startsWith('mp3')) return 'audio/mpeg';
  if (outputFormat.startsWith('pcm')) return 'audio/L16';
  if (outputFormat.startsWith('ulaw')) return 'audio/basic';
  if (outputFormat.startsWith('opus')) return 'audio/ogg';
  return 'application/octet-stream';
}
