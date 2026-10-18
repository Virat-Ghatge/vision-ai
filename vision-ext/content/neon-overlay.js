// Dassi Chrome Extension v0.95.0
// © 2026 Omnify Labs. All rights reserved.
// Unauthorized copying or distribution is strictly prohibited.
if(typeof WorkerGlobalScope!=="undefined"&&self instanceof WorkerGlobalScope&&typeof globalThis.chrome==="undefined"){
  globalThis.chrome={runtime:{id:"pending-shim"}};
}
if(typeof globalThis.process==="undefined"){
  globalThis.process={env:{},versions:{},platform:"",arch:"",version:""};
}

"use strict";(()=>{var T={grey:"rgb(95, 99, 104)",blue:"rgb(26, 115, 232)",red:"rgb(217, 48, 37)",yellow:"rgb(251, 188, 5)",green:"rgb(30, 142, 62)",pink:"rgb(213, 0, 249)",purple:"rgb(142, 36, 170)",cyan:"rgb(0, 172, 193)",orange:"rgb(255, 111, 0)"};function K(n){console.log(`[GroupColors] Parsing color name: "${n}"`);let t=T[n]||T.cyan;console.log(`[GroupColors] Mapped to base color: ${t} (isKnown: ${!!T[n]})`);let o=t.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);if(!o)return console.warn(`[GroupColors] Failed to parse color: ${t}, using cyan`),{lighter:"rgba(0, 172, 193, 0.2)",light:"rgba(0, 172, 193, 0.4)",medium:"rgba(0, 172, 193, 0.6)",bright:"rgba(0, 172, 193, 0.8)",strong:"rgba(0, 172, 193, 0.8)",strongest:"rgba(0, 172, 193, 1)"};let[,c="0",s="0",g="0"]=o;return re(c,s,g)}function re(n,t,o){return{lighter:`rgba(${n}, ${t}, ${o}, 0.2)`,light:`rgba(${n}, ${t}, ${o}, 0.4)`,medium:`rgba(${n}, ${t}, ${o}, 0.6)`,bright:`rgba(${n}, ${t}, ${o}, 0.8)`,strong:`rgba(${n}, ${t}, ${o}, 0.8)`,strongest:`rgba(${n}, ${t}, ${o}, 1)`}}var x="data-dassi-ui",B=`[${x}]`,j=`@media print {
  ${B}, :host(${B}) { display: none !important; }
}`,W="dassi-neon-overlay-root",q="dassi-neon-overlay",X=["move","press"];function S(n,t={}){let o=document.createElement(n);return o.setAttribute("aria-hidden","true"),o.setAttribute(x,"true"),t.className&&(o.className=t.className),t.interactive||(o.style.pointerEvents="none"),o}var Z=`
    ${j}
    /* Only opacity animates. The glow is two pre-painted layers the compositor
       blends per frame; animating box-shadow instead repaints the full-viewport
       layer 60 times a second in every tab that renders, and focus emulation
       keeps every debugger-attached tab rendering while hidden, so a handful of
       group tabs saturate Chrome's shared GPU process and stall the whole browser. */
    @keyframes neon-breathing {
      0%, 100% { opacity: 0; }
      50% { opacity: 1; }
    }

    #dassi-neon-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      z-index: 2147483647; /* Maximum z-index */
      border: 4px solid var(--neon-color-strong);
      border-radius: 8px;
      box-shadow:
        inset 0 0 20px var(--neon-color-light),
        inset 0 0 40px var(--neon-color-lighter),
        0 0 20px var(--neon-color-medium),
        0 0 40px var(--neon-color-light),
        0 0 60px var(--neon-color-lighter);
      will-change: opacity;
      transition: opacity 0.3s ease-in-out;

      /* Default colors (cyan) - will be overridden by updateNeonOverlayColor */
      --neon-color-lighter: rgba(0, 172, 193, 0.2);
      --neon-color-light: rgba(0, 172, 193, 0.4);
      --neon-color-medium: rgba(0, 172, 193, 0.6);
      --neon-color-bright: rgba(0, 172, 193, 0.8);
      --neon-color-strong: rgba(0, 172, 193, 0.8);
      --neon-color-strongest: rgba(0, 172, 193, 1);
    }

    /* The bright half of the breath: same box as the base layer's border box
       (inset -4px undoes the base border), so both glows land on the same ring,
       and z-index -1 keeps it beneath the corner labels and the Stop reminder. */
    #dassi-neon-overlay::before {
      content: '';
      position: absolute;
      inset: -4px;
      z-index: -1;
      border: 4px solid var(--neon-color-strongest);
      border-radius: 8px;
      box-shadow:
        inset 0 0 30px var(--neon-color-medium),
        inset 0 0 60px var(--neon-color-light),
        0 0 30px var(--neon-color-bright),
        0 0 60px var(--neon-color-medium),
        0 0 90px var(--neon-color-light);
      animation: neon-breathing 3s ease-in-out infinite;
      will-change: opacity;
    }

    #dassi-neon-overlay.hidden {
      opacity: 0;
    }
    #dassi-neon-overlay.hidden::before {
      animation-play-state: paused; /* a hidden overlay must not keep the compositor ticking */
    }

    /* Class toggle for screenshot capture \u2014 hides decorative effects while
       keeping corner coords and cursor visible for agent spatial reasoning.
       Uses a CSS class instead of inline style mutations because Chrome
       permanently cancels CSS animations when animation:'none' is set inline. */
    #dassi-neon-overlay.dassi-screenshot {
      border-color: transparent;
      box-shadow: none;
    }
    #dassi-neon-overlay.dassi-screenshot::before {
      visibility: hidden;
      animation-play-state: paused;
    }
    #dassi-neon-overlay.dassi-screenshot .dassi-bottom-reminder,
    #dassi-neon-overlay.dassi-screenshot .dassi-overlay-corner {
      visibility: hidden;
    }
    #dassi-neon-overlay.dassi-screenshot ~ #dassi-sim-cursor {
      visibility: hidden;
    }

    /* During an agent coordinate gesture, neutralize hit-testing on
       EVERY overlay descendant (the only pointer-events:auto element today is
       the Stop button, but this future-proofs any new interactive element).
       Visibility is untouched, so the human still sees and \u2014 between agent
       gestures \u2014 can click the overlay. Toggled by withOverlayHidden('pointer'). */
    #dassi-neon-overlay.dassi-agent-acting * {
      pointer-events: none !important;
    }

    #dassi-neon-overlay .dassi-overlay-corner {
      position: absolute;
      font: 11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
      color: rgba(255, 255, 255, 0.95);
      background: rgba(0, 0, 0, 0.35);
      padding: 2px 6px;
      border-radius: 4px;
    }

    #dassi-neon-overlay .dassi-overlay-corner.top-left {
      top: 6px;
      left: 6px;
    }

    #dassi-neon-overlay .dassi-overlay-corner.bottom-right {
      right: 6px;
      bottom: 6px;
    }

    #dassi-click-marker {
      position: fixed;
      left: 0;
      top: 0;
      width: 12px;
      height: 12px;
      border-radius: 999px;
      background: rgba(255, 59, 48, 0.9);
      box-shadow: 0 0 0 2px #ffffff;
      transform: translate(-50%, -50%);
      pointer-events: none;
      z-index: 2147483647;
      display: none;
    }

    #dassi-click-marker .dassi-click-marker-label {
      position: absolute;
      left: 14px;
      top: 14px;
      font: 11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
      color: rgba(255, 255, 255, 0.95);
      background: rgba(0, 0, 0, 0.6);
      padding: 2px 6px;
      border-radius: 4px;
      white-space: nowrap;
    }

    /* Pointer shape and click ripple from agent-browser recording-cursor.js,
       in Dassi Orange. CDP input jumps between points, so the pointer glides
       there and the ripple waits out the glide. */
    #dassi-sim-cursor {
      /* Dassi Orange: --primary in styles/globals.css, which this shadow root cannot read. */
      --dassi-orange: oklch(0.705 0.191 41.116);
      --dassi-pointer-glide: 0.15s;
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 2147483647;
      overflow: visible;
      display: none;
    }

    #dassi-sim-cursor .pointer {
      position: fixed;
      top: 0;
      left: 0;
      display: none;
      transition: transform var(--dassi-pointer-glide) ease-out;
    }

    #dassi-sim-cursor svg {
      display: block;
      width: 28px;
      height: 28px;
      overflow: visible;
      transform-origin: 0 0;
      filter:
        drop-shadow(0 0 1px color-mix(in oklch, var(--dassi-orange) 90%, transparent))
        drop-shadow(0 0 4px color-mix(in oklch, var(--dassi-orange) 55%, transparent))
        drop-shadow(0 0 9px color-mix(in oklch, var(--dassi-orange) 30%, transparent));
    }

    #dassi-sim-cursor path {
      fill: white;
      stroke: var(--dassi-orange);
      stroke-width: 1.5;
      stroke-linejoin: round;
    }

    #dassi-sim-cursor .ripple {
      position: fixed;
      width: 64px;
      height: 64px;
      margin: -32px;
      border-radius: 50%;
      border: 2px solid var(--dassi-orange);
      background: color-mix(in oklch, var(--dassi-orange) 50%, transparent);
      box-sizing: border-box;
      animation: dassi-ripple 0.4s linear var(--dassi-pointer-glide) both;
    }

    @keyframes dassi-ripple {
      from { transform: scale(0); opacity: 0.8; }
      to { transform: scale(1); opacity: 0; }
    }

    @media (prefers-reduced-motion: reduce) {
      #dassi-sim-cursor .pointer {
        transition: none;
      }
      #dassi-sim-cursor .ripple {
        display: none;
      }
    }

    #dassi-neon-overlay .dassi-bottom-reminder {
      position: absolute;
      bottom: 32px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(15, 23, 42, 0.85);
      color: rgba(255, 255, 255, 0.95);
      padding: 10px 20px;
      border-radius: 8px;
      font: 13px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      /* backdrop-filter removed to prevent GPU layer crash in React apps */
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.1);
      max-width: 80%;
      text-align: center;
      pointer-events: none;
    }

    #dassi-neon-overlay .dassi-bottom-reminder-icon {
      width: 16px;
      height: 16px;
      margin-right: 8px;
      flex-shrink: 0;
    }

    #dassi-neon-overlay .dassi-bottom-reminder-content {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    #dassi-neon-overlay .dassi-bottom-reminder-text {
      display: flex;
      align-items: center;
    }

    #dassi-neon-overlay .dassi-stop-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 3px;
      padding: 4px 6px;
      background: rgba(239, 68, 68, 0.9);
      color: white;
      border: none;
      border-radius: 4px;
      font: 11px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-weight: 500;
      cursor: pointer;
      pointer-events: auto;
      transition: background 0.15s ease, transform 0.1s ease;
      white-space: nowrap;
    }

    #dassi-neon-overlay .dassi-stop-button:hover {
      background: rgba(220, 38, 38, 1);
    }

    #dassi-neon-overlay .dassi-stop-button:active {
      transform: scale(0.96);
    }

    #dassi-neon-overlay .dassi-stop-button:disabled {
      background: rgba(107, 114, 128, 0.8);
      cursor: not-allowed;
      transform: none;
    }

    #dassi-neon-overlay .dassi-stop-button .dassi-stop-icon {
      width: 8px;
      height: 8px;
      background: white;
      border-radius: 2px;
    }

    @keyframes dassi-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    #dassi-neon-overlay .dassi-stop-button .dassi-spinner {
      width: 10px;
      height: 10px;
      border: 1.5px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: dassi-spin 0.8s linear infinite;
    }

    #dassi-neon-overlay .dassi-kbd {
      display: inline-block;
      padding: 2px 4px;
      margin-left: 4px;
      font: 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
      font-weight: 500;
      text-transform: uppercase;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 3px;
      letter-spacing: 0.3px;
    }
  `;async function se(){return(await chrome.runtime.sendMessage({type:"checkGroupStatus"}))?.shouldShowOverlay===!0}function J(n){let t=null,o=!1;function c(){t=setTimeout(async()=>{t=null;let s;try{s=await se()}catch{if(!o)return;o=!1,n.onOrphaned();return}if(o){if(!s){o=!1,n.onExpired();return}c()}},5e3)}return{start:()=>{o||(o=!0,c())},stop:()=>{o=!1,t!==null&&(clearTimeout(t),t=null)}}}var ie="debug:contentLog";function M(n,...t){try{chrome.runtime.sendMessage({type:ie,level:n,args:t})}catch{}}var Q="http://www.w3.org/2000/svg",ae=new Set(X);function le(n){let t=n;return Number.isFinite(t?.x)&&Number.isFinite(t?.y)&&ae.has(t?.action)}function de(){let n=document.createElementNS(Q,"svg");n.setAttribute("viewBox","0 0 24 24");let t=document.createElementNS(Q,"path");return t.setAttribute("d","M0 0L14 8.5L7.5 10L4 16Z"),n.appendChild(t),n}if(window.__DASSI_OVERLAY_LOADED__===!0)console.log("[NeonOverlay] Script already loaded, skipping initialization");else{let O=function(){if(n){console.debug("[NeonOverlay] Overlay already exists");return}n=document.createElement("div"),n.id=W,n.style.position="fixed",n.style.top="0",n.style.left="0",n.style.right="0",n.style.bottom="0",n.style.zIndex="2147483647",n.style.pointerEvents="none",n.setAttribute("aria-hidden","true"),n.setAttribute(x,"true"),t=n.attachShadow({mode:"open"}),c||(c=document.createElement("style"),c.id="dassi-neon-overlay-styles",c.textContent=Z,t.appendChild(c)),o=S("div"),o.id=q;let e=document.createElement("div");e.className="dassi-overlay-corner top-left",e.textContent="[0, 0]";let r=document.createElement("div");r.className="dassi-overlay-corner bottom-right",h=()=>{r.textContent=`[${window.innerWidth}, ${window.innerHeight}]`},h(),window.addEventListener("resize",h),o.appendChild(e),o.appendChild(r),t.appendChild(o),H(),F(oe),(document.documentElement||document.body).appendChild(n),console.debug("[NeonOverlay] Neon overlay created in Shadow DOM")},$=function(){s||(s=S("div"),s.id="dassi-click-marker",g=document.createElement("div"),g.className="dassi-click-marker-label",s.appendChild(g),t||f(),t.appendChild(s))},N=function(){i||(i=S("div"),i.id="dassi-sim-cursor",p=document.createElement("div"),p.className="pointer",p.appendChild(de()),i.appendChild(p),i.style.display=u?"block":"none",t||f(),t.appendChild(i))},I=function(){u=!0,N(),i&&(i.style.display="block")},D=function(){u=!1,L(),i&&(i.style.display="none")},R=function(e){if(N(),!i||!p||(p.style.display="block",p.style.transform=`translate3d(${e.x}px,${e.y}px,0)`,e.action!=="press"))return;for(let d of i.querySelectorAll(".ripple"))d.remove();let r=document.createElement("div");r.className="ripple",r.style.left=`${e.x}px`,r.style.top=`${e.y}px`,r.addEventListener("animationend",()=>r.remove(),{once:!0}),i.insertBefore(r,p)},L=function(){for(let e of i?.querySelectorAll(".ripple")??[])e.remove();p&&(p.style.display="none")},G=function(e,r){$(),!(!s||!g)&&(s.style.left=`${e.x}px`,s.style.top=`${e.y}px`,g.textContent=r??`[${Math.round(e.x)}, ${Math.round(e.y)}]`,s.style.display="block")},V=function(){s&&(s.style.display="none")},H=function(){m||(o||O(),m=document.createElement("div"),m.className="dassi-bottom-reminder",o?.appendChild(m))},Y=function(){return chrome.runtime.getURL("assets/icon128.png")},y=function(){if(a)if(a.textContent="",b){let e=document.createElement("span");e.className="dassi-spinner",a.appendChild(e),a.appendChild(document.createTextNode("Stopping...")),a.disabled=!0}else{let e=document.createElement("span");e.className="dassi-stop-icon",a.appendChild(e),a.appendChild(document.createTextNode("Stop"));let r=document.createElement("kbd");r.className="dassi-kbd",r.textContent=te,a.appendChild(r),a.disabled=!1}},F=function(e,r){if(!m)return;let d=r||Y();m.textContent="";let l=document.createElement("div");l.className="dassi-bottom-reminder-content";let v=document.createElement("div");v.className="dassi-bottom-reminder-text";let E=document.createElement("img");E.className="dassi-bottom-reminder-icon",E.src=d,E.alt="dassi",v.appendChild(E),v.appendChild(document.createTextNode(e)),a=document.createElement("button"),a.className="dassi-stop-button",a.addEventListener("click",z=>{z.preventDefault(),z.stopPropagation(),ne()}),y(),l.appendChild(v),l.appendChild(a),m.appendChild(l)},_=function(e){if(!o)return;console.log(`[NeonOverlay] Updating color to: "${e}"`);let r=K(e);console.log("[NeonOverlay] Parsed colors:",{lighter:r.lighter,light:r.light,medium:r.medium,bright:r.bright,strong:r.strong,strongest:r.strongest}),o.style.setProperty("--neon-color-lighter",r.lighter),o.style.setProperty("--neon-color-light",r.light),o.style.setProperty("--neon-color-medium",r.medium),o.style.setProperty("--neon-color-bright",r.bright),o.style.setProperty("--neon-color-strong",r.strong),o.style.setProperty("--neon-color-strongest",r.strongest),console.log("[NeonOverlay] CSS variables set successfully")},f=function(){u||(o||O(),o&&(o.classList.remove("hidden"),_(P||"cyan")),I(),b=!1,y(),u=!0,k.start(),console.debug("[NeonOverlay] Overlay activated"))},C=function(e){e&&(P=e),f(),e&&o&&_(e)},A=function(){k.stop(),o&&o.classList.add("hidden"),D(),u=!1,b=!1,h&&(window.removeEventListener("resize",h),h=null),console.debug("[NeonOverlay] Overlay deactivated")},w=function(){k.stop(),L(),n&&(n.remove(),n=null,t=null,console.debug("[NeonOverlay] Shadow host removed")),o=null,c=null,s=null,g=null,i=null,p=null,m=null,a=null,u=!1,b=!1};ce=O,pe=$,ue=N,ge=I,me=D,be=R,he=L,ye=G,fe=V,ve=H,xe=Y,we=y,Ee=F,Se=_,ke=f,Oe=C,Ne=A,Le=w,window.__DASSI_OVERLAY_LOADED__=!0;let n=null,t=null,o=null,c=null,s=null,g=null,i=null,p=null,m=null,a=null,u=!1,b=!1,h=null,P,k=J({onExpired:A,onOrphaned:w});async function ee(e){!u&&!await U()||R(e)}let oe="dassi is controlling your browser";async function ne(){if(!b){b=!0,y(),console.log("[NeonOverlay] Stop button clicked, sending stopFromOverlay message");try{await chrome.runtime.sendMessage({type:"stopFromOverlay"}),console.log("[NeonOverlay] stopFromOverlay message sent successfully")}catch(e){console.error("[NeonOverlay] Failed to send stopFromOverlay message:",e),M("error","[NeonOverlay] Failed to send stopFromOverlay message:",String(e)),b=!1,y()}}}let te=navigator.platform.includes("Mac")?"\u2318\u21E7C":"Ctrl+Shift+C";chrome.runtime.onMessage.addListener((e,r,d)=>{if(typeof e!="object"||e===null)return;let l=e;switch(["showClickMarker"].includes(l.type)&&!u&&f(),l.type){case"ping":d({ready:!0});break;case"showNeonOverlay":C(l.groupColor),d({success:!0});break;case"hideNeonOverlay":A(),d({success:!0});break;case"removeNeonOverlay":w(),d({success:!0});break;case"showClickMarker":l.coordinate&&(G(l.coordinate,l.label),d({success:!0}));break;case"hideClickMarker":V(),d({success:!0});break;case"drawAgentPointer":if(!le(l.landing)){console.debug("[NeonOverlay] Ignoring malformed agent pointer landing:",l.landing),d({success:!1});break}ee(l.landing),d({success:!0});break;default:break}return!1}),window.addEventListener("beforeunload",()=>{w()}),console.debug("[NeonOverlay] Content script loaded"),M("debug","[NeonOverlay] Content script loaded");async function U(){try{let e=await chrome.runtime.sendMessage({type:"checkGroupStatus"});if(e?.shouldShowOverlay){let r=e.groupColor;return console.debug(`[NeonOverlay] Auto-showing overlay (group is active) with color: ${r}`),C(r),!0}console.debug("[NeonOverlay] Not showing overlay (group is not active)")}catch(e){console.debug("[NeonOverlay] Could not check group status:",e)}return!1}U()}var ce,pe,ue,ge,me,be,he,ye,fe,ve,xe,we,Ee,Se,ke,Oe,Ne,Le;})();
