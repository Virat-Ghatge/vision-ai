import React from 'react';
import { TokenMetrics } from '../../../src/lib/agent/types';
import { Zap, ShieldCheck, Cpu, Layers, TrendingDown } from 'lucide-react';

interface Props {
  metrics: TokenMetrics;
  activeTier?: number;
  activeProvider?: string;
  activeModel?: string;
  stepCount?: number;
  traceCount?: number;
}

export function TokenTelemetryHUD({
  metrics,
  activeTier = 1,
  activeProvider = 'gemini',
  activeModel,
  stepCount = 0,
  traceCount = 0,
}: Props): React.JSX.Element {
  const discount = metrics.estimatedCostDiscountPercent || 0;
  const shortModel = activeModel
    ? activeModel.split('/').pop()?.replace(':free', ' (free)')
    : undefined;

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-gradient-to-br from-vision-panel via-vision-card to-vision-panel rounded-xl border border-vision-border p-3.5 shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-vision-gold">
            <Zap className="w-4 h-4 text-vision-gold" />
            <span>Mind Stone Token Telemetry</span>
          </div>
          <span className="flex items-center gap-1 text-[11px] font-bold text-vision-tealBright bg-vision-teal/15 border border-vision-teal/40 px-2.5 py-0.5 rounded-full">
            <ShieldCheck className="w-3.5 h-3.5" />
            {discount}% Saved
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center mb-3">
          <div className="bg-vision-bg/90 rounded-lg p-2.5 border border-vision-border">
            <div className="text-[10px] text-slate-400">Cached Prefix</div>
            <div className="text-sm font-bold text-vision-tealBright font-mono mt-0.5">
              {metrics.cachedPrefixTokens.toLocaleString()}
            </div>
            <div className="text-[9px] text-slate-500">90% discount</div>
          </div>
          <div className="bg-vision-bg/90 rounded-lg p-2.5 border border-vision-border">
            <div className="text-[10px] text-slate-400">Fresh Delta</div>
            <div className="text-sm font-bold text-vision-gold font-mono mt-0.5">
              {metrics.freshTokens.toLocaleString()}
            </div>
            <div className="text-[9px] text-slate-500">&lt;100 tok/step</div>
          </div>
          <div className="bg-vision-bg/90 rounded-lg p-2.5 border border-vision-border">
            <div className="text-[10px] text-slate-400">Total Billed</div>
            <div className="text-sm font-bold text-vision-crimsonLight font-mono mt-0.5">
              {metrics.totalEstimatedTokens.toLocaleString()}
            </div>
            <div className="text-[9px] text-slate-500">effective</div>
          </div>
        </div>

        {/* Visual Token Savings Bar */}
        <div className="w-full bg-vision-bg h-2 rounded-full overflow-hidden border border-vision-border">
          <div
            className="bg-gradient-to-r from-vision-crimson via-vision-gold to-vision-tealBright h-full transition-all duration-500 rounded-full"
            style={{ width: `${Math.max(10, discount)}%` }}
          />
        </div>
      </div>

      {/* Engine Diagnostics Card */}
      <div className="bg-vision-panel border border-vision-border rounded-xl p-3.5 flex flex-col gap-2.5 text-xs">
        <div className="flex items-center gap-1.5 text-slate-300 font-bold uppercase tracking-wider text-[11px]">
          <Cpu className="w-3.5 h-3.5 text-vision-crimsonLight" />
          <span>Active Routing & Compression Architecture</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-vision-card border border-vision-border rounded-lg p-2.5">
            <div className="text-[10px] text-slate-400">Active Provider / Tier</div>
            <div className="text-xs font-bold text-slate-100 font-mono mt-0.5 uppercase">
              {activeProvider} • Tier {activeTier}
            </div>
          </div>
          <div className="bg-vision-card border border-vision-border rounded-lg p-2.5">
            <div className="text-[10px] text-slate-400">Active Model</div>
            <div className="text-xs font-bold text-vision-gold font-mono mt-0.5 truncate">
              {shortModel || 'Default Workhorse'}
            </div>
          </div>
          <div className="bg-vision-card border border-vision-border rounded-lg p-2.5">
            <div className="text-[10px] text-slate-400 flex items-center gap-1">
              <Layers className="w-3 h-3 text-vision-tealBright" /> Steps Executed
            </div>
            <div className="text-xs font-bold text-slate-100 font-mono mt-0.5">{stepCount}</div>
          </div>
          <div className="bg-vision-card border border-vision-border rounded-lg p-2.5">
            <div className="text-[10px] text-slate-400 flex items-center gap-1">
              <TrendingDown className="w-3 h-3 text-vision-gold" /> DOM Actions Run
            </div>
            <div className="text-xs font-bold text-slate-100 font-mono mt-0.5">{traceCount}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

