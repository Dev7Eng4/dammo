import { env } from '../../config/env.js';
import { AppError } from '../../shared/http/errors.js';
import type { AiChatRequest, AiChatResponse, AiClient } from './ai.types.js';

function buildUserPromptWithSchema(userPrompt: string, outputSchema?: string): string {
  if (!outputSchema?.trim()) return userPrompt;
  return `${userPrompt}

Respond with valid JSON only, matching this schema:
${outputSchema.trim()}`;
}

export class GeminiClient implements AiClient {
  async chat(request: AiChatRequest): Promise<Omit<AiChatResponse, 'elapsedMs'>> {
    if (!env.geminiApiKey) {
      throw new AppError('Gemini API key is not configured', 502, 'AI_NOT_CONFIGURED');
    }

    const parts: { text: string }[] = [];
    if (request.systemPrompt?.trim()) {
      parts.push({ text: request.systemPrompt.trim() });
    }
    parts.push({
      text: buildUserPromptWithSchema(request.userPrompt, request.outputSchema),
    });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.geminiModel}:generateContent?key=${env.geminiApiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: request.temperature,
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new AppError(`Gemini request failed: ${detail}`, 502, 'AI_REQUEST_FAILED');
    }

    const data = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    };

    const content = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim();
    if (!content) {
      throw new AppError('Gemini returned empty content', 502, 'AI_REQUEST_FAILED');
    }

    const promptTokens = data.usageMetadata?.promptTokenCount ?? 0;
    const completionTokens = data.usageMetadata?.candidatesTokenCount ?? 0;

    return {
      content,
      provider: 'gemini',
      model: env.geminiModel,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: data.usageMetadata?.totalTokenCount ?? promptTokens + completionTokens,
      },
    };
  }
}

export const geminiClient = new GeminiClient();
