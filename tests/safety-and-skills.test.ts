import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifyActionSafety } from '../src/lib/safety/interceptor';
import { SkillStore, SiteSkill, compileTraceToSkill } from '../src/lib/skills/skillStore';
import { AgentStateMachine } from '../src/lib/agent/stateMachine';
import { LLMRouter } from '../src/lib/llm/router';

describe('M4: Skills Cache & Human-in-the-Loop Safety Interceptor Suite', () => {
  describe('Destructive Action Safety Interceptor', () => {
    it('detects financial actions with critical severity', () => {
      const result = classifyActionSafety({ type: 'click', id: 5 }, 'Place Order $129.99', 'button');
      expect(result.isDestructive).toBe(true);
      expect(result.severity).toBe('critical');
      expect(result.reason).toContain('Financial transaction');
    });

    it('detects deletion actions with high severity', () => {
      const result = classifyActionSafety({ type: 'click', id: 8 }, 'Delete Repository', 'button');
      expect(result.isDestructive).toBe(true);
      expect(result.severity).toBe('high');
      expect(result.reason).toContain('Destructive deletion');
    });

    it('detects external communication actions with medium severity', () => {
      const result = classifyActionSafety({ type: 'click', id: 2 }, 'Send Email to Client', 'button');
      expect(result.isDestructive).toBe(true);
      expect(result.severity).toBe('medium');
      expect(result.reason).toContain('External communication');
    });

    it('detects generic submit button actions with low severity', () => {
      const result = classifyActionSafety({ type: 'click', id: 14 }, 'Submit Application', 'submit');
      expect(result.isDestructive).toBe(true);
      expect(result.severity).toBe('low');
    });

    it('allows non-destructive reading, browsing and scrolling actions freely', () => {
      const r1 = classifyActionSafety({ type: 'click', id: 1 }, 'Next Page >', 'link');
      expect(r1.isDestructive).toBe(false);

      const r2 = classifyActionSafety({ type: 'fill', id: 2, value: 'wireless keyboard' }, 'Search box', 'text');
      expect(r2.isDestructive).toBe(false);

      const r3 = classifyActionSafety({ type: 'scroll', value: 'down' });
      expect(r3.isDestructive).toBe(false);
    });
  });

  describe('IndexedDB 0-Token Skill Store', () => {
    let skillStore: SkillStore;

    beforeEach(() => {
      skillStore = new SkillStore();
    });

    it('saves and matches deterministic site skill for 0-token execution', async () => {
      const sampleSkill: SiteSkill = {
        id: 'test_skill_gh_search',
        hostname: 'github.com',
        pathnamePattern: '/search*',
        goalPattern: 'search repositories for rust',
        steps: [
          { action: 'fill', selector: 'input[name="q"]', value: 'rust' },
          { action: 'press', value: 'Enter', stop_if_url_changes: true },
        ],
        tokenSavings: 1300,
        timesExecuted: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await skillStore.saveSkill(sampleSkill);

      // Verify retrieval
      const fetched = await skillStore.getSkill('test_skill_gh_search');
      expect(fetched?.hostname).toBe('github.com');
      expect(fetched?.steps.length).toBe(2);

      // Verify matching on identical domain and goal keywords
      const match = await skillStore.findMatchingSkill(
        'https://github.com/search?q=test',
        'Please search repositories for rust projects'
      );
      expect(match).not.toBeNull();
      expect(match?.id).toBe('test_skill_gh_search');

      // Verify record execution
      await skillStore.recordSkillExecution('test_skill_gh_search');
      const updated = await skillStore.getSkill('test_skill_gh_search');
      expect(updated?.timesExecuted).toBe(1);

      // Negative check: different domain does not match
      const noMatch = await skillStore.findMatchingSkill(
        'https://gitlab.com/search',
        'search repositories for rust'
      );
      expect(noMatch).toBeNull();
    });

    it('resolves skill via slash command query matching id or goal keywords', async () => {
      const courseraSkill: SiteSkill = {
        id: 'coursera_complete',
        hostname: 'coursera.org',
        pathnamePattern: '/learn/*',
        goalPattern: 'open lecture and mark complete',
        steps: [
          { action: 'click', selector: 'button.lecture-item' },
          { action: 'wait', value: '1000' },
        ],
        tokenSavings: 2500,
        timesExecuted: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await skillStore.saveSkill(courseraSkill);

      const allSkills = await skillStore.listSkills();
      const slashQuery = 'coursera_complete';
      const matched = allSkills.find(
        (s) =>
          s.id.toLowerCase() === slashQuery ||
          s.goalPattern.toLowerCase().includes(slashQuery) ||
          s.hostname.toLowerCase().includes(slashQuery)
      );
      expect(matched).toBeDefined();
      expect(matched?.id).toBe('coursera_complete');
      expect(matched?.steps.length).toBe(2);
    });
  });

  describe('State Machine Safety Interceptor Integration', () => {
    it('pauses and requests approval when destructive action is planned', async () => {
      const router = new LLMRouter({
        apiKeys: { groq: 'test-key' },
      });

      // Mock LLM to emit a destructive delete action
      vi.spyOn(router, 'executeStep').mockResolvedValue({
        response: {
          thought: 'Deleting the selected user record',
          actions: [{ type: 'click', id: 99 }],
          complete: false,
        },
        activeTier: 1,
        provider: 'groq',
      });

      const stateMachine = new AgentStateMachine(router, {
        isDestructiveAction: (action) => {
          if (action.id === 99) {
            return { destructive: true, reason: 'Attempting to delete record #99' };
          }
          return { destructive: false };
        },
      });

      // Start task
      await stateMachine.startTask('Delete inactive user', 1);

      const state = stateMachine.getState();
      expect(state.status).toBe('waiting_approval');
      expect(state.requiresApproval).toBe(true);
      expect(state.approvalDetails?.reason).toContain('Attempting to delete record #99');

      // Reject approval
      await stateMachine.approvePendingAction(false);
      expect(stateMachine.getState().status).toBe('paused');
      expect(stateMachine.getState().requiresApproval).toBe(false);
    });

    it('compileTraceToSkill preserves selector on compiled steps', async () => {
      const traces = [
        {
          action: { type: 'click' as const, id: 1 },
          timestamp: Date.now(),
          success: true,
          selector: 'button#submit-btn',
          elementText: 'Submit',
        },
        {
          action: { type: 'fill' as const, id: 2, value: 'test query' },
          timestamp: Date.now(),
          success: true,
          selector: 'input[name="q"]',
          elementText: '',
        },
      ];

      const skill = await compileTraceToSkill('https://example.com/search', 'search query', traces);
      expect(skill.steps.length).toBe(2);
      expect(skill.steps[0].selector).toBe('button#submit-btn');
      expect(skill.steps[1].selector).toBe('input[name="q"]');
    });
  });
});
