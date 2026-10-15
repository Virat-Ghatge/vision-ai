import { defineBackground } from 'wxt/sandbox';
import { LLMRouter } from '../src/lib/llm/router';
import { AgentStateMachine } from '../src/lib/agent/stateMachine';
import { ExtensionMessage } from '../src/lib/agent/types';

export default defineBackground(() => {
  console.log('[Vision AI] Service Worker background loop initialized.');

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
