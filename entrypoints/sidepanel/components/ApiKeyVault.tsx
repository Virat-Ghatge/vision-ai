import React, { useState, useEffect } from 'react';
import { ProviderApiKeys, RouterConfig } from '../../../src/lib/llm/types';
import {
  KeyRound,
  Check,
  Eye,
  EyeOff,
  Server,
  Cpu,
  Zap,
  ShieldCheck,
  RotateCw,
  Search,
  Sparkles,
} from 'lucide-react';
import {
  OpenRouterModelInfo,
  fetchLiveOpenRouterModels,
  FALLBACK_OPENROUTER_MODELS,
} from '../../../src/lib/llm/openrouterModels';
import {
  ProviderModelInfo,
  fetchLiveGroqModels,
  FALLBACK_GROQ_MODELS,
  fetchLiveGeminiModels,
  FALLBACK_GEMINI_MODELS,
} from '../../../src/lib/llm/providerModels';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const ANTHROPIC_MODELS = [
  { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet (Hybrid Reasoning)' },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
  { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku (Fast)' },
];

export function ApiKeyVault({ isOpen, onClose }: Props): React.JSX.Element | null {
  const [keys, setKeys] = useState<ProviderApiKeys>({
    anthropic: '',
    gemini: '',
    groq: '',
    openrouter: '',
    ollamaBaseUrl: 'http://localhost:11434',
  });

  const [tier1Pref, setTier1Pref] = useState<'groq' | 'gemini' | 'openrouter'>('openrouter');
  const [tier2Pref, setTier2Pref] = useState<'anthropic' | 'gemini' | 'openrouter'>('openrouter');

  // Dynamic OpenRouter models
  const [openRouterModels, setOpenRouterModels] = useState<OpenRouterModelInfo[]>(FALLBACK_OPENROUTER_MODELS);
  const [isFetchingOpenRouter, setIsFetchingOpenRouter] = useState(false);
  const [openRouterFilter, setOpenRouterFilter] = useState('');
  const [showFreeOnly, setShowFreeOnly] = useState(true);
  const [openRouterModel, setOpenRouterModel] = useState('openrouter/free');
  const [customOpenRouter, setCustomOpenRouter] = useState('');
  const [isCustomOpenRouter, setIsCustomOpenRouter] = useState(false);

  // Dynamic Groq models
  const [groqModels, setGroqModels] = useState<ProviderModelInfo[]>(FALLBACK_GROQ_MODELS);
  const [isFetchingGroq, setIsFetchingGroq] = useState(false);
  const [groqFilter, setGroqFilter] = useState('');
  const [groqModel, setGroqModel] = useState('llama-3.3-70b-versatile');
  const [customGroq, setCustomGroq] = useState('');
  const [isCustomGroq, setIsCustomGroq] = useState(false);

  // Dynamic Gemini models
  const [geminiModels, setGeminiModels] = useState<ProviderModelInfo[]>(FALLBACK_GEMINI_MODELS);
  const [isFetchingGemini, setIsFetchingGemini] = useState(false);
  const [geminiFilter, setGeminiFilter] = useState('');
  const [geminiModel, setGeminiModel] = useState('gemini-3.8-flash');
  const [customGemini, setCustomGemini] = useState('');
  const [isCustomGemini, setIsCustomGemini] = useState(false);

  // Anthropic model
  const [anthropicModel, setAnthropicModel] = useState('claude-3-7-sonnet-20250219');

  // Auto-switch failover
  const [autoFallback, setAutoFallback] = useState(true);

  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Load saved configuration and fetch live models on mount / open
  useEffect(() => {
    if (!isOpen) return;

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['apiKeys', 'modelRoutingConfig']).then(async (data) => {
        let currentKeys = keys;
        if (data.apiKeys) {
          currentKeys = { ...currentKeys, ...data.apiKeys };
          setKeys(currentKeys);
        }

        if (data.modelRoutingConfig) {
          const cfg = data.modelRoutingConfig as Partial<RouterConfig>;
          if (cfg.preferredTier1Provider) setTier1Pref(cfg.preferredTier1Provider);
          if (cfg.preferredTier2Provider) setTier2Pref(cfg.preferredTier2Provider);

          // OpenRouter
          if (cfg.openRouterModel) {
            if (cfg.openRouterModel.includes('meta-llama/llama-3.3-70b-instruct:free')) {
              setOpenRouterModel('openrouter/free');
              setIsCustomOpenRouter(false);
            } else {
              setOpenRouterModel(cfg.openRouterModel);
            }
          }

          // Groq
          if (cfg.groqModel) {
            setGroqModel(cfg.groqModel);
          }

          // Gemini - automatically migrate legacy 2.0/1.5 models to 3.8-flash workhorse
          if (cfg.geminiModel) {
            if (cfg.geminiModel.includes('gemini-2.0') || cfg.geminiModel.includes('gemini-1.5')) {
              setGeminiModel('gemini-3.8-flash');
            } else {
              setGeminiModel(cfg.geminiModel);
            }
          }

          if (cfg.anthropicModel) setAnthropicModel(cfg.anthropicModel);
          if (typeof cfg.autoFallbackOnLimit === 'boolean') {
            setAutoFallback(cfg.autoFallbackOnLimit);
          }
        }

        // Fetch live models
        loadLiveOpenRouter(currentKeys.openrouter, false);
        loadLiveGroq(currentKeys.groq, false);
        loadLiveGemini(currentKeys.gemini, false);
      });
    } else {
      loadLiveOpenRouter(keys.openrouter, false);
      loadLiveGroq(keys.groq, false);
      loadLiveGemini(keys.gemini, false);
    }
  }, [isOpen]);

  const loadLiveOpenRouter = async (apiKey?: string, force = false) => {
    setIsFetchingOpenRouter(true);
    try {
      const models = await fetchLiveOpenRouterModels(apiKey, force);
      if (models.length > 0) setOpenRouterModels(models);
    } finally {
      setIsFetchingOpenRouter(false);
    }
  };

  const loadLiveGroq = async (apiKey?: string, force = false) => {
    setIsFetchingGroq(true);
    try {
      const models = await fetchLiveGroqModels(apiKey, force);
      if (models.length > 0) setGroqModels(models);
    } finally {
      setIsFetchingGroq(false);
    }
  };

  const loadLiveGemini = async (apiKey?: string, force = false) => {
    setIsFetchingGemini(true);
    try {
      const models = await fetchLiveGeminiModels(apiKey, force);
      if (models.length > 0) setGeminiModels(models);
    } finally {
      setIsFetchingGemini(false);
    }
  };

  const toggleShow = (provider: string) => {
    setShowKey((prev) => ({ ...prev, [provider]: !prev[provider] }));
  };

  const handleSave = async () => {
    const finalOpenRouterModel =
      isCustomOpenRouter && customOpenRouter.trim() ? customOpenRouter.trim() : openRouterModel;
    const finalGroqModel =
      isCustomGroq && customGroq.trim() ? customGroq.trim() : groqModel;
    const finalGeminiModel =
      isCustomGemini && customGemini.trim() ? customGemini.trim() : geminiModel;

    const routingConfig: Partial<RouterConfig> = {
      preferredTier1Provider: tier1Pref,
      preferredTier2Provider: tier2Pref,
      openRouterModel: finalOpenRouterModel,
      groqModel: finalGroqModel,
      geminiModel: finalGeminiModel,
      anthropicModel,
      autoFallbackOnLimit: autoFallback,
    };

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({
        apiKeys: keys,
        modelRoutingConfig: routingConfig,
      });
    }

    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 700);
  };

  if (!isOpen) return null;

  // Filtered lists
  const filteredOpenRouter = openRouterModels.filter((m) => {
    if (showFreeOnly && !m.isFree) return false;
    if (!openRouterFilter) return true;
    const q = openRouterFilter.toLowerCase();
    return m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q);
  });

  const filteredGroq = groqModels.filter((m) => {
    if (!groqFilter) return true;
    const q = groqFilter.toLowerCase();
    return m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q);
  });

  const filteredGemini = geminiModels.filter((m) => {
    if (!geminiFilter) return true;
    const q = geminiFilter.toLowerCase();
    return m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q);
  });

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 animate-fade-in">
      <div className="bg-orbit-panel border border-orbit-border rounded-xl w-full max-w-md p-4 text-slate-100 shadow-2xl flex flex-col gap-3.5 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-orbit-border pb-2.5">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-orbit-neon" />
            <h2 className="text-sm font-bold text-slate-100">AI Models & Key Vault</h2>
          </div>
          <button
            onClick={onClose}
            className="text-xs text-slate-400 hover:text-slate-100 px-2 py-0.5 rounded hover:bg-slate-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Info Banner */}
        <div className="flex items-start gap-2 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 text-[11px] text-slate-400">
          <ShieldCheck className="w-4 h-4 text-orbit-neon shrink-0 mt-0.5" />
          <span>
            Choose models across providers with Vision AI. OpenRouter, Groq, and Gemini models are dynamically discovered and auto-failover enabled.
          </span>
        </div>

        {/* Auto-Failover Circuit Breaker Toggle */}
        <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
          <div className="flex flex-col pr-2">
            <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              Auto-Switch on Rate/Usage Limit (404/429)
            </span>
            <span className="text-[10px] text-slate-400">
              If any model is rate-limited, decommissioned, or quota-exhausted, auto-switch to a fallback model without interrupting ongoing tasks.
            </span>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={autoFallback}
              onChange={(e) => setAutoFallback(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orbit-neon"></div>
          </label>
        </div>

        {/* Tier Router Preferences */}
        <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 flex flex-col gap-2">
          <div className="text-[11px] font-semibold text-slate-300">Default Execution Provider</div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Primary Provider:</span>
            <select
              value={tier1Pref}
              onChange={(e) => setTier1Pref(e.target.value as any)}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:border-orbit-neon focus:outline-none"
            >
              <option value="openrouter">OpenRouter (Free Pool & Paid)</option>
              <option value="groq">Groq (Llama 3.3)</option>
              <option value="gemini">Google Gemini</option>
            </select>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Complex / Tier 2 Provider:</span>
            <select
              value={tier2Pref}
              onChange={(e) => setTier2Pref(e.target.value as any)}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:border-orbit-neon focus:outline-none"
            >
              <option value="openrouter">OpenRouter</option>
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="gemini">Google Gemini</option>
            </select>
          </div>
        </div>

        {/* Providers & Models List */}
        <div className="flex flex-col gap-3">
          {/* OpenRouter Section */}
          <div className="bg-slate-900/40 p-2.5 rounded-lg border border-slate-800 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-orbit-neon" />
                OpenRouter Model Picker
              </label>
              <button
                type="button"
                onClick={() => loadLiveOpenRouter(keys.openrouter, true)}
                disabled={isFetchingOpenRouter}
                className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 px-2 py-0.5 rounded border border-slate-700 transition-colors"
                title="Fetch latest models from OpenRouter API"
              >
                <RotateCw className={`w-3 h-3 ${isFetchingOpenRouter ? 'animate-spin' : ''}`} />
                {isFetchingOpenRouter ? 'Fetching...' : 'Refresh'}
              </button>
            </div>

            <div className="relative">
              <input
                type={showKey.openrouter ? 'text' : 'password'}
                value={keys.openrouter ?? ''}
                onChange={(e) => setKeys({ ...keys, openrouter: e.target.value })}
                placeholder="OpenRouter API Key (sk-or-v1-...)"
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono focus:border-orbit-neon focus:outline-none pr-8 text-slate-200"
              />
              <button
                type="button"
                onClick={() => toggleShow('openrouter')}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-200"
              >
                {showKey.openrouter ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={openRouterFilter}
                  onChange={(e) => setOpenRouterFilter(e.target.value)}
                  placeholder="Filter models (e.g. gemma, free)..."
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-200 pl-6 focus:border-orbit-neon focus:outline-none"
                />
                <Search className="w-3 h-3 text-slate-500 absolute left-2 top-2" />
              </div>
              <button
                type="button"
                onClick={() => setShowFreeOnly(!showFreeOnly)}
                className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                  showFreeOnly
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                }`}
              >
                {showFreeOnly ? '✓ Free (0$)' : 'All Models'}
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <select
                value={isCustomOpenRouter ? 'custom' : openRouterModel}
                onChange={(e) => {
                  if (e.target.value === 'custom') {
                    setIsCustomOpenRouter(true);
                  } else {
                    setIsCustomOpenRouter(false);
                    setOpenRouterModel(e.target.value);
                  }
                }}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-orbit-neon focus:outline-none"
              >
                {filteredOpenRouter.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id === 'openrouter/free'
                      ? '⭐ openrouter/free (Official Auto-Failover Router)'
                      : `${m.name} ${m.isFree ? '• [FREE]' : ''} (${Math.round((m.contextLength ?? 0) / 1000)}k ctx)`}
                  </option>
                ))}
                <option value="custom">✏️ Enter Custom Model Slug...</option>
              </select>

              {isCustomOpenRouter && (
                <input
                  type="text"
                  value={customOpenRouter}
                  onChange={(e) => setCustomOpenRouter(e.target.value)}
                  placeholder="e.g. google/gemma-4-31b-it:free or openrouter/free"
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono focus:border-orbit-neon focus:outline-none text-slate-200 mt-1"
                />
              )}
            </div>
          </div>

          {/* Groq Section */}
          <div className="bg-slate-900/40 p-2.5 rounded-lg border border-slate-800 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-cyan-400" />
                Groq Model Picker (500+ tok/s)
              </label>
              <button
                type="button"
                onClick={() => loadLiveGroq(keys.groq, true)}
                disabled={isFetchingGroq}
                className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 px-2 py-0.5 rounded border border-slate-700 transition-colors"
                title="Fetch latest models from Groq API"
              >
                <RotateCw className={`w-3 h-3 ${isFetchingGroq ? 'animate-spin' : ''}`} />
                {isFetchingGroq ? 'Fetching...' : 'Refresh'}
              </button>
            </div>

            <div className="relative">
              <input
                type={showKey.groq ? 'text' : 'password'}
                value={keys.groq ?? ''}
                onChange={(e) => setKeys({ ...keys, groq: e.target.value })}
                placeholder="Groq API Key (gsk_...)"
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono focus:border-orbit-neon focus:outline-none pr-8 text-slate-200"
              />
              <button
                type="button"
                onClick={() => toggleShow('groq')}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-200"
              >
                {showKey.groq ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>

            <div className="relative pt-1">
              <input
                type="text"
                value={groqFilter}
                onChange={(e) => setGroqFilter(e.target.value)}
                placeholder="Filter Groq models (e.g. llama, instant)..."
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-200 pl-6 focus:border-orbit-neon focus:outline-none"
              />
              <Search className="w-3 h-3 text-slate-500 absolute left-2 top-3" />
            </div>

            <div className="flex flex-col gap-1">
              <select
                value={isCustomGroq ? 'custom' : groqModel}
                onChange={(e) => {
                  if (e.target.value === 'custom') {
                    setIsCustomGroq(true);
                  } else {
                    setIsCustomGroq(false);
                    setGroqModel(e.target.value);
                  }
                }}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-orbit-neon focus:outline-none"
              >
                {filteredGroq.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.contextLength ? `(${Math.round(m.contextLength / 1000)}k ctx)` : ''}
                  </option>
                ))}
                <option value="custom">✏️ Enter Custom Model Slug...</option>
              </select>

              {isCustomGroq && (
                <input
                  type="text"
                  value={customGroq}
                  onChange={(e) => setCustomGroq(e.target.value)}
                  placeholder="e.g. llama-3.3-70b-versatile or mixtral-8x7b-32768"
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono focus:border-orbit-neon focus:outline-none text-slate-200 mt-1"
                />
              )}
            </div>
          </div>

          {/* Google Gemini Section */}
          <div className="bg-slate-900/40 p-2.5 rounded-lg border border-slate-800 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-purple-400" />
                Google Gemini Model Picker (Native Vision)
              </label>
              <button
                type="button"
                onClick={() => loadLiveGemini(keys.gemini, true)}
                disabled={isFetchingGemini}
                className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 px-2 py-0.5 rounded border border-slate-700 transition-colors"
                title="Fetch latest models from Gemini API"
              >
                <RotateCw className={`w-3 h-3 ${isFetchingGemini ? 'animate-spin' : ''}`} />
                {isFetchingGemini ? 'Fetching...' : 'Refresh'}
              </button>
            </div>

            <div className="relative">
              <input
                type={showKey.gemini ? 'text' : 'password'}
                value={keys.gemini ?? ''}
                onChange={(e) => setKeys({ ...keys, gemini: e.target.value })}
                placeholder="Gemini API Key (AIzaSy...)"
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono focus:border-orbit-neon focus:outline-none pr-8 text-slate-200"
              />
              <button
                type="button"
                onClick={() => toggleShow('gemini')}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-200"
              >
                {showKey.gemini ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>

            <div className="relative pt-1">
              <input
                type="text"
                value={geminiFilter}
                onChange={(e) => setGeminiFilter(e.target.value)}
                placeholder="Filter Gemini models (e.g. 2.0, flash)..."
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-200 pl-6 focus:border-orbit-neon focus:outline-none"
              />
              <Search className="w-3 h-3 text-slate-500 absolute left-2 top-3" />
            </div>

            <div className="flex flex-col gap-1">
              <select
                value={isCustomGemini ? 'custom' : geminiModel}
                onChange={(e) => {
                  if (e.target.value === 'custom') {
                    setIsCustomGemini(true);
                  } else {
                    setIsCustomGemini(false);
                    setGeminiModel(e.target.value);
                  }
                }}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-orbit-neon focus:outline-none"
              >
                {filteredGemini.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.isFree ? '• [FREE TIER]' : ''}
                  </option>
                ))}
                <option value="custom">✏️ Enter Custom Model Slug...</option>
              </select>

              {isCustomGemini && (
                <input
                  type="text"
                  value={customGemini}
                  onChange={(e) => setCustomGemini(e.target.value)}
                  placeholder="e.g. gemini-2.0-flash or gemini-1.5-pro"
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono focus:border-orbit-neon focus:outline-none text-slate-200 mt-1"
                />
              )}
            </div>
          </div>

          {/* Anthropic Section */}
          <div className="bg-slate-900/40 p-2.5 rounded-lg border border-slate-800 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200">Anthropic Claude</label>
              <span className="text-[10px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/20">
                Prompt Caching
              </span>
            </div>
            <div className="relative">
              <input
                type={showKey.anthropic ? 'text' : 'password'}
                value={keys.anthropic ?? ''}
                onChange={(e) => setKeys({ ...keys, anthropic: e.target.value })}
                placeholder="Anthropic API Key (sk-ant-...)"
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono focus:border-orbit-neon focus:outline-none pr-8 text-slate-200"
              />
              <button
                type="button"
                onClick={() => toggleShow('anthropic')}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-200"
              >
                {showKey.anthropic ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-400 font-medium">Claude Model:</label>
              <select
                value={anthropicModel}
                onChange={(e) => setAnthropicModel(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-orbit-neon focus:outline-none"
              >
                {ANTHROPIC_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Ollama Section */}
          <div className="bg-slate-900/40 p-2.5 rounded-lg border border-slate-800 flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-orbit-neon" />
              Ollama Local Endpoint (Tier 0 0-Token)
            </label>
            <input
              type="text"
              value={keys.ollamaBaseUrl ?? ''}
              onChange={(e) => setKeys({ ...keys, ollamaBaseUrl: e.target.value })}
              placeholder="http://localhost:11434"
              className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono focus:border-orbit-neon focus:outline-none text-slate-200"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-orbit-border">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-slate-300 hover:text-white rounded hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-orbit-neon text-slate-950 font-semibold rounded text-xs hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/20"
          >
            {savedSuccess ? (
              <>
                <Check className="w-3.5 h-3.5" /> Saved Preferences!
              </>
            ) : (
              'Save Models & Keys'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
