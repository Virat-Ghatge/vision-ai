// Dassi Chrome Extension v0.95.0
// © 2026 Omnify Labs. All rights reserved.
// Unauthorized copying or distribution is strictly prohibited.
if(typeof WorkerGlobalScope!=="undefined"&&self instanceof WorkerGlobalScope&&typeof globalThis.chrome==="undefined"){
  globalThis.chrome={runtime:{id:"pending-shim"}};
}
if(typeof globalThis.process==="undefined"){
  globalThis.process={env:{},versions:{},platform:"",arch:"",version:""};
}

var n=!1;window.addEventListener("message",t=>{if(n||t.source!==window.parent)return;let e=t.data;!e||e.type!=="render-html"||typeof e.html!="string"||(n=!0,document.open(),document.write(e.html),document.close())});
