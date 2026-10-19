import fs from 'node:fs';
import path from 'node:path';

const SRC_DIR = 'targets/dassi-ext';
const DEST_DIR = 'vision-ext';
const OUTPUT_DIR = '.output/chrome-mv3';

console.log('=== Building Free Vision AI (Marvel Vision Theme & BYOK Clone) ===');

// Helper to copy directory recursively
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 1. Copy files to vision-ext
if (fs.existsSync(SRC_DIR)) {
  console.log('Copying base files from', SRC_DIR, 'to', DEST_DIR);
  if (fs.existsSync(DEST_DIR)) {
    fs.rmSync(DEST_DIR, { recursive: true, force: true });
  }
  copyDir(SRC_DIR, DEST_DIR);
} else {
  console.log('Base target source not present; using current standalone', DEST_DIR);
}


// Helper for exact replacement with validation
function patchFile(filePath, replacements) {
  let content = fs.readFileSync(filePath, 'utf-8');
  for (const { search, replace, name } of replacements) {
    if (typeof search === 'string') {
      if (!content.includes(search)) {
        console.warn(`[WARN] Target not found for: ${name} in ${filePath}`);
        continue;
      }
      content = content.replaceAll(search, replace);
      console.log(`[OK] Applied patch: ${name} in ${path.basename(filePath)}`);
    } else if (search instanceof RegExp) {
      if (!search.test(content)) {
        console.warn(`[WARN] Regex target not found for: ${name} in ${filePath}`);
        continue;
      }
      content = content.replace(search, replace);
      console.log(`[OK] Applied regex patch: ${name} in ${path.basename(filePath)}`);
    }
  }
  fs.writeFileSync(filePath, content, 'utf-8');
}

// Helper to replace translations in dictionary objects across all languages and formats
function patchTranslationValues(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const PRESERVE_INTERNAL_VALUES = new Set([
    'dassi-managed',
    'dassi-core',
    'dassi-file-references',
    'dassiConfig',
    'x-dassi-run-id',
    '_dassi_cid',
    'dassi_ref',
    'dassi://skills/personalize'
  ]);

  function isInternal(val) {
    return /^dassi_[a-z0-9_]+$/i.test(val) || /^dassi:[a-z0-9_-]+$/i.test(val) || PRESERVE_INTERNAL_VALUES.has(val);
  }

  let count = 0;
  content = content.replace(/(["'])([\w.-]+)\1\s*:\s*(["'`])((?:(?!\3)[^\\]|\\.)*?)\3/g, (fullMatch, qKey, key, qVal, val) => {
    if (!/dassi/i.test(val) || isInternal(val)) {
      return fullMatch;
    }
    let newVal = val
      .replace(/dassi MCP/gi, 'Vision AI MCP')
      .replace(/dassi CLI/gi, 'Vision AI CLI')
      .replace(/Dassi's/g, "Vision AI's")
      .replace(/dassi's/g, "Vision AI's")
      .replace(/Dassis/g, "Vision AIs")
      .replace(/https:\/\/app\.dassi\.ai/g, 'https://app.vision.ai')
      .replace(/https:\/\/dassi\.ai/g, 'https://vision.ai')
      .replace(/Dassi/g, 'Vision AI')
      .replace(/dassi/g, 'Vision AI');

    if (newVal !== val) {
      count++;
      return `${qKey}${key}${qKey}:${qVal}${newVal}${qVal}`;
    }
    return fullMatch;
  });

  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`[OK] Replaced ${count} translation dictionary occurrences in ${path.basename(filePath)}`);
}

// 2. Patch manifest.json
console.log('\n--- Patching manifest.json ---');
const manifestPath = path.join(DEST_DIR, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
manifest.name = 'Vision';
manifest.short_name = 'Vision';
manifest.description = 'Autonomous Chrome browser agent powered by your own API keys (Gemini, Groq, OpenRouter, Anthropic, OpenAI, Ollama). Completely free to use.';
manifest.action.default_title = 'Open Vision';
if (manifest.commands && manifest.commands['toggle-dictation']) {
  manifest.commands['toggle-dictation'].description = 'Start or stop voice dictation in Vision';
}
manifest.minimum_chrome_version = '120';
delete manifest.update_url;

// Strip external Dassi domain permissions and content scripts
if (manifest.host_permissions) {
  manifest.host_permissions = manifest.host_permissions.filter(p => !p.includes('dassi.ai'));
}
if (manifest.content_scripts) {
  manifest.content_scripts = manifest.content_scripts
    .map(cs => {
      if (cs.matches) {
        cs.matches = cs.matches.filter(m => !m.includes('dassi.ai'));
      }
      return cs;
    })
    .filter(cs => cs.matches && cs.matches.length > 0);
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
console.log('[OK] manifest.json updated (dassi.ai domains removed)');

// 3. Patch _locales (all languages)
console.log('\n--- Patching _locales ---');
const localesDir = path.join(DEST_DIR, '_locales');
if (fs.existsSync(localesDir)) {
  for (const loc of fs.readdirSync(localesDir)) {
    const locFile = path.join(localesDir, loc, 'messages.json');
    if (fs.existsSync(locFile)) {
      if (loc === 'en') {
        const enMessages = {
          appDescription: {
            message: 'Free autonomous AI agent for your browser. Automates tasks on any site using your own API keys (Gemini, Groq, OpenRouter, Claude, GPT, Ollama).'
          },
          appName: {
            message: 'Vision'
          },
          appShortName: {
            message: 'Vision'
          },
          openDassi: {
            message: 'Open Vision side panel'
          },
          openDassiSidepanel: {
            message: 'Open Vision side panel'
          },
          stopRunningAgent: {
            message: 'Stop the running agent'
          }
        };
        fs.writeFileSync(locFile, JSON.stringify(enMessages, null, 2), 'utf-8');
      } else {
        let locData = JSON.parse(fs.readFileSync(locFile, 'utf-8'));
        if (locData.appName?.message) {
          locData.appName.message = locData.appName.message.replace(/\bdassi\b/gi, 'Vision');
        }
        if (locData.appShortName?.message) {
          locData.appShortName.message = 'Vision';
        }
        if (locData.openDassi?.message) {
          locData.openDassi.message = locData.openDassi.message.replace(/\bdassi\b/gi, 'Vision');
        }
        if (locData.openDassiSidepanel?.message) {
          locData.openDassiSidepanel.message = locData.openDassiSidepanel.message.replace(/\bdassi\b/gi, 'Vision');
        }
        fs.writeFileSync(locFile, JSON.stringify(locData, null, 2), 'utf-8');
      }
      console.log(`[OK] _locales/${loc}/messages.json updated`);
    }
  }
}

// 4. Marvel Vision Theme styles for sidepanel.html
console.log('\n--- Patching sidepanel.html (Marvel Vision Theme) ---');
const sidepanelCssOverride = `
  <style>
    /* Marvel Vision Theme Override (Vibranium Obsidian & Solar Mind Stone) */
    :root {
      --background: #0B0F19 !important;
      --foreground: #F8FAFC !important;
      --card: #111827 !important;
      --card-foreground: #F8FAFC !important;
      --popover: #111827 !important;
      --popover-foreground: #F8FAFC !important;
      --primary: #F59E0B !important;
      --primary-foreground: #0B0F19 !important;
      --secondary: #1F2937 !important;
      --secondary-foreground: #F8FAFC !important;
      --muted: #1E293B !important;
      --muted-foreground: #94A3B8 !important;
      --accent: #2A1724 !important;
      --accent-foreground: #FBBF24 !important;
      --destructive: #BE123C !important;
      --destructive-foreground: #FFFFFF !important;
      --border: #1E293B !important;
      --input: #1E293B !important;
      --ring: #F59E0B !important;
      --color-orange-500: #F59E0B !important;
      --color-amber-500: #FBBF24 !important;
    }

    body {
      background-color: #0B0F19 !important;
      color: #F8FAFC !important;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    #root {
      background-color: #0B0F19 !important;
    }

    /* Top Toolbar with Solar Mind Gem Brand Text */
    .chat-toolbar {
      background: linear-gradient(180deg, #111827 0%, #0B0F19 100%) !important;
      border-bottom: 1px solid #1E293B !important;
    }
    .chat-toolbar-brand {
      font-weight: 700 !important;
      letter-spacing: 0.04em !important;
      background: linear-gradient(135deg, #FBBF24 0%, #F59E0B 50%, #E11D48 100%) !important;
      -webkit-background-clip: text !important;
      -webkit-text-fill-color: transparent !important;
      filter: drop-shadow(0 0 10px rgba(245, 158, 11, 0.4)) !important;
    }

    /* Starter Screen: Velvet Crimson Aura & Solar Amber Card */
    .starter-background {
      background: radial-gradient(circle at 50% 15%, rgba(159, 18, 57, 0.2) 0%, rgba(11, 15, 25, 0.95) 60%, #0B0F19 100%) !important;
    }
    .starter-background-card {
      background: #111827 !important;
      border: 1px solid rgba(245, 158, 11, 0.25) !important;
      box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.6), 0 0 25px -5px rgba(159, 18, 57, 0.3) !important;
    }
    .starter-background-badge {
      background: linear-gradient(135deg, rgba(159, 18, 57, 0.35) 0%, rgba(245, 158, 11, 0.2) 100%) !important;
      border: 1px solid rgba(245, 158, 11, 0.45) !important;
      color: #FBBF24 !important;
      font-weight: 600 !important;
      box-shadow: 0 0 10px rgba(245, 158, 11, 0.15) !important;
    }

    /* Composer Input Box */
    .composer-root {
      background: #111827 !important;
      border: 1px solid #1E293B !important;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4) !important;
    }
    .composer-root:focus-within {
      border-color: #F59E0B !important;
      box-shadow: 0 0 15px rgba(245, 158, 11, 0.3) !important;
    }
    textarea {
      color: #F8FAFC !important;
    }
    textarea::placeholder {
      color: #64748B !important;
    }

    /* Solar Mind Stone Action Buttons */
    button.bg-primary {
      background: linear-gradient(135deg, #FBBF24 0%, #F59E0B 100%) !important;
      color: #0B0F19 !important;
      font-weight: 600 !important;
      box-shadow: 0 2px 10px rgba(245, 158, 11, 0.35) !important;
      transition: all 0.2s ease !important;
    }
    button.bg-primary:hover {
      background: linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%) !important;
      box-shadow: 0 4px 18px rgba(245, 158, 11, 0.5) !important;
      transform: translateY(-1px) !important;
    }

    /* Model Pill & Dropdowns */
    .model-selector, select, [role="combobox"] {
      background-color: #161F30 !important;
      border-color: #1E293B !important;
      color: #F8FAFC !important;
    }

    /* Scrollbars */
    ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    ::-webkit-scrollbar-track {
      background: #0B0F19;
    }
    ::-webkit-scrollbar-thumb {
      background: #1E293B;
      border-radius: 3px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: #9F1239;
    }
  </style>
</head>`;

let sidepanelHtml = fs.readFileSync(path.join(DEST_DIR, 'sidepanel.html'), 'utf-8');
sidepanelHtml = sidepanelHtml.replace('<title>dassi</title>', '<title>Vision AI</title>');
sidepanelHtml = sidepanelHtml.replace('</head>', sidepanelCssOverride);
fs.writeFileSync(path.join(DEST_DIR, 'sidepanel.html'), sidepanelHtml, 'utf-8');
console.log('[OK] sidepanel.html updated with Marvel Vision theme');

// 5. Marvel Vision Theme styles for options.html
console.log('\n--- Patching options.html (Marvel Vision Theme) ---');
const optionsCssOverride = `
  <style>
    :root {
      --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
      --font-sans: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      --orange: #F59E0B; /* Marvel Vision Solar Mind Stone Gold */
      --orange-light: rgba(245, 158, 11, 0.15);
      --black: #F8FAFC; /* Platinum text in dark synthezoid theme */
      --gray-900: #F1F5F9;
      --gray-700: #CBD5E1;
      --gray-600: #94A3B8;
      --gray-500: #64748B;
      --gray-300: #1E293B;
      --gray-200: #161F30;
      --gray-100: #0B0F19; /* Vibranium Obsidian Body */
      --white: #111827; /* Dark Slate Cards */
      --green: #10B981; /* Cybernetic Emerald */
      --red: #BE123C; /* Synthezoid Velvet Crimson */
      --blue: #38BDF8;
      --anthropic: #F59E0B;

      --gl-label: #F8FAFC !important;
      --gl-secondary: #94A3B8 !important;
      --gl-fill: #161F30 !important;
      --gl-separator: rgba(255, 255, 255, 0.08) !important;
      --gl-control-edge: rgba(245, 158, 11, 0.3) !important;
      --gl-tint: #F59E0B !important;
      --gl-focus: rgba(245, 158, 11, 0.35) !important;
    }

    body {
      background-color: #0B0F19 !important;
      color: #F8FAFC !important;
    }

    .settings-layout {
      background-color: #0B0F19 !important;
    }
    .settings-header {
      background-color: #111827 !important;
      border-bottom: 1px solid #1E293B !important;
    }
    .settings-nav {
      background-color: #0B0F19 !important;
      border-right: 1px solid #1E293B !important;
    }
    .settings-nav-item {
      color: #94A3B8 !important;
    }
    .settings-nav-item:hover {
      background-color: #161F30 !important;
      color: #F8FAFC !important;
    }
    .settings-nav-item.is-active {
      background: linear-gradient(135deg, rgba(159, 18, 57, 0.3) 0%, rgba(245, 158, 11, 0.2) 100%) !important;
      color: #FBBF24 !important;
      border-left: 3px solid #F59E0B !important;
      font-weight: 600 !important;
    }
    .settings-logo-icon {
      background: linear-gradient(135deg, #9F1239 0%, #F59E0B 100%) !important;
      box-shadow: 0 0 14px rgba(245, 158, 11, 0.4) !important;
    }
    .settings-logo-text {
      background: linear-gradient(135deg, #FBBF24 0%, #F59E0B 50%, #E11D48 100%) !important;
      -webkit-background-clip: text !important;
      -webkit-text-fill-color: transparent !important;
      font-weight: 700 !important;
      font-size: 18px !important;
    }
    .settings-card, .gl-card {
      background-color: #111827 !important;
      border: 1px solid #1E293B !important;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4) !important;
    }
    /* Dark theme text boxes, inputs, textareas, and select dropdowns */
    .gl-field,
    .gl-popup,
    .gl-textarea,
    input,
    select,
    textarea {
      background-color: #161F30 !important;
      color: #F8FAFC !important;
      border: 1px solid #1E293B !important;
      box-shadow: 0 0 0 1px #1E293B !important;
    }
    .gl-field::placeholder,
    .gl-textarea::placeholder,
    input::placeholder,
    textarea::placeholder,
    ::-webkit-input-placeholder,
    ::-moz-placeholder {
      color: #64748B !important;
      opacity: 1 !important;
    }
    .gl-field:focus,
    .gl-popup:focus,
    .gl-textarea:focus,
    input:focus,
    select:focus,
    textarea:focus {
      border-color: #F59E0B !important;
      outline: 2px solid rgba(245, 158, 11, 0.3) !important;
      box-shadow: 0 0 0 1px #F59E0B, 0 0 0 4px rgba(245, 158, 11, 0.2) !important;
    }
    select option,
    .gl-popup option {
      background-color: #161F30 !important;
      color: #F8FAFC !important;
    }
    .gl-chip {
      background: #161F30 !important;
      color: #94A3B8 !important;
      border: 1px solid #1E293B !important;
    }
    .gl-chip:hover {
      background: #1E293B !important;
      color: #F8FAFC !important;
    }
    .gl-chip[aria-pressed="true"] {
      background: linear-gradient(135deg, rgba(159, 18, 57, 0.35) 0%, rgba(245, 158, 11, 0.25) 100%) !important;
      color: #FBBF24 !important;
      border-color: #F59E0B !important;
    }
    .gl-chip[aria-pressed="true"] .gl-chip-count {
      color: #FBBF24 !important;
    }
    .gl-kbd {
      background: #161F30 !important;
      color: #F8FAFC !important;
      box-shadow: 0 0 0 1px #1E293B !important;
    }
    .gl-btn {
      background: #161F30 !important;
      color: #F8FAFC !important;
      border: 1px solid #1E293B !important;
    }
    .gl-btn--prominent {
      background: linear-gradient(135deg, #FBBF24 0%, #F59E0B 100%) !important;
      color: #0B0F19 !important;
      font-weight: 600 !important;
      border: none !important;
    }
  </style>
</head>`;

let optionsHtml = fs.readFileSync(path.join(DEST_DIR, 'options.html'), 'utf-8');
optionsHtml = optionsHtml.replace('<title>dassi Settings</title>', '<title>Vision AI Settings</title>');
optionsHtml = optionsHtml.replace('</head>', optionsCssOverride);
fs.writeFileSync(path.join(DEST_DIR, 'options.html'), optionsHtml, 'utf-8');
console.log('[OK] options.html updated with Marvel Vision theme');

// 6. Patch CSS variables directly in panel/main.css and options/options.css
console.log('\n--- Patching CSS files ---');
patchFile(path.join(DEST_DIR, 'panel/main.css'), [
  {
    search: '--color-orange-500:oklch(70.5% .213 47.604);',
    replace: '--color-orange-500:#F59E0B;',
    name: 'Theme orange-500 -> Marvel Vision Solar Gold'
  },
  {
    search: '--primary:oklch(70.5% .191 41.116);',
    replace: '--primary:#F59E0B;',
    name: 'Theme primary -> Marvel Vision Solar Gold'
  },
  {
    search: '--ring:oklch(70.8% .01 50);',
    replace: '--ring:#F59E0B;',
    name: 'Theme ring -> Marvel Vision Solar Gold'
  }
]);

patchFile(path.join(DEST_DIR, 'options/options.css'), [
  {
    search: '--gl-tint: var(--orange);',
    replace: '--gl-tint: #F59E0B;',
    name: 'Options gl-tint -> Solar Gold'
  },
  {
    search: '--primary:oklch(70.5% .191 41.116);',
    replace: '--primary:#F59E0B;',
    name: 'Options primary -> Solar Gold'
  },
  {
    search: '.gl-popup{-webkit-appearance:none;-moz-appearance:none;appearance:none;width:100%;height:28px;padding:0 28px 0 11px;border:0;border-radius:8px;background:#fff;',
    replace: '.gl-popup{-webkit-appearance:none;-moz-appearance:none;appearance:none;width:100%;height:28px;padding:0 28px 0 11px;border:0;border-radius:8px;background:#161F30;',
    name: 'Options gl-popup background -> #161F30'
  },
  {
    search: '.gl-field{width:100%;height:30px;padding:0 10px;border:0;border-radius:8px;background:#fff;',
    replace: '.gl-field{width:100%;height:30px;padding:0 10px;border:0;border-radius:8px;background:#161F30;',
    name: 'Options gl-field background -> #161F30'
  },
  {
    search: '.gl-textarea{width:100%;min-height:160px;padding:10px 12px;border:0;border-radius:10px;background:#fff;',
    replace: '.gl-textarea{width:100%;min-height:160px;padding:10px 12px;border:0;border-radius:10px;background:#161F30;',
    name: 'Options gl-textarea background -> #161F30'
  }
]);

// 7. Patch panel/main.js
console.log('\n--- Patching panel/main.js ---');
patchFile(path.join(DEST_DIR, 'panel/main.js'), [
  // Remove gift / invite friends button from panel toolbar
  {
    search: '(0,dt.jsxs)(VW,{children:[(0,dt.jsx)(KW,{asChild:!0,children:(0,dt.jsx)(eo,{size:"icon-sm",variant:"ghost","aria-label":p("app.inviteFriends"),onClick:uo,className:"rounded-full bg-transparent text-muted-foreground hover:bg-muted/70 dark:hover:bg-muted/20",children:(0,dt.jsx)(OB,{className:"size-4"})})}),(0,dt.jsx)(j3,{side:"bottom",children:p("app.inviteFriends")})]}),',
    replace: '/* inviteFriends button removed */',
    name: 'Remove gift / invite friends button from toolbar'
  },
  // Remove bug report, Discord, and rate Dassi from panel more dropdown
  {
    search: ',(0,dt.jsx)(fUe,{}),(0,dt.jsxs)(W_,{onClick:po,children:[(0,dt.jsx)(b2,{className:"size-4 shrink-0"}),p("app.bugReport")]}),Ge&&(0,dt.jsxs)(W_,{onClick:Qa,children:[(0,dt.jsx)($Gt,{className:"size-4 shrink-0"}),p("app.joinDiscord")]}),(0,dt.jsxs)(W_,{onClick:Jc,children:[(0,dt.jsx)(VB,{className:"size-4 shrink-0"}),p("app.rateDassi")]})',
    replace: '/* bugReport, joinDiscord, rateDassi removed */',
    name: 'Remove bug report, Discord, rate Dassi from dropdown'
  },
  // Bypass Supabase auth check (uvt)
  {
    search: 'async function uvt(){let t=Fd();try{let{data:{session:e}}=await t.auth.getSession();return!!e}catch(e){return console.error("[Auth] Error checking authentication:",e),!1}}',
    replace: 'async function uvt(){return true;}',
    name: 'uvt auth check bypass'
  },
  // Ensure AUTH_CHECK_DONE always returns ready status
  {
    search: 'case"AUTH_CHECK_DONE":return e.isAuthenticated?{status:"ready",pendingMessage:null}:{status:"guest",pendingMessage:null,signInError:null};',
    replace: 'case"AUTH_CHECK_DONE":return{status:"ready",pendingMessage:null};',
    name: 'AUTH_CHECK_DONE reducer'
  },
  // Bypass cloud credit provisioning in rj()
  {
    search: 'async function rj(t){let e=await Ii.getApiConfig();if(e&&e.selectedProvider!=="dassi-managed")return{success:!0};if(e&&dP(e))return{success:!0};let n=await X5e(t);return n.success&&await vae("dassi-managed","user"),n}',
    replace: 'async function rj(t){return{success:!0};}',
    name: 'rj auto provisioning bypass'
  },
  // Set default selectedProvider to google
  {
    search: 'bHe={selectedProvider:"dassi-managed",',
    replace: 'bHe={selectedProvider:"google",',
    name: 'Default provider bHe -> google'
  },
  // Change Exe default parameter
  {
    search: 'function Exe(t="dassi-managed"){return{...bHe,selectedProvider:t}}',
    replace: 'function Exe(t="google"){return{...bHe,selectedProvider:t}}',
    name: 'Exe default parameter -> google'
  },
  // DDn byokAllowed check -> always true
  {
    search: 'async function DDn(){return await gi.get("byokAllowed")===!0}',
    replace: 'async function DDn(){return true;}',
    name: 'DDn byokAllowed -> true'
  },
  // Prevent resetting byokAllowed
  {
    search: 'async function q5t(){await gi.set("byokAllowed",!1)}',
    replace: 'async function q5t(){/* BYOK preserved */}',
    name: 'q5t prevent resetting byokAllowed'
  },
  // Silence signInModal (UWt)
  {
    search: 'function UWt({pendingMessage:t,onSignIn:e,onEmailOtpSend:n,onEmailOtpVerify:r,onEmailOtpBack:i,onCancel:o,isLoading:a,error:s,emailOtpStep:l,otpEmail:c}){',
    replace: 'function UWt(){return null;}function _unused_UWt({pendingMessage:t,onSignIn:e,onEmailOtpSend:n,onEmailOtpVerify:r,onEmailOtpBack:i,onCancel:o,isLoading:a,error:s,emailOtpStep:l,otpEmail:c}){',
    name: 'Silence UWt signInModal'
  },
  // Silence budget/upgrade banner (PWt)
  {
    search: 'function PWt({location:t="panel_budget_banner",credits:e}){',
    replace: 'function PWt(){return null;}function _unused_PWt({location:t="panel_budget_banner",credits:e}){',
    name: 'Silence PWt upgrade banner'
  },
  // Silence trialDenied banner (Mfe)
  {
    search: 'function Mfe(){let{t}=Dt(),[e,n]=(0,PUe.useState)(!1)',
    replace: 'function Mfe(){return null;}function _unused_Mfe(){let{t}=Dt(),[e,n]=(0,PUe.useState)(!1)',
    name: 'Silence Mfe trialDenied banner'
  },
  // Silence BYOK paywall banner (LWt)
  {
    search: 'function LWt(){let{t}=Dt(),[e,n]=(0,Nfe.useState)(!1)',
    replace: 'function LWt(){return null;}function _unused_LWt(){let{t}=Dt(),[e,n]=(0,Nfe.useState)(!1)',
    name: 'Silence LWt paywall banner'
  },
  // Rebrand Toolbar Header Title
  {
    search: 'children:w||"dassi"',
    replace: 'children:w||"Vision AI"',
    name: 'Toolbar header brand -> Vision AI'
  },
  // Rebrand Logo Alt Text
  {
    search: 'alt:"dassi logo"',
    replace: 'alt:"Vision AI logo"',
    name: 'Logo alt text -> Vision AI logo'
  },
  // Rebrand starter badge text
  {
    search: '(0,_u.jsx)("span",{children:"dassi"})',
    replace: '(0,_u.jsx)("span",{children:"Vision AI"})',
    name: 'Starter badge rebrand -> Vision AI'
  },
  // Remove dassi-managed models from panel model dropdown (dWt)
  {
    search: 'function dWt(t,e,n,r,i){let o=t.length>0&&i.includes("dassi-managed"),a=$p.some(u=>n[EUe[u.provider]]&&i.includes(u.provider)),s=o&&a,l=(u,d)=>s?`${u} ${d}`:d,c=[];o&&t.forEach(u=>{c.push({value:u.value,label:l("[dassi]",u.label),vision:u.vision})});for(let u',
    replace: 'function dWt(t,e,n,r,i){let o=!1,a=$p.some(u=>n[EUe[u.provider]]&&i.includes(u.provider)),s=$p.filter(u=>n[EUe[u.provider]]&&i.includes(u.provider)).length>1,l=(u,d)=>s?`${u} ${d}`:d,c=[];for(let u',
    name: 'Remove [Vision] Dassi Flash / Lite from panel models dropdown'
  },
  // Ensure managed model helpers return empty list / google default
  {
    search: 'function pvt(){let t=await x_e();return t?t.models:fvt().models}',
    replace: 'function pvt(){return []}',
    name: 'pvt returns empty managed models'
  },
  {
    search: 'function fvt(){return{models:rbn,defaultModel:Sp}}',
    replace: 'function fvt(){return{models:[],defaultModel:"google:gemini-3.8-flash"}}',
    name: 'fvt returns empty managed models'
  },
  {
    search: 'async function mvt(){let t=await x_e();return t?t.defaultModel:Sp}',
    replace: 'async function mvt(){return "google:gemini-3.8-flash"}',
    name: 'mvt returns google default'
  },
  // Migrate legacy selectedProvider from dassi-managed to google
  {
    search: 'function Ha(t){return t.selectedProvider&&tpe.includes(t.selectedProvider)?t.selectedProvider:kxe(t)}',
    replace: 'function Ha(t){let p=t.selectedProvider&&tpe.includes(t.selectedProvider)?t.selectedProvider:kxe(t);return p==="dassi-managed"?"google":p}',
    name: 'Ha migration -> google'
  },
  {
    search: 'label:"Dassi Flash"',
    replace: 'label:"Vision Flash"',
    name: 'Model label -> Vision Flash'
  },
  {
    search: 'label:"Dassi Lite"',
    replace: 'label:"Vision Lite"',
    name: 'Model label -> Vision Lite'
  },
  {
    search: 'label:"Dassi Pro"',
    replace: 'label:"Vision Pro"',
    name: 'Model label -> Vision Pro'
  },
  {
    search: 'name:"Dassi Managed"',
    replace: 'name:"Vision AI"',
    name: 'Provider name -> Vision AI'
  },
  // Change plan link in panel to models
  {
    search: 'options.html#plan',
    replace: 'options.html#models',
    name: 'Panel options link #plan -> #models'
  },
  {
    search: 'v9t=["Press Shift+Alt+D to open dassi from any tab","Use Shift+Enter to add a new line in your message","dassi can fill forms, click buttons, and navigate pages","Ask dassi to summarize long articles or documents","You can stop any automation by pressing ESC","dassi never stores or shares your personal data \\u2014 privacy comes first"]',
    replace: 'v9t=["Press Shift+Alt+D to open Vision from any tab","Use Shift+Enter to add a new line in your message","Vision AI can fill forms, click buttons, and navigate pages","Ask Vision AI to summarize long articles or documents","You can stop any automation by pressing ESC","Vision AI never stores or shares your personal data \\u2014 privacy comes first"]',
    name: 'Starter screen rotating tips -> Vision AI'
  },
  {
    search: 'desc:"Point Dassi at a Google Doc or Notion page and it drafts the steps for you."',
    replace: 'desc:"Point Vision AI at a Google Doc or Notion page and it drafts the steps for you."',
    name: 'SOP template desc -> Vision AI'
  },
  {
    search: 'children:"Point Dassi at a Google Doc or Notion page \\u2014 run it once, or set it on a schedule',
    replace: 'children:"Point Vision AI at a Google Doc or Notion page \\u2014 run it once, or set it on a schedule',
    name: 'SOP subtitle -> Vision AI'
  },
  {
    search: 'children:"Describe what you want Dassi to do, in your own words \\u2014 it drafts the automation for you."',
    replace: 'children:"Describe what you want Vision AI to do, in your own words \\u2014 it drafts the automation for you."',
    name: 'Custom automation desc -> Vision AI'
  },
  {
    search: 'Connect the doc that holds your playbook \\u2014 Dassi reads it and drafts the automation.',
    replace: 'Connect the doc that holds your playbook \\u2014 Vision AI reads it and drafts the automation.',
    name: 'Playbook desc -> Vision AI'
  },
  {
    search: '`Dassi needs permission to read your ${h.name} document.`',
    replace: '`Vision AI needs permission to read your ${h.name} document.`',
    name: 'Doc permission error -> Vision AI'
  },
  {
    search: '` \\u2014 Dassi will offer it on ${e}`',
    replace: '` \\u2014 Vision AI will offer it on ${e}`',
    name: 'Skill site offer note -> Vision AI'
  },
  {
    search: 'return"Dassi needs site access to record \\u2014 grant it and try again"',
    replace: 'return"Vision AI needs site access to record \\u2014 grant it and try again"',
    name: 'Recording permission error -> Vision AI'
  },
  {
    search: 'or select Dassi managed.',
    replace: 'or select Vision AI managed.',
    name: 'Voice transcription missing key error -> Vision AI'
  },
  {
    search: 'throw new Error("Sign in to Dassi to use voice transcription.")',
    replace: 'throw new Error("Sign in to Vision AI to use voice transcription.")',
    name: 'Voice transcription signin error -> Vision AI'
  },
  {
    search: '# Personalize Dassi',
    replace: '# Personalize Vision AI',
    name: 'Personalize prompt header -> Vision AI'
  },
  {
    search: 'You are welcoming a brand-new Dassi user.',
    replace: 'You are welcoming a brand-new Vision AI user.',
    name: 'Welcome prompt -> Vision AI'
  },
  {
    search: 'browser / Dassi UI language',
    replace: 'browser / Vision AI UI language',
    name: 'Prompt language instruction -> Vision AI'
  },
  {
    search: 'permissions in Dassi',
    replace: 'permissions in Vision AI',
    name: 'Prompt permissions description -> Vision AI'
  }
]);

// Apply translation regex replacements in panel/main.js
patchTranslationValues(path.join(DEST_DIR, 'panel/main.js'));

// 8. Patch background/index.js
console.log('\n--- Patching background/index.js ---');
patchFile(path.join(DEST_DIR, 'background/index.js'), [
  // Tab group title branding -> Vision
  {
    search: 'tabGroups.update(l,{title:"dassi"})',
    replace: 'tabGroups.update(l,{title:"Vision"})',
    name: 'Tab group title -> Vision'
  },
  {
    search: 's.title&&s.title.toLowerCase()!=="dassi"',
    replace: 's.title&&s.title.toLowerCase()!=="vision"',
    name: 'Tab group title check -> vision'
  },
  {
    search: 'tabGroups.update(n,{title:`Dassi \\xB7 ${e.chatName?.trim()||e.chatId}`',
    replace: 'tabGroups.update(n,{title:`Vision \\xB7 ${e.chatName?.trim()||e.chatId}`',
    name: 'Tab group chat title -> Vision'
  },
  // Managed model labels in background
  {
    search: 'label:"Dassi Flash"',
    replace: 'label:"Vision Flash"',
    name: 'Background model label -> Vision Flash'
  },
  {
    search: 'label:"Dassi Lite"',
    replace: 'label:"Vision Lite"',
    name: 'Background model label -> Vision Lite'
  },
  {
    search: 'label:"Dassi Pro"',
    replace: 'label:"Vision Pro"',
    name: 'Background model label -> Vision Pro'
  },
  // Set default selectedProvider to google in $M
  {
    search: '$M={selectedProvider:"dassi-managed",',
    replace: '$M={selectedProvider:"google",',
    name: 'Background default provider $M -> google'
  },
  // Background kue default
  {
    search: 'function kue(t="dassi-managed"){return{...$M,selectedProvider:t}}',
    replace: 'function kue(t="google"){return{...$M,selectedProvider:t}}',
    name: 'Background kue default -> google'
  },
  // vfe byokAllowed check -> always true
  {
    search: 'async function vfe(){return await sn.get("byokAllowed")===!0}',
    replace: 'async function vfe(){return true;}',
    name: 'vfe byokAllowed -> true'
  },
  // g$ prevent resetting byokAllowed
  {
    search: 'async function g$(){await sn.set("byokAllowed",!1)}',
    replace: 'async function g$(){/* BYOK preserved */}',
    name: 'g$ prevent resetting byokAllowed'
  },
  // Ensure default config initialization sets byokAllowed: true
  {
    search: 't.apiConfig||chrome.storage.local.set({apiConfig:$M}',
    replace: 't.apiConfig||chrome.storage.local.set({apiConfig:$M,byokAllowed:true}',
    name: 'M6n initialize byokAllowed: true'
  },
  // Onboarding tab: point to options.html#models instead of dassi.ai
  {
    search: 'chrome.tabs.create({url:SUe})',
    replace: 'chrome.tabs.create({url:chrome.runtime.getURL("options.html#models")})',
    name: 'First install open options.html#models'
  },
  // Disable uninstall telemetry to Dassi Supabase
  {
    search: 'jN().then(n=>{chrome.runtime.setUninstallURL(`https://supabase.dassi.ai/functions/v1/track-uninstall?cid=${encodeURIComponent(n)}`)}).catch(n=>{console.error("[Background] Failed to set uninstall URL with cid:",n),chrome.runtime.setUninstallURL("https://supabase.dassi.ai/functions/v1/track-uninstall")})',
    replace: 'Promise.resolve()',
    name: 'Disable uninstall telemetry to Dassi'
  }
]);

// 9. Patch offscreen/agent-worker.js
console.log('\n--- Patching offscreen/agent-worker.js ---');
patchFile(path.join(DEST_DIR, 'offscreen/agent-worker.js'), [
  // Set default selectedProvider to google in Sst
  {
    search: 'Sst={selectedProvider:"dassi-managed",',
    replace: 'Sst={selectedProvider:"google",',
    name: 'Agent-worker default provider Sst -> google'
  },
  // skn byokAllowed check -> always true
  {
    search: 'async function skn(){return await Ql.get("byokAllowed")===!0}',
    replace: 'async function skn(){return true;}',
    name: 'skn byokAllowed -> true'
  },
  // SXt prevent resetting byokAllowed
  {
    search: 'async function SXt(){await Ql.set("byokAllowed",!1)}',
    replace: 'async function SXt(){/* BYOK preserved */}',
    name: 'SXt prevent resetting byokAllowed'
  },
  {
    search: 'label:"Dassi Flash"',
    replace: 'label:"Vision Flash"',
    name: 'Agent-worker model label -> Vision Flash'
  },
  {
    search: 'label:"Dassi Lite"',
    replace: 'label:"Vision Lite"',
    name: 'Agent-worker model label -> Vision Lite'
  },
  {
    search: 'label:"Dassi Pro"',
    replace: 'label:"Vision Pro"',
    name: 'Agent-worker model label -> Vision Pro'
  }
]);

// 10. Patch options/options.js
console.log('\n--- Patching options/options.js ---');
patchFile(path.join(DEST_DIR, 'options/options.js'), [
  // Remove dassi-managed models from options model dropdown (LZe)
  {
    search: 'function LZe(e,t,n,r,o){let i=e.length>0&&o.includes("dassi-managed"),a=as.some(c=>n[NC[c.provider]]&&o.includes(c.provider)),s=i&&a,l=(c,d)=>s?`${c} ${d}`:d,u=[];i&&e.forEach(c=>{u.push({value:c.value,label:l("[dassi]",c.label),vision:c.vision})});for(let c of as)',
    replace: 'function LZe(e,t,n,r,o){let i=!1,a=as.some(c=>n[NC[c.provider]]&&o.includes(c.provider)),s=as.filter(c=>n[NC[c.provider]]&&o.includes(c.provider)).length>1,l=(c,d)=>s?`${c} ${d}`:d,u=[];for(let c of as)',
    name: 'Remove [Vision] Dassi Flash / Lite from options models dropdown'
  },
  // cde byokAllowed check -> always true
  {
    search: 'async function cde(){return await jn.get("byokAllowed")===!0}',
    replace: 'async function cde(){return true;}',
    name: 'cde byokAllowed -> true'
  },
  // RW prevent resetting byokAllowed
  {
    search: 'async function RW(){await jn.set("byokAllowed",!1)}',
    replace: 'async function RW(){/* BYOK preserved */}',
    name: 'RW prevent resetting byokAllowed'
  },
  // Default tab fallback -> "models" instead of "plan"
  {
    search: 'window.location.hash.slice(1))??"plan"',
    replace: 'window.location.hash.slice(1))??"models"',
    name: 'Options default tab fallback -> models'
  },
  // Always enable providerHandlers (y4) without requiring Supabase user
  {
    search: 'y4=I?{provider:s,byokConnected:d,isSaving:g,onCodexSignIn:Du,onSaveByok:an,onSaveGoogleKey:Pe,onSaveByokProvider:Tn,onSaveSynthEndpoint:Nu,onDisconnect:Xm,onDisconnectProvider:Oe}:null;',
    replace: 'y4={provider:s,byokConnected:d,isSaving:g,onCodexSignIn:Du,onSaveByok:an,onSaveGoogleKey:Pe,onSaveByokProvider:Tn,onSaveSynthEndpoint:Nu,onDisconnect:Xm,onDisconnectProvider:Oe};',
    name: 'Always activate y4 providerHandlers'
  },
  // Initialize local user state so UI renders fully without login
  {
    search: '[I,A]=Ve.useState(null)',
    replace: '[I,A]=Ve.useState({id:"vision-local-user",name:"Vision User",email:"local@vision.ai"})',
    name: 'Default local user state in options'
  },
  // Purge dead tabs (gateway, plan, contact) from navigation cZ
  {
    search: 'cZ=[{id:"general",tabs:["preferences"]},{id:"agent",tabs:["models","automations","skills","plugins","mcp","gateway"]},{id:"knowledge",tabs:["memory","references"]},{id:"account",tabs:["plan","contact"]}]',
    replace: 'cZ=[{id:"general",tabs:["preferences"]},{id:"agent",tabs:["models","automations","skills","plugins","mcp"]},{id:"knowledge",tabs:["memory","references"]}]',
    name: 'Purge dead tabs (gateway, plan, contact) from navigation cZ'
  },
  // Neutralize dead tab router renders (plan, gateway, contact)
  {
    search: 't==="plan"&&(0,Xr.jsx)(eit,{onMessage:w,byokConnected:y4?.byokConnected??null,onGoToModels:()=>i("models"),planSummary:Xe},I?.id??"anon"),',
    replace: '/* plan tab removed */',
    name: 'Neutralize plan tab router'
  },
  {
    search: ',t==="gateway"&&(0,Xr.jsx)(IKe,{}),t==="contact"&&(0,Xr.jsx)(nat,{})',
    replace: '/* gateway and contact tabs removed */',
    name: 'Neutralize gateway and contact tab routers'
  },
  // Remove Developer Options benchmark/eval box from preferences
  {
    search: 'D&&t==="preferences"&&(0,Xr.jsxs)("div",{style:{padding:16,border:"1px solid var(--orange)",borderRadius:8,backgroundColor:"var(--orange-light)"},children:[(0,Xr.jsx)("h3",{style:{fontFamily:"var(--font-mono)",fontSize:13,fontWeight:700,color:"var(--orange)",marginBottom:12},children:"Developer Options"}),(0,Xr.jsx)(Vht,{}),(0,Xr.jsx)("div",{style:{borderTop:"1px solid #ffe0b2",margin:"16px 0"}}),(0,Xr.jsx)(Yht,{}),(0,Xr.jsx)(Jht,{})]}),',
    replace: '/* Developer options removed */',
    name: 'Remove Developer Options box from preferences'
  },
  // Remove CLI bridge integration toggle from preferences
  {
    search: '(0,Gt.jsx)(Qt,{title:c("preferences.section.integrations"),children:(0,Gt.jsx)("div",{className:"gl-card",children:(0,Gt.jsx)(hV,{title:c("preferences.cliBridge"),description:c("preferences.cliBridgeDesc"),checked:o,onChange:i})})}),',
    replace: '/* CLI bridge integration removed */',
    name: 'Remove CLI bridge integration from preferences'
  },
  // Remove broken signout button from settings header
  {
    search: ',(0,zn.jsx)("button",{type:"button",onClick:i,className:"settings-header-signout","aria-label":a("common.signOut"),children:(0,zn.jsx)(fhe,{})})',
    replace: '/* signout button removed */',
    name: 'Remove broken signout button from settings header'
  },
  // Header logo bracket icon branding: [d] -> [V]
  {
    search: 'className:"settings-logo-d",children:"d"',
    replace: 'className:"settings-logo-d",children:"V"',
    name: 'Settings header logo icon [d] -> [V]'
  },
  // Header logo branding
  {
    search: '(0,zn.jsx)("span",{className:"settings-logo-text",children:"dassi"})',
    replace: '(0,zn.jsx)("span",{className:"settings-logo-text",children:"Vision AI"})',
    name: 'Settings header logo rebrand -> Vision AI'
  },
  // Model labels in options
  {
    search: 'label:"Dassi Flash"',
    replace: 'label:"Vision Flash"',
    name: 'Options model label -> Vision Flash'
  },
  {
    search: 'label:"Dassi Lite"',
    replace: 'label:"Vision Lite"',
    name: 'Options model label -> Vision Lite'
  },
  {
    search: 'label:"Dassi Pro"',
    replace: 'label:"Vision Pro"',
    name: 'Options model label -> Vision Pro'
  },
  // Options user-facing descriptions
  {
    search: 'Make Dassi yours.',
    replace: 'Make Vision yours.',
    name: 'Personalization title -> Make Vision yours.'
  },
  {
    search: 'Personalize Dassi',
    replace: 'Personalize Vision',
    name: 'Personalization action -> Personalize Vision'
  },
  {
    search: 'children:"dassi MCP"',
    replace: 'children:"Vision AI MCP"',
    name: 'MCP title -> Vision AI MCP'
  },
  {
    search: 'children:"Run Dassi from ChatGPT, Claude and other AI apps.',
    replace: 'children:"Run Vision AI from ChatGPT, Claude and other AI apps.',
    name: 'MCP run hint'
  },
  {
    search: 'Next, add Dassi in your AI app and approve access with the same Dassi account you use here.',
    replace: 'Next, add Vision AI in your AI app and approve access with the same Vision AI account you use here.',
    name: 'MCP next hint'
  },
  {
    search: 'Connect Model Context Protocol servers. Dassi calls their tools from its code tool by default; set ',
    replace: 'Connect Model Context Protocol servers. Vision AI calls their tools from its code tool by default; set ',
    name: 'MCP servers description'
  },
  {
    search: 'pi. Dassi connects to streamable HTTP servers.',
    replace: 'pi. Vision AI connects to streamable HTTP servers.',
    name: 'MCP HTTP connection'
  },
  {
    search: 'Keep Chrome open and signed in to Dassi.',
    replace: 'Keep Chrome open and signed in to Vision AI.',
    name: 'MCP keep open hint'
  },
  {
    search: 'throw new Error("Sign in to Dassi first")',
    replace: 'throw new Error("Sign in to Vision AI first")',
    name: 'MCP sign in first error'
  },
  {
    search: 'Text @dassi_ai_bot from your phone to send Dassi tasks. Connecting here makes this Chrome profile run them.',
    replace: 'Text @vision_ai_bot from your phone to send Vision AI tasks. Connecting here makes this Chrome profile run them.',
    name: 'Telegram subtitle'
  },
  {
    search: 'to @dassi_ai_bot. The code expires in 5 minutes.',
    replace: 'to @vision_ai_bot. The code expires in 5 minutes.',
    name: 'Telegram bot code hint'
  },
  {
    search: '`Dassi ${e.device_extension_version}`',
    replace: '`Vision AI ${e.device_extension_version}`',
    name: 'Device extension version label'
  },
  {
    search: 'children:"Dassi managed (default)"',
    replace: 'children:"Vision AI managed (default)"',
    name: 'Voice transcription default option'
  },
  {
    search: 'Dassi managed includes 30 minutes daily.',
    replace: 'Vision AI includes 30 minutes daily.',
    name: 'Voice transcription daily quota'
  },
  {
    search: 'children:"Ask Dassi to change\\u2026"',
    replace: 'children:"Ask Vision AI to change\\u2026"',
    name: 'Plugins ask action'
  },
  {
    search: 'throw new Error("Open Dassi and ask to change this plugin.")',
    replace: 'throw new Error("Open Vision AI and ask to change this plugin.")',
    name: 'Plugins error'
  },
  {
    search: '"Could not open Dassi."',
    replace: '"Could not open Vision AI."',
    name: 'Plugins catch'
  },
  {
    search: 'children:"Plugins add capabilities to Dassi."',
    replace: 'children:"Plugins add capabilities to Vision AI."',
    name: 'Plugins subtitle'
  },
  {
    search: 'display:"r/dassi"',
    replace: 'display:"Vision AI Community"',
    name: 'Reddit display'
  },
  {
    search: 'https://www.reddit.com/r/dassi/',
    replace: 'https://github.com/Virat-Ghatge/vision-ai',
    name: 'Reddit URL'
  },
  {
    search: 'children:"Dassi reads this to decide when to use the skill."',
    replace: 'children:"Vision AI reads this to decide when to use the skill."',
    name: 'Skill usage hint'
  },
  {
    search: 'placeholder:"Write the steps Dassi should follow\\u2026"',
    replace: 'placeholder:"Write the steps Vision AI should follow\\u2026"',
    name: 'Skill steps placeholder'
  },
  {
    search: 'hint:"Dassi always reads the description. It reads the instructions only when it uses this skill."',
    replace: 'hint:"Vision AI always reads the description. It reads the instructions only when it uses this skill."',
    name: 'Skill size hint'
  },
  {
    search: 'children:"Sign in to Dassi to share with your team."',
    replace: 'children:"Sign in to Vision AI to share with your team."',
    name: 'Team share hint'
  },
  {
    search: 'children:"Use the password for your existing Dassi account."',
    replace: 'children:"Use the password for your existing Vision AI account."',
    name: 'Auth password hint'
  },
  {
    search: 'Sign in to your previous Dassi account or view plans.',
    replace: 'Sign in to your previous Vision AI account or view plans.',
    name: 'Trial claimed hint'
  },
  {
    search: '"Dassi credits unavailable."',
    replace: '"Vision AI credits unavailable."',
    name: 'Unavailable credits error'
  },
  {
    search: 'HJt="https://dassi.ai/cli/"',
    replace: 'HJt="https://github.com/Virat-Ghatge/vision-ai"',
    name: 'CLI link'
  },
  {
    search: '`dassi-debug-logs-${Wun(i.exportTime??new Date().toISOString())}.json`',
    replace: '`vision-debug-logs-${Wun(i.exportTime??new Date().toISOString())}.json`',
    name: 'Debug logs filename'
  },
  {
    search: 'support@dassi.ai',
    replace: 'support@vision.ai',
    name: 'Support email'
  },
  {
    search: 'weihao@dassi.ai',
    replace: 'local@vision.ai',
    name: 'Preview user email'
  },
  {
    search: 'API key for dassi managed credits',
    replace: 'API key for Vision AI credits',
    name: 'Typebox virtualKey docstring'
  },
  {
    search: 'Model for dassi managed credits',
    replace: 'Model for Vision AI credits',
    name: 'Typebox model docstring'
  },
  {
    search: 'Pass null for Dassi managed.',
    replace: 'Pass null for Vision AI default.',
    name: 'Typebox transcription docstring'
  }
]);

// Apply translation regex replacements in options/options.js
patchTranslationValues(path.join(DEST_DIR, 'options/options.js'));

// 11. Patch offscreen/main.js
console.log('\n--- Patching offscreen/main.js ---');
patchFile(path.join(DEST_DIR, 'offscreen/main.js'), [
  {
    search: 'label:"Dassi Flash"',
    replace: 'label:"Vision Flash"',
    name: 'Offscreen main model label -> Vision Flash'
  },
  {
    search: 'label:"Dassi Lite"',
    replace: 'label:"Vision Lite"',
    name: 'Offscreen main model label -> Vision Lite'
  },
  {
    search: 'label:"Dassi Pro"',
    replace: 'label:"Vision Pro"',
    name: 'Offscreen main model label -> Vision Pro'
  }
]);

// 12. Patch content scripts: suggestions-widget.js & neon-overlay.js
console.log('\n--- Patching content scripts ---');
patchFile(path.join(DEST_DIR, 'content/suggestions-widget.js'), [
  {
    search: 'l.alt="dassi"',
    replace: 'l.alt="Vision AI"',
    name: 'Suggestions widget img alt'
  },
  {
    search: 'createTextNode("dassi can help")',
    replace: 'createTextNode("Vision can help")',
    name: 'Suggestions widget text'
  },
  {
    search: 'e.title="dassi has suggestions"',
    replace: 'e.title="Vision has suggestions"',
    name: 'Suggestions widget title'
  }
]);

patchFile(path.join(DEST_DIR, 'content/neon-overlay.js'), [
  {
    search: '--dassi-orange: oklch(0.705 0.191 41.116);',
    replace: '--dassi-orange: #F59E0B;',
    name: 'Neon overlay laser/cursor color -> Marvel Vision Solar Gold'
  },
  {
    search: 'let oe="dassi is controlling your browser";',
    replace: 'let oe="Vision is controlling your browser";',
    name: 'Neon overlay banner text -> Vision is controlling your browser'
  },
  {
    search: 'E.alt="dassi"',
    replace: 'E.alt="Vision"',
    name: 'Neon overlay reminder icon alt -> Vision'
  }
]);

// 13. Patch HTML & standalone files
console.log('\n--- Patching HTML & standalone files ---');
patchFile(path.join(DEST_DIR, 'microphone.html'), [
  {
    search: '<title>Enable Dassi microphone</title>',
    replace: '<title>Enable Vision microphone</title>',
    name: 'Microphone title'
  },
  {
    search: 'Dassi will start recording your voice',
    replace: 'Vision will start recording your voice',
    name: 'Microphone recording description'
  }
]);

patchFile(path.join(DEST_DIR, 'microphone/main.js'), [
  {
    search: 'start recording in Dassi',
    replace: 'start recording in Vision',
    name: 'Microphone main script record description'
  }
]);

patchFile(path.join(DEST_DIR, 'preview.html'), [
  {
    search: '<title>dassi — Preview</title>',
    replace: '<title>Vision AI — Preview</title>',
    name: 'Preview title'
  }
]);

patchFile(path.join(DEST_DIR, 'preview/main.js'), [
  {
    search: '<h1>dassi</h1>',
    replace: '<h1>Vision AI</h1>',
    name: 'Preview header brand -> Vision AI'
  },
  {
    search: ' \\u2014 dassi`',
    replace: ' \\u2014 Vision AI`',
    name: 'Preview title brand -> Vision AI'
  },
  {
    search: ':"In Dassi"',
    replace: ':"In Vision AI"',
    name: 'Preview folder location note -> In Vision AI'
  },
  {
    search: '// Dassi Chrome Extension v0.95.0',
    replace: '// Vision AI Chrome Extension',
    name: 'Preview banner comment'
  }
]);

patchFile(path.join(DEST_DIR, 'background/index.js'), [
  {
    search: '// Dassi Chrome Extension v0.95.0',
    replace: '// Vision AI Chrome Extension',
    name: 'Background banner comment'
  }
]);

patchFile(path.join(DEST_DIR, 'sandbox/bootstrap.js'), [
  {
    search: '// Dassi Chrome Extension v0.95.0',
    replace: '// Vision AI Chrome Extension',
    name: 'Sandbox banner comment'
  }
]);

// 14. Sync to .output/chrome-mv3 as well
console.log('\n--- Syncing to .output/chrome-mv3 ---');
if (fs.existsSync(OUTPUT_DIR)) {
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
}
copyDir(DEST_DIR, OUTPUT_DIR);
console.log('[OK] Synced to', OUTPUT_DIR);

// 15. Run syntax validation on all built JS files
console.log('\n--- Running Syntax Validation ---');
import('node:child_process').then(({ execSync }) => {
  const checkFiles = [
    path.join(DEST_DIR, 'panel/main.js'),
    path.join(DEST_DIR, 'background/index.js'),
    path.join(DEST_DIR, 'offscreen/agent-worker.js'),
    path.join(DEST_DIR, 'offscreen/main.js'),
    path.join(DEST_DIR, 'options/options.js'),
    path.join(DEST_DIR, 'content/neon-overlay.js'),
    path.join(DEST_DIR, 'content/suggestions-widget.js')
  ];

  for (const f of checkFiles) {
    try {
      execSync(`node -c "${f}"`);
      console.log(`[PASS] Syntax valid: ${f}`);
    } catch (err) {
      console.error(`[FAIL] Syntax error in ${f}:`, err.message);
      process.exit(1);
    }
  }

  console.log('\n=== Build Complete: Vision AI (Marvel Vision Theme & Free BYOK Clone) is Ready! ===');
  console.log(`Unpacked extension ready at:`);
  console.log(`  1. ${path.resolve(DEST_DIR)}`);
  console.log(`  2. ${path.resolve(OUTPUT_DIR)}`);
});
