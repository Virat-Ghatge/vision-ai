export type LLMProviderType = 'anthropic' | 'gemini' | 'groq' | 'openrouter' | 'ollama';

export type RouterTier = 0 | 1 | 2;

export type ActionType =
  | 'click'
  | 'fill'
  | 'select'
  | 'press'
  | 'scroll'
  | 'wait'
  | 'request_vision_crop'
  | 'navigate'
  | 'go_back';

export interface MacroAction {
  type: ActionType;
  id?: number;
  value?: string;
  stop_if_url_changes?: boolean;
}

export interface AgentPlanResponse {
  thought: string;
  actions: MacroAction[];
  complete: boolean;
  rawResponse?: string;
  usage?: TokenUsage;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  totalTokens: number;
}

export interface MessageContentBlock {
  type: 'text' | 'image';
  text?: string;
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
  cache_control?: {
    type: 'ephemeral';
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | MessageContentBlock[];
  cache_control?: {
    type: 'ephemeral';
  };
}

export interface LLMRequestOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json' | 'text';
  signal?: AbortSignal;
}

export interface ProviderApiKeys {
  anthropic?: string;
  gemini?: string;
  groq?: string;
  openrouter?: string;
  ollamaBaseUrl?: string;
}

export interface RouterConfig {
  apiKeys: ProviderApiKeys;
  tier0Model?: string; // e.g. "llama3.2:latest"
  tier1Model?: string; // e.g. "llama-3.3-70b-versatile" or "gemini-2.5-flash"
  tier2Model?: string; // e.g. "claude-3-7-sonnet-20250219" or "gemini-2.5-pro"
  preferredTier1Provider?: 'groq' | 'gemini' | 'openrouter';
  preferredTier2Provider?: 'anthropic' | 'gemini' | 'openrouter';
  openRouterModel?: string;
  openRouterFallbackModels?: string[];
  groqModel?: string;
  groqFallbackModels?: string[];
  geminiModel?: string;
  geminiFallbackModels?: string[];
  anthropicModel?: string;
  autoFallbackOnLimit?: boolean;
}

export class UsageLimitError extends Error {
  readonly provider: LLMProviderType;
  readonly model?: string;
  readonly statusCode?: number;

  constructor(message: string, provider: LLMProviderType, model?: string, statusCode?: number) {
    super(message);
    this.name = 'UsageLimitError';
    this.provider = provider;
    this.model = model;
    this.statusCode = statusCode;
  }
}

export interface LLMProvider {
  readonly providerType: LLMProviderType;
  chat(messages: ChatMessage[], options?: LLMRequestOptions): Promise<AgentPlanResponse>;
  rawChat?(messages: ChatMessage[], options?: LLMRequestOptions): Promise<string>;
}
