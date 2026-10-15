import { defineContentScript } from 'wxt/sandbox';
import { globalElementRegistry, distillViewport } from '../src/lib/dom/distiller';
import { DOMDeltaTracker } from '../src/lib/dom/delta';
import { MacroBatchExecutor } from '../src/lib/executor/macroExecutor';
import { captureTargetVisionCrop } from '../src/lib/vision/som';
import { ExtensionMessage } from '../src/lib/agent/types';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    console.log('[OrbitAgent] Content script active with 4-layer distillation engine.');

    const deltaTracker = new DOMDeltaTracker(globalElementRegistry);
    const executor = new MacroBatchExecutor({
      registry: globalElementRegistry,
      deltaTracker,
      debounceMs: 120,
    });

    chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
      if (!message || typeof message !== 'object') return false;

      switch (message.type) {
        case 'DISTILL_VIEWPORT': {
          const result = distillViewport(document, globalElementRegistry);
          deltaTracker.start(document.body);
          sendResponse({ text: result.text, count: result.interactiveCount });
          return true;
        }

        case 'GET_DELTA': {
          const delta = deltaTracker.flushDelta();
          sendResponse({ text: delta.text, hasAlertOrError: delta.hasAlertOrError });
          return true;
        }

        case 'EXECUTE_MACRO': {
          executor
            .executeBatch(message.actions)
            .then((result) => sendResponse(result))
            .catch((err) =>
              sendResponse({
                totalActions: message.actions.length,
                executedActions: 0,
                abortedEarly: true,
                abortReason: 'action_failed',
                executedTraces: [],
                error: String(err),
              })
            );
          return true;
        }

        case 'REQUEST_VISION_CROP': {
          captureTargetVisionCrop(message.targetId, globalElementRegistry)
            .then((res) => sendResponse(res))
            .catch((err) => sendResponse({ error: String(err) }));
          return true;
        }

        default:
          break;
      }

      return false;
    });
  },
});
