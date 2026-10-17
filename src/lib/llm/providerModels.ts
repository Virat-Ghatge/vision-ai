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
        .catch(() => { });
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
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash (High-Speed Workhorse ⭐ Recommended)',
    contextLength: 1048576,
    isFree: true,
    description: 'High-speed workhorse model with native multimodal tool calling.',
  },
  {
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash (Mid-Tier High-Efficiency)',
    contextLength: 1048576,
    isFree: true,
    description: 'Mid-tier high-efficiency flash model.',
  },
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro Preview (Complex Reasoning)',
    contextLength: 2097152,
    isFree: false,
    description: 'Complex reasoning and broad world knowledge model.',
  },
  {
    id: 'gemini-4-argon',
    name: 'Gemini 4 Argon (Advanced Next-Gen Flagship)',
    contextLength: 2097152,
    isFree: false,
    description: 'Advanced next-generation flagship model.',
  },
  {
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash Preview (3-Series Fast Preview)',
    contextLength: 1048576,
    isFree: true,
  },
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash-Lite (Cost-Optimized High-Volume)',
    contextLength: 1048576,
    isFree: true,
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash (Fast)',
    contextLength: 1048576,
    isFree: true,
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro (Deep Reasoning)',
    contextLength: 2097152,
    isFree: false,
  },
  {
    id: 'gemma-4',
    name: 'Gemma 4 (Next-Gen Open Model)',
    contextLength: 131072,
    isFree: true,
  },
  {
    id: 'gemma-3-27b',
    name: 'Gemma 3 27B (Open Weights)',
    contextLength: 131072,
    isFree: true,
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

    // Sort: 3.8-flash first, then 3.6-flash, then 3.1-pro, then other flash, then name
    parsed.sort((a, b) => {
      if (a.id === 'gemini-3.8-flash') return -1;
      if (b.id === 'gemini-3.8-flash') return 1;
      if (a.id === 'gemini-3.6-flash') return -1;
      if (b.id === 'gemini-3.6-flash') return 1;
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
        .catch(() => { });
    }

    return parsed.length > 0 ? parsed : FALLBACK_GEMINI_MODELS;
  } catch {
    return FALLBACK_GEMINI_MODELS;
  }
}
