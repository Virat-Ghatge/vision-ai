# PROJECT.md — Vision AI: Autonomous Chrome Agent

## Vision AI Mission
Vision AI is an ultra-low-token, multi-LLM autonomous Chrome agent browser extension built on Manifest V3 with WXT, React 19, TypeScript (strict), and Tailwind CSS.
It automates complex browser workflows (such as Coursera and Cisco NetAcad LMS navigation, media completion, and multi-step tasks) using byte-stable prompt caching (<800 tokens viewport budget), hardware CDP actuation, and deterministic skill caching.

## Current Objective: Dassi AI REA & Core Engine Reconstruction
Reverse-engineer Dassi AI Chrome Extension (v0.95.0, `./targets/dassi-ext/` and live runtime `127.0.0.1:9222`) using REA (Reverse Engineer Anything), extract its superior architectural mechanisms, and merge them into `vision-ai` while strictly preserving and enhancing our unique advantages:
- Marvel's Vision UI & Mind Stone Telemetry HUD
- Multi-Key Free & Local Tier Router (Gemini, Groq, OpenRouter, Anthropic, Ollama)
- Self-Healing DOM Registry & Subframe Execution

## Tech Stack
- **Framework:** WXT 0.19.x (Manifest V3 Chrome Extension)
- **Frontend:** React 19, Tailwind CSS, Lucide React
- **Actuation:** Chrome Debugger Protocol (`chrome.debugger`) + Composed Synthetic Fallback
- **Language:** TypeScript 5.7+ (strict mode, no `any`)
- **Test Engine:** Vitest, happy-dom, fake-indexeddb
- **Reverse Engineering:** REA (Reverse Engineer Anything), Chrome DevTools Protocol (`127.0.0.1:9222`)

## Key System Boundaries & Invariants
1. Viewport DOM distillation budget must stay under 800 tokens.
2. Byte-stable context prefixes across steps (>90% Anthropic/Gemini prompt cache discount).
3. Quality gates required: Gate A (`typecheck`), Gate B (`vitest`), Gate C (`wxt build`).
