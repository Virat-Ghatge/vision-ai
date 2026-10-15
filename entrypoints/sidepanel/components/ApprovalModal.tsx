import React from 'react';
import { MacroAction } from '../../../src/lib/llm/types';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

interface Props {
  action?: MacroAction;
  reason?: string;
  onApprove: () => void;
  onReject: () => void;
}

export function ApprovalModal({ action, reason, onApprove, onReject }: Props): React.JSX.Element {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-orbit-panel border-2 border-amber-500/80 rounded-xl w-full max-w-sm p-4 text-slate-100 shadow-2xl flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-2.5 text-amber-400">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 animate-bounce" />
          <h2 className="text-sm font-bold tracking-tight">Human-in-the-Loop Confirmation</h2>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 text-xs text-amber-200">
          {reason ?? 'A high-impact action has been intercepted and requires manual verification.'}
        </div>

        {action && (
          <div className="bg-slate-900 rounded-lg p-2.5 border border-slate-800 text-xs font-mono flex flex-col gap-1">
            <div className="text-[10px] uppercase text-slate-400 font-sans">Pending Action:</div>
            <div className="text-emerald-400 font-bold">
              {action.type.toUpperCase()} {action.id !== undefined && `[${action.id}]`}
            </div>
            {action.value && (
              <div className="text-slate-300 text-[11px] truncate">
                Value: &quot;{action.value}&quot;
              </div>
            )}
          </div>
        )}

        <p className="text-[11px] text-slate-400">
          OrbitAgent will pause execution until you grant permission.
        </p>

        <div className="flex items-center gap-2 pt-2 border-t border-orbit-border">
          <button
            onClick={onReject}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-rose-950/80 hover:bg-rose-900 border border-rose-700/60 text-rose-200 rounded-lg text-xs font-semibold transition-colors"
          >
            <XCircle className="w-4 h-4" />
            Reject & Pause
          </button>
          <button
            onClick={onApprove}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-md transition-colors"
          >
            <CheckCircle2 className="w-4 h-4" />
            Approve & Continue
          </button>
        </div>
      </div>
    </div>
  );
}
