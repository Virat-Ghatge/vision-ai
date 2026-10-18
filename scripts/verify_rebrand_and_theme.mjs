import fs from 'node:fs';
import path from 'node:path';

console.log('=== Verifying Vision AI Rebrand & Marvel Vision Theme ===');

const EXT_DIR = 'vision-ext';

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`[PASS] ${message}`);
}

// 1. Check sidepanel.html
const sidepanel = fs.readFileSync(path.join(EXT_DIR, 'sidepanel.html'), 'utf-8');
assert(sidepanel.includes('<title>Vision AI</title>'), 'Sidepanel title is "Vision AI"');
assert(sidepanel.includes('--background: #0B0F19'), 'Sidepanel theme has Vibranium Void #0B0F19');
assert(sidepanel.includes('--primary: #F59E0B'), 'Sidepanel theme has Solar Mind Stone Gold #F59E0B');
assert(sidepanel.includes('.chat-toolbar-brand'), 'Sidepanel has glowing brand title styling');
assert(sidepanel.includes('starter-background-card'), 'Sidepanel has Marvel Vision starter card styling');

// 2. Check options.html
const options = fs.readFileSync(path.join(EXT_DIR, 'options.html'), 'utf-8');
assert(options.includes('<title>Vision AI Settings</title>'), 'Options title is "Vision AI Settings"');
assert(options.includes('--orange: #F59E0B;'), 'Options has Solar Gold --orange');
assert(options.includes('--gray-100: #0B0F19;'), 'Options has Vibranium Obsidian body background');
assert(options.includes('settings-logo-icon'), 'Options has Marvel Vision logo styling');

// 3. Check panel/main.js
const panelJs = fs.readFileSync(path.join(EXT_DIR, 'panel/main.js'), 'utf-8');
assert(panelJs.includes('children:w||"Vision AI"'), 'Panel header toolbar renders "Vision AI"');
assert(panelJs.includes('alt:"Vision AI logo"'), 'Panel logo alt text is "Vision AI logo"');
assert(panelJs.includes('(0,_u.jsx)("span",{children:"Vision AI"})'), 'Starter badge text is "Vision AI"');
assert(panelJs.includes('label:l("[Vision]",u.label)'), 'Model bracket label is "[Vision]"');
assert(panelJs.includes('label:"Vision Flash"'), 'Model label is "Vision Flash"');
assert(panelJs.includes('Rate Vision AI'), 'Translations replaced: contains "Rate Vision AI"');
assert(!panelJs.includes('"Rate dassi"'), 'Translations replaced: does NOT contain "Rate dassi"');

// 4. Check options/options.js
const optJs = fs.readFileSync(path.join(EXT_DIR, 'options/options.js'), 'utf-8');
assert(optJs.includes('className:"settings-logo-d",children:"V"'), 'Options logo icon is [V]');
assert(optJs.includes('className:"settings-logo-text",children:"Vision AI"'), 'Options logo text is "Vision AI"');
assert(optJs.includes('Make Vision yours.'), 'Options personalization title is "Make Vision yours."');
assert(optJs.includes('Personalize Vision'), 'Options personalization button is "Personalize Vision"');
assert(optJs.includes('Vision AI always reads the description.'), 'Options skill description is Vision AI');
assert(optJs.includes('Sign in to Vision AI to share with your team.'), 'Options team share is Vision AI');

// 5. Check content scripts
const widgetJs = fs.readFileSync(path.join(EXT_DIR, 'content/suggestions-widget.js'), 'utf-8');
assert(widgetJs.includes('l.alt="Vision AI"'), 'Suggestions widget alt is "Vision AI"');
assert(widgetJs.includes('createTextNode("Vision can help")'), 'Suggestions widget text is "Vision can help"');

const neonJs = fs.readFileSync(path.join(EXT_DIR, 'content/neon-overlay.js'), 'utf-8');
assert(neonJs.includes('--dassi-orange: #F59E0B;'), 'Neon overlay laser/cursor is Marvel Vision Solar Gold #F59E0B');

// 6. Check icon128.png
assert(fs.existsSync(path.join(EXT_DIR, 'assets/icon128.png')), 'Marvel Vision icon128.png exists');
const iconStat = fs.statSync(path.join(EXT_DIR, 'assets/icon128.png'));
assert(iconStat.size > 20000, `Icon file size is valid (${iconStat.size} bytes)`);

console.log('\n>>> ALL REBRAND & MARVEL VISION THEME CHECKS PASSED! <<<');
