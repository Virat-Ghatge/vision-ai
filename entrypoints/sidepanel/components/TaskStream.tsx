import React, { useState, useRef, useEffect } from 'react';
import { AgentSessionState, ThinkingStep } from '../../../src/lib/agent/types';
import {
  Play,
  Pause,
  Square,
  Sparkles,
  CheckCircle,
  AlertCircle,
  Loader2,
  RotateCcw,
  Cpu,
  ChevronDown,
  ChevronRight,
  Brain,
  Terminal,
  Send,
  GraduationCap,
} from 'lucide-react';

export interface QuickModelOption {
  provider: 'openrouter' | 'groq' | 'gemini' | 'anthropic';
  model: string;
  label: string;
  badge: string;
}

export const QUICK_MODEL_OPTIONS: QuickModelOption[] = [
  {
    provider: 'gemini',
    model: 'gemini-3.8-flash',
    label: 'Gemini 3.8 Flash',
    badge: 'Fast • Vision',
  },
  {
    provider: 'gemini',
    model: 'gemini-3.6-flash',
    label: 'Gemini 3.6 Flash',
    badge: 'Efficient',
  },
  {
    provider: 'gemini',
    model: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro',
    badge: 'Reasoning',
  },
  {
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    label: 'Groq • Llama 3.3 70B',
    badge: '500 tok/s',
  },
  {
    provider: 'groq',
    model: 'llama-3.1-8b-instant',
    label: 'Groq • Llama 3.1 8B',
    badge: 'Instant',
  },
  {
    provider: 'openrouter',
    model: 'openrouter/free',
    label: 'OpenRouter • Auto Free',
    badge: '0$ Failover',
  },
  {
    provider: 'openrouter',
    model: 'google/gemma-4-31b-it:free',
    label: 'OpenRouter • Gemma 4 31B',
    badge: 'Free',
  },
  {
    provider: 'anthropic',
    model: 'claude-3-7-sonnet-20250219',
    label: 'Claude 3.7 Sonnet',
    badge: 'Cached',
  },
];

const QUICK_PROMPTS = [
  {
    label: '🎓 Coursera: Open & Complete Section',
    prompt:
      'Open the current study material or video lecture, complete any video media, scroll down if needed, and click Mark as complete or Next.',
  },
  {
    label: '📚 NetAcad: Advance Module',
    prompt:
      'Expand the current module accordion, open the active lesson, scroll through the content, and click Next or Complete.',
  },
  {
    label: '🔥 GitHub Trending TS',
    prompt: 'Find top trending TypeScript repo on GitHub',
  },
];

interface Props {
  state: AgentSessionState;
  prompt: string;
  onPromptChange: (val: string) => void;
  onStart: (overrideGoal?: string) => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onReset: () => void;
  selectedProvider?: string;
  selectedModel?: string;
  onSelectModel?: (provider: QuickModelOption['provider'], model: string) => void;
  onOpenVault?: () => void;
}

export function TaskStream({
  state,
  prompt,
  onPromptChange,
  onStart,
  onPause,
  onResume,
  onStop,
  onReset,
  selectedProvider = 'gemini',
  selectedModel = 'gemini-3.8-flash',
  onSelectModel,
  onOpenVault,
}: Props): React.JSX.Element {
  const [expandedSteps, setExpandedSteps] = useState<Record<number, boolean>>({});
  const streamEndRef = useRef<HTMLDivElement | null>(null);

  const isRunning = state.status === 'running';
  const isPaused = state.status === 'paused';
  const isWaiting = state.status === 'waiting_approval';
  const isCompleted = state.status === 'completed';
  const isError = state.status === 'error';

  const thinkingSteps: ThinkingStep[] =
    state.thinkingHistory && state.thinkingHistory.length > 0
      ? state.thinkingHistory
      : state.currentThought
      ? [
          {
            stepNumber: state.stepNumber || 1,
            thought: state.currentThought,
            actions: state.pendingActions || [],
            executedTraces: state.completedTraces,
            status: isRunning ? 'thinking' : isError ? 'error' : 'done',
            timestamp: Date.now(),
            provider: state.activeProvider,
            model: state.activeModel,
          },
        ]
      : [];

  useEffect(() => {
    streamEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thinkingSteps.length, state.status, state.currentThought]);

  const toggleStep = (stepNum: number) => {
    setExpandedSteps((prev) => ({
      ...prev,
      [stepNum]: !(prev[stepNum] ?? true),
    }));
  };

  const activeProviderDisplay = state.activeProvider || selectedProvider;
  const activeModelDisplay = state.activeModel || selectedModel;
  const currentDropdownValue = `${activeProviderDisplay}::${activeModelDisplay}`;

  return (
    <div className="flex-1 flex flex-col gap-2.5 overflow-hidden">
      {/* Inline Model Selection Bar inside Main Chat Section */}
      <div className="bg-vision-panel/95 border border-vision-border rounded-xl px-2.5 py-2 flex items-center justify-between gap-2 shadow-md">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <div className="w-2 h-2 rounded-full bg-vision-gold mindstone-glow shrink-0" />
          <Cpu className="w-3.5 h-3.5 text-vision-tealBright shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0">
            Mind Core:
          </span>
          <select
            aria-label="Select AI Model"
            value={
              QUICK_MODEL_OPTIONS.some((o) => `${o.provider}::${o.model}` === currentDropdownValue)
                ? currentDropdownValue
                : `${selectedProvider}::${selectedModel}`
            }
            onChange={(e) => {
              const [prov, mod] = e.target.value.split('::');
              if (prov && mod && onSelectModel) {
                onSelectModel(prov as QuickModelOption['provider'], mod);
              }
            }}
            className="bg-vision-bg border border-vision-border hover:border-vision-crimson/60 focus:border-vision-gold rounded-lg px-2 py-1 text-[11px] font-medium text-slate-100 truncate flex-1 focus:outline-none transition-colors"
          >
            {QUICK_MODEL_OPTIONS.map((opt) => (
              <option key={`${opt.provider}::${opt.model}`} value={`${opt.provider}::${opt.model}`}>
                {opt.label} ({opt.badge})
              </option>
            ))}
          </select>
        </div>

        {onOpenVault && (
          <button
            type="button"
            onClick={onOpenVault}
            className="text-[10px] px-2 py-1 rounded-md bg-vision-card hover:bg-vision-border text-vision-gold border border-vision-gold/30 font-semibold shrink-0 transition-colors"
            title="Configure API Keys & All Provider Models"
          >
            Keys ⚙
          </button>
        )}
      </div>

      {/* Main Conversational Chat & Thinking Steps Stream */}
      <div className="flex-1 bg-vision-panel/90 border border-vision-border rounded-xl p-3 shadow-inner flex flex-col gap-2.5 overflow-y-auto">
        {/* Stream Status Header */}
        <div className="flex items-center justify-between border-b border-vision-border/80 pb-2">
          <div className="flex items-center gap-2">
            {isRunning && <Loader2 className="w-3.5 h-3.5 text-vision-gold animate-spin" />}
            {isCompleted && <CheckCircle className="w-3.5 h-3.5 text-vision-tealBright" />}
            {isError && <AlertCircle className="w-3.5 h-3.5 text-vision-crimsonLight" />}
            {!isRunning && !isCompleted && !isError && (
              <Brain className="w-3.5 h-3.5 text-vision-gold" />
            )}
            <span className="text-xs font-bold text-slate-100 tracking-tight">
              {isRunning
                ? `Synthesizing Step ${state.stepNumber} of ${state.maxSteps}`
                : isCompleted
                ? 'Mission Accomplished'
                : isError
                ? 'Execution Interrupted'
                : 'Synthezoid Reasoning Stream'}
            </span>
          </div>

          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
              isRunning
                ? 'bg-vision-gold/15 text-vision-gold border border-vision-gold/40 animate-pulse'
                : isWaiting
                ? 'bg-amber-950 text-amber-300 border border-amber-700'
                : isCompleted
                ? 'bg-teal-950/90 text-vision-tealBright border border-vision-teal/40'
                : isError
                ? 'bg-rose-950/90 text-vision-crimsonLight border border-vision-crimson/50'
                : 'bg-vision-card text-slate-400 border border-vision-border'
            }`}
          >
            {state.status.replace('_', ' ')}
          </span>
        </div>

        {/* User Goal Chat Bubble */}
        {state.goal && (
          <div className="self-end max-w-[90%] bg-gradient-to-br from-vision-crimson/90 to-rose-900/90 border border-vision-crimsonLight/40 text-white rounded-2xl rounded-tr-xs px-3 py-2 text-xs shadow-md">
            <div className="text-[9px] uppercase tracking-wider text-rose-200/90 font-bold mb-0.5">
              Operator Directive
            </div>
            <div className="leading-relaxed select-text">{state.goal}</div>
          </div>
        )}

        {/* Model Failover Notice */}
        {state.fallbackNotice && (
          <div className="bg-amber-950/60 border border-vision-gold/50 rounded-lg p-2 text-[11px] text-amber-200 flex items-center gap-2">
            <span className="text-vision-gold font-bold shrink-0">⚡ Auto-Failover:</span>
            <span className="truncate">{state.fallbackNotice}</span>
          </div>
        )}

        {/* Chronological Mind Stone Thinking Steps Timeline */}
        {thinkingSteps.length === 0 && !state.error ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-6 px-3 gap-2">
            <div className="w-9 h-9 rounded-full bg-vision-card border border-vision-gold/40 flex items-center justify-center mindstone-glow">
              <Sparkles className="w-4 h-4 text-vision-gold" />
            </div>
            <div className="text-xs font-bold text-slate-200">
              Vision AI Mind Stone Online
            </div>
            <p className="text-[11px] text-slate-400 max-w-[230px] leading-relaxed">
               command Vision to navigate Coursera, NetAcad, YouTube, or any web app. Live thinking steps and DOM actions will stream here.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {thinkingSteps.map((step) => {
              const isExpanded = expandedSteps[step.stepNumber] ?? true;
              const traces = step.executedTraces || [];

              return (
                <div
                  key={step.stepNumber}
                  className="bg-vision-card/90 border border-vision-border rounded-xl overflow-hidden transition-all"
                >
                  {/* Thinking Step Header */}
                  <button
                    type="button"
                    onClick={() => toggleStep(step.stepNumber)}
                    className="w-full px-2.5 py-2 flex items-center justify-between bg-vision-bg/60 hover:bg-vision-bg text-left transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-vision-gold shrink-0" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-vision-gold/15 text-vision-gold border border-vision-gold/30 shrink-0">
                        STEP {step.stepNumber}
                      </span>
                      <span className="text-[11px] text-slate-200 font-medium truncate">
                        {step.thought}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {step.status === 'thinking' && (
                        <span className="text-[9px] text-vision-gold font-mono flex items-center gap-1">
                          <Loader2 className="w-2.5 h-2.5 animate-spin" /> thinking
                        </span>
                      )}
                      {step.status === 'acting' && (
                        <span className="text-[9px] text-vision-tealBright font-mono animate-pulse">
                          acting...
                        </span>
                      )}
                      {step.status === 'done' && (
                        <span className="text-[9px] text-vision-tealBright font-mono">
                          ✓ {traces.length || step.actions.length} act
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Expanded Thinking Rationale & Actions */}
                  {isExpanded && (
                    <div className="p-2.5 flex flex-col gap-2 border-t border-vision-border/60 text-xs">
                      <div className="flex items-start gap-2 text-slate-200 leading-relaxed">
                        <Brain className="w-3.5 h-3.5 text-vision-gold shrink-0 mt-0.5" />
                        <div className="select-text">
                          <span className="font-semibold text-vision-gold text-[10px] uppercase tracking-wider block mb-0.5">
                            Reasoning ({step.provider || activeProviderDisplay})
                          </span>
                          {step.thought}
                        </div>
                      </div>

                      {/* Planned or Executed Actions inside this Step */}
                      {(traces.length > 0 || step.actions.length > 0) && (
                        <div className="flex flex-col gap-1 pl-5">
                          {(traces.length > 0
                            ? traces
                            : step.actions.map((a) => ({ action: a, success: true, timestamp: 0 }))
                          ).map((t, idx) => (
                            <div
                              key={idx}
                              className="bg-vision-bg/90 border border-vision-border/80 rounded-lg px-2 py-1 flex items-center justify-between text-[11px] font-mono"
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Terminal className="w-3 h-3 text-vision-tealBright shrink-0" />
                                <span className="text-vision-tealBright font-bold uppercase">
                                  {t.action.type}
                                </span>
                                {t.action.id !== undefined && (
                                  <span className="text-vision-gold">[{t.action.id}]</span>
                                )}
                                {t.action.value && (
                                  <span className="text-slate-300 truncate max-w-[135px]">
                                    &quot;{t.action.value}&quot;
                                  </span>
                                )}
                              </div>
                              <span
                                className={`text-[10px] shrink-0 ${
                                  t.success ? 'text-vision-tealBright' : 'text-vision-crimsonLight'
                                }`}
                              >
                                {t.success ? '✓ OK' : '✕ ERR'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Final Completed Answer Card */}
        {isCompleted && state.currentThought && (
          <div className="bg-gradient-to-br from-teal-950/60 via-vision-card to-vision-panel border border-vision-teal/50 rounded-xl p-3 text-xs text-slate-100 flex flex-col gap-1.5 shadow-lg">
            <div className="flex items-center gap-1.5 text-vision-tealBright font-bold text-[11px] uppercase tracking-wider">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Final Synthezoid Outcome</span>
            </div>
            <div className="font-sans leading-relaxed whitespace-pre-wrap select-text">
              {state.currentThought}
            </div>
          </div>
        )}

        {/* Error Banner */}
        {state.error && (
          <div className="bg-rose-950/60 border border-vision-crimson/60 rounded-xl p-2.5 text-xs text-rose-200">
            <span className="font-bold text-vision-crimsonLight block mb-0.5">System Alert:</span>
            {state.error}
          </div>
        )}

        <div ref={streamEndRef} />
      </div>

      {/* Bottom Chat Input Composer & Execution Controls */}
      <div className="bg-vision-panel border border-vision-border rounded-xl p-2.5 shadow-lg flex flex-col gap-2">
        {/* Quick LMS & Browser Presets */}
        {state.status === 'idle' && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {QUICK_PROMPTS.map((item, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onPromptChange(item.prompt)}
                className="text-[10px] bg-vision-card hover:bg-vision-border/80 text-slate-300 hover:text-vision-gold border border-vision-border px-2 py-1 rounded-lg shrink-0 transition-colors flex items-center gap-1"
              >
                {i === 0 && <GraduationCap className="w-3 h-3 text-vision-gold" />}
                {item.label}
              </button>
            ))}
          </div>
        )}

        {prompt.startsWith('/') && (
          <div className="flex items-center gap-1.5 text-[11px] text-vision-tealBright bg-teal-950/40 border border-vision-teal/40 rounded-lg px-2.5 py-1">
            <Sparkles className="w-3.5 h-3.5 text-vision-tealBright animate-pulse shrink-0" />
            <span className="font-semibold">Slash Skill Mode:</span>
            <span className="text-slate-300">Type /&lt;skill_name&gt; for 0-token direct reflex execution</span>
          </div>
        )}

        <div className="relative flex items-end gap-1.5">
          <textarea
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (prompt.trim() && !isRunning && !isWaiting) {
                  onStart();
                }
              }
            }}
            disabled={isRunning || isWaiting}
            rows={2}
            placeholder="Command Vision AI (e.g. 'Open study material, complete lecture video, and click Mark as complete')..."
            className="w-full bg-vision-bg border border-vision-border focus:border-vision-gold rounded-xl p-2.5 pr-9 text-xs text-slate-100 placeholder-slate-500 focus:outline-none resize-none font-sans"
          />
        </div>

        {/* Action Buttons Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {isRunning && (
              <button
                type="button"
                onClick={onPause}
                className="flex items-center gap-1 px-3 py-1.5 bg-amber-600/90 hover:bg-amber-500 text-slate-950 rounded-lg text-xs font-bold transition-colors"
              >
                <Pause className="w-3.5 h-3.5" /> Pause
              </button>
            )}
            {isPaused && (
              <button
                type="button"
                onClick={onResume}
                className="flex items-center gap-1 px-3 py-1.5 bg-vision-teal hover:bg-vision-tealBright text-slate-950 rounded-lg text-xs font-bold transition-colors"
              >
                <Play className="w-3.5 h-3.5 fill-slate-950" /> Resume
              </button>
            )}
            {(isRunning || isPaused || isWaiting) && (
              <button
                type="button"
                onClick={onStop}
                className="flex items-center gap-1 px-3 py-1.5 bg-rose-950 hover:bg-rose-900 text-rose-200 border border-vision-crimson/60 rounded-lg text-xs font-semibold transition-colors"
              >
                <Square className="w-3.5 h-3.5" /> Stop
              </button>
            )}
            {(isCompleted || isError || thinkingSteps.length > 0) && !isRunning && (
              <button
                type="button"
                onClick={onReset}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-vision-card hover:bg-vision-border text-slate-300 hover:text-white border border-vision-border rounded-lg text-xs font-semibold transition-colors"
                title="Clear chat history and start fresh"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Clear
              </button>
            )}
          </div>

          {!isRunning && !isPaused && !isWaiting && (
            <button
              type="button"
              onClick={() => onStart()}
              disabled={!prompt.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-vision-crimson via-rose-500 to-vision-gold hover:from-rose-500 hover:to-yellow-400 disabled:opacity-40 text-white font-bold rounded-lg text-xs shadow-md transition-all ml-auto"
            >
              <Send className="w-3 h-3" />
              {isCompleted ? 'Run Next Directive' : isError ? 'Retry Directive' : 'Launch Vision AI'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

