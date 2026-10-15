import { defineBackground } from 'wxt/sandbox';
import { LLMRouter } from '../src/lib/llm/router';
import { AgentStateMachine } from '../src/lib/agent/stateMachine';
import { ExtensionMessage } from '../src/lib/agent/types';

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

  // Load stored API keys from chrome.storage.local
  chrome.storage.local.get(['apiKeys', 'modelRoutingConfig']).then((data) => {
    if (data.apiKeys) {
      router.updateConfig({ apiKeys: data.apiKeys });
    }
    if (data.modelRoutingConfig) {
      router.updateConfig(data.modelRoutingConfig);
    }
  });

  const stateMachine = new AgentStateMachine(router, {
    onStateChange: (state) => {
      // Broadcast state updates to open sidepanel UI
      chrome.runtime.sendMessage({ type: 'AGENT_STATE_UPDATED', state }).catch(() => {
        // Suppress errors when sidepanel is not open
      });
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
          const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
          return activeTab?.id ?? 0;
        };

        getTabId().then((tabId) => {
          stateMachine.startTask(message.goal, tabId);
          sendResponse({ success: true });
        });
        return true;
      }

      case 'PAUSE_TASK': {
        stateMachine.pause().then(() => sendResponse({ success: true }));
        return true;
      }

      case 'RESUME_TASK': {
        stateMachine.resume().then(() => sendResponse({ success: true }));
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
