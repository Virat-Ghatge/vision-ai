import React, { useState, useEffect, useCallback } from 'react';
import { AgentSessionState, TabSessionSummary } from '../../src/lib/agent/types';
import { TokenTelemetryHUD } from './components/TokenTelemetryHUD';
import { ApiKeyVault } from './components/ApiKeyVault';
import { SkillsDrawer } from './components/SkillsDrawer';
import { ApprovalModal } from './components/ApprovalModal';
import { TaskStream } from './components/TaskStream';
import { SiteSkill } from '../../src/lib/skills/skillStore';
import { KeyRound, Sparkles, Orbit, Globe, RefreshCw, AlertTriangle, Layers } from 'lucide-react';

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
  const [promptsByTab, setPromptsByTab] = useState<Record<number, string>>({});
  const [vaultOpen, setVaultOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTabInfo>({});
  const [tabSessions, setTabSessions] = useState<TabSessionSummary[]>([]);
  const [pinnedTabId, setPinnedTabId] = useState<number | null>(null);

  const currentTabId = pinnedTabId ?? activeTab.id ?? 0;
  const prompt = promptsByTab[currentTabId] ?? '';

  const setPrompt = (val: string) => {
    setPromptsByTab((prev) => ({ ...prev, [currentTabId]: val }));
  };

  const fetchTabState = useCallback((targetTabId: number) => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage || targetTabId <= 0) return;
    chrome.runtime.sendMessage({ type: 'GET_AGENT_STATE', tabId: targetTabId }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res && typeof res === 'object') {
        const agentState = res as AgentSessionState;
        setState(agentState);
        if (agentState.goal) {
          setPromptsByTab((prev) => ({
            ...prev,
            [targetTabId]: prev[targetTabId] ?? agentState.goal,
          }));
        }
      }
    });
  }, []);

  const refreshTabSessions = useCallback(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
    chrome.runtime.sendMessage({ type: 'LIST_TAB_SESSIONS' }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res && Array.isArray(res.sessions)) {
        setTabSessions(res.sessions as TabSessionSummary[]);
      }
    });
  }, []);

  const refreshActiveTab = useCallback(async () => {
    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      try {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (tab && tab.id) {
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

          if (!pinnedTabId) {
            fetchTabState(tab.id);
          }
        }
      } catch (err) {
        console.warn('[Vision AI] Error querying active tab:', err);
      }
    }
    refreshTabSessions();
  }, [pinnedTabId, fetchTabState, refreshTabSessions]);

  useEffect(() => {
    if (typeof chrome !== 'undefined' && typeof chrome.runtime?.sendMessage === 'function') {
      refreshActiveTab();

      const listener = (msg: { type: string; tabId?: number; state?: AgentSessionState }) => {
        if (msg && msg.type === 'AGENT_STATE_UPDATED' && msg.state) {
          const eventTabId = msg.tabId ?? msg.state.tabId;
          setState((prev) => {
            const targetId = pinnedTabId ?? activeTab.id ?? prev.tabId;
            if (!targetId || eventTabId === targetId) {
              return msg.state!;
            }
            return prev;
          });
          refreshTabSessions();
        }
      };

      chrome.runtime.onMessage.addListener(listener);

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
  }, [pinnedTabId, activeTab.id, refreshActiveTab, refreshTabSessions]);

  const handleSelectTargetTab = (tabIdStr: string) => {
    if (tabIdStr === 'auto') {
      setPinnedTabId(null);
      if (activeTab.id) fetchTabState(activeTab.id);
    } else {
      const tid = parseInt(tabIdStr, 10);
      if (!isNaN(tid) && tid > 0) {
        setPinnedTabId(tid);
        fetchTabState(tid);
      }
    }
  };

  const handleStartTask = async (taskGoal?: string) => {
    const goalToRun = taskGoal ?? prompt;
    if (!goalToRun.trim()) return;

    let targetTabId = currentTabId;

    if (!pinnedTabId && typeof chrome !== 'undefined' && chrome.tabs?.query) {
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
                'Vision AI cannot automate internal Chrome pages (chrome://). Please open or switch to any website (e.g. coursera.org, netacad.com, youtube.com) and try again.',
            }));
            return;
          }
        }
      } catch (err) {
        console.warn('[Vision AI] Failed to query tab before launch:', err);
      }
    }

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage(
        { type: 'START_TASK', goal: goalToRun, tabId: targetTabId },
        () => {
          setState((prev) => ({
            ...prev,
            status: 'running',
            goal: goalToRun,
            tabId: targetTabId || prev.tabId,
            stepNumber: 1,
            error: undefined,
          }));
          refreshTabSessions();
        }
      );
    }
  };

  const handlePause = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'PAUSE_TASK', tabId: currentTabId });
    }
  };

  const handleResume = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'RESUME_TASK', tabId: currentTabId });
    }
  };

  const handleStop = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'STOP_TASK', tabId: currentTabId }, () => {
        setState((prev) => ({ ...prev, status: 'idle' }));
        refreshTabSessions();
      });
    }
  };

  const handleReset = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'STOP_TASK', tabId: currentTabId }, () => {
        setState({ ...INITIAL_STATE, tabId: currentTabId });
        setPrompt('');
        refreshTabSessions();
      });
    } else {
      setState(INITIAL_STATE);
      setPrompt('');
    }
  };

  const handleApprove = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'APPROVE_ACTION', approved: true, tabId: currentTabId });
    }
  };

  const handleReject = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'APPROVE_ACTION', approved: false, tabId: currentTabId });
    }
  };

  const handleRunSkill = (skill: SiteSkill) => {
    setPrompt(skill.goalPattern);
    handleStartTask(skill.goalPattern);
  };

  const runningBackgroundTabs = tabSessions.filter(
    (s) => s.status === 'running' || s.status === 'waiting_approval'
  );

  return (
    <div className="flex flex-col h-screen w-full bg-orbit-dark text-slate-100 p-3.5 select-none font-sans overflow-hidden">
      {/* Top Header */}
      <header className="flex items-center justify-between border-b border-orbit-border pb-3 mb-2.5">
        <div className="flex items-center gap-2">
          <div className="relative flex items-center justify-center">
            <Orbit className="w-5 h-5 text-orbit-neon animate-spin" style={{ animationDuration: '8s' }} />
            <div className="w-2 h-2 rounded-full bg-orbit-neon absolute" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-tight flex items-center gap-1.5">
              Vision AI
              <span className="text-[9px] bg-slate-800 text-orbit-accent border border-slate-700 px-1.5 py-0.2 rounded font-mono font-normal">
                v0.2 Multi-Tab
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

      {/* Multi-Tab Target Selector & Independent Tab Agent Switcher */}
      <div className="flex flex-col gap-1.5 bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-2 mb-2.5 text-[11px] shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <Layers className="w-3.5 h-3.5 text-orbit-accent shrink-0" />
            <span className="text-slate-400 shrink-0 font-semibold">Target Tab:</span>
            <select
              value={pinnedTabId ? String(pinnedTabId) : 'auto'}
              onChange={(e) => handleSelectTargetTab(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-[11px] text-slate-200 truncate flex-1 focus:border-orbit-neon focus:outline-none"
            >
              <option value="auto">
                Follow Active Tab ({activeTab.title?.slice(0, 26) || 'Current'})
              </option>
              {tabSessions
                .filter((t) => !t.isInternal)
                .map((t) => (
                  <option key={t.tabId} value={String(t.tabId)}>
                    {t.status === 'running' ? '⚡ [RUNNING] ' : ''}
                    {t.title.slice(0, 32)}
                  </option>
                ))}
            </select>
          </div>
          <button
            onClick={refreshActiveTab}
            title="Refresh open tabs list"
            className="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-slate-800 transition-colors shrink-0"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>

        {/* Active Background Tab Agents Pill Bar */}
        {runningBackgroundTabs.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pt-1 border-t border-slate-800/80">
            <span className="text-[10px] text-emerald-400 font-semibold shrink-0">Active Agents:</span>
            {runningBackgroundTabs.map((t) => (
              <button
                key={t.tabId}
                onClick={() => handleSelectTargetTab(String(t.tabId))}
                className={`text-[10px] px-2 py-0.5 rounded-full border flex items-center gap-1 shrink-0 transition-colors ${
                  currentTabId === t.tabId
                    ? 'bg-emerald-950 text-emerald-200 border-emerald-500'
                    : 'bg-slate-950 text-slate-300 border-slate-700 hover:border-emerald-700'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                <span className="truncate max-w-[95px]">{t.title}</span>
                <span className="text-emerald-400 font-mono">S{t.stepNumber}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {activeTab.isInternal && !pinnedTabId && (
        <div className="flex items-start gap-1.5 bg-amber-950/40 border border-amber-600/30 rounded-lg px-2.5 py-2 mb-2.5 text-[11px] text-amber-300">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <span>
            Target is a Chrome internal page. Switch your browser tab or pick a target tab from the dropdown above.
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
