export interface CenterCoordinates {
  x: number;
  y: number;
}

export class ElementRegistry {
  private idToElement = new Map<number, WeakRef<HTMLElement>>();
  private elementToId = new WeakMap<HTMLElement, number>();
  private nextId = 1;

  register(element: HTMLElement): number {
    const existingId = this.elementToId.get(element);
    if (existingId !== undefined) {
      this.idToElement.set(existingId, new WeakRef(element));
      return existingId;
    }

    const id = this.nextId++;
    this.idToElement.set(id, new WeakRef(element));
    this.elementToId.set(element, id);
    return id;
  }

  getElement(id: number): HTMLElement | null {
    const ref = this.idToElement.get(id);
    if (!ref) return null;
    const el = ref.deref();
    if (!el || !el.isConnected) {
      this.idToElement.delete(id);
      return null;
    }
    return el;
  }

  getId(element: HTMLElement): number | undefined {
    return this.elementToId.get(element);
  }

  getCenterCoordinates(id: number): CenterCoordinates | null {
    const el = this.getElement(id);
    if (!el) return null;

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      return null;
    }

    return {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
    };
  }

  clear(): void {
    this.idToElement.clear();
    this.nextId = 1;
  }

  size(): number {
    return this.idToElement.size;
  }
}

// Global registry singleton for content script execution
export const globalElementRegistry = new ElementRegistry();

const INTERACTIVE_TAGS = new Set([
  'A',
  'BUTTON',
  'INPUT',
  'SELECT',
  'TEXTAREA',
  'SUMMARY',
  'DETAILS',
  'LABEL',
  'VIDEO',
]);

export const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'checkbox',
  'menuitem',
  'radio',
  'tab',
  'combobox',
  'searchbox',
  'switch',
  'textbox',
  'option',
  'alert',
  'status',
  'dialog',
  'alertdialog',
  'treeitem',
  'listitem',
  'row',
  'gridcell',
  'article',
  'region',
  'menu',
]);

const LANDMARK_TAGS = new Set(['H1', 'H2', 'H3']);

/**
 * Identifies high-priority LMS (Coursera / Cisco NetAcad / Canvas) action controls:
 * "Mark as complete", "Next", "Continue", "Resume", "Start", "Play", etc.
 */
export function isHighPriorityLMSAction(el: HTMLElement): boolean {
  const tagName = el.tagName.toUpperCase();
  if (tagName === 'VIDEO') return true;

  const candidateTag =
    ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(tagName) ||
    el.getAttribute('role') === 'button' ||
    el.getAttribute('role') === 'link' ||
    el.getAttribute('role') === 'checkbox';

  if (!candidateTag) return false;

  const lmsPattern =
    /\b(mark as complete|complete|next|continue|resume|start|launch|submit|play|study material|lecture|video|module|lesson)\b/i;
  const text = el.textContent || '';
  const aria = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || '';
  const title = el.getAttribute('title') || '';
  const value = (el as HTMLInputElement).value || '';

  return lmsPattern.test(text) || lmsPattern.test(aria) || lmsPattern.test(title) || lmsPattern.test(value);
}

/**
 * Checks if an element is visible in the current viewport.
 * Uses native checkVisibility (Chrome 105+) with fallback for fast, low-overhead evaluation.
 * If allowBelowFold is true (for high-priority LMS controls), does not cutoff elements beyond vh + 50.
 */
export function isElementVisible(el: HTMLElement, win: Window = window, allowBelowFold = false): boolean {
  if (!el.isConnected) return false;
  if (el.hasAttribute('hidden') || el.closest?.('[hidden]')) return false;

  // Use fast native browser checkVisibility API when available (Chrome 105+)
  if (typeof (el as any).checkVisibility === 'function') {
    try {
      if (!(el as any).checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
        return false;
      }
    } catch {
      // Fallback if unexpected error
    }
  } else {
    // Fallback for jsdom / older environments (shallow ancestor check to avoid deep reflow)
    let cur: HTMLElement | null = el;
    let depth = 0;
    while (cur && depth < 8) {
      if (cur.style?.display === 'none' || cur.style?.visibility === 'hidden' || cur.style?.opacity === '0') {
        return false;
      }
      const curStyle = win.getComputedStyle ? win.getComputedStyle(cur) : null;
      if (curStyle) {
        if (curStyle.display === 'none' || curStyle.visibility === 'hidden' || curStyle.opacity === '0') {
          return false;
        }
      }
      // Traverse up parent, or if in ShadowRoot, traverse up to the shadow host
      if (!cur.parentElement && (cur.getRootNode?.() as ShadowRoot)?.host) {
        cur = (cur.getRootNode() as ShadowRoot).host as HTMLElement;
      } else {
        cur = cur.parentElement;
      }
      depth++;
    }
  }

  const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
  if (rect) {
    const vw = win.innerWidth || 1920;
    const vh = win.innerHeight || 1080;

    // In environments with non-zero dimensions, verify viewport bounding
    if (rect.width > 0 || rect.height > 0) {
      if (rect.bottom < -50 || (!allowBelowFold && rect.top > vh + 50) || rect.right < -50 || rect.left > vw + 50) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Determines whether a DOM node is interactive or a semantic landmark.
 */
export function isCandidateNode(el: HTMLElement, win: Window = window): boolean {
  const tagName = el.tagName.toUpperCase();

  if (INTERACTIVE_TAGS.has(tagName)) {
    return true;
  }

  const role = el.getAttribute('role');
  if (role && INTERACTIVE_ROLES.has(role.toLowerCase())) {
    return true;
  }

  if (LANDMARK_TAGS.has(tagName)) {
    return true;
  }

  if (el.getAttribute('contenteditable') === 'true') {
    return true;
  }

  const tabIndex = el.getAttribute('tabindex');
  if (tabIndex !== null && parseInt(tabIndex, 10) >= 0) {
    return true;
  }

  // Interactive attributes: onclick, aria-expanded, aria-controls, data-action
  if (
    el.hasAttribute('onclick') ||
    el.hasAttribute('aria-expanded') ||
    el.hasAttribute('aria-controls') ||
    el.hasAttribute('data-action') ||
    el.hasAttribute('data-clickable')
  ) {
    return true;
  }

  // Check cursor: pointer (CSS styled clickable elements)
  if (typeof win !== 'undefined' && win.getComputedStyle) {
    try {
      const curStyle = win.getComputedStyle(el);
      if (curStyle && curStyle.cursor === 'pointer') {
        if (
          el.children.length <= 2 &&
          !el.closest('a, button, [role="button"], [role="link"]') &&
          (!el.parentElement || win.getComputedStyle(el.parentElement).cursor !== 'pointer')
        ) {
          return true;
        }
      }
    } catch {}
  }

  // Common interactive/module class patterns on LMS and course platforms (NetAcad, Canvas, Coursera)
  const className = (el.className || '').toString().toLowerCase();
  if (
    (className.includes('module') ||
      className.includes('lesson') ||
      className.includes('topic') ||
      className.includes('chapter') ||
      className.includes('accordion') ||
      className.includes('clickable') ||
      className.includes('btn')) &&
    (el.textContent || '').trim().length > 0 &&
    (el.textContent || '').trim().length < 120
  ) {
    if (
      !el.querySelector?.('a, button, input, select, textarea, [role="button"], [role="link"], [role="checkbox"]') &&
      !el.closest?.('a, button, [role="button"], [role="link"], [role="menuitem"], [role="tab"]')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Recursively collects all HTML elements in pre-order document order, traversing into
 * open ShadowRoot trees (essential for Web Components on LMS / NetAcad / Adapt Learning player)
 * and accessible same-origin iframe contentDocuments.
 */
export function collectAllElementsDeep(root: Document | HTMLElement | ShadowRoot): HTMLElement[] {
  const result: HTMLElement[] = [];

  function walk(node: Node | ShadowRoot) {
    if (node instanceof HTMLElement) {
      result.push(node);

      if (node.shadowRoot) {
        const shadowChildren = node.shadowRoot.children;
        if (shadowChildren) {
          for (let i = 0; i < shadowChildren.length; i++) {
            const sc = shadowChildren[i];
            if (sc instanceof HTMLElement) {
              walk(sc);
            }
          }
        }
      }

      if (node instanceof HTMLIFrameElement) {
        try {
          const frameDoc = node.contentDocument;
          if (frameDoc && frameDoc.body) {
            walk(frameDoc.body);
          }
        } catch {}
      }
    }

    const children = (node as any).children || node.childNodes;
    if (children) {
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child instanceof HTMLElement) {
          walk(child);
        }
      }
    }
  }

  const startNode = root instanceof Document ? root.body : root;
  if (startNode) {
    const children = (startNode as any).children || startNode.childNodes;
    if (children) {
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child instanceof HTMLElement) {
          walk(child);
        }
      }
    }
  }

  return result;
}

function truncateText(str: string, maxLen = 40): string {
  const cleaned = str.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.substring(0, maxLen - 3) + '...';
}

/**
 * Formats an element into a compact ultra-low-token descriptor:
 * e.g. [12] <button disabled>Submit</button>
 */
export function formatElementDescriptor(el: HTMLElement, id: number): string {
  const tag = el.tagName.toLowerCase();
  const attrs: string[] = [];

  const type = el.getAttribute('type');
  if (type) attrs.push(`type="${type}"`);

  const placeholder = el.getAttribute('placeholder');
  if (placeholder) attrs.push(`placeholder="${truncateText(placeholder, 35)}"`);

  const ariaLabel = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
  if (ariaLabel) attrs.push(`label="${truncateText(ariaLabel, 25)}"`);

  const title = el.getAttribute('title');
  if (title) attrs.push(`title="${truncateText(title, 25)}"`);

  const ariaExpanded = el.getAttribute('aria-expanded');
  if (ariaExpanded !== null) attrs.push(`aria-expanded="${ariaExpanded}"`);

  const ariaChecked = el.getAttribute('aria-checked');
  if (ariaChecked !== null) attrs.push(`aria-checked="${ariaChecked}"`);

  const role = el.getAttribute('role');
  if (role && role !== tag) attrs.push(`role="${role}"`);

  const name = el.getAttribute('name');
  if (name) attrs.push(`name="${name}"`);

  if (el.hasAttribute('disabled')) {
    attrs.push('disabled');
  }

  // Value formatting for inputs/selects
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    if (el.value) {
      attrs.push(`value="${truncateText(el.value, 25)}"`);
    }
    if (el instanceof HTMLInputElement && el.checked) {
      attrs.push('checked');
    }
  }

  if (tag === 'video') {
    const video = el as HTMLVideoElement;
    if (video.paused !== undefined) {
      attrs.push(video.paused ? 'paused' : 'playing');
    }
    if (video.duration && isFinite(video.duration)) {
      attrs.push(`duration="${Math.round(video.duration)}s"`);
    }
  }

  const attrStr = attrs.length > 0 ? ` ${attrs.join(' ')}` : '';

  // Get direct text content
  let text = '';
  if (tag === 'select') {
    const sel = el as HTMLSelectElement;
    text = sel.selectedIndex >= 0 && sel.options?.[sel.selectedIndex]
      ? truncateText(sel.options[sel.selectedIndex].text || '', 20)
      : '';
  } else if (tag !== 'input' && tag !== 'video') {
    text = truncateText(el.textContent || '', 30);
  }

  if (text) {
    return `[${id}] <${tag}${attrStr}>${text}</${tag}>`;
  }
  return `[${id}] <${tag}${attrStr} />`;
}

export interface DistillOptions {
  maxItems?: number;
  includeHeader?: boolean;
}

export interface DistillResult {
  text: string;
  totalElements: number;
  interactiveCount: number;
}

/**
 * Walks the DOM, filters non-visible nodes, assigns integer IDs, and formats
 * compact text output guaranteed to be under 800 tokens for standard viewports.
 */
export function distillViewport(
  root: Document | HTMLElement = document,
  registry: ElementRegistry = globalElementRegistry,
  win: Window = window,
  options?: DistillOptions
): DistillResult {
  const maxItems = options?.maxItems ?? 60;
  const lines: string[] = [];
  let totalWalked = 0;
  let interactiveCount = 0;

  const walker = root instanceof Document ? root.body : root;
  if (!walker) {
    return { text: '(Empty document)', totalElements: 0, interactiveCount: 0 };
  }

  const doc = root instanceof Document ? root : root.ownerDocument;
  const pageTitle = doc?.title?.trim() || '';
  const pageUrl = win.location?.href && !win.location.href.startsWith('about:') ? win.location.href : '';

  if (options?.includeHeader ?? true) {
    if (pageTitle || pageUrl) {
      lines.push(`PAGE: ${pageTitle || '(Untitled)'} [${pageUrl || 'current-tab'}]`);
    }
  }

  const elements = collectAllElementsDeep(walker);
  totalWalked = elements.length;

  const priorityCandidates: HTMLElement[] = [];
  const standardCandidates: HTMLElement[] = [];

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];

    if (!isCandidateNode(el, win)) continue;

    const isPriority = isHighPriorityLMSAction(el);
    if (!isElementVisible(el, win, isPriority)) continue;

    // Check if element has an interactive ancestor already capturing it
    const parentInteractive = el.closest?.('a, button, [role="button"], [role="link"], [role="tab"], [role="menuitem"]');
    if (parentInteractive && parentInteractive !== el && !['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) {
      continue;
    }

    if (isPriority) {
      priorityCandidates.push(el);
    } else {
      standardCandidates.push(el);
    }
  }

  // Reserve up to 20 slots for high-priority LMS controls so they are NEVER cut off by maxItems
  const reservedPriority = priorityCandidates.slice(0, 20);
  const remainingSlots = Math.max(0, maxItems - reservedPriority.length);
  const reservedStandard = standardCandidates.slice(0, remainingSlots);

  const finalCandidates = [...reservedPriority, ...reservedStandard];
  let currentChars = lines.reduce((acc, l) => acc + l.length + 1, 0);

  for (let i = 0; i < finalCandidates.length; i++) {
    const el = finalCandidates[i];

    if (interactiveCount >= maxItems || Math.ceil(currentChars / 3.8) >= 680) {
      lines.push(`... [${totalWalked - interactiveCount} additional items outside viewport budget]`);
      break;
    }

    const id = registry.register(el);
    const desc = formatElementDescriptor(el, id);
    lines.push(desc);
    currentChars += desc.length + 1;
    interactiveCount++;
  }

  // Collect visible text snippets from h1, h2, h3, p, article, [class*="price"]
  try {
    const textEls = walker.querySelectorAll<HTMLElement>('h1, h2, h3, p, article, [class*="price"]');
    const snippets: string[] = [];
    let totalChars = 0;
    for (let i = 0; i < textEls.length && totalChars < 350; i++) {
      const tEl = textEls[i];
      if (!isElementVisible(tEl, win)) continue;
      const txt = (tEl.textContent || '').replace(/\s+/g, ' ').trim();
      if (txt.length > 5 && !snippets.some((s) => s.includes(txt) || txt.includes(s))) {
        const piece = txt.slice(0, 100);
        snippets.push(piece);
        totalChars += piece.length;
      }
    }
    if (snippets.length > 0) {
      const estimatedTokens = Math.ceil(currentChars / 3.8);
      if (estimatedTokens < 720) {
        const allowedChars = Math.min(350, Math.floor((770 - estimatedTokens) * 3.8));
        if (allowedChars > 20) {
          lines.push(`PAGE SUMMARY: ${snippets.join(' | ')}`.slice(0, allowedChars));
        }
      }
    }
  } catch {}

  // If no interactive elements found and no summary, provide a text snippet so Vision AI is never blind
  if (interactiveCount === 0 && !lines.some((l) => l.startsWith('PAGE SUMMARY:'))) {
    const textSnippet = (walker.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (textSnippet) {
      lines.push(`(No interactive elements in viewport. Page text summary: "${textSnippet}")`);
    }
  }

  return {
    text: lines.join('\n'),
    totalElements: totalWalked,
    interactiveCount,
  };
}
