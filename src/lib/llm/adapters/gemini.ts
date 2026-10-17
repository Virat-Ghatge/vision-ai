import {
  LLMProvider,
  LLMProviderType,
  ChatMessage,
  LLMRequestOptions,
  AgentPlanResponse,
  UsageLimitError,
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

  constructor(apiKey: string, defaultModel = 'gemini-3.8-flash') {
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
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
        ],
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      const isLimitOrUnavailable =
        response.status === 429 ||
        response.status === 404 ||
        response.status === 502 ||
        response.status === 503 ||
        /resource_exhausted|quota|rate limit|rate_limit|not found|deprecated|unavailable/i.test(errText);
      if (isLimitOrUnavailable) {
        throw new UsageLimitError(
          `Gemini model unavailable or quota exceeded (${response.status}): ${errText}`,
          'gemini',
          model,
          response.status
        );
      }
      throw new Error(`Gemini API error (${response.status}): ${errText}`);
    }

    const data = (await response.json()) as GeminiResponse & {
      promptFeedback?: { blockReason?: string };
      candidates?: Array<GeminiCandidate & { finishReason?: string }>;
    };

    if (data.error) {
      const msg = data.error.message ?? 'Unknown';
      if (/resource_exhausted|quota|rate limit|rate_limit|not found|deprecated|unavailable/i.test(msg)) {
        throw new UsageLimitError(`Gemini model error: ${msg}`, 'gemini', model);
      }
      throw new Error(`Gemini error: ${msg}`);
    }

    const candidate = data.candidates?.[0];
    if (candidate?.finishReason === 'SAFETY' || data.promptFeedback?.blockReason === 'SAFETY') {
      const reason = data.promptFeedback?.blockReason || candidate?.finishReason || 'SAFETY';
      return JSON.stringify({
        thought: `Gemini safety filter flagged this request (${reason}). Please rephrase your goal or navigate to another page.`,
        actions: [],
        complete: true,
      });
    }

    const text = candidate?.content?.parts?.[0]?.text ?? '';
    return text;
  }
}
