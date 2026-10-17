import { defineBackground } from 'wxt/sandbox';
import { LLMRouter } from '../src/lib/llm/router';
import { AgentStateMachine } from '../src/lib/agent/stateMachine';
import { ExtensionMessage } from '../src/lib/agent/types';
import { globalSkillStore, compileTraceToSkill } from '../src/lib/skills/skillStore';
import { classifyActionSafety } from '../src/lib/safety/interceptor';

export default defineBackground(() => {
  console.log('[Vision AI] Service Worker background loop initialized.');

  // Automatically open the side panel when the toolbar action icon is clicked
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

  // Default initial router configuration
  const router = new LLMRouter({
    apiKeys: {},
  });

  // Synchronize stored API keys and routing configuration from chrome.storage.local
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

  // Initial load
  syncStorageToRouter();

  // Keep live router in sync with any changes in ApiKeyVault / model preferences
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

  // Multi-Tab Agent Manager (Dassi AI style per-tab isolation)
  const tabAgents = new Map<number, AgentStateMachine>();

  const createAgentHooks = (boundTabId: number) => ({
    checkSkillCache: async (url: string, goal: string) => {
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
    isDestructiveAction: (action: any, text?: string) => {
      const res = classifyActionSafety(action, text || '', '');
      return {
        destructive: res.isDestructive && res.severity !== 'low',
        reason: res.reason,
      };
    },
    onStateChange: (state: any) => {
      // Broadcast state updates to open sidepanel UI
      chrome.runtime.sendMessage({ type: 'AGENT_STATE_UPDATED', state }).catch(() => {
        // Suppress errors when sidepanel is not open
      });

      if (state.status === 'completed' && state.completedTraces.length >= 1) {
        const targetTabId = state.tabId || boundTabId;
        const recordSkill = (tabUrl: string) => {
          compileTraceToSkill(tabUrl, state.goal, state.completedTraces, router).catch((err) => {
            console.warn('[Vision AI] Failed to compile trace to skill:', err);
          });
        };

        if (targetTabId && typeof chrome !== 'undefined' && chrome.tabs?.get) {
          chrome.tabs
            .get(targetTabId)
            .then((tab) => recordSkill(tab?.url || 'https://example.com'))
            .catch(() => recordSkill('https://example.com'));
        } else {
          recordSkill('https://example.com');
        }
      }
    },
  });

  const getOrCreateAgentForTab = (tabId: number): AgentStateMachine => {
    let agent = tabAgents.get(tabId);
    if (!agent) {
      const storageKey = tabId > 0 ? `orbit_agent_session_tab_${tabId}` : undefined;
      agent = new AgentStateMachine(router, createAgentHooks(tabId), storageKey);
      tabAgents.set(tabId, agent);
      if (storageKey) {
        agent.restoreSession().catch(() => {});
      }
    }
    return agent;
  };

  const resolveTargetTabId = async (requestedTabId?: number): Promise<number> => {
    if (requestedTabId && requestedTabId > 0) return requestedTabId;
    if (typeof chrome === 'undefined' || !chrome.tabs?.query) return 0;
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

  // Restore sessions for currently open tabs on background reload
  if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
    chrome.tabs.query({}).then((tabs) => {
      for (const t of tabs) {
        if (t.id) {
          getOrCreateAgentForTab(t.id);
        }
      }
    }).catch(() => {});
  }

  // Clean up tab agent when tab is closed
  if (typeof chrome !== 'undefined' && chrome.tabs?.onRemoved) {
    chrome.tabs.onRemoved.addListener((tabId) => {
      const agent = tabAgents.get(tabId);
      if (agent) {
        agent.stop().catch(() => {});
        tabAgents.delete(tabId);
      }
    });
  }

  chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
    if (!message || typeof message !== 'object') return false;

    switch (message.type) {
      case 'START_TASK': {
        resolveTargetTabId(message.tabId).then(async (tabId) => {
          await syncStorageToRouter();
          const agent = getOrCreateAgentForTab(tabId);
          await agent.startTask(message.goal, tabId);
          sendResponse({ success: true, tabId });
        });
        return true;
      }

      case 'PAUSE_TASK': {
        resolveTargetTabId(message.tabId).then(async (tabId) => {
          const agent = getOrCreateAgentForTab(tabId);
          await agent.pause();
          sendResponse({ success: true, tabId });
        });
        return true;
      }

      case 'RESUME_TASK': {
        resolveTargetTabId(message.tabId).then(async (tabId) => {
          await syncStorageToRouter();
          const agent = getOrCreateAgentForTab(tabId);
          await agent.resume();
          sendResponse({ success: true, tabId });
        });
        return true;
      }

      case 'STOP_TASK': {
        resolveTargetTabId(message.tabId).then(async (tabId) => {
          const agent = getOrCreateAgentForTab(tabId);
          await agent.stop();
          sendResponse({ success: true, tabId });
        });
        return true;
      }

      case 'GET_AGENT_STATE': {
        resolveTargetTabId(message.tabId).then((tabId) => {
          const agent = getOrCreateAgentForTab(tabId);
          sendResponse(agent.getState());
        });
        return true;
      }

      case 'APPROVE_ACTION': {
        resolveTargetTabId(message.tabId).then(async (tabId) => {
          const agent = getOrCreateAgentForTab(tabId);
          await agent.approvePendingAction(message.approved);
          sendResponse({ success: true, tabId });
        });
        return true;
      }

      case 'LIST_TAB_SESSIONS': {
        (async () => {
          try {
            const allTabs = typeof chrome !== 'undefined' && chrome.tabs?.query ? await chrome.tabs.query({}) : [];
            const sessions = allTabs
              .filter((tab) => typeof tab.id === 'number')
              .map((tab) => {
                const agent = tabAgents.get(tab.id!);
                const state = agent ? agent.getState() : null;
                return {
                  tabId: tab.id!,
                  title: tab.title || 'Untitled Tab',
                  url: tab.url || '',
                  status: state ? state.status : 'idle',
                  stepNumber: state ? state.stepNumber : 0,
                  goal: state ? state.goal : '',
                };
              });
            sendResponse({ sessions });
          } catch (err) {
            sendResponse({ sessions: [], error: String(err) });
          }
        })();
        return true;
      }

      default:
        break;
    }

    return false;
  });
});

