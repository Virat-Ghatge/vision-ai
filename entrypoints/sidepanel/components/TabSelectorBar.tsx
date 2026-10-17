import React from 'react';
import { TabSessionSummary } from '../../../src/lib/agent/types';
import { Layers, Globe, RefreshCw, ExternalLink, Activity } from 'lucide-react';

export interface TabSelectorBarProps {
  sessions: TabSessionSummary[];
  selectedTabId: number;
  onSelectTab: (tabId: number) => void;
  onFocusChromeTab?: (tabId: number) => void;
  onRefreshTabs: () => void;
}

export function TabSelectorBar({
  sessions,
  selectedTabId,
  onSelectTab,
  onFocusChromeTab,
  onRefreshTabs,
}: TabSelectorBarProps): React.JSX.Element {
  const runningCount = sessions.filter((s) => s.status === 'running').length;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2 mb-2.5 shadow-sm text-xs">
      <div className="flex items-center justify-between mb-1.5 px-0.5">
        <div className="flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-orbit-accent" />
          <span className="font-semibold text-slate-300 text-[11px] tracking-wide uppercase">
            Workspaces ({sessions.length})
          </span>
          {runningCount > 0 && (
            <span className="flex items-center gap-1 bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 text-[10px] px-2 py-0.5 rounded-full font-mono font-medium animate-pulse">
              <Activity className="w-3 h-3 text-emerald-400" />
              {runningCount} Active {runningCount === 1 ? 'Agent' : 'Agents'}
            </span>
          )}
        </div>
        <button
          onClick={onRefreshTabs}
          title="Refresh tab list"
          className="text-slate-400 hover:text-slate-200 transition-colors p-1 rounded hover:bg-slate-800"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="text-[11px] text-slate-500 italic py-1 px-1 flex items-center gap-1">
          <Globe className="w-3 h-3 text-slate-600" />
          No open tabs detected.
        </div>
      ) : (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {sessions.map((tab) => {
            const isSelected = tab.tabId === selectedTabId;
            const isRunning = tab.status === 'running';
            const isWaiting = tab.status === 'waiting_approval';
            const isCompleted = tab.status === 'completed';
            const isPaused = tab.status === 'paused';

            return (
              <div
                key={tab.tabId}
                className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[11px] font-medium transition-all shrink-0 cursor-pointer ${
                  isSelected
                    ? 'bg-slate-800 border-orbit-accent/60 text-white shadow-sm ring-1 ring-orbit-accent/30'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
                onClick={() => onSelectTab(tab.tabId)}
              >
                <Globe className={`w-3 h-3 shrink-0 ${isSelected ? 'text-orbit-accent' : 'text-slate-500'}`} />

                <span
                  className="truncate max-w-[110px]"
                  title={`${tab.title}\n${tab.url}`}
                >
                  {tab.title || 'Tab ' + tab.tabId}
                </span>

                {isRunning && (
                  <span className="flex items-center gap-1 bg-emerald-950 text-emerald-400 border border-emerald-500/40 text-[9px] px-1.5 py-0.2 rounded-full font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
                    Step {tab.stepNumber}
                  </span>
                )}

                {isWaiting && (
                  <span className="bg-rose-950 text-rose-300 border border-rose-500/40 text-[9px] px-1.5 py-0.2 rounded-full font-mono animate-bounce">
                    Confirm
                  </span>
                )}

                {isPaused && (
                  <span className="bg-amber-950 text-amber-300 border border-amber-500/40 text-[9px] px-1.5 py-0.2 rounded-full font-mono">
                    Paused
                  </span>
                )}

                {isCompleted && (
                  <span className="bg-emerald-950/60 text-emerald-400 text-[9px] px-1 rounded font-mono">
                    ✓
                  </span>
                )}

                {onFocusChromeTab && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onFocusChromeTab(tab.tabId);
                    }}
                    title="Bring browser tab to front"
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-white p-0.5 rounded transition-opacity"
                  >
                    <ExternalLink className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
