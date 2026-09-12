// Die Seite der Core-Oberfläche: HTML, CSS und JavaScript als Zeichenketten.
//
// Bewusst ohne Framework und ohne Build-Schritt: das npm-Paket bleibt eine
// Datei, und die Seite lädt nichts von fremden Servern (keine Schriften, kein
// CDN) — die strenge CSP in server.ts erlaubt nur die eigene Adresse. Texte
// sind englisch wie der Rest von KEPTA. Inhalte aus der Datenbank werden nur
// als Text eingesetzt (textContent), nie als HTML: eine Notiz, die ein Agent
// geschrieben hat, kann auf der Seite nichts ausführen.

// Das offizielle KEPTA-Logo — dieselbe Datei wie public/kepta-logo.svg in
// KEPTA Enterprise und docs/kepta-logo.svg hier; ein Test hält beide gleich.
export const FAVICON_SVG = `<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
<title>KEPTA — Keeps what matters</title>
<desc>KEPTA wordmark — dark square with a K monogram and a dot</desc>
<rect width="512" height="512" rx="112" fill="#fcfcf9"/>
<rect x="96" y="96" width="320" height="320" rx="72" fill="#0f0f0f"/>
<path d="M176 176 V336 M176 256 L288 176 M176 256 L288 336" stroke="white" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="332" cy="180" r="18" fill="white"/>
</svg>`;

export const SEITE_HTML = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="kepta-token" content="__KEPTA_TOKEN__">
<title>KEPTA Core</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/app.css">
</head>
<body>
<div class="app">
  <aside class="sidebar">
    <div class="brand"><svg class="mark" width="32" height="32" viewBox="0 0 32 32" fill="none" role="img" aria-label="KEPTA"><rect width="32" height="32" rx="9" fill="#0f0f0f"/><path d="M11 9.5 V22.5 M11 16 L18.2 9.5 M11 16 L18.2 22.5" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><circle cx="21.2" cy="9.8" r="1.7" fill="#fff"/></svg><div><div class="brand-name">KEPTA</div><div class="brand-sub">Core __KEPTA_VERSION__</div></div></div>
    <nav id="views" aria-label="Views"></nav>
    <div class="section-label">In KEPTA Enterprise</div>
    <nav class="pro-list" aria-label="Only in KEPTA Enterprise">
      <button class="nav pro" type="button" data-pro="graph"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="8" r="2.5"/><circle cx="10" cy="18" r="2.5"/><path d="M8.4 6.4 15.5 7.6M6.8 8.4l2.4 7.2M16.6 10.1 11.7 16.2"/></svg><span class="nav-label">Knowledge graph</span><svg class="lock-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></button>
      <button class="nav pro" type="button" data-pro="import"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15"/></svg><span class="nav-label">Import &amp; scan</span><svg class="lock-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></button>
      <button class="nav pro" type="button" data-pro="chat"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a7.5 7.5 0 0 1-10.9 6.7L4 20l1.4-4.6A7.5 7.5 0 1 1 20 12Z"/></svg><span class="nav-label">Chat with your memory</span><svg class="lock-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></button>
      <button class="nav pro" type="button" data-pro="duplicates"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 5.5V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h.5"/></svg><span class="nav-label">Duplicate review</span><svg class="lock-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></button>
    </nav>
    <div class="section-label">Tags</div>
    <nav id="tags" aria-label="Tags"></nav>
    <div class="sidebar-foot">
      <button id="lock" class="lock" type="button" title="Encryption and recovery key">Checking encryption…</button>
      <button class="upsell" type="button" data-pro=""><span class="upsell-kicker">KEPTA Enterprise</span><span class="upsell-text">Your memory as a graph, drag &amp; drop import and a chat with it — in a native desktop app.</span></button>
    </div>
  </aside>
  <main class="main">
    <header class="topbar">
      <label class="search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="q" type="search" placeholder="Search your memory  —  press /" autocomplete="off" spellcheck="false" aria-label="Search your memory"></label>
      <button id="new" class="btn primary" type="button">New note</button>
      <button class="btn pro-btn" type="button" data-pro="">✦ Enterprise</button>
      <button id="theme" class="btn icon" type="button" aria-label="Switch between dark and light">◐</button>
    </header>
    <section class="head"><h1 id="heading">All notes</h1><p id="sub" class="muted"></p></section>
    <section id="list" class="list" aria-live="polite"></section>
    <button id="more" class="btn ghost more" type="button" hidden>Load more</button>
  </main>
</div>
<div id="drawer" class="drawer" hidden><div class="drawer-panel" id="panel" role="dialog" aria-modal="true" aria-label="Note"></div></div>
<div id="toast" class="toast" role="status" hidden></div>
<template id="enterprise">
<div class="ent">
  <div class="panel-head"><span class="badge">KEPTA Enterprise</span><button class="btn icon close" type="button" aria-label="Close" data-close>×</button></div>
  <svg class="ent-art" viewBox="0 0 520 200" role="img" aria-label="A knowledge graph: notes as coloured dots, their links as lines">
    <path class="e" d="M260 100 150 60M260 100 170 150M260 100 350 55M260 100 370 150M260 100 222 30M150 60 90 110M90 110 58 42M90 110 120 176M170 150 120 176M350 55 468 40M350 55 440 100M370 150 440 100M440 100 478 162"/>
    <path class="e sim" d="M150 60 222 30M370 150 300 178M170 150 300 178"/>
    <circle class="k1" cx="260" cy="100" r="11"/><circle class="k2" cx="150" cy="60" r="7"/><circle class="k3" cx="170" cy="150" r="7"/><circle class="k4" cx="350" cy="55" r="7"/>
    <circle class="k1" cx="370" cy="150" r="8"/><circle class="k1" cx="90" cy="110" r="6"/><circle class="k2" cx="440" cy="100" r="7"/><circle class="k3" cx="222" cy="30" r="5"/>
    <circle class="k4" cx="300" cy="178" r="5"/><circle class="k4" cx="58" cy="42" r="5"/><circle class="k1" cx="468" cy="40" r="5"/><circle class="k3" cx="478" cy="162" r="6"/><circle class="k2" cx="120" cy="176" r="5"/>
    <text x="278" y="104">Project Atlas</text><text x="128" y="44">Kickoff</text><text x="362" y="44">Staging server</text><text x="384" y="154">Backup schedule</text>
  </svg>
  <h2 class="panel-title">The full desktop app for your memory</h2>
  <p class="ent-lead">KEPTA Enterprise opens this same encrypted file — your notes, your key and your agents are already there. Nothing to move.</p>
  <div class="ent-grid">
    <section data-feature="graph"><h3>Knowledge graph</h3><p>Every note a node, every [[link]] an edge. Force and Tree views, a time slider back to any day, 3 000 nodes at 60 fps.</p></section>
    <section data-feature="import"><h3>Import &amp; scan</h3><p>Drag &amp; drop PDFs, Markdown, text and JSON. Import an Obsidian vault with its links, clip a web page, or scan this computer — with a preview first.</p></section>
    <section data-feature="chat"><h3>Chat with your memory</h3><p>Ask with the model you choose — 20 providers, from Ollama and LM Studio to Anthropic and OpenAI. Every answer shows which notes it used.</p></section>
    <section data-feature="duplicates"><h3>Duplicate review</h3><p>Near-duplicates side by side: keep the richest copy in one click, with one undo for the batch. The history stays.</p></section>
    <section data-feature="app"><h3>A native app</h3><p>macOS, Windows and Linux in a hardened shell, with a command palette (⌘K), focus mode, a setup assistant and a system status that finds local AI by itself.</p></section>
    <section data-feature="trust"><h3>Private by design</h3><p>No account, no telemetry, no cloud. The license key is checked offline — KEPTA never phones home.</p></section>
  </div>
  <div class="ent-trial"><strong>No account, no internet.</strong> One offline license key — for yourself, your practice or your whole team.</div>
  <div class="actions">
    <a class="btn primary" href="https://www.linkedin.com/in/damian-todorovic-244235434" target="_blank" rel="noopener noreferrer">Get KEPTA Enterprise</a>
    <a class="btn" href="https://github.com/DamianTodorovic/kepta#-kepta-enterprise--the-full-desktop-app" target="_blank" rel="noopener noreferrer">Compare Core and Enterprise</a>
  </div>
  <p class="muted small">“Get KEPTA Enterprise” opens LinkedIn: write to Damian Todorovic, who builds KEPTA, for your trial or a license.</p>
</div>
</template>
<script src="/app.js"></script>
</body>
</html>
`;

export const SEITE_CSS = String.raw`
:root{--bg:#0b0b0c;--panel:#121214;--panel2:#19191c;--line:rgba(255,255,255,.08);--text:#f3f2ee;--muted:#9b9a94;--accent:#d8c79c;--accent-ink:#1a1609;--danger:#f09080;--ok:#86d39b;--warn:#e6b35a;--t-semantic:#d8c79c;--t-episodic:#b9a3e2;--t-procedural:#8fd3b1;--t-reference:#9db8e3;--radius:14px;--shadow:0 24px 70px rgba(0,0,0,.5);color-scheme:dark}
[data-theme=light]{--bg:#f7f6f2;--panel:#ffffff;--panel2:#f1efe9;--line:rgba(15,15,15,.09);--text:#141414;--muted:#6b6a64;--accent:#8a6b25;--accent-ink:#ffffff;--danger:#b4432f;--ok:#2f8a4a;--warn:#a86b0c;--t-semantic:#a8841f;--t-episodic:#7b5cc4;--t-procedural:#2f9468;--t-reference:#3f6fb8;--shadow:0 24px 70px rgba(0,0,0,.14);color-scheme:light}
*{box-sizing:border-box}
[hidden]{display:none!important}
html,body{margin:0;height:100%}
body{background:var(--bg);color:var(--text);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
button{font:inherit;color:inherit;cursor:pointer}
.app{display:grid;grid-template-columns:252px 1fr;height:100vh}
.sidebar{border-right:1px solid var(--line);padding:18px 12px;display:flex;flex-direction:column;gap:2px;overflow:auto;background:var(--panel)}
.brand{display:flex;gap:11px;align-items:center;padding:4px 8px 18px}
.brand-name{font-weight:700;letter-spacing:.1em}
.brand-sub{color:var(--muted);font-size:12px}
.section-label{color:var(--muted);font-size:11px;letter-spacing:.14em;text-transform:uppercase;padding:16px 10px 6px}
.nav{display:flex;align-items:center;gap:10px;width:100%;border:0;background:transparent;padding:8px 10px;border-radius:10px;text-align:left}
.nav:hover{background:var(--panel2)}
.nav.active{background:var(--panel2);box-shadow:inset 0 0 0 1px var(--line)}
.nav-label{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.count{color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums}
.dot{width:8px;height:8px;border-radius:50%;background:var(--c,var(--muted));flex:none}
.dot.t-all{background:var(--text)}
.dot.t-trash{background:transparent;box-shadow:inset 0 0 0 1.5px var(--muted)}
.t-semantic{--c:var(--t-semantic)}.t-episodic{--c:var(--t-episodic)}.t-procedural{--c:var(--t-procedural)}.t-reference{--c:var(--t-reference)}
.hash{color:var(--muted);width:8px}
.sidebar-foot{margin-top:auto;display:flex;flex-direction:column;gap:10px;padding:16px 4px 0}
.lock{font-size:12px;padding:9px 11px;border-radius:10px;border:1px solid var(--line);display:flex;align-items:center;gap:8px;background:transparent;width:100%;text-align:left}
.lock:hover{border-color:var(--accent)}
.lock:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.section-title{font-size:15px;margin:22px 0 4px}
.key{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:15px;word-spacing:.4em;background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:14px;line-height:1.8;margin:12px 0;user-select:all;overflow-wrap:anywhere}
.lock::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--warn);flex:none}
.lock.ok::before{background:var(--ok)}
.mark{flex:none}
.upsell{display:flex;flex-direction:column;gap:3px;width:100%;text-align:left;padding:13px;border-radius:12px;background:linear-gradient(135deg,rgba(216,199,156,.18),rgba(157,184,227,.08));border:1px solid rgba(216,199,156,.3)}
.upsell:hover{border-color:var(--accent)}
.upsell:focus-visible,.hint:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.upsell-kicker{color:var(--accent);font-weight:700;font-size:13px}
.upsell-text{color:var(--muted);font-size:12px;line-height:1.45}
.badge{flex:none;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:2px 8px;border-radius:999px;color:var(--accent);border:1px solid rgba(216,199,156,.45);background:rgba(216,199,156,.08)}
.nav.pro{color:var(--muted)}
.nav.pro:hover{color:var(--text)}
.nav.pro svg{flex:none;width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.nav.pro>svg:first-child{margin:0 -4px}
.nav.pro .lock-ico{width:13px;height:13px;opacity:.65}
.pro-btn{color:var(--accent);border-color:rgba(216,199,156,.5)}
.pro-btn:hover{background:rgba(216,199,156,.1)}
a.btn{display:inline-flex;align-items:center;text-decoration:none;color:var(--text)}
.hint{display:flex;align-items:center;gap:10px;width:100%;margin-top:16px;padding:11px 13px;border-radius:12px;border:1px dashed rgba(216,199,156,.45);background:rgba(216,199,156,.05);color:var(--muted);font-size:13px;text-align:left}
.hint:hover{color:var(--text);border-style:solid}
.list .hint{grid-column:1/-1;margin-top:4px}
.ent-art{display:block;width:100%;height:auto;margin:16px 0 6px;border-radius:14px;border:1px solid var(--line);background:radial-gradient(circle at 50% 50%,rgba(216,199,156,.12),transparent 70%),var(--panel2)}
.ent-art .e{fill:none;stroke:rgba(216,199,156,.45);stroke-width:1.4}
.ent-art .sim{stroke-dasharray:4 5;opacity:.75}
.ent-art circle{stroke:var(--panel2);stroke-width:2}
.ent-art .k1{fill:var(--t-semantic)}.ent-art .k2{fill:var(--t-episodic)}.ent-art .k3{fill:var(--t-procedural)}.ent-art .k4{fill:var(--t-reference)}
.ent-art text{fill:var(--muted);font-size:11px}
.ent-lead{font-size:15px;line-height:1.6;margin:0 0 16px}
.ent-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.ent-grid section{background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:12px 14px;transition:border-color .2s ease}
.ent-grid section.focus{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
.ent-grid h3{margin:0 0 4px;font-size:14px}
.ent-grid p{margin:0;color:var(--muted);font-size:13px;line-height:1.5}
.ent-trial{margin-top:14px;padding:12px 14px;border-radius:12px;font-size:13px;line-height:1.5;background:linear-gradient(135deg,rgba(216,199,156,.16),rgba(157,184,227,.08));border:1px solid rgba(216,199,156,.3)}
@media (max-width:560px){.ent-grid{grid-template-columns:1fr}}
.main{overflow:auto;padding:0 30px 44px}
.topbar{position:sticky;top:0;z-index:2;display:flex;gap:10px;align-items:center;padding:16px 0;background:linear-gradient(var(--bg) 72%,transparent)}
.search{flex:1;display:flex;align-items:center;gap:10px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:0 14px;height:46px}
.search:focus-within{border-color:var(--accent)}
.search input{flex:1;border:0;outline:0;background:transparent;color:var(--text);font-size:15px}
.search svg{color:var(--muted);flex:none}
.btn{height:42px;padding:0 16px;border-radius:11px;border:1px solid var(--line);background:var(--panel);font-weight:600;white-space:nowrap}
.btn:hover{background:var(--panel2)}
.btn.primary{background:var(--accent);color:var(--accent-ink);border-color:transparent}
.btn.primary:hover{filter:brightness(1.07)}
.btn.ghost{background:transparent}
.btn.danger{color:var(--danger)}
.btn.icon{width:42px;padding:0;display:grid;place-items:center;font-size:18px}
.btn:focus-visible,.nav:focus-visible,.card:focus-visible,.seg:focus-visible,.tagchip:focus-visible,.wikilink:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.head h1{font-family:ui-serif,"New York",Georgia,serif;font-weight:500;font-size:34px;margin:18px 0 2px;letter-spacing:-.01em}
.muted{color:var(--muted)}.small{font-size:12px}.pad{padding:24px 2px}
.list{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:14px;margin-top:18px}
.card{position:relative;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:16px 16px 14px 19px;cursor:pointer;display:flex;flex-direction:column;gap:8px;min-height:172px;transition:transform .12s ease,border-color .12s ease}
.card::before{content:"";position:absolute;left:0;top:14px;bottom:14px;width:3px;border-radius:3px;background:var(--c,var(--muted))}
.card:hover{transform:translateY(-2px);border-color:rgba(216,199,156,.38)}
.card h3{margin:0;font-size:16px;line-height:1.3}
.excerpt{margin:0;color:var(--muted);flex:1;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.card-top,.card-foot{display:flex;align-items:center;gap:8px}
.card-foot{justify-content:space-between}
.chip{font-size:12px;font-weight:600;color:var(--c)}
.flag{font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid var(--line);color:var(--muted)}
.tags{display:flex;gap:6px;flex-wrap:wrap}
.tagchip{font-size:12px;padding:2px 8px;border-radius:8px;background:var(--panel2);border:1px solid var(--line);color:var(--muted)}
button.tagchip:hover{color:var(--text)}
.score{height:3px;background:var(--panel2);border-radius:3px;overflow:hidden}
.score span{display:block;height:100%;background:var(--accent)}
.more{display:block;margin:22px auto 0}
.empty{grid-column:1/-1;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:30px;max-width:660px}
.empty h2{margin:0 0 6px;font-family:ui-serif,Georgia,serif;font-weight:500;font-size:26px}
.empty pre{background:var(--panel2);padding:14px;border-radius:10px;overflow:auto;font-size:13px}
.row{display:flex;gap:10px;align-items:center}
.row.two>*{flex:1}
.drawer{position:fixed;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;justify-content:flex-end;z-index:10}
.drawer[hidden]{display:none}
.drawer-panel{width:min(580px,100%);height:100%;overflow:auto;background:var(--panel);border-left:1px solid var(--line);padding:22px 28px;box-shadow:var(--shadow);animation:rein .18s ease}
@keyframes rein{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}
.panel-head{display:flex;align-items:center;gap:10px}
.panel-head .close{margin-left:auto}
.panel-title{font-size:27px;line-height:1.2;margin:14px 0 6px}
.validity{color:var(--muted);font-size:13px;margin:0 0 6px}
.content{font-size:15px;line-height:1.65;margin:14px 0 18px;white-space:pre-wrap;overflow-wrap:anywhere}
.content p{margin:0 0 12px}
.wikilink{border:0;background:transparent;padding:0;color:var(--accent);text-decoration:underline;text-underline-offset:3px;font-size:inherit}
.actions{display:flex;gap:10px;margin-top:18px;padding-top:16px;border-top:1px solid var(--line)}
.editor{display:flex;flex-direction:column;gap:14px}
.field{display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--muted)}
.input{width:100%;background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:10px 12px;color:var(--text);font:inherit;font-size:14px}
.input:focus{outline:0;border-color:var(--accent)}
.input.big{font-size:20px;font-weight:600}
textarea.input{resize:vertical;line-height:1.55}
.segmented{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:4px}
.seg{border:0;background:transparent;padding:8px;border-radius:9px;color:var(--muted);font-weight:600}
.seg.on{background:var(--panel);color:var(--text);box-shadow:inset 0 0 0 1px var(--accent)}
.form-error{color:var(--danger);min-height:1em;margin:0;font-size:13px}
.toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:var(--panel);border:1px solid var(--line);padding:10px 16px;border-radius:12px;box-shadow:var(--shadow);z-index:20}
.toast.error{border-color:var(--danger);color:var(--danger)}
@media (max-width:820px){.app{grid-template-columns:1fr}.sidebar{display:none}.main{padding:0 14px 30px}}
`;

export const SEITE_JS = String.raw`
(function () {
  'use strict';
  var TOKEN = document.querySelector('meta[name="kepta-token"]').content;
  var TYPES = { semantic: 'Fact', episodic: 'Event', procedural: 'How-to', reference: 'Document' };
  var VIEWS = [['all', 'All notes'], ['semantic', 'Facts'], ['episodic', 'Events'], ['procedural', 'How-tos'], ['reference', 'Documents'], ['trash', 'Trash']];
  var PAGE = 60;
  var state = { view: 'all', tag: null, query: '', offset: 0, status: null };
  function $(id) { return document.getElementById(id); }

  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'text') el.textContent = v;
      else if (k === 'class') el.className = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(el, x); }); return; }
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }

  function api(path, opts) {
    opts = opts || {};
    var headers = { 'Accept': 'application/json' };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.method && opts.method !== 'GET') headers['X-KEPTA-Token'] = TOKEN;
    return fetch(path, { method: opts.method || 'GET', headers: headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
          return d;
        });
      });
  }

  var rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  function ago(ms) {
    var s = (ms - Date.now()) / 1000;
    var units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
    for (var i = 0; i < units.length; i++) if (Math.abs(s) >= units[i][1]) return rtf.format(Math.round(s / units[i][1]), units[i][0]);
    return 'just now';
  }
  function datum(ms) { return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
  function excerpt(t) {
    var x = t.replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/\s+/g, ' ').trim();
    return x.length > 180 ? x.slice(0, 177) + '…' : x;
  }
  function toast(msg, fehler) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast' + (fehler ? ' error' : '');
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.hidden = true; }, 2800);
  }
  function chip(type) { return h('span', { class: 'chip t-' + type, text: TYPES[type] || type }); }

  // KEPTA Enterprise: what the desktop app adds. It opens from the sidebar, the
  // top bar or a hint that fits the moment — never by itself.
  function enterprise(feature) {
    drawer($('enterprise').content.cloneNode(true));
    var p = $('panel');
    var zu = p.querySelector('[data-close]');
    zu.addEventListener('click', schliessen);
    zu.focus({ preventScroll: true });
    var ziel = feature ? p.querySelector('[data-feature="' + feature + '"]') : null;
    if (ziel) { ziel.classList.add('focus'); ziel.scrollIntoView({ block: 'center' }); }
  }
  function hinweis(text, feature) {
    return h('button', { class: 'hint', type: 'button', onclick: function () { enterprise(feature); } },
      h('span', { class: 'badge', text: 'Enterprise' }), h('span', { text: text }));
  }

  function renderSidebar() {
    var s = state.status;
    if (!s) return;
    var views = $('views');
    views.textContent = '';
    VIEWS.forEach(function (v) {
      var n = v[0] === 'all' ? s.notes.active : v[0] === 'trash' ? s.notes.trashed : (s.types[v[0]] || 0);
      var aktiv = state.view === v[0] && !state.tag && !state.query;
      views.appendChild(h('button', { class: 'nav' + (aktiv ? ' active' : ''), type: 'button', 'aria-current': aktiv ? 'page' : null, onclick: function () { setView(v[0]); } },
        h('span', { class: 'dot t-' + v[0] }), h('span', { class: 'nav-label', text: v[1] }), h('span', { class: 'count', text: String(n) })));
    });
    var tags = $('tags');
    tags.textContent = '';
    if (!s.tags.length) tags.appendChild(h('p', { class: 'muted small pad', text: 'No tags yet.' }));
    s.tags.forEach(function (t) {
      tags.appendChild(h('button', { class: 'nav' + (state.tag === t.tag ? ' active' : ''), type: 'button', onclick: function () { setTag(t.tag); } },
        h('span', { class: 'hash', text: '#' }), h('span', { class: 'nav-label', text: t.tag }), h('span', { class: 'count', text: String(t.count) })));
    });
    var e = s.encryption;
    var lock = $('lock');
    lock.className = 'lock' + (e.aktiv ? ' ok' : '');
    lock.textContent = e.aktiv ? 'Encrypted at rest' : 'Not encrypted';
    lock.title = 'Encryption and recovery key';
  }

  function wo(ablage) {
    if (!ablage) return '';
    if (ablage === 'KEPTA_DB_KEY') return ' Its key comes from the KEPTA_DB_KEY variable.';
    if (ablage === 'Windows DPAPI') return ' Its key is protected by Windows DPAPI.';
    return ' Its key lives in the ' + ablage + '.';
  }
  function gruppen(hex) { return (hex.match(/.{1,8}/g) || []).join(' '); }

  // Encryption and the recovery key: show it once, copy it, keep it in a
  // password manager. Nobody needs it day to day.
  function verschluesselung() {
    var s = state.status;
    if (!s) return;
    var e = s.encryption;
    var feld = h('div');
    function knopf() { return h('button', { class: 'btn', type: 'button', onclick: zeigen }, 'Show recovery key'); }
    function zeigen() {
      api('/api/recovery-key', { method: 'POST', body: {} }).then(function (d) {
        var roh = d.key;
        feld.textContent = '';
        feld.appendChild(h('div', { class: 'key', 'aria-label': 'Recovery key', text: gruppen(roh) }));
        feld.appendChild(h('div', { class: 'row' },
          h('button', { class: 'btn primary', type: 'button', onclick: function () {
            navigator.clipboard.writeText(roh).then(function () { toast('Recovery key copied — paste it into your password manager.'); }, function () { toast('Copying failed — select the key instead.', true); });
          } }, 'Copy'),
          h('button', { class: 'btn ghost', type: 'button', onclick: function () { feld.textContent = ''; feld.appendChild(knopf()); } }, 'Hide')));
      }).catch(function (err) { toast(err.message, true); });
    }
    feld.appendChild(knopf());
    drawer(h('div', {},
      h('div', { class: 'panel-head' }, h('strong', { text: 'Encryption at rest' }),
        h('button', { class: 'btn icon close', type: 'button', 'aria-label': 'Close', onclick: schliessen }, '×')),
      e.aktiv
        ? h('div', {},
            h('p', { class: 'content', text: 'Your knowledge base is encrypted on this computer — SQLCipher 4, AES-256.' + wo(e.ablage) + ' You and your agents never need it: KEPTA fetches the key by itself.' }),
            h('h3', { class: 'section-title', text: 'Recovery key' }),
            h('p', { class: 'muted', text: 'Keep one copy in your password manager. It is the only way to open your knowledge base, or a backup of it, on a new computer. Never share it.' }),
            feld)
        : h('p', { class: 'content', text: e.hinweis || 'The knowledge base file is not encrypted.' })));
  }

  function loadStatus() { return api('/api/status').then(function (s) { state.status = s; renderSidebar(); }); }
  function setView(v) { state.view = v; state.tag = null; state.query = ''; $('q').value = ''; load(true); }
  function setTag(t) { state.tag = state.tag === t ? null : t; state.view = 'all'; state.query = ''; $('q').value = ''; load(true); }

  function heading() {
    if (state.query) return ['Results for “' + state.query + '”', ''];
    if (state.tag) return ['#' + state.tag, 'Notes with this tag'];
    var v = VIEWS.filter(function (x) { return x[0] === state.view; })[0];
    return [v[1], state.view === 'trash' ? 'Deleted notes wait here until you restore them.' : ''];
  }

  function card(note, extra) {
    var abgelaufen = note.validTo && note.validTo < Date.now();
    var c = h('article', { class: 'card t-' + note.type, tabindex: '0', onclick: function () { openNote(note.id); }, onkeydown: function (ev) { if (ev.key === 'Enter') openNote(note.id); } },
      h('div', { class: 'card-top' }, chip(note.type), note.supersededBy ? h('span', { class: 'flag', text: 'Superseded' }) : null, abgelaufen ? h('span', { class: 'flag', text: 'Expired' }) : null),
      h('h3', { text: note.title }),
      h('p', { class: 'excerpt', text: excerpt(note.content) }),
      h('div', { class: 'card-foot' },
        h('div', { class: 'tags' }, note.tags.slice(0, 3).map(function (t) { return h('span', { class: 'tagchip', text: '#' + t }); })),
        h('span', { class: 'muted small', text: ago(note.updatedAt) })));
    if (extra) c.appendChild(extra);
    return c;
  }

  function leer() {
    var snippet = '{\n  "mcpServers": {\n    "kepta": { "command": "npx", "args": ["-y", "kepta-mcp"] }\n  }\n}';
    return h('div', { class: 'empty' },
      h('h2', { text: 'Your memory is empty — for now.' }),
      h('p', { class: 'muted', text: 'Connect an AI agent and it starts remembering. Add this to Claude Desktop, Cursor or any MCP client:' }),
      h('pre', { text: snippet }),
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: function () {
          navigator.clipboard.writeText(snippet).then(function () { toast('Copied.'); }, function () { toast('Copying failed — select the text instead.', true); });
        } }, 'Copy configuration'),
        h('button', { class: 'btn primary', type: 'button', onclick: function () { openEditor(null); } }, 'Write the first note')),
      hinweis('Already have documents? KEPTA Enterprise imports PDFs, Markdown and Obsidian vaults by drag & drop.', 'import'));
  }

  function load(reset) {
    if (reset) state.offset = 0;
    var list = $('list');
    var more = $('more');
    var hd = heading();
    $('heading').textContent = hd[0];
    $('sub').textContent = hd[1];
    renderSidebar();
    if (reset) list.textContent = '';
    if (state.query) {
      more.hidden = true;
      var frage = state.query;
      return api('/api/search?q=' + encodeURIComponent(frage) + '&limit=60').then(function (d) {
        if (frage !== state.query) return;
        list.textContent = '';
        $('sub').textContent = d.total + (d.total === 1 ? ' match' : ' matches') + ' — ranked by relevance';
        if (!d.hits.length) {
          list.appendChild(h('p', { class: 'muted pad', text: 'Nothing found. Try other words — with Ollama running, the search also finds notes that say the same thing differently.' }));
          return;
        }
        var top = d.hits[0].score || 1;
        d.hits.forEach(function (hit) {
          var fill = h('span');
          fill.style.width = Math.max(8, Math.round(hit.score / top * 100)) + '%';
          list.appendChild(card(hit.note, h('div', { class: 'score', title: 'Relevance' }, fill)));
        });
        list.appendChild(hinweis('Ask these notes a question — the chat in KEPTA Enterprise answers from your memory and names its sources.', 'chat'));
      }).catch(function (e) { toast(e.message, true); });
    }
    var pfad = '/api/notes?view=' + state.view + '&offset=' + state.offset + '&limit=' + PAGE + (state.tag ? '&tag=' + encodeURIComponent(state.tag) : '');
    return api(pfad).then(function (d) {
      if (state.offset === 0 && !d.notes.length) {
        list.appendChild(state.view === 'all' && !state.tag ? leer() : h('p', { class: 'muted pad', text: state.view === 'trash' ? 'The trash is empty.' : 'No notes here yet.' }));
      }
      d.notes.forEach(function (n) { list.appendChild(card(n)); });
      state.offset += d.notes.length;
      more.hidden = !d.more;
    }).catch(function (e) { toast(e.message, true); });
  }

  function schliessen() { $('drawer').hidden = true; }
  function drawer(inhalt) {
    var p = $('panel');
    p.textContent = '';
    p.appendChild(inhalt);
    $('drawer').hidden = false;
    var f = p.querySelector('input, textarea, .actions button');
    if (f) f.focus();
  }

  function inhaltMitLinks(text) {
    var box = h('div', { class: 'content' });
    text.split(/\n{2,}/).forEach(function (absatz) {
      var p = h('p');
      var re = /\[\[([^\]]+)\]\]/g;
      var last = 0;
      var m;
      while ((m = re.exec(absatz))) {
        if (m.index > last) p.appendChild(document.createTextNode(absatz.slice(last, m.index)));
        p.appendChild(wikilink(m[1]));
        last = re.lastIndex;
      }
      if (last < absatz.length) p.appendChild(document.createTextNode(absatz.slice(last)));
      box.appendChild(p);
    });
    return box;
  }
  function wikilink(ziel) {
    return h('button', { class: 'wikilink', type: 'button', onclick: function () { schliessen(); $('q').value = ziel; state.query = ziel; state.tag = null; load(true); } }, ziel);
  }

  function openNote(id) {
    api('/api/notes/' + encodeURIComponent(id)).then(function (d) {
      var n = d.note;
      var geloescht = !!n.deletedAt;
      var ziele = {};
      (n.content.match(/\[\[([^\]]+)\]\]/g) || []).forEach(function (m) { ziele[m.slice(2, -2).trim().toLowerCase()] = true; });
      var verweise = Object.keys(ziele).length;
      var gueltig = n.validFrom || n.validTo ? 'Valid ' + (n.validFrom ? 'from ' + datum(n.validFrom) + ' ' : '') + (n.validTo ? 'until ' + datum(n.validTo) : '') : null;
      drawer(h('div', {},
        h('div', { class: 'panel-head' }, chip(n.type), h('span', { class: 'muted small', text: 'Updated ' + ago(n.updatedAt) + ' · created ' + datum(n.createdAt) }),
          h('button', { class: 'btn icon close', type: 'button', 'aria-label': 'Close', onclick: schliessen }, '×')),
        h('h2', { class: 'panel-title', text: n.title }),
        gueltig ? h('p', { class: 'validity', text: gueltig.trim() }) : null,
        n.supersededBy ? h('p', { class: 'validity', text: 'Superseded by a newer note.' }) : null,
        geloescht ? h('p', { class: 'validity', text: 'In the trash since ' + datum(n.deletedAt) + '.' }) : null,
        inhaltMitLinks(n.content),
        n.tags.length ? h('div', { class: 'tags' }, n.tags.map(function (t) { return h('button', { class: 'tagchip', type: 'button', onclick: function () { schliessen(); setTag(t); } }, '#' + t); })) : null,
        verweise && !geloescht ? hinweis('Links to ' + verweise + (verweise === 1 ? ' other note' : ' other notes') + ' — see them as a knowledge graph in KEPTA Enterprise.', 'graph') : null,
        h('div', { class: 'actions' },
          geloescht ? h('button', { class: 'btn primary', type: 'button', onclick: function () { restore(n.id); } }, 'Restore')
            : h('button', { class: 'btn primary', type: 'button', onclick: function () { openEditor(n); } }, 'Edit'),
          geloescht ? null : h('button', { class: 'btn danger', type: 'button', onclick: function () { trash(n); } }, 'Move to trash'))));
    }).catch(function (e) { toast(e.message, true); });
  }

  function dateWert(ms) {
    if (!ms) return '';
    var d = new Date(ms);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  // Our own date field instead of <input type=date>: its placeholder follows the
  // language of the system ("tt.mm.jjjj" on a German Mac), not the page.
  function ausDatum(v) {
    v = v.trim();
    if (!v) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return NaN;
    var t = Date.parse(v + 'T00:00:00');
    return Number.isFinite(t) ? t : NaN;
  }

  function openEditor(n) {
    var typ = n ? n.type : 'semantic';
    var titel = h('input', { class: 'input big', value: n ? n.title : '', placeholder: 'Title', maxlength: '300', 'aria-label': 'Title' });
    var inhalt = h('textarea', { class: 'input', rows: '12', placeholder: 'What should your agents remember? Link other notes with [[their title]].', 'aria-label': 'Content' });
    inhalt.value = n ? n.content : '';
    var tags = h('input', { class: 'input', value: n ? n.tags.join(', ') : '', placeholder: 'Tags, separated by commas', 'aria-label': 'Tags' });
    var von = h('input', { class: 'input', type: 'text', inputmode: 'numeric', placeholder: 'YYYY-MM-DD', value: dateWert(n && n.validFrom), 'aria-label': 'Valid from' });
    var bis = h('input', { class: 'input', type: 'text', inputmode: 'numeric', placeholder: 'YYYY-MM-DD', value: dateWert(n && n.validTo), 'aria-label': 'Valid until' });
    var seg = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Kind of knowledge' });
    Object.keys(TYPES).forEach(function (t) {
      var b = h('button', { type: 'button', class: 'seg' + (t === typ ? ' on' : ''), role: 'radio', 'aria-checked': t === typ ? 'true' : 'false', onclick: function () {
        typ = t;
        Array.prototype.forEach.call(seg.children, function (x) { x.className = 'seg'; x.setAttribute('aria-checked', 'false'); });
        b.className = 'seg on';
        b.setAttribute('aria-checked', 'true');
      } }, TYPES[t]);
      seg.appendChild(b);
    });
    var fehler = h('p', { class: 'form-error', role: 'alert' });
    function speichern(ev) {
      ev.preventDefault();
      var body = {
        title: titel.value.trim(),
        content: inhalt.value.trim(),
        type: typ,
        tags: tags.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean),
        validFrom: ausDatum(von.value),
        validTo: ausDatum(bis.value)
      };
      if (!body.title || !body.content) { fehler.textContent = 'A note needs a title and some content.'; return; }
      if (Number.isNaN(body.validFrom) || Number.isNaN(body.validTo)) { fehler.textContent = 'Write dates like 2026-09-12 — or leave them empty.'; return; }
      if (body.validFrom && body.validTo && body.validTo < body.validFrom) { fehler.textContent = '“Valid until” lies before “valid from”.'; return; }
      api(n ? '/api/notes/' + encodeURIComponent(n.id) : '/api/notes', { method: n ? 'PUT' : 'POST', body: body }).then(function (d) {
        toast(n ? 'Saved.' : 'Note created.');
        return Promise.all([loadStatus(), load(true)]).then(function () { openNote(d.note.id); });
      }).catch(function (e) { fehler.textContent = e.message; });
    }
    drawer(h('form', { class: 'editor', onsubmit: speichern },
      h('div', { class: 'panel-head' }, h('strong', { text: n ? 'Edit note' : 'New note' }),
        h('button', { type: 'button', class: 'btn icon close', 'aria-label': 'Close', onclick: schliessen }, '×')),
      titel,
      h('div', { class: 'field' }, h('span', { text: 'Kind of knowledge' }), seg),
      h('label', { class: 'field' }, h('span', { text: 'Content' }), inhalt),
      h('label', { class: 'field' }, h('span', { text: 'Tags' }), tags),
      h('div', { class: 'row two' }, h('label', { class: 'field' }, h('span', { text: 'Valid from' }), von), h('label', { class: 'field' }, h('span', { text: 'Valid until' }), bis)),
      fehler,
      h('div', { class: 'actions' },
        h('button', { type: 'submit', class: 'btn primary' }, n ? 'Save' : 'Create note'),
        h('button', { type: 'button', class: 'btn ghost', onclick: function () { if (n) openNote(n.id); else schliessen(); } }, 'Cancel'))));
    titel.focus();
  }

  function trash(n) {
    api('/api/notes/' + encodeURIComponent(n.id), { method: 'DELETE' }).then(function () {
      schliessen();
      toast('“' + n.title + '” moved to the trash.');
      return Promise.all([loadStatus(), load(true)]);
    }).catch(function (e) { toast(e.message, true); });
  }
  function restore(id) {
    api('/api/notes/' + encodeURIComponent(id) + '/restore', { method: 'POST', body: {} }).then(function () {
      schliessen();
      toast('Restored.');
      return Promise.all([loadStatus(), load(true)]);
    }).catch(function (e) { toast(e.message, true); });
  }

  function theme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('kepta-core-theme', t); } catch (e) { /* private window */ }
  }
  try { var gemerkt = localStorage.getItem('kepta-core-theme'); if (gemerkt) theme(gemerkt); } catch (e) { /* private window */ }
  $('theme').addEventListener('click', function () { theme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); });

  var timer = null;
  $('q').addEventListener('input', function (ev) {
    clearTimeout(timer);
    var v = ev.target.value.trim();
    timer = setTimeout(function () { state.query = v; state.tag = null; load(true); }, 220);
  });
  $('new').addEventListener('click', function () { openEditor(null); });
  $('lock').addEventListener('click', verschluesselung);
  $('more').addEventListener('click', function () { load(false); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-pro]'), function (b) {
    b.addEventListener('click', function () { enterprise(b.getAttribute('data-pro')); });
  });
  $('drawer').addEventListener('click', function (ev) { if (ev.target === $('drawer')) schliessen(); });
  document.addEventListener('keydown', function (ev) {
    var tippt = /INPUT|TEXTAREA/.test(document.activeElement ? document.activeElement.tagName : '');
    if (ev.key === 'Escape' && !$('drawer').hidden) schliessen();
    else if (ev.key === '/' && !tippt) { ev.preventDefault(); $('q').focus(); }
    else if (ev.key === 'n' && !tippt && $('drawer').hidden) { ev.preventDefault(); openEditor(null); }
  });

  loadStatus().then(function () { load(true); }).catch(function (e) { toast('KEPTA is not reachable: ' + e.message, true); });
})();
`;
