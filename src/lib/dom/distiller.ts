export interface CenterCoordinates {
  x: number;
  y: number;
}

export interface ElementMeta {
  tagName: string;
  text: string;
  ariaLabel: string;
  nameAttr: string;
  role: string;
  idAttr: string;
  dataTestId: string;
  href: string;
  nthIndex?: number;
  placeholder?: string;
  value?: string;
}

export class ElementRegistry {
  private idToElement = new Map<number, WeakRef<HTMLElement>>();
  private idToMeta = new Map<number, ElementMeta>();
  private elementToId = new WeakMap<HTMLElement, number>();
  private roleNameCounts = new Map<string, number>();
  private nextId = 1;

  register(element: HTMLElement): number {
    const existingId = this.elementToId.get(element);
    if (existingId !== undefined) {
      const existingMeta = this.idToMeta.get(existingId);
      this.idToElement.set(existingId, new WeakRef(element));
      this.idToMeta.set(existingId, this.extractMeta(element, existingMeta?.nthIndex ?? 0));
      return existingId;
    }

    const role = (element.getAttribute('role') || element.tagName).trim().toLowerCase();
    const name = (element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const key = `${role}::${name}`;
    const nthIndex = this.roleNameCounts.get(key) ?? 0;
    this.roleNameCounts.set(key, nthIndex + 1);

    const id = this.nextId++;
    this.idToElement.set(id, new WeakRef(element));
    this.idToMeta.set(id, this.extractMeta(element, nthIndex));
    this.elementToId.set(element, id);
    return id;
  }

  private extractMeta(el: HTMLElement, nthIndex = 0): ElementMeta {
    const inputVal =
      el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
        ? el.value
        : undefined;
    const placeholder = el.getAttribute('placeholder') || undefined;

    return {
      tagName: el.tagName.toUpperCase(),
      text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
      ariaLabel: (el.getAttribute('aria-label') || el.getAttribute('title') || '').trim(),
      nameAttr: (el.getAttribute('name') || '').trim(),
      role: (el.getAttribute('role') || el.tagName).trim().toLowerCase(),
      idAttr: el.id || '',
      dataTestId: (el.getAttribute('data-testid') || el.getAttribute('data-test') || '').trim(),
      href: (el.getAttribute('href') || '').trim(),
      nthIndex,
      placeholder,
      value: inputVal ? inputVal.slice(0, 40) : undefined,
    };
  }

  /**
   * Retrieves an element by ID. If the element was disconnected due to a React/Coursera
   * SPA re-render, automatically self-heals by locating the replacement element in the live DOM.
   */
  getElement(id: number): HTMLElement | null {
    const ref = this.idToElement.get(id);
    if (ref) {
      const el = ref.deref();
      if (el && el.isConnected) {
        return el;
      }
      this.idToElement.delete(id);
    }

    // Self-heal lookup ONLY if the element was NOT explicitly removed cleanly in a unit test
    // Check if we can relocate an exact match by stable attributes on complex SPAs
    const meta = this.idToMeta.get(id);
    if (meta && typeof document !== 'undefined' && document.body) {
      if (meta.idAttr) {
        const byId = document.getElementById(meta.idAttr);
        if (byId) {
          this.idToElement.set(id, new WeakRef(byId));
          this.elementToId.set(byId, id);
          return byId;
        }
      }
      if (meta.dataTestId) {
        const byTestId = document.querySelector<HTMLElement>(
          `[data-testid="${meta.dataTestId}"], [data-test="${meta.dataTestId}"]`
        );
        if (byTestId) {
          this.idToElement.set(id, new WeakRef(byTestId));
          this.elementToId.set(byTestId, id);
          return byTestId;
        }
      }
    }

    return null;
  }

  /**
   * Deep self-healing fallback used by MacroBatchExecutor when a React SPA re-mounts a button/link.
   * Utilizes Dassi Dsn algorithm (role + accessible name + nthIndex position matching).
   */
  findReplacementElement(id: number): HTMLElement | null {
    const direct = this.getElement(id);
    if (direct) return direct;

    const meta = this.idToMeta.get(id);
    if (!meta || typeof document === 'undefined' || !document.body) return null;

    if (meta.idAttr) {
      const byId = document.getElementById(meta.idAttr);
      if (byId && byId.isConnected) {
        this.idToElement.set(id, new WeakRef(byId));
        this.elementToId.set(byId, id);
        return byId;
      }
    }
    if (meta.dataTestId) {
      const byTestId = document.querySelector<HTMLElement>(
        `[data-testid="${meta.dataTestId}"], [data-test="${meta.dataTestId}"]`
      );
      if (byTestId && byTestId.isConnected) {
        this.idToElement.set(id, new WeakRef(byTestId));
        this.elementToId.set(byTestId, id);
        return byTestId;
      }
    }

    const all = collectAllElementsDeep(document.body, 2500);
    const roleMatches: HTMLElement[] = [];
    const textMatches: HTMLElement[] = [];

    for (const candidate of all) {
      if (!candidate.isConnected) continue;
      const candRole = (candidate.getAttribute('role') || candidate.tagName).trim().toLowerCase();
      const candAria = (candidate.getAttribute('aria-label') || candidate.getAttribute('title') || '').trim();
      const candText = (candidate.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);

      const roleMatchesTarget = candRole === meta.role || candidate.tagName.toUpperCase() === meta.tagName;
      const ariaMatches = Boolean(meta.ariaLabel && candAria === meta.ariaLabel);
      const textMatchesTarget = Boolean(meta.text && meta.text.length >= 3 && candText === meta.text);

      if (roleMatchesTarget && (ariaMatches || textMatchesTarget)) {
        roleMatches.push(candidate);
      } else if (ariaMatches || textMatchesTarget) {
        textMatches.push(candidate);
      }
    }

    const targetPool = roleMatches.length > 0 ? roleMatches : textMatches;
    if (targetPool.length > 0) {
      const targetNth = meta.nthIndex ?? 0;
      const candidate = targetPool[targetNth] || targetPool[0];
      if (candidate) {
        this.idToElement.set(id, new WeakRef(candidate));
        this.elementToId.set(candidate, id);
        return candidate;
      }
    }

    return null;
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

    let offsetX = 0;
    let offsetY = 0;
    try {
      const ownerWin = el.ownerDocument?.defaultView;
      if (ownerWin && ownerWin !== window && ownerWin.frameElement) {
        const frameRect = ownerWin.frameElement.getBoundingClientRect();
        offsetX = frameRect.left;
        offsetY = frameRect.top;
      }
    } catch {}

    return {
      x: Math.round(offsetX + rect.left + rect.width / 2),
      y: Math.round(offsetY + rect.top + rect.height / 2),
    };
  }

  clear(): void {
    this.idToElement.clear();
    this.idToMeta.clear();
    this.roleNameCounts.clear();
    this.nextId = 1;
  }

  size(): number {
    return this.idToElement.size;
  }
}

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
  'AUDIO',
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

const LMS_PRIORITY_REGEX =
  /\b(mark as complete|mark complete|completed|complete|next item|go to next|next|continue|resume|start|launch|submit|play|study material|lecture|reading|video|module|week|lesson|quiz|grade|transcript|syllabus)\b/i;

export function collectAllElementsDeep(
  root: Document | HTMLElement | ShadowRoot,
  maxNodes = 4000
): HTMLElement[] {
  const result: HTMLElement[] = [];
  const startNode = root instanceof Document ? root.body : root;
  if (!startNode) return result;

  const visit = (container: HTMLElement | ShadowRoot) => {
    if (result.length >= maxNodes) return;
    const children = container.children;
    for (let i = 0; i < children.length && result.length < maxNodes; i++) {
      const el = children[i] as HTMLElement;
      if (!el || !el.tagName) continue;
      const tag = el.tagName.toUpperCase();
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'SVG' || tag === 'PATH') {
        continue;
      }

      result.push(el);

      if (el.shadowRoot) {
        visit(el.shadowRoot);
      }

      if (tag === 'IFRAME') {
        try {
          const frameDoc = (el as HTMLIFrameElement).contentDocument;
          if (frameDoc?.body) {
            visit(frameDoc.body);
          }
        } catch {}
      }

      if (el.children && el.children.length > 0) {
        visit(el);
      }
    }
  };

  visit(startNode);
  return result;
}

export function isHighPriorityLMSAction(el: HTMLElement): boolean {
  const tag = el.tagName.toUpperCase();
  if (tag === 'VIDEO' || tag === 'AUDIO') return true;

  const role = (el.getAttribute('role') || '').toLowerCase();
  const isActionable =
    tag === 'BUTTON' ||
    tag === 'A' ||
    tag === 'INPUT' ||
    tag === 'SUMMARY' ||
    INTERACTIVE_ROLES.has(role) ||
    el.hasAttribute('data-testid') ||
    el.hasAttribute('aria-expanded') ||
    el.hasAttribute('aria-checked');

  if (!isActionable) return false;

  const sig = `${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''} ${
    el.getAttribute('data-testid') || ''
  } ${(el.textContent || '').slice(0, 90)}`;

  return LMS_PRIORITY_REGEX.test(sig);
}

export function isElementVisible(
  el: HTMLElement,
  win: Window = window,
  allowBelowFold = false
): boolean {
  if (!el.isConnected) return false;
  if (el.hasAttribute('hidden') || el.closest?.('[hidden]')) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;

  if (typeof (el as any).checkVisibility === 'function') {
    try {
      if (!(el as any).checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
        return false;
      }
    } catch {}
  } else {
    let cur: HTMLElement | null = el;
    let depth = 0;
    while (cur && depth < 8) {
      if (
        cur.style?.display === 'none' ||
        cur.style?.visibility === 'hidden' ||
        cur.style?.opacity === '0'
      ) {
        return false;
      }
      const curStyle = win.getComputedStyle ? win.getComputedStyle(cur) : null;
      if (curStyle) {
        if (
          curStyle.display === 'none' ||
          curStyle.visibility === 'hidden' ||
          curStyle.opacity === '0'
        ) {
          return false;
        }
      }
      cur = cur.parentElement;
      depth++;
    }
  }

  const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
  if (rect) {
    const vw = win.innerWidth || 1920;
    const vh = win.innerHeight || 1080;

    if (rect.width > 0 || rect.height > 0) {
      const verticalBuffer = allowBelowFold ? vh * 3 : 120;
      if (
        rect.bottom < -80 ||
        rect.top > vh + verticalBuffer ||
        rect.right < -50 ||
        rect.left > vw + 50
      ) {
        return false;
      }
    }
  }

  return true;
}

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

  if (
    el.hasAttribute('onclick') ||
    el.hasAttribute('aria-expanded') ||
    el.hasAttribute('aria-checked') ||
    el.hasAttribute('data-action') ||
    el.hasAttribute('data-clickable')
  ) {
    return true;
  }

  if (typeof win !== 'undefined' && win.getComputedStyle) {
    try {
      const curStyle = win.getComputedStyle(el);
      if (curStyle && curStyle.cursor === 'pointer') {
        if (
          el.children.length <= 2 &&
          !el.closest('a, button, [role="button"], [role="link"], [role="menuitem"], [role="tab"]') &&
          (!el.parentElement || win.getComputedStyle(el.parentElement).cursor !== 'pointer')
        ) {
          return true;
        }
      }
    } catch {}
  }

  const className = (el.className || '').toString().toLowerCase();
  if (
    (className.includes('accordion') ||
      className.includes('clickable') ||
      className.includes('btn') ||
      className.includes('weekitem') ||
      className.includes('nav-item')) &&
    el.children.length <= 2 &&
    !el.querySelector('a, button, input, [role="button"], [role="link"]') &&
    !el.closest('a, button, [role="button"], [role="link"]') &&
    (el.textContent || '').trim().length > 0 &&
    (el.textContent || '').trim().length < 90
  ) {
    return true;
  }

  return false;
}

function truncateText(str: string, maxLen = 40): string {
  const cleaned = str.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.substring(0, maxLen - 3) + '...';
}

export function formatElementDescriptor(el: HTMLElement, id: number): string {
  const tag = el.tagName.toLowerCase();
  const attrs: string[] = [];

  const type = el.getAttribute('type');
  if (type) attrs.push(`type="${type}"`);

  const placeholder = el.getAttribute('placeholder');
  if (placeholder) attrs.push(`placeholder="${truncateText(placeholder, 35)}"`);

  const ariaLabel = el.getAttribute('aria-label') || el.getAttribute('title');
  if (ariaLabel) attrs.push(`label="${truncateText(ariaLabel, 30)}"`);

  const role = el.getAttribute('role');
  if (role && role !== tag) attrs.push(`role="${role}"`);

  const name = el.getAttribute('name');
  if (name) attrs.push(`name="${name}"`);

  const expanded = el.getAttribute('aria-expanded');
  if (expanded === 'true' || expanded === 'false') {
    attrs.push(`expanded=${expanded}`);
  }

  const ariaChecked = el.getAttribute('aria-checked');
  if (ariaChecked === 'true' || ariaChecked === 'false') {
    attrs.push(`checked=${ariaChecked}`);
  }

  if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') {
    attrs.push('disabled');
  }

  if (tag === 'video' || tag === 'audio') {
    const media = el as HTMLMediaElement;
    const ended = media.ended ? 'ended' : media.paused ? 'paused' : 'playing';
    attrs.push(`state="${ended}"`);
  }

  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  ) {
    if (el.value) {
      attrs.push(`value="${truncateText(el.value, 25)}"`);
    }
    if (el instanceof HTMLInputElement && el.checked) {
      attrs.push('checked');
    }
  }

  const attrStr = attrs.length > 0 ? ` ${attrs.join(' ')}` : '';

  let text = '';
  if (tag === 'select') {
    const sel = el as HTMLSelectElement;
    text =
      sel.selectedIndex >= 0 && sel.options?.[sel.selectedIndex]
        ? truncateText(sel.options[sel.selectedIndex].text || '', 20)
        : '';
  } else if (tag !== 'input') {
    text = truncateText(el.textContent || '', 36);
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

export function distillViewport(
  root: Document | HTMLElement = document,
  registry: ElementRegistry = globalElementRegistry,
  win: Window = window,
  options?: DistillOptions
): DistillResult {
  const maxItems = options?.maxItems ?? 62;
  const lines: string[] = [];
  let interactiveCount = 0;

  const walker = root instanceof Document ? root.body : root;
  if (!walker) {
    return { text: '(Empty document)', totalElements: 0, interactiveCount: 0 };
  }

  const doc = root instanceof Document ? root : root.ownerDocument;
  const pageTitle = doc?.title?.trim() || '';
  const pageUrl =
    win.location?.href && !win.location.href.startsWith('about:') ? win.location.href : '';

  if (options?.includeHeader ?? true) {
    if (pageTitle || pageUrl) {
      lines.push(`PAGE: ${pageTitle || '(Untitled)'} [${pageUrl || 'current-tab'}]`);
    }
  }

  const elements = collectAllElementsDeep(walker);
  const totalWalked = elements.length;

  const priorityCandidates: HTMLElement[] = [];
  const standardCandidates: HTMLElement[] = [];
  const seenSet = new Set<HTMLElement>();

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (seenSet.has(el)) continue;

    if (!isCandidateNode(el, win)) continue;

    const interactiveAncestor = el.parentElement?.closest(
      'button, a, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="checkbox"], [role="radio"]'
    );
    if (
      interactiveAncestor &&
      !['INPUT', 'SELECT', 'TEXTAREA', 'VIDEO'].includes(el.tagName.toUpperCase())
    ) {
      continue;
    }

    const isPriority = isHighPriorityLMSAction(el);
    if (!isElementVisible(el, win, isPriority)) continue;

    seenSet.add(el);
    if (isPriority) {
      priorityCandidates.push(el);
    } else {
      standardCandidates.push(el);
    }
  }

  const reservedPriority = new Set(priorityCandidates.slice(0, 25));
  const orderedFinal: HTMLElement[] = [];

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (!seenSet.has(el)) continue;
    if (reservedPriority.has(el) || standardCandidates.includes(el)) {
      orderedFinal.push(el);
    }
  }

  for (const pEl of reservedPriority) {
    if (!orderedFinal.includes(pEl)) {
      orderedFinal.push(pEl);
    }
  }

  let currentChars = lines.reduce((acc, l) => acc + l.length + 1, 0);

  for (let i = 0; i < orderedFinal.length; i++) {
    const el = orderedFinal[i];
    const isPriority = reservedPriority.has(el);

    if (
      !isPriority &&
      interactiveCount >= maxItems - reservedPriority.size &&
      interactiveCount >= maxItems
    ) {
      continue;
    }

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

  try {
    const textEls = walker.querySelectorAll<HTMLElement>(
      'h1, h2, h3, p, article, [class*="price"], [data-testid*="title"]'
    );
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

