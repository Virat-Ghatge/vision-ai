# PROJECT.md — Vision AI: Autonomous Chrome Agent

## Vision AI Mission
Vision AI is an ultra-low-token, multi-LLM autonomous Chrome agent browser extension built on Manifest V3 with WXT, React 19, TypeScript (strict), and Tailwind CSS.
It automates complex browser workflows using byte-stable prompt caching (<800 tokens viewport budget), hardware CDP actuation, and deterministic skill caching.

## Core Features & Advantages
- **Marvel Vision UI & Mind Stone Telemetry HUD:** High-contrast dark synthezoid theme with real-time token tracking.
- **Multi-Key Free & Local Tier Router:** Direct support for your own API keys (Google Gemini, Groq, OpenRouter, Anthropic, OpenAI, Ollama) with zero subscription fees or cloud locks.
- **Self-Healing DOM Registry & Subframe Execution:** Resilient element mapping across React/Vue SPA re-renders and nested iframes.
- **Hardware CDP Actuation:** Mouse & keyboard actions dispatched via `chrome.debugger` with trusted events and synthetic fallback.
- **Deterministic Skill Cache:** Zero-token re-execution of recorded domain workflows compiled to resilient selectors in IndexedDB.

## Tech Stack
- **Framework:** WXT 0.19.x (Manifest V3 Chrome Extension)
- **Frontend:** React 19, Tailwind CSS, Lucide React
- **Actuation:** Chrome Debugger Protocol (`chrome.debugger`) + Composed Synthetic Fallback
- **Language:** TypeScript 5.7+ (strict mode, no `any`)
- **Test Engine:** Vitest, happy-dom, fake-indexeddb

## Key System Boundaries & Invariants
1. Viewport DOM distillation budget must stay under 800 tokens.
2. Byte-stable context prefixes across steps (>90% Anthropic/Gemini prompt cache discount).
3. Quality gates required: Gate A (`typecheck`), Gate B (`vitest`), Gate C (`build`).

