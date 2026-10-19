<div align="center">

# ⚡ Vision AI

**Ultra-Low-Token, Multi-Provider Autonomous Chrome Agent**

*An open-source, 100% client-side browser automation agent powered by Bring-Your-Own-Key (BYOK) LLMs, hardware CDP actuation, and deterministic skill caching.*

[![Chrome Manifest V3](https://img.shields.io/badge/Manifest-V3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![React 19](https://img.shields.io/badge/React-19.0-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7%20Strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![WXT Framework](https://img.shields.io/badge/WXT-0.19-FF5D01)](https://wxt.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Tests Passing](https://img.shields.io/badge/Tests-66%2F66%20Passing-brightgreen)](https://vitest.dev/)

[Quick Start](#-quick-start) •
[Features](#-key-features) •
[Architecture](#-system-architecture) •
[Supported Models](#-supported-ai-providers) •
[Developer Guide](#-developer-guide)

</div>

---

## 🌟 Overview

**Vision AI** is a fully autonomous browser agent extension for Google Chrome, Brave, and Microsoft Edge. Built on Manifest V3, Vision AI directly observes web pages, distills dense DOM trees into compact semantic action targets, reasons in multi-step execution batches, and actuates mouse and keyboard actions with trusted hardware events.

Unlike closed, cloud-locked commercial agents that charge steep monthly fees and log your browsing data:
- **100% Free & Open-Source:** No subscriptions, no credit limits, no account walls.
- **Bring Your Own Keys (BYOK):** Direct native integration with Google Gemini (free tier), Groq, OpenRouter, Anthropic Claude, OpenAI, and local Ollama models.
- **Complete Privacy:** All network requests and LLM calls originate directly from your local browser instance. Zero third-party telemetry, zero cloud proxies.
- **Marvel Vision Aesthetic:** High-contrast dark synthezoid theme (`#0A0F1D` canvas, Solar Gold `#F59E0B` laser overlays, Emerald `#10B981` indicators) engineered for maximum readability.

---

## 🚀 Quick Start

### Load the Pre-Built Extension (Zero Build Required)

You can load and use Vision AI in 30 seconds:

1. **Clone or Download** this repository:
   ```bash
   git clone https://github.com/your-username/vision-ai.git
   ```
2. Open Chrome (or any Chromium browser) and navigate to:
   ```
   chrome://extensions
   ```
3. Enable **Developer mode** using the toggle switch in the top-right corner.
4. Click **Load unpacked** (top-left).
5. Select the **`vision-ext/`** folder inside the cloned repository.
6. Open the Chrome Extensions puzzle icon, pin **Vision AI**, and click the icon or press `Alt+V` to launch the side panel!
7. Click the **Settings (⚙️)** icon in the side panel header, paste your free Google Gemini API key (or Groq, OpenRouter, etc.), and you are ready to automate!

> [!TIP]
> **Free API Keys:** You can get a 100% free API key from [Google AI Studio](https://aistudio.google.com/) or [Groq Console](https://console.groq.com/). Vision AI defaults out-of-the-box to Google Gemini with zero setup friction.

---

## ✨ Key Features

### 1. Ultra-Low-Token DOM Distillation (<800 Tokens)
Standard browser agents paste raw HTML or giant accessibility dumps into prompts, burning 10,000–50,000 tokens per interaction. Vision AI utilizes a specialized tree distillation engine:
- Removes non-interactive nodes, scripts, styling, and off-screen hidden elements.
- Strips decorative containers while preserving interactive leaf nodes (`button`, `a`, `input`, `select`, `role="button"`).
- Tags actionable elements with compact numeric markers `[id]`.
- Guarantees the entire viewport distillation fits within an **800-token budget**.

### 2. Byte-Stable Prompt Caching (>90% Cost Reduction)
Conversation prefixes are engineered to remain **100% byte-stable** across consecutive turns. Dynamic information is appended strictly at the tail, maximizing cache hit rates for Anthropic prompt caching and Google Gemini context caching.

### 3. Self-Healing Element Registry
Web applications built with modern frameworks (React, Vue, Next.js) constantly re-render and invalidate raw DOM node references. Vision AI indexes elements using a multi-attribute fallback algorithm:
- Role + nth-Index signature
- Bounding client rect spatial proximity
- Normalized semantic text signature
- Automatic fallback from hardware CDP to composed synthetic events

### 4. Trusted Hardware CDP Actuation
Mouse clicks, coordinate scrolling, and keystrokes are executed via the Chrome DevTools Protocol (`chrome.debugger`) using `Input.dispatchMouseEvent` and `Input.dispatchKeyEvent`. Events have `event.isTrusted === true`, allowing Vision AI to effortlessly interact with complex applications that reject synthetic `dispatchEvent()` calls (e.g. Google Docs, Coursera, Canvas, React forms).

### 5. Multi-Tab Session Isolation
Run concurrent agent sessions across different browser tabs simultaneously. Each tab maintains an isolated state machine, thought stream, and execution history without cross-tab state pollution.

### 6. Zero-Token Deterministic Skill Cache
When Vision AI completes a repetitive browser workflow, the execution trace can be compiled into an IndexedDB skill. Subsequent invocations replay the compiled CSS/ARIA selector sequence instantly with **0 LLM tokens consumed**.

### 7. Human-in-the-Loop Safety Interceptor
Autonomous actions classified as potentially destructive (e.g. checkout purchases, email sending, database deletion, form submission) trigger an instant approval modal in the side panel before CDP actuation proceeds.

---

## 🧠 Supported AI Providers

Vision AI connects directly to your preferred LLM provider without middlemen:

| Provider | Supported Models | Recommended For |
| :--- | :--- | :--- |
| **Google Gemini** *(Default)* | `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-1.5-flash` | Free tier, high context window, ultra-fast responses |
| **Groq** | `llama-3.3-70b-versatile`, `llama-3.1-8b-instant` | Instantaneous sub-second inference speeds |
| **OpenRouter** | 200+ models (Claude, GPT, DeepSeek, Mistral, Qwen) | Universal model routing with custom credits |
| **Anthropic** | `claude-3-5-sonnet`, `claude-3-5-haiku`, `claude-3-opus` | Complex reasoning and coding tasks |
| **OpenAI** | `gpt-4o`, `gpt-4o-mini`, `o1`, `o3-mini` | High precision instruction following |
| **Ollama / Custom** | `llama3`, `mistral`, `deepseek-r1`, custom local HTTP endpoints | 100% offline local privacy (`http://localhost:11434`) |

---

## 🛠️ System Architecture

```
vision-ai/
├── entrypoints/                   # WXT React 19 UI & MV3 extension entrypoints
│   ├── sidepanel/                 # React Sidepanel application
│   │   ├── components/            # UI components (ApiKeyVault, HUD, Stream, Modal)
│   │   ├── App.tsx                # Main sidepanel controller & tab switch router
│   │   └── main.tsx               # Sidepanel React root mount
│   ├── background.ts              # Service Worker state machine & CDP bridge
│   └── content.ts                 # Page content script (distiller & spotlight overlay)
│
├── src/lib/                       # Core TypeScript engine libraries (strict mode)
│   ├── agent/                     # Agent state machine, multi-tab coordinator & loop
│   ├── cdp/                       # Chrome DevTools Protocol hardware actuator
│   ├── dom/                       # DOM distiller, mutation delta engine & registry
│   ├── executor/                  # Speculative macro-batch executor & circuit breakers
│   ├── llm/                       # Multi-provider router, byte-stable context & parser
│   ├── safety/                    # Human-in-the-loop safety classifier & approval
│   ├── skills/                    # IndexedDB zero-token deterministic skill store
│   └── vision/                    # Set-of-Marks (SoM) bounding box renderer
│
├── vision-ext/                    # Ready-to-load unpacked Chrome extension bundle
│   ├── manifest.json              # Chrome Manifest V3 manifest
│   ├── panel/                     # Sidepanel runtime bundle
│   ├── background/                # Service worker runtime bundle
│   ├── offscreen/                 # Offscreen background worker engine
│   ├── options/                   # Settings & API Key vault interface
│   ├── content/                   # Neon overlay & webapp bridges
│   └── _locales/                  # Multi-language localization (EN, ES, FR, DE, etc.)
│
├── scripts/
│   ├── build_free_vision.mjs      # Production build, syntax validator & sync script
│   ├── verify_free_vision.mjs     # Automated un-gating and BYOK permission verification
│   └── verify_rebrand_and_theme.mjs # Color contrast & theme validation
│
└── tests/                         # Vitest unit & benchmark test suites (66 tests)
```

---

## 💻 Developer Guide

### Prerequisites
- [Node.js](https://nodejs.org/) v18.0.0 or higher
- `npm` (v9+) or `pnpm`

### Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/your-username/vision-ai.git
cd vision-ai
npm install
```

### Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the WXT development live-reloading extension server |
| `npm run build` | Builds and validates the standalone Vision AI bundle (`vision-ext/` & `.output/chrome-mv3`) |
| `npm run build:wxt` | Compiles the React/TypeScript codebase using WXT compiler |
| `npm run typecheck` | Runs TypeScript compiler (`tsc --noEmit`) in strict mode |
| `npm run test` | Executes all 66 Vitest unit and benchmark test suites |
| `npm run test:watch` | Runs Vitest in interactive watch mode for TDD |

### Quality & Verification Gates
Vision AI strictly adheres to 4 quality gates:
1. **Gate A (Type Safety):** `npm run typecheck` passes with 0 errors and zero `any` types.
2. **Gate B (Unit Tests):** `npm run test` passes 66/66 tests across all 6 test suites.
3. **Gate C (MV3 Production Build):** `npm run build` completes with syntax validation across all entrypoints.
4. **Gate D (Browser Artifact):** Live browser verification of DOM distillation and UI sidepanel rendering.

---

## 🔒 Privacy, Security & Permissions

Vision AI requires the following permissions in `manifest.json`:
- `debugger`: Required for hardware CDP actuation (`chrome.debugger`) to dispatch trusted mouse and keyboard events.
- `sidePanel`: Displays the Vision AI agent workspace in Chrome's native side panel.
- `storage`: Securely caches API keys and user preferences locally in browser storage.
- `tabs`, `activeTab`: Allows the agent to inspect the current active webpage and switch between tasks.
- `offscreen`: Runs background LLM reasoning and stream processing without service worker suspension.
- `scripting`: Injects DOM distillation and spotlight indicators into page frames.

> **Privacy Guarantee:** Vision AI never transmits your API keys, prompts, browsing history, or page data to any external server other than the AI provider endpoints you explicitly configure in Settings.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) — see the LICENSE file for details.

---

<div align="center">
Built with ⚡ for the open autonomous web.
</div>
