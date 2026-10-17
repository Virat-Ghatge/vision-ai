import React, { useState, useEffect } from 'react';
import { AgentSessionState } from '../../src/lib/agent/types';
import { TokenTelemetryHUD } from './components/TokenTelemetryHUD';
import { ApiKeyVault } from './components/ApiKeyVault';
import { SkillsDrawer } from './components/SkillsDrawer';
import { ApprovalModal } from './components/ApprovalModal';
import { TaskStream } from './components/TaskStream';
import { SiteSkill } from '../../src/lib/skills/skillStore';
import { KeyRound, Sparkles, Orbit, Globe, RefreshCw, AlertTriangle } from 'lucide-react';

const INITIAL_STATE: AgentSessionState = {
  status: 'idle',
  goal: '',
  tabId: 0,
  stepNumber: 0,
  maxSteps: 25,
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

interface ActiveTabInfo {
  id?: number;
  title?: string;
  url?: string;
  isInternal?: boolean;
}

export default function App(): React.JSX.Element {
  const [state, setState] = useState<AgentSessionState>(INITIAL_STATE);
  const [prompt, setPrompt] = useState('');
  const [vaultOpen, setVaultOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTabInfo>({});

  const refreshActiveTab = async () => {
    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      try {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (tab) {
          const url = tab.url || '';
          const isInternal =
            url.startsWith('chrome://') ||
            url.startsWith('chrome-extension://') ||
            url.startsWith('edge://') ||
            url.startsWith('devtools://') ||
            url.startsWith('about:');

          setActiveTab({
            id: tab.id,
            title: tab.title || (isInternal ? 'Chrome Internal Page' : 'Current Webpage'),
            url: tab.url,
            isInternal,
          });
        }
      } catch (err) {
        console.warn('[Vision AI] Error querying active tab:', err);
      }
    }
  };

  useEffect(() => {
    // 1. Fetch current agent state on mount
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      try {
        chrome.runtime.sendMessage({ type: 'GET_AGENT_STATE' }, (res) => {
          if (chrome.runtime.lastError) {
            // Service worker waking up or not ready; state will arrive via broadcast
            return;
          }
          if (res && typeof res === 'object') {
            setState(res as AgentSessionState);
          }
        });
      } catch (err) {
        console.warn('[Vision AI] Initial state query warning:', err);
      }

      // 2. Listen for real-time broadcasts from background service worker
      const listener = (msg: { type: string; state?: AgentSessionState }) => {
        if (msg && msg.type === 'AGENT_STATE_UPDATED' && msg.state) {
          setState(msg.state);
        }
      };

      chrome.runtime.onMessage.addListener(listener);

      // 3. Track active browser tab
      refreshActiveTab();
      const onTabActivated = () => refreshActiveTab();
      const onTabUpdated = () => refreshActiveTab();
      chrome.tabs?.onActivated?.addListener(onTabActivated);
      chrome.tabs?.onUpdated?.addListener(onTabUpdated);

      return () => {
        chrome.runtime.onMessage.removeListener(listener);
        chrome.tabs?.onActivated?.removeListener(onTabActivated);
        chrome.tabs?.onUpdated?.removeListener(onTabUpdated);
      };
    }
  }, []);

  const handleStartTask = async (taskGoal?: string) => {
    const goalToRun = taskGoal ?? prompt;
    if (!goalToRun.trim()) return;

    let targetTabId = activeTab.id;

    // Refresh active tab in real time to ensure we target the current webpage
    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      try {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (tab?.id) {
          targetTabId = tab.id;
          const url = tab.url || '';
          const isInternal =
            url.startsWith('chrome://') ||
            url.startsWith('chrome-extension://') ||
            url.startsWith('edge://') ||
            url.startsWith('devtools://') ||
            url.startsWith('about:');

          if (isInternal) {
            setState((prev) => ({
              ...prev,
              status: 'error',
              error:
                'Vision AI cannot automate internal Chrome pages (chrome://). Please open or switch to any website (e.g. google.com or wikipedia.org) and try again.',
            }));
            return;
          }
        }
      } catch (err) {
        console.warn('[Vision AI] Failed to query tab before launch:', err);
      }
    }

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'START_TASK', goal: goalToRun, tabId: targetTabId }, () => {
        // optimistic status
        setState((prev) => ({
          ...prev,
          status: 'running',
          goal: goalToRun,
          stepNumber: 1,
          error: undefined,
        }));
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

  const handleReset = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'STOP_TASK' }, () => {
        setState(INITIAL_STATE);
        setPrompt('');
      });
    } else {
      setState(INITIAL_STATE);
      setPrompt('');
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
              Vision AI
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

      {/* Target Webpage Status Bar */}
      <div className="flex items-center justify-between bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-1.5 mb-2.5 text-[11px] shadow-sm">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              activeTab.isInternal
                ? 'bg-amber-400 animate-pulse'
                : activeTab.url
                ? 'bg-emerald-400'
                : 'bg-slate-500'
            }`}
          />
          <Globe className="w-3 h-3 text-slate-400 shrink-0" />
          <span className="text-slate-400 shrink-0 font-medium">Page:</span>
          <span
            className="text-slate-200 truncate font-mono text-[10.5px]"
            title={activeTab.url || 'No active tab detected'}
          >
            {activeTab.title || (activeTab.url ? activeTab.url : 'Detecting tab...')}
          </span>
        </div>
        <button
          onClick={refreshActiveTab}
          title="Refresh active tab connection"
          className="text-slate-500 hover:text-slate-300 ml-2 p-0.5 rounded transition-colors shrink-0"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      {activeTab.isInternal && (
        <div className="flex items-start gap-1.5 bg-amber-950/40 border border-amber-600/30 rounded-lg px-2.5 py-2 mb-2.5 text-[11px] text-amber-300">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <span>
            Target is a Chrome internal page (<code>{activeTab.url?.slice(0, 20)}...</code>). Switch your browser tab to a website like{' '}
            <strong className="text-amber-200">google.com</strong> or <strong className="text-amber-200">wikipedia.org</strong> to automate.
          </span>
        </div>
      )}

      {/* Token Telemetry HUD */}
      <div className="mb-3">
        <TokenTelemetryHUD
          metrics={state.tokenMetrics}
          activeTier={state.activeTier}
          activeProvider={state.activeProvider}
          activeModel={state.activeModel}
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
        onReset={handleReset}
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
