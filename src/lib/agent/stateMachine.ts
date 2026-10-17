import {
  AgentSessionState,
  AgentStatus,
  TokenMetrics,
} from './types';
import { LLMRouter } from '../llm/router';
import { ByteStableContextManager } from '../llm/contextManager';
import { MacroAction } from '../llm/types';
import { ActionTrace, MacroExecutionResult } from '../executor/macroExecutor';

const DEFAULT_MAX_STEPS = 25;
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
  private lastKnownUrl = '';
  private actionHistorySignatures: string[] = [];
  private emptyActionCount = 0;

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
    let targetTabId = tabId;

    // Automatic tab resolution fallback if tabId is missing or 0
    if (targetTabId <= 0 && typeof chrome !== 'undefined' && chrome.tabs?.query) {
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (activeTab?.id) {
          targetTabId = activeTab.id;
        } else {
          const allTabs = await chrome.tabs.query({ active: true });
          if (allTabs[0]?.id) targetTabId = allTabs[0].id;
        }
      } catch (err) {
        console.warn('[AgentStateMachine] Tab resolution fallback failed:', err);
      }
    }

    if (targetTabId <= 0 && typeof chrome !== 'undefined' && chrome.tabs) {
      this.state = {
        ...this.getInitialState(),
        status: 'error',
        goal,
        tabId: 0,
        error: 'No active browser tab found. Please make sure a web page is open and try again.',
      };
      await this.persistSession();
      return;
    }

    this.lastKnownUrl = '';
    this.actionHistorySignatures = [];
    this.emptyActionCount = 0;

    this.state = {
      ...this.getInitialState(),
      status: 'running',
      goal,
      tabId: targetTabId,
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
        this.lastKnownUrl = await this.getTabUrl(this.state.tabId);

        // 2. CHECK SKILL CACHE: Deterministic 0-token check
        if (this.hooks.checkSkillCache) {
          const tabUrl = this.lastKnownUrl;
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
        // Steps 2..N: Wait for navigation or dynamic page mutations to settle
        const previousUrl = this.lastKnownUrl;
        const currentUrl = await this.waitForTabSettled(this.state.tabId, previousUrl);
        const didNavigate = Boolean(currentUrl && previousUrl && currentUrl !== previousUrl);
        this.lastKnownUrl = currentUrl;

        let stepObs = '';
        if (didNavigate) {
          // If page navigated to a new URL, a fresh distillation is mandatory so Vision AI is never blind
          const freshDom = await this.queryTabDistillation(this.state.tabId);
          stepObs = `ACTION RESULT: Previous action executed. Page navigated to: ${currentUrl}\nCURRENT VIEWPORT DOM:\n${freshDom}`;
        } else {
          // Check for DOM mutations
          const deltaResult = await this.queryTabDelta(this.state.tabId);
          const hasNoDelta = deltaResult.includes('NO CHANGES');

          if (hasNoDelta) {
            // If delta has no changes, provide the fresh distilled viewport so agent has full visibility
            const freshDom = await this.queryTabDistillation(this.state.tabId);
            stepObs = `CURRENT PAGE: ${currentUrl || 'Current Tab'}\nCURRENT VIEWPORT DOM:\n${freshDom}`;
          } else {
            stepObs = `CURRENT PAGE: ${currentUrl || 'Current Tab'}\n${deltaResult}`;
          }
        }

        // Anti-Stall Loop Note: If agent repeated the same action with no page change
        if (this.actionHistorySignatures.length >= 2) {
          const lastSig = this.actionHistorySignatures[this.actionHistorySignatures.length - 1];
          const prevSig = this.actionHistorySignatures[this.actionHistorySignatures.length - 2];
          if (lastSig === prevSig && !didNavigate) {
            stepObs += `\n[SYSTEM NOTE: Previous action "${lastSig}" produced no page progression. Avoid repeating it. If the page shows the desired result, set "complete": true with "actions": []. Otherwise try another element or scroll.]`;
          }
        }

        observationText = stepObs;
        this.contextManager.appendStepObservation(this.state.stepNumber, observationText);
      }

      this.updateTelemetry();

      // 3. ROUTE LLM: Query multi-provider tiered router
      const messages = this.contextManager.getMessages();
      let {
        response: plan,
        activeTier,
        provider,
        modelUsed,
        fallbackNotice,
      } = await this.router.executeStep(messages, 1);

      // Step 1 Action-First Guardrail: Prevent chatbot refusals or disclaimers on action goals
      const isInfo = this.isPureInformationQuery(this.state.goal);
      const isRefusal = this.hasRefusalIndication(plan.thought);
      const isFinishedWithAnswer = isInfo && this.hasCompletionIndication(plan.thought) && !isRefusal;

      if (this.state.stepNumber === 1 && plan.actions.length === 0 && !isFinishedWithAnswer) {
        console.warn(
          '[Vision AI] Step 1 action guardrail triggered: Model returned 0 actions without completion. Sending action mandate nudge.'
        );
        const actionNudge = `[SYSTEM ACTION MANDATE]: You returned 0 actions. As an autonomous browser agent, you must interact with the page. Do not output disclaimers or conversational lectures. Take the immediate next concrete step toward the goal (e.g. click the first module, lesson, start link, or accordion item visible in the viewport DOM). Output valid JSON with at least 1 action.`;
        this.contextManager.appendStepObservation(1, actionNudge);

        try {
          const nudgeResult = await this.router.executeStep(this.contextManager.getMessages(), 1);
          if (nudgeResult.response.actions.length > 0) {
            plan = nudgeResult.response;
            activeTier = nudgeResult.activeTier;
            provider = nudgeResult.provider;
            modelUsed = nudgeResult.modelUsed;
            if (nudgeResult.fallbackNotice) {
              fallbackNotice = nudgeResult.fallbackNotice;
            }
          }
        } catch (nudgeErr) {
          console.warn('[Vision AI] Action nudge execution failed:', nudgeErr);
        }
      }

      this.state.activeProvider = provider;
      this.state.activeTier = activeTier;
      this.state.activeModel = modelUsed;
      if (fallbackNotice) {
        this.state.fallbackNotice = fallbackNotice;
      }
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

    // Track action signature for loop detection
    const actionSig = actions.map((a) => `${a.type}:${a.id ?? ''}:${a.value ?? ''}`).join(';');
    if (actionSig) {
      this.actionHistorySignatures.push(actionSig);
    }

    if (actions.length === 0) {
      this.emptyActionCount += 1;
    } else {
      this.emptyActionCount = 0;
    }

    if (actions.length > 0) {
      const execResult = await this.sendActionsToTab(this.state.tabId, actions);
      if (execResult && Array.isArray(execResult.executedTraces)) {
        this.state.completedTraces.push(...execResult.executedTraces);
      }

      if (execResult.abortedEarly) {
        this.router.recordFailure();
      } else {
        this.router.resetFailures();
      }
    }

    // Determine completion with intelligent heuristics
    let shouldComplete = isPlanComplete;

    // Refusals are NEVER successful completions
    if (this.hasRefusalIndication(this.state.currentThought)) {
      shouldComplete = false;
    }

    // If model repeatedly returns 0 actions with refusal, halt with error rather than burning 25 steps
    if (actions.length === 0 && this.emptyActionCount >= 2 && this.hasRefusalIndication(this.state.currentThought)) {
      this.state.status = 'error';
      this.state.error = this.state.currentThought;
      await this.persistSession();
      return;
    }

    // Special check for Step 1 action goals: 0 actions on Step 1 is NOT completion unless answering an informational query
    const isActionGoal = !this.isPureInformationQuery(this.state.goal);
    if (this.state.stepNumber === 1 && actions.length === 0 && isActionGoal) {
      shouldComplete = false;
    }

    // Heuristic 1: If 0 actions were returned and thought implies the goal is achieved
    if (!shouldComplete && actions.length === 0) {
      if (
        !this.hasRefusalIndication(this.state.currentThought) &&
        (this.hasCompletionIndication(this.state.currentThought) || this.emptyActionCount >= 2)
      ) {
        shouldComplete = true;
      }
    }

    // Heuristic 2: Anti-Stall Loop Breaker - if identical action was repeated 3 times with no progress
    if (!shouldComplete && this.actionHistorySignatures.length >= 3) {
      const len = this.actionHistorySignatures.length;
      if (
        this.actionHistorySignatures[len - 1] === this.actionHistorySignatures[len - 2] &&
        this.actionHistorySignatures[len - 2] === this.actionHistorySignatures[len - 3]
      ) {
        shouldComplete = true;
        this.state.currentThought = `${this.state.currentThought} (Autonomous loop breaker: task concluded as page reached a stable state).`;
      }
    }

    // Append plan to context manager history
    this.contextManager.appendAssistantPlan({
      thought: this.state.currentThought,
      actions,
      complete: shouldComplete,
    });

    if (shouldComplete) {
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

  private hasRefusalIndication(thought: string): boolean {
    const refusalPatterns = [
      /\b(cannot|can't)\b/i,
      /\bunable to\b/i,
      /\bnot possible\b/i,
      /\bbypass(ing)?\b/i,
      /\bviolat(e|ing)\b/i,
      /\bpolicy\b/i,
      /\bas an ai\b/i,
      /\bdisclaimer\b/i,
    ];
    return refusalPatterns.some((p) => p.test(thought || ''));
  }

  private hasCompletionIndication(thought: string): boolean {
    const lower = (thought || '').toLowerCase();
    const completionKeywords = [
      'done',
      'complete',
      'finished',
      'found',
      'here is',
      'the answer is',
      'result:',
      'success',
      'born in',
      'located at',
    ];
    return completionKeywords.some((kw) => lower.includes(kw));
  }

  private isPureInformationQuery(goal: string): boolean {
    const trimmed = (goal || '').trim().toLowerCase();
    const infoPatterns = [
      /^what\b/,
      /^who\b/,
      /^which\b/,
      /^when\b/,
      /^where\b/,
      /^why\b/,
      /^how\b/,
      /^find\b/,
      /^search\b/,
      /^lookup\b/,
      /^look up\b/,
      /^check\b/,
      /^tell me\b/,
      /^summarize\b/,
      /^explain\b/,
      /^is there\b/,
      /^are there\b/,
      /^does\b/,
      /^can you read\b/,
      /^get the\b/,
      /^read\b/,
    ];
    return infoPatterns.some((pattern) => pattern.test(trimmed));
  }

  private async waitForTabSettled(tabId: number, previousUrl: string): Promise<string> {
    if (typeof chrome === 'undefined' || !chrome.tabs?.get || tabId <= 0) {
      return previousUrl;
    }

    const startTime = Date.now();
    let currentUrl = previousUrl;

    // Wait up to 3000ms if tab is actively loading/navigating
    while (Date.now() - startTime < 3000) {
      try {
        const tab = await chrome.tabs.get(tabId);
        currentUrl = tab.url || currentUrl;
        if (!tab.status || tab.status === 'complete') {
          break;
        }
      } catch {
        break;
      }
      await new Promise((r) => setTimeout(r, 80));
    }

    // Brief settling time for DOM rendering / dynamic scripts
    await new Promise((r) => setTimeout(r, 60));

    try {
      const finalTab = await chrome.tabs.get(tabId);
      return finalTab.url || currentUrl;
    } catch {
      return currentUrl;
    }
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
    if (typeof chrome === 'undefined' || !chrome.tabs) {
      return '(Simulated initial viewport DOM)';
    }

    // 1. Validate tab URL & guard against Chrome internal pages
    let tabUrl = '';
    try {
      if (chrome.tabs?.get && tabId > 0) {
        const tab = await chrome.tabs.get(tabId);
        tabUrl = tab.url || '';
      }
    } catch (err) {
      console.warn('[AgentStateMachine] Failed to get tab info:', err);
    }

    if (tabUrl) {
      const lowerUrl = tabUrl.toLowerCase();
      if (
        lowerUrl.startsWith('chrome://') ||
        lowerUrl.startsWith('chrome-extension://') ||
        lowerUrl.startsWith('edge://') ||
        lowerUrl.startsWith('devtools://') ||
        lowerUrl.startsWith('view-source:')
      ) {
        throw new Error(
          `Vision AI cannot run on Chrome internal page (${tabUrl}). Please open or switch to any website (e.g. https://www.google.com or https://wikipedia.org) and try again.`
        );
      }
    }

    // 2. Direct messaging to content script
    if (chrome.tabs?.sendMessage && tabId > 0) {
      try {
        const res = await chrome.tabs.sendMessage(tabId, { type: 'DISTILL_VIEWPORT' });
        if (res && typeof res.text === 'string' && res.text.trim().length > 0) {
          return res.text;
        }
      } catch (err) {
        console.log('[AgentStateMachine] Content script message error, trying script injection:', err);
      }

      // 3. Dynamic content script injection for pre-existing tabs
      if (chrome.scripting?.executeScript) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content-scripts/content.js'],
          });
          await new Promise((r) => setTimeout(r, 200));
          const retryRes = await chrome.tabs.sendMessage(tabId, { type: 'DISTILL_VIEWPORT' });
          if (retryRes && typeof retryRes.text === 'string' && retryRes.text.trim().length > 0) {
            return retryRes.text;
          }
        } catch (injectErr) {
          console.warn('[AgentStateMachine] Content script injection failed, falling back to in-page evaluation:', injectErr);
        }

        // 4. In-page direct execution fallback
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
              const doc = document;
              const w = window;
              const pageTitle = doc.title || '';
              const pageUrl = w.location.href || '';
              const lines: string[] = [`PAGE: ${pageTitle || '(Untitled)'} [${pageUrl}]`];

              const winAny = w as any;
              winAny.__vision_ai_registry__ = winAny.__vision_ai_registry__ || new Map<number, HTMLElement>();
              const reg: Map<number, HTMLElement> = winAny.__vision_ai_registry__;
              reg.clear();

              const candidateTags = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'H1', 'H2', 'NAV', 'FORM']);
              const candidateRoles = new Set(['button', 'link', 'checkbox', 'menuitem', 'tab', 'combobox', 'searchbox', 'textbox']);

              const allEls = doc.body ? Array.from(doc.body.querySelectorAll<HTMLElement>('*')) : [];
              let count = 0;
              let idCounter = 1;

              for (let i = 0; i < allEls.length && count < 40; i++) {
                const el = allEls[i];
                const tag = el.tagName.toUpperCase();
                const role = (el.getAttribute('role') || '').toLowerCase();

                const isCandidate =
                  candidateTags.has(tag) ||
                  candidateRoles.has(role) ||
                  el.getAttribute('contenteditable') === 'true' ||
                  (el.hasAttribute('tabindex') && parseInt(el.getAttribute('tabindex') || '-1', 10) >= 0);

                if (!isCandidate) continue;

                if (typeof (el as any).checkVisibility === 'function') {
                  if (!(el as any).checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
                    continue;
                  }
                } else {
                  if (el.style.display === 'none' || el.style.visibility === 'hidden') continue;
                }

                const rect = el.getBoundingClientRect();
                if (rect.width > 0 || rect.height > 0) {
                  if (rect.bottom < -50 || rect.top > w.innerHeight + 50) continue;
                }

                const id = idCounter++;
                reg.set(id, el);

                const attrs: string[] = [];
                const type = el.getAttribute('type');
                if (type) attrs.push(`type="${type}"`);
                const placeholder = el.getAttribute('placeholder');
                if (placeholder) attrs.push(`placeholder="${placeholder.slice(0, 30)}"`);
                const aria = el.getAttribute('aria-label');
                if (aria) attrs.push(`label="${aria.slice(0, 25)}"`);
                const name = el.getAttribute('name');
                if (name) attrs.push(`name="${name}"`);
                if (el.hasAttribute('disabled')) attrs.push('disabled');

                if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                  if (el.value) attrs.push(`value="${el.value.slice(0, 20)}"`);
                }

                const attrStr = attrs.length > 0 ? ` ${attrs.join(' ')}` : '';
                const text = tag !== 'INPUT' ? (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30) : '';

                if (text) {
                  lines.push(`[${id}] <${tag.toLowerCase()}${attrStr}>${text}</${tag.toLowerCase()}>`);
                } else {
                  lines.push(`[${id}] <${tag.toLowerCase()}${attrStr} />`);
                }
                count++;
              }

              if (count === 0 && doc.body) {
                const summary = (doc.body.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 300);
                lines.push(`(No interactive elements in viewport. Page text summary: "${summary}")`);
              }

              return lines.join('\n');
            },
          });

          if (results && results[0]?.result && typeof results[0].result === 'string') {
            return results[0].result;
          }
        } catch (inlineErr) {
          console.warn('[AgentStateMachine] In-page distillation fallback error:', inlineErr);
        }
      }
    }

    return '(Simulated initial viewport DOM)';
  }

  private async queryTabDelta(tabId: number): Promise<string> {
    if (typeof chrome !== 'undefined' && chrome.tabs?.sendMessage && tabId > 0) {
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
    if (typeof chrome !== 'undefined' && tabId > 0) {
      if (chrome.tabs?.sendMessage) {
        try {
          const res = (await chrome.tabs.sendMessage(tabId, {
            type: 'EXECUTE_MACRO',
            actions,
          })) as Partial<MacroExecutionResult> | undefined;

          if (res) {
            return {
              totalActions: res.totalActions ?? actions.length,
              executedActions: res.executedActions ?? actions.length,
              abortedEarly: res.abortedEarly ?? false,
              abortReason: res.abortReason,
              executedTraces: Array.isArray(res.executedTraces)
                ? res.executedTraces
                : actions.map((act) => ({ action: act, timestamp: Date.now(), success: true })),
            };
          }
        } catch (err) {
          console.warn('[AgentStateMachine] Content script macro execution failed, attempting in-page execution:', err);
        }
      }

      // In-page execution fallback via chrome.scripting.executeScript
      if (chrome.scripting?.executeScript) {
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: (actionsToExec) => {
              const winAny = window as any;
              const reg: Map<number, HTMLElement> | undefined = winAny.__vision_ai_registry__;
              const traces: any[] = [];

              let lastTargetEl: HTMLElement | null = null;

              for (const act of actionsToExec) {
                let targetEl: HTMLElement | null = null;
                if (act.id !== undefined && reg) {
                  targetEl = reg.get(act.id) || null;
                } else if (act.type === 'press' && lastTargetEl && lastTargetEl.isConnected) {
                  targetEl = lastTargetEl;
                }

                if (targetEl) {
                  lastTargetEl = targetEl;
                }

                try {
                  if (act.type === 'click' && targetEl) {
                    try {
                      targetEl.scrollIntoView({ block: 'center', inline: 'center' });
                    } catch {}
                    targetEl.focus();
                    targetEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                    targetEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                    targetEl.click();
                  } else if (act.type === 'fill' && targetEl) {
                    try {
                      targetEl.scrollIntoView({ block: 'center', inline: 'center' });
                    } catch {}
                    targetEl.focus();
                    if (targetEl instanceof HTMLInputElement || targetEl instanceof HTMLTextAreaElement) {
                      const proto =
                        targetEl instanceof HTMLInputElement
                          ? HTMLInputElement.prototype
                          : HTMLTextAreaElement.prototype;
                      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
                      if (setter) setter.call(targetEl, act.value || '');
                      else targetEl.value = act.value || '';
                      targetEl.dispatchEvent(new Event('input', { bubbles: true }));
                      targetEl.dispatchEvent(new Event('change', { bubbles: true }));
                    } else {
                      targetEl.textContent = act.value || '';
                      targetEl.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                  } else if (act.type === 'press') {
                    const key = act.value || 'Enter';
                    const keyCode = key === 'Enter' ? 13 : key === 'Tab' ? 9 : key === 'Escape' ? 27 : key === 'Backspace' ? 8 : 0;
                    const active = targetEl || lastTargetEl || document.activeElement || document.body;

                    const eventInit = { key, code: key, bubbles: true, cancelable: true, composed: true };
                    const kd = new KeyboardEvent('keydown', eventInit);
                    Object.defineProperty(kd, 'keyCode', { get: () => keyCode });
                    Object.defineProperty(kd, 'which', { get: () => keyCode });
                    active.dispatchEvent(kd);

                    const kp = new KeyboardEvent('keypress', eventInit);
                    Object.defineProperty(kp, 'keyCode', { get: () => keyCode });
                    Object.defineProperty(kp, 'which', { get: () => keyCode });
                    active.dispatchEvent(kp);

                    const ku = new KeyboardEvent('keyup', eventInit);
                    Object.defineProperty(ku, 'keyCode', { get: () => keyCode });
                    Object.defineProperty(ku, 'which', { get: () => keyCode });
                    active.dispatchEvent(ku);

                    if (key === 'Enter') {
                      const form = active instanceof HTMLInputElement ? active.form : (active.closest ? active.closest('form') : null);
                      if (form) {
                        try {
                          form.requestSubmit ? form.requestSubmit() : form.submit();
                        } catch {}
                      }
                    }
                  } else if (act.type === 'scroll') {
                    window.scrollBy({ top: act.value === 'up' ? -window.innerHeight * 0.7 : window.innerHeight * 0.7, behavior: 'smooth' });
                  }
                  traces.push({ action: act, timestamp: Date.now(), success: true });
                } catch (actionErr) {
                  traces.push({ action: act, timestamp: Date.now(), success: false, error: String(actionErr) });
                }
              }

              return {
                totalActions: actionsToExec.length,
                executedActions: traces.filter((t) => t.success).length,
                abortedEarly: false,
                executedTraces: traces,
              };
            },
            args: [actions],
          });

          if (results && results[0]?.result) {
            const rawRes = results[0].result as MacroExecutionResult;
            return {
              totalActions: rawRes.totalActions ?? actions.length,
              executedActions: rawRes.executedActions ?? actions.length,
              abortedEarly: rawRes.abortedEarly ?? false,
              abortReason: rawRes.abortReason,
              executedTraces: Array.isArray(rawRes.executedTraces)
                ? rawRes.executedTraces
                : actions.map((act) => ({ action: act, timestamp: Date.now(), success: true })),
            };
          }
        } catch (execErr) {
          console.warn('[AgentStateMachine] In-page action execution error:', execErr);
        }
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
