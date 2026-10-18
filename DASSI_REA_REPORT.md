# DASSI_REA_REPORT.md — REA Static & Runtime Reverse Engineering Report

## Executive Summary
This report documents the architectural mechanisms recovered from the packaged Dassi AI Chrome Extension (v0.95.0, `./targets/dassi-ext/`) and live Chrome debugging runtime (`127.0.0.1:9222`) using REA (Reverse Engineer Anything). 

These findings form the factual baseline for Phase 2 (Planning) and Phase 3 (Execution) to upgrade `vision-ai`'s core DOM distillation, actuation, prompt structure, and multi-step continuation engines while preserving Vision AI's custom advantages (Marvel Vision UI, Tiered Free/Local Router, and Self-Healing Registry).

---

## 1. DOM Representation & Element Indexing

### 1.1 Architecture & Core Workflow
Dassi uses a hybrid CDP + Content Script architecture for DOM capture and element referencing:
- **CDP Accessibility Tree (`Accessibility.getFullAXTree`):**
  - Offset in `background/index.js`: `769596` - `794626`.
  - Captures computed ARIA accessibility tree (`nodes` array with `role`, `name`, `backendDOMNodeId`, `nodeId`).
  - Ignores invisible nodes (`!i.ignored`).
- **Interactive Node Annotator (`data-__dassi-ci`):**
  - Offset in `background/index.js`: `788451` - `793100`.
  - Injects a small evaluator script tagging interactive candidates:
    ```javascript
    el.setAttribute('data-__dassi-ci', String(results.length));
    results.push({
      text, tagName, hasOnClick, hasCursorPointer,
      hasTabIndex, isEditable, hiddenInputType, hiddenInputChecked
    });
    ```
  - Cleanup script immediately removes attributes after mapping:
    ```javascript
    document.querySelectorAll('[data-__dassi-ci]').forEach(el => el.removeAttribute('data-__dassi-ci'));
    ```

### 1.2 Self-Healing Element Ref Resolution (`cP` / `jhe` / `Dsn`)
- Offset in `background/index.js`: `769837` - `771528`.
- Every element in the snapshot has a `ref` representing `{ role, name, nth, frameId, sessionId, backendDOMNodeId }`.
- When an action executes on a `ref`:
  1. **Direct Fast-Path:** Calls `DOM.resolveNode` on `backendDOMNodeId`.
  2. **Self-Healing AX Fallback (`Dsn`):** If the node was disconnected (e.g., React 18/19 SPA re-render), it runs `Accessibility.getFullAXTree` filtered by `role` and `name` at index `nth ?? 0`.
  3. Re-acquires the fresh `backendDOMNodeId` and continues actuation with zero stall.

### 1.3 Shadow DOM, Nested Iframes & OOPIFs
- **Open Shadow DOMs:** Traversed recursively via TreeWalker:
  ```javascript
  if (v.shadowRoot) N(v.shadowRoot);
  ```
- **Cross-Origin / Out-of-Process Iframes (OOPIFs):**
  - Listens to `Target.attachedToTarget` for `targetInfo.type === 'iframe'`, mapping `targetId` to CDP `sessionId`.
  - Dispatches `Accessibility.getFullAXTree` with `{ sessionId }` directly into the isolated child process.
  - Offsets iframe coordinates into root viewport via `Runtime.callFunctionOn`:
    ```javascript
    const r = this.getBoundingClientRect();
    return { x: r.x + this.clientLeft, y: r.y + this.clientTop };
    ```

---

## 2. Action Actuation & Event Dispatch

### 2.1 Click & Pointer Sequence (`s4`, `Mw`)
- Offset in `background/index.js`: `826776` - `828000`.
- CDP mouse dispatch sequence:
  ```javascript
  // Press
  await t.sendCommand("Input.dispatchMouseEvent", {
    type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1, modifiers
  }, sessionId);
  // Release
  await t.sendCommand("Input.dispatchMouseEvent", {
    type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1, modifiers
  }, sessionId);
  ```
- **Smooth Mouse Trajectories (`Wmt`):** Cubic Hermite easing:
  $$o = i \times i \times (3 - 2i)$$
  Moves cursor in 10 micro-steps over 100ms before pressing, preventing bot-detection flags.

### 2.2 Input & Typing Sequence (`zmt`, `Jmt`, `rin`, `iin`)
- Offset in `background/index.js`: `851963` - 853646.
- **Focus (`sin`):** `this.focus()`.
- **Controlled Input Reset (`rin`):**
  ```javascript
  this.select && this.select();
  document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null);
  ```
  *Why this is superior:* Native `document.execCommand` ensures React 18/19 synthetic event dispatchers recognize the cleared state without breaking the virtual DOM binding.
- **Character Actuation (`iin`, `Lmt`):**
  - Standard characters: `Input.insertText` with `{ text }`.
  - Control keys (`Enter`, `Tab`, `Backspace`, `Escape`): `Input.dispatchKeyEvent` with `keyDown` / `rawKeyDown` + `keyUp`.

### 2.3 Scroll Actuation (`mouseWheel`, `DOM.scrollIntoViewIfNeeded`)
- Offset in `background/index.js`: `816336` - 820000.
- For target elements: Calls `DOM.scrollIntoViewIfNeeded` via CDP, aligning element to viewport center.
- For scroll containers: Dispatches `Input.dispatchMouseEvent` with `type: "mouseWheel"`, `deltaX`, and `deltaY`.

---

## 3. Agent Loop, Prompt Structure & Multi-Step Persistence

### 3.1 Session Engine Loop (`sIe`)
- Offset in `background/index.js`: `4288000` - `4295000`.
- Orchestrates multi-step agent conversations with message conversion:
  `role: "system" | "user" | "assistant" | "toolResult"`
- **Stop Condition (`ICt`):**
  ```javascript
  function ICt(t) {
    return t.length > 0 && t.every(e => e.result.terminate === true);
  }
  ```
  *Key Insight:* Normal browser actions (`element_interact`, `wait_for`, `browser_read`) return `terminate: false`. The agent NEVER stops prematurely on multi-step workflows; it only terminates when explicit goal completion is reached.

### 3.2 Anti-Injection Content Shielding
- Offset in `background/index.js`: `768000`.
- Web content is framed in untrusted tags:
  ```xml
  <untrusted_web_content source="browser_page">
  [Context: Active Webpage]
  ## Page content
  ...
  </untrusted_web_content>
  ```
  Prevents adversarial webpage text from overriding model system instructions.

### 3.3 Prompt Caching Discipline
- Strict byte-stable prefix invariant: System instructions, tool schemas, and initial user goal are fixed at turns 0 and 1.
- Tracks `cacheRead`, `cacheWrite`, `inputTokens`, and `outputTokens` in `s3n`.

---

## 4. Multi-Tab Coordination & `/slash` Learned Skills

### 4.1 Native Chrome Tab Groups
- Offset in `background/index.js`: `2435000`.
- Dassi isolates tasks by grouping Chrome tabs into dedicated `chrome.tabGroups`.
- Background tab creation (`tabs_create`):
  ```javascript
  const tab = await chrome.tabs.create({ url, active: false });
  await chrome.tabGroups.group({ tabIds: [tab.id], groupId });
  ```

### 4.2 Reusable Skills (`skill://` Protocol) & Slash Commands
- Offset in `background/index.js`: `2435000` - 2442000.
- Reusable skills are saved under `skill://<name>/SKILL.md`:
  ```markdown
  ---
  name: <kebab-name>
  description: <what it does and when to use it>
  ---

  1. Step one procedure
  2. Step two procedure
  ```
- **Slash Commands (`/<name>`):** Automatically registered from stored skills and invoked via `/<name>` in the chat stream.
- **Demonstration Recorder (`content/demo-recorder.js`):**
  - Attaches listeners (`keydown`, `input`, `pointerdown`, `click`).
  - Computes multi-engine selectors for recorded elements:
    - ARIA selector: `we(el, accessibleTree)`
    - CSS selector: `Ne(el, testIdAttrs)`
    - Text selector: `Q(_e(el), "text")`
    - Pierce selector: `Q(ke(el), "pierce")`
    - XPath selector: `Q(De(el), "xpath")`

---

## 5. Architectural Merge Recommendations for `vision-ai`

1. **Self-Healing DOM Element Ref Alignment:**
   - Enhance `src/lib/dom/distiller.ts` and `ElementRegistry`: When an element ID is dereferenced or disconnected, use Dassi's ARIA role + name + nth match pattern to automatically re-bind the new DOM node in React SPAs.
2. **React Input Reset Actuation:**
   - Upgrade `src/lib/executor/macroExecutor.ts` and `src/lib/cdp/actuator.ts`: Before typing or filling form controls, dispatch `document.execCommand('selectAll')` and `document.execCommand('delete')` to properly dirty React/Vue controlled state.
3. **Multi-Step Continuation Rule:**
   - Upgrade `src/lib/agent/stateMachine.ts`: Ensure intermediate actions explicitly keep `status: 'running'` and `complete: false` until all sequential operations (e.g. video completion, scroll down, mark complete) are finalized.
4. **Slash Command Execution:**
   - Integrate slash command parser (`/<skill-name>`) in sidepanel UI and state machine to trigger stored 0-token skills from the chat composer.
5. **Preserve Vision AI Advantages:**
   - Retain our Marvel's Vision UI, 4-section layout, Mind Stone Telemetry, and Multi-Key Router (Gemini, Groq, OpenRouter, Anthropic, Ollama).
