export interface OpenRouterModelInfo {
  id: string;
  name: string;
  contextLength: number;
  isFree: boolean;
  pricingPrompt?: string;
  pricingCompletion?: string;
  description?: string;
}

// Statically curated fallback models in case network fetch fails or before first fetch
export const FALLBACK_OPENROUTER_MODELS: OpenRouterModelInfo[] = [
  {
    id: 'openrouter/free',
    name: 'Free Models Router (Official Auto-Failover ⭐)',
    contextLength: 200000,
    isFree: true,
    description: 'OpenRouter official router that dynamically selects available free models without breaking.',
  },
  {
    id: 'google/gemma-4-31b-it:free',
    name: 'Google: Gemma 4 31B (Free)',
    contextLength: 262144,
    isFree: true,
  },
  {
    id: 'google/gemma-4-26b-a4b-it:free',
    name: 'Google: Gemma 4 26B A4B (Free)',
    contextLength: 262144,
    isFree: true,
  },
  {
    id: 'nvidia/nemotron-3-super-120b-a12b:free',
    name: 'NVIDIA: Nemotron 3 Super 120B (Free)',
    contextLength: 262144,
    isFree: true,
  },
  {
    id: 'cohere/north-mini-code:free',
    name: 'Cohere: North Mini Code (Free)',
    contextLength: 256000,
    isFree: true,
  },
  {
    id: 'liquid/lfm-2.5-2.6b:free',
    name: 'LiquidAI: LFM 2.5 2.6B (Free)',
    contextLength: 65536,
    isFree: true,
  },
  {
    id: 'anthropic/claude-3.7-sonnet',
    name: 'Anthropic: Claude 3.7 Sonnet (Paid)',
    contextLength: 200000,
    isFree: false,
  },
  {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Anthropic: Claude 3.5 Sonnet (Paid)',
    contextLength: 200000,
    isFree: false,
  },
  {
    id: 'openai/gpt-4o',
    name: 'OpenAI: GPT-4o (Paid)',
    contextLength: 128000,
    isFree: false,
  },
];

const CACHE_STORAGE_KEY = 'vision_ai_openrouter_models_cache';
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

/**
 * Fetches the live list of models from OpenRouter API, filters free and popular models,
 * and caches results in chrome.storage.local.
 */
export async function fetchLiveOpenRouterModels(
  apiKey?: string,
  forceRefresh = false
): Promise<OpenRouterModelInfo[]> {
  // 1. Try reading from chrome.storage.local cache if not forcing refresh
  if (!forceRefresh && typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      const stored = await chrome.storage.local.get(CACHE_STORAGE_KEY);
      const cache = stored[CACHE_STORAGE_KEY] as { timestamp: number; models: OpenRouterModelInfo[] } | undefined;
      if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS && cache.models?.length > 0) {
        return cache.models;
      }
    } catch {
      // ignore storage error, proceed to fetch
    }
  }

  // 2. Query live OpenRouter API
  try {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const res = await fetch('https://openrouter.ai/api/v1/models', {
      method: 'GET',
      headers,
    });

    if (!res.ok) {
      console.warn(`[Vision AI] OpenRouter models fetch failed with status ${res.status}. Using fallback models.`);
      return FALLBACK_OPENROUTER_MODELS;
    }

    const data = await res.json();
    const rawList = Array.isArray(data?.data) ? data.data : [];

    const parsed: OpenRouterModelInfo[] = rawList.map((m: any) => {
      const isFree =
        m.id === 'openrouter/free' ||
        m.id.endsWith(':free') ||
        (m.pricing && m.pricing.prompt === '0' && m.pricing.completion === '0');

      return {
        id: m.id,
        name: m.name ?? m.id,
        contextLength: m.context_length ?? 4096,
        isFree,
        pricingPrompt: m.pricing?.prompt,
        pricingCompletion: m.pricing?.completion,
        description: m.description,
      };
    });

    // Sort: openrouter/free first, then other free models, then paid models alphabetically
    parsed.sort((a, b) => {
      if (a.id === 'openrouter/free') return -1;
      if (b.id === 'openrouter/free') return 1;
      if (a.isFree && !b.isFree) return -1;
      if (!a.isFree && b.isFree) return 1;
      return a.name.localeCompare(b.name);
    });

    // 3. Cache in storage
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local
        .set({
          [CACHE_STORAGE_KEY]: {
            timestamp: Date.now(),
            models: parsed,
          },
        })
        .catch(() => {});
    }

    return parsed.length > 0 ? parsed : FALLBACK_OPENROUTER_MODELS;
  } catch (err) {
    console.warn('[Vision AI] Network error fetching OpenRouter models:', err);
    return FALLBACK_OPENROUTER_MODELS;
  }
}
