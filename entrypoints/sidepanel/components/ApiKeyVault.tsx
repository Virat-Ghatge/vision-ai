import React, { useState, useEffect } from 'react';
import { ProviderApiKeys, RouterConfig } from '../../../src/lib/llm/types';
import { KeyRound, Check, Eye, EyeOff, Server, Cpu, Zap, ShieldCheck } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const OPENROUTER_MODELS = [
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (Free ⭐ Recommended)', isFree: true },
  { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (Free ⚡ Fast)', isFree: true },
  { id: 'deepseek/deepseek-chat:free', name: 'DeepSeek V3 (Free)', isFree: true },
  { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 (Free 🧠 Reasoning)', isFree: true },
  { id: 'qwen/qwen-2.5-72b-instruct:free', name: 'Qwen 2.5 72B (Free)', isFree: true },
  { id: 'meta-llama/llama-3.1-8b-instruct:free', name: 'Llama 3.1 8B (Free ⚡ Instant)', isFree: true },
  { id: 'anthropic/claude-3.7-sonnet', name: 'Claude 3.7 Sonnet (Paid)', isFree: false },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet (Paid)', isFree: false },
  { id: 'openai/gpt-4o', name: 'OpenAI GPT-4o (Paid)', isFree: false },
];

const GROQ_MODELS = [
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile (Fast)' },
  { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant (Ultra-fast)' },
  { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B (MoE)' },
];

const GEMINI_MODELS = [
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Fast & Vision)' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Stable)' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Deep Reasoning)' },
];

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

  // Specific model selections (just like Dassi AI)
  const [openRouterModel, setOpenRouterModel] = useState('meta-llama/llama-3.3-70b-instruct:free');
  const [customOpenRouter, setCustomOpenRouter] = useState('');
  const [isCustomOpenRouter, setIsCustomOpenRouter] = useState(false);

  const [groqModel, setGroqModel] = useState('llama-3.3-70b-versatile');
  const [geminiModel, setGeminiModel] = useState('gemini-2.0-flash');
  const [anthropicModel, setAnthropicModel] = useState('claude-3-7-sonnet-20250219');

  // Auto-switch failover
  const [autoFallback, setAutoFallback] = useState(true);

  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['apiKeys', 'modelRoutingConfig']).then((data) => {
        if (data.apiKeys) setKeys((k) => ({ ...k, ...data.apiKeys }));
        if (data.modelRoutingConfig) {
          const cfg = data.modelRoutingConfig as Partial<RouterConfig>;
          if (cfg.preferredTier1Provider) setTier1Pref(cfg.preferredTier1Provider);
          if (cfg.preferredTier2Provider) setTier2Pref(cfg.preferredTier2Provider);
          if (cfg.openRouterModel) {
            const found = OPENROUTER_MODELS.find((m) => m.id === cfg.openRouterModel);
            if (found) {
              setOpenRouterModel(cfg.openRouterModel);
              setIsCustomOpenRouter(false);
            } else {
              setIsCustomOpenRouter(true);
              setCustomOpenRouter(cfg.openRouterModel);
            }
          }
          if (cfg.groqModel) setGroqModel(cfg.groqModel);
          if (cfg.geminiModel) setGeminiModel(cfg.geminiModel);
          if (cfg.anthropicModel) setAnthropicModel(cfg.anthropicModel);
          if (typeof cfg.autoFallbackOnLimit === 'boolean') {
            setAutoFallback(cfg.autoFallbackOnLimit);
          }
        }
      });
    }
  }, [isOpen]);

  const toggleShow = (provider: string) => {
    setShowKey((prev) => ({ ...prev, [provider]: !prev[provider] }));
  };

  const handleSave = async () => {
    const finalOpenRouterModel = isCustomOpenRouter && customOpenRouter.trim()
      ? customOpenRouter.trim()
      : openRouterModel;

    const routingConfig: Partial<RouterConfig> = {
      preferredTier1Provider: tier1Pref,
      preferredTier2Provider: tier2Pref,
      openRouterModel: finalOpenRouterModel,
      groqModel,
      geminiModel,
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
            Configure your AI provider keys and model preferences (just like Dassi AI). Keys are stored locally on your device.
          </span>
        </div>

        {/* Auto-Failover Circuit Breaker Toggle */}
        <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
          <div className="flex flex-col pr-2">
            <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              Auto-Switch on Usage Limit
            </span>
            <span className="text-[10px] text-slate-400">
              If a model hits 429 rate limit or quota, auto-switch to a free fallback model without interrupting ongoing tasks.
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
              <option value="openrouter">OpenRouter (Free & Paid)</option>
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
              <label className="text-xs font-semibold text-slate-200">OpenRouter (Free Pool Available)</label>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20">
                Multi-Model Gateway
              </span>
            </div>
            
            {/* Key Input */}
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

            {/* Model Selector */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-400 font-medium">Active OpenRouter Model:</label>
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
                {OPENROUTER_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
                <option value="custom">Custom Model Slug...</option>
              </select>

              {isCustomOpenRouter && (
                <input
                  type="text"
                  value={customOpenRouter}
                  onChange={(e) => setCustomOpenRouter(e.target.value)}
                  placeholder="e.g. mistralai/mistral-large-2411"
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono focus:border-orbit-neon focus:outline-none text-slate-200 mt-1"
                />
              )}
            </div>
          </div>

          {/* Groq Section */}
          <div className="bg-slate-900/40 p-2.5 rounded-lg border border-slate-800 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200">Groq (Ultra-Low Latency)</label>
              <span className="text-[10px] bg-cyan-500/10 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-500/20">
                500+ tok/s
              </span>
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
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-400 font-medium">Groq Model:</label>
              <select
                value={groqModel}
                onChange={(e) => setGroqModel(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-orbit-neon focus:outline-none"
              >
                {GROQ_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Google Gemini Section */}
          <div className="bg-slate-900/40 p-2.5 rounded-lg border border-slate-800 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200">Google Gemini (Multimodal & Free Tier)</label>
              <span className="text-[10px] bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded border border-purple-500/20">
                Native Vision
              </span>
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
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-400 font-medium">Gemini Model:</label>
              <select
                value={geminiModel}
                onChange={(e) => setGeminiModel(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-orbit-neon focus:outline-none"
              >
                {GEMINI_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
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
