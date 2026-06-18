import { env } from '../../config/env.js';
import { AppError } from '../../shared/http/errors.js';
import type { AiChatRequest, AiChatResponse, AiClient } from './ai.types.js';

function buildUserPromptWithSchema(userPrompt: string, outputSchema?: string): string {
  if (!outputSchema?.trim()) return userPrompt;
  return `${userPrompt}

Respond with valid JSON only, matching this schema:
${outputSchema.trim()}`;
}

export class OpenAiClient implements AiClient {
  async chat(request: AiChatRequest): Promise<Omit<AiChatResponse, 'elapsedMs'>> {
    if (!env.openaiApiKey) {
      throw new AppError('OpenAI API key is not configured', 502, 'AI_NOT_CONFIGURED');
    }

    const messages: { role: 'system' | 'user'; content: string }[] = [];
    if (request.systemPrompt?.trim()) {
      messages.push({ role: 'system', content: request.systemPrompt.trim() });
    }
    messages.push({
      role: 'user',
      content: buildUserPromptWithSchema(request.userPrompt, request.outputSchema),
    });

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: env.openaiModel,
        temperature: request.temperature,
        messages,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new AppError(`OpenAI request failed: ${detail}`, 502, 'AI_REQUEST_FAILED');
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new AppError('OpenAI returned empty content', 502, 'AI_REQUEST_FAILED');
    }

    return {
      content,
      provider: 'chatgpt',
      model: env.openaiModel,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
    };
  }
}

export const openAiClient = new OpenAiClient();
