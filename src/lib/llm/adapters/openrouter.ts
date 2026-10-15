import {
  LLMProvider,
  LLMProviderType,
  ChatMessage,
  LLMRequestOptions,
  AgentPlanResponse,
} from '../types';
import { parseAgentPlanResponse } from '../parser';

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
  };
}

export class OpenRouterAdapter implements LLMProvider {
  readonly providerType: LLMProviderType = 'openrouter';
  private apiKey: string;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel = 'anthropic/claude-3.5-sonnet') {
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
      throw new Error('OpenRouter API key is not configured.');
    }

    const model = options?.model ?? this.defaultModel;

    const formattedMessages = messages.map((m) => {
      let contentStr = '';
      if (typeof m.content === 'string') {
        contentStr = m.content;
      } else {
        contentStr = m.content
          .map((c) => (c.type === 'text' ? c.text ?? '' : ''))
          .join('\n');
      }
      return {
        role: m.role,
        content: contentStr,
      };
    });

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://visionai.dev',
        'X-Title': 'Vision AI Chrome Extension',
      },
      body: JSON.stringify({
        model,
        messages: formattedMessages,
        temperature: options?.temperature ?? 0.1,
        max_tokens: options?.maxTokens ?? 1024,
        response_format: { type: 'json_object' },
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${errText}`);
    }

    const data = (await response.json()) as OpenRouterResponse;
    if (data.error) {
      throw new Error(`OpenRouter error: ${data.error.message ?? 'Unknown'}`);
    }

    const text = data.choices?.[0]?.message?.content ?? '';
    return text;
  }
}
