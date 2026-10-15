import {
  LLMProvider,
  LLMProviderType,
  RouterTier,
  RouterConfig,
  ChatMessage,
  LLMRequestOptions,
  AgentPlanResponse,
  UsageLimitError,
} from './types';
import { AnthropicAdapter } from './adapters/anthropic';
import { GeminiAdapter } from './adapters/gemini';
import { GroqAdapter } from './adapters/groq';
import { OpenRouterAdapter } from './adapters/openrouter';
import { OllamaAdapter } from './adapters/ollama';

export const DEFAULT_OPENROUTER_FALLBACKS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemini-2.0-flash-exp:free',
  'deepseek/deepseek-chat:free',
  'qwen/qwen-2.5-72b-instruct:free',
  'meta-llama/llama-3.1-8b-instruct:free',
];

export interface StepExecutionResult {
  response: AgentPlanResponse;
  activeTier: RouterTier;
  provider: LLMProviderType;
  modelUsed?: string;
  fallbackNotice?: string;
}

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
        const model = this.config.groqModel ?? this.config.tier1Model ?? 'llama-3.3-70b-versatile';
        return {
          provider: new GroqAdapter(keys.groq, model),
          activeTier: 1,
          model,
        };
      }

      if (pref === 'openrouter' && keys.openrouter) {
        const model = this.config.openRouterModel ?? this.config.tier1Model ?? 'meta-llama/llama-3.3-70b-instruct:free';
        return {
          provider: new OpenRouterAdapter(keys.openrouter, model),
          activeTier: 1,
          model,
        };
      }

      if (pref === 'gemini' && keys.gemini) {
        const model = this.config.geminiModel ?? this.config.tier1Model ?? 'gemini-2.0-flash';
        return {
          provider: new GeminiAdapter(keys.gemini, model),
          activeTier: 1,
          model,
        };
      }

      if (keys.groq) {
        const model = this.config.groqModel ?? this.config.tier1Model ?? 'llama-3.3-70b-versatile';
        return {
          provider: new GroqAdapter(keys.groq, model),
          activeTier: 1,
          model,
        };
      }

      if (keys.openrouter) {
        const model = this.config.openRouterModel ?? this.config.tier1Model ?? 'meta-llama/llama-3.3-70b-instruct:free';
        return {
          provider: new OpenRouterAdapter(keys.openrouter, model),
          activeTier: 1,
          model,
        };
      }

      if (keys.gemini) {
        const model = this.config.geminiModel ?? this.config.tier1Model ?? 'gemini-2.0-flash';
        return {
          provider: new GeminiAdapter(keys.gemini, model),
          activeTier: 1,
          model,
        };
      }

      // Fallback to Tier 2 if Tier 1 keys are missing
      tier = 2;
    }

    // Tier 2: Claude Sonnet or Gemini Pro or OpenRouter
    const pref2 = this.config.preferredTier2Provider ?? 'anthropic';

    if (pref2 === 'gemini' && keys.gemini) {
      const model = this.config.geminiModel ?? this.config.tier2Model ?? 'gemini-2.5-pro';
      return {
        provider: new GeminiAdapter(keys.gemini, model),
        activeTier: 2,
        model,
      };
    }

    if (pref2 === 'openrouter' && keys.openrouter) {
      const model = this.config.openRouterModel ?? this.config.tier2Model ?? 'anthropic/claude-3.5-sonnet';
      return {
        provider: new OpenRouterAdapter(keys.openrouter, model),
        activeTier: 2,
        model,
      };
    }

    if (keys.anthropic) {
      const model = this.config.anthropicModel ?? this.config.tier2Model ?? 'claude-3-7-sonnet-20250219';
      return {
        provider: new AnthropicAdapter(keys.anthropic, model),
        activeTier: 2,
        model,
      };
    }

    if (keys.gemini) {
      const model = this.config.geminiModel ?? this.config.tier2Model ?? 'gemini-2.5-pro';
      return {
        provider: new GeminiAdapter(keys.gemini, model),
        activeTier: 2,
        model,
      };
    }

    if (keys.openrouter) {
      const model = this.config.openRouterModel ?? this.config.tier2Model ?? 'anthropic/claude-3.5-sonnet';
      return {
        provider: new OpenRouterAdapter(keys.openrouter, model),
        activeTier: 2,
        model,
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
  ): Promise<StepExecutionResult> {
    const { provider, activeTier, model: initialModel } = this.getProviderForTier(requestedTier);
    const activeModel = options?.model ?? initialModel;

    try {
      const plan = await provider.chat(messages, {
        ...options,
        model: activeModel,
      });
      return {
        response: plan,
        activeTier,
        provider: provider.providerType,
        modelUsed: activeModel,
      };
    } catch (err: unknown) {
      const isLimit =
        err instanceof UsageLimitError ||
        (err instanceof Error &&
          /rate limit|rate_limit|quota|credit|insufficient|429|402|resource_exhausted/i.test(err.message));

      if (!isLimit || this.config.autoFallbackOnLimit === false) {
        throw err;
      }

      console.warn(
        `[Vision AI Router] Usage limit reached on ${provider.providerType} (${activeModel}). Attempting automatic seamless model switch...`
      );

      // Strategy 1: If OpenRouter, try next model in fallback list
      if (provider.providerType === 'openrouter') {
        const fallbacks =
          this.config.openRouterFallbackModels && this.config.openRouterFallbackModels.length > 0
            ? this.config.openRouterFallbackModels
            : DEFAULT_OPENROUTER_FALLBACKS;

        for (const candidateModel of fallbacks) {
          if (candidateModel === activeModel) continue;
          try {
            console.log(`[Vision AI Router] Auto-switching to OpenRouter fallback model: ${candidateModel}`);
            const plan = await provider.chat(messages, {
              ...options,
              model: candidateModel,
            });
            // Update active model so subsequent turns use the working model without interrupting
            this.config.openRouterModel = candidateModel;
            return {
              response: plan,
              activeTier,
              provider: 'openrouter',
              modelUsed: candidateModel,
              fallbackNotice: `Switched to ${candidateModel} (Rate limit avoided on ${activeModel})`,
            };
          } catch (nextErr) {
            console.warn(`[Vision AI Router] Fallback candidate ${candidateModel} also failed:`, nextErr);
          }
        }
      }

      // Strategy 2: Cross-provider failover
      const alternates: Array<{
        type: LLMProviderType;
        create: () => { provider: LLMProvider; model: string };
      }> = [];

      if (provider.providerType !== 'openrouter' && this.config.apiKeys.openrouter) {
        alternates.push({
          type: 'openrouter',
          create: () => {
            const m = this.config.openRouterModel ?? DEFAULT_OPENROUTER_FALLBACKS[0];
            return {
              provider: new OpenRouterAdapter(this.config.apiKeys.openrouter!, m),
              model: m,
            };
          },
        });
      }

      if (provider.providerType !== 'gemini' && this.config.apiKeys.gemini) {
        alternates.push({
          type: 'gemini',
          create: () => {
            const m = this.config.geminiModel ?? 'gemini-2.0-flash';
            return {
              provider: new GeminiAdapter(this.config.apiKeys.gemini!, m),
              model: m,
            };
          },
        });
      }

      if (provider.providerType !== 'groq' && this.config.apiKeys.groq) {
        alternates.push({
          type: 'groq',
          create: () => {
            const m = this.config.groqModel ?? 'llama-3.3-70b-versatile';
            return {
              provider: new GroqAdapter(this.config.apiKeys.groq!, m),
              model: m,
            };
          },
        });
      }

      for (const alt of alternates) {
        try {
          const { provider: altProvider, model: altModel } = alt.create();
          console.log(`[Vision AI Router] Cross-provider failover to ${alt.type} (${altModel})`);
          const plan = await altProvider.chat(messages, {
            ...options,
            model: altModel,
          });
          return {
            response: plan,
            activeTier,
            provider: alt.type,
            modelUsed: altModel,
            fallbackNotice: `Switched provider to ${alt.type} (${altModel}) due to usage limit`,
          };
        } catch (altErr) {
          console.warn(`[Vision AI Router] Alternate provider ${alt.type} failed:`, altErr);
        }
      }

      // Re-throw if all automated fallbacks fail
      throw err;
    }
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
