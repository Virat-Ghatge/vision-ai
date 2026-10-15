export interface Coordinates {
  x: number;
  y: number;
}

export interface ActuatorOptions {
  tabId: number;
  preferCDP?: boolean;
}

export interface ActionResult {
  success: boolean;
  method: 'cdp' | 'synthetic';
  error?: string;
}

const KEY_CODE_MAP: Record<string, { code: string; keyCode: number }> = {
  Enter: { code: 'Enter', keyCode: 13 },
  Tab: { code: 'Tab', keyCode: 9 },
  Escape: { code: 'Escape', keyCode: 27 },
  Backspace: { code: 'Backspace', keyCode: 8 },
  ArrowDown: { code: 'ArrowDown', keyCode: 40 },
  ArrowUp: { code: 'ArrowUp', keyCode: 38 },
};

export class CDPActuator {
  readonly tabId: number;
  private isAttached = false;
  private preferCDP: boolean;

  constructor(options: ActuatorOptions) {
    this.tabId = options.tabId;
    this.preferCDP = options.preferCDP ?? true;

    if (typeof chrome !== 'undefined' && chrome.debugger?.onDetach) {
      chrome.debugger.onDetach.addListener((source, reason) => {
        if (source.tabId === this.tabId) {
          console.warn(`[CDPActuator] Debugger detached from tab ${this.tabId}: ${reason}`);
          this.isAttached = false;
        }
      });
    }
  }

  async attach(): Promise<boolean> {
    if (!this.preferCDP) return false;
    if (this.isAttached) return true;

    if (typeof chrome === 'undefined' || !chrome.debugger) {
      return false;
    }

    try {
      await chrome.debugger.attach({ tabId: this.tabId }, '1.3');
      this.isAttached = true;
      return true;
    } catch (err) {
      console.warn('[CDPActuator] Failed to attach chrome.debugger, falling back to synthetic:', err);
      this.isAttached = false;
      return false;
    }
  }

  async detach(): Promise<void> {
    if (!this.isAttached) return;
    if (typeof chrome === 'undefined' || !chrome.debugger) return;

    try {
      await chrome.debugger.detach({ tabId: this.tabId });
    } catch (err) {
      console.warn('[CDPActuator] Error during detach:', err);
    } finally {
      this.isAttached = false;
    }
  }

  get attached(): boolean {
    return this.isAttached;
  }

  /**
   * Clicks target coordinates via CDP Input.dispatchMouseEvent (event.isTrusted === true),
   * with seamless fallback to synthetic DOM click if debugger is unattached or fails.
   */
  async click(coords?: Coordinates | null, fallbackElement?: HTMLElement | null): Promise<ActionResult> {
    if (coords && this.preferCDP) {
      const attached = await this.attach();
      if (attached) {
        try {
          await this.sendCDPCommand('Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x: coords.x,
            y: coords.y,
            button: 'left',
            clickCount: 1,
          });

          await new Promise((r) => setTimeout(r, 40));

          await this.sendCDPCommand('Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x: coords.x,
            y: coords.y,
            button: 'left',
            clickCount: 1,
          });

          return { success: true, method: 'cdp' };
        } catch (err) {
          console.warn('[CDPActuator] CDP click failed, falling back to synthetic:', err);
        }
      }
    }

    // Fallback to synthetic DOM events
    if (fallbackElement) {
      try {
        fallbackElement.focus();
        fallbackElement.dispatchEvent(
          new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window })
        );
        fallbackElement.dispatchEvent(
          new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window })
        );
        fallbackElement.dispatchEvent(
          new MouseEvent('click', { bubbles: true, cancelable: true, view: window })
        );
        return { success: true, method: 'synthetic' };
      } catch (err) {
        return {
          success: false,
          method: 'synthetic',
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    return { success: false, method: 'synthetic', error: 'Neither coords nor fallbackElement provided' };
  }

  /**
   * Types text into target element via CDP key events, or synthetic fallback.
   */
  async type(
    text: string,
    coords?: Coordinates | null,
    fallbackElement?: HTMLElement | null
  ): Promise<ActionResult> {
    if (coords && this.preferCDP) {
      const attached = await this.attach();
      if (attached) {
        try {
          // Focus element with click first
          await this.click(coords);

          for (const char of text) {
            await this.sendCDPCommand('Input.dispatchKeyEvent', {
              type: 'keyDown',
              text: char,
              unmodifiedText: char,
            });
            await this.sendCDPCommand('Input.dispatchKeyEvent', {
              type: 'keyUp',
            });
          }
          return { success: true, method: 'cdp' };
        } catch (err) {
          console.warn('[CDPActuator] CDP typing failed, falling back to synthetic:', err);
        }
      }
    }

    // Fallback to synthetic DOM input
    if (fallbackElement) {
      try {
        fallbackElement.focus();
        if (
          fallbackElement instanceof HTMLInputElement ||
          fallbackElement instanceof HTMLTextAreaElement
        ) {
          fallbackElement.value = text;
          fallbackElement.dispatchEvent(new Event('input', { bubbles: true }));
          fallbackElement.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (fallbackElement.isContentEditable) {
          fallbackElement.textContent = text;
          fallbackElement.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return { success: true, method: 'synthetic' };
      } catch (err) {
        return {
          success: false,
          method: 'synthetic',
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    return { success: false, method: 'synthetic', error: 'No target for typing' };
  }

  /**
   * Dispatches special key (Enter, Tab, Escape, Backspace).
   */
  async pressKey(key: string, fallbackElement?: HTMLElement | null): Promise<ActionResult> {
    const keyInfo = KEY_CODE_MAP[key];

    if (this.preferCDP && (await this.attach())) {
      try {
        await this.sendCDPCommand('Input.dispatchKeyEvent', {
          type: 'rawKeyDown',
          key: keyInfo ? key : key,
          code: keyInfo?.code ?? key,
          windowsVirtualKeyCode: keyInfo?.keyCode ?? 0,
          nativeVirtualKeyCode: keyInfo?.keyCode ?? 0,
        });

        await this.sendCDPCommand('Input.dispatchKeyEvent', {
          type: 'keyUp',
          key: keyInfo ? key : key,
          code: keyInfo?.code ?? key,
          windowsVirtualKeyCode: keyInfo?.keyCode ?? 0,
          nativeVirtualKeyCode: keyInfo?.keyCode ?? 0,
        });

        return { success: true, method: 'cdp' };
      } catch (err) {
        console.warn('[CDPActuator] CDP pressKey failed, falling back to synthetic:', err);
      }
    }

    // Fallback
    const target = fallbackElement || (typeof document !== 'undefined' ? document.activeElement : null);
    if (target) {
      target.dispatchEvent(
        new KeyboardEvent('keydown', {
          key,
          code: keyInfo?.code ?? key,
          bubbles: true,
          cancelable: true,
        })
      );
      target.dispatchEvent(
        new KeyboardEvent('keyup', {
          key,
          code: keyInfo?.code ?? key,
          bubbles: true,
          cancelable: true,
        })
      );
      return { success: true, method: 'synthetic' };
    }

    return { success: false, method: 'synthetic', error: 'No active element for key press' };
  }

  /**
   * Scrolls viewport up or down.
   */
  async scroll(direction: 'up' | 'down', amount = 400): Promise<ActionResult> {
    const deltaY = direction === 'down' ? amount : -amount;

    if (this.preferCDP && (await this.attach())) {
      try {
        await this.sendCDPCommand('Input.dispatchMouseEvent', {
          type: 'mouseWheel',
          x: 400,
          y: 400,
          deltaX: 0,
          deltaY,
        });
        return { success: true, method: 'cdp' };
      } catch (err) {
        console.warn('[CDPActuator] CDP scroll failed, falling back to synthetic:', err);
      }
    }

    if (typeof window !== 'undefined') {
      window.scrollBy({ top: deltaY, behavior: 'smooth' });
      return { success: true, method: 'synthetic' };
    }

    return { success: false, method: 'synthetic', error: 'Window not available for scroll' };
  }

  private async sendCDPCommand(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (typeof chrome === 'undefined' || !chrome.debugger) {
      throw new Error('chrome.debugger API is not available');
    }

    return new Promise((resolve, reject) => {
      chrome.debugger.sendCommand({ tabId: this.tabId }, method, params, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });
  }
}
