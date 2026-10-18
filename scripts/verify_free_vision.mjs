import fs from 'node:fs';

const panel = fs.readFileSync('vision-ext/panel/main.js', 'utf-8');
const bg = fs.readFileSync('vision-ext/background/index.js', 'utf-8');
const worker = fs.readFileSync('vision-ext/offscreen/agent-worker.js', 'utf-8');
const options = fs.readFileSync('vision-ext/options/options.js', 'utf-8');

console.log('=== Verifying Free Vision AI (Dassi BYOK Clone) ===\n');

const checks = [
  {
    name: 'Panel: uvt() returns true',
    pass: panel.includes('async function uvt(){return true;}')
  },
  {
    name: 'Panel: AUTH_CHECK_DONE sets ready status',
    pass: panel.includes('case"AUTH_CHECK_DONE":return{status:"ready",pendingMessage:null};')
  },
  {
    name: 'Panel: rj() bypass returns success',
    pass: panel.includes('async function rj(t){return{success:!0};}')
  },
  {
    name: 'Panel: Default provider bHe is google',
    pass: panel.includes('bHe={selectedProvider:"google",')
  },
  {
    name: 'Panel: DDn() byokAllowed returns true',
    pass: panel.includes('async function DDn(){return true;}')
  },
  {
    name: 'Panel: UWt (signInModal) silenced',
    pass: panel.includes('function UWt(){return null;}')
  },
  {
    name: 'Panel: PWt (budget/upgrade banner) silenced',
    pass: panel.includes('function PWt(){return null;}')
  },
  {
    name: 'Panel: Mfe (trial denied banner) silenced',
    pass: panel.includes('function Mfe(){return null;}')
  },
  {
    name: 'Panel: LWt (BYOK paywall banner) silenced',
    pass: panel.includes('function LWt(){return null;}')
  },
  {
    name: 'Panel: Starter badge branded as Vision AI',
    pass: panel.includes('(0,_u.jsx)("span",{children:"Vision AI"})')
  },
  {
    name: 'Background: Default provider $M is google',
    pass: bg.includes('$M={selectedProvider:"google",')
  },
  {
    name: 'Background: kue() defaults to google',
    pass: bg.includes('function kue(t="google"){return{...$M,selectedProvider:t}}')
  },
  {
    name: 'Background: vfe() byokAllowed returns true',
    pass: bg.includes('async function vfe(){return true;}')
  },
  {
    name: 'Background: M6n() initializes byokAllowed: true',
    pass: bg.includes('byokAllowed:true')
  },
  {
    name: 'Worker: Default provider Sst is google',
    pass: worker.includes('Sst={selectedProvider:"google",')
  },
  {
    name: 'Worker: skn() byokAllowed returns true',
    pass: worker.includes('async function skn(){return true;}')
  },
  {
    name: 'Options: cde() byokAllowed returns true',
    pass: options.includes('async function cde(){return true;}')
  },
  {
    name: 'Options: Default tab fallback is models',
    pass: options.includes('window.location.hash.slice(1))??"models"')
  },
  {
    name: 'Options: y4 providerHandlers always active',
    pass: options.includes('y4={provider:s,byokConnected:d,isSaving:g,')
  },
  {
    name: 'Options: Plan tab removed from navigation',
    pass: options.includes('{id:"account",tabs:["contact"]}')
  },
  {
    name: 'Options: Header logo branded as Vision AI',
    pass: options.includes('(0,zn.jsx)("span",{className:"settings-logo-text",children:"Vision AI"})')
  }
];

let allPassed = true;
for (const check of checks) {
  if (check.pass) {
    console.log(`[PASS] ${check.name}`);
  } else {
    console.error(`[FAIL] ${check.name}`);
    allPassed = false;
  }
}

if (allPassed) {
  console.log('\n>>> ALL 21 VERIFICATION CHECKS PASSED! <<<');
  console.log('Vision AI is 100% free, un-gated, and fully ready for Chrome BYOK automation.');
} else {
  console.error('\n>>> SOME CHECKS FAILED! Inspect above. <<<');
  process.exit(1);
}
