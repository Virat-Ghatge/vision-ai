# ROADMAP.md — GSD Execution Roadmap

## Mission: Dassi AI REA & Core Engine Reconstruction

### Phase 1: Discover (Codebase & Target Mapping)
- [x] Map existing Vision AI typed TypeScript structure (`src/` and `entrypoints/`, 38 files).
- [x] REA Static & Module Inventory of `./targets/dassi-ext/` and live runtime `127.0.0.1:9222`.
- [x] Investigate DOM representation, accessibility tree serialization, shadow DOM, and iframe handling.
- [x] Investigate action actuation and event dispatch (CDP vs. synthetic).
- [x] Investigate agent loop, system prompt templates, tool schemas, and stop conditions.
- [x] Investigate multi-tab background coordination and `/slash` skills.
- [x] Compile and deliver `DASSI_REA_REPORT.md` and await user phase approval.

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
