import {
  LLMProvider,
  LLMProviderType,
  ChatMessage,
  LLMRequestOptions,
  AgentPlanResponse,
} from '../types';
import { parseAgentPlanResponse } from '../parser';

interface OllamaResponse {
  message?: {
    content?: string;
  };
  error?: string;
}

export class OllamaAdapter implements LLMProvider {
  readonly providerType: LLMProviderType = 'ollama';
  private baseUrl: string;
  private defaultModel: string;

  constructor(baseUrl = 'http://localhost:11434', defaultModel = 'llama3.2:latest') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.defaultModel = defaultModel;
  }

  async chat(messages: ChatMessage[], options?: LLMRequestOptions): Promise<AgentPlanResponse> {
    const rawText = await this.rawChat(messages, options);
    const parsed = parseAgentPlanResponse(rawText);
    return parsed;
  }

  async rawChat(messages: ChatMessage[], options?: LLMRequestOptions): Promise<string> {
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

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: formattedMessages,
        stream: false,
        format: options?.responseFormat === 'text' ? undefined : 'json',
        options: {
          temperature: options?.temperature ?? 0.1,
        },
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama error (${response.status}): ${errText}`);
    }

    const data = (await response.json()) as OllamaResponse;
    if (data.error) {
      throw new Error(`Ollama error: ${data.error}`);
    }

    const text = data.message?.content ?? '';
    return text;
  }

  async summarizeAndScrubPII(rawText: string): Promise<string> {
    const prompt = `You are a Tier-0 zero-token cost local helper. Scrub any personal identifiable information (PII) such as credit cards, phone numbers, and passwords, and produce a concise 3-sentence summary of the page content. Return clean text only.\n\nContent:\n${rawText.slice(
      0,
      10000
    )}`;

    return this.rawChat(
      [
        { role: 'system', content: 'You are a secure, privacy-preserving text summarizer.' },
        { role: 'user', content: prompt },
      ],
      { responseFormat: 'text' }
    );
  }
}
