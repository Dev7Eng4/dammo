export type AiProvider = 'chatgpt' | 'gemini';

export interface AiChatRequest {
  systemPrompt?: string;
  userPrompt: string;
  temperature: number;
  outputSchema?: string;
}

export interface AiUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AiChatResponse {
  content: string;
  provider: AiProvider;
  model: string;
  usage: AiUsage;
  elapsedMs: number;
}

export interface AiClient {
  chat(request: AiChatRequest): Promise<Omit<AiChatResponse, 'elapsedMs'>>;
}
