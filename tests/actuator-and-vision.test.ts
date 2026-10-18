import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ElementRegistry } from '../src/lib/dom/distiller';
import { DOMDeltaTracker } from '../src/lib/dom/delta';
import { MacroBatchExecutor, smartScroll, dispatchRealisticClick } from '../src/lib/executor/macroExecutor';
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

      // Subsequent type replaces previous content cleanly (React clearing behavior)
      const events: string[] = [];
      input.addEventListener('beforeinput', (e) => events.push(e.type));
      input.addEventListener('input', (e) => events.push(e.type));
      input.addEventListener('change', (e) => events.push(e.type));

      const typeRes2 = await actuator.type('new text', null, input);
      expect(typeRes2.success).toBe(true);
      expect(input.value).toBe('new text');
      expect(events).toContain('input');
      expect(events).toContain('change');
    });

    it('submits form on press Enter in input field', async () => {
      const form = document.createElement('form');
      const input = document.createElement('input');
      form.appendChild(input);
      document.body.appendChild(form);

      let formSubmitted = false;
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        formSubmitted = true;
      });

      const id = registry.register(input);
      const executor = new MacroBatchExecutor({ registry });

      await executor.executeBatch([
        { type: 'fill', id, value: 'Vision AI Search' },
        { type: 'press', id, value: 'Enter' },
      ]);

      expect(input.value).toBe('Vision AI Search');
      expect(formSubmitted).toBe(true);
    });

    it('smartScroll scrolls an inner overflow-y: auto container', () => {
      const container = document.createElement('div');
      container.style.overflowY = 'auto';
      Object.defineProperty(container, 'scrollHeight', { value: 800, configurable: true });
      Object.defineProperty(container, 'clientHeight', { value: 300, configurable: true });
      container.scrollTop = 0;
      (container as any).scrollBy = vi.fn();
      document.body.appendChild(container);

      smartScroll('down', container);
      expect(container.scrollBy).toHaveBeenCalledWith({ top: 450, behavior: 'instant' });
      expect(container.scrollTop).toBe(450);

      smartScroll('up', container);
      expect(container.scrollBy).toHaveBeenCalledWith({ top: -450, behavior: 'instant' });
      expect(container.scrollTop).toBe(0);
    });

    it('smartScroll on an inner scrollable div scrolls the container when targeting child elements', () => {
      const scrollableDiv = document.createElement('div');
      scrollableDiv.className = 'coursera-lecture-sidebar';
      scrollableDiv.style.overflowY = 'auto';
      Object.defineProperty(scrollableDiv, 'scrollHeight', { value: 1200, configurable: true });
      Object.defineProperty(scrollableDiv, 'clientHeight', { value: 400, configurable: true });
      scrollableDiv.scrollTop = 0;
      (scrollableDiv as any).scrollBy = vi.fn();

      const childItem = document.createElement('div');
      childItem.textContent = 'Module 4: Dynamic Programming';
      scrollableDiv.appendChild(childItem);
      document.body.appendChild(scrollableDiv);

      smartScroll('down', childItem);
      expect(scrollableDiv.scrollBy).toHaveBeenCalledWith({ top: 450, behavior: 'instant' });
      expect(scrollableDiv.scrollTop).toBe(450);

      smartScroll('up', childItem);
      expect(scrollableDiv.scrollBy).toHaveBeenCalledWith({ top: -450, behavior: 'instant' });
      expect(scrollableDiv.scrollTop).toBe(0);
    });

    it('dispatchRealisticClick fires pointerdown and pointerup with composed: true', () => {
      const btn = document.createElement('button');
      btn.textContent = 'Coursera Lesson';
      document.body.appendChild(btn);

      const eventsFired: Array<{ type: string; composed: boolean }> = [];
      const trackEvent = (e: Event) => {
        eventsFired.push({ type: e.type, composed: e.composed });
      };

      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((evt) => {
        btn.addEventListener(evt, trackEvent);
      });

      dispatchRealisticClick(btn);

      expect(eventsFired.some((e) => e.type === 'pointerdown' && e.composed === true)).toBe(true);
      expect(eventsFired.some((e) => e.type === 'pointerup' && e.composed === true)).toBe(true);
      expect(eventsFired.some((e) => e.type === 'click')).toBe(true);
    });

    it('complete_media seeks and dispatches timeupdate and ended on video elements', async () => {
      const video = document.createElement('video');
      Object.defineProperty(video, 'duration', { value: 60, configurable: true });
      video.play = vi.fn().mockResolvedValue(undefined);
      document.body.appendChild(video);

      let endedFired = false;
      let timeupdateFired = false;
      video.addEventListener('ended', () => {
        endedFired = true;
      });
      video.addEventListener('timeupdate', () => {
        timeupdateFired = true;
      });

      const executor = new MacroBatchExecutor({ registry });
      await executor.executeBatch([{ type: 'complete_media' }]);

      expect(video.play).toHaveBeenCalled();
      expect(video.playbackRate).toBe(2.0);
      expect(video.currentTime).toBe(59.75);
      expect(timeupdateFired).toBe(true);
      expect(endedFired).toBe(true);
    });
  });
});
