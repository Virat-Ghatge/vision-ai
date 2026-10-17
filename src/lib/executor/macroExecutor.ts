import { MacroAction } from '../llm/types';
import { ElementRegistry, globalElementRegistry, collectAllElementsDeep } from '../dom/distiller';
import { DOMDeltaTracker } from '../dom/delta';
import { CDPActuator } from '../cdp/actuator';

export type AbortReason =
  | 'url_changed'
  | 'target_disappeared'
  | 'alert_or_error_mutated'
  | 'action_failed'
  | 'vision_crop_requested';

export interface ActionTrace {
  action: MacroAction;
  timestamp: number;
  success: boolean;
  error?: string;
  selector?: string;
  elementText?: string;
}

export function highlightTarget(el: HTMLElement): void {
  if (!el || typeof el.style === 'undefined') return;
  const originalOutline = el.style.outline;
  const originalOffset = el.style.outlineOffset;
  el.style.outline = '2px solid #39d353';
  el.style.outlineOffset = '2px';
  setTimeout(() => {
    try {
      el.style.outline = originalOutline;
      el.style.outlineOffset = originalOffset;
    } catch {}
  }, 350);
}

/**
 * Dispatches realistic pointer and mouse event sequence required by modern LMS / SPA UI frameworks
 * (React Aria, MUI, Shoelace, NetAcad Adapt Web Components) with composed: true to cross Shadow DOM boundaries.
 */
export function dispatchRealisticClick(el: HTMLElement): void {
  try {
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  } catch {}

  const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
  const clientX = Math.round((rect.left || 0) + (rect.width || 0) / 2);
  const clientY = Math.round((rect.top || 0) + (rect.height || 0) / 2);

  const win = typeof window !== 'undefined' ? window : undefined;
  const PointerEventClass = typeof PointerEvent !== 'undefined' ? PointerEvent : MouseEvent;

  const baseInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX,
    clientY,
    button: 0,
    buttons: 1,
    view: win,
  };

  try {
    el.dispatchEvent(new PointerEventClass('pointerover', { ...baseInit, buttons: 0 }));
    el.dispatchEvent(new MouseEvent('mouseover', { ...baseInit, buttons: 0 }));
    el.dispatchEvent(new PointerEventClass('pointerdown', baseInit));
    el.dispatchEvent(new MouseEvent('mousedown', baseInit));
    if (typeof el.focus === 'function') {
      el.focus();
    }
    el.dispatchEvent(new PointerEventClass('pointerup', { ...baseInit, buttons: 0 }));
    el.dispatchEvent(new MouseEvent('mouseup', { ...baseInit, buttons: 0 }));
    el.dispatchEvent(new MouseEvent('click', { ...baseInit, buttons: 0 }));
    if (typeof el.click === 'function') {
      el.click();
    }
  } catch {
    if (typeof el.click === 'function') {
      el.click();
    }
  }
}

/**
 * Smart scrolling engine:
 * Handles inner overflow-y containers on Coursera and NetAcad (e.g. curriculum sidebars, lecture panes)
 * as well as top-level window scrolling.
 */
export function smartScroll(direction: 'up' | 'down', targetEl?: HTMLElement | null): void {
  const deltaY = direction === 'up' ? -400 : 400;

  if (targetEl) {
    let cur: HTMLElement | null = targetEl;
    let scrollableEl: HTMLElement | null = null;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      if (cur.scrollHeight > cur.clientHeight + 10) {
        scrollableEl = cur;
        break;
      }
      cur = cur.parentElement || ((cur.getRootNode?.() as ShadowRoot)?.host as HTMLElement) || null;
    }

    if (scrollableEl) {
      if (typeof scrollableEl.scrollBy === 'function') {
        scrollableEl.scrollBy({ top: deltaY, behavior: 'instant' });
      } else {
        scrollableEl.scrollTop = (scrollableEl.scrollTop || 0) + deltaY;
      }
      return;
    }
  }

  if (typeof window !== 'undefined') {
    try {
      if (typeof window.scrollBy === 'function') {
        window.scrollBy({ top: deltaY, behavior: 'instant' });
      }
    } catch {}

    try {
      const allEls = collectAllElementsDeep(document);
      const scrollableContainers: Array<{ el: HTMLElement; area: number }> = [];

      for (const el of allEls) {
        if (el === document.body || el === document.documentElement) continue;
        if (el.scrollHeight > el.clientHeight + 20) {
          try {
            const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
            const overflowY = style ? style.overflowY || '' : '';
            if (['auto', 'scroll', 'overlay'].includes(overflowY)) {
              const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 100, height: 100 };
              const width = rect.width || 100;
              const height = rect.height || 100;
              if (width > 20 && height > 20) {
                scrollableContainers.push({ el, area: width * height });
              }
            }
          } catch {}
        }
      }

      scrollableContainers.sort((a, b) => b.area - a.area);

      for (let i = 0; i < Math.min(2, scrollableContainers.length); i++) {
        const container = scrollableContainers[i].el;
        if (typeof container.scrollBy === 'function') {
          container.scrollBy({ top: deltaY, behavior: 'instant' });
        } else {
          container.scrollTop = (container.scrollTop || 0) + deltaY;
        }
      }
    } catch {}
  }
}

export function getElementSelector(el: HTMLElement): string {
  if (el.id) {
    return `#${CSS?.escape ? CSS.escape(el.id) : el.id}`;
  }
  const role = el.getAttribute('role');
  if (role) {
    const name = el.getAttribute('aria-label') || el.getAttribute('name');
    if (name) {
      const esc = CSS?.escape ? CSS.escape(name) : name;
      return `[role="${role}"][aria-label="${esc}"]`;
    }
    return `[role="${role}"]`;
  }
  const name = el.getAttribute('name');
  if (name) {
    const esc = CSS?.escape ? CSS.escape(name) : name;
    return `${el.tagName.toLowerCase()}[name="${esc}"]`;
  }
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) {
    const esc = CSS?.escape ? CSS.escape(ariaLabel) : ariaLabel;
    return `${el.tagName.toLowerCase()}[aria-label="${esc}"]`;
  }
  const testId = el.getAttribute('data-testid') || el.getAttribute('data-test');
  if (testId) {
    const esc = CSS?.escape ? CSS.escape(testId) : testId;
    return `[data-testid="${esc}"]`;
  }
  if (el.className && typeof el.className === 'string') {
    const classes = el.className.trim().split(/\s+/).filter((c) => !c.includes(':') && !c.includes('/'));
    if (classes.length > 0) {
      return `${el.tagName.toLowerCase()}.${classes.slice(0, 2).map((c) => (CSS?.escape ? CSS.escape(c) : c)).join('.')}`;
    }
  }
  return el.tagName.toLowerCase();
}

export interface MacroExecutionResult {
  totalActions: number;
  executedActions: number;
  abortedEarly: boolean;
  abortReason?: AbortReason;
  executedTraces: ActionTrace[];
}

export interface MacroExecutorOptions {
  registry?: ElementRegistry;
  actuator?: CDPActuator;
  deltaTracker?: DOMDeltaTracker;
  debounceMs?: number;
  getCurrentUrl?: () => string;
}

export class MacroBatchExecutor {
  private registry: ElementRegistry;
  private actuator?: CDPActuator;
  private deltaTracker?: DOMDeltaTracker;
  private debounceMs: number;
  private getCurrentUrl: () => string;

  constructor(options?: MacroExecutorOptions) {
    this.registry = options?.registry ?? globalElementRegistry;
    this.actuator = options?.actuator;
    this.deltaTracker = options?.deltaTracker;
    this.debounceMs = options?.debounceMs ?? 120;
    this.getCurrentUrl =
      options?.getCurrentUrl ??
      (() => (typeof window !== 'undefined' ? window.location.href : ''));
  }

  /**
   * Executes a sequence of speculative macro-actions with mid-batch validation
   * circuit breakers: URL navigation, target node disappearance, and alert/validation error mutations.
   */
  async executeBatch(actions: MacroAction[]): Promise<MacroExecutionResult> {
    const executedTraces: ActionTrace[] = [];
    const initialUrl = this.getCurrentUrl();
    let lastTargetEl: HTMLElement | null = null;

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];

      // Circuit Breaker 1: URL change when stop_if_url_changes is true
      if (action.stop_if_url_changes && this.getCurrentUrl() !== initialUrl) {
        return {
          totalActions: actions.length,
          executedActions: i,
          abortedEarly: true,
          abortReason: 'url_changed',
          executedTraces,
        };
      }

      // Circuit Breaker 2: Alert or validation error mutated into DOM
      if (this.deltaTracker) {
        const delta = this.deltaTracker.flushDelta();
        if (delta.hasAlertOrError) {
          return {
            totalActions: actions.length,
            executedActions: i,
            abortedEarly: true,
            abortReason: 'alert_or_error_mutated',
            executedTraces,
          };
        }
      }

      // Check Vision Crop action
      if (action.type === 'request_vision_crop') {
        executedTraces.push({
          action,
          timestamp: Date.now(),
          success: true,
        });
        return {
          totalActions: actions.length,
          executedActions: i + 1,
          abortedEarly: true,
          abortReason: 'vision_crop_requested',
          executedTraces,
        };
      }

      // Circuit Breaker 3: Target element disappearance
      let targetEl: HTMLElement | null = null;
      if (action.id !== undefined) {
        targetEl = this.registry.getElement(action.id);
        if (!targetEl || !targetEl.isConnected) {
          return {
            totalActions: actions.length,
            executedActions: i,
            abortedEarly: true,
            abortReason: 'target_disappeared',
            executedTraces,
          };
        }
      } else if (action.type === 'press' && lastTargetEl && lastTargetEl.isConnected) {
        targetEl = lastTargetEl;
      }

      if (targetEl) {
        lastTargetEl = targetEl;
      }

      let selector: string | undefined;
      let elementText: string | undefined;
      if (targetEl) {
        selector = getElementSelector(targetEl);
        elementText = (targetEl.innerText || targetEl.textContent || '').trim().slice(0, 100);
      }

      // Execute atomic action
      try {
        await this.executeSingleAction(action, targetEl, lastTargetEl);
        executedTraces.push({
          action,
          timestamp: Date.now(),
          success: true,
          selector,
          elementText,
        });
      } catch (err) {
        executedTraces.push({
          action,
          timestamp: Date.now(),
          success: false,
          error: err instanceof Error ? err.message : String(err),
          selector,
          elementText,
        });

        return {
          totalActions: actions.length,
          executedActions: i + 1,
          abortedEarly: true,
          abortReason: 'action_failed',
          executedTraces,
        };
      }

      // Spec: 120ms debounce between batched steps
      if (i < actions.length - 1 && this.debounceMs > 0) {
        await new Promise((r) => setTimeout(r, this.debounceMs));
      }
    }

    return {
      totalActions: actions.length,
      executedActions: actions.length,
      abortedEarly: false,
      executedTraces,
    };
  }

  private async executeSingleAction(
    action: MacroAction,
    targetEl: HTMLElement | null,
    lastTargetEl?: HTMLElement | null
  ): Promise<void> {
    const coords = action.id !== undefined ? this.registry.getCenterCoordinates(action.id) : null;

    switch (action.type) {
      case 'click': {
        if (targetEl) {
          highlightTarget(targetEl);
          if (targetEl.tagName === 'VIDEO') {
            try {
              const video = targetEl as HTMLVideoElement;
              if (video.paused) {
                video.play().catch(() => {});
              } else {
                video.pause();
              }
            } catch {}
          }
        }
        if (this.actuator) {
          const res = await this.actuator.click(coords, targetEl);
          if (!res.success) throw new Error(res.error ?? 'Click failed');
        } else if (targetEl) {
          dispatchRealisticClick(targetEl);
        } else {
          throw new Error(`Target element for click [${action.id}] not found`);
        }
        break;
      }

      case 'fill': {
        const val = action.value ?? '';
        if (targetEl) {
          highlightTarget(targetEl);
          try {
            targetEl.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
          } catch {}
        }
        if (this.actuator) {
          const res = await this.actuator.type(val, coords, targetEl);
          if (!res.success) throw new Error(res.error ?? 'Fill failed');
        } else if (targetEl) {
          targetEl.focus();
          if (targetEl instanceof HTMLInputElement || targetEl instanceof HTMLTextAreaElement) {
            const proto =
              targetEl instanceof HTMLInputElement
                ? window.HTMLInputElement.prototype
                : window.HTMLTextAreaElement.prototype;
            const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
            if (nativeSetter) {
              nativeSetter.call(targetEl, val);
            } else {
              targetEl.value = val;
            }
            targetEl.dispatchEvent(new Event('input', { bubbles: true }));
            targetEl.dispatchEvent(new Event('change', { bubbles: true }));
          } else if (targetEl.isContentEditable) {
            targetEl.textContent = val;
            targetEl.dispatchEvent(new Event('input', { bubbles: true }));
          }
        } else {
          throw new Error(`Target element for fill [${action.id}] not found`);
        }
        break;
      }

      case 'select': {
        if (targetEl) {
          highlightTarget(targetEl);
        }
        if (targetEl instanceof HTMLSelectElement) {
          targetEl.value = action.value ?? '';
          targetEl.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (targetEl) {
          dispatchRealisticClick(targetEl);
        } else {
          throw new Error(`Target select element [${action.id}] not found`);
        }
        break;
      }

      case 'press': {
        const key = action.value ?? 'Enter';
        const active = targetEl || lastTargetEl || (typeof document !== 'undefined' ? (document.activeElement as HTMLElement) || document.body : null);
        if (this.actuator) {
          const res = await this.actuator.pressKey(key, active);
          if (!res.success) throw new Error(res.error ?? 'Press failed');
        } else if (active) {
          const keyCode = key === 'Enter' ? 13 : key === 'Tab' ? 9 : key === 'Escape' ? 27 : key === 'Backspace' ? 8 : 0;
          const eventInit: KeyboardEventInit = {
            key,
            code: key,
            bubbles: true,
            cancelable: true,
            composed: true,
          };
          const keydown = new KeyboardEvent('keydown', eventInit);
          Object.defineProperty(keydown, 'keyCode', { get: () => keyCode });
          Object.defineProperty(keydown, 'which', { get: () => keyCode });
          active.dispatchEvent(keydown);

          const keypress = new KeyboardEvent('keypress', eventInit);
          Object.defineProperty(keypress, 'keyCode', { get: () => keyCode });
          Object.defineProperty(keypress, 'which', { get: () => keyCode });
          active.dispatchEvent(keypress);

          const keyup = new KeyboardEvent('keyup', eventInit);
          Object.defineProperty(keyup, 'keyCode', { get: () => keyCode });
          Object.defineProperty(keyup, 'which', { get: () => keyCode });
          active.dispatchEvent(keyup);

          if (key === 'Enter') {
            const form = active instanceof HTMLInputElement ? active.form : (active.closest ? active.closest('form') : null);
            if (form) {
              try {
                if (typeof form.requestSubmit === 'function') {
                  form.requestSubmit();
                } else {
                  form.submit();
                }
              } catch {}
            }
          }
        }
        break;
      }

      case 'scroll': {
        const dir = action.value === 'up' ? 'up' : 'down';
        if (this.actuator) {
          await this.actuator.scroll(dir);
        } else {
          smartScroll(dir, targetEl);
        }
        break;
      }

      case 'complete_media': {
        if (typeof document !== 'undefined') {
          const allEls = collectAllElementsDeep(document);
          const mediaEls = allEls.filter(
            (el): el is HTMLVideoElement | HTMLAudioElement =>
              el.tagName === 'VIDEO' || el.tagName === 'AUDIO'
          );

          for (const media of mediaEls) {
            try {
              if (typeof media.play === 'function') {
                media.play().catch(() => {});
              }
              if (isFinite(media.duration) && media.duration > 0) {
                media.currentTime = Math.max(0, media.duration - 0.5);
              }
              media.playbackRate = 2.0;
              media.dispatchEvent(new Event('timeupdate', { bubbles: true, composed: true }));
              media.dispatchEvent(new Event('ended', { bubbles: true, composed: true }));
            } catch {}
          }
        }
        break;
      }

      case 'wait': {
        const ms = action.value ? parseInt(action.value, 10) : 500;
        await new Promise((r) => setTimeout(r, isNaN(ms) ? 500 : ms));
        break;
      }

      default:
        break;
    }
  }
}
