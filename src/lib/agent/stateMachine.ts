import { AgentSessionState, ThinkingStep } from './types';
import { LLMRouter } from '../llm/router';
import { ByteStableContextManager } from '../llm/contextManager';
import { MacroAction } from '../llm/types';
import { ActionTrace, MacroExecutionResult, AbortReason } from '../executor/macroExecutor';

const DEFAULT_MAX_STEPS = 25;
const DEFAULT_STORAGE_SESSION_KEY = 'orbit_agent_session_state';
const SUBFRAME_ID_MULTIPLIER = 10000;

export interface StateMachineHooks {
  checkSkillCache?: (url: string, goal: string) => Promise<{ matched: boolean; actions?: MacroAction[] }>;
  isDestructiveAction?: (action: MacroAction, textDescription?: string) => { destructive: boolean; reason?: string };
  onStateChange?: (state: AgentSessionState) => void;
  sessionStorageKey?: string;
}

export class AgentStateMachine {
  private state: AgentSessionState;
  private router: LLMRouter;
  private contextManager: ByteStableContextManager;
  private hooks: StateMachineHooks;
  private storageKey: string;
  private lastKnownUrl = '';
  private actionHistorySignatures: string[] = [];
  private emptyActionCount = 0;
  private frameElementMap = new Map<number, { frameId: number; localId: number }>();

  constructor(router: LLMRouter, hooks: StateMachineHooks = {}, storageKey?: string) {
    this.router = router;
    this.hooks = hooks;
    this.storageKey = storageKey ?? hooks.sessionStorageKey ?? DEFAULT_STORAGE_SESSION_KEY;
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
      thinkingHistory: [],
    };
  }

  getState(): Readonly<AgentSessionState> {
    return this.state;
  }

  async restoreSession(): Promise<boolean> {
    if (typeof chrome === 'undefined' || !chrome.storage?.session) return false;

    try {
      const res = await chrome.storage.session.get(this.storageKey);
      const saved = res[this.storageKey] as AgentSessionState | undefined;
      if (saved) {
        this.state = {
          ...saved,
          thinkingHistory: Array.isArray(saved.thinkingHistory) ? saved.thinkingHistory : [],
        };
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
        await chrome.storage.session.set({ [this.storageKey]: this.state });
      } catch (err) {
        console.warn('[AgentStateMachine] Failed to persist session:', err);
      }
    }
    this.hooks.onStateChange?.(this.state);
  }

  private upsertThinkingStep(step: ThinkingStep): void {
    const history = this.state.thinkingHistory ? [...this.state.thinkingHistory] : [];
    const idx = history.findIndex((s) => s.stepNumber === step.stepNumber);
    if (idx >= 0) {
      history[idx] = { ...history[idx], ...step };
    } else {
      history.push(step);
    }
    this.state.thinkingHistory = history;
  }

  async startTask(goal: string, tabId: number): Promise<void> {
    let targetTabId = tabId;

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

    if (!this.hooks.sessionStorageKey && targetTabId > 0 && this.storageKey === DEFAULT_STORAGE_SESSION_KEY) {
      this.storageKey = `orbit_agent_session_tab_${targetTabId}`;
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
      thinkingHistory: [],
    };
    await this.persistSession();

    await this.runStep();
  }

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

    const currentStepNum = this.state.stepNumber;

    try {
      // Emit live "thinking" step placeholder so Chat UI shows instant Mind Stone activity
      this.upsertThinkingStep({
        stepNumber: currentStepNum,
        thought: `Scanning page DOM and synthesizing Step ${currentStepNum} plan...`,
        actions: [],
        status: 'thinking',
        timestamp: Date.now(),
      });
      await this.persistSession();

      let observationText = '';
      if (currentStepNum === 1) {
        observationText = await this.queryTabDistillation(this.state.tabId);
        this.lastKnownUrl = await this.getTabUrl(this.state.tabId);

        if (this.hooks.checkSkillCache) {
          const tabUrl = this.lastKnownUrl;
          const skillMatch = await this.hooks.checkSkillCache(tabUrl, this.state.goal);
          if (skillMatch.matched && skillMatch.actions && skillMatch.actions.length > 0) {
            this.state.currentThought = 'Executing matched 0-token deterministic domain skill from cache.';
            const execResult = await this.sendActionsToTab(this.state.tabId, skillMatch.actions);
            this.state.completedTraces.push(...execResult.executedTraces);
            this.upsertThinkingStep({
              stepNumber: 1,
              thought: this.state.currentThought,
              actions: skillMatch.actions,
              executedTraces: execResult.executedTraces,
              status: 'done',
              timestamp: Date.now(),
              pageUrl: tabUrl,
            });
            this.state.status = 'completed';
            await this.persistSession();
            return this.state;
          }
        }

        this.contextManager.initializeRun(this.state.goal, observationText, this.lastKnownUrl);
      } else {
        const previousUrl = this.lastKnownUrl;
        const currentUrl = await this.waitForTabSettled(this.state.tabId, previousUrl);
        const didNavigate = Boolean(currentUrl && previousUrl && currentUrl !== previousUrl);
        this.lastKnownUrl = currentUrl;

        // CRITICAL FIX: Always run queryTabDistillation so newly scrolled or expanded Coursera/LMS elements
        // get registered in globalElementRegistry with fresh [id] numbers!
        const deltaResult = await this.queryTabDelta(this.state.tabId);
        const freshDom = await this.queryTabDistillation(this.state.tabId);
        const hasNoDelta = deltaResult.includes('NO CHANGES');

        let stepObs = '';
        if (didNavigate) {
          stepObs = `ACTION RESULT: Page navigated to: ${currentUrl}\nCURRENT VIEWPORT DOM:\n${freshDom}`;
        } else if (hasNoDelta) {
          stepObs = `CURRENT PAGE: ${currentUrl || 'Current Tab'}\nCURRENT VIEWPORT DOM:\n${freshDom}`;
        } else {
          stepObs = `CURRENT PAGE: ${currentUrl || 'Current Tab'}\n${deltaResult}\nUPDATED VIEWPORT DOM:\n${freshDom}`;
        }

        if (this.actionHistorySignatures.length >= 2) {
          const lastSig = this.actionHistorySignatures[this.actionHistorySignatures.length - 1];
          const prevSig = this.actionHistorySignatures[this.actionHistorySignatures.length - 2];
          if (lastSig === prevSig && !didNavigate) {
            stepObs += `\n[SYSTEM NOTE: Previous action "${lastSig}" produced no page progression. Do NOT repeat it. Try scrolling down ({ "type": "scroll", "value": "down" }), completing media ({ "type": "complete_media" }), or clicking the next module/item.]`;
          }
        }

        observationText = stepObs;
        this.contextManager.appendStepObservation(currentStepNum, observationText, this.lastKnownUrl);
      }

      this.updateTelemetry();

      const messages = this.contextManager.getMessages();
      let {
        response: plan,
        activeTier,
        provider,
        modelUsed,
        fallbackNotice,
      } = await this.router.executeStep(messages, 1);

      const isInfo = this.isPureInformationQuery(this.state.goal);
      const isRefusal = this.hasRefusalIndication(plan.thought);
      const isFinishedWithAnswer =
        (isInfo && this.hasCompletionIndication(plan.thought) && !isRefusal) ||
        (plan.complete === true && plan.thought.length > 20 && !isRefusal);

      if (currentStepNum === 1 && plan.actions.length === 0 && !isFinishedWithAnswer) {
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

      this.upsertThinkingStep({
        stepNumber: currentStepNum,
        thought: plan.thought,
        actions: plan.actions,
        status: plan.actions.length > 0 ? 'acting' : 'done',
        timestamp: Date.now(),
        provider,
        model: modelUsed,
        pageUrl: this.lastKnownUrl,
      });
      await this.persistSession();

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

      await this.executePendingActions(plan.complete);
      return this.state;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.state.status = 'error';
      this.state.error = errMsg;
      this.upsertThinkingStep({
        stepNumber: currentStepNum,
        thought: this.state.currentThought || `Error on Step ${currentStepNum}: ${errMsg}`,
        actions: [],
        status: 'error',
        timestamp: Date.now(),
      });
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
    const currentStepNum = this.state.stepNumber;
    const actions = this.state.pendingActions;
    this.state.pendingActions = [];

    const actionSig = actions.map((a) => `${a.type}:${a.id ?? ''}:${a.value ?? ''}`).join(';');
    if (actionSig) {
      this.actionHistorySignatures.push(actionSig);
    }

    if (actions.length === 0) {
      this.emptyActionCount += 1;
    } else {
      this.emptyActionCount = 0;
    }

    let stepTraces: ActionTrace[] = [];
    if (actions.length > 0) {
      const execResult = await this.sendActionsToTab(this.state.tabId, actions);
      if (execResult && Array.isArray(execResult.executedTraces)) {
        stepTraces = execResult.executedTraces;
        this.state.completedTraces.push(...execResult.executedTraces);
      }

      if (execResult.abortedEarly && execResult.abortReason !== 'vision_crop_requested') {
        this.router.recordFailure();
      } else {
        this.router.resetFailures();
      }
    }

    this.upsertThinkingStep({
      stepNumber: currentStepNum,
      thought: this.state.currentThought,
      actions,
      executedTraces: stepTraces,
      status: 'done',
      timestamp: Date.now(),
      provider: this.state.activeProvider,
      model: this.state.activeModel,
      pageUrl: this.lastKnownUrl,
    });

    let shouldComplete = isPlanComplete;

    if (this.hasRefusalIndication(this.state.currentThought)) {
      shouldComplete = false;
    }

    // Dassi ICt continuation rule: Do not allow premature completion if actions were executed
    // and thought indicates an intermediate action or upcoming steps
    if (
      shouldComplete &&
      actions.length > 0 &&
      /\b(now i will|next i will|next step|opening|clicking module|let's open|scrolling to find|proceeding to|in progress|starting lecture|playing video|watching lecture|first step)\b/i.test(
        this.state.currentThought
      )
    ) {
      shouldComplete = false;
    }

    if (
      actions.length === 0 &&
      this.emptyActionCount >= 2 &&
      this.hasRefusalIndication(this.state.currentThought)
    ) {
      this.state.status = 'error';
      this.state.error = this.state.currentThought;
      await this.persistSession();
      return;
    }

    const isActionGoal = !this.isPureInformationQuery(this.state.goal);
    const isInformationalAnswer =
      isPlanComplete &&
      this.state.currentThought.length > 20 &&
      !this.hasRefusalIndication(this.state.currentThought);
    if (this.state.stepNumber === 1 && actions.length === 0 && isActionGoal && !isInformationalAnswer) {
      shouldComplete = false;
    }

    if (!shouldComplete && actions.length === 0) {
      if (
        !this.hasRefusalIndication(this.state.currentThought) &&
        (this.hasCompletionIndication(this.state.currentThought) || this.emptyActionCount >= 2)
      ) {
        shouldComplete = true;
      }
    }

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

    this.state.stepNumber += 1;
    await this.persistSession();

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
    if (
      /\b(will|going to|need to|next|try to|let's|clicking|opening|scrolling|not done)\b/i.test(lower)
    ) {
      return false;
    }
    const completionPhrases = [
      'task complete',
      'task is complete',
      'goal completed',
      'goal is complete',
      'goal achieved',
      'goal is achieved',
      'all steps complete',
      'steps are done',
      'steps are complete',
      'finished',
      'found',
      'here is',
      'the answer is',
      'result:',
      'born in',
      'located at',
    ];
    return completionPhrases.some((kw) => lower.includes(kw));
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

    // Allow SPA frameworks (Coursera React Router / NetAcad) time to render new lecture DOM
    const isTestEnv = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';
    await new Promise((r) => setTimeout(r, isTestEnv ? 40 : 320));

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

  private async appendSubframeDistillation(tabId: number, mainText: string): Promise<string> {
    if (typeof chrome === 'undefined' || !chrome.scripting?.executeScript || tabId <= 0) {
      return mainText;
    }

    try {
      const frameResults = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: () => {
          if (window === window.top) return null;
          if (window.innerWidth < 180 || window.innerHeight < 120) return null;

          const winAny = window as any;
          winAny.__vision_ai_subframe_reg__ =
            winAny.__vision_ai_subframe_reg__ || new Map<number, HTMLElement>();
          const reg: Map<number, HTMLElement> = winAny.__vision_ai_subframe_reg__;
          reg.clear();

          const walkDeep = (root: HTMLElement | ShadowRoot, out: HTMLElement[] = []): HTMLElement[] => {
            const ch = root.children;
            for (let i = 0; i < ch.length && out.length < 600; i++) {
              const el = ch[i] as HTMLElement;
              if (!el || !el.tagName) continue;
              out.push(el);
              if (el.shadowRoot) walkDeep(el.shadowRoot, out);
              if (el.children?.length) walkDeep(el, out);
            }
            return out;
          };

          const all = document.body ? walkDeep(document.body) : [];
          const items: Array<{ localId: number; desc: string }> = [];
          let localId = 1;

          for (const el of all) {
            if (items.length >= 25) break;
            const tag = el.tagName.toUpperCase();
            const role = (el.getAttribute('role') || '').toLowerCase();
            const isAction =
              ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'VIDEO', 'SUMMARY'].includes(tag) ||
              ['button', 'link', 'checkbox', 'radio', 'tab', 'menuitem', 'option'].includes(role) ||
              el.hasAttribute('onclick') ||
              el.hasAttribute('aria-expanded');
            if (!isAction) continue;

            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;

            const id = localId++;
            reg.set(id, el);
            const label = el.getAttribute('aria-label') || el.getAttribute('title') || '';
            const txt = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 32);
            const labelAttr = label ? ` label="${label.slice(0, 28)}"` : '';
            items.push({
              localId: id,
              desc: `<${tag.toLowerCase()}${labelAttr}>${txt}</${tag.toLowerCase()}>`,
            });
          }

          return items.length > 0 ? items : null;
        },
      });

      if (!Array.isArray(frameResults)) return mainText;

      const extraLines: string[] = [];
      let frameIndex = 0;
      for (const fr of frameResults) {
        const frameId = (fr as any).frameId as number | undefined;
        if (!frameId || frameId <= 0) continue;
        frameIndex++;

        const res = (fr as any).result as any;
        if (!res) continue;

        if (Array.isArray(res) && res.length > 0) {
          extraLines.push(`--- IFRAME [Frame ${frameId}: Embedded Content] ---`);
          for (const item of res) {
            const globalId = frameIndex * 1000 + item.localId;
            this.frameElementMap.set(globalId, { frameId, localId: item.localId });
            extraLines.push(`[${globalId}] ${item.desc}`);
          }
        } else if (res.items && Array.isArray(res.items) && res.items.length > 0) {
          const title = res.frameTitle || 'LMS Content';
          extraLines.push(`--- IFRAME [Frame ${frameId}: ${title}] ---`);
          for (const item of res.items) {
            const globalId = frameIndex * 1000 + item.localId;
            this.frameElementMap.set(globalId, { frameId, localId: item.localId });
            if (item.desc) {
              extraLines.push(`[${globalId}] ${item.desc}`);
            } else {
              const attrStr = item.attrStr
                ? item.attrStr.startsWith(' ')
                  ? item.attrStr
                  : ' ' + item.attrStr
                : '';
              if (item.text) {
                extraLines.push(`[${globalId}] <${item.tag}${attrStr}>${item.text}</${item.tag}>`);
              } else {
                extraLines.push(`[${globalId}] <${item.tag}${attrStr} />`);
              }
            }
          }
        }
      }

      if (extraLines.length > 0) {
        return `${mainText}\n${extraLines.join('\n')}`;
      }
    } catch {}

    return mainText;
  }

  private async queryTabDistillation(tabId: number): Promise<string> {
    if (typeof chrome === 'undefined' || !chrome.tabs) {
      return '(Simulated initial viewport DOM)';
    }

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
          `Vision AI cannot run on Chrome internal page (${tabUrl}). Please open or switch to any website (e.g. https://www.coursera.org or https://www.google.com) and try again.`
        );
      }
    }

    if (chrome.tabs?.sendMessage && tabId > 0) {
      try {
        const res = await chrome.tabs.sendMessage(tabId, { type: 'DISTILL_VIEWPORT' });
        if (res && typeof res.text === 'string' && res.text.trim().length > 0) {
          return await this.appendSubframeDistillation(tabId, res.text);
        }
      } catch (err) {
        console.log('[AgentStateMachine] Content script message error, trying script injection:', err);
      }

      if (chrome.scripting?.executeScript) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content-scripts/content.js'],
          });
          await new Promise((r) => setTimeout(r, 200));
          const retryRes = await chrome.tabs.sendMessage(tabId, { type: 'DISTILL_VIEWPORT' });
          if (retryRes && typeof retryRes.text === 'string' && retryRes.text.trim().length > 0) {
            return await this.appendSubframeDistillation(tabId, retryRes.text);
          }
        } catch (injectErr) {
          console.warn(
            '[AgentStateMachine] Content script injection failed, falling back to in-page evaluation:',
            injectErr
          );
        }

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
              winAny.__vision_ai_registry__ =
                winAny.__vision_ai_registry__ || new Map<number, HTMLElement>();
              const reg: Map<number, HTMLElement> = winAny.__vision_ai_registry__;
              reg.clear();

              const walkDeep = (root: HTMLElement | ShadowRoot, out: HTMLElement[] = []): HTMLElement[] => {
                const ch = root.children;
                for (let i = 0; i < ch.length && out.length < 1500; i++) {
                  const el = ch[i] as HTMLElement;
                  if (!el || !el.tagName) continue;
                  out.push(el);
                  if (el.shadowRoot) walkDeep(el.shadowRoot, out);
                  if (el.children?.length) walkDeep(el, out);
                }
                return out;
              };

              const candidateTags = new Set([
                'A',
                'BUTTON',
                'INPUT',
                'SELECT',
                'TEXTAREA',
                'VIDEO',
                'SUMMARY',
                'H1',
                'H2',
              ]);
              const candidateRoles = new Set([
                'button',
                'link',
                'checkbox',
                'menuitem',
                'tab',
                'combobox',
                'searchbox',
                'textbox',
              ]);

              const allEls = doc.body ? walkDeep(doc.body) : [];
              let count = 0;
              let idCounter = 1;

              for (let i = 0; i < allEls.length && count < 55; i++) {
                const el = allEls[i];
                const tag = el.tagName.toUpperCase();
                const role = (el.getAttribute('role') || '').toLowerCase();

                const isCandidate =
                  candidateTags.has(tag) ||
                  candidateRoles.has(role) ||
                  el.getAttribute('contenteditable') === 'true' ||
                  (el.hasAttribute('tabindex') &&
                    parseInt(el.getAttribute('tabindex') || '-1', 10) >= 0);

                if (!isCandidate) continue;

                if (typeof (el as any).checkVisibility === 'function') {
                  if (!(el as any).checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
                    continue;
                  }
                } else {
                  if (el.style.display === 'none' || el.style.visibility === 'hidden') continue;
                }

                const id = idCounter++;
                reg.set(id, el);

                const attrs: string[] = [];
                const type = el.getAttribute('type');
                if (type) attrs.push(`type="${type}"`);
                const aria = el.getAttribute('aria-label') || el.getAttribute('title');
                if (aria) attrs.push(`label="${aria.slice(0, 28)}"`);
                if (el.hasAttribute('disabled')) attrs.push('disabled');

                const attrStr = attrs.length > 0 ? ` ${attrs.join(' ')}` : '';
                const text =
                  tag !== 'INPUT'
                    ? (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 32)
                    : '';

                if (text) {
                  lines.push(`[${id}] <${tag.toLowerCase()}${attrStr}>${text}</${tag.toLowerCase()}>`);
                } else {
                  lines.push(`[${id}] <${tag.toLowerCase()}${attrStr} />`);
                }
                count++;
              }

              return lines.join('\n');
            },
          });

          if (results && results[0]?.result && typeof results[0].result === 'string') {
            return await this.appendSubframeDistillation(tabId, results[0].result);
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

  private async executeSubframeAction(
    tabId: number,
    frameId: number,
    localId: number,
    act: MacroAction
  ): Promise<boolean> {
    if (typeof chrome === 'undefined' || !chrome.scripting?.executeScript) return false;
    try {
      const res = await chrome.scripting.executeScript({
        target: { tabId, frameIds: [frameId] },
        func: (actionObj: MacroAction) => {
          const winAny = window as any;
          const reg: Map<number, HTMLElement> | undefined =
            winAny.__vision_ai_subframe_reg__ || winAny.__vision_ai_registry__;
          const el = actionObj.id !== undefined && reg ? reg.get(actionObj.id) : null;
          if (!el) return false;
          try {
            el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
          } catch {}
          if (actionObj.type === 'click') {
            el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
            el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
            el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true }));
            el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, composed: true }));
            el.click();
          } else if (
            actionObj.type === 'fill' &&
            (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
          ) {
            el.value = actionObj.value || '';
            el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
          }
          return true;
        },
        args: [{ ...act, id: localId }],
      });
      return Boolean(res?.[0]?.result);
    } catch {
      return false;
    }
  }

  private async sendActionsToTab(tabId: number, actions: MacroAction[]): Promise<MacroExecutionResult> {
    const executedTraces: ActionTrace[] = [];
    const domActions: MacroAction[] = [];
    let abortedEarly = false;
    let abortReason: AbortReason | undefined;

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
            executedTraces.push({
              action: act,
              timestamp: Date.now(),
              success: false,
              error: String(navErr),
            });
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
            executedTraces.push({
              action: act,
              timestamp: Date.now(),
              success: false,
              error: String(backErr),
            });
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
            if (newTab?.id) {
              this.state.tabId = newTab.id;
              tabId = newTab.id;
              await this.waitForTabSettled(tabId, '');
            }
            executedTraces.push({ action: act, timestamp: Date.now(), success: true });
          } catch (tabErr) {
            executedTraces.push({
              action: act,
              timestamp: Date.now(),
              success: false,
              error: String(tabErr),
            });
          }
        } else {
          executedTraces.push({ action: act, timestamp: Date.now(), success: true });
        }
      } else if (act.type === 'switch_tab') {
        if (typeof chrome !== 'undefined' && chrome.tabs?.query && act.value) {
          try {
            const tabs = await chrome.tabs.query({});
            const q = act.value.toLowerCase();
            const matched = tabs.find(
              (t) =>
                String(t.id) === q ||
                (t.url && t.url.toLowerCase().includes(q)) ||
                (t.title && t.title.toLowerCase().includes(q))
            );
            if (matched?.id) {
              await chrome.tabs.update(matched.id, { active: true });
              this.state.tabId = matched.id;
              tabId = matched.id;
            }
            executedTraces.push({ action: act, timestamp: Date.now(), success: true });
          } catch (swErr) {
            executedTraces.push({
              action: act,
              timestamp: Date.now(),
              success: false,
              error: String(swErr),
            });
          }
        } else {
          executedTraces.push({ action: act, timestamp: Date.now(), success: true });
        }
      } else if (act.id !== undefined && this.frameElementMap.has(act.id)) {
        const mapped = this.frameElementMap.get(act.id)!;
        const ok = await this.executeSubframeAction(tabId, mapped.frameId, mapped.localId, act);
        executedTraces.push({ action: act, timestamp: Date.now(), success: ok });
      } else if (act.id !== undefined && act.id >= SUBFRAME_ID_MULTIPLIER) {
        const frameId = Math.floor(act.id / SUBFRAME_ID_MULTIPLIER);
        const localId = act.id % SUBFRAME_ID_MULTIPLIER;
        const ok = await this.executeSubframeAction(tabId, frameId, localId, act);
        executedTraces.push({ action: act, timestamp: Date.now(), success: ok });
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
          console.warn(
            '[AgentStateMachine] Content script macro execution failed, attempting in-page execution:',
            err
          );
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

