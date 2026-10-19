// Dassi Chrome Extension v0.95.0
// © 2026 Omnify Labs. All rights reserved.
// Unauthorized copying or distribution is strictly prohibited.
if(typeof WorkerGlobalScope!=="undefined"&&self instanceof WorkerGlobalScope&&typeof globalThis.chrome==="undefined"){
  globalThis.chrome={runtime:{id:"pending-shim"}};
}
if(typeof globalThis.process==="undefined"){
  globalThis.process={env:{},versions:{},platform:"",arch:"",version:""};
}

var e=document.querySelector("#allow"),o=document.querySelector("#settings"),n=document.querySelector("#status");async function s(){e.disabled=!0,e.hidden=!0,o.hidden=!1,n.textContent="Choose Allow in the separate Chrome microphone prompt. If your computer also asks, allow Chrome to use the microphone. No prompt? Choose Open microphone settings.";try{let t=await navigator.mediaDevices.getUserMedia({audio:!0});for(let i of t.getTracks())i.stop()}catch(t){n.textContent=t instanceof DOMException&&t.name==="NotAllowedError"?"Microphone access was blocked. Allow access in microphone settings, then try again. If needed, allow Chrome in your system microphone settings too.":"Chrome could not open your microphone. Check that a microphone is connected and available, then try again.",e.disabled=!1,e.hidden=!1,o.hidden=!1;return}n.textContent="Microphone ready. You can close this window to start recording in Vision.",o.hidden=!0;let r=await chrome.tabs.getCurrent().catch(()=>{});r?.id!==void 0&&await chrome.tabs.remove(r.id).catch(()=>{})}e.addEventListener("click",()=>{s()});o.addEventListener("click",()=>{chrome.tabs.create({url:`chrome://settings/content/siteDetails?site=${encodeURIComponent(chrome.runtime.getURL(""))}`}).catch(()=>{n.textContent="Open Chrome settings \u2192 Privacy and security \u2192 Site settings \u2192 Microphone to allow access."})});s();
