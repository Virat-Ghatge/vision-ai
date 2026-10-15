import {
  ElementRegistry,
  globalElementRegistry,
  isCandidateNode,
  isElementVisible,
  formatElementDescriptor,
} from './distiller';

export interface DeltaResult {
  text: string;
  addedCount: number;
  modifiedCount: number;
  removedCount: number;
  hasAlertOrError: boolean;
}

export class DOMDeltaTracker {
  private registry: ElementRegistry;
  private observer: MutationObserver | null = null;
  private addedElements = new Set<HTMLElement>();
  private modifiedElements = new Set<HTMLElement>();
  private removedIds = new Set<number>();
  private observedRoot: Node | null = null;

  constructor(registry: ElementRegistry = globalElementRegistry) {
    this.registry = registry;
  }

  start(root: Node = document): void {
    this.stop();
    this.observedRoot = root;
    this.addedElements.clear();
    this.modifiedElements.clear();
    this.removedIds.clear();

    if (typeof MutationObserver === 'undefined') {
      return;
    }

    this.observer = new MutationObserver((mutations) => {
      this.handleMutations(mutations);
    });

    this.observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
      attributeFilter: ['value', 'checked', 'disabled', 'class', 'role', 'aria-invalid', 'style', 'hidden'],
    });
  }

  stop(): void {
    if (this.observer) {
      const pending = this.observer.takeRecords();
      if (pending.length > 0) {
        this.handleMutations(pending);
      }
      this.observer.disconnect();
      this.observer = null;
    }
  }

  recordAdded(el: HTMLElement): void {
    this.addedElements.add(el);
  }

  recordModified(el: HTMLElement): void {
    this.modifiedElements.add(el);
  }

  recordRemoved(id: number): void {
    this.removedIds.add(id);
  }

  private handleMutations(mutations: MutationRecord[]): void {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        // Removed nodes
        mutation.removedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            const id = this.registry.getId(node);
            if (id !== undefined) {
              this.removedIds.add(id);
              this.addedElements.delete(node);
              this.modifiedElements.delete(node);
            }
            // Check descendants
            const descendants = node.querySelectorAll<HTMLElement>('*');
            descendants.forEach((child) => {
              const childId = this.registry.getId(child);
              if (childId !== undefined) {
                this.removedIds.add(childId);
                this.addedElements.delete(child);
                this.modifiedElements.delete(child);
              }
            });
          }
        });

        // Added nodes
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            if (isCandidateNode(node) || this.isAlertOrError(node)) {
              this.addedElements.add(node);
            }
            const candidates = node.querySelectorAll<HTMLElement>('*');
            candidates.forEach((child) => {
              if (isCandidateNode(child) || this.isAlertOrError(child)) {
                this.addedElements.add(child);
              }
            });
          }
        });
      } else if (mutation.type === 'attributes') {
        const target = mutation.target;
        if (target instanceof HTMLElement && (isCandidateNode(target) || this.isAlertOrError(target))) {
          if (!this.addedElements.has(target)) {
            this.modifiedElements.add(target);
          }
        }
      } else if (mutation.type === 'characterData') {
        const parent = mutation.target.parentElement;
        if (parent && (isCandidateNode(parent) || this.isAlertOrError(parent)) && !this.addedElements.has(parent)) {
          this.modifiedElements.add(parent);
        }
      }
    }
  }

  /**
   * Flushes and computes the compact ADDED / MODIFIED / REMOVED delta text.
   */
  flushDelta(win: Window = window): DeltaResult {
    // If active, drain pending
    if (this.observer) {
      const pending = this.observer.takeRecords();
      if (pending.length > 0) {
        this.handleMutations(pending);
      }
    }

    const addedLines: string[] = [];
    const modifiedLines: string[] = [];
    const removedLines: string[] = [];
    let hasAlertOrError = false;

    // Process Added
    this.addedElements.forEach((el) => {
      if (!isElementVisible(el, win)) return;
      const id = this.registry.register(el);
      addedLines.push(formatElementDescriptor(el, id));

      if (this.isAlertOrError(el)) {
        hasAlertOrError = true;
      }
    });

    // Process Modified
    this.modifiedElements.forEach((el) => {
      if (!isElementVisible(el, win)) return;
      const id = this.registry.register(el);
      modifiedLines.push(formatElementDescriptor(el, id));

      if (this.isAlertOrError(el)) {
        hasAlertOrError = true;
      }
    });

    // Process Removed
    this.removedIds.forEach((id) => {
      removedLines.push(`[${id}]`);
    });

    // Reset buckets for next step
    this.addedElements.clear();
    this.modifiedElements.clear();
    this.removedIds.clear();

    const sections: string[] = ['[DELTA]'];
    if (addedLines.length > 0) {
      sections.push('ADDED:\n' + addedLines.join('\n'));
    }
    if (modifiedLines.length > 0) {
      sections.push('MODIFIED:\n' + modifiedLines.join('\n'));
    }
    if (removedLines.length > 0) {
      sections.push('REMOVED:\n' + removedLines.join('\n'));
    }

    if (addedLines.length === 0 && modifiedLines.length === 0 && removedLines.length === 0) {
      sections.push('NO CHANGES');
    }

    return {
      text: sections.join('\n'),
      addedCount: addedLines.length,
      modifiedCount: modifiedLines.length,
      removedCount: removedLines.length,
      hasAlertOrError,
    };
  }

  isAlertOrError(el: HTMLElement): boolean {
    const role = el.getAttribute('role');
    if (role === 'alert' || role === 'status' || role === 'alertdialog') return true;
    if (el.getAttribute('aria-invalid') === 'true') return true;

    const classOrId = `${el.className} ${el.id}`.toLowerCase();
    if (classOrId.includes('error') || classOrId.includes('alert') || classOrId.includes('invalid')) {
      return true;
    }

    const text = (el.textContent || '').toLowerCase();
    if (
      text.includes('error:') ||
      text.includes('invalid credentials') ||
      text.includes('required field')
    ) {
      return true;
    }

    return false;
  }
}
