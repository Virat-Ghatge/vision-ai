# LOOP_STATE.md — Loop Engineering Protocol State

## Current Active Task
- **Task ID:** `M3.3`
- **Status:** `[-]` In Progress
- **Started At:** 2026-10-15T14:43:25+05:30
- **Goal:** Implement `som.ts` canvas bounding-box renderer and cropped WebP extractor.

---

## Milestone Backlog

### Milestone 0: Harness & Loop Setup
- [x] `M0.1` Scaffold WXT + React + TypeScript + Tailwind + Vitest + `fake-indexeddb` + `happy-dom`.
- [x] `M0.2` Create `AGENTS.md`, `LOOP_STATE.md`, and `.agent/skills/token-budget/SKILL.md` defining the 800-token DOM distillation cap and byte-stable caching rules.

### Milestone 1: Multi-Provider Router & Byte-Stable Context Manager
- [x] `M1.1` Implement `LLMRouter` with adapters for Anthropic, Gemini, Groq, OpenRouter, and Ollama.
- [x] `M1.2` Implement `ByteStableContextManager` ensuring prefix immutability across steps + token estimator.
- [x] `M1.3` Write Vitest suite verifying Anthropic `cache_control` placement, tiered routing selection, and byte-identical prefixes across 5 simulated steps.

### Milestone 2: DOM Distiller & Mutation Delta Engine
- [x] `M2.1` Build `distiller.ts` with numeric `[ID]` tagging, visibility filtering, and `WeakRef` registry.
- [x] `M2.2` Build `delta.ts` using `MutationObserver` to emit compact `ADDED / MODIFIED / REMOVED` diffs.
- [x] `M2.3` Write Vitest benchmark feeding a complex 1,000-node mock e-commerce/GitHub DOM and asserting output is under 800 tokens and diffs are under 100 tokens.

### Milestone 3: CDP Hardware Actuator, Macro-Batch Runner & SoM Vision
- [x] `M3.1` Implement `cdp/actuator.ts` (`chrome.debugger` mouse/keyboard dispatch) + synthetic fallback.
- [x] `M3.2` Implement speculative macro-batch executor with mid-batch validation/URL-change circuit breakers.
- [-] `M3.3` Implement `som.ts` canvas bounding-box renderer and cropped WebP extractor.

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
| 3 | M1.1 | PASS (0 errors) | PASS (2 tests) | PASS (258.96 kB bundle) | N/A (Router Core) | Implemented LLMRouter and adapters (Anthropic, Gemini, Groq, OpenRouter, Ollama) |
| 4 | M1.2 | PASS (0 errors) | PASS (2 tests) | PASS (258.96 kB bundle) | N/A (Context Core) | Implemented ByteStableContextManager with prefix hash and token estimator |
| 5 | M1.3 | PASS (0 errors) | PASS (10 tests) | PASS (258.96 kB bundle) | N/A (Test Suite) | Full unit test suite for routing, cache headers, and 5-step prefix immutability |
| 6 | M2.1 | PASS (0 errors) | PASS (10 tests) | PASS (259.01 kB bundle) | N/A (Distiller Core) | Built distiller.ts with WeakRef registry, visibility filter, and integer tagging |
| 7 | M2.2 | PASS (0 errors) | PASS (10 tests) | PASS (259.01 kB bundle) | N/A (Delta Core) | Built delta.ts with MutationObserver and alert/error detection |
| 8 | M2.3 | PASS (0 errors) | PASS (13 tests) | PASS (259.01 kB bundle) | N/A (Benchmark) | 1,000+ node DOM benchmark passed (<800 tokens viewport, <100 tokens delta) |
| 9 | M3.1 | PASS (0 errors) | PASS (13 tests) | PASS (259.01 kB bundle) | N/A (CDP Actuator) | CDPActuator with trusted chrome.debugger mouse/key dispatch and fallback |
| 10 | M3.2 | PASS (0 errors) | PASS (13 tests) | PASS (259.01 kB bundle) | N/A (Macro Runner) | MacroBatchExecutor with 120ms debounce and validation/abort circuit breakers |

---

## Blockers & Escalations
None.
