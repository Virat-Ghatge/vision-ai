import { describe, it, expect } from 'vitest';
import { openDB } from 'idb';

describe('Vision AI Test Harness & Environment', () => {
  it('loads fake-indexeddb in happy-dom environment', async () => {
    const db = await openDB('test-harness-db', 1, {
      upgrade(database) {
        database.createObjectStore('test-store');
      },
    });

    await db.put('test-store', { status: 'ok' }, 'harness');
    const result = await db.get('test-store', 'harness');
    expect(result).toEqual({ status: 'ok' });
    db.close();
  });

  it('provides chrome storage mock', async () => {
    await chrome.storage.local.set({ agentStatus: 'ready' });
    const res = await chrome.storage.local.get('agentStatus');
    expect(res.agentStatus).toBe('ready');
  });
});
