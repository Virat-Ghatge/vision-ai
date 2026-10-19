# ROADMAP.md — GSD Execution Roadmap

## Mission: Vision AI Autonomous Engine Architecture

### Phase 1: Discover (Codebase & Target Mapping)
- [x] Map existing Vision AI typed TypeScript structure (`src/` and `entrypoints/`, 38 files).
- [x] Static & Module Inventory of live runtime `127.0.0.1:9222`.
- [x] Investigate DOM representation, accessibility tree serialization, shadow DOM, and iframe handling.
- [x] Investigate action actuation and event dispatch (CDP vs. synthetic).
- [x] Investigate agent loop, system prompt templates, tool schemas, and stop conditions.
- [x] Investigate multi-tab background coordination and `/slash` skills.
- [x] Compile and deliver architecture report and await user phase approval.

### Phase 2: Plan (Micro-Task Breakdown)
- [x] Await user approval of Phase 1 discoveries (Approved).
- [x] Deconstruct Stage 2 (Reconstruct & Upgrade) into atomic, granular micro-tasks (<= 3 files each):
  - **Task 2.1:** Self-Healing Element Registry & Landmark Container Pruning (`src/lib/dom/distiller.ts`, `tests/dom-distiller.test.ts`)
  - **Task 2.2:** React-Compatible Input Clearing & CDP `Input.insertText` Actuation (`src/lib/cdp/actuator.ts`, `src/lib/executor/macroExecutor.ts`, `tests/actuator-and-vision.test.ts`)
  - **Task 2.3:** Untrusted Web Content Shield & Anti-Stall System Prompt (`src/lib/llm/contextManager.ts`, `tests/router-and-context.test.ts`)
  - **Task 2.4:** State Machine Continuation Rules & Intermediate Step Persistence (`src/lib/agent/stateMachine.ts`, `tests/parser-and-loop.test.ts`)
  - **Task 2.5:** Slash Command (`/<skill>`) Trigger & Inline Quick Reflex Integration (`entrypoints/sidepanel/App.tsx`, `entrypoints/sidepanel/components/TaskStream.tsx`, `tests/safety-and-skills.test.ts`)
- [x] Submit plan for explicit user approval before modifying code (Approved).

### Phase 3: Execute (Atomic Implementation Loops)
- [x] Execute Task 2.1: Self-Healing Element Registry & Landmark Container Pruning.
- [x] Execute Task 2.2: React-Compatible Input Clearing & CDP `Input.insertText` Actuation.
- [x] Execute Task 2.3: Untrusted Web Content Shield & Anti-Stall System Prompt.
- [x] Execute Task 2.4: State Machine Continuation Rules & Intermediate Step Persistence.
- [x] Execute Task 2.5: Slash Command (`/<skill>`) Trigger & Inline Quick Reflex Integration.
- [x] Atomic git commits per micro-task with empirical verification.

### Phase 4: Verify (Rigorous Quality Gates)
- [x] Gate A: Type safety verification (`npm run typecheck` exits 0).
- [x] Gate B: Unit test suite execution (`npm run test` passes all 66 tests across 6 suites).
- [x] Gate C: Production build verification (`npm run build` outputs `.output/chrome-mv3`).
- [x] Final update of `LOOP_STATE.md` and repository state.

### Phase 5: Free BYOK Standalone Extension (Vision AI Free Engine)
- [x] Complete Supabase auth bypass (`uvt() -> true`, `AUTH_CHECK_DONE -> ready`, `rj() -> success`).
- [x] Neutralize paywalls, credit restrictions, and upgrade modals (`UWt`, `PWt`, `Mfe`, `LWt` silenced).
- [x] Permanent BYOK permission enablement (`vfe()`, `DDn()`, `skn()`, `cde()` permanently return `true`).
- [x] Free default provider configured to Google Gemini (`selectedProvider: "google"`), with Groq, OpenRouter, Anthropic, OpenAI, DeepSeek, and Custom (Ollama) selectable.
- [x] Options UI re-routed to open `#models` tab directly and maintain active `providerHandlers` without requiring cloud login.
- [x] Extension rebranded to **Vision AI — Free Autonomous Browser Agent** in `manifest.json`, `_locales`, `sidepanel.html`, and `options.html`.
- [x] Verified empirically with 21 automated validation checks passing (`scripts/verify_free_vision.mjs`).
- [x] Built and synchronized to `vision-ext/` and `.output/chrome-mv3`.

### Phase 6: Clean Vision UI, Purge Dead Features & Theme Polish
- [x] **Task 6.1: External Links & Traces Removal**
  - Removed "Gift to friend" / referral button from sidepanel toolbar.
  - Removed "Rate", "Join Discord", and "Report bug" items from sidepanel more dropdown.
  - Stripped external domain entries from `manifest.json` host_permissions and content_scripts.
  - Disabled uninstall telemetry reporting in background script.
- [x] **Task 6.2: Dead Features & Unused Settings Buttons Removal**
  - Removed dead `gateway` tab (broken cloud Telegram pairing) from Settings navigation and router.
  - Removed dead `contact` / `plan` tabs and `account` group from Settings navigation and router.
  - Removed internal Dassi Developer Options card (benchmark arm, debug toggles) from Preferences.
  - Removed "dassi CLI access" integration section from Preferences.
  - Removed broken signout button from Settings header.
- [x] **Task 6.3: Dark Theme Text Box & Color Contrast Fix**
  - Replaced hardcoded `#fff` background with `#161F30` for `.gl-popup`, `.gl-field`, and `.gl-textarea` in `options.css`.
  - Injected dark background `#161F30`, light text `#F8FAFC`, dark border `#1E293B`, and Solar Gold focus states across all inputs, textareas, popups, and dropdowns.
  - Explicitly styled dropdown `<option>` and `.gl-popup option` for Chrome on Windows.
  - Styled placeholders (`#64748B`, `opacity: 1`) for high readability and contrast.
- [x] **Task 6.4: Full Quality Gates & Verification**
  - Automated test suite: 23 passed, 0 failed in `verify_all_problems.mjs`.
  - Gate A: `npm run typecheck` passed with 0 errors.
  - Gate B: `npm run test` passed 66/66 tests across 6 test suites.
  - Gate C: `npm run build` completed successfully, synced to `vision-ext/` and `.output/chrome-mv3`.

