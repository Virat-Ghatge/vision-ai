import { ChatMessage, AgentPlanResponse } from './types';

export interface TokenEstimationMetrics {
  totalEstimatedTokens: number;
  cachedPrefixTokens: number;
  freshTokens: number;
  estimatedCostDiscountPercent: number;
}

export const AGENT_SYSTEM_PROMPT = `You are OrbitAgent, an ultra-low-token autonomous Chrome browser agent.
Your objective is to accomplish the user's browser goal efficiently.

AVAILABLE MACRO ACTIONS:
- click: { type: "click", id: number, stop_if_url_changes?: boolean }
- fill: { type: "fill", id: number, value: string }
- select: { type: "select", id: number, value: string }
- press: { type: "press", value: "Enter"|"Tab"|"Escape"|"Backspace" }
- scroll: { type: "scroll", value: "up"|"down" }
- wait: { type: "wait", value: "500" }
- request_vision_crop: { type: "request_vision_crop", id: number }

RESPONSE FORMAT:
You MUST respond with valid JSON adhering strictly to this schema:
{
  "thought": "Brief 1-sentence reasoning for the next macro-step",
  "actions": [
    { "type": "click", "id": 12, "stop_if_url_changes": true }
  ],
  "complete": false
}
Set "complete": true ONLY when the user's ultimate goal has been fully achieved.`;

/**
 * Fast deterministic string hash for prefix stability verification.
 */
function fastHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Estimates token count for text.
 * Viewport DOM text contains tags and brackets, yielding ~3.8 characters per token.
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  // Viewport DOM / code tokens: ~3.8 chars per token, minimum 1 token
  return Math.ceil(text.length / 3.8);
}

export function estimateMessagesTokens(messages: ChatMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      total += estimateTokenCount(msg.content) + 4; // 4 token message framing overhead
    } else {
      for (const block of msg.content) {
        if (block.type === 'text' && block.text) {
          total += estimateTokenCount(block.text);
        } else if (block.type === 'image') {
          total += 258; // Standard Claude/Gemini low-res image token cost
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

  /**
   * Initializes the run with System Prompt, User Goal, and Step 1 Distilled DOM.
   * This initial prefix is frozen and must remain 100% byte-identical across all turns.
   */
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

  /**
   * Verifies that the initial prompt prefix has not mutated.
   */
  verifyPrefixStability(): boolean {
    if (this.messages.length < this.prefixMessageCount) {
      return false;
    }
    const currentPrefixHash = this.computePrefixHash();
    return currentPrefixHash === this.initialPrefixHash;
  }

  /**
   * Strictly appends an assistant plan to the end of history without altering prefix.
   */
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

  /**
   * Strictly appends a user step delta/observation without altering prefix.
   */
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
    // Return shallow copy of array to prevent external push/pop mutations
    return [...this.messages];
  }

  getMessageCount(): number {
    return this.messages.length;
  }

  getPrefixTokenCount(): number {
    return this.prefixTokenCount;
  }

  /**
   * Calculates token usage and estimated cache savings.
   */
  getTelemetryMetrics(): TokenEstimationMetrics {
    const totalEstimatedTokens = estimateMessagesTokens(this.messages);
    const cachedPrefixTokens = this.prefixTokenCount;
    const freshTokens = Math.max(0, totalEstimatedTokens - cachedPrefixTokens);

    // Cached prefix tokens typically receive 90% discount on Claude / Gemini
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
