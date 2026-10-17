import { defineBackground } from 'wxt/sandbox';
import { LLMRouter } from '../src/lib/llm/router';
import { AgentStateMachine } from '../src/lib/agent/stateMachine';
import { ExtensionMessage, TabSessionSummary } from '../src/lib/agent/types';
import { globalSkillStore, compileTraceToSkill } from '../src/lib/skills/skillStore';
import { classifyActionSafety } from '../src/lib/safety/interceptor';

export default defineBackground(() => {
  console.log('[Vision AI] Multi-Tab Service Worker background loop initialized.');

  if (typeof chrome !== 'undefined') {
    if (chrome.sidePanel?.setOptions) {
      chrome.sidePanel.setOptions({ path: 'sidepanel.html', enabled: true }).catch(() => {});
    }

    if (chrome.sidePanel?.setPanelBehavior) {
      chrome.sidePanel
        .setPanelBehavior({ openPanelOnActionClick: true })
        .catch((err) => console.warn('[Vision AI] Failed to set panel behavior:', err));
    }

    chrome.runtime?.onInstalled?.addListener(() => {
      if (chrome.sidePanel?.setOptions) {
        chrome.sidePanel.setOptions({ path: 'sidepanel.html', enabled: true }).catch(() => {});
      }
      if (chrome.sidePanel?.setPanelBehavior) {
        chrome.sidePanel
          .setPanelBehavior({ openPanelOnActionClick: true })
          .catch((err) => console.warn('[Vision AI] onInstalled setPanelBehavior error:', err));
      }
    });

    if (chrome.action?.onClicked) {
      chrome.action.onClicked.addListener(async (tab) => {
        try {
          if (chrome.sidePanel?.open) {
            if (tab.windowId) {
              await chrome.sidePanel.open({ windowId: tab.windowId });
            } else if (tab.id) {
              await chrome.sidePanel.open({ tabId: tab.id });
            }
          }
        } catch (err) {
          console.warn('[Vision AI] chrome.sidePanel.open error:', err);
        }
      });
    }
  }

  const router = new LLMRouter({
    apiKeys: {},
  });

  const syncStorageToRouter = async (): Promise<void> => {
    try {
      const data = await chrome.storage.local.get(['apiKeys', 'modelRoutingConfig']);
      if (data.apiKeys) {
        router.updateConfig({ apiKeys: data.apiKeys });
      }
      if (data.modelRoutingConfig) {
        router.updateConfig(data.modelRoutingConfig);
      }
    } catch (err) {
      console.warn('[Vision AI] syncStorageToRouter error:', err);
    }
  };

  syncStorageToRouter();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.apiKeys) {
        router.updateConfig({ apiKeys: changes.apiKeys.newValue });
      }
      if (changes.modelRoutingConfig) {
        router.updateConfig(changes.modelRoutingConfig.newValue);
      }
    }
  });

  // Per-Tab Isolated Agent State Machine Map
  const tabAgents = new Map<number, AgentStateMachine>();

  const getOrCreateTabAgent = (tabId: number): AgentStateMachine => {
    const key = tabId > 0 ? tabId : 0;
    const existing = tabAgents.get(key);
    if (existing) return existing;

    const machine = new AgentStateMachine(router, {
      sessionStorageKey: key > 0 ? `orbit_agent_session_tab_${key}` : 'orbit_agent_session_state',
      checkSkillCache: async (url, goal) => {
        const skill = await globalSkillStore.findMatchingSkill(url, goal);
        if (!skill) return { matched: false };
        await globalSkillStore.recordSkillExecution(skill.id);
        return {
          matched: true,
          actions: skill.steps.map((s) => ({
            type: s.action,
            value: s.value,
            stop_if_url_changes: s.stop_if_url_changes,
          })),
        };
      },
      isDestructiveAction: (action, text) => {
        const res = classifyActionSafety(action, text || '', '');
        return {
          destructive: res.isDestructive && res.severity !== 'low',
          reason: res.reason,
        };
      },
      onStateChange: (state) => {
        chrome.runtime
          .sendMessage({ type: 'AGENT_STATE_UPDATED', tabId: state.tabId || key, state })
          .catch(() => {});

        if (state.status === 'completed' && state.completedTraces.length >= 1) {
          const targetTab = state.tabId || key;
          const recordSkill = (tabUrl: string) => {
            compileTraceToSkill(tabUrl, state.goal, state.completedTraces, router).catch((err) => {
              console.warn('[Vision AI] Failed to compile trace to skill:', err);
            });
          };

          if (targetTab && typeof chrome !== 'undefined' && chrome.tabs?.get) {
            chrome.tabs
              .get(targetTab)
              .then((tab) => recordSkill(tab?.url || 'https://example.com'))
              .catch(() => recordSkill('https://example.com'));
          } else {
            recordSkill('https://example.com');
          }
        }
      },
    });

    tabAgents.set(key, machine);
    return machine;
  };

  if (typeof chrome !== 'undefined' && chrome.tabs?.onRemoved) {
    chrome.tabs.onRemoved.addListener((closedTabId) => {
      tabAgents.delete(closedTabId);
    });
  }

  const resolveActiveTabId = async (explicitTabId?: number): Promise<number> => {
    if (explicitTabId && explicitTabId > 0) return explicitTabId;
    try {
      const [lastFocused] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (lastFocused?.id) return lastFocused.id;
    } catch {}
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id) return activeTab.id;
    } catch {}
    try {
      const allTabs = await chrome.tabs.query({ active: true });
      if (allTabs[0]?.id) return allTabs[0].id;
    } catch {}
    return 0;
  };

  chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
    if (!message || typeof message !== 'object') return false;

    switch (message.type) {
      case 'START_TASK': {
        resolveActiveTabId(message.tabId).then(async (tabId) => {
          await syncStorageToRouter();
          const agent = getOrCreateTabAgent(tabId);
          // Do not block other tabs: start task asynchronously on this tab's state machine
          agent.startTask(message.goal, tabId).catch((err) => {
            console.warn(`[Vision AI] Tab ${tabId} startTask error:`, err);
          });
          sendResponse({ success: true, tabId });
        });
        return true;
      }

      case 'PAUSE_TASK': {
        resolveActiveTabId(message.tabId).then(async (tabId) => {
          const agent = getOrCreateTabAgent(tabId);
          await agent.pause();
          sendResponse({ success: true, tabId });
        });
        return true;
      }

      case 'RESUME_TASK': {
        resolveActiveTabId(message.tabId).then(async (tabId) => {
          await syncStorageToRouter();
          const agent = getOrCreateTabAgent(tabId);
          agent.resume().catch(() => {});
          sendResponse({ success: true, tabId });
        });
        return true;
      }

      case 'STOP_TASK': {
        resolveActiveTabId(message.tabId).then(async (tabId) => {
          const agent = getOrCreateTabAgent(tabId);
          await agent.stop();
          sendResponse({ success: true, tabId });
        });
        return true;
      }

      case 'GET_AGENT_STATE': {
        resolveActiveTabId(message.tabId).then(async (tabId) => {
          const agent = getOrCreateTabAgent(tabId);
          if (agent.getState().status === 'idle' && agent.getState().stepNumber === 0) {
            await agent.restoreSession();
          }
          sendResponse(agent.getState());
        });
        return true;
      }

      case 'LIST_TAB_SESSIONS': {
        (async () => {
          const summaries: TabSessionSummary[] = [];
          try {
            const tabs = await chrome.tabs.query({ currentWindow: true });
            for (const t of tabs) {
              if (!t.id) continue;
              const url = t.url || '';
              const isInternal =
                url.startsWith('chrome://') ||
                url.startsWith('chrome-extension://') ||
                url.startsWith('edge://') ||
                url.startsWith('devtools://') ||
                url.startsWith('about:');
              const agent = tabAgents.get(t.id);
              const st = agent?.getState();
              summaries.push({
                tabId: t.id,
                title: t.title || (isInternal ? 'Chrome Internal' : 'Tab'),
                url,
                status: st?.status ?? 'idle',
                stepNumber: st?.stepNumber ?? 0,
                goal: st?.goal ?? '',
                isInternal,
              });
            }
          } catch {}
          sendResponse({ sessions: summaries });
        })();
        return true;
      }

      case 'APPROVE_ACTION': {
        resolveActiveTabId(message.tabId).then(async (tabId) => {
          const agent = getOrCreateTabAgent(tabId);
          await agent.approvePendingAction(message.approved);
          sendResponse({ success: true, tabId });
        });
        return true;
      }

      default:
        break;
    }

    return false;
  });
});

