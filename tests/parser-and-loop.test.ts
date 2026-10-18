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

    it('parses open_tab and switch_tab actions', () => {
      const json = JSON.stringify({
        thought: 'Opening new tab and switching',
        actions: [
          { type: 'open_tab', value: 'https://coursera.org' },
          { type: 'switch_tab', value: 'coursera' },
        ],
        complete: false,
      });
      const plan = parseAgentPlanResponse(json);
      expect(plan.actions).toEqual([
        { type: 'open_tab', value: 'https://coursera.org' },
        { type: 'switch_tab', value: 'coursera' },
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

    it('prevents premature completion on intermediate action steps even if complete was true', async () => {
      const router = new LLMRouter({ apiKeys: { groq: 'test-key' } });

      vi.spyOn(router, 'executeStep')
        .mockResolvedValueOnce({
          response: {
            thought: 'Clicking module accordion to expand lessons, now I will proceed to the first lesson.',
            actions: [{ type: 'click', id: 3 }],
            complete: true, // premature completion flag from LLM
          },
          activeTier: 1,
          provider: 'groq',
        })
        .mockResolvedValueOnce({
          response: {
            thought: 'Course lecture completed and verified. Entire goal is finished.',
            actions: [],
            complete: true,
          },
          activeTier: 1,
          provider: 'groq',
        });

      const stateMachine = new AgentStateMachine(router);
      await stateMachine.startTask('Complete Coursera lesson 1', 1);

      const state = stateMachine.getState();
      expect(state.status).toBe('completed');
      expect(state.stepNumber).toBe(2);
      expect(state.completedTraces.length).toBeGreaterThanOrEqual(1);
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

  describe('Milestone 7.3: Completion Heuristics & NetAcad SCORM Cross-Frame Execution', () => {
    it('strict completion heuristic guards against future-intent and button labels', () => {
      const stateMachine = new AgentStateMachine(new LLMRouter({ apiKeys: {} }));
      const hasCompletion = (thought: string) =>
        (stateMachine as any).hasCompletionIndication(thought);

      // Negative cases: thoughts containing future intent or incomplete status
      expect(hasCompletion('I will click Mark as complete next')).toBe(false);
      expect(hasCompletion("Let's click complete")).toBe(false);
      expect(hasCompletion('Clicking Mark as complete button')).toBe(false);
      expect(hasCompletion('Need to complete the remaining quizzes')).toBe(false);
      expect(hasCompletion('Going to open lesson 2')).toBe(false);
      expect(hasCompletion('not done yet')).toBe(false);
      expect(hasCompletion('Scrolling down to find next section')).toBe(false);

      // Positive cases: explicit completion statements without future intent
      expect(hasCompletion('Task is complete.')).toBe(true);
      expect(hasCompletion('The goal is achieved.')).toBe(true);
      expect(hasCompletion('All requested steps are done.')).toBe(true);
      expect(hasCompletion('Successfully marked as complete and finished.')).toBe(true);
      expect(hasCompletion('The answer is 42.')).toBe(true);
    });

    it('cross-frame distillation captures SCORM child frames with offset IDs and targets frameId during execution', async () => {
      const router = new LLMRouter({ apiKeys: { groq: 'test-key' } });

      const fakeChrome: any = {
        tabs: {
          get: vi.fn().mockResolvedValue({ id: 10, url: 'https://netacad.com/course/module1', status: 'complete' }),
          sendMessage: vi.fn().mockResolvedValue({
            text: 'PAGE: Cisco NetAcad [https://netacad.com]\n[1] <button>Menu</button>',
          }),
        },
        scripting: {
          executeScript: vi.fn().mockImplementation(async (opts: any) => {
            if (opts.target?.allFrames) {
              // Return child SCORM frame
              return [
                {
                  frameId: 3,
                  result: {
                    frameTitle: 'SCORM Interactive Player',
                    frameUrl: 'https://content.netacad.com/scorm/player.html',
                    items: [
                      {
                        localId: 1,
                        tag: 'button',
                        attrStr: 'type="button"',
                        text: 'Mark as complete',
                      },
                      {
                        localId: 2,
                        tag: 'video',
                        attrStr: '',
                        text: '',
                      },
                    ],
                  },
                },
              ];
            } else if (opts.target?.frameIds?.includes(3)) {
              // Mock execution inside frame 3
              return [{ result: { success: true } }];
            }
            return [{ result: { success: true } }];
          }),
        },
      };

      const originalChrome = (globalThis as any).chrome;
      (globalThis as any).chrome = fakeChrome;

      try {
        let initialPromptObservation = '';
        vi.spyOn(router, 'executeStep').mockImplementation(async (messages: any) => {
          initialPromptObservation = messages.map((m: any) => m.content).join('\n');
          return {
            response: {
              thought: 'Clicking Mark as complete in SCORM child player.',
              actions: [{ type: 'click', id: 1001 }],
              complete: true,
            },
            activeTier: 1,
            provider: 'groq',
          };
        });

        const stateMachine = new AgentStateMachine(router);
        await stateMachine.startTask('Complete NetAcad lesson', 10);

        // Verify child frame elements were captured with frame offset (1001, 1002)
        expect(initialPromptObservation).toContain('--- IFRAME [Frame 3: SCORM Interactive Player] ---');
        expect(initialPromptObservation).toContain('[1001] <button type="button">Mark as complete</button>');
        expect(initialPromptObservation).toContain('[1002] <video />');

        // Verify child frame action was executed targeting frameIds: [3]
        expect(fakeChrome.scripting.executeScript).toHaveBeenCalledWith(
          expect.objectContaining({
            target: { tabId: 10, frameIds: [3] },
            args: [{ type: 'click', id: 1 }],
          })
        );
      } finally {
        (globalThis as any).chrome = originalChrome;
      }
    });

    it('isolates state, goals, step counters, and storage keys across multiple concurrent tab agents', async () => {
      const router = new LLMRouter({ apiKeys: { groq: 'test-key' } });

      const sessionStorageData: Record<string, any> = {};
      const fakeChrome: any = {
        tabs: {
          get: vi.fn().mockImplementation(async (id: number) => ({
            id,
            url: id === 101 ? 'https://coursera.org/learn/algo' : 'https://netacad.com/courses/ccna',
            status: 'complete',
          })),
          sendMessage: vi.fn().mockImplementation(async (id: number) => ({
            text: id === 101 ? 'PAGE: Coursera\n[1] <button>Start</button>' : 'PAGE: NetAcad\n[1] <button>Resume</button>',
          })),
        },
        storage: {
          session: {
            get: vi.fn().mockImplementation(async (key: string) => ({ [key]: sessionStorageData[key] })),
            set: vi.fn().mockImplementation(async (obj: Record<string, any>) => {
              Object.assign(sessionStorageData, obj);
            }),
          },
        },
      };

      const originalChrome = (globalThis as any).chrome;
      (globalThis as any).chrome = fakeChrome;

      try {
        let stepCount101 = 0;
        let stepCount202 = 0;
        vi.spyOn(router, 'executeStep').mockImplementation(async (messages: any) => {
          const userMsg = messages.find((m: any) => m.role === 'user')?.content || '';
          if (userMsg.includes('Coursera')) {
            stepCount101++;
            if (stepCount101 === 1) {
              return {
                response: {
                  thought: 'Clicking start on Coursera lesson',
                  actions: [{ type: 'click', id: 1 }],
                  complete: false,
                },
                activeTier: 1,
                provider: 'groq',
              };
            } else {
              return {
                response: {
                  thought: 'Coursera Algorithms task is complete.',
                  actions: [],
                  complete: true,
                },
                activeTier: 1,
                provider: 'groq',
              };
            }
          } else {
            stepCount202++;
            return {
              response: {
                thought: 'NetAcad CCNA goal is achieved.',
                actions: [],
                complete: true,
              },
              activeTier: 1,
              provider: 'groq',
            };
          }
        });

        // Initialize two separate agents bound to tab 101 and tab 202
        const agent101 = new AgentStateMachine(router, {}, 'orbit_agent_session_tab_101');
        const agent202 = new AgentStateMachine(router, {}, 'orbit_agent_session_tab_202');

        await agent101.startTask('Complete Coursera Algorithms', 101);
        await agent202.startTask('Complete NetAcad CCNA', 202);

        const state101 = agent101.getState();
        const state202 = agent202.getState();

        // Verify independent goals and tab bindings
        expect(state101.tabId).toBe(101);
        expect(state101.goal).toBe('Complete Coursera Algorithms');
        expect(state101.status).toBe('completed');
        expect(state101.stepNumber).toBe(2);
        expect(state101.currentThought).toBe('Coursera Algorithms task is complete.');

        expect(state202.tabId).toBe(202);
        expect(state202.goal).toBe('Complete NetAcad CCNA');
        expect(state202.status).toBe('completed');
        expect(state202.stepNumber).toBe(1);
        expect(state202.currentThought).toBe('NetAcad CCNA goal is achieved.');

        // Verify isolated per-tab session persistence in chrome.storage.session
        expect(sessionStorageData['orbit_agent_session_tab_101']).toBeDefined();
        expect(sessionStorageData['orbit_agent_session_tab_101'].tabId).toBe(101);
        expect(sessionStorageData['orbit_agent_session_tab_101'].goal).toBe('Complete Coursera Algorithms');
        expect(sessionStorageData['orbit_agent_session_tab_101'].stepNumber).toBe(2);

        expect(sessionStorageData['orbit_agent_session_tab_202']).toBeDefined();
        expect(sessionStorageData['orbit_agent_session_tab_202'].tabId).toBe(202);
        expect(sessionStorageData['orbit_agent_session_tab_202'].goal).toBe('Complete NetAcad CCNA');
        expect(sessionStorageData['orbit_agent_session_tab_202'].stepNumber).toBe(1);
      } finally {
        (globalThis as any).chrome = originalChrome;
      }
    });
  });
});


