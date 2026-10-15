# AGENTS.md — Vision AI Development & Loop Architecture

## System Overview
Vision AI is an ultra-low-token, multi-LLM autonomous Chrome agent browser extension built on Manifest V3 with WXT, React 19, TypeScript (strict), and Tailwind CSS.

## Architecture Guidelines
1. **Byte-Stable Contexts:** All LLM conversation prefixes must remain 100% byte-stable across conversational turns to maximize Anthropic and Gemini prompt cache hit rates (>90% cache discount).
2. **DOM Distillation Budget:** Viewport DOM must be distilled to under 800 tokens using landmark-based filtering and numeric integer tags `[id]`.
3. **Speculative Macro-Batching:** Multi-action execution with localized validation and early abort triggers on DOM mutations or URL navigation.
4. **Hardware CDP Actuation:** Mouse & keyboard actions are dispatched via `chrome.debugger` (`Input.dispatchMouseEvent` / `Input.dispatchKeyEvent`) with `event.isTrusted === true`, with seamless fallback to synthetic events.
5. **Deterministic Skill Cache:** Zero-token re-execution of recorded domain workflows compiled to resilient CSS/ARIA selectors in IndexedDB.

## Quality & Verification Gates
- **Gate A (Type Safety):** `npm run typecheck` (`tsc --noEmit`) with 0 errors and no `any` types.
- **Gate B (Unit & Budget Tests):** `npm run test` (`vitest run`) with all tests passing.
- **Gate C (MV3 Extension Build):** `npm run build` (`wxt build`) outputting `.output/chrome-mv3`.
- **Gate D (Browser Artifact):** Live browser verification for DOM and UI components.
