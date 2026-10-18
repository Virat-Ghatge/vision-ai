import fs from 'node:fs';
import path from 'node:path';

const SRC_DIR = 'targets/dassi-ext';
const DEST_DIR = 'vision-ext';
const OUTPUT_DIR = '.output/chrome-mv3';

console.log('=== Building Free Vision AI (Dassi BYOK Clone) ===');

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

// 2. Patch manifest.json
console.log('\n--- Patching manifest.json ---');
const manifestPath = path.join(DEST_DIR, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
manifest.name = 'Vision AI — Free Autonomous Browser Agent';
manifest.short_name = 'Vision AI';
manifest.description = 'Autonomous Chrome browser agent powered by your own API keys (Gemini, Groq, OpenRouter, Anthropic, OpenAI, Ollama). Completely free to use.';
manifest.action.default_title = 'Open Vision AI';
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

// 4. Patch sidepanel.html & options.html
console.log('\n--- Patching HTML titles ---');
patchFile(path.join(DEST_DIR, 'sidepanel.html'), [
  { search: '<title>dassi</title>', replace: '<title>Vision AI</title>', name: 'Sidepanel Title' }
]);
patchFile(path.join(DEST_DIR, 'options.html'), [
  { search: '<title>dassi Settings</title>', replace: '<title>Vision AI Settings</title>', name: 'Options Title' }
]);

// 5. Patch panel/main.js
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
    search: 'function rj(t){let e=await Ii.getApiConfig();if(e&&e.selectedProvider!=="dassi-managed")return{success:!0};if(e&&dP(e))return{success:!0};let n=await X5e(t);return n.success&&await vae("dassi-managed","user"),n}',
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
  // Rebrand starter badge text
  {
    search: '(0,_u.jsx)("span",{children:"dassi"})',
    replace: '(0,_u.jsx)("span",{children:"Vision AI"})',
    name: 'Starter badge rebrand -> Vision AI'
  },
  // Change plan link in panel to models
  {
    search: 'options.html#plan',
    replace: 'options.html#models',
    name: 'Panel options link #plan -> #models'
  }
]);

// 6. Patch background/index.js
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

// 7. Patch offscreen/agent-worker.js
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

// 8. Patch options/options.js
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
  // Header logo branding
  {
    search: '(0,zn.jsx)("span",{className:"settings-logo-text",children:"dassi"})',
    replace: '(0,zn.jsx)("span",{className:"settings-logo-text",children:"Vision AI"})',
    name: 'Settings header logo rebrand -> Vision AI'
  }
]);

// 9. Sync to .output/chrome-mv3 as well
console.log('\n--- Syncing to .output/chrome-mv3 ---');
if (fs.existsSync(OUTPUT_DIR)) {
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
}
copyDir(DEST_DIR, OUTPUT_DIR);
console.log('[OK] Synced to', OUTPUT_DIR);

console.log('\n=== Build Complete: Vision AI (Free Dassi BYOK Clone) is Ready! ===');
console.log(`Unpacked extension ready at:`);
console.log(`  1. ${path.resolve(DEST_DIR)}`);
console.log(`  2. ${path.resolve(OUTPUT_DIR)}`);
