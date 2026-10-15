import {
  LLMProvider,
  LLMProviderType,
  ChatMessage,
  LLMRequestOptions,
  AgentPlanResponse,
} from '../types';
import { parseAgentPlanResponse } from '../parser';

interface GeminiCandidate {
  content?: {
    parts?: Array<{
      text?: string;
    }>;
  };
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    cachedContentTokenCount?: number;
  };
  error?: {
    message?: string;
  };
}

export class GeminiAdapter implements LLMProvider {
  readonly providerType: LLMProviderType = 'gemini';
  private apiKey: string;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel = 'gemini-2.5-flash') {
    this.apiKey = apiKey;
    this.defaultModel = defaultModel;
  }

  async chat(messages: ChatMessage[], options?: LLMRequestOptions): Promise<AgentPlanResponse> {
    const rawText = await this.rawChat(messages, options);
    const parsed = parseAgentPlanResponse(rawText);
    return parsed;
  }

  async rawChat(messages: ChatMessage[], options?: LLMRequestOptions): Promise<string> {
    if (!this.apiKey) {
      throw new Error('Gemini API key is not configured.');
    }

    const model = options?.model ?? this.defaultModel;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const systemMessages = messages.filter((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    const systemInstruction =
      systemMessages.length > 0
        ? {
            parts: systemMessages.map((m) => ({
              text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            })),
          }
        : undefined;

    const contents = nonSystemMessages.map((m) => {
      const role = m.role === 'assistant' ? 'model' : 'user';
      if (typeof m.content === 'string') {
        return {
          role,
          parts: [{ text: m.content }],
        };
      }
      return {
        role,
        parts: m.content.map((block) => {
          if (block.type === 'text') {
            return { text: block.text ?? '' };
          }
          if (block.type === 'image' && block.source) {
            return {
              inlineData: {
                mimeType: block.source.media_type,
                data: block.source.data,
              },
            };
          }
          return { text: '' };
        }),
      };
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        ...(systemInstruction ? { systemInstruction } : {}),
        contents,
        generationConfig: {
          temperature: options?.temperature ?? 0.1,
          maxOutputTokens: options?.maxTokens ?? 1024,
          responseMimeType: 'application/json',
        },
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errText}`);
    }

    const data = (await response.json()) as GeminiResponse;
    if (data.error) {
      throw new Error(`Gemini error: ${data.error.message ?? 'Unknown'}`);
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return text;
  }
}
