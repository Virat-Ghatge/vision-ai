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
  const originalBoxShadow = el.style.boxShadow;
  // Marvel's Vision Mind Stone gold + Android teal spotlight
  el.style.outline = '2px solid #fbbf24';
  el.style.outlineOffset = '2px';
  el.style.boxShadow = '0 0 14px rgba(251, 191, 36, 0.75)';
  setTimeout(() => {
    try {
      el.style.outline = originalOutline;
      el.style.outlineOffset = originalOffset;
      el.style.boxShadow = originalBoxShadow;
    } catch {}
  }, 450);
}

/**
 * Dispatches a realistic PointerEvent + MouseEvent sequence with composed: true
 * for React Aria (Coursera), Material UI, and Shadow DOM (Cisco NetAcad).
 */
export function dispatchRealisticClick(el: HTMLElement): void {
  try {
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  } catch {}

  const rect = el.getBoundingClientRect
    ? el.getBoundingClientRect()
    : { left: 10, top: 10, width: 20, height: 20 };
  const clientX = Math.round(rect.left + (rect.width || 20) / 2);
  const clientY = Math.round(rect.top + (rect.height || 20) / 2);

  const eventOpts: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: typeof window !== 'undefined' ? window : undefined,
    clientX,
    clientY,
    button: 0,
    buttons: 1,
  };

  if (typeof PointerEvent !== 'undefined') {
    el.dispatchEvent(new PointerEvent('pointerover', { ...eventOpts, pointerId: 1, isPrimary: true }));
    el.dispatchEvent(
      new PointerEvent('pointerenter', { ...eventOpts, bubbles: false, pointerId: 1, isPrimary: true })
    );
    el.dispatchEvent(new PointerEvent('pointerdown', { ...eventOpts, pointerId: 1, isPrimary: true }));
  }

  el.dispatchEvent(new MouseEvent('mouseover', eventOpts));
  el.dispatchEvent(new MouseEvent('mousedown', eventOpts));
  try {
    el.focus();
  } catch {}

  if (typeof PointerEvent !== 'undefined') {
    el.dispatchEvent(
      new PointerEvent('pointerup', { ...eventOpts, buttons: 0, pointerId: 1, isPrimary: true })
    );
  }

  el.dispatchEvent(new MouseEvent('mouseup', { ...eventOpts, buttons: 0 }));

  // If element is wrapped inside an <a> or <button>, ensure the interactive element receives the click
  const clickableTarget =
    el.tagName === 'A' || el.tagName === 'BUTTON' || el.tagName === 'INPUT'
      ? el
      : (el.closest?.('a, button, [role="button"], [role="link"], [role="checkbox"]') as HTMLElement | null) ||
        el;

  clickableTarget.click();
}

export function smartScroll(
  direction: 'up' | 'down',
  targetEl?: HTMLElement | null,
  amount = 450
): void {
  const deltaY = direction === 'down' ? amount : -amount;

  if (targetEl) {
    let cur: HTMLElement | null = targetEl;
    while (cur) {
      if (cur.scrollHeight > cur.clientHeight + 10) {
        cur.scrollTop += deltaY;
        try {
          cur.scrollBy({ top: deltaY, behavior: 'instant' });
        } catch {}
        return;
      }
      cur = cur.parentElement || ((cur.getRootNode?.() as ShadowRoot)?.host as HTMLElement) || null;
    }
  }

  if (typeof window !== 'undefined') {
    try {
      window.scrollBy({ top: deltaY, behavior: 'instant' });
    } catch {
      window.scrollBy(0, deltaY);
    }
  }

  if (typeof document !== 'undefined' && document.body) {
    const allNodes = collectAllElementsDeep(document.body, 2500);
    const scrollables: Array<{ el: HTMLElement; area: number }> = [];

    for (const node of allNodes) {
      if (node.scrollHeight <= node.clientHeight + 20) continue;
      if (typeof window !== 'undefined' && window.getComputedStyle) {
        const style = window.getComputedStyle(node);
        if (!['auto', 'scroll', 'overlay'].includes(style.overflowY)) continue;
      }
      const r = node.getBoundingClientRect ? node.getBoundingClientRect() : null;
      const area = r && r.width > 0 && r.height > 0 ? r.width * r.height : 1000;
      scrollables.push({ el: node, area });
    }

    scrollables.sort((a, b) => b.area - a.area);
    for (const item of scrollables.slice(0, 3)) {
      item.el.scrollTop += deltaY;
      try {
        item.el.scrollBy({ top: deltaY, behavior: 'instant' });
      } catch {}
    }
  }
}

export async function completePageMedia(targetEl?: HTMLElement | null): Promise<void> {
  if (typeof document === 'undefined' || !document.body) return;
  const allElements = collectAllElementsDeep(document.body, 2500);
  const mediaEls = allElements.filter(
    (el): el is HTMLMediaElement =>
      el.tagName.toUpperCase() === 'VIDEO' || el.tagName.toUpperCase() === 'AUDIO'
  );

  if (targetEl && (targetEl.tagName === 'VIDEO' || targetEl.tagName === 'AUDIO')) {
    if (!mediaEls.includes(targetEl as HTMLMediaElement)) {
      mediaEls.unshift(targetEl as HTMLMediaElement);
    }
  }

  for (const media of mediaEls) {
    try {
      media.muted = true;
      media.playbackRate = 2.0;
      const playPromise = media.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        await playPromise.catch(() => {});
      }
      if (Number.isFinite(media.duration) && media.duration > 1) {
        media.currentTime = Math.max(0, media.duration - 0.25);
      }
      media.dispatchEvent(new Event('play', { bubbles: true }));
      media.dispatchEvent(new Event('playing', { bubbles: true }));
      media.dispatchEvent(new Event('timeupdate', { bubbles: true }));
      media.dispatchEvent(new Event('ended', { bubbles: true }));
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
    const classes = el.className
      .trim()
      .split(/\s+/)
      .filter((c) => !c.includes(':') && !c.includes('/'));
    if (classes.length > 0) {
      return `${el.tagName.toLowerCase()}.${classes
        .slice(0, 2)
        .map((c) => (CSS?.escape ? CSS.escape(c) : c))
        .join('.')}`;
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
    this.debounceMs = options?.debounceMs ?? 140;
    this.getCurrentUrl =
      options?.getCurrentUrl ??
      (() => (typeof window !== 'undefined' ? window.location.href : ''));
  }

  async executeBatch(actions: MacroAction[]): Promise<MacroExecutionResult> {
    const executedTraces: ActionTrace[] = [];
    const initialUrl = this.getCurrentUrl();
    let lastTargetEl: HTMLElement | null = null;

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];

      if (action.stop_if_url_changes && this.getCurrentUrl() !== initialUrl) {
        return {
          totalActions: actions.length,
          executedActions: i,
          abortedEarly: true,
          abortReason: 'url_changed',
          executedTraces,
        };
      }

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

      let targetEl: HTMLElement | null = null;
      if (action.id !== undefined) {
        targetEl = this.registry.getElement(action.id);
        if (
          (!targetEl || !targetEl.isConnected) &&
          action.type !== 'scroll' &&
          action.type !== 'complete_media'
        ) {
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
          try {
            if (typeof (targetEl as HTMLInputElement).select === 'function') {
              (targetEl as HTMLInputElement).select();
            }
            if (typeof document !== 'undefined' && typeof document.execCommand === 'function') {
              document.execCommand('selectAll', false, undefined);
              document.execCommand('delete', false, undefined);
            }
          } catch {}
          if (targetEl instanceof HTMLInputElement || targetEl instanceof HTMLTextAreaElement) {
            const proto =
              targetEl instanceof HTMLInputElement
                ? (window.HTMLInputElement?.prototype || Object.getPrototypeOf(targetEl))
                : (window.HTMLTextAreaElement?.prototype || Object.getPrototypeOf(targetEl));
            const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
            if (nativeSetter) {
              nativeSetter.call(targetEl, val);
            } else {
              targetEl.value = val;
            }
            try {
              targetEl.dispatchEvent(new InputEvent('beforeinput', { data: val, bubbles: true, composed: true }));
            } catch {}
            targetEl.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            targetEl.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
          } else if (targetEl.isContentEditable) {
            targetEl.textContent = val;
            targetEl.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
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
          targetEl.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        } else if (targetEl) {
          dispatchRealisticClick(targetEl);
        } else {
          throw new Error(`Target select element [${action.id}] not found`);
        }
        break;
      }

      case 'press': {
        const key = action.value ?? 'Enter';
        const active =
          targetEl ||
          lastTargetEl ||
          (typeof document !== 'undefined'
            ? (document.activeElement as HTMLElement) || document.body
            : null);
        if (this.actuator) {
          const res = await this.actuator.pressKey(key, active);
          if (!res.success) throw new Error(res.error ?? 'Press failed');
        } else if (active) {
          const keyCode =
            key === 'Enter'
              ? 13
              : key === 'Tab'
              ? 9
              : key === 'Escape'
              ? 27
              : key === 'Backspace'
              ? 8
              : 0;
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
            const form =
              active instanceof HTMLInputElement
                ? active.form
                : active.closest
                ? active.closest('form')
                : null;
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
        if (this.actuator && !targetEl) {
          await this.actuator.scroll(dir);
        }
        smartScroll(dir, targetEl);
        break;
      }

      case 'complete_media': {
        await completePageMedia(targetEl);
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

