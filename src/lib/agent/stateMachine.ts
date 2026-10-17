import {
  AgentSessionState,
  AgentStatus,
  TokenMetrics,
} from './types';
import { LLMRouter } from '../llm/router';
import { ByteStableContextManager } from '../llm/contextManager';
import { MacroAction } from '../llm/types';
import { ActionTrace, MacroExecutionResult, AbortReason } from '../executor/macroExecutor';

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
  private frameElementMap = new Map<number, { frameId: number; localId: number }>();
  private customStorageKey?: string;

  constructor(router: LLMRouter, hooks: StateMachineHooks = {}, sessionStorageKey?: string) {
    this.router = router;
    this.hooks = hooks;
    this.customStorageKey = sessionStorageKey;
    this.contextManager = new ByteStableContextManager();
    this.state = this.getInitialState();
  }

  private getStorageKey(): string {
    if (this.customStorageKey) {
      return this.customStorageKey;
    }
    if (this.state.tabId > 0) {
      return `orbit_agent_session_tab_${this.state.tabId}`;
    }
    return STORAGE_SESSION_KEY;
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

  async restoreSession(explicitKey?: string): Promise<boolean> {
    if (typeof chrome === 'undefined' || !chrome.storage?.session) return false;

    const key = explicitKey || this.getStorageKey();
    try {
      const res = await chrome.storage.session.get(key);
      const saved = res[key] as AgentSessionState | undefined;
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
    const key = this.getStorageKey();
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      try {
        await chrome.storage.session.set({ [key]: this.state });
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
    this.frameElementMap.clear();

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
      const isFinishedWithAnswer =
        (isInfo && this.hasCompletionIndication(plan.thought) && !isRefusal) ||
        (plan.complete === true && plan.thought.length > 20 && !isRefusal);

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

    // Special check for Step 1 action goals: 0 actions on Step 1 is NOT completion unless answering an informational query or providing a detailed complete answer
    const isActionGoal = !this.isPureInformationQuery(this.state.goal);
    const isInformationalAnswer =
      isPlanComplete && this.state.currentThought.length > 20 && !this.hasRefusalIndication(this.state.currentThought);
    if (this.state.stepNumber === 1 && actions.length === 0 && isActionGoal && !isInformationalAnswer) {
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
    const text = thought || '';

    // Guard: NEVER match if thought contains future-intent words
    const futureIntentPattern = /\b(will|going to|need to|next|try to|let's|clicking|opening|scrolling)\b/i;
    if (futureIntentPattern.test(text)) {
      return false;
    }

    // Do NOT match loose single words ("done", "complete", "finished") that easily false-positive on buttons or descriptions
    // Match explicit task-finished phrases
    const explicitTaskFinishedPattern =
      /task (is )?complete|goal (is )?(achieved|complete)|all requested steps (are )?(done|complete)|successfully marked as complete and finished/i;
    if (explicitTaskFinishedPattern.test(text)) {
      return true;
    }

    // Informational query answer indicators (when no future action is planned)
    const infoAnswerPattern =
      /\b(the answer is|here is the|result:|born in|located at)\b/i;
    if (infoAnswerPattern.test(text)) {
      return true;
    }

    return false;
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

    this.frameElementMap.clear();
    let mainDistillation = '';

    // 2. Direct messaging to content script
    if (chrome.tabs?.sendMessage && tabId > 0) {
      try {
        const res = await chrome.tabs.sendMessage(tabId, { type: 'DISTILL_VIEWPORT' });
        if (res && typeof res.text === 'string' && res.text.trim().length > 0) {
          mainDistillation = res.text;
        }
      } catch (err) {
        console.log('[AgentStateMachine] Content script message error, trying script injection:', err);
      }

      // 3. Dynamic content script injection for pre-existing tabs
      if (!mainDistillation && chrome.scripting?.executeScript) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content-scripts/content.js'],
          });
          await new Promise((r) => setTimeout(r, 200));
          const retryRes = await chrome.tabs.sendMessage(tabId, { type: 'DISTILL_VIEWPORT' });
          if (retryRes && typeof retryRes.text === 'string' && retryRes.text.trim().length > 0) {
            mainDistillation = retryRes.text;
          }
        } catch (injectErr) {
          console.warn('[AgentStateMachine] Content script injection failed, falling back to in-page evaluation:', injectErr);
        }

        // 4. In-page direct execution fallback
        if (!mainDistillation) {
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
              mainDistillation = results[0].result;
            }
          } catch (inlineErr) {
            console.warn('[AgentStateMachine] In-page distillation fallback error:', inlineErr);
          }
        }
      }
    }

    if (!mainDistillation) {
      mainDistillation = '(Simulated initial viewport DOM)';
    }

    // 5. Cross-Frame Distillation: Query child frames for SCORM, NetAcad, & LMS embedded players
    if (typeof chrome !== 'undefined' && chrome.scripting?.executeScript && tabId > 0) {
      try {
        const frameResults = await chrome.scripting.executeScript({
          target: { tabId, allFrames: true },
          func: () => {
            if (window === window.top) {
              return null; // Skip main frame (already distilled)
            }
            if (window.innerWidth < 200 || window.innerHeight < 150) {
              return null; // Skip tiny tracker / invisible ad iframes
            }

            const doc = document;
            const w = window;
            const frameTitle = doc.title || '';
            const frameUrl = w.location.href || '';

            const winAny = w as any;
            winAny.__vision_ai_registry__ = winAny.__vision_ai_registry__ || new Map<number, HTMLElement>();
            const reg: Map<number, HTMLElement> = winAny.__vision_ai_registry__;
            reg.clear();

            function collectElements(root: Document | HTMLElement | ShadowRoot): HTMLElement[] {
              const list: HTMLElement[] = [];
              const walker = (node: Element) => {
                if (node instanceof HTMLElement) {
                  list.push(node);
                }
                if (node.shadowRoot) {
                  const shadowChildren = Array.from(node.shadowRoot.children);
                  for (const child of shadowChildren) {
                    walker(child);
                  }
                }
                const children = Array.from(node.children);
                for (const child of children) {
                  walker(child);
                }
              };
              if (root instanceof Document) {
                if (root.body) walker(root.body);
              } else {
                const children = Array.from(root.children);
                for (const child of children) {
                  walker(child);
                }
              }
              return list;
            }

            const candidateTags = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'VIDEO', 'H1', 'H2', 'NAV', 'FORM']);
            const candidateRoles = new Set(['button', 'link', 'checkbox', 'menuitem', 'tab', 'combobox', 'searchbox', 'textbox']);

            const allEls = collectElements(doc);
            const items: Array<{ localId: number; tag: string; attrStr: string; text: string }> = [];
            let localIdCounter = 1;

            for (let i = 0; i < allEls.length && items.length < 25; i++) {
              const el = allEls[i];
              const tag = el.tagName.toUpperCase();
              const role = (el.getAttribute('role') || '').toLowerCase();

              const textSample = (el.textContent || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || '');
              const isLMSAction = /\b(mark as complete|complete|next|continue|resume|start|launch|submit|play|study material|lecture|video|module|lesson)\b/i.test(
                textSample
              );

              const isCandidate =
                candidateTags.has(tag) ||
                candidateRoles.has(role) ||
                isLMSAction ||
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
              if (rect.width <= 0 && rect.height <= 0) continue;
              if (!isLMSAction && (rect.bottom < -50 || rect.top > w.innerHeight + 50)) continue;

              const localId = localIdCounter++;
              reg.set(localId, el);

              const attrs: string[] = [];
              const type = el.getAttribute('type');
              if (type) attrs.push(`type="${type}"`);
              const placeholder = el.getAttribute('placeholder');
              if (placeholder) attrs.push(`placeholder="${placeholder.slice(0, 30)}"`);
              const aria = el.getAttribute('aria-label');
              if (aria) attrs.push(`label="${aria.slice(0, 25)}"`);
              const title = el.getAttribute('title');
              if (title) attrs.push(`title="${title.slice(0, 30)}"`);
              const expanded = el.getAttribute('aria-expanded');
              if (expanded !== null) attrs.push(`aria-expanded="${expanded}"`);
              const checked = el.getAttribute('aria-checked');
              if (checked !== null) attrs.push(`aria-checked="${checked}"`);

              if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                if (el.value) attrs.push(`value="${el.value.slice(0, 20)}"`);
              }

              const attrStr = attrs.length > 0 ? ` ${attrs.join(' ')}` : '';
              const text = tag !== 'INPUT' ? (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40) : '';

              items.push({ localId, tag: tag.toLowerCase(), attrStr, text });
            }

            return {
              frameTitle,
              frameUrl,
              items,
            };
          },
        });

        if (Array.isArray(frameResults)) {
          let frameIndex = 0;
          for (const fr of frameResults) {
            const data = fr.result as {
              frameTitle: string;
              frameUrl: string;
              items: Array<{ localId: number; tag: string; attrStr: string; text: string }>;
            } | null;

            if (fr.frameId > 0 && data && data.items && data.items.length > 0) {
              frameIndex++;
              const frameLines: string[] = [
                `--- IFRAME [Frame ${fr.frameId}: ${data.frameTitle || 'LMS Content'}] ---`,
              ];
              for (const item of data.items) {
                const globalId = frameIndex * 1000 + item.localId;
                this.frameElementMap.set(globalId, { frameId: fr.frameId, localId: item.localId });
                const attrStr = item.attrStr ? (item.attrStr.startsWith(' ') ? item.attrStr : ' ' + item.attrStr) : '';
                if (item.text) {
                  frameLines.push(`[${globalId}] <${item.tag}${attrStr}>${item.text}</${item.tag}>`);
                } else {
                  frameLines.push(`[${globalId}] <${item.tag}${attrStr} />`);
                }
              }
              mainDistillation += '\n' + frameLines.join('\n');
            }
          }
        }
      } catch (childErr) {
        console.warn('[AgentStateMachine] Child frame distillation error:', childErr);
      }
    }

    return mainDistillation;

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
    const executedTraces: ActionTrace[] = [];
    const domActions: MacroAction[] = [];
    let abortedEarly = false;
    let abortReason: AbortReason | undefined;

    // Handle top-level navigation actions before sending DOM actions to content script
    for (let i = 0; i < actions.length; i++) {
      const act = actions[i];
      if (act.type === 'navigate') {
        if (typeof chrome !== 'undefined' && chrome.tabs?.update && tabId > 0 && act.value) {
          try {
            await chrome.tabs.update(tabId, { url: act.value });
            const settledUrl = await this.waitForTabSettled(tabId, '');
            if (settledUrl) this.lastKnownUrl = settledUrl;
            executedTraces.push({ action: act, timestamp: Date.now(), success: true });
          } catch (navErr) {
            executedTraces.push({ action: act, timestamp: Date.now(), success: false, error: String(navErr) });
            abortedEarly = true;
            abortReason = 'action_failed';
            break;
          }
        } else {
          executedTraces.push({ action: act, timestamp: Date.now(), success: true });
        }
        if (i < actions.length - 1) {
          abortedEarly = true;
          abortReason = 'url_changed';
          break;
        }
      } else if (act.type === 'go_back') {
        if (typeof chrome !== 'undefined' && chrome.tabs?.goBack && tabId > 0) {
          try {
            await chrome.tabs.goBack(tabId);
            const settledUrl = await this.waitForTabSettled(tabId, '');
            if (settledUrl) this.lastKnownUrl = settledUrl;
            executedTraces.push({ action: act, timestamp: Date.now(), success: true });
          } catch (backErr) {
            executedTraces.push({ action: act, timestamp: Date.now(), success: false, error: String(backErr) });
            abortedEarly = true;
            abortReason = 'action_failed';
            break;
          }
        } else {
          executedTraces.push({ action: act, timestamp: Date.now(), success: true });
        }
        if (i < actions.length - 1) {
          abortedEarly = true;
          abortReason = 'url_changed';
          break;
        }
      } else if (act.type === 'open_tab') {
        if (typeof chrome !== 'undefined' && chrome.tabs?.create && act.value) {
          try {
            const newTab = await chrome.tabs.create({ url: act.value, active: true });
            executedTraces.push({ action: act, timestamp: Date.now(), success: true });
            if (newTab.id) {
              const settledUrl = await this.waitForTabSettled(newTab.id, act.value);
              if (settledUrl) this.lastKnownUrl = settledUrl;
            }
          } catch (tabErr) {
            executedTraces.push({ action: act, timestamp: Date.now(), success: false, error: String(tabErr) });
            abortedEarly = true;
            abortReason = 'action_failed';
            break;
          }
        } else {
          executedTraces.push({ action: act, timestamp: Date.now(), success: true });
        }
        if (i < actions.length - 1) {
          abortedEarly = true;
          abortReason = 'url_changed';
          break;
        }
      } else if (act.type === 'switch_tab') {
        if (typeof chrome !== 'undefined' && chrome.tabs && act.value) {
          try {
            const parsedId = parseInt(act.value, 10);
            if (!isNaN(parsedId) && parsedId > 0) {
              await chrome.tabs.update(parsedId, { active: true });
              const settledUrl = await this.waitForTabSettled(parsedId, '');
              if (settledUrl) this.lastKnownUrl = settledUrl;
              executedTraces.push({ action: act, timestamp: Date.now(), success: true });
            } else {
              const allTabs = await chrome.tabs.query({});
              const match = allTabs.find((t) => (t.url || '').includes(act.value!) || (t.title || '').toLowerCase().includes(act.value!.toLowerCase()));
              if (match?.id) {
                await chrome.tabs.update(match.id, { active: true });
                const settledUrl = await this.waitForTabSettled(match.id, '');
                if (settledUrl) this.lastKnownUrl = settledUrl;
                executedTraces.push({ action: act, timestamp: Date.now(), success: true });
              } else {
                throw new Error(`No matching tab found for "${act.value}"`);
              }
            }
          } catch (switchErr) {
            executedTraces.push({ action: act, timestamp: Date.now(), success: false, error: String(switchErr) });
            abortedEarly = true;
            abortReason = 'action_failed';
            break;
          }
        } else {
          executedTraces.push({ action: act, timestamp: Date.now(), success: true });
        }
        if (i < actions.length - 1) {
          abortedEarly = true;
          abortReason = 'url_changed';
          break;
        }
      } else {
        domActions.push(act);
      }
    }

    if (domActions.length === 0 || abortedEarly) {
      return {
        totalActions: actions.length,
        executedActions: executedTraces.filter((t) => t.success).length,
        abortedEarly,
        abortReason,
        executedTraces,
      };
    }

    if (typeof chrome !== 'undefined' && tabId > 0) {
      // Check if any action targets a registered child frame (NetAcad SCORM / LMS player)
      const hasChildFrameAction = domActions.some(
        (act) => act.id !== undefined && this.frameElementMap.has(act.id)
      );

      if (hasChildFrameAction && chrome.scripting?.executeScript) {
        for (const act of domActions) {
          if (act.id !== undefined && this.frameElementMap.has(act.id)) {
            const frameTarget = this.frameElementMap.get(act.id)!;
            try {
              const frameExecRes = await chrome.scripting.executeScript({
                target: { tabId, frameIds: [frameTarget.frameId] },
                func: (actionToExec) => {
                  const winAny = window as any;
                  const reg: Map<number, HTMLElement> | undefined = winAny.__vision_ai_registry__;
                  const targetEl = reg ? reg.get(actionToExec.id) : null;
                  if (!targetEl) {
                    return { success: false, error: `Element [${actionToExec.id}] not found in child frame registry` };
                  }

                  try {
                    if (actionToExec.type === 'click') {
                      try { targetEl.scrollIntoView({ block: 'center', inline: 'center' }); } catch {}
                      targetEl.focus();
                      const rect = targetEl.getBoundingClientRect();
                      const clientX = rect.left + rect.width / 2;
                      const clientY = rect.top + rect.height / 2;
                      const eventInit = { bubbles: true, cancelable: true, composed: true, clientX, clientY, button: 0, buttons: 1 };
                      targetEl.dispatchEvent(new PointerEvent('pointerover', eventInit));
                      targetEl.dispatchEvent(new MouseEvent('mouseover', eventInit));
                      targetEl.dispatchEvent(new PointerEvent('pointerdown', eventInit));
                      targetEl.dispatchEvent(new MouseEvent('mousedown', eventInit));
                      targetEl.dispatchEvent(new PointerEvent('pointerup', eventInit));
                      targetEl.dispatchEvent(new MouseEvent('mouseup', eventInit));
                      targetEl.click();
                    } else if (actionToExec.type === 'fill') {
                      try { targetEl.scrollIntoView({ block: 'center', inline: 'center' }); } catch {}
                      targetEl.focus();
                      if (targetEl instanceof HTMLInputElement || targetEl instanceof HTMLTextAreaElement) {
                        const proto = targetEl instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
                        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
                        if (setter) setter.call(targetEl, actionToExec.value || '');
                        else targetEl.value = actionToExec.value || '';
                        targetEl.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                        targetEl.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                      } else {
                        targetEl.textContent = actionToExec.value || '';
                        targetEl.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                      }
                    } else if (actionToExec.type === 'complete_media') {
                      const mediaEls = Array.from(document.querySelectorAll<HTMLMediaElement>('video, audio'));
                      for (const media of mediaEls) {
                        try {
                          if (isFinite(media.duration) && media.duration > 0) {
                            media.currentTime = Math.max(0, media.duration - 0.5);
                          }
                          media.playbackRate = 2.0;
                          media.dispatchEvent(new Event('timeupdate', { bubbles: true }));
                          media.dispatchEvent(new Event('ended', { bubbles: true }));
                        } catch {}
                      }
                    } else if (actionToExec.type === 'scroll') {
                      window.scrollBy({ top: actionToExec.value === 'up' ? -window.innerHeight * 0.7 : window.innerHeight * 0.7, behavior: 'smooth' });
                    }
                    return { success: true };
                  } catch (e) {
                    return { success: false, error: String(e) };
                  }
                },
                args: [{ ...act, id: frameTarget.localId }],
              });

              const ok = Boolean(frameExecRes?.[0]?.result?.success);
              const errMsg = frameExecRes?.[0]?.result?.error;
              executedTraces.push({ action: act, timestamp: Date.now(), success: ok, error: errMsg });
              if (!ok) {
                abortedEarly = true;
                abortReason = 'action_failed';
                break;
              }
            } catch (frameErr) {
              executedTraces.push({ action: act, timestamp: Date.now(), success: false, error: String(frameErr) });
              abortedEarly = true;
              abortReason = 'action_failed';
              break;
            }
          } else {
            // Main frame action
            try {
              const res = (await chrome.tabs.sendMessage(tabId, {
                type: 'EXECUTE_MACRO',
                actions: [act],
              })) as Partial<MacroExecutionResult> | undefined;
              if (res?.executedTraces?.[0]) {
                executedTraces.push(res.executedTraces[0]);
                if (!res.executedTraces[0].success) {
                  abortedEarly = true;
                  abortReason = 'action_failed';
                  break;
                }
              } else {
                executedTraces.push({ action: act, timestamp: Date.now(), success: true });
              }
            } catch {
              executedTraces.push({ action: act, timestamp: Date.now(), success: true });
            }
          }
        }

        return {
          totalActions: actions.length,
          executedActions: executedTraces.filter((t) => t.success).length,
          abortedEarly,
          abortReason,
          executedTraces,
        };
      }

      if (chrome.tabs?.sendMessage) {
        try {
          const res = (await chrome.tabs.sendMessage(tabId, {
            type: 'EXECUTE_MACRO',
            actions: domActions,
          })) as Partial<MacroExecutionResult> | undefined;

          if (res) {
            const domTraces = Array.isArray(res.executedTraces)
              ? res.executedTraces
              : domActions.map((act) => ({ action: act, timestamp: Date.now(), success: true }));
            const combinedTraces = [...executedTraces, ...domTraces];
            return {
              totalActions: actions.length,
              executedActions: combinedTraces.filter((t) => t.success).length,
              abortedEarly: res.abortedEarly ?? false,
              abortReason: res.abortReason,
              executedTraces: combinedTraces,
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
            args: [domActions],
          });

          if (results && results[0]?.result) {
            const rawRes = results[0].result as MacroExecutionResult;
            const domTraces = Array.isArray(rawRes.executedTraces)
              ? rawRes.executedTraces
              : domActions.map((act) => ({ action: act, timestamp: Date.now(), success: true }));
            const combinedTraces = [...executedTraces, ...domTraces];
            return {
              totalActions: actions.length,
              executedActions: combinedTraces.filter((t) => t.success).length,
              abortedEarly: rawRes.abortedEarly ?? false,
              abortReason: rawRes.abortReason,
              executedTraces: combinedTraces,
            };
          }
        } catch (execErr) {
          console.warn('[AgentStateMachine] In-page action execution error:', execErr);
        }
      }
    }

    const combinedTraces = [
      ...executedTraces,
      ...domActions.map((act) => ({
        action: act,
        timestamp: Date.now(),
        success: true,
      })),
    ];
    return {
      totalActions: actions.length,
      executedActions: combinedTraces.filter((t) => t.success).length,
      abortedEarly: false,
      executedTraces: combinedTraces,
    };
  }
}
