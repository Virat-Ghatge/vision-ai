export interface ProviderModelInfo {
  id: string;
  name: string;
  contextLength?: number;
  description?: string;
  isFree?: boolean;
}

// ==========================================
// GROQ MODELS
// ==========================================

export const FALLBACK_GROQ_MODELS: ProviderModelInfo[] = [
  {
    id: 'llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B Versatile (Fast ⭐ Recommended)',
    contextLength: 131072,
    isFree: true,
    description: 'Flagship open model with 128k context, ideal for browser agents.',
  },
  {
    id: 'llama-3.1-8b-instant',
    name: 'Llama 3.1 8B Instant (Ultra-fast)',
    contextLength: 131072,
    isFree: true,
    description: 'Instant response latency on LPUs.',
  },
  {
    id: 'deepseek-r1-distill-llama-70b',
    name: 'DeepSeek R1 Distill Llama 70B (Reasoning)',
    contextLength: 131072,
    isFree: true,
    description: 'Distilled reasoning model on Groq hardware.',
  },
  {
    id: 'mixtral-8x7b-32768',
    name: 'Mixtral 8x7B (MoE)',
    contextLength: 32768,
    isFree: true,
  },
  {
    id: 'gemma2-9b-it',
    name: 'Gemma 2 9B IT',
    contextLength: 8192,
    isFree: true,
  },
];

const GROQ_CACHE_KEY = 'vision_ai_groq_models_cache';

export async function fetchLiveGroqModels(
  apiKey?: string,
  forceRefresh = false
): Promise<ProviderModelInfo[]> {
  if (!forceRefresh && typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      const stored = await chrome.storage.local.get(GROQ_CACHE_KEY);
      const cache = stored[GROQ_CACHE_KEY] as { timestamp: number; models: ProviderModelInfo[] } | undefined;
      if (cache && Date.now() - cache.timestamp < 3600000 && cache.models?.length > 0) {
        return cache.models;
      }
    } catch {
      // ignore
    }
  }

  if (!apiKey) {
    return FALLBACK_GROQ_MODELS;
  }

  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
    });

    if (!res.ok) {
      return FALLBACK_GROQ_MODELS;
    }

    const data = await res.json();
    const rawList = Array.isArray(data?.data) ? data.data : [];

    const parsed: ProviderModelInfo[] = rawList
      .filter((m: any) => m.active !== false)
      .map((m: any) => ({
        id: m.id,
        name: m.id,
        contextLength: m.context_window,
        isFree: true,
      }));

    // Put versatile first if exists
    parsed.sort((a, b) => {
      if (a.id === 'llama-3.3-70b-versatile') return -1;
      if (b.id === 'llama-3.3-70b-versatile') return 1;
      return a.id.localeCompare(b.id);
    });

    if (typeof chrome !== 'undefined' && chrome.storage?.local && parsed.length > 0) {
      chrome.storage.local
        .set({
          [GROQ_CACHE_KEY]: {
            timestamp: Date.now(),
            models: parsed,
          },
        })
        .catch(() => {});
    }

    return parsed.length > 0 ? parsed : FALLBACK_GROQ_MODELS;
  } catch {
    return FALLBACK_GROQ_MODELS;
  }
}

// ==========================================
// GEMINI MODELS
// ==========================================

export const FALLBACK_GEMINI_MODELS: ProviderModelInfo[] = [
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash (Fast & Vision ⭐ Recommended)',
    contextLength: 1048576,
    isFree: true,
    description: 'Next-gen multimodal model with native high-speed tool use.',
  },
  {
    id: 'gemini-2.0-flash-lite',
    name: 'Gemini 2.0 Flash Lite (Ultra-fast)',
    contextLength: 1048576,
    isFree: true,
  },
  {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash (Stable)',
    contextLength: 1048576,
    isFree: true,
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro (Deep Multi-step Reasoning)',
    contextLength: 2097152,
    isFree: false,
  },
];

const GEMINI_CACHE_KEY = 'vision_ai_gemini_models_cache';

export async function fetchLiveGeminiModels(
  apiKey?: string,
  forceRefresh = false
): Promise<ProviderModelInfo[]> {
  if (!forceRefresh && typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      const stored = await chrome.storage.local.get(GEMINI_CACHE_KEY);
      const cache = stored[GEMINI_CACHE_KEY] as { timestamp: number; models: ProviderModelInfo[] } | undefined;
      if (cache && Date.now() - cache.timestamp < 3600000 && cache.models?.length > 0) {
        return cache.models;
      }
    } catch {
      // ignore
    }
  }

  if (!apiKey) {
    return FALLBACK_GEMINI_MODELS;
  }

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);

    if (!res.ok) {
      return FALLBACK_GEMINI_MODELS;
    }

    const data = await res.json();
    const rawList = Array.isArray(data?.models) ? data.models : [];

    const parsed: ProviderModelInfo[] = rawList
      .filter((m: any) => {
        const methods = m.supportedGenerationMethods ?? [];
        return (
          methods.includes('generateContent') &&
          !m.name.includes('embedding') &&
          !m.name.includes('aqa') &&
          !m.name.includes('imagen')
        );
      })
      .map((m: any) => {
        const cleanId = m.name.replace(/^models\//, '');
        return {
          id: cleanId,
          name: m.displayName ?? cleanId,
          contextLength: m.inputTokenLimit ?? 1048576,
          description: m.description,
          isFree: !cleanId.includes('pro'),
        };
      });

    // Sort: 2.0-flash first, then flash variants, then pro
    parsed.sort((a, b) => {
      if (a.id === 'gemini-2.0-flash') return -1;
      if (b.id === 'gemini-2.0-flash') return 1;
      if (a.id === 'gemini-1.5-flash') return -1;
      if (b.id === 'gemini-1.5-flash') return 1;
      return a.name.localeCompare(b.name);
    });

    if (typeof chrome !== 'undefined' && chrome.storage?.local && parsed.length > 0) {
      chrome.storage.local
        .set({
          [GEMINI_CACHE_KEY]: {
            timestamp: Date.now(),
            models: parsed,
          },
        })
        .catch(() => {});
    }

    return parsed.length > 0 ? parsed : FALLBACK_GEMINI_MODELS;
  } catch {
    return FALLBACK_GEMINI_MODELS;
  }
}
