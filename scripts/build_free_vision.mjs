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
console.log('Copying base files from', SRC_DIR, 'to', DEST_DIR);
if (fs.existsSync(DEST_DIR)) {
  fs.rmSync(DEST_DIR, { recursive: true, force: true });
}
copyDir(SRC_DIR, DEST_DIR);

// Helper for exact replacement with validation
function patchFile(filePath, replacements) {
  let content = fs.readFileSync(filePath, 'utf-8');
  for (const { search, replace, name } of replacements) {
    if (typeof search === 'string') {
      if (!content.includes(search)) {
        console.warn(`[WARN] Target not found for: ${name} in ${filePath}`);
        continue;
      }
      content = content.replace(search, replace);
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

// Helper to replace translations in dictionary objects
function patchTranslationValues(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let count = 0;
  for (let i = 0; i < 3; i++) {
    content = content.replace(/("[\w.-]+"\s*:\s*)"([^"]*?)\bDassi\b([^"]*?)"/g, (match, prefix, before, after) => {
      count++;
      return `${prefix}"${before}Vision AI${after}"`;
    });
    content = content.replace(/("[\w.-]+"\s*:\s*)"([^"]*?)\bdassi\b([^"]*?)"/g, (match, prefix, before, after) => {
      count++;
      return `${prefix}"${before}Vision AI${after}"`;
    });
  }
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`[OK] Replaced ${count} translation dictionary occurrences of Dassi in ${path.basename(filePath)}`);
}

// 2. Patch manifest.json
console.log('\n--- Patching manifest.json ---');
const manifestPath = path.join(DEST_DIR, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
manifest.name = 'Vision AI — Free Autonomous Browser Agent';
manifest.short_name = 'Vision AI';
manifest.description = 'Autonomous Chrome browser agent powered by your own API keys (Gemini, Groq, OpenRouter, Anthropic, OpenAI, Ollama). Completely free to use.';
manifest.action.default_title = 'Open Vision AI';
if (manifest.commands && manifest.commands['toggle-dictation']) {
  manifest.commands['toggle-dictation'].description = 'Start or stop voice dictation in Vision AI';
}
manifest.minimum_chrome_version = '120';
delete manifest.update_url;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
console.log('[OK] manifest.json updated');

// 3. Patch _locales/en/messages.json
console.log('\n--- Patching _locales/en/messages.json ---');
const messagesPath = path.join(DEST_DIR, '_locales/en/messages.json');
const messages = {
  appDescription: {
    message: 'Free autonomous AI agent for your browser. Automates tasks on any site using your own API keys (Gemini, Groq, OpenRouter, Claude, GPT, Ollama).'
  },
  appName: {
    message: 'Vision AI — Autonomous Browser Agent (Free BYOK)'
  },
  appShortName: {
    message: 'Vision AI'
  },
  openDassi: {
    message: 'Open Vision AI side panel'
  },
  openDassiSidepanel: {
    message: 'Open Vision AI side panel'
  },
  stopRunningAgent: {
    message: 'Stop the running agent'
  }
};
fs.writeFileSync(messagesPath, JSON.stringify(messages, null, 3), 'utf-8');
console.log('[OK] messages.json updated');

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
    .gl-field, input, select, textarea {
      background-color: #161F30 !important;
      color: #F8FAFC !important;
      border: 1px solid #1E293B !important;
    }
    .gl-field:focus, input:focus, select:focus, textarea:focus {
      border-color: #F59E0B !important;
      outline: 2px solid rgba(245, 158, 11, 0.3) !important;
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
  }
]);

// 7. Patch panel/main.js
console.log('\n--- Patching panel/main.js ---');
patchFile(path.join(DEST_DIR, 'panel/main.js'), [
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
  // Rebrand model selector labels
  {
    search: 'label:l("[dassi]",u.label)',
    replace: 'label:l("[Vision]",u.label)',
    name: 'Model pill bracket label [dassi] -> [Vision]'
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
  }
]);

// Apply translation regex replacements in panel/main.js
patchTranslationValues(path.join(DEST_DIR, 'panel/main.js'));

// 8. Patch background/index.js
console.log('\n--- Patching background/index.js ---');
patchFile(path.join(DEST_DIR, 'background/index.js'), [
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
  }
]);

// 10. Patch options/options.js
console.log('\n--- Patching options/options.js ---');
patchFile(path.join(DEST_DIR, 'options/options.js'), [
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
  // Remove "plan" tab from navigation cZ
  {
    search: '{id:"account",tabs:["plan","contact"]}',
    replace: '{id:"account",tabs:["contact"]}',
    name: 'Remove plan tab from options navigation'
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
    search: 'Dassi always reads the description.',
    replace: 'Vision AI always reads the description.',
    name: 'Skill description hint'
  },
  {
    search: 'Sign in to Dassi to share with your team.',
    replace: 'Sign in to Vision AI to share with your team.',
    name: 'Team share hint'
  },
  {
    search: 'Sign in to Dassi first',
    replace: 'Sign in to Vision AI first',
    name: 'MCP sign in hint'
  },
  {
    search: 'Run Dassi from ChatGPT, Claude and other AI apps.',
    replace: 'Run Vision AI from ChatGPT, Claude and other AI apps.',
    name: 'MCP run hint'
  },
  {
    search: 'Next, add Dassi in your AI app',
    replace: 'Next, add Vision AI in your AI app',
    name: 'MCP next hint'
  },
  {
    search: 'same Dassi account',
    replace: 'same Vision AI account',
    name: 'MCP account hint'
  },
  {
    search: 'Keep Chrome open and signed in to Dassi.',
    replace: 'Keep Chrome open and signed in to Vision AI.',
    name: 'MCP keep open hint'
  },
  {
    search: 'Things Dassi should always know',
    replace: 'Things Vision AI should always know',
    name: 'Memory hint'
  },
  {
    search: 'Dassi reads this before every task',
    replace: 'Vision AI reads this before every task',
    name: 'Memory task hint'
  },
  {
    search: 'Plugins add new abilities to Dassi.',
    replace: 'Plugins add new abilities to Vision AI.',
    name: 'Plugins hint'
  }
]);

// Apply translation regex replacements in options/options.js
patchTranslationValues(path.join(DEST_DIR, 'options/options.js'));

// 11. Patch content scripts: suggestions-widget.js & neon-overlay.js
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
  }
]);

// 12. Sync to .output/chrome-mv3 as well
console.log('\n--- Syncing to .output/chrome-mv3 ---');
if (fs.existsSync(OUTPUT_DIR)) {
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
}
copyDir(DEST_DIR, OUTPUT_DIR);
console.log('[OK] Synced to', OUTPUT_DIR);

// 13. Run syntax validation on all built JS files
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
