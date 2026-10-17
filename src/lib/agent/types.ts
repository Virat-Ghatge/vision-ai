import { MacroAction, RouterTier, LLMProviderType } from '../llm/types';
import { ActionTrace } from '../executor/macroExecutor';

export type AgentStatus =
  | 'idle'
  | 'running'
  | 'waiting_approval'
  | 'paused'
  | 'completed'
  | 'error';

export interface TokenMetrics {
  totalEstimatedTokens: number;
  cachedPrefixTokens: number;
  freshTokens: number;
  estimatedCostDiscountPercent: number;
}

export interface ThinkingStep {
  stepNumber: number;
  thought: string;
  actions: MacroAction[];
  executedTraces?: ActionTrace[];
  status: 'thinking' | 'acting' | 'done' | 'error';
  timestamp: number;
  provider?: LLMProviderType;
  model?: string;
  pageUrl?: string;
}

export interface AgentSessionState {
  status: AgentStatus;
  goal: string;
  tabId: number;
  stepNumber: number;
  maxSteps: number;
  currentThought: string;
  pendingActions: MacroAction[];
  requiresApproval: boolean;
  approvalDetails?: {
    action: MacroAction;
    reason: string;
  };
  tokenMetrics: TokenMetrics;
  completedTraces: ActionTrace[];
  thinkingHistory?: ThinkingStep[];
  activeProvider?: LLMProviderType;
  activeTier?: RouterTier;
  activeModel?: string;
  fallbackNotice?: string;
  error?: string;
}

export interface TabSessionSummary {
  tabId: number;
  title: string;
  url: string;
  status: AgentStatus;
  stepNumber: number;
  goal: string;
  isInternal: boolean;
}

export interface PageInspectionSummary {
  url: string;
  title: string;
  interactiveCount: number;
  totalElements: number;
  distilledPreview: string;
}

export type ExtensionMessage =
  | { type: 'START_TASK'; goal: string; tabId?: number }
  | { type: 'PAUSE_TASK'; tabId?: number }
  | { type: 'RESUME_TASK'; tabId?: number }
  | { type: 'STOP_TASK'; tabId?: number }
  | { type: 'GET_AGENT_STATE'; tabId?: number }
  | { type: 'LIST_TAB_SESSIONS' }
  | { type: 'APPROVE_ACTION'; approved: boolean; tabId?: number }
  | {
      type: 'SET_ACTIVE_MODEL';
      provider: 'openrouter' | 'groq' | 'gemini' | 'anthropic' | 'ollama';
      model: string;
    }
  | { type: 'INSPECT_TAB_DOM'; tabId?: number }
  | { type: 'DISTILL_VIEWPORT' }
  | { type: 'EXECUTE_MACRO'; actions: MacroAction[] }
  | { type: 'GET_DELTA' }
  | { type: 'REQUEST_VISION_CROP'; targetId: number }
  | { type: 'PING' };

