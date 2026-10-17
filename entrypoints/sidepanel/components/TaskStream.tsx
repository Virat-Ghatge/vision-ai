import React from 'react';
import { AgentSessionState } from '../../../src/lib/agent/types';
import { Play, Pause, Square, Sparkles, CheckCircle, AlertCircle, Loader2, RotateCcw } from 'lucide-react';

interface Props {
  state: AgentSessionState;
  prompt: string;
  onPromptChange: (val: string) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onReset: () => void;
}

const QUICK_PROMPTS = [
  'Search arXiv for latest autonomous agent papers',
  'Find top trending TypeScript repo on GitHub',
  'Fill checkout form with demo billing address',
];

export function TaskStream({
  state,
  prompt,
  onPromptChange,
  onStart,
  onPause,
  onResume,
  onStop,
  onReset,
}: Props): React.JSX.Element {
  const isRunning = state.status === 'running';
  const isPaused = state.status === 'paused';
  const isWaiting = state.status === 'waiting_approval';
  const isCompleted = state.status === 'completed';
  const isError = state.status === 'error';

  return (
    <div className="flex-1 flex flex-col gap-3 overflow-hidden">
      {/* Prompt Input Form */}
      <div className="bg-orbit-panel border border-orbit-border rounded-xl p-3 shadow-md">
        <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
          Autonomous Task Goal
        </label>
        <div className="flex flex-col gap-2">
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
            placeholder="Describe what you want Vision AI to do in this browser tab... (Press Enter to launch)"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 placeholder-slate-500 focus:border-orbit-accent focus:outline-none resize-none font-sans"
          />

          {/* Quick Prompts */}
          {state.status === 'idle' && (
            <div className="flex flex-wrap gap-1.5">
              {QUICK_PROMPTS.map((qp, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onPromptChange(qp)}
                  className="text-[10px] bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 px-2 py-1 rounded-md transition-colors"
                >
                  {qp}
                </button>
              ))}
            </div>
          )}

          {/* Action Controls */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1.5">
              {isRunning && (
                <button
                  type="button"
                  onClick={onPause}
                  className="flex items-center gap-1 px-3 py-1.5 bg-amber-600/80 hover:bg-amber-600 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  <Pause className="w-3.5 h-3.5" /> Pause
                </button>
              )}
              {isPaused && (
                <button
                  type="button"
                  onClick={onResume}
                  className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  <Play className="w-3.5 h-3.5 fill-white" /> Resume
                </button>
              )}
              {(isRunning || isPaused || isWaiting) && (
                <button
                  type="button"
                  onClick={onStop}
                  className="flex items-center gap-1 px-3 py-1.5 bg-rose-900/60 hover:bg-rose-900 text-rose-200 border border-rose-800/80 rounded-lg text-xs font-semibold transition-colors"
                >
                  <Square className="w-3.5 h-3.5" /> Stop
                </button>
              )}
              {(isCompleted || isError) && (
                <button
                  type="button"
                  onClick={onReset}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-lg text-xs font-semibold transition-colors"
                  title="Clear session and start a new task"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> New Task
                </button>
              )}
            </div>

            {/* Launch / Re-run Button */}
            {!isRunning && !isPaused && !isWaiting && (
              <button
                type="button"
                onClick={onStart}
                disabled={!prompt.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-emerald-500 to-orbit-neon hover:from-emerald-400 hover:to-orbit-500 disabled:opacity-40 text-slate-950 font-bold rounded-lg text-xs shadow-md transition-all ml-auto"
              >
                {isCompleted ? (
                  <>
                    <Sparkles className="w-3.5 h-3.5" /> Run Next Step
                  </>
                ) : isError ? (
                  <>
                    <Sparkles className="w-3.5 h-3.5" /> Retry Task
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" /> Launch Vision AI
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Live Step Progression & Thought Stream */}
      <div className="flex-1 bg-orbit-panel border border-orbit-border rounded-xl p-3 shadow-md flex flex-col gap-2.5 overflow-hidden">
        <div className="flex items-center justify-between border-b border-orbit-border pb-2">
          <div className="flex items-center gap-2">
            {isRunning && <Loader2 className="w-3.5 h-3.5 text-orbit-neon animate-spin" />}
            {isCompleted && <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />}
            {isError && <AlertCircle className="w-3.5 h-3.5 text-rose-400" />}
            <span className="text-xs font-bold text-slate-200">
              {isRunning
                ? `Step ${state.stepNumber} of ${state.maxSteps}`
                : isCompleted
                ? 'Task Completed Successfully'
                : isError
                ? 'Task Halted'
                : 'Execution Stream'}
            </span>
          </div>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${
              isRunning
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800 animate-pulse'
                : isWaiting
                ? 'bg-amber-950 text-amber-300 border border-amber-800'
                : isPaused
                ? 'bg-slate-800 text-slate-400 border border-slate-700'
                : isCompleted
                ? 'bg-emerald-900/60 text-emerald-200'
                : 'bg-slate-800 text-slate-500'
            }`}
          >
            {state.status.replace('_', ' ')}
          </span>
        </div>

        {/* Auto-Switch Fallback Notice */}
        {state.fallbackNotice && (
          <div className="bg-amber-950/60 border border-amber-700/80 rounded-lg p-2.5 text-xs text-amber-200 flex items-center gap-2 animate-pulse">
            <span className="text-amber-400 font-bold">⚡ Model Failover:</span>
            <span>{state.fallbackNotice}</span>
          </div>
        )}

        {/* Completed Result Card */}
        {isCompleted && state.currentThought && (
          <div className="bg-emerald-950/40 border border-emerald-500/50 rounded-lg p-3 text-xs text-emerald-100 flex flex-col gap-1.5 shadow-sm">
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-[11px] uppercase tracking-wide">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Final Outcome / Answer</span>
            </div>
            <div className="text-slate-100 font-sans leading-relaxed whitespace-pre-wrap select-text">
              {state.currentThought}
            </div>
          </div>
        )}

        {/* Thought Bubble */}
        {!isCompleted && state.currentThought && (
          <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-300 italic flex items-start gap-2">
            <span className="text-orbit-accent font-bold not-italic">Thought:</span>
            <span>{state.currentThought}</span>
          </div>
        )}

        {/* Error message if any */}
        {state.error && (
          <div className="bg-rose-950/40 border border-rose-800/60 rounded-lg p-2.5 text-xs text-rose-300">
            {state.error}
          </div>
        )}

        {/* Action Traces Log */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 pr-1">
          {state.completedTraces.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-xs text-center p-4">
              Awaiting task instructions.
            </div>
          ) : (
            state.completedTraces.map((trace, idx) => (
              <div
                key={idx}
                className="bg-slate-900/70 border border-slate-800/80 rounded-md px-2.5 py-1.5 flex items-center justify-between text-xs font-mono"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500">#{idx + 1}</span>
                  <span className="text-orbit-neon font-bold uppercase">
                    {trace.action.type}
                  </span>
                  {trace.action.id !== undefined && (
                    <span className="text-sky-300">[{trace.action.id}]</span>
                  )}
                  {trace.action.value && (
                    <span className="text-slate-400 truncate max-w-[120px]">
                      &quot;{trace.action.value}&quot;
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-slate-500">
                  {trace.success ? '✓ OK' : '✕ ERR'}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
