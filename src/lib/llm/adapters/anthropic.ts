import {
  LLMProvider,
  LLMProviderType,
  ChatMessage,
  LLMRequestOptions,
  AgentPlanResponse,
  TokenUsage,
} from '../types';
import { parseAgentPlanResponse } from '../parser';

interface AnthropicResponse {
  content?: Array<{
    type: string;
    text?: string;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  error?: {
    message?: string;
  };
}

export class AnthropicAdapter implements LLMProvider {
  readonly providerType: LLMProviderType = 'anthropic';
  private apiKey: string;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel = 'claude-3-7-sonnet-20250219') {
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
      throw new Error('Anthropic API key is not configured.');
    }

    const model = options?.model ?? this.defaultModel;

    // Separate system messages and conversation messages
    const systemMessages = messages.filter((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    // Build system blocks with optional prompt caching
    const systemBlocks: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> = [];
    for (let i = 0; i < systemMessages.length; i++) {
      const sys = systemMessages[i];
      const text = typeof sys.content === 'string' ? sys.content : JSON.stringify(sys.content);
      const isLastSystem = i === systemMessages.length - 1;

      systemBlocks.push({
        type: 'text',
        text,
        ...(sys.cache_control || isLastSystem ? { cache_control: { type: 'ephemeral' } } : {}),
      });
    }

    // Format conversation messages
    const formattedMessages = nonSystemMessages.map((m) => {
      if (typeof m.content === 'string') {
        return {
          role: m.role,
          content: [
            {
              type: 'text',
              text: m.content,
              ...(m.cache_control ? { cache_control: m.cache_control } : {}),
            },
          ],
        };
      }
      return {
        role: m.role,
        content: m.content,
      };
    });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: options?.maxTokens ?? 1024,
        temperature: options?.temperature ?? 0.1,
        ...(systemBlocks.length > 0 ? { system: systemBlocks } : {}),
        messages: formattedMessages,
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errText}`);
    }

    const data = (await response.json()) as AnthropicResponse;
    if (data.error) {
      throw new Error(`Anthropic error: ${data.error.message ?? 'Unknown'}`);
    }

    const text = data.content?.[0]?.text ?? '';
    return text;
  }
}
