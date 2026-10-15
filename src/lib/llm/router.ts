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
  'openrouter/free',
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'cohere/north-mini-code:free',
  'liquid/lfm-2.5-2.6b:free',
];

export const DEFAULT_GROQ_FALLBACKS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'deepseek-r1-distill-llama-70b',
  'mixtral-8x7b-32768',
  'gemma2-9b-it',
];

export const DEFAULT_GEMINI_FALLBACKS = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
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

  private persistModelPreference(field: keyof RouterConfig, value: string): void {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get('modelRoutingConfig').then((res) => {
        const current = (res.modelRoutingConfig as Record<string, unknown>) || {};
        chrome.storage.local
          .set({
            modelRoutingConfig: { ...current, [field]: value },
          })
          .catch(() => {});
      });
    }
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
        const model = this.config.openRouterModel ?? this.config.tier1Model ?? 'openrouter/free';
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
        const model = this.config.openRouterModel ?? this.config.tier1Model ?? 'openrouter/free';
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
      const isLimitOrUnavailable =
        err instanceof UsageLimitError ||
        (err instanceof Error &&
          /unavailable|rate limit|rate_limit|quota|credit|insufficient|429|402|404|503|502|resource_exhausted|not found|no endpoints|paid version|free tier/i.test(
            err.message
          ));

      if (!isLimitOrUnavailable || this.config.autoFallbackOnLimit === false) {
        throw err;
      }

      console.warn(
        `[Vision AI Router] Model unavailable or limit reached on ${provider.providerType} (${activeModel}). Attempting automatic seamless model switch...`
      );

      // Strategy 1: Intra-provider model fallback
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
            this.config.openRouterModel = candidateModel;
            this.persistModelPreference('openRouterModel', candidateModel);
            return {
              response: plan,
              activeTier,
              provider: 'openrouter',
              modelUsed: candidateModel,
              fallbackNotice: `Auto-switched to ${candidateModel} (${activeModel} was unavailable/limited)`,
            };
          } catch (nextErr) {
            console.warn(`[Vision AI Router] Fallback candidate ${candidateModel} also failed:`, nextErr);
          }
        }
      } else if (provider.providerType === 'groq') {
        const fallbacks =
          this.config.groqFallbackModels && this.config.groqFallbackModels.length > 0
            ? this.config.groqFallbackModels
            : DEFAULT_GROQ_FALLBACKS;

        for (const candidateModel of fallbacks) {
          if (candidateModel === activeModel) continue;
          try {
            console.log(`[Vision AI Router] Auto-switching to Groq fallback model: ${candidateModel}`);
            const plan = await provider.chat(messages, {
              ...options,
              model: candidateModel,
            });
            this.config.groqModel = candidateModel;
            this.persistModelPreference('groqModel', candidateModel);
            return {
              response: plan,
              activeTier,
              provider: 'groq',
              modelUsed: candidateModel,
              fallbackNotice: `Auto-switched to Groq ${candidateModel} (${activeModel} was unavailable/limited)`,
            };
          } catch (nextErr) {
            console.warn(`[Vision AI Router] Groq fallback candidate ${candidateModel} failed:`, nextErr);
          }
        }
      } else if (provider.providerType === 'gemini') {
        const fallbacks =
          this.config.geminiFallbackModels && this.config.geminiFallbackModels.length > 0
            ? this.config.geminiFallbackModels
            : DEFAULT_GEMINI_FALLBACKS;

        for (const candidateModel of fallbacks) {
          if (candidateModel === activeModel) continue;
          try {
            console.log(`[Vision AI Router] Auto-switching to Gemini fallback model: ${candidateModel}`);
            const plan = await provider.chat(messages, {
              ...options,
              model: candidateModel,
            });
            this.config.geminiModel = candidateModel;
            this.persistModelPreference('geminiModel', candidateModel);
            return {
              response: plan,
              activeTier,
              provider: 'gemini',
              modelUsed: candidateModel,
              fallbackNotice: `Auto-switched to Gemini ${candidateModel} (${activeModel} was unavailable/limited)`,
            };
          } catch (nextErr) {
            console.warn(`[Vision AI Router] Gemini fallback candidate ${candidateModel} failed:`, nextErr);
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
