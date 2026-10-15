import React, { useState, useEffect } from 'react';
import { ProviderApiKeys, RouterConfig } from '../../../src/lib/llm/types';
import { KeyRound, Check, Eye, EyeOff, Server } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function ApiKeyVault({ isOpen, onClose }: Props): React.JSX.Element | null {
  const [keys, setKeys] = useState<ProviderApiKeys>({
    anthropic: '',
    gemini: '',
    groq: '',
    openrouter: '',
    ollamaBaseUrl: 'http://localhost:11434',
  });
  const [tier1Pref, setTier1Pref] = useState<'groq' | 'gemini' | 'openrouter'>('groq');
  const [tier2Pref, setTier2Pref] = useState<'anthropic' | 'gemini' | 'openrouter'>('anthropic');
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
        }
      });
    }
  }, [isOpen]);

  const toggleShow = (provider: string) => {
    setShowKey((prev) => ({ ...prev, [provider]: !prev[provider] }));
  };

  const handleSave = async () => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({
        apiKeys: keys,
        modelRoutingConfig: {
          preferredTier1Provider: tier1Pref,
          preferredTier2Provider: tier2Pref,
        },
      });
    }
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 800);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-3">
      <div className="bg-orbit-panel border border-orbit-border rounded-xl w-full max-w-sm p-4 text-slate-100 shadow-2xl flex flex-col gap-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-orbit-border pb-2">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-orbit-accent" />
            <h2 className="text-sm font-bold">API Key Vault & Router</h2>
          </div>
          <button
            onClick={onClose}
            className="text-xs text-slate-400 hover:text-slate-100 px-2 py-0.5"
          >
            ✕
          </button>
        </div>

        <p className="text-[11px] text-slate-400">
          Keys remain encrypted in <code className="text-orbit-accent">chrome.storage.local</code> and never leave your browser.
        </p>

        {/* Tier Routing Selection */}
        <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 flex flex-col gap-2">
          <div className="text-[11px] font-semibold text-slate-300">Tier Router Preferences</div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Tier 1 (Fast Execution):</span>
            <select
              value={tier1Pref}
              onChange={(e) => setTier1Pref(e.target.value as any)}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs"
            >
              <option value="groq">Groq (Llama 3.3)</option>
              <option value="gemini">Gemini 2.5 Flash</option>
              <option value="openrouter">OpenRouter</option>
            </select>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Tier 2 (Complex/Recovery):</span>
            <select
              value={tier2Pref}
              onChange={(e) => setTier2Pref(e.target.value as any)}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs"
            >
              <option value="anthropic">Claude Sonnet 3.7</option>
              <option value="gemini">Gemini 2.5 Pro</option>
              <option value="openrouter">OpenRouter</option>
            </select>
          </div>
        </div>

        {/* Provider Inputs */}
        <div className="flex flex-col gap-2.5">
          {/* Anthropic */}
          <div>
            <label className="text-[11px] font-medium text-slate-300 block mb-1">
              Anthropic API Key (Claude Sonnet / Haiku)
            </label>
            <div className="relative">
              <input
                type={showKey.anthropic ? 'text' : 'password'}
                value={keys.anthropic ?? ''}
                onChange={(e) => setKeys({ ...keys, anthropic: e.target.value })}
                placeholder="sk-ant-api..."
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono focus:border-orbit-accent focus:outline-none pr-8"
              />
              <button
                type="button"
                onClick={() => toggleShow('anthropic')}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-200"
              >
                {showKey.anthropic ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Gemini */}
          <div>
            <label className="text-[11px] font-medium text-slate-300 block mb-1">
              Google Gemini API Key (Flash / Pro)
            </label>
            <div className="relative">
              <input
                type={showKey.gemini ? 'text' : 'password'}
                value={keys.gemini ?? ''}
                onChange={(e) => setKeys({ ...keys, gemini: e.target.value })}
                placeholder="AIzaSy..."
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono focus:border-orbit-accent focus:outline-none pr-8"
              />
              <button
                type="button"
                onClick={() => toggleShow('gemini')}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-200"
              >
                {showKey.gemini ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Groq */}
          <div>
            <label className="text-[11px] font-medium text-slate-300 block mb-1">
              Groq API Key (Llama 3.3 70B)
            </label>
            <div className="relative">
              <input
                type={showKey.groq ? 'text' : 'password'}
                value={keys.groq ?? ''}
                onChange={(e) => setKeys({ ...keys, groq: e.target.value })}
                placeholder="gsk_..."
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono focus:border-orbit-accent focus:outline-none pr-8"
              />
              <button
                type="button"
                onClick={() => toggleShow('groq')}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-200"
              >
                {showKey.groq ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* OpenRouter */}
          <div>
            <label className="text-[11px] font-medium text-slate-300 block mb-1">
              OpenRouter API Key (Unified Gateway)
            </label>
            <div className="relative">
              <input
                type={showKey.openrouter ? 'text' : 'password'}
                value={keys.openrouter ?? ''}
                onChange={(e) => setKeys({ ...keys, openrouter: e.target.value })}
                placeholder="sk-or-v1-..."
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono focus:border-orbit-accent focus:outline-none pr-8"
              />
              <button
                type="button"
                onClick={() => toggleShow('openrouter')}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-200"
              >
                {showKey.openrouter ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Ollama */}
          <div>
            <label className="text-[11px] font-medium text-slate-300 block mb-1 flex items-center gap-1">
              <Server className="w-3 h-3 text-orbit-neon" />
              Ollama Local Endpoint (Tier 0 0-Token)
            </label>
            <input
              type="text"
              value={keys.ollamaBaseUrl ?? ''}
              onChange={(e) => setKeys({ ...keys, ollamaBaseUrl: e.target.value })}
              placeholder="http://localhost:11434"
              className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono focus:border-orbit-accent focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-orbit-border">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-slate-300 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-orbit-neon text-slate-950 font-semibold rounded text-xs hover:bg-emerald-400 transition-colors"
          >
            {savedSuccess ? (
              <>
                <Check className="w-3.5 h-3.5" /> Saved!
              </>
            ) : (
              'Save Keys'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
