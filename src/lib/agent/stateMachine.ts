import {
  AgentSessionState,
  AgentStatus,
  TokenMetrics,
} from './types';
import { LLMRouter } from '../llm/router';
import { ByteStableContextManager } from '../llm/contextManager';
import { MacroAction } from '../llm/types';
import { ActionTrace, MacroExecutionResult } from '../executor/macroExecutor';

const DEFAULT_MAX_STEPS = 15;
const STORAGE_SESSION_KEY = 'orbit_agent_session_state';

export interface StateMachineHooks {
  checkSkillCache?: (url: string, goal: string) => Promise<{ matched: boolean; actions?: MacroAction[] }>;
  isDestructiveAction?: (action: MacroAction, textDescription?: string) => { destructive: boolean; reason?: string };
  onStateChange?: (state: AgentSessionState) => void;
}

export class AgentStateMachine {
  private state: AgentSessionState;
  private router: LLMRouter;
  private contextManager: ByteStableContextManager;
  private hooks: StateMachineHooks;

  constructor(router: LLMRouter, hooks: StateMachineHooks = {}) {
    this.router = router;
    this.hooks = hooks;
    this.contextManager = new ByteStableContextManager();
    this.state = this.getInitialState();
  }

  private getInitialState(): AgentSessionState {
    return {
      status: 'idle',
      goal: '',
      tabId: 0,
      stepNumber: 0,
      maxSteps: DEFAULT_MAX_STEPS,
      currentThought: '',
      pendingActions: [],
      requiresApproval: false,
      tokenMetrics: {
        totalEstimatedTokens: 0,
        cachedPrefixTokens: 0,
        freshTokens: 0,
        estimatedCostDiscountPercent: 0,
      },
      completedTraces: [],
    };
  }

  getState(): Readonly<AgentSessionState> {
    return this.state;
  }

  async restoreSession(): Promise<boolean> {
    if (typeof chrome === 'undefined' || !chrome.storage?.session) return false;

    try {
      const res = await chrome.storage.session.get(STORAGE_SESSION_KEY);
      const saved = res[STORAGE_SESSION_KEY] as AgentSessionState | undefined;
      if (saved) {
        this.state = saved;
        this.hooks.onStateChange?.(this.state);
        return true;
      }
    } catch (err) {
      console.warn('[AgentStateMachine] Failed to restore session from storage:', err);
    }
    return false;
  }

  private async persistSession(): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      try {
        await chrome.storage.session.set({ [STORAGE_SESSION_KEY]: this.state });
      } catch (err) {
        console.warn('[AgentStateMachine] Failed to persist session:', err);
      }
    }
    this.hooks.onStateChange?.(this.state);
  }

  async startTask(goal: string, tabId: number): Promise<void> {
    this.state = {
      ...this.getInitialState(),
      status: 'running',
      goal,
      tabId,
      stepNumber: 1,
    };
    await this.persistSession();

    // Step 1: Initial Observation & Skill Cache Check
    await this.runStep();
  }

  /**
   * Executes a single state machine loop cycle:
   * Observe -> Check Skill Cache -> Route LLM -> Execute Macro-Batch -> Diff
   */
  async runStep(): Promise<AgentSessionState> {
    if (this.state.status !== 'running') {
      return this.state;
    }

    if (this.state.stepNumber > this.state.maxSteps) {
      this.state.status = 'error';
      this.state.error = `Maximum step limit (${this.state.maxSteps}) reached without task completion.`;
      await this.persistSession();
      return this.state;
    }

    try {
      // 1. OBSERVE: Fetch DOM observation from tab
      let observationText = '';
      if (this.state.stepNumber === 1) {
        // Step 1: Get full distilled viewport DOM
        observationText = await this.queryTabDistillation(this.state.tabId);

        // 2. CHECK SKILL CACHE: Deterministic 0-token check
        if (this.hooks.checkSkillCache) {
          const tabUrl = await this.getTabUrl(this.state.tabId);
          const skillMatch = await this.hooks.checkSkillCache(tabUrl, this.state.goal);
          if (skillMatch.matched && skillMatch.actions && skillMatch.actions.length > 0) {
            this.state.currentThought = 'Executing matched 0-token deterministic domain skill from cache.';
            const execResult = await this.sendActionsToTab(this.state.tabId, skillMatch.actions);
            this.state.completedTraces.push(...execResult.executedTraces);
            this.state.status = 'completed';
            await this.persistSession();
            return this.state;
          }
        }

        // Initialize Byte-Stable Context Manager (Frozen prefix for caching)
        this.contextManager.initializeRun(this.state.goal, observationText);
      } else {
        // Steps 2..N: Fetch mutation delta diff
        const deltaResult = await this.queryTabDelta(this.state.tabId);
        observationText = deltaResult;
        this.contextManager.appendStepObservation(this.state.stepNumber, observationText);
      }

      this.updateTelemetry();

      // 3. ROUTE LLM: Query multi-provider tiered router
      const messages = this.contextManager.getMessages();
      const { response: plan, activeTier, provider } = await this.router.executeStep(messages, 1);

      this.state.activeProvider = provider;
      this.state.activeTier = activeTier;
      this.state.currentThought = plan.thought;
      this.state.pendingActions = plan.actions;

      // 4. HUMAN-IN-THE-LOOP CHECK: Check for destructive actions
      if (this.hooks.isDestructiveAction) {
        for (const action of plan.actions) {
          const check = this.hooks.isDestructiveAction(action);
          if (check.destructive) {
            this.state.status = 'waiting_approval';
            this.state.requiresApproval = true;
            this.state.approvalDetails = {
              action,
              reason: check.reason ?? 'Potentially destructive or financial action requires user confirmation.',
            };
            await this.persistSession();
            return this.state;
          }
        }
      }

      // 5. EXECUTE MACRO-BATCH
      await this.executePendingActions(plan.complete);
      return this.state;
    } catch (err) {
      this.state.status = 'error';
      this.state.error = err instanceof Error ? err.message : String(err);
      this.router.recordFailure();
      await this.persistSession();
      return this.state;
    }
  }

  async approvePendingAction(approved: boolean): Promise<void> {
    if (this.state.status !== 'waiting_approval') return;

    if (!approved) {
      this.state.status = 'paused';
      this.state.requiresApproval = false;
      this.state.approvalDetails = undefined;
      this.state.currentThought = 'User rejected destructive action. Execution paused.';
      await this.persistSession();
      return;
    }

    this.state.status = 'running';
    this.state.requiresApproval = false;
    this.state.approvalDetails = undefined;
    await this.persistSession();

    await this.executePendingActions(false);
  }

  private async executePendingActions(isPlanComplete: boolean): Promise<void> {
    const actions = this.state.pendingActions;
    this.state.pendingActions = [];

    if (actions.length > 0) {
      const execResult = await this.sendActionsToTab(this.state.tabId, actions);
      this.state.completedTraces.push(...execResult.executedTraces);

      if (execResult.abortedEarly) {
        this.router.recordFailure();
      } else {
        this.router.resetFailures();
      }
    }

    // Append plan to context manager history
    this.contextManager.appendAssistantPlan({
      thought: this.state.currentThought,
      actions,
      complete: isPlanComplete,
    });

    if (isPlanComplete) {
      this.state.status = 'completed';
      await this.persistSession();
      return;
    }

    // Advance step and continue
    this.state.stepNumber += 1;
    await this.persistSession();

    // Auto-continue loop if running
    if (this.state.status === 'running') {
      await this.runStep();
    }
  }

  async pause(): Promise<void> {
    if (this.state.status === 'running' || this.state.status === 'waiting_approval') {
      this.state.status = 'paused';
      await this.persistSession();
    }
  }

  async resume(): Promise<void> {
    if (this.state.status === 'paused') {
      this.state.status = 'running';
      await this.persistSession();
      await this.runStep();
    }
  }

  async stop(): Promise<void> {
    this.state.status = 'idle';
    this.state.pendingActions = [];
    this.state.requiresApproval = false;
    await this.persistSession();
  }

  private updateTelemetry(): void {
    const telemetry = this.contextManager.getTelemetryMetrics();
    this.state.tokenMetrics = telemetry;
  }

  private async getTabUrl(tabId: number): Promise<string> {
    if (typeof chrome !== 'undefined' && chrome.tabs?.get) {
      try {
        const tab = await chrome.tabs.get(tabId);
        return tab.url ?? '';
      } catch {
        return '';
      }
    }
    return '';
  }

  private async queryTabDistillation(tabId: number): Promise<string> {
    if (typeof chrome !== 'undefined' && chrome.tabs?.sendMessage) {
      try {
        const res = await chrome.tabs.sendMessage(tabId, { type: 'DISTILL_VIEWPORT' });
        if (res && typeof res.text === 'string') {
          return res.text;
        }
      } catch (err) {
        console.warn('[AgentStateMachine] Content script message failed:', err);
      }
    }
    return '(Simulated initial viewport DOM)';
  }

  private async queryTabDelta(tabId: number): Promise<string> {
    if (typeof chrome !== 'undefined' && chrome.tabs?.sendMessage) {
      try {
        const res = await chrome.tabs.sendMessage(tabId, { type: 'GET_DELTA' });
        if (res && typeof res.text === 'string') {
          return res.text;
        }
      } catch (err) {
        console.warn('[AgentStateMachine] Content script delta failed:', err);
      }
    }
    return '[DELTA]\nNO CHANGES';
  }

  private async sendActionsToTab(tabId: number, actions: MacroAction[]): Promise<MacroExecutionResult> {
    if (typeof chrome !== 'undefined' && chrome.tabs?.sendMessage) {
      try {
        const res = (await chrome.tabs.sendMessage(tabId, {
          type: 'EXECUTE_MACRO',
          actions,
        })) as MacroExecutionResult | undefined;

        if (res) return res;
      } catch (err) {
        console.warn('[AgentStateMachine] Macro execution message failed:', err);
      }
    }

    return {
      totalActions: actions.length,
      executedActions: actions.length,
      abortedEarly: false,
      executedTraces: actions.map((act) => ({
        action: act,
        timestamp: Date.now(),
        success: true,
      })),
    };
  }
}
