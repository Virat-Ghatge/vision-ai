// Dassi Chrome Extension v0.95.0
// © 2026 Omnify Labs. All rights reserved.
// Unauthorized copying or distribution is strictly prohibited.
if(typeof WorkerGlobalScope!=="undefined"&&self instanceof WorkerGlobalScope&&typeof globalThis.chrome==="undefined"){
  globalThis.chrome={runtime:{id:"pending-shim"}};
}
if(typeof globalThis.process==="undefined"){
  globalThis.process={env:{},versions:{},platform:"",arch:"",version:""};
}

"use strict";(()=>{var F=[{code:"en",label:"English"},{code:"es",label:"Espa\xF1ol"},{code:"ja",label:"\u65E5\u672C\u8A9E"},{code:"ko",label:"\uD55C\uAD6D\uC5B4"},{code:"zh-CN",label:"\u7B80\u4F53\u4E2D\u6587"},{code:"fr",label:"Fran\xE7ais"},{code:"de",label:"Deutsch"},{code:"ru",label:"\u0420\u0443\u0441\u0441\u043A\u0438\u0439"},{code:"ar",label:"\u0627\u0644\u0639\u0631\u0628\u064A\u0629"}],Z=F.map(o=>o.code),K=[{id:"general",tabs:["preferences"]},{id:"agent",tabs:["models","automations","skills","plugins","mcp","gateway"]},{id:"knowledge",tabs:["memory","references"]},{id:"account",tabs:["plan","contact"]}],ee=K.flatMap(o=>[...o.tabs]);var H="https://supabase.dassi.ai",b=`${H}/functions/v1`,X=`${b}/gateway-mcp`;var V={"dassi-managed":"dassi",openai:"openai","openai-codex":"codex",anthropic:"anthropic",google:"google",deepseek:"deepseek",openrouter:"openrouter",moonshotai:"moonshotai",xai:"xai",groq:"groq",mistral:"mistral",custom:"custom",novita:"novita",azure:"azure"},Ae=Object.fromEntries(Object.entries(V).map(([o,a])=>[a,o]));var fe=300*1e3,f=604800;var N="https://app.dassi.ai",xe=`${N}/connect`,Te=`${N}/installed`;var z="data-dassi-ui",R=`[${z}]`,w=`@media print {
  ${R}, :host(${R}) { display: none !important; }
}`;var j="debug:contentLog";function _(o,...a){try{chrome.runtime.sendMessage({type:j,level:o,args:a})}catch{}}if(window.__DASSI_SUGGESTIONS_WIDGET_LOADED__===!0)console.log("[SuggestionsWidget] Already loaded, skipping");else{let L=function(e){return!(e.startsWith("chrome://")||e.startsWith("chrome-extension://")||e.startsWith("about:")||e.startsWith("devtools://")||e.startsWith("edge://")||window.locationbar&&!window.locationbar.visible)},S=function(){console.log("[SuggestionsWidget] hideWidget called, widgetElement:",!!t),c=!0,t&&t.classList.add("hidden")},I=function(){if(G(),t){let e=t.querySelector(".dassi-widget-panel");e?(e.classList.add("closing"),setTimeout(()=>{t?.remove(),r?.remove()},150)):(t.remove(),r?.remove())}},d=function(){if(t){if(t.innerHTML="",c||i.length===0){t.classList.add("hidden");return}if(t.classList.remove("hidden"),m){let e=document.createElement("div");e.className="dassi-widget-panel";let s=document.createElement("div");s.className="dassi-widget-header";let n=document.createElement("div");n.className="dassi-widget-title";let l=document.createElement("img");l.src=C,l.alt="dassi",n.appendChild(l),n.appendChild(document.createTextNode("dassi can help"));let g=document.createElement("button");g.className="dassi-widget-close",g.innerHTML="&times;",g.title="Dismiss (won't show for a week)",g.addEventListener("click",p=>{p.stopPropagation(),I()}),s.appendChild(n),s.appendChild(g),e.appendChild(s);let O=document.createElement("div");O.className="dassi-widget-list";for(let p of i){let u=document.createElement("button");u.className="dassi-widget-item";let A=document.createElement("div");A.className="dassi-widget-item-title",A.textContent=p.title,u.appendChild(A),u.addEventListener("click",()=>Y(p)),O.appendChild(u)}e.appendChild(O),t.appendChild(e),e.addEventListener("mouseleave",()=>{m=!1,d()})}else{let e=document.createElement("button");e.className="dassi-widget-trigger",e.textContent="!",e.title="dassi has suggestions",e.addEventListener("mouseenter",()=>{m=!0,d()}),t.appendChild(e)}}};$=L,q=S,J=I,Q=d,window.__DASSI_SUGGESTIONS_WIDGET_LOADED__=!0;let o="dassi_suggestions_dismissed_at",a="dassi_suggestions_debug",x="appConfig",E="dassi_suggestions_enabled",C=chrome.runtime.getURL("assets/icon128.png"),P="#f97316",U="249, 115, 22";async function T(){try{return((await chrome.storage.local.get(x))[x]?.config?.suggestions_cooldown_seconds??f)*1e3}catch{return f*1e3}}let i=[],m=!1,c=!1,t=null,r=null,y=`
    ${w}
    #dassi-suggestions-widget {
      position: fixed;
      bottom: 120px;
      right: 0;
      z-index: 2147483646;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      -webkit-font-smoothing: antialiased;
    }

    #dassi-suggestions-widget * {
      box-sizing: border-box;
    }

    /* Collapsed state - tiny exclamation mark with bounce */
    .dassi-widget-trigger {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      padding: 0;
      background: ${P};
      border: none;
      border-radius: 4px 0 0 4px;
      box-shadow: -1px 1px 4px rgba(0, 0, 0, 0.15);
      cursor: pointer;
      transition: all 0.2s ease;
      font-size: 11px;
      font-weight: 700;
      color: white;
      animation: dassi-bounce-in 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55),
                 dassi-bounce-pulse 4s ease-in-out 0.6s infinite;
    }

    @keyframes dassi-bounce-in {
      0% {
        opacity: 0;
        transform: translateX(20px) scale(0.3);
      }
      50% {
        transform: translateX(-8px) scale(1.1);
      }
      70% {
        transform: translateX(4px) scale(0.95);
      }
      100% {
        opacity: 1;
        transform: translateX(0) scale(1);
      }
    }

    .dassi-widget-trigger:hover {
      width: 22px;
      height: 22px;
      font-size: 13px;
      box-shadow: -2px 2px 8px rgba(${U}, 0.4);
      animation: none; /* Stop bouncing on hover */
    }

    /* Continuous bounce every 4s */
    @keyframes dassi-bounce-pulse {
      0%, 100% {
        transform: translateX(0) scale(1);
      }
      5% {
        transform: translateX(-4px) scale(1.15);
      }
      10% {
        transform: translateX(2px) scale(0.95);
      }
      15% {
        transform: translateX(0) scale(1);
      }
    }

    /* Expanded panel */
    .dassi-widget-panel {
      position: absolute;
      bottom: 0;
      right: 8px;
      width: 300px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
      overflow: hidden;
      animation: dassi-expand 0.2s ease-out;
    }

    @keyframes dassi-expand {
      from { opacity: 0; transform: translateX(10px) scale(0.95); }
      to { opacity: 1; transform: translateX(0) scale(1); }
    }

    .dassi-widget-panel.closing {
      animation: dassi-collapse 0.15s ease-in forwards;
    }

    @keyframes dassi-collapse {
      from { opacity: 1; transform: translateX(0) scale(1); }
      to { opacity: 0; transform: translateX(10px) scale(0.95); }
    }

    .dassi-widget-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 14px;
      border-bottom: 1px solid #e5e7eb;
    }

    .dassi-widget-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      color: #111827;
      font-size: 14px;
    }

    .dassi-widget-title img {
      width: 20px;
      height: 20px;
    }

    .dassi-widget-close {
      background: none;
      border: none;
      font-size: 18px;
      color: #9ca3af;
      cursor: pointer;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      transition: all 0.15s;
    }

    .dassi-widget-close:hover {
      background: #fee2e2;
      color: #dc2626;
    }

    .dassi-widget-list {
      padding: 8px;
      max-height: 300px;
      overflow-y: auto;
    }

    .dassi-widget-item {
      width: 100%;
      padding: 12px;
      margin-bottom: 6px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      text-align: left;
      cursor: pointer;
      transition: all 0.15s;
      animation: dassi-item-in 0.2s ease-out backwards;
    }

    .dassi-widget-item:nth-child(1) { animation-delay: 0.05s; }
    .dassi-widget-item:nth-child(2) { animation-delay: 0.1s; }
    .dassi-widget-item:nth-child(3) { animation-delay: 0.15s; }

    .dassi-widget-item:last-child {
      margin-bottom: 0;
    }

    .dassi-widget-item:hover {
      background: #f3f4f6;
      border-color: #6366f1;
      transform: translateX(-2px);
    }

    .dassi-widget-item:active {
      transform: scale(0.98);
    }

    @keyframes dassi-item-in {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .dassi-widget-item-title {
      font-weight: 500;
      color: #111827;
      font-size: 13px;
      margin-bottom: 3px;
    }

    .dassi-widget-item-desc {
      font-size: 12px;
      color: #6b7280;
      line-height: 1.4;
    }

    /* Hidden state */
    #dassi-suggestions-widget.hidden {
      display: none;
    }

    /* Loading state */
    .dassi-widget-loading {
      padding: 20px;
      text-align: center;
      color: #6b7280;
    }

    .dassi-spinner {
      width: 24px;
      height: 24px;
      border: 3px solid #e5e7eb;
      border-top-color: #6366f1;
      border-radius: 50%;
      animation: dassi-spin 0.8s linear infinite;
      margin: 0 auto 8px;
    }

    @keyframes dassi-spin {
      to { transform: rotate(360deg); }
    }
  `;async function M(){let s=(await chrome.storage.local.get([o]))[o];if(!s||typeof s!="number")return!1;let n=Date.now()-s,l=await T();return n<l}async function G(){chrome.storage.local.set({[o]:Date.now()});let s=await T()/1e3;console.log(`[SuggestionsWidget] Cooldown started for ${s} seconds`)}async function v(){try{let e=await chrome.runtime.sendMessage({type:"fetchSuggestions",url:window.location.href});return e?.success&&e.suggestions?.length>0?e.suggestions:[]}catch(e){return console.error("[SuggestionsWidget] Fetch error:",e),_("error","[SuggestionsWidget] Fetch error:",String(e)),[]}}async function Y(e){console.log("[SuggestionsWidget] Executing:",e.title);try{await chrome.runtime.sendMessage({type:"executeSuggestion",prompt:e.prompt})}catch(s){console.error("[SuggestionsWidget] Execute error:",s),_("error","[SuggestionsWidget] Execute error:",String(s))}}async function B(){try{let e=await chrome.storage.local.get(E);return typeof e[E]!="boolean"?!1:e[E]}catch{return!1}}async function h(){try{let e=await chrome.runtime.sendMessage({type:"isSidepanelActive"});return console.log("[SuggestionsWidget] Sidepanel active:",e?.active),e?.active===!0}catch(e){return console.error("[SuggestionsWidget] isSidepanelActive error:",e),!1}}async function W(){try{return(await chrome.storage.local.get(a))[a]===!0}catch{return!1}}async function k(){if(!L(window.location.href)){console.log("[SuggestionsWidget] Invalid URL, skipping");return}if(!await B()){console.log("[SuggestionsWidget] Disabled in options, skipping");return}if(await W())console.log("[SuggestionsWidget] Debug mode enabled");else if(await M()){console.log("[SuggestionsWidget] In cooldown period, skipping");return}if(r=document.createElement("style"),r.id="dassi-suggestions-widget-styles",r.textContent=y,document.head.appendChild(r),t=document.createElement("div"),t.id="dassi-suggestions-widget",t.setAttribute("aria-hidden","true"),t.setAttribute("data-dassi-ui","true"),t.classList.add("hidden"),document.body.appendChild(t),console.log("[SuggestionsWidget] Fetching suggestions silently..."),i=await v(),i.length>0){if(console.log(`[SuggestionsWidget] Got ${i.length} suggestions`),await h()){console.log("[SuggestionsWidget] Sidepanel is active, not showing widget"),c=!0;return}d()}else console.log("[SuggestionsWidget] No suggestions available")}chrome.runtime.onMessage.addListener((e,s,n)=>(e?.type==="hideWidget"?(console.log("[SuggestionsWidget] Hiding widget"),S(),n({success:!0})):e?.type==="showWidget"&&(console.log("[SuggestionsWidget] Showing widget (sidepanel closed)"),c=!1,i.length>0&&d(),n({success:!0})),!1)),document.addEventListener("visibilitychange",async()=>{if(document.visibilityState==="visible"&&i.length>0){let e=await h();console.log(`[SuggestionsWidget] Tab visible, sidepanel active: ${e}`),e?S():(c=!1,d())}});let D=()=>{k().catch(e=>{console.error("[SuggestionsWidget] Init failed:",e),_("error","[SuggestionsWidget] Init failed:",String(e))})};document.readyState==="loading"?document.addEventListener("DOMContentLoaded",D):D(),console.debug("[SuggestionsWidget] Content script loaded"),_("debug","[SuggestionsWidget] Content script loaded")}var $,q,J,Q;})();
