---
name: token-budget
description: Ultra-low-token budget architecture and byte-stable prompt caching protocol for OrbitAgent
---

# OrbitAgent Token Budget & Byte-Stable Prompt Caching Specification

This skill documents the hard budget limits and cache-stabilization invariants that OrbitAgent must maintain on every browser interaction.

## 1. Hard Token Budget Caps
1. **Viewport DOM Distillation:** Maximum **800 tokens** per full observation (Step 1).
2. **Mutation Delta Diff:** Maximum **100 tokens** per incremental step (Steps 2..N).
3. **Action Macro Response:** Maximum **150 tokens** per plan step.
4. **Target Overall Cost per Multi-Step Task:** < 2,000 net billed tokens across 10 actions by utilizing >90% prompt caching discount.

## 2. Layer 1: DOM Distillation Rules (`distiller.ts`)
- **Filter Out Non-Visible Elements:**
  - `display === "none"`
  - `visibility === "hidden"`
  - `opacity === "0"`
  - Zero bounding client rect (`width === 0 || height === 0`)
  - Off-screen coordinates (unless explicitly scrolled or requested)
- **Landmark & Interactive Element Prioritization:**
  - Only retain interactive elements: `a`, `button`, `input`, `select`, `textarea`, `[role="button"]`, `[role="link"]`, `[role="checkbox"]`, `[role="menuitem"]`, `[contenteditable="true"]`, and semantic heading/form landmarks.
  - Strip redundant class names, inline CSS, SVG paths, data attributes, decorative divs, and script/style tags.
- **Sequential Integer Tagging `[id]`:**
  - Assign short 1-based sequential integers: `[1]`, `[2]`, `[3]`, etc.
  - Retain a memory-safe `Map<number, WeakRef<HTMLElement>>` in the content script for instantaneous CDP coordinate resolution.
  - Compact format: `[id] <tag attr="val">text content</tag>` (e.g., `[4] <button>Submit Order</button>`).

## 3. Layer 2: MutationObserver Delta Engine (`delta.ts`)
- Step 1 sends the initial distilled tree.
- Steps 2..N do NOT resend the entire DOM.
- A content-script `MutationObserver` records DOM mutations occurring during the execution of actions.
- Output delta format:
  ```text
  [DELTA]
  ADDED:
  [21] <div role="alert">Address verified</div>
  MODIFIED:
  [7] <input type="text" value="94107">
  REMOVED:
  [15]
  ```
- This keeps step observations well under 100 tokens.

## 4. Byte-Stable Prompt Caching Invariants (`ByteStableContextManager`)
- **Prefix Immutability:** The conversation prefix sent to LLMs (System Prompt, Tool Schemas, User Goal, Initial Step) must NEVER change its byte sequence between turns.
- **Append-Only History:** All subsequent steps are appended strictly to the tail of the message array. No middle-message rewriting, no shifting window that truncates the start.
- **Provider-Specific Caching Tags:**
  - **Anthropic Claude:** Inject `cache_control: { type: "ephemeral" }` at:
    1. The end of the System Prompt
    2. The last tool definition
    3. The turn-1 initial distilled DOM state
  - **Google Gemini:** Utilize strict JSON schemas and context caching headers.
- **Savings Telemetry:** Compare total tokens processed vs. billable un-cached tokens to measure real cash savings (>90% savings target).
