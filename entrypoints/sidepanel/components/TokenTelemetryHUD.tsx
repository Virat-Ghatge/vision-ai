import React from 'react';
import { TokenMetrics } from '../../../src/lib/agent/types';
import { Zap, ShieldCheck } from 'lucide-react';

interface Props {
  metrics: TokenMetrics;
  activeTier?: number;
  activeProvider?: string;
}

export function TokenTelemetryHUD({ metrics, activeTier = 1, activeProvider = 'groq' }: Props): React.JSX.Element {
  const discount = metrics.estimatedCostDiscountPercent || 0;

  return (
    <div className="bg-gradient-to-r from-orbit-panel via-slate-900 to-orbit-panel rounded-xl border border-orbit-border p-3.5 shadow-lg">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
          <Zap className="w-3.5 h-3.5 text-orbit-neon" />
          <span>Token Telemetry HUD</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-slate-800 text-orbit-accent border border-slate-700 px-2 py-0.5 rounded font-mono">
            Tier {activeTier}: {activeProvider.toUpperCase()}
          </span>
          <span className="flex items-center gap-1 text-[11px] font-bold text-orbit-neon bg-orbit-neon/10 border border-orbit-neon/30 px-2 py-0.5 rounded-full">
            <ShieldCheck className="w-3 h-3" />
            {discount}% Saved
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center mb-2">
        <div className="bg-slate-900/80 rounded-lg p-2 border border-slate-800">
          <div className="text-[10px] text-slate-400">Cached Prefix</div>
          <div className="text-xs font-bold text-emerald-400 font-mono">
            {metrics.cachedPrefixTokens.toLocaleString()}
          </div>
          <div className="text-[9px] text-slate-500">90% off</div>
        </div>
        <div className="bg-slate-900/80 rounded-lg p-2 border border-slate-800">
          <div className="text-[10px] text-slate-400">Fresh Delta</div>
          <div className="text-xs font-bold text-sky-400 font-mono">
            {metrics.freshTokens.toLocaleString()}
          </div>
          <div className="text-[9px] text-slate-500">&lt;100 tok</div>
        </div>
        <div className="bg-slate-900/80 rounded-lg p-2 border border-slate-800">
          <div className="text-[10px] text-slate-400">Total Billed</div>
          <div className="text-xs font-bold text-amber-400 font-mono">
            {metrics.totalEstimatedTokens.toLocaleString()}
          </div>
          <div className="text-[9px] text-slate-500">effective</div>
        </div>
      </div>

      {/* Visual Token Savings Bar */}
      <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
        <div
          className="bg-gradient-to-r from-emerald-500 to-orbit-neon h-full transition-all duration-500 rounded-full"
          style={{ width: `${Math.max(8, discount)}%` }}
        />
      </div>
    </div>
  );
}
