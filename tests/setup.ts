import 'fake-indexeddb/auto';

// Global chrome API mock for unit tests
if (typeof globalThis.chrome === 'undefined') {
  const storageLocal: Record<string, any> = {};
  const storageSession: Record<string, any> = {};

  (globalThis as any).chrome = {
    storage: {
      local: {
        get: async (keys?: string | string[] | Record<string, any>) => {
          if (!keys) return { ...storageLocal };
          if (typeof keys === 'string') return { [keys]: storageLocal[keys] };
          if (Array.isArray(keys)) {
            const res: Record<string, any> = {};
            for (const k of keys) res[k] = storageLocal[k];
            return res;
          }
          return { ...storageLocal };
        },
        set: async (items: Record<string, any>) => {
          Object.assign(storageLocal, items);
        },
        remove: async (keys: string | string[]) => {
          const list = Array.isArray(keys) ? keys : [keys];
          for (const k of list) delete storageLocal[k];
        },
        clear: async () => {
          for (const k in storageLocal) delete storageLocal[k];
        },
      },
      session: {
        get: async (keys?: string | string[] | Record<string, any>) => {
          if (!keys) return { ...storageSession };
          if (typeof keys === 'string') return { [keys]: storageSession[keys] };
          if (Array.isArray(keys)) {
            const res: Record<string, any> = {};
            for (const k of keys) res[k] = storageSession[k];
            return res;
          }
          return { ...storageSession };
        },
        set: async (items: Record<string, any>) => {
          Object.assign(storageSession, items);
        },
        remove: async (keys: string | string[]) => {
          const list = Array.isArray(keys) ? keys : [keys];
          for (const k of list) delete storageSession[k];
        },
        clear: async () => {
          for (const k in storageSession) delete storageSession[k];
        },
      },
    },
    tabs: {
      query: async () => [{ id: 1, url: 'https://example.com' }],
      sendMessage: async () => ({ success: true }),
      captureVisibleTab: async () => 'data:image/webp;base64,mockWebpData',
    },
    debugger: {
      attach: async () => {},
      detach: async () => {},
      sendCommand: async () => ({}),
      onEvent: { addListener: () => {} },
      onDetach: { addListener: () => {} },
    },
    runtime: {
      sendMessage: async () => ({}),
      onMessage: { addListener: () => {} },
    },
  };
}
