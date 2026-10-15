import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LLMRouter,
  ByteStableContextManager,
  AnthropicAdapter,
  GroqAdapter,
  GeminiAdapter,
  OllamaAdapter,
  ChatMessage,
  AgentPlanResponse,
} from '../src/lib/llm';

describe('M1.3: Multi-Provider Router & Byte-Stable Context Manager Suite', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('Tiered Routing Selection & Auto-Escalation', () => {
    const testConfig = {
      apiKeys: {
        anthropic: 'sk-ant-test-key-123',
        gemini: 'test-gemini-key-456',
        groq: 'gsk-test-groq-key-789',
        openrouter: 'sk-or-test-key-abc',
        ollamaBaseUrl: 'http://localhost:11434',
      },
    };

    it('routes Tier 0 to Ollama adapter for local zero-token processing', () => {
      const router = new LLMRouter(testConfig);
      const { provider, activeTier } = router.getProviderForTier(0);
      expect(activeTier).toBe(0);
      expect(provider.providerType).toBe('ollama');
      expect(provider).toBeInstanceOf(OllamaAdapter);
    });

    it('routes Tier 1 to Groq adapter by default for ultra-low latency execution', () => {
      const router = new LLMRouter(testConfig);
      const { provider, activeTier } = router.getProviderForTier(1);
      expect(activeTier).toBe(1);
      expect(provider.providerType).toBe('groq');
      expect(provider).toBeInstanceOf(GroqAdapter);
    });

    it('routes Tier 2 to Anthropic adapter for complex reasoning and decomposition', () => {
      const router = new LLMRouter(testConfig);
      const { provider, activeTier } = router.getProviderForTier(2);
      expect(activeTier).toBe(2);
      expect(provider.providerType).toBe('anthropic');
      expect(provider).toBeInstanceOf(AnthropicAdapter);
    });

    it('auto-escalates Tier 1 to Tier 2 after 2 consecutive action failures', () => {
      const router = new LLMRouter(testConfig);
      expect(router.getConsecutiveFailures()).toBe(0);

      // 1st failure: still Tier 1
      router.recordFailure();
      expect(router.getConsecutiveFailures()).toBe(1);
      let resolved = router.getProviderForTier(1);
      expect(resolved.activeTier).toBe(1);
      expect(resolved.provider.providerType).toBe('groq');

      // 2nd failure: escalates to Tier 2
      router.recordFailure();
      expect(router.getConsecutiveFailures()).toBe(2);
      resolved = router.getProviderForTier(1);
      expect(resolved.activeTier).toBe(2);
      expect(resolved.provider.providerType).toBe('anthropic');

      // Reset restores normal Tier 1 routing
      router.resetFailures();
      expect(router.getConsecutiveFailures()).toBe(0);
      resolved = router.getProviderForTier(1);
      expect(resolved.activeTier).toBe(1);
      expect(resolved.provider.providerType).toBe('groq');
    });

    it('respects user preference overrides for Tier 1 and Tier 2', () => {
      const customRouter = new LLMRouter({
        ...testConfig,
        preferredTier1Provider: 'gemini',
        preferredTier2Provider: 'gemini',
      });

      const tier1 = customRouter.getProviderForTier(1);
      expect(tier1.activeTier).toBe(1);
      expect(tier1.provider).toBeInstanceOf(GeminiAdapter);

      const tier2 = customRouter.getProviderForTier(2);
      expect(tier2.activeTier).toBe(2);
      expect(tier2.provider).toBeInstanceOf(GeminiAdapter);
    });
  });

  describe('Anthropic cache_control and Browser Access Header Placement', () => {
    it('properly injects anthropic-dangerous-direct-browser-access and cache_control', async () => {
      let capturedHeaders: Record<string, string> = {};
      let capturedBody: any = null;

      globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        capturedHeaders = (init.headers ?? {}) as Record<string, string>;
        capturedBody = JSON.parse(init.body as string);

        return {
          ok: true,
          status: 200,
          json: async () => ({
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  thought: 'Clicking search button',
                  actions: [{ type: 'click', id: 4 }],
                  complete: false,
                }),
              },
            ],
            usage: {
              input_tokens: 450,
              output_tokens: 35,
              cache_read_input_tokens: 380,
            },
          }),
        };
      });

      const adapter = new AnthropicAdapter('sk-ant-test-api-key');
      const messages: ChatMessage[] = [
        {
          role: 'system',
          content: 'System prompt instructions',
          cache_control: { type: 'ephemeral' },
        },
        {
          role: 'user',
          content: 'Step 1 full distilled DOM tree',
          cache_control: { type: 'ephemeral' },
        },
      ];

      const res = await adapter.chat(messages);
      expect(res.thought).toBe('Clicking search button');
      expect(res.actions).toEqual([{ type: 'click', id: 4 }]);
      expect(res.complete).toBe(false);

      // Verify browser direct access header
      expect(capturedHeaders['anthropic-dangerous-direct-browser-access']).toBe('true');
      expect(capturedHeaders['x-api-key']).toBe('sk-ant-test-api-key');

      // Verify system cache_control placement
      expect(capturedBody.system).toBeDefined();
      expect(capturedBody.system[0].cache_control).toEqual({ type: 'ephemeral' });

      // Verify user message cache_control placement
      expect(capturedBody.messages[0].content[0].cache_control).toEqual({ type: 'ephemeral' });
    });
  });

  describe('Byte-Stable Prefix Invariance Across 5 Simulated Steps', () => {
    it('maintains 100% byte-identical prefix across 5 turns with append-only growth', () => {
      const manager = new ByteStableContextManager();

      const userGoal = 'Search for latest AI papers on arXiv and download the first PDF';
      const step1Dom = `[1] <input type="text" placeholder="Search arXiv" value="">\n[2] <button type="submit">Search</button>`;

      // Initialize Step 1
      manager.initializeRun(userGoal, step1Dom);
      expect(manager.verifyPrefixStability()).toBe(true);

      const initialMessages = manager.getMessages();
      const initialSystemMsg = initialMessages[0];
      const initialUserMsg = initialMessages[1];
      const initialPrefixTokenCount = manager.getPrefixTokenCount();

      expect(initialPrefixTokenCount).toBeGreaterThan(0);

      // Simulate 5 consecutive turns
      for (let step = 1; step <= 5; step++) {
        const plan: AgentPlanResponse = {
          thought: `Executing step ${step} action sequence`,
          actions: [{ type: 'click', id: step }],
          complete: step === 5,
        };

        // Append assistant plan
        manager.appendAssistantPlan(plan);
        expect(manager.verifyPrefixStability()).toBe(true);

        if (step < 5) {
          // Append incremental step delta
          const delta = `[DELTA]\nADDED:\n[${step + 10}] <div role="alert">Step ${step} completed</div>`;
          manager.appendStepObservation(step + 1, delta);
          expect(manager.verifyPrefixStability()).toBe(true);
        }

        // Verify the first two messages (System Prompt & Initial Distilled DOM) remain byte-identical
        const currentMessages = manager.getMessages();
        expect(currentMessages[0]).toEqual(initialSystemMsg);
        expect(currentMessages[1]).toEqual(initialUserMsg);
      }

      // Check telemetry metrics
      const metrics = manager.getTelemetryMetrics();
      expect(metrics.cachedPrefixTokens).toBe(initialPrefixTokenCount);
      expect(metrics.totalEstimatedTokens).toBeGreaterThan(metrics.cachedPrefixTokens);
      expect(metrics.freshTokens).toBeGreaterThan(0);
      expect(metrics.estimatedCostDiscountPercent).toBeGreaterThanOrEqual(40);

      // Verify total turns: 1 system + 1 user initial + 5 assistant plans + 4 delta observations = 11 messages
      expect(manager.getMessageCount()).toBe(11);
    });

    it('rejects mutation if prefix is tampered with', () => {
      const manager = new ByteStableContextManager();
      manager.initializeRun('Goal', 'Initial DOM');

      // Tamper with private array via any cast in test
      const messagesInternal = (manager as any).messages;
      messagesInternal[1].content = 'Tampered content';

      expect(manager.verifyPrefixStability()).toBe(false);
      expect(() => {
        manager.appendAssistantPlan({ thought: '', actions: [], complete: false });
      }).toThrow(/Prefix stability invariant violated/);
    });
  });

  describe('Model Selection & Automatic Failover on Usage Limits', () => {
    it('respects specific model preferences for providers', () => {
      const router = new LLMRouter({
        apiKeys: {
          openrouter: 'sk-or-test-key',
          groq: 'gsk-test-key',
          gemini: 'aiza-test-key',
        },
        preferredTier1Provider: 'openrouter',
        openRouterModel: 'deepseek/deepseek-chat:free',
        groqModel: 'llama-3.1-8b-instant',
        geminiModel: 'gemini-2.0-flash',
      });

      const tier1 = router.getProviderForTier(1);
      expect(tier1.provider.providerType).toBe('openrouter');
      expect(tier1.model).toBe('deepseek/deepseek-chat:free');

      router.updateConfig({ preferredTier1Provider: 'groq' });
      const tier1Groq = router.getProviderForTier(1);
      expect(tier1Groq.provider.providerType).toBe('groq');
      expect(tier1Groq.model).toBe('llama-3.1-8b-instant');
    });

    it('automatically switches OpenRouter model on HTTP 429 rate limit without interrupting task', async () => {
      let callCount = 0;
      const requestedModels: string[] = [];

      globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        callCount++;
        const body = JSON.parse(init.body as string);
        requestedModels.push(body.model);

        if (callCount === 1) {
          // First attempt hits 429 Rate Limit
          return {
            ok: false,
            status: 429,
            text: async () => 'Rate limit exceeded: Please wait or try another model.',
          };
        }

        // Second attempt with fallback model succeeds
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    thought: 'Auto-switched model executed successfully',
                    actions: [{ type: 'click', id: 5 }],
                    complete: true,
                  }),
                },
              },
            ],
          }),
        };
      });

      const router = new LLMRouter({
        apiKeys: {
          openrouter: 'sk-or-key-123',
        },
        preferredTier1Provider: 'openrouter',
        openRouterModel: 'meta-llama/llama-3.3-70b-instruct:free',
        openRouterFallbackModels: [
          'meta-llama/llama-3.3-70b-instruct:free',
          'google/gemini-2.0-flash-exp:free',
        ],
        autoFallbackOnLimit: true,
      });

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Navigate to research portal' },
      ];

      const result = await router.executeStep(messages, 1);

      expect(callCount).toBe(2);
      expect(requestedModels[0]).toBe('meta-llama/llama-3.3-70b-instruct:free');
      expect(requestedModels[1]).toBe('google/gemini-2.0-flash-exp:free');
      expect(result.response.thought).toBe('Auto-switched model executed successfully');
      expect(result.response.complete).toBe(true);
      expect(result.modelUsed).toBe('google/gemini-2.0-flash-exp:free');
      expect(result.fallbackNotice).toContain('google/gemini-2.0-flash-exp:free');
      // Subsequent step should use the working fallback model
      expect(router.getConfig().openRouterModel).toBe('google/gemini-2.0-flash-exp:free');
    });

    it('automatically catches HTTP 404 model unavailable for free error and fails over to openrouter/free', async () => {
      let callCount = 0;
      const requestedModels: string[] = [];

      globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        callCount++;
        const body = JSON.parse(init.body as string);
        requestedModels.push(body.model);

        if (callCount === 1) {
          // Exact error string reported by user
          return {
            ok: false,
            status: 404,
            text: async () =>
              JSON.stringify({
                error: {
                  message:
                    'This model is unavailable for free. The paid version is available now - use this slug instead: meta-llama/llama-3.3-70b-instruct',
                  code: 404,
                },
              }),
          };
        }

        // Second call with openrouter/free succeeds
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    thought: 'openrouter/free selected working model and completed task',
                    actions: [{ type: 'click', id: 2 }],
                    complete: true,
                  }),
                },
              },
            ],
          }),
        };
      });

      const router = new LLMRouter({
        apiKeys: {
          openrouter: 'sk-or-key-test',
        },
        preferredTier1Provider: 'openrouter',
        openRouterModel: 'meta-llama/llama-3.3-70b-instruct:free',
        openRouterFallbackModels: ['openrouter/free', 'google/gemma-4-31b-it:free'],
        autoFallbackOnLimit: true,
      });

      const result = await router.executeStep([{ role: 'user', content: 'Search documents' }], 1);

      expect(callCount).toBe(2);
      expect(requestedModels[0]).toBe('meta-llama/llama-3.3-70b-instruct:free');
      expect(requestedModels[1]).toBe('openrouter/free');
      expect(result.response.complete).toBe(true);
      expect(result.modelUsed).toBe('openrouter/free');
      expect(result.fallbackNotice).toContain('openrouter/free');
      expect(router.getConfig().openRouterModel).toBe('openrouter/free');
    });

    it('cross-provider failover: automatically falls over from Groq to OpenRouter when 429 occurs', async () => {
      let groqCalled = false;
      let openRouterCalled = false;

      globalThis.fetch = vi.fn().mockImplementation(async (url: string, _init: RequestInit) => {
        if (url.includes('api.groq.com')) {
          groqCalled = true;
          return {
            ok: false,
            status: 429,
            text: async () => 'Rate limit exceeded: TPM limit reached',
          };
        }

        if (url.includes('openrouter.ai')) {
          openRouterCalled = true;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      thought: 'OpenRouter fallback executed',
                      actions: [{ type: 'wait' }],
                      complete: false,
                    }),
                  },
                },
              ],
            }),
          };
        }

        return { ok: false, status: 500, text: async () => 'Unexpected URL' };
      });

      const router = new LLMRouter({
        apiKeys: {
          groq: 'gsk-key',
          openrouter: 'sk-or-key',
        },
        preferredTier1Provider: 'groq',
        autoFallbackOnLimit: true,
      });

      const result = await router.executeStep([{ role: 'user', content: 'Test prompt' }], 1);

      expect(groqCalled).toBe(true);
      expect(openRouterCalled).toBe(true);
      expect(result.provider).toBe('openrouter');
      expect(result.response.thought).toBe('OpenRouter fallback executed');
      expect(result.fallbackNotice).toContain('openrouter');
    });

    it('automatically switches Groq model on 404 decommissioned or 429 rate limit', async () => {
      let callCount = 0;
      const modelsCalled: string[] = [];

      globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        callCount++;
        const body = JSON.parse(init.body as string);
        modelsCalled.push(body.model);

        if (callCount === 1) {
          // Model decommissioned / 404
          return {
            ok: false,
            status: 404,
            text: async () => 'model_decommissioned: The model is decommissioned',
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    thought: 'Groq fallback model succeeded',
                    actions: [{ type: 'wait' }],
                    complete: true,
                  }),
                },
              },
            ],
          }),
        };
      });

      const router = new LLMRouter({
        apiKeys: { groq: 'gsk-test' },
        preferredTier1Provider: 'groq',
        groqModel: 'llama-3.3-70b-versatile',
        groqFallbackModels: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
        autoFallbackOnLimit: true,
      });

      const result = await router.executeStep([{ role: 'user', content: 'test' }], 1);

      expect(callCount).toBe(2);
      expect(modelsCalled[0]).toBe('llama-3.3-70b-versatile');
      expect(modelsCalled[1]).toBe('llama-3.1-8b-instant');
      expect(result.provider).toBe('groq');
      expect(result.modelUsed).toBe('llama-3.1-8b-instant');
      expect(result.fallbackNotice).toContain('llama-3.1-8b-instant');
      expect(router.getConfig().groqModel).toBe('llama-3.1-8b-instant');
    });

    it('automatically switches Gemini model on RESOURCE_EXHAUSTED or 429 quota error', async () => {
      let callCount = 0;
      const modelsCalled: string[] = [];

      globalThis.fetch = vi.fn().mockImplementation(async (url: string, _init: RequestInit) => {
        callCount++;
        const modelMatch = url.match(/models\/([^:]+):generateContent/);
        if (modelMatch) modelsCalled.push(modelMatch[1]);

        if (callCount === 1) {
          return {
            ok: false,
            status: 429,
            text: async () => 'RESOURCE_EXHAUSTED: Quota exceeded for quota group GenerateContentRequestsPerMinute',
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        thought: 'Gemini fallback model completed step',
                        actions: [{ type: 'click', id: 10 }],
                        complete: true,
                      }),
                    },
                  ],
                },
              },
            ],
          }),
        };
      });

      const router = new LLMRouter({
        apiKeys: { gemini: 'aiza-test' },
        preferredTier1Provider: 'gemini',
        geminiModel: 'gemini-2.0-flash',
        geminiFallbackModels: ['gemini-2.0-flash', 'gemini-1.5-flash'],
        autoFallbackOnLimit: true,
      });

      const result = await router.executeStep([{ role: 'user', content: 'test' }], 1);

      expect(callCount).toBe(2);
      expect(modelsCalled[0]).toBe('gemini-2.0-flash');
      expect(modelsCalled[1]).toBe('gemini-1.5-flash');
      expect(result.provider).toBe('gemini');
      expect(result.modelUsed).toBe('gemini-1.5-flash');
      expect(result.fallbackNotice).toContain('gemini-1.5-flash');
      expect(router.getConfig().geminiModel).toBe('gemini-1.5-flash');
    });
  });
});
