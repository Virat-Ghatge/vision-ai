# LOOP_STATE.md — Loop Engineering Protocol State

## Current Active Task
- **Task ID:** `M1.1`
- **Status:** `[-]` In Progress
- **Started At:** 2026-10-15T14:28:30+05:30
- **Goal:** Implement `LLMRouter` with adapters for Anthropic, Gemini, Groq, OpenRouter, and Ollama.

---

## Milestone Backlog

### Milestone 0: Harness & Loop Setup
- [x] `M0.1` Scaffold WXT + React + TypeScript + Tailwind + Vitest + `fake-indexeddb` + `happy-dom`.
- [x] `M0.2` Create `AGENTS.md`, `LOOP_STATE.md`, and `.agent/skills/token-budget/SKILL.md` defining the 800-token DOM distillation cap and byte-stable caching rules.

### Milestone 1: Multi-Provider Router & Byte-Stable Context Manager
- [-] `M1.1` Implement `LLMRouter` with adapters for Anthropic, Gemini, Groq, OpenRouter, and Ollama.
- [ ] `M1.2` Implement `ByteStableContextManager` ensuring prefix immutability across steps + token estimator.
- [ ] `M1.3` Write Vitest suite verifying Anthropic `cache_control` placement, tiered routing selection, and byte-identical prefixes across 5 simulated steps.

### Milestone 2: DOM Distiller & Mutation Delta Engine
- [ ] `M2.1` Build `distiller.ts` with numeric `[ID]` tagging, visibility filtering, and `WeakRef` registry.
- [ ] `M2.2` Build `delta.ts` using `MutationObserver` to emit compact `ADDED / MODIFIED / REMOVED` diffs.
- [ ] `M2.3` Write Vitest benchmark feeding a complex 1,000-node mock e-commerce/GitHub DOM and asserting output is under 800 tokens and diffs are under 100 tokens.

### Milestone 3: CDP Hardware Actuator, Macro-Batch Runner & SoM Vision
- [ ] `M3.1` Implement `cdp/actuator.ts` (`chrome.debugger` mouse/keyboard dispatch) + synthetic fallback.
- [ ] `M3.2` Implement speculative macro-batch executor with mid-batch validation/URL-change circuit breakers.
- [ ] `M3.3` Implement `som.ts` canvas bounding-box renderer and cropped WebP extractor.

### Milestone 4: Stateful Background Agent Loop & IndexedDB Skill Compiler
- [ ] `M4.1` Build the Service Worker state machine (`Observe -> Check Skill Cache -> Route LLM -> Execute Macro-Batch -> Diff`).
- [ ] `M4.2` Implement `IndexedDB` Skill Store and post-run Tier-2 skill compilation.
- [ ] `M4.3` Add Human-in-the-Loop safety interceptor for destructive actions (`submit`, `delete`, `purchase`, `send`).

### Milestone 5: Side Panel UI & Live Browser Verification
- [ ] `M5.1` Build React Side Panel UI: Chat/Task stream, Provider API Key Vault, Tier Router selector, Live Token Savings Counter (Cached vs. Uncached tokens), and Saved Skills drawer.
- [ ] `M5.2` Run full WXT build and verify UI rendering and DOM distillation in Antigravity's built-in Chrome browser, generating final Verification Artifacts.

---

## Verification Log & Metrics
| Iteration | Task ID | Gate A (Typecheck) | Gate B (Vitest) | Gate C (Build) | Gate D (Browser) | Notes |
|-----------|---------|--------------------|-----------------|----------------|------------------|-------|
| 1 | M0.1 | PASS (0 errors) | PASS (2 tests) | PASS (258.73 kB bundle) | N/A (Scaffolding) | Initial project setup with WXT, React 19, Tailwind, Vitest |
| 2 | M0.2 | PASS (0 errors) | PASS (2 tests) | PASS (258.73 kB bundle) | N/A (Docs/Config) | Created AGENTS.md, LOOP_STATE.md, and token-budget SKILL.md specs |

---

## Blockers & Escalations
None.
