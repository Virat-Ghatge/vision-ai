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
});
