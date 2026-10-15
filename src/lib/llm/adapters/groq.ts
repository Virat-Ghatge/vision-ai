import {
  LLMProvider,
  LLMProviderType,
  ChatMessage,
  LLMRequestOptions,
  AgentPlanResponse,
  UsageLimitError,
} from '../types';
import { parseAgentPlanResponse } from '../parser';

interface OpenAIChatResponse {
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

export class GroqAdapter implements LLMProvider {
  readonly providerType: LLMProviderType = 'groq';
  private apiKey: string;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel = 'llama-3.3-70b-versatile') {
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
      throw new Error('Groq API key is not configured.');
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

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
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
      const isLimitOrUnavailable =
        response.status === 429 ||
        response.status === 402 ||
        response.status === 404 ||
        response.status === 502 ||
        response.status === 503 ||
        /rate limit|rate_limit|quota|token limit|tpm|rpm|decommissioned|not found|does not exist|unavailable/i.test(errText);
      if (isLimitOrUnavailable) {
        throw new UsageLimitError(
          `Groq model unavailable or rate limit exceeded (${response.status}): ${errText}`,
          'groq',
          model,
          response.status
        );
      }
      throw new Error(`Groq API error (${response.status}): ${errText}`);
    }

    const data = (await response.json()) as OpenAIChatResponse;
    if (data.error) {
      const msg = data.error.message ?? 'Unknown';
      if (/rate limit|rate_limit|quota|token limit|tpm|rpm|decommissioned|not found|does not exist|unavailable/i.test(msg)) {
        throw new UsageLimitError(`Groq model error: ${msg}`, 'groq', model);
      }
      throw new Error(`Groq error: ${msg}`);
    }

    const text = data.choices?.[0]?.message?.content ?? '';
    return text;
  }
}
