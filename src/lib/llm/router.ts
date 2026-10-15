import {
  LLMProvider,
  LLMProviderType,
  RouterTier,
  RouterConfig,
  ChatMessage,
  LLMRequestOptions,
  AgentPlanResponse,
} from './types';
import { AnthropicAdapter } from './adapters/anthropic';
import { GeminiAdapter } from './adapters/gemini';
import { GroqAdapter } from './adapters/groq';
import { OpenRouterAdapter } from './adapters/openrouter';
import { OllamaAdapter } from './adapters/ollama';

export class LLMRouter {
  private config: RouterConfig;
  private consecutiveFailures = 0;

  constructor(config: RouterConfig) {
    this.config = config;
  }

  updateConfig(config: Partial<RouterConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      apiKeys: {
        ...this.config.apiKeys,
        ...config.apiKeys,
      },
    };
  }

  getConfig(): Readonly<RouterConfig> {
    return this.config;
  }

  recordFailure(): void {
    this.consecutiveFailures += 1;
  }

  resetFailures(): void {
    this.consecutiveFailures = 0;
  }

  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  /**
   * Resolves the provider for a specific tier.
   * Auto-escalates from Tier 1 to Tier 2 if consecutiveFailures >= 2.
   */
  getProviderForTier(requestedTier: RouterTier = 1): { provider: LLMProvider; activeTier: RouterTier; model?: string } {
    const keys = this.config.apiKeys;
    let tier: RouterTier = requestedTier;

    // Spec rule: Escalate to Tier 2 after 2 consecutive action failures
    if (tier === 1 && this.consecutiveFailures >= 2) {
      tier = 2;
    }

    if (tier === 0) {
      return {
        provider: new OllamaAdapter(keys.ollamaBaseUrl, this.config.tier0Model ?? 'llama3.2:latest'),
        activeTier: 0,
        model: this.config.tier0Model,
      };
    }

    if (tier === 1) {
      const pref = this.config.preferredTier1Provider ?? 'groq';

      if (pref === 'groq' && keys.groq) {
        return {
          provider: new GroqAdapter(keys.groq, this.config.tier1Model ?? 'llama-3.3-70b-versatile'),
          activeTier: 1,
          model: this.config.tier1Model ?? 'llama-3.3-70b-versatile',
        };
      }

      if (keys.gemini) {
        return {
          provider: new GeminiAdapter(keys.gemini, this.config.tier1Model ?? 'gemini-2.5-flash'),
          activeTier: 1,
          model: this.config.tier1Model ?? 'gemini-2.5-flash',
        };
      }

      if (keys.groq) {
        return {
          provider: new GroqAdapter(keys.groq, this.config.tier1Model ?? 'llama-3.3-70b-versatile'),
          activeTier: 1,
          model: this.config.tier1Model ?? 'llama-3.3-70b-versatile',
        };
      }

      if (keys.openrouter) {
        return {
          provider: new OpenRouterAdapter(keys.openrouter, this.config.tier1Model ?? 'groq/llama-3.3-70b-versatile'),
          activeTier: 1,
          model: this.config.tier1Model,
        };
      }

      // Fallback to Tier 2 if Tier 1 keys are missing
      tier = 2;
    }

    // Tier 2: Claude Sonnet or Gemini Pro or OpenRouter
    const pref2 = this.config.preferredTier2Provider ?? 'anthropic';

    if (pref2 === 'gemini' && keys.gemini) {
      return {
        provider: new GeminiAdapter(keys.gemini, this.config.tier2Model ?? 'gemini-2.5-pro'),
        activeTier: 2,
        model: this.config.tier2Model ?? 'gemini-2.5-pro',
      };
    }

    if (pref2 === 'openrouter' && keys.openrouter) {
      return {
        provider: new OpenRouterAdapter(keys.openrouter, this.config.tier2Model ?? 'anthropic/claude-3.5-sonnet'),
        activeTier: 2,
        model: this.config.tier2Model,
      };
    }

    if (keys.anthropic) {
      return {
        provider: new AnthropicAdapter(keys.anthropic, this.config.tier2Model ?? 'claude-3-7-sonnet-20250219'),
        activeTier: 2,
        model: this.config.tier2Model ?? 'claude-3-7-sonnet-20250219',
      };
    }

    if (keys.gemini) {
      return {
        provider: new GeminiAdapter(keys.gemini, this.config.tier2Model ?? 'gemini-2.5-pro'),
        activeTier: 2,
        model: this.config.tier2Model ?? 'gemini-2.5-pro',
      };
    }

    if (keys.openrouter) {
      return {
        provider: new OpenRouterAdapter(keys.openrouter, this.config.tier2Model ?? 'anthropic/claude-3.5-sonnet'),
        activeTier: 2,
        model: this.config.tier2Model,
      };
    }

    // Local fallback if no cloud keys configured
    return {
      provider: new OllamaAdapter(keys.ollamaBaseUrl, 'llama3.2:latest'),
      activeTier: 0,
      model: 'llama3.2:latest',
    };
  }

  async executeStep(
    messages: ChatMessage[],
    requestedTier: RouterTier = 1,
    options?: LLMRequestOptions
  ): Promise<{ response: AgentPlanResponse; activeTier: RouterTier; provider: LLMProviderType }> {
    const { provider, activeTier, model } = this.getProviderForTier(requestedTier);
    const plan = await provider.chat(messages, {
      ...options,
      model: options?.model ?? model,
    });
    return {
      response: plan,
      activeTier,
      provider: provider.providerType,
    };
  }

  async summarizePage(rawText: string): Promise<string> {
    const { provider } = this.getProviderForTier(0);
    if (provider instanceof OllamaAdapter) {
      return provider.summarizeAndScrubPII(rawText);
    }
    // Fallback to standard provider if Ollama is unavailable
    const prompt = `Scrub any sensitive PII (credit cards, phone numbers, passwords) and summarize this page in 3 sentences:\n\n${rawText.slice(
      0,
      10000
    )}`;
    const plan = await provider.chat([
      { role: 'system', content: 'You are a privacy-preserving text summarizer.' },
      { role: 'user', content: prompt },
    ]);
    return plan.thought;
  }
}
