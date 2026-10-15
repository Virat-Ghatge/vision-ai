import React, { useState, useEffect } from 'react';
import { AgentSessionState } from '../../src/lib/agent/types';
import { TokenTelemetryHUD } from './components/TokenTelemetryHUD';
import { ApiKeyVault } from './components/ApiKeyVault';
import { SkillsDrawer } from './components/SkillsDrawer';
import { ApprovalModal } from './components/ApprovalModal';
import { TaskStream } from './components/TaskStream';
import { SiteSkill } from '../../src/lib/skills/skillStore';
import { KeyRound, Sparkles, Orbit } from 'lucide-react';

const INITIAL_STATE: AgentSessionState = {
  status: 'idle',
  goal: '',
  tabId: 0,
  stepNumber: 0,
  maxSteps: 15,
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

export default function App(): React.JSX.Element {
  const [state, setState] = useState<AgentSessionState>(INITIAL_STATE);
  const [prompt, setPrompt] = useState('');
  const [vaultOpen, setVaultOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);

  useEffect(() => {
    // 1. Fetch current agent state on mount
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'GET_AGENT_STATE' }, (res) => {
        if (res && typeof res === 'object') {
          setState(res as AgentSessionState);
        }
      });

      // 2. Listen for real-time broadcasts from background service worker
      const listener = (msg: { type: string; state?: AgentSessionState }) => {
        if (msg && msg.type === 'AGENT_STATE_UPDATED' && msg.state) {
          setState(msg.state);
        }
      };

      chrome.runtime.onMessage.addListener(listener);
      return () => chrome.runtime.onMessage.removeListener(listener);
    }
  }, []);

  const handleStartTask = (taskGoal?: string) => {
    const goalToRun = taskGoal ?? prompt;
    if (!goalToRun.trim()) return;

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'START_TASK', goal: goalToRun }, () => {
        // optimistic status
        setState((prev) => ({ ...prev, status: 'running', goal: goalToRun, stepNumber: 1 }));
      });
    }
  };

  const handlePause = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'PAUSE_TASK' });
    }
  };

  const handleResume = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'RESUME_TASK' });
    }
  };

  const handleStop = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'STOP_TASK' }, () => {
        setState((prev) => ({ ...prev, status: 'idle' }));
      });
    }
  };

  const handleApprove = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'APPROVE_ACTION', approved: true });
    }
  };

  const handleReject = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'APPROVE_ACTION', approved: false });
    }
  };

  const handleRunSkill = (skill: SiteSkill) => {
    setPrompt(skill.goalPattern);
    handleStartTask(skill.goalPattern);
  };

  return (
    <div className="flex flex-col h-screen w-full bg-orbit-dark text-slate-100 p-3.5 select-none font-sans overflow-hidden">
      {/* Top Header */}
      <header className="flex items-center justify-between border-b border-orbit-border pb-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="relative flex items-center justify-center">
            <Orbit className="w-5 h-5 text-orbit-neon animate-spin" style={{ animationDuration: '8s' }} />
            <div className="w-2 h-2 rounded-full bg-orbit-neon absolute" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-tight flex items-center gap-1.5">
              OrbitAgent
              <span className="text-[9px] bg-slate-800 text-orbit-accent border border-slate-700 px-1.5 py-0.2 rounded font-mono font-normal">
                v0.1
              </span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setSkillsOpen(true)}
            className="flex items-center gap-1 text-xs bg-slate-900 hover:bg-slate-800 border border-slate-700/80 hover:border-slate-600 px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white transition-colors"
            title="Saved 0-Token Domain Skills"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px] font-semibold">Skills</span>
          </button>
          <button
            onClick={() => setVaultOpen(true)}
            className="flex items-center gap-1 text-xs bg-slate-900 hover:bg-slate-800 border border-slate-700/80 hover:border-slate-600 px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white transition-colors"
            title="API Keys Vault"
          >
            <KeyRound className="w-3.5 h-3.5 text-orbit-accent" />
            <span className="text-[11px] font-semibold">Vault</span>
          </button>
        </div>
      </header>

      {/* Token Telemetry HUD */}
      <div className="mb-3">
        <TokenTelemetryHUD
          metrics={state.tokenMetrics}
          activeTier={state.activeTier}
          activeProvider={state.activeProvider}
        />
      </div>

      {/* Interactive Task Stream & Controls */}
      <TaskStream
        state={state}
        prompt={prompt}
        onPromptChange={setPrompt}
        onStart={() => handleStartTask()}
        onPause={handlePause}
        onResume={handleResume}
        onStop={handleStop}
      />

      {/* Human-in-the-Loop Intercept Modal */}
      {state.requiresApproval && (
        <ApprovalModal
          action={state.approvalDetails?.action}
          reason={state.approvalDetails?.reason}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      )}

      {/* Drawers / Modals */}
      <ApiKeyVault isOpen={vaultOpen} onClose={() => setVaultOpen(false)} />
      <SkillsDrawer
        isOpen={skillsOpen}
        onClose={() => setSkillsOpen(false)}
        onRunSkill={handleRunSkill}
      />
    </div>
  );
}
