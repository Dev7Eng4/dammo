import { AppError } from '../../shared/http/errors.js';
import { geminiClient } from './gemini.client.js';
import { openAiClient } from './openai.client.js';
import type { AiChatRequest, AiChatResponse, AiClient, AiProvider } from './ai.types.js';

const clients: Record<AiProvider, AiClient> = {
  chatgpt: openAiClient,
  gemini: geminiClient,
};

export async function runAiChat(
  provider: AiProvider,
  request: AiChatRequest,
): Promise<AiChatResponse> {
  const client = clients[provider];
  if (!client) {
    throw new AppError(`Unsupported AI provider: ${provider}`, 400, 'UNSUPPORTED_PROVIDER');
  }

  const startedAt = Date.now();
  const result = await client.chat(request);
  return {
    ...result,
    elapsedMs: Date.now() - startedAt,
  };
}
