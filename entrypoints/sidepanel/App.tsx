import React, { useState, useEffect, useCallback } from 'react';
import { AgentSessionState, TabSessionSummary } from '../../src/lib/agent/types';
import { TokenTelemetryHUD } from './components/TokenTelemetryHUD';
import { ApiKeyVault } from './components/ApiKeyVault';
import { SkillsDrawer } from './components/SkillsDrawer';
import { ApprovalModal } from './components/ApprovalModal';
import { TaskStream, QuickModelOption } from './components/TaskStream';
import { PageInspectorPanel } from './components/PageInspectorPanel';
import { globalSkillStore, SiteSkill } from '../../src/lib/skills/skillStore';
import {
  KeyRound,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  Layers,
  MessageSquare,
  Activity,
  Eye,
  Shield,
} from 'lucide-react';

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
  thinkingHistory: [],
};

interface ActiveTabInfo {
  id?: number;
  title?: string;
  url?: string;
  isInternal?: boolean;
}

type NavSection = 'chat' | 'inspector' | 'telemetry' | 'skills';

export default function App(): React.JSX.Element {
  const [activeSection, setActiveSection] = useState<NavSection>('chat');
  const [state, setState] = useState<AgentSessionState>(INITIAL_STATE);
  const [promptsByTab, setPromptsByTab] = useState<Record<number, string>>({});
  const [vaultOpen, setVaultOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTabInfo>({});
  const [tabSessions, setTabSessions] = useState<TabSessionSummary[]>([]);
  const [pinnedTabId, setPinnedTabId] = useState<number | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>('gemini');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.8-flash');

  const currentTabId = pinnedTabId ?? activeTab.id ?? 0;
  const prompt = promptsByTab[currentTabId] ?? '';

  const setPrompt = (val: string) => {
    setPromptsByTab((prev) => ({ ...prev, [currentTabId]: val }));
  };

  // Load saved model preference for the inline chat dropdown
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get('modelRoutingConfig').then((data) => {
        const cfg = data?.modelRoutingConfig;
        if (cfg) {
          const prov = cfg.preferredTier1Provider || 'gemini';
          setSelectedProvider(prov);
          if (prov === 'gemini' && cfg.geminiModel) setSelectedModel(cfg.geminiModel);
          else if (prov === 'groq' && cfg.groqModel) setSelectedModel(cfg.groqModel);
          else if (prov === 'openrouter' && cfg.openRouterModel) setSelectedModel(cfg.openRouterModel);
        }
      });
    }
  }, [vaultOpen]);

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

  const handleQuickSelectModel = (provider: QuickModelOption['provider'], model: string) => {
    setSelectedProvider(provider);
    setSelectedModel(model);
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'SET_ACTIVE_MODEL',
        provider,
        model,
      });
    }
  };

  const handleStartTask = async (taskGoal?: string) => {
    const goalToRun = taskGoal ?? prompt;
    if (!goalToRun.trim()) return;

    // Dassi slash skill command interceptor (/<skill_name> directly executes zero-token reflex)
    if (goalToRun.startsWith('/')) {
      const slashQuery = goalToRun.slice(1).trim().toLowerCase();
      try {
        const allSkills = await globalSkillStore.listSkills();
        const matched = allSkills.find(
          (s) =>
            s.id.toLowerCase() === slashQuery ||
            s.goalPattern.toLowerCase().includes(slashQuery) ||
            s.hostname.toLowerCase().includes(slashQuery)
        );
        if (matched) {
          handleRunSkill(matched);
          return;
        }
      } catch (err) {
        console.warn('[Vision AI] Failed to match slash command against skills:', err);
      }
    }

    setActiveSection('chat');
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
    <div className="flex flex-col h-screen w-full bg-vision-bg text-slate-100 p-3 select-none font-sans overflow-hidden">
      {/* Marvel's Vision Synthezoid Header */}
      <header className="flex items-center justify-between border-b border-vision-border pb-2.5 mb-2">
        <div className="flex items-center gap-2.5">
          {/* Mind Stone Diamond Emblem */}
          <div className="relative flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-vision-crimson via-rose-800 to-vision-panel border border-vision-gold/60 mindstone-glow">
            <div className="w-2.5 h-2.5 rotate-45 bg-vision-gold shadow-sm" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-tight flex items-center gap-1.5 text-white">
              VISION AI
              <span className="text-[9px] bg-vision-crimson/20 text-vision-gold border border-vision-crimson/40 px-1.5 py-0.2 rounded font-mono font-semibold">
                SYNTHEZOID v2.0
              </span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setSkillsOpen(true)}
            className="flex items-center gap-1 text-xs bg-vision-panel hover:bg-vision-card border border-vision-border hover:border-vision-teal/50 px-2 py-1.5 rounded-lg text-slate-200 hover:text-vision-tealBright transition-colors"
            title="Saved 0-Token Domain Reflexes"
          >
            <Sparkles className="w-3.5 h-3.5 text-vision-tealBright" />
            <span className="text-[11px] font-semibold">Skills</span>
          </button>
          <button
            onClick={() => setVaultOpen(true)}
            className="flex items-center gap-1 text-xs bg-vision-panel hover:bg-vision-card border border-vision-border hover:border-vision-gold/50 px-2 py-1.5 rounded-lg text-slate-200 hover:text-vision-gold transition-colors"
            title="API Keys & Provider Vault"
          >
            <KeyRound className="w-3.5 h-3.5 text-vision-gold" />
            <span className="text-[11px] font-semibold">Vault</span>
          </button>
        </div>
      </header>

      {/* Multi-Tab Target Bar */}
      <div className="flex flex-col gap-1.5 bg-vision-panel/90 border border-vision-border rounded-xl px-2.5 py-1.5 mb-2 text-[11px]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <Layers className="w-3.5 h-3.5 text-vision-crimsonLight shrink-0" />
            <span className="text-slate-400 shrink-0 font-semibold">Tab:</span>
            <select
              value={pinnedTabId ? String(pinnedTabId) : 'auto'}
              onChange={(e) => handleSelectTargetTab(e.target.value)}
              className="bg-vision-bg border border-vision-border rounded-lg px-2 py-0.5 text-[11px] text-slate-200 truncate flex-1 focus:border-vision-gold focus:outline-none"
            >
              <option value="auto">
                Active Tab ({activeTab.title?.slice(0, 28) || 'Current'})
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
            title="Refresh open browser tabs"
            className="text-slate-400 hover:text-vision-gold p-1 rounded hover:bg-vision-card transition-colors shrink-0"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>

        {runningBackgroundTabs.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pt-1 border-t border-vision-border/70">
            <span className="text-[10px] text-vision-gold font-semibold shrink-0">Running:</span>
            {runningBackgroundTabs.map((t) => (
              <button
                key={t.tabId}
                onClick={() => handleSelectTargetTab(String(t.tabId))}
                className={`text-[10px] px-2 py-0.5 rounded-full border flex items-center gap-1 shrink-0 transition-colors ${
                  currentTabId === t.tabId
                    ? 'bg-vision-crimson/30 text-white border-vision-gold'
                    : 'bg-vision-bg text-slate-300 border-vision-border hover:border-vision-gold/50'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-vision-gold animate-ping" />
                <span className="truncate max-w-[95px]">{t.title}</span>
                <span className="text-vision-gold font-mono">S{t.stepNumber}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Segmented Section Switcher (Chat | Vision X-Ray | Telemetry | Vault) */}
      <nav className="grid grid-cols-4 gap-1 bg-vision-panel p-1 rounded-xl border border-vision-border mb-2.5 shrink-0">
        <button
          type="button"
          onClick={() => setActiveSection('chat')}
          className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
            activeSection === 'chat'
              ? 'bg-gradient-to-r from-vision-crimson to-rose-700 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <MessageSquare className="w-3 h-3" />
          <span>Chat</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('inspector')}
          className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
            activeSection === 'inspector'
              ? 'bg-gradient-to-r from-vision-crimson to-rose-700 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Eye className="w-3 h-3" />
          <span>X-Ray</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('telemetry')}
          className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
            activeSection === 'telemetry'
              ? 'bg-gradient-to-r from-vision-crimson to-rose-700 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity className="w-3 h-3" />
          <span>Telemetry</span>
          {state.tokenMetrics.estimatedCostDiscountPercent > 0 && (
            <span className="text-[9px] font-mono text-vision-gold">
              {state.tokenMetrics.estimatedCostDiscountPercent}%
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('skills')}
          className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
            activeSection === 'skills'
              ? 'bg-gradient-to-r from-vision-crimson to-rose-700 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Shield className="w-3 h-3" />
          <span>System</span>
        </button>
      </nav>

      {activeTab.isInternal && !pinnedTabId && (
        <div className="flex items-start gap-1.5 bg-amber-950/40 border border-vision-gold/40 rounded-lg px-2.5 py-1.5 mb-2 text-[11px] text-amber-200">
          <AlertTriangle className="w-3.5 h-3.5 text-vision-gold shrink-0 mt-0.5" />
          <span>
            Switch to a regular website tab (e.g. Coursera, NetAcad, YouTube) or select a tab above.
          </span>
        </div>
      )}

      {/* SECTION 1: Main Chat + Model Selector + Thinking Steps */}
      {activeSection === 'chat' && (
        <TaskStream
          state={state}
          prompt={prompt}
          onPromptChange={setPrompt}
          onStart={(override) => handleStartTask(override)}
          onPause={handlePause}
          onResume={handleResume}
          onStop={handleStop}
          onReset={handleReset}
          selectedProvider={selectedProvider}
          selectedModel={selectedModel}
          onSelectModel={handleQuickSelectModel}
          onOpenVault={() => setVaultOpen(true)}
        />
      )}

      {/* SECTION 2: Live DOM X-Ray Inspector & 1-Click Coursera/LMS Macros */}
      {activeSection === 'inspector' && (
        <PageInspectorPanel
          tabId={currentTabId}
          onLaunchMacroGoal={(macroGoal) => {
            setPrompt(macroGoal);
            handleStartTask(macroGoal);
          }}
        />
      )}

      {/* SECTION 3: Dedicated Token Telemetry & Mind Stone Diagnostics */}
      {activeSection === 'telemetry' && (
        <div className="flex-1 overflow-y-auto">
          <TokenTelemetryHUD
            metrics={state.tokenMetrics}
            activeTier={state.activeTier}
            activeProvider={state.activeProvider || selectedProvider}
            activeModel={state.activeModel || selectedModel}
            stepCount={state.stepNumber}
            traceCount={state.completedTraces.length}
          />
        </div>
      )}

      {/* SECTION 4: System Hub (Quick access to 0-Token Skills & API Keys) */}
      {activeSection === 'skills' && (
        <div className="flex-1 flex flex-col gap-3 overflow-y-auto">
          <div className="bg-vision-panel border border-vision-border rounded-xl p-3.5 flex flex-col gap-2.5">
            <div className="text-xs font-bold text-vision-gold uppercase tracking-wider flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5" />
              <span>Multi-LLM API Vault & Failover</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Configure API keys for Gemini, Groq, OpenRouter, Anthropic Claude, and Local Ollama with automatic 429/404 model failover.
            </p>
            <button
              type="button"
              onClick={() => setVaultOpen(true)}
              className="w-full py-2 rounded-lg bg-gradient-to-r from-vision-crimson to-rose-700 hover:from-rose-600 hover:to-rose-500 text-white font-bold text-xs shadow-md transition-all"
            >
              Open Full API Key & Model Vault
            </button>
          </div>

          <div className="bg-vision-panel border border-vision-border rounded-xl p-3.5 flex flex-col gap-2.5">
            <div className="text-xs font-bold text-vision-tealBright uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Zero-Token Learned Site Reflexes</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Successful multi-step runs are automatically compiled into deterministic CSS/ARIA workflows in IndexedDB for 0-token replay.
            </p>
            <button
              type="button"
              onClick={() => setSkillsOpen(true)}
              className="w-full py-2 rounded-lg bg-vision-card hover:bg-vision-border text-vision-tealBright border border-vision-teal/40 font-bold text-xs transition-all"
            >
              Manage Saved 0-Token Skills
            </button>
          </div>
        </div>
      )}

      {/* Human-in-the-Loop Intercept Modal */}
      {state.requiresApproval && (
        <ApprovalModal
          action={state.approvalDetails?.action}
          reason={state.approvalDetails?.reason}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      )}

      {/* Modals */}
      <ApiKeyVault isOpen={vaultOpen} onClose={() => setVaultOpen(false)} />
      <SkillsDrawer
        isOpen={skillsOpen}
        onClose={() => setSkillsOpen(false)}
        onRunSkill={handleRunSkill}
      />
    </div>
  );
}
