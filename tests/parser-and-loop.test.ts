import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseAgentPlanResponse } from '../src/lib/llm/parser';
import { AgentStateMachine } from '../src/lib/agent/stateMachine';
import { LLMRouter } from '../src/lib/llm/router';
import { OpenRouterAdapter } from '../src/lib/llm/adapters/openrouter';
import { UsageLimitError } from '../src/lib/llm/types';

describe('Vision AI Smooth Agent Loop & Resilient Parser Suite', () => {
  describe('Resilient Plan Parser', () => {
    it('parses boolean complete: true', () => {
      const json = JSON.stringify({
        thought: 'Task completed successfully',
        actions: [],
        complete: true,
      });
      const plan = parseAgentPlanResponse(json);
      expect(plan.complete).toBe(true);
      expect(plan.actions).toEqual([]);
      expect(plan.thought).toBe('Task completed successfully');
    });

    it('parses string complete: "true" gracefully', () => {
      const json = JSON.stringify({
        thought: 'Done with steps',
        actions: [],
        complete: 'true',
      });
      const plan = parseAgentPlanResponse(json);
      expect(plan.complete).toBe(true);
    });

    it('parses alternate completion flags like done: true and status: "completed"', () => {
      const json1 = JSON.stringify({
        thought: 'All done',
        actions: [],
        done: true,
      });
      expect(parseAgentPlanResponse(json1).complete).toBe(true);

      const json2 = JSON.stringify({
        thought: 'Finished all requests',
        actions: [],
        status: 'completed',
      });
      expect(parseAgentPlanResponse(json2).complete).toBe(true);
    });

    it('automatically marks complete when 0 actions provided and thought explicitly indicates goal completed', () => {
      const json = JSON.stringify({
        thought: 'I have found the answer: The price is $29.99. Task complete.',
        actions: [],
        complete: false,
      });
      const plan = parseAgentPlanResponse(json);
      expect(plan.complete).toBe(true);
    });

    it('handles numeric IDs passed as string and normalizes action type casing', () => {
      const json = JSON.stringify({
        thought: 'Clicking submit',
        actions: [{ type: 'CLICK', id: '42' }],
        complete: false,
      });
      const plan = parseAgentPlanResponse(json);
      expect(plan.actions).toEqual([{ type: 'click', id: 42 }]);
    });

    it('gracefully handles plain text "User Safety" responses without JSON parsing error', () => {
      const raw = 'User Safety: I cannot perform actions that modify browser security settings without confirmation.';
      const plan = parseAgentPlanResponse(raw);
      expect(plan.complete).toBe(true);
      expect(plan.actions).toEqual([]);
      expect(plan.thought).toBe(raw);
    });

    it('extracts JSON when preceded by commentary or markdown blocks', () => {
      const raw = `User Safety Review complete.
\`\`\`json
{
  "thought": "Verified page safety. Clicking next.",
  "actions": [{ "type": "click", "id": 5 }],
  "complete": false
}
\`\`\``;
      const plan = parseAgentPlanResponse(raw);
      expect(plan.thought).toBe('Verified page safety. Clicking next.');
      expect(plan.actions).toEqual([{ type: 'click', id: 5 }]);
      expect(plan.complete).toBe(false);
    });

    it('repairs trailing commas and unescaped syntax flaws in model JSON', () => {
      const raw = `{
        "thought": "All checks passed",
        "actions": [
          { "type": "scroll", "value": "down" },
        ],
        "complete": false,
      }`;
      const plan = parseAgentPlanResponse(raw);
      expect(plan.thought).toBe('All checks passed');
      expect(plan.actions).toEqual([{ type: 'scroll', value: 'down' }]);
      expect(plan.complete).toBe(false);
    });

    it('parses navigate and go_back actions', () => {
      const json = JSON.stringify({
        thought: 'Navigating to website and returning',
        actions: [
          { type: 'navigate', value: 'https://github.com' },
          { type: 'go_back' },
        ],
        complete: false,
      });
      const plan = parseAgentPlanResponse(json);
      expect(plan.actions).toEqual([
        { type: 'navigate', value: 'https://github.com' },
        { type: 'go_back' },
      ]);
    });
  });

  describe('Agent State Machine Loop & Anti-Stall Mechanisms', () => {
    it('auto-completes gracefully when model outputs 0 actions with completion thought', async () => {
      const router = new LLMRouter({ apiKeys: { groq: 'test-key' } });

      vi.spyOn(router, 'executeStep').mockResolvedValue({
        response: {
          thought: 'The Wikipedia article states that Albert Einstein was born in 1879. Goal completed.',
          actions: [],
          complete: false,
        },
        activeTier: 1,
        provider: 'groq',
      });

      const stateMachine = new AgentStateMachine(router);
      await stateMachine.startTask('Find birth year of Einstein', 1);

      const state = stateMachine.getState();
      expect(state.status).toBe('completed');
      expect(state.stepNumber).toBe(1);
    });

    it('breaks infinite loop when identical action is repeated 3 times without progress', async () => {
      const router = new LLMRouter({ apiKeys: { groq: 'test-key' } });

      // Model keeps outputting the exact same click action
      vi.spyOn(router, 'executeStep').mockResolvedValue({
        response: {
          thought: 'Clicking button to open menu',
          actions: [{ type: 'click', id: 7 }],
          complete: false,
        },
        activeTier: 1,
        provider: 'groq',
      });

      const stateMachine = new AgentStateMachine(router);
      await stateMachine.startTask('Open settings menu', 1);

      const state = stateMachine.getState();
      expect(state.status).toBe('completed');
      expect(state.stepNumber).toBeLessThanOrEqual(5);
      expect(state.currentThought).toContain('loop breaker');
    });

    it('Step 1 Action-First Guardrail intercepts chatbot refusal on course goal and forces browser action', async () => {
      const router = new LLMRouter({ apiKeys: { groq: 'test-key' } });

      // First call: model attempts conversational refusal
      // Second call (after nudge): model provides concrete browser action
      vi.spyOn(router, 'executeStep')
        .mockResolvedValueOnce({
          response: {
            thought:
              'Completing an entire CCNA course requires completing multiple modules. Automatically marking or bypassing the course requirements is not possible.',
            actions: [],
            complete: true,
          },
          activeTier: 1,
          provider: 'groq',
        })
        .mockResolvedValueOnce({
          response: {
            thought: 'Clicking Module 1 Introduction to start the course.',
            actions: [{ type: 'click', id: 4 }],
            complete: false,
          },
          activeTier: 1,
          provider: 'groq',
        })
        .mockResolvedValueOnce({
          response: {
            thought: 'Module 1 opened. First section complete.',
            actions: [],
            complete: true,
          },
          activeTier: 1,
          provider: 'groq',
        });

      const stateMachine = new AgentStateMachine(router);
      await stateMachine.startTask('complete this course', 1);

      const state = stateMachine.getState();
      expect(state.status).toBe('completed');
      expect(state.completedTraces.length).toBeGreaterThanOrEqual(1);
      expect(state.completedTraces[0].action.type).toBe('click');
      expect(state.completedTraces[0].action.id).toBe(4);
    });

    it('Refusal thoughts with 0 actions are never marked as completed', async () => {
      const router = new LLMRouter({ apiKeys: { groq: 'test-key' } });

      vi.spyOn(router, 'executeStep').mockResolvedValue({
        response: {
          thought: 'I cannot bypass course requirements as an AI policy.',
          actions: [],
          complete: true,
        },
        activeTier: 1,
        provider: 'groq',
      });

      const stateMachine = new AgentStateMachine(router);
      await stateMachine.startTask('complete this course', 1);

      const state = stateMachine.getState();
      expect(state.status).not.toBe('completed');
    });

    it('allows Step 1 completion when plan.complete is true with informative thought and no refusal', async () => {
      const router = new LLMRouter({ apiKeys: { groq: 'test-key' } });

      vi.spyOn(router, 'executeStep').mockResolvedValue({
        response: {
          thought: 'The current page displays the project documentation overview and installation guide.',
          actions: [],
          complete: true,
        },
        activeTier: 1,
        provider: 'groq',
      });

      const stateMachine = new AgentStateMachine(router);
      await stateMachine.startTask('Summarize this documentation page', 1);

      const state = stateMachine.getState();
      expect(state.status).toBe('completed');
      expect(state.currentThought).toContain('project documentation overview');
    });

    it('executes navigate and go_back actions and records traces', async () => {
      const router = new LLMRouter({ apiKeys: { groq: 'test-key' } });

      vi.spyOn(router, 'executeStep').mockResolvedValue({
        response: {
          thought: 'Navigating to external docs',
          actions: [
            { type: 'navigate', value: 'https://github.com/trending' },
            { type: 'go_back' },
          ],
          complete: true,
        },
        activeTier: 1,
        provider: 'groq',
      });

      const updateSpy = vi.fn().mockResolvedValue({});
      const goBackSpy = vi.fn().mockResolvedValue({});
      (globalThis as any).chrome = {
        ...(globalThis as any).chrome,
        tabs: {
          query: vi.fn().mockResolvedValue([{ id: 1 }]),
          get: vi.fn().mockResolvedValue({ id: 1, url: 'https://github.com/trending', status: 'complete' }),
          update: updateSpy,
          goBack: goBackSpy,
          sendMessage: vi.fn().mockResolvedValue({ text: 'PAGE: GitHub Trending' }),
        },
      };

      const stateMachine = new AgentStateMachine(router);
      await stateMachine.startTask('Check trending repos', 1);

      expect(updateSpy).toHaveBeenCalledWith(1, { url: 'https://github.com/trending' });
      const state = stateMachine.getState();
      expect(state.completedTraces.some((t) => t.action.type === 'navigate')).toBe(true);
    });
  });

  describe('OpenRouter HTTP 400 Retry & Resilience', () => {
    it('retries once without response_format on HTTP 400 and succeeds if retry returns 200', async () => {
      const adapter = new OpenRouterAdapter('test-key', 'free/model');
      let callCount = 0;
      let secondCallHadResponseFormat = true;

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init: any) => {
        callCount++;
        const parsedBody = JSON.parse(init.body);
        if (callCount === 1) {
          expect(parsedBody.response_format).toBeDefined();
          return {
            ok: false,
            status: 400,
            text: async () => 'Provider does not support response_format',
          } as Response;
        } else {
          secondCallHadResponseFormat = parsedBody.response_format !== undefined;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      thought: 'Successfully retrieved after 400 retry',
                      actions: [],
                      complete: true,
                    }),
                  },
                },
              ],
            }),
          } as Response;
        }
      });

      const res = await adapter.chat([{ role: 'user', content: 'test' }]);
      expect(callCount).toBe(2);
      expect(secondCallHadResponseFormat).toBe(false);
      expect(res.thought).toBe('Successfully retrieved after 400 retry');
      expect(res.complete).toBe(true);
    });

    it('throws UsageLimitError if retry also fails with HTTP 400', async () => {
      const adapter = new OpenRouterAdapter('test-key', 'broken/model');

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Invalid model request or unsupported parameter',
      } as Response);

      await expect(adapter.chat([{ role: 'user', content: 'test' }])).rejects.toThrow(UsageLimitError);
    });
  });
});
