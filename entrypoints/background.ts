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

  const stateMachine = new AgentStateMachine(router, {
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
      // Broadcast state updates to open sidepanel UI
      chrome.runtime.sendMessage({ type: 'AGENT_STATE_UPDATED', state }).catch(() => {
        // Suppress errors when sidepanel is not open
      });

      if (state.status === 'completed' && state.completedTraces.length >= 1) {
        const tabId = state.tabId;
        const recordSkill = (tabUrl: string) => {
          compileTraceToSkill(tabUrl, state.goal, state.completedTraces, router).catch((err) => {
            console.warn('[Vision AI] Failed to compile trace to skill:', err);
          });
        };

        if (tabId && typeof chrome !== 'undefined' && chrome.tabs?.get) {
          chrome.tabs
            .get(tabId)
            .then((tab) => recordSkill(tab?.url || 'https://example.com'))
            .catch(() => recordSkill('https://example.com'));
        } else {
          recordSkill('https://example.com');
        }
      }
    },
  });

  // Restore active session on background reload
  stateMachine.restoreSession();

  chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
    if (!message || typeof message !== 'object') return false;

    switch (message.type) {
      case 'START_TASK': {
        const getTabId = async (): Promise<number> => {
          if (message.tabId) return message.tabId;
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

        getTabId().then(async (tabId) => {
          await syncStorageToRouter();
          await stateMachine.startTask(message.goal, tabId);
          sendResponse({ success: true, tabId });
        });
        return true;
      }

      case 'PAUSE_TASK': {
        stateMachine.pause().then(() => sendResponse({ success: true }));
        return true;
      }

      case 'RESUME_TASK': {
        syncStorageToRouter()
          .then(() => stateMachine.resume())
          .then(() => sendResponse({ success: true }));
        return true;
      }

      case 'STOP_TASK': {
        stateMachine.stop().then(() => sendResponse({ success: true }));
        return true;
      }

      case 'GET_AGENT_STATE': {
        sendResponse(stateMachine.getState());
        return false;
      }

      case 'APPROVE_ACTION': {
        stateMachine.approvePendingAction(message.approved).then(() => sendResponse({ success: true }));
        return true;
      }

      default:
        break;
    }

    return false;
  });
});
