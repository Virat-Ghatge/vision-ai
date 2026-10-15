import { MacroAction } from '../llm/types';
import { ElementRegistry, globalElementRegistry } from '../dom/distiller';
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
      }

      // Execute atomic action
      try {
        await this.executeSingleAction(action, targetEl);
        executedTraces.push({
          action,
          timestamp: Date.now(),
          success: true,
        });
      } catch (err) {
        executedTraces.push({
          action,
          timestamp: Date.now(),
          success: false,
          error: err instanceof Error ? err.message : String(err),
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

  private async executeSingleAction(action: MacroAction, targetEl: HTMLElement | null): Promise<void> {
    const coords = action.id !== undefined ? this.registry.getCenterCoordinates(action.id) : null;

    switch (action.type) {
      case 'click': {
        if (this.actuator) {
          const res = await this.actuator.click(coords, targetEl);
          if (!res.success) throw new Error(res.error ?? 'Click failed');
        } else if (targetEl) {
          targetEl.focus();
          targetEl.click();
        } else {
          throw new Error(`Target element for click [${action.id}] not found`);
        }
        break;
      }

      case 'fill': {
        const val = action.value ?? '';
        if (this.actuator) {
          const res = await this.actuator.type(val, coords, targetEl);
          if (!res.success) throw new Error(res.error ?? 'Fill failed');
        } else if (targetEl) {
          targetEl.focus();
          if (targetEl instanceof HTMLInputElement || targetEl instanceof HTMLTextAreaElement) {
            targetEl.value = val;
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
        if (targetEl instanceof HTMLSelectElement) {
          targetEl.value = action.value ?? '';
          targetEl.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (targetEl) {
          targetEl.click();
        } else {
          throw new Error(`Target select element [${action.id}] not found`);
        }
        break;
      }

      case 'press': {
        const key = action.value ?? 'Enter';
        if (this.actuator) {
          const res = await this.actuator.pressKey(key, targetEl);
          if (!res.success) throw new Error(res.error ?? 'Press failed');
        } else if (targetEl || typeof document !== 'undefined') {
          const active = targetEl || document.activeElement || document.body;
          active.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
          active.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
        }
        break;
      }

      case 'scroll': {
        const dir = action.value === 'up' ? 'up' : 'down';
        if (this.actuator) {
          await this.actuator.scroll(dir);
        } else if (typeof window !== 'undefined') {
          window.scrollBy({ top: dir === 'down' ? 400 : -400, behavior: 'smooth' });
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
