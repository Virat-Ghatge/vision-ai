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
  activeProvider?: LLMProviderType;
  activeTier?: RouterTier;
  activeModel?: string;
  fallbackNotice?: string;
  error?: string;
}

export type ExtensionMessage =
  | { type: 'START_TASK'; goal: string; tabId?: number }
  | { type: 'PAUSE_TASK' }
  | { type: 'RESUME_TASK' }
  | { type: 'STOP_TASK' }
  | { type: 'GET_AGENT_STATE' }
  | { type: 'APPROVE_ACTION'; approved: boolean }
  | { type: 'DISTILL_VIEWPORT' }
  | { type: 'EXECUTE_MACRO'; actions: MacroAction[] }
  | { type: 'GET_DELTA' }
  | { type: 'REQUEST_VISION_CROP'; targetId: number };
