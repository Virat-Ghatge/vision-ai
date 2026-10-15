import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ElementRegistry } from '../src/lib/dom/distiller';
import { DOMDeltaTracker } from '../src/lib/dom/delta';
import { MacroBatchExecutor } from '../src/lib/executor/macroExecutor';
import { CDPActuator } from '../src/lib/cdp/actuator';
import { renderSetOfMarksOverlay, cropScreenshot } from '../src/lib/vision/som';

describe('M3: CDP Actuator, Speculative Macro-Batch Runner & Vision Fallback Suite', () => {
  let registry: ElementRegistry;

  beforeEach(() => {
    document.body.innerHTML = '';
    registry = new ElementRegistry();
  });

  describe('Speculative Macro-Batch Executor & Circuit Breakers', () => {
    it('executes full sequence when DOM remains valid and URL is stable', async () => {
      const btn = document.createElement('button');
      btn.textContent = 'Submit';
      document.body.appendChild(btn);

      const input = document.createElement('input');
      document.body.appendChild(input);

      const id1 = registry.register(input);
      const id2 = registry.register(btn);

      let currentUrl = 'https://example.com/checkout';
      const executor = new MacroBatchExecutor({
        registry,
        debounceMs: 5,
        getCurrentUrl: () => currentUrl,
      });

      const result = await executor.executeBatch([
        { type: 'fill', id: id1, value: 'John Doe' },
        { type: 'click', id: id2, stop_if_url_changes: true },
      ]);

      expect(result.executedActions).toBe(2);
      expect(result.abortedEarly).toBe(false);
      expect(input.value).toBe('John Doe');
      expect(result.executedTraces.length).toBe(2);
    });

    it('circuit-breaks when URL changes and stop_if_url_changes is enabled', async () => {
      const btn1 = document.createElement('button');
      const btn2 = document.createElement('button');
      document.body.appendChild(btn1);
      document.body.appendChild(btn2);

      const id1 = registry.register(btn1);
      const id2 = registry.register(btn2);

      let currentUrl = 'https://example.com/step1';
      const executor = new MacroBatchExecutor({
        registry,
        debounceMs: 5,
        getCurrentUrl: () => currentUrl,
      });

      btn1.addEventListener('click', () => {
        currentUrl = 'https://example.com/step2';
      });

      const result = await executor.executeBatch([
        { type: 'click', id: id1 },
        { type: 'click', id: id2, stop_if_url_changes: true },
      ]);

      expect(result.abortedEarly).toBe(true);
      expect(result.abortReason).toBe('url_changed');
      expect(result.executedActions).toBe(1);
    });

    it('circuit-breaks when an alert/validation error mutates into the DOM', async () => {
      const btn = document.createElement('button');
      document.body.appendChild(btn);
      const id1 = registry.register(btn);

      const deltaTracker = new DOMDeltaTracker(registry);
      deltaTracker.start(document.body);

      btn.addEventListener('click', () => {
        const err = document.createElement('div');
        err.setAttribute('role', 'alert');
        err.textContent = 'Payment declined: Card expired';
        document.body.appendChild(err);
      });

      const executor = new MacroBatchExecutor({
        registry,
        deltaTracker,
        debounceMs: 5,
      });

      const result = await executor.executeBatch([
        { type: 'click', id: id1 },
        { type: 'wait', value: '10' },
      ]);

      expect(result.abortedEarly).toBe(true);
      expect(result.abortReason).toBe('alert_or_error_mutated');
    });

    it('circuit-breaks if target element disappears between batched steps', async () => {
      const btn = document.createElement('button');
      document.body.appendChild(btn);
      const id1 = registry.register(btn);

      const executor = new MacroBatchExecutor({
        registry,
        debounceMs: 5,
      });

      // Disconnect element before execution
      btn.remove();

      const result = await executor.executeBatch([
        { type: 'click', id: id1 },
      ]);

      expect(result.abortedEarly).toBe(true);
      expect(result.abortReason).toBe('target_disappeared');
    });
  });

  describe('Set-of-Marks Canvas Overlay & Vision Fallback', () => {
    it('creates temporary overlay canvas with bounding boxes and numeric ID badges', () => {
      const button = document.createElement('button');
      button.textContent = 'Sign In';
      document.body.appendChild(button);

      const id = registry.register(button);
      const overlay = renderSetOfMarksOverlay([{ id, element: button }], document);

      expect(overlay.id).toBe('vision-ai-som-overlay');
      expect(overlay.style.position).toBe('fixed');
      expect(overlay.style.pointerEvents).toBe('none');
    });

    it('crops screenshot region around target with padding', async () => {
      const targetBox = { x: 100, y: 150, width: 200, height: 50 };
      const crop = await cropScreenshot('data:image/webp;base64,mockImage', targetBox, 150);

      expect(crop.dataUrl).toBeDefined();
      expect(crop.cropBox.x).toBe(0); // 100 - 150 -> max(0, -50) = 0
      expect(crop.cropBox.y).toBe(0); // 150 - 150 = 0
      expect(crop.cropBox.width).toBe(500); // 200 + 300 = 500
      expect(crop.cropBox.height).toBe(350); // 50 + 300 = 350
    });
  });

  describe('CDP Actuator Graceful Fallback', () => {
    it('dispatches synthetic events when debugger is unattached or unavailable', async () => {
      const actuator = new CDPActuator({ tabId: 1, preferCDP: false });
      const input = document.createElement('input');
      document.body.appendChild(input);

      let clicked = false;
      input.addEventListener('click', () => {
        clicked = true;
      });

      const clickRes = await actuator.click(null, input);
      expect(clickRes.success).toBe(true);
      expect(clickRes.method).toBe('synthetic');
      expect(clicked).toBe(true);

      const typeRes = await actuator.type('hello world', null, input);
      expect(typeRes.success).toBe(true);
      expect(typeRes.method).toBe('synthetic');
      expect(input.value).toBe('hello world');
    });
  });
});
