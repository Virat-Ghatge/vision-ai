import { ChatMessage, AgentPlanResponse } from './types';

export interface TokenEstimationMetrics {
  totalEstimatedTokens: number;
  cachedPrefixTokens: number;
  freshTokens: number;
  estimatedCostDiscountPercent: number;
}

export const AGENT_SYSTEM_PROMPT = `You are Vision AI, an ultra-low-token autonomous Chrome browser agent.
Your objective is to accomplish the user's browser goal efficiently and accurately through real browser interactions.

CORE OPERATIONAL MANDATES:
1. ACTION-FIRST PRINCIPLE:
   - You are an autonomous browser agent executing on behalf of the user.
   - For broad or multi-step goals (e.g., on Coursera, Cisco NetAcad, YouTube, GitHub):
     DO NOT decline, lecture, refuse, give up, or output disclaimers.
     ALWAYS take the immediate next concrete step forward on the active page (e.g. click a module/lesson, play/complete video media, scroll inner containers, click "Mark as complete", or click "Next").
   - Never return an empty actions array [] on early steps unless the user explicitly asked a pure informational question and the answer is already visible in the viewport DOM.

2. AVAILABLE MACRO ACTIONS:
- click: { type: "click", id: number, stop_if_url_changes?: boolean }
- fill: { type: "fill", id: number, value: string }
- select: { type: "select", id: number, value: string }
- press: { type: "press", id?: number, value: "Enter"|"Tab"|"Escape"|"Backspace" }
- scroll: { type: "scroll", id?: number, value: "up"|"down" } (Automatically scrolls both window and inner scrollable course/sidebar panes; pass id to scroll a specific container)
- complete_media: { type: "complete_media", id?: number } (Plays, fast-forwards, and triggers completion events on HTML5 video/audio lectures on Coursera/NetAcad so "Mark as complete" / "Next" unlocks)
- wait: { type: "wait", value: "500" }
- request_vision_crop: { type: "request_vision_crop", id: number }
- navigate: { type: "navigate", value: "https://..." }
- go_back: { type: "go_back" }
- open_tab: { type: "open_tab", value: "https://..." }
- switch_tab: { type: "switch_tab", value: "<tabId or url keyword>" }

3. LMS & COURSE AUTOMATION GUIDELINES (Coursera / NetAcad / Canvas):
- If a video lecture is present (<video>) and the user wants to complete the section, emit { "type": "complete_media" } followed by clicking the "Mark as complete" or "Next" button if visible.
- If "Mark as complete" or "Next" is not yet visible, emit { "type": "scroll", "value": "down" } to reveal buttons below the fold in the inner reading/lecture pane.
- Pay attention to aria-expanded="false" on module accordions and aria-checked="false" on completion buttons.

RESPONSE FORMAT (JSON ONLY):
{
  "thought": "Brief action rationale describing what you are clicking or doing next, or final answer when complete",
  "actions": [
    { "type": "click", "id": 1 }
  ],
  "complete": false
}`;

function fastHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.8);
}

export function estimateMessagesTokens(messages: ChatMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      total += estimateTokenCount(msg.content) + 4;
    } else {
      for (const block of msg.content) {
        if (block.type === 'text' && block.text) {
          total += estimateTokenCount(block.text);
        } else if (block.type === 'image') {
          total += 258;
        }
      }
      total += 4;
    }
  }
  return total;
}

export class ByteStableContextManager {
  private messages: ChatMessage[] = [];
  private initialPrefixHash = '';
  private prefixMessageCount = 0;
  private prefixTokenCount = 0;

  constructor() {
    this.messages = [];
  }

  initializeRun(goal: string, step1DistilledDom: string): void {
    this.messages = [
      {
        role: 'system',
        content: AGENT_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
      {
        role: 'user',
        content: `USER GOAL: ${goal}\n\nINITIAL VIEWPORT DOM (Step 1):\n${step1DistilledDom}`,
        cache_control: { type: 'ephemeral' },
      },
    ];

    this.prefixMessageCount = this.messages.length;
    this.initialPrefixHash = this.computePrefixHash();
    this.prefixTokenCount = estimateMessagesTokens(this.messages);
  }

  private computePrefixHash(): string {
    const prefixTexts = this.messages.slice(0, this.prefixMessageCount).map((m) => {
      return `${m.role}:${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`;
    });
    return fastHash(prefixTexts.join('||'));
  }

  verifyPrefixStability(): boolean {
    if (this.messages.length < this.prefixMessageCount) {
      return false;
    }
    const currentPrefixHash = this.computePrefixHash();
    return currentPrefixHash === this.initialPrefixHash;
  }

  appendAssistantPlan(plan: AgentPlanResponse): void {
    if (!this.verifyPrefixStability()) {
      throw new Error('Prefix stability invariant violated before appending plan!');
    }

    const jsonContent = JSON.stringify(
      {
        thought: plan.thought,
        actions: plan.actions,
        complete: plan.complete,
      },
      null,
      2
    );

    this.messages.push({
      role: 'assistant',
      content: jsonContent,
    });
  }

  appendStepObservation(stepNumber: number, observationOrDelta: string): void {
    if (!this.verifyPrefixStability()) {
      throw new Error('Prefix stability invariant violated before appending observation!');
    }

    this.messages.push({
      role: 'user',
      content: `[STEP ${stepNumber} OBSERVATION]\n${observationOrDelta}`,
    });
  }

  getMessages(): ChatMessage[] {
    if (!this.verifyPrefixStability()) {
      throw new Error('Byte-stable prefix invariant violated!');
    }
    return [...this.messages];
  }

  getMessageCount(): number {
    return this.messages.length;
  }

  getPrefixTokenCount(): number {
    return this.prefixTokenCount;
  }

  getTelemetryMetrics(): TokenEstimationMetrics {
    const totalEstimatedTokens = estimateMessagesTokens(this.messages);
    const cachedPrefixTokens = this.prefixTokenCount;
    const freshTokens = Math.max(0, totalEstimatedTokens - cachedPrefixTokens);

    const billableEffective = freshTokens + cachedPrefixTokens * 0.1;
    const estimatedCostDiscountPercent =
      totalEstimatedTokens > 0
        ? Math.round(((totalEstimatedTokens - billableEffective) / totalEstimatedTokens) * 100)
        : 0;

    return {
      totalEstimatedTokens,
      cachedPrefixTokens,
      freshTokens,
      estimatedCostDiscountPercent,
    };
  }
}

