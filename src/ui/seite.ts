// Die Seite der Core-Oberfläche: HTML, CSS und JavaScript als Zeichenketten.
//
// Bewusst ohne Framework und ohne Build-Schritt: das npm-Paket bleibt eine
// Datei, und die Seite lädt nichts von fremden Servern (keine Schriften, kein
// CDN) — die strenge CSP in server.ts erlaubt nur die eigene Adresse. Texte
// sind englisch wie der Rest von KEPTA. Inhalte aus der Datenbank werden nur
// als Text eingesetzt (textContent), nie als HTML: eine Notiz, die ein Agent
// geschrieben hat, kann auf der Seite nichts ausführen.

// Das offizielle KEPTA-Logo — dieselbe Datei wie public/kepta-logo.svg in
// KEPTA Pro und docs/kepta-logo.svg hier; ein Test hält beide gleich.
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
    <div class="section-label">AI apps</div>
    <nav id="agents" aria-label="AI apps"></nav>
    <div class="section-label">Tags</div>
    <nav id="tags" aria-label="Tags"></nav>
    <div class="sidebar-foot">
      <button id="lock" class="lock" type="button" title="Encryption and recovery key">Checking encryption…</button>
      <button class="quiet-pro" type="button" data-pro="">KEPTA Pro — the desktop app <span aria-hidden="true">›</span></button>
    </div>
  </aside>
  <main class="main">
    <header class="topbar">
      <label class="search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="q" type="search" placeholder="Search your memory  —  press /" autocomplete="off" spellcheck="false" aria-label="Search your memory"></label>
      <button id="new" class="btn primary" type="button">New note</button>
      <button id="theme" class="btn icon" type="button" aria-label="Switch between dark and light">◐</button>
    </header>
    <nav id="mobil" class="mobil" aria-label="Views and AI apps"></nav>
    <section class="head"><h1 id="heading">All notes</h1><p id="sub" class="muted"></p></section>
    <section id="notice" class="notice" hidden></section>
    <section id="list" class="list" aria-live="polite"></section>
    <button id="more" class="btn ghost more" type="button" hidden>Load more</button>
  </main>
</div>
<div id="drawer" class="drawer" hidden><div class="drawer-panel" id="panel" role="dialog" aria-modal="true" aria-label="Note"></div></div>
<div id="toast" class="toast" role="status" hidden></div>
<template id="enterprise">
<div class="ent">
  <div class="panel-head"><span class="badge">KEPTA Pro</span><button class="btn icon close" type="button" aria-label="Close" data-close>×</button></div>
  <svg class="ent-art" viewBox="0 0 520 200" role="img" aria-label="A knowledge graph: notes as coloured dots, their links as lines">
    <path class="e" d="M260 100 150 60M260 100 170 150M260 100 350 55M260 100 370 150M260 100 222 30M150 60 90 110M90 110 58 42M90 110 120 176M170 150 120 176M350 55 468 40M350 55 440 100M370 150 440 100M440 100 478 162"/>
    <path class="e sim" d="M150 60 222 30M370 150 300 178M170 150 300 178"/>
    <circle class="k1" cx="260" cy="100" r="11"/><circle class="k2" cx="150" cy="60" r="7"/><circle class="k3" cx="170" cy="150" r="7"/><circle class="k4" cx="350" cy="55" r="7"/>
    <circle class="k1" cx="370" cy="150" r="8"/><circle class="k1" cx="90" cy="110" r="6"/><circle class="k2" cx="440" cy="100" r="7"/><circle class="k3" cx="222" cy="30" r="5"/>
    <circle class="k4" cx="300" cy="178" r="5"/><circle class="k4" cx="58" cy="42" r="5"/><circle class="k1" cx="468" cy="40" r="5"/><circle class="k3" cx="478" cy="162" r="6"/><circle class="k2" cx="120" cy="176" r="5"/>
    <text x="278" y="104">Project Atlas</text><text x="128" y="44">Kickoff</text><text x="362" y="44">Staging server</text><text x="384" y="154">Backup schedule</text>
  </svg>
  <h2 class="panel-title">The full desktop app for your memory</h2>
  <p class="ent-lead">KEPTA Pro opens this same encrypted file — your notes, your key and your agents are already there. Nothing to move.</p>
  <div class="ent-grid">
    <section data-feature="graph"><h3>Knowledge graph</h3><p>Every note a node, every [[link]] an edge — the core UI draws it read-only: drag a node, click one to open it. Force and Tree views, a time slider back to any day, 3 000 nodes at 60 fps — that lives in KEPTA Pro.</p></section>
    <section data-feature="import"><h3>Import &amp; scan</h3><p>Drag &amp; drop PDFs, Markdown, text and JSON. Import an Obsidian vault with its links, clip a web page, or scan this computer — with a preview first.</p></section>
    <section data-feature="chat"><h3>Chat with your memory</h3><p>Ask with the model you choose — 20 providers, from Ollama and LM Studio to Anthropic and OpenAI. Every answer shows which notes it used.</p></section>
    <section data-feature="duplicates"><h3>Duplicate review</h3><p>Near-duplicates side by side: keep the richest copy in one click, with one undo for the batch. The history stays.</p></section>
    <section data-feature="app"><h3>A native app</h3><p>macOS, Windows and Linux in a hardened shell, with a command palette (⌘K), focus mode, a setup assistant and a system status that finds local AI by itself.</p></section>
    <section data-feature="trust"><h3>Private by design</h3><p>No account, no telemetry, no cloud. The license key is checked offline — KEPTA never phones home.</p></section>
  </div>
  <div class="ent-trial"><strong>No account, no internet.</strong> One offline license key — €120/year for KEPTA Pro, €25/user/month for teams (KEPTA Business), price by agreement for organizations (KEPTA Enterprise).</div>
  <div class="actions">
    <a class="btn primary" href="https://www.linkedin.com/in/damian-todorovic-244235434" target="_blank" rel="noopener noreferrer">Get KEPTA Pro</a>
    <a class="btn" href="https://github.com/DamianTodorovic/kepta#-kepta-pro--the-full-desktop-app" target="_blank" rel="noopener noreferrer">Compare Core and Pro</a>
  </div>
  <p class="muted small">“Get KEPTA Pro” opens LinkedIn: write to Damian Todorovic, who builds KEPTA, for your license.</p>
</div>
</template>
<script src="/app.js"></script>
</body>
</html>
`;

export const SEITE_CSS = String.raw`
:root{--bg:#070708;--panel:#0e0e0f;--panel2:#161617;--line:rgba(255,255,255,.09);--text:#eaeae8;--muted:#9b9992;--accent:#c04a39;--accent-ink:#f7efe7;--danger:#d06a58;--ok:#7fb08a;--warn:#cfa45e;--t-semantic:#96a7bd;--t-episodic:#b08ca4;--t-procedural:#8fb89a;--t-reference:#c2a283;--radius:12px;--shadow:0 14px 40px rgba(0,0,0,.5);color-scheme:dark}
[data-theme=light]{--bg:#e9e9e7;--panel:#f4f4f2;--panel2:#e2e2e0;--line:rgba(20,20,20,.13);--text:#232526;--muted:#5b5e60;--accent:#9c2b1f;--accent-ink:#f7f2e9;--danger:#a03a2c;--ok:#3e6b4f;--warn:#8a5a16;--t-semantic:#3f5a78;--t-episodic:#74455f;--t-procedural:#41604a;--t-reference:#75563c;--shadow:0 12px 32px rgba(20,20,20,.14);color-scheme:light}
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
.section-label{color:var(--muted);font-size:11px;letter-spacing:.02em;font-weight:600;padding:16px 10px 6px}
.nav{display:flex;align-items:center;gap:10px;width:100%;border:0;background:transparent;padding:8px 10px;border-radius:8px;text-align:left}
.nav:hover{background:var(--panel2)}
.nav.active{background:var(--panel2);box-shadow:inset 2.5px 0 0 var(--accent)}
.nav-label{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.count{color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums}
.dot{width:8px;height:8px;border-radius:50%;background:var(--c,var(--muted));flex:none}
.dot.t-all{background:var(--text)}
.dot.t-trash{background:transparent;box-shadow:inset 0 0 0 1.5px var(--muted)}
.t-semantic{--c:var(--t-semantic)}.t-episodic{--c:var(--t-episodic)}.t-procedural{--c:var(--t-procedural)}.t-reference{--c:var(--t-reference)}
.hash{color:var(--muted);width:8px}
.graph-wrap{padding:6px 2px;border:1px solid var(--line);border-radius:12px;background:var(--panel);overflow:hidden}
.graph-wrap canvas{display:block}
.sidebar-foot{margin-top:auto;display:flex;flex-direction:column;gap:10px;padding:16px 4px 0}
.lock{font-size:12px;padding:9px 11px;border-radius:8px;border:1px solid var(--line);display:flex;align-items:center;gap:8px;background:transparent;width:100%;text-align:left}
.lock:hover{border-color:var(--accent)}
.lock:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.section-title{font-size:15px;margin:22px 0 4px}
.key{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:15px;word-spacing:.4em;background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:14px;line-height:1.8;margin:12px 0;user-select:all;overflow-wrap:anywhere}
.lock::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--warn);flex:none}
.lock.ok::before{background:var(--accent)}
.mark{flex:none}
.quiet-pro{border:0;background:transparent;padding:4px 8px;color:var(--muted);font-size:12px;text-align:left}
.quiet-pro:hover{color:var(--text)}
.quiet-pro:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:6px}
.badge{flex:none;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:2px 8px;border-radius:999px;color:var(--accent);border:1px solid color-mix(in srgb,var(--accent) 42%,transparent);background:color-mix(in srgb,var(--accent) 8%,transparent)}
a.btn{display:inline-flex;align-items:center;text-decoration:none;color:var(--text)}
.ent-art{display:block;width:100%;height:auto;margin:16px 0 6px;border-radius:12px;border:1px solid var(--line);background:radial-gradient(circle at 50% 50%,color-mix(in srgb,var(--accent) 12%,transparent),transparent 70%),var(--panel2)}
.ent-art .e{fill:none;stroke:color-mix(in srgb,var(--accent) 46%,transparent);stroke-width:1.4}
.ent-art .sim{stroke-dasharray:4 5;opacity:.75}
.ent-art circle{stroke:var(--panel2);stroke-width:2}
.ent-art .k1{fill:var(--t-semantic)}.ent-art .k2{fill:var(--t-episodic)}.ent-art .k3{fill:var(--t-procedural)}.ent-art .k4{fill:var(--t-reference)}
.ent-art text{fill:var(--muted);font-size:11px}
.ent-lead{font-size:15px;line-height:1.6;margin:0 0 16px}
.ent-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.ent-grid section{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:12px 14px;transition:border-color .2s ease}
.ent-grid section.focus{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
.ent-grid h3{margin:0 0 4px;font-size:14px}
.ent-grid p{margin:0;color:var(--muted);font-size:13px;line-height:1.5}
.ent-trial{margin-top:14px;padding:12px 14px;border-radius:10px;font-size:13px;line-height:1.5;background:color-mix(in srgb,var(--accent) 7%,var(--panel));border:1px solid color-mix(in srgb,var(--accent) 28%,transparent)}
@media (max-width:560px){.ent-grid{grid-template-columns:1fr}}
.main{overflow:auto;padding:0 30px 44px}
.topbar{position:sticky;top:0;z-index:2;display:flex;gap:10px;align-items:center;padding:16px 0;background:linear-gradient(var(--bg) 72%,transparent)}
.search{flex:1;display:flex;align-items:center;gap:10px;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:0 14px;height:46px}
.search:focus-within{border-color:var(--accent)}
.search input{flex:1;border:0;outline:0;background:transparent;color:var(--text);font-size:15px}
.search svg{color:var(--muted);flex:none}
.btn{height:42px;padding:0 16px;border-radius:8px;border:1px solid var(--line);background:var(--panel);font-weight:600;white-space:nowrap}
.btn:hover{background:var(--panel2)}
.btn.primary{background:var(--accent);color:var(--accent-ink);border-color:transparent}
.btn.primary:hover{filter:brightness(1.07)}
.btn.ghost{background:transparent}
.btn.danger{color:var(--danger)}
.btn.icon{width:42px;padding:0;display:grid;place-items:center;font-size:18px}
.btn:focus-visible,.nav:focus-visible,.card:focus-visible,.seg:focus-visible,.tagchip:focus-visible,.wikilink:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.head h1{font-family:Charter,"Iowan Old Style",Palatino,Georgia,serif;font-weight:600;font-size:34px;margin:18px 0 2px;letter-spacing:-.005em}
.muted{color:var(--muted)}.small{font-size:12px}.pad{padding:24px 2px}
.list{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:14px;margin-top:18px}
.card{position:relative;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:16px 16px 14px 19px;cursor:pointer;display:flex;flex-direction:column;gap:8px;min-height:172px;transition:border-color .12s ease,background .12s ease}
.card::before{content:"";position:absolute;left:0;top:14px;bottom:14px;width:3px;border-radius:3px;background:var(--c,var(--muted))}
.card:hover{border-color:color-mix(in srgb,var(--text) 32%,transparent)}
.card h3{margin:0;font-size:16px;line-height:1.3;font-family:Charter,"Iowan Old Style",Palatino,Georgia,serif;font-weight:600}
.excerpt{margin:0;color:var(--muted);flex:1;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.card-top,.card-foot{display:flex;align-items:center;gap:8px}
.card-foot{justify-content:space-between}
.chip{font-size:12px;font-weight:600;color:var(--c)}
.flag{font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid var(--line);color:var(--muted)}
.tags{display:flex;gap:6px;flex-wrap:wrap}
.tagchip{font-size:12px;padding:2px 8px;border-radius:6px;background:var(--panel2);border:1px solid var(--line);color:var(--muted)}
button.tagchip:hover{color:var(--text)}
.score{height:3px;background:var(--panel2);border-radius:3px;overflow:hidden}
.score span{display:block;height:100%;background:var(--accent)}
.more{display:block;margin:22px auto 0}
.empty{grid-column:1/-1;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:30px;max-width:660px}
.empty h2{margin:0 0 6px;font-family:Charter,"Iowan Old Style",Palatino,Georgia,serif;font-weight:600;font-size:26px}
.empty pre{background:var(--panel2);padding:14px;border-radius:10px;overflow:auto;font-size:13px}
.row{display:flex;gap:10px;align-items:center}
.row.two>*{flex:1}
.drawer{position:fixed;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;justify-content:flex-end;z-index:10}
.drawer[hidden]{display:none}
.drawer-panel{width:min(580px,100%);overscroll-behavior:contain;height:100%;overflow:auto;background:var(--panel);border-left:1px solid var(--line);padding:22px 28px;box-shadow:var(--shadow);animation:rein .18s ease}
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
.input{width:100%;background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:10px 12px;color:var(--text);font:inherit;font-size:14px}
.input:focus{outline:0;border-color:var(--accent)}
.input.big{font-size:20px;font-weight:600}
textarea.input{resize:vertical;line-height:1.55}
.segmented{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:4px}
.seg{border:0;background:transparent;padding:8px;border-radius:7px;color:var(--muted);font-weight:600}
.seg.on{background:var(--panel);color:var(--text);box-shadow:inset 0 0 0 1px var(--accent)}
.form-error{color:var(--danger);min-height:1em;margin:0;font-size:13px}
.toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:var(--panel);border:1px solid var(--line);padding:10px 16px;border-radius:10px;box-shadow:var(--shadow);z-index:20}
.toast.error{border-color:var(--danger);color:var(--danger)}
.path{font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:-4px}
.panel-path{margin:0 0 8px}
.excerpt.none{font-style:italic;opacity:.75}
.notice{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:14px;padding:10px 12px 10px 16px;border-radius:10px;border:1px solid var(--line);background:var(--panel);font-size:13px}
.notice span{flex:1;min-width:220px}
.notice .btn{height:32px;padding:0 12px}
.md{white-space:normal}
.md p,.md li,.md td,.md th{white-space:pre-wrap}
.md h3,.md h4,.md h5,.md h6{font-family:Charter,"Iowan Old Style",Palatino,Georgia,serif;font-weight:600;line-height:1.3;margin:22px 0 8px}
.md h3{font-size:21px}.md h4{font-size:18px}.md h5,.md h6{font-size:16px}
.md>:first-child{margin-top:0}
.md code{font:13px ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--panel2);border:1px solid var(--line);border-radius:5px;padding:1px 5px}
.md pre{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:12px 14px;overflow:auto;margin:0 0 14px}
.md pre code{border:0;padding:0;background:none;white-space:pre}
.md hr{border:0;border-top:1px solid var(--line);margin:18px 0}
.md a{color:var(--accent);text-underline-offset:3px;overflow-wrap:anywhere}
.md mark{background:color-mix(in srgb,var(--warn) 30%,transparent);color:inherit;border-radius:3px;padding:0 2px}
.md del{opacity:.6}
.mdlist{list-style:none;padding:0;margin:0 0 12px}
.mdlist li{display:flex;gap:9px;align-items:baseline;margin:3px 0}
.mdlist li.d1{padding-left:22px}.mdlist li.d2{padding-left:44px}.mdlist li.d3{padding-left:66px}
.mdlist .mk{color:var(--muted);min-width:1.1em;text-align:right;font-variant-numeric:tabular-nums;flex:none}
.mdlist input{margin:0;accent-color:var(--accent);flex:none;transform:translateY(2px)}
.mdlist li.done>span{color:var(--muted);text-decoration:line-through}
.md blockquote{margin:0 0 14px;padding:10px 14px;border-left:3px solid var(--line);color:var(--muted)}
.md blockquote.callout{--c:var(--muted);border-radius:0 10px 10px 0;background:var(--panel2);color:var(--text);border-left-color:var(--c)}
.callout.c-info{--c:var(--t-semantic)}.callout.c-ok{--c:var(--ok)}.callout.c-warn{--c:var(--warn)}.callout.c-bad{--c:var(--danger)}
.callout-title{display:block;margin-bottom:4px;color:var(--c)}
.md blockquote>:last-child{margin-bottom:0}
.tablewrap{overflow-x:auto;margin:0 0 14px;border:1px solid var(--line);border-radius:10px}
.md table{border-collapse:collapse;width:100%;font-size:14px;overflow-wrap:normal}
.md th,.md td{padding:7px 11px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
.md th{background:var(--panel2);font-weight:600}
.md tr:last-child td{border-bottom:0}
.ph{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted);border:1px dashed color-mix(in srgb,var(--muted) 60%,transparent);border-radius:5px;padding:0 5px}
.embed{color:var(--muted);border:1px solid var(--line);border-radius:5px;padding:0 6px;font-size:13px}
.mdtag{border:0;background:var(--panel2);color:var(--muted);border-radius:5px;padding:0 5px;font-size:13px}
.mdtag:hover{color:var(--text)}
.mdtag:focus-visible,.md a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.props{display:grid;grid-template-columns:max-content 1fr;gap:4px 14px;margin:12px 0 0;font-size:13px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--panel2)}
.props dt{color:var(--muted)}.props dd{margin:0;overflow-wrap:anywhere}
.source{margin:-6px 0 14px;overflow-wrap:anywhere}
.kinds{width:100%;border-collapse:collapse;margin:8px 0 4px;font-size:14px}
.kinds th,.kinds td{padding:8px 4px;border-bottom:1px solid var(--line);text-align:left}
.kinds th{color:var(--muted);font-weight:600;font-size:12px}
.kinds .n{text-align:right;font-variant-numeric:tabular-nums}
.examples{list-style:none;padding:0;margin:6px 0 0;display:flex;flex-direction:column;gap:8px;font-size:13px}
.examples li{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ex-title{flex:1;min-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ex-move{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.agent-dot{background:var(--muted)}
.agent-dot.live{background:var(--ok);animation:puls 2s infinite}
@keyframes puls{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--ok) 55%,transparent)}70%{box-shadow:0 0 0 6px transparent}100%{box-shadow:0 0 0 0 transparent}}
.dot.t-activity{background:transparent;box-shadow:inset 0 0 0 1.5px var(--ok)}
.nav.connect{color:var(--muted)}
.nav.connect:hover{color:var(--text)}
.plus{width:8px;text-align:center;font-weight:700;line-height:1}
.timeline{grid-column:1/-1;display:flex;flex-direction:column;gap:2px;max-width:760px}
.act{display:flex;gap:12px;align-items:flex-start;padding:10px 12px;border-radius:10px;border:1px solid transparent}
.act:hover{background:var(--panel)}
.act.fresh,.card.fresh{animation:frisch 2.6s ease}
@keyframes frisch{0%{background:color-mix(in srgb,var(--ok) 16%,var(--panel));border-color:color-mix(in srgb,var(--ok) 45%,transparent)}100%{}}
.act-dot{width:8px;height:8px;border-radius:50%;margin-top:7px;flex:none;background:var(--muted)}
.act-dot.t-write{background:var(--accent)}.act-dot.t-search{background:var(--t-semantic)}.act-dot.t-connect{background:var(--ok)}
.act-body{display:flex;flex-direction:column;gap:2px;min-width:0;overflow-wrap:anywhere}
.clients{display:flex;flex-direction:column;gap:8px;margin:6px 0 4px}
.client{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:var(--panel2)}
.client.off{opacity:.55}
.client-name{flex:1;display:flex;flex-direction:column;gap:2px;min-width:150px}
.client-state{font-size:12px;color:var(--muted)}
.client-state.ok{color:var(--ok)}
.client .btn{height:34px;padding:0 14px}
.hint-text{flex-basis:100%;margin:0;overflow-wrap:anywhere}
.meldung{margin:0 0 4px;padding:10px 12px;border-radius:10px;font-size:13px;border:1px solid var(--line)}
.meldung.ok{border-color:color-mix(in srgb,var(--ok) 50%,transparent);color:var(--ok)}
.meldung.fehler{border-color:color-mix(in srgb,var(--danger) 50%,transparent);color:var(--danger)}
.cmd{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:12px 14px;font:13px ui-monospace,SFMono-Regular,Menlo,monospace;margin:8px 0;overflow:auto}
.mobil{display:none}
.mobil button{flex:none;display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 12px;border-radius:999px;border:1px solid var(--line);background:var(--panel);color:var(--muted);font-size:13px;white-space:nowrap}
.mobil button.active{color:var(--text);border-color:var(--accent)}
.mobil button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.mobil .count{font-size:11px}
mark.hl{background:color-mix(in srgb,var(--accent) 24%,transparent);color:inherit;border-radius:3px;padding:0 1px}
@media (max-width:820px){.app{grid-template-columns:1fr}.sidebar{display:none}.main{padding:0 14px 30px}.mobil{display:flex;gap:6px;overflow-x:auto;padding:0 0 8px;scrollbar-width:none}}
`;

export const SEITE_JS = String.raw`
(function () {
  'use strict';
  var TOKEN = document.querySelector('meta[name="kepta-token"]').content;
  var TYPES = { semantic: 'Fact', episodic: 'Event', procedural: 'How-to', reference: 'Document' };
  var VIEWS = [['all', 'All notes'], ['graph', 'Graph'], ['semantic', 'Facts'], ['episodic', 'Events'], ['procedural', 'How-tos'], ['reference', 'Documents'], ['trash', 'Trash']];
  var PAGE = 60;
  var state = { view: 'all', tag: null, query: '', offset: 0, status: null, agenten: [], eintraege: [], letzte: 0 };
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
  function toast(msg, fehler) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast' + (fehler ? ' error' : '');
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.hidden = true; }, 2800);
  }
  function chip(type) { return h('span', { class: 'chip t-' + type, text: TYPES[type] || type }); }

  // KEPTA Pro: what the desktop app adds. It opens from one quiet link
  // at the bottom of the sidebar — never by itself, never in the middle of work.
  function enterprise(feature) {
    drawer($('enterprise').content.cloneNode(true));
    var p = $('panel');
    var zu = p.querySelector('[data-close]');
    zu.addEventListener('click', schliessen);
    zu.focus({ preventScroll: true });
    var ziel = feature ? p.querySelector('[data-feature="' + feature + '"]') : null;
    if (ziel) { ziel.classList.add('focus'); ziel.scrollIntoView({ block: 'center' }); }
  }
  // Search terms in a result, marked — built from text nodes, never HTML.
  function markiert(el, text, begriffe) {
    var t = (begriffe || []).filter(function (b) { return b && b.length >= 2; }).map(function (b) { return b.replace(/[-.*+?^$(){}|[\]\\]/g, '\\$&'); });
    if (!t.length) { el.textContent = text; return el; }
    var re = new RegExp('(' + t.join('|') + ')', 'gi');
    var zuletzt = 0;
    var m;
    while ((m = re.exec(text))) {
      if (m.index > zuletzt) el.appendChild(document.createTextNode(text.slice(zuletzt, m.index)));
      el.appendChild(h('mark', { class: 'hl', text: m[0] }));
      zuletzt = re.lastIndex;
    }
    if (zuletzt < text.length) el.appendChild(document.createTextNode(text.slice(zuletzt)));
    return el;
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
    renderMobil();
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
    if (state.view === 'activity') return ['Activity', 'What your AI apps read and write in your memory — as it happens.'];
    if (state.view === 'graph') return ['Knowledge graph', 'Every note a node, every [[link]] an edge — drag a node, click one to open it.'];
    var v = VIEWS.filter(function (x) { return x[0] === state.view; })[0];
    return [v[1], state.view === 'trash' ? 'Deleted notes wait here until you restore them.' : ''];
  }

  function card(note, extra, treffer) {
    var abgelaufen = note.validTo && note.validTo < Date.now();
    var c = h('article', { class: 'card t-' + note.type, 'data-id': note.id, tabindex: '0', onclick: function () { openNote(note.id); }, onkeydown: function (ev) { if (ev.key === 'Enter') openNote(note.id); } },
      h('div', { class: 'card-top' }, chip(note.type), note.template ? h('span', { class: 'flag', text: 'Template' }) : null, note.supersededBy ? h('span', { class: 'flag', text: 'Superseded' }) : null, abgelaufen ? h('span', { class: 'flag', text: 'Expired' }) : null),
      markiert(h('h3'), note.displayTitle || note.title, treffer && treffer.terms),
      note.path ? h('div', { class: 'path', title: note.path, text: note.path }) : null,
      (treffer && treffer.snippet) || note.preview
        ? markiert(h('p', { class: 'excerpt' }), (treffer && treffer.snippet) || note.preview, treffer && treffer.terms)
        : h('p', { class: 'excerpt none', text: note.template ? 'An empty template.' : 'No text yet.' }),
      h('div', { class: 'card-foot' },
        h('div', { class: 'tags' }, note.tags.slice(0, 3).map(function (t) { return h('span', { class: 'tagchip', text: '#' + t }); })),
        h('span', { class: 'muted small', text: ago(note.updatedAt) })));
    if (extra) c.appendChild(extra);
    return c;
  }

  function leer() {
    return h('div', { class: 'empty' },
      h('h2', { text: 'Your memory is empty — for now.' }),
      h('p', { class: 'muted', text: 'Connect an AI app and it starts remembering: what you decided, how things work, who is who. Every note stays encrypted on this computer.' }),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', type: 'button', onclick: verbinden }, 'Connect an AI app'),
        h('button', { class: 'btn', type: 'button', onclick: function () { openEditor(null); } }, 'Write the first note')));
  }

  // AI apps: which ones use KEPTA and what they do. The MCP server is another
  // process — it writes each call to the database, and the page asks every
  // three seconds what is new. A note an agent saves shows up while you watch.
  var VERBEN = { memory_save: 'saved', memory_update: 'updated', memory_search: 'searched for', memory_delete: 'moved to the trash', memory_forget: 'marked as outdated', memory_list: 'looked through your notes', memory_graph: 'looked at how notes link', memory_consolidate: 'checked for duplicates', connect: 'connected' };
  var LIVE = 5 * 60 * 1000;
  function kurz(ms) {
    var s = (Date.now() - ms) / 1000;
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + 'm';
    if (s < 86400) return Math.round(s / 3600) + 'h';
    return Math.round(s / 86400) + 'd';
  }
  function renderAgenten() {
    var box = $('agents');
    var liste = state.agenten || [];
    // Only rebuild when something visible changed — the page asks every three
    // seconds, and a rebuild in the middle of a click would swallow it.
    var zeichen = JSON.stringify([liste.slice(0, 5).map(function (a) { return [a.who, a.calls, Date.now() - a.lastSeen < LIVE ? 'now' : kurz(a.lastSeen)]; }), state.view === 'activity' && !state.query]);
    if (zeichen === box.getAttribute('data-stand')) return;
    box.setAttribute('data-stand', zeichen);
    box.textContent = '';
    liste.slice(0, 5).forEach(function (a) {
      var live = Date.now() - a.lastSeen < LIVE;
      box.appendChild(h('button', { class: 'nav', type: 'button', title: a.calls + (a.calls === 1 ? ' call' : ' calls') + ', last ' + ago(a.lastSeen), onclick: function () { setView('activity'); } },
        h('span', { class: 'dot agent-dot' + (live ? ' live' : '') }), h('span', { class: 'nav-label', text: a.who }), h('span', { class: 'count', text: live ? 'now' : kurz(a.lastSeen) })));
    });
    if (liste.length) {
      var aktiv = state.view === 'activity' && !state.query;
      box.appendChild(h('button', { class: 'nav' + (aktiv ? ' active' : ''), type: 'button', 'aria-current': aktiv ? 'page' : null, onclick: function () { setView('activity'); } },
        h('span', { class: 'dot t-activity' }), h('span', { class: 'nav-label', text: 'Activity' })));
    }
    box.appendChild(h('button', { class: 'nav connect', type: 'button', onclick: verbinden },
      h('span', { class: 'plus', text: '+' }), h('span', { class: 'nav-label', text: liste.length ? 'Connect another app' : 'Connect an AI app' })));
  }
  // Narrow windows have no room for the sidebar: views, activity and Connect
  // then sit in one row under the search field.
  function renderMobil() {
    var box = $('mobil');
    var s = state.status;
    if (!s) return;
    var agenten = (state.agenten || []).length;
    var zeichen = JSON.stringify([s.notes, s.types, state.view, state.tag, !!state.query, agenten]);
    if (zeichen === box.getAttribute('data-stand')) return;
    box.setAttribute('data-stand', zeichen);
    box.textContent = '';
    VIEWS.forEach(function (v) {
      var n = v[0] === 'all' ? s.notes.active : v[0] === 'trash' ? s.notes.trashed : (s.types[v[0]] || 0);
      if (v[0] !== 'all' && !n) return;
      var aktiv = state.view === v[0] && !state.tag && !state.query;
      box.appendChild(h('button', { class: aktiv ? 'active' : null, type: 'button', 'aria-current': aktiv ? 'page' : null, onclick: function () { setView(v[0]); } }, v[1], h('span', { class: 'count', text: String(n) })));
    });
    if (agenten) box.appendChild(h('button', { class: state.view === 'activity' && !state.query ? 'active' : null, type: 'button', onclick: function () { setView('activity'); } }, 'Activity'));
    box.appendChild(h('button', { type: 'button', onclick: verbinden }, '+ Connect'));
  }
  function eintrag(e) {
    var ziel = null;
    if (e.text) ziel = e.noteId
      ? h('button', { class: 'wikilink', type: 'button', onclick: function () { openNote(e.noteId); } }, e.text)
      : h('strong', { text: e.tool === 'memory_search' ? '“' + e.text + '”' : e.text });
    var art = e.tool === 'memory_search' ? 'search' : e.tool === 'connect' ? 'connect' : /^memory_(save|update|delete|forget)$/.test(e.tool) ? 'write' : 'read';
    return h('div', { class: 'act' + (e.frisch ? ' fresh' : '') },
      h('span', { class: 'act-dot t-' + art }),
      h('div', { class: 'act-body' },
        h('div', {}, h('strong', { text: e.who }), ' ' + (VERBEN[e.tool] || e.tool.replace(/^memory_/, '').replace(/_/g, ' ')) + (ziel ? ' ' : ''), ziel,
          e.tool === 'memory_search' && e.count !== null ? h('span', { class: 'muted', text: ' · ' + e.count + (e.count === 1 ? ' note' : ' notes') }) : null),
        h('span', { class: 'muted small', text: ago(e.at) })));
  }
  function holeAktivitaet(erstes) {
    return api('/api/activity?after=' + state.letzte).then(function (d) {
      state.agenten = d.agents;
      var neu = d.entries;
      state.eintraege.forEach(function (e) { e.frisch = false; });
      if (neu.length) {
        state.letzte = neu[0].id;
        if (!erstes) neu.forEach(function (e) { e.frisch = true; });
        state.eintraege = neu.concat(state.eintraege).slice(0, 50);
      }
      renderAgenten();
      renderMobil();
      if (!neu.length) return;
      if (state.view === 'activity' && !state.query) load(true);
      if (erstes) return;
      var schreibend = neu.filter(function (e) { return /^memory_(save|update|delete|forget)$/.test(e.tool); });
      if (!schreibend.length) return;
      var e = schreibend[0];
      toast(e.who + ' ' + VERBEN[e.tool] + (e.text ? ' “' + e.text + '”' : '') + (schreibend.length > 1 ? ' — and ' + (schreibend.length - 1) + ' more' : '') + '.');
      loadStatus();
      var oben = document.querySelector('.main').scrollTop < 240;
      if (state.view === 'activity' || state.query || !oben) return;
      load(true).then(function () {
        schreibend.forEach(function (x) {
          var karte = x.noteId && document.querySelector('.card[data-id="' + CSS.escape(x.noteId) + '"]');
          if (karte) karte.classList.add('fresh');
        });
      });
    }).catch(function () { /* the next round tries again */ });
  }

  // Connecting an app: KEPTA finds Claude Desktop, Claude Code, Cursor,
  // Windsurf and VS Code and adds itself to their MCP settings — with a
  // backup of the old file (src/einrichtung.ts).
  function verbinden() {
    var liste = h('div', { class: 'clients' }, h('p', { class: 'muted', text: 'Looking for AI apps on this computer…' }));
    var befehl = 'npx -y kepta-mcp setup';
    drawer(h('div', {},
      h('div', { class: 'panel-head' }, h('strong', { text: 'Connect an AI app' }),
        h('button', { class: 'btn icon close', type: 'button', 'aria-label': 'Close', onclick: schliessen }, '×')),
      h('p', { class: 'content', text: 'KEPTA adds itself to the MCP settings of the app — with a backup of the old file right next to it. Nothing else in the file changes.' }),
      liste,
      h('h3', { class: 'section-title', text: 'From a terminal' }),
      h('pre', { class: 'cmd', text: befehl }),
      h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: function () {
        navigator.clipboard.writeText(befehl).then(function () { toast('Copied.'); }, function () { toast('Copying failed — select the command instead.', true); });
      } }, 'Copy command')),
      h('p', { class: 'muted small', text: 'Any other MCP app: add a server with the command npx and the arguments -y kepta-mcp.' })));
    function zeige(clients, meldung) {
      liste.textContent = '';
      if (meldung) liste.appendChild(h('p', { class: 'meldung ' + (meldung.ok ? 'ok' : 'fehler'), role: 'status', text: meldung.message }));
      clients.forEach(function (c) {
        var zustand = c.connected ? 'Connected' : c.installed ? 'Not connected yet' : 'Not installed';
        liste.appendChild(h('div', { class: 'client' + (c.installed ? '' : ' off') },
          h('div', { class: 'client-name' }, h('strong', { text: c.name }), h('span', { class: 'client-state' + (c.connected ? ' ok' : ''), text: zustand })),
          c.canConnect ? h('button', { class: 'btn primary', type: 'button', onclick: function (ev) {
            ev.currentTarget.disabled = true;
            api('/api/clients/' + encodeURIComponent(c.id) + '/connect', { method: 'POST', body: {} })
              .then(function (d) { zeige(d.clients, d); })
              .catch(function (err) { zeige(clients, { ok: false, message: err.message }); });
          } }, 'Connect') : null,
          c.installed && !c.connected && !c.canConnect && c.hint ? h('p', { class: 'muted small hint-text', text: c.hint }) : null));
      });
    }
    api('/api/clients').then(function (d) { zeige(d.clients); }).catch(function (err) { zeige([], { ok: false, message: err.message }); });
  }

  // Sorting by kind: a vault imported before 2.12 landed entirely as facts.
  // KEPTA offers once to read the notes again — with a preview first and one
  // click back.
  var MEHRZAHL = { semantic: ['fact', 'facts'], episodic: ['event', 'events'], procedural: ['how-to', 'how-tos'], reference: ['document', 'documents'] };
  function anzahl(n, typ) { var w = MEHRZAHL[typ] || [typ, typ]; return n + ' ' + (n === 1 ? w[0] : w[1]); }
  function einordnungPruefen() {
    return api('/api/reclassify').then(function (e) { state.einordnung = e; zeigeHinweisEinordnung(); }).catch(function () { /* the list works without it */ });
  }
  function abgelehnt(n) {
    try {
      if (n !== undefined) localStorage.setItem('kepta-core-reclassify', String(n));
      return localStorage.getItem('kepta-core-reclassify');
    } catch (e) { return null; }
  }
  function zeigeHinweisEinordnung() {
    var box = $('notice');
    var e = state.einordnung;
    var zeigen = !!(e && e.changed > 0 && state.view === 'all' && !state.tag && !state.query && abgelehnt() !== String(e.changed));
    box.hidden = !zeigen;
    box.textContent = '';
    if (!zeigen) return;
    var ziele = Object.keys(e.into).sort(function (a, b) { return e.into[b] - e.into[a]; }).map(function (t) { return anzahl(e.into[t], t); });
    box.appendChild(h('span', { text: 'KEPTA would sort ' + (e.changed === 1 ? 'one note' : e.changed + ' notes') + ' into a better kind — ' + ziele.join(', ') + '.' }));
    box.appendChild(h('button', { class: 'btn', type: 'button', onclick: einordnen }, 'Review'));
    box.appendChild(h('button', { class: 'btn ghost', type: 'button', onclick: function () { abgelehnt(e.changed); box.hidden = true; } }, 'Not now'));
  }
  function einordnen() {
    var e = state.einordnung;
    if (!e) return;
    function zu() { return h('button', { class: 'btn icon close', type: 'button', 'aria-label': 'Close', onclick: schliessen }, '×'); }
    function anwenden() {
      api('/api/reclassify', { method: 'POST', body: {} }).then(function (d) {
        state.einordnung = null;
        zeigeHinweisEinordnung();
        drawer(h('div', {},
          h('div', { class: 'panel-head' }, h('strong', { text: 'Sorted' }), zu()),
          h('p', { class: 'content', text: (d.changed === 1 ? 'One note has' : d.changed + ' notes have') + ' a new kind. Nothing else changed.' }),
          h('div', { class: 'actions' },
            h('button', { class: 'btn primary', type: 'button', onclick: schliessen }, 'Done'),
            d.undo ? h('button', { class: 'btn ghost', type: 'button', onclick: zurueck }, 'Undo') : null)));
        return Promise.all([loadStatus(), load(true)]);
      }).catch(function (err) { toast(err.message, true); });
    }
    function zurueck() {
      api('/api/reclassify/undo', { method: 'POST', body: {} }).then(function (d) {
        schliessen();
        toast('Undone — ' + (d.restored === 1 ? 'one note is' : d.restored + ' notes are') + ' back as before.');
        return Promise.all([loadStatus(), load(true)]).then(einordnungPruefen);
      }).catch(function (err) { toast(err.message, true); });
    }
    drawer(h('div', {},
      h('div', { class: 'panel-head' }, h('strong', { text: 'Sort notes by kind' }), zu()),
      h('p', { class: 'content', text: 'KEPTA reads each note again and files it as a fact, an event, a how-to or a document. Titles, text, tags and dates stay exactly as they are.' }),
      h('table', { class: 'kinds' },
        h('thead', {}, h('tr', {}, h('th', { text: 'Kind' }), h('th', { class: 'n', text: 'Now' }), h('th', { class: 'n', text: 'After' }))),
        h('tbody', {}, Object.keys(TYPES).map(function (t) {
          return h('tr', {}, h('td', {}, chip(t)), h('td', { class: 'n', text: String(e.before[t] || 0) }), h('td', { class: 'n', text: String(e.after[t] || 0) }));
        }))),
      e.examples.length ? h('h3', { class: 'section-title', text: 'For example' }) : null,
      h('ul', { class: 'examples' }, e.examples.map(function (x) {
        return h('li', {}, h('span', { class: 'ex-title', text: x.title }), h('span', { class: 'ex-move' }, chip(x.from), h('span', { class: 'muted', text: '→' }), chip(x.to)));
      })),
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary', type: 'button', onclick: anwenden }, 'Sort ' + (e.changed === 1 ? 'one note' : e.changed + ' notes')),
        h('button', { class: 'btn ghost', type: 'button', onclick: schliessen }, 'Cancel'))));
  }

  function load(reset) {
    if (reset) state.offset = 0;
    var list = $('list');
    var more = $('more');
    var hd = heading();
    $('heading').textContent = hd[0];
    $('sub').textContent = hd[1];
    renderSidebar();
    renderAgenten();
    zeigeHinweisEinordnung();
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
          list.appendChild(card(hit.note, h('div', { class: 'score', title: 'Relevance' }, fill), { snippet: hit.snippet, terms: hit.matchedTerms }));
        });
      }).catch(function (e) { toast(e.message, true); });
    }
    if (state.view === 'graph') { renderGraphView(); return; }
    if (state.view === 'activity') {
      more.hidden = true;
      list.textContent = '';
      list.appendChild(state.eintraege.length
        ? h('div', { class: 'timeline' }, state.eintraege.map(eintrag))
        : h('div', { class: 'empty' },
            h('h2', { text: 'No AI app has used KEPTA yet.' }),
            h('p', { class: 'muted', text: 'Connect Claude, Cursor or another MCP app — every note it saves or looks up shows up here as it happens.' }),
            h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onclick: verbinden }, 'Connect an AI app'))));
      return Promise.resolve();
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

  // The text arrives as a tree from the server (src/ui/markdown.ts). Only
  // elements with textContent are built here — never HTML — and links lead
  // only to http(s) and mailto, in a new tab.
  var CALLOUTS = { note: 'info', info: 'info', abstract: 'info', summary: 'info', tldr: 'info', todo: 'info', tip: 'ok', hint: 'ok', important: 'ok', success: 'ok', check: 'ok', done: 'ok', warning: 'warn', caution: 'warn', attention: 'warn', question: 'warn', help: 'warn', faq: 'warn', failure: 'bad', fail: 'bad', missing: 'bad', danger: 'bad', error: 'bad', bug: 'bad' };
  var AUSZEICHNUNG = { b: 'strong', i: 'em', s: 'del', mark: 'mark' };
  function inline(el, teile) {
    (teile || []).forEach(function (x) {
      if (x.t === 'text') el.appendChild(document.createTextNode(x.v));
      else if (AUSZEICHNUNG[x.t]) el.appendChild(inline(h(AUSZEICHNUNG[x.t]), x.c));
      else if (x.t === 'code') el.appendChild(h('code', { text: x.v }));
      else if (x.t === 'link') el.appendChild(/^(https?:|mailto:)/i.test(x.href) ? h('a', { href: x.href, target: '_blank', rel: 'noopener noreferrer' }, x.v) : document.createTextNode(x.v));
      else if (x.t === 'wiki') el.appendChild(wikilink(x.ziel, x.v));
      else if (x.t === 'embed') el.appendChild(h('span', { class: 'embed', title: 'Embedded file', text: x.v }));
      else if (x.t === 'ph') el.appendChild(h('span', { class: 'ph', title: 'Template placeholder', text: x.v }));
      else if (x.t === 'tag') el.appendChild(h('button', { class: 'mdtag', type: 'button', onclick: function () { suche(x.v); } }, '#' + x.v));
    });
    return el;
  }
  function markdown(bloecke, box) {
    (bloecke || []).forEach(function (b) {
      if (b.t === 'h') box.appendChild(inline(h('h' + Math.min(6, b.ebene + 2)), b.c));
      else if (b.t === 'p') box.appendChild(inline(h('p'), b.c));
      else if (b.t === 'hr') box.appendChild(h('hr'));
      else if (b.t === 'code') box.appendChild(h('pre', {}, h('code', { text: b.v })));
      else if (b.t === 'list') box.appendChild(h('ul', { class: 'mdlist' }, b.punkte.map(function (p) {
        var marke = p.done === null
          ? h('span', { class: 'mk', 'aria-hidden': 'true', text: p.nr || '•' })
          : h('input', { type: 'checkbox', disabled: true, checked: p.done, 'aria-label': p.done ? 'Done' : 'Open' });
        return h('li', { class: 'd' + p.tiefe + (p.done ? ' done' : '') }, marke, inline(h('span'), p.c));
      })));
      else if (b.t === 'quote') {
        var art = b.art ? (CALLOUTS[b.art] || 'plain') : null;
        var q = h('blockquote', { class: art ? 'callout c-' + art : null });
        if (art) q.appendChild(inline(h('strong', { class: 'callout-title' }), b.titel.length ? b.titel : [{ t: 'text', v: b.art.charAt(0).toUpperCase() + b.art.slice(1) }]));
        box.appendChild(markdown(b.blocks, q));
      } else if (b.t === 'table') {
        box.appendChild(h('div', { class: 'tablewrap' }, h('table', {},
          h('thead', {}, h('tr', {}, b.kopf.map(function (c) { return inline(h('th'), c); }))),
          h('tbody', {}, b.zeilen.map(function (r) { return h('tr', {}, r.map(function (c) { return inline(h('td'), c); })); })))));
      }
    });
    return box;
  }
  function suche(text) { schliessen(); $('q').value = text; state.query = text; state.tag = null; load(true); }
  function wikilink(ziel, v) {
    return h('button', { class: 'wikilink', type: 'button', onclick: function () { suche(ziel); } }, v || ziel);
  }

  // ---- Knowledge graph (read-only): notes as nodes, [[links]] as edges. ----
  // The server computes the force layout for the measured width; this only
  // draws - AFTER the canvas is in the document. Before that, getComputedStyle
  // cannot resolve the theme colors and the nodes would be invisible (black on
  // black). That was the bug Damian caught on screen.
  function renderGraphView() {
    var list = $('list');
    list.textContent = '';
    more.hidden = true;
    list.appendChild(h('p', { class: 'muted pad', text: 'Loading graph…' }));
    // Erst einsetzen (unsichtbar), DANN Breite messen, DANN Positionen holen:
    var wrap = h('div', { class: 'graph-wrap' }, h('canvas', { 'aria-label': 'Knowledge graph', role: 'img' }));
    wrap.firstChild.style.display = 'block';
    list.appendChild(wrap);
    var breite = Math.max(320, (wrap.clientWidth || 900) - 2);
    var hoehe = Math.min(640, Math.max(380, Math.round(breite * 0.55)));
    api('/api/graph?width=' + breite + '&height=' + hoehe).then(function (g) {
      if (state.view !== 'graph') return;
      var canvas = wrap.firstChild;
      canvas.width = g.breite * (window.devicePixelRatio || 1);
      canvas.height = g.hoehe * (window.devicePixelRatio || 1);
      canvas.style.width = g.breite + 'px';
      canvas.style.height = g.hoehe + 'px';
      canvas.setAttribute('aria-label', g.nodes.length + ' notes as nodes, ' + g.edges.length + ' links as edges');
      var ctx = canvas.getContext('2d');
      ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
      var stil = getComputedStyle(canvas);
      var farben = { semantic: stil.getPropertyValue('--t-semantic').trim() || '#888', episodic: stil.getPropertyValue('--t-episodic').trim() || '#a08', procedural: stil.getPropertyValue('--t-procedural').trim() || '#8a8', reference: stil.getPropertyValue('--t-reference').trim() || '#a86' };
      var knoten = g.nodes;
      var byId = {}; knoten.forEach(function (k) { byId[k.id] = k; });
      var kanten = g.edges.map(function (e) { return [byId[e.quelle], byId[e.ziel]]; }).filter(function (p) { return p[0] && p[1]; });
      function radius(k) { return 5 + Math.min(9, k.grad * 1.4); }
      function zeichne() {
        ctx.clearRect(0, 0, g.breite, g.hoehe);
        ctx.strokeStyle = 'rgba(128,128,128,0.3)';
        ctx.lineWidth = 1;
        kanten.forEach(function (k) { ctx.beginPath(); ctx.moveTo(k[0].x, k[0].y); ctx.lineTo(k[1].x, k[1].y); ctx.stroke(); });
        knoten.forEach(function (k) {
          ctx.fillStyle = farben[k.type] || '#888';
          ctx.beginPath();
          ctx.arc(k.x, k.y, radius(k), 0, 2 * Math.PI);
          ctx.fill();
          if (k.grad >= 4) {
            ctx.fillStyle = 'rgba(160,160,160,0.9)';
            ctx.font = '10px sans-serif';
            ctx.fillText(k.titel.slice(0, 22), k.x + radius(k) + 3, k.y + 3);
          }
        });
      }
      zeichne();

      // Drag holds and moves a node; a click (barely any movement) opens it.
      var gezogen = null, bewegt = 0;
      function pos(ev) {
        var r = canvas.getBoundingClientRect();
        var quelle = ev.touches ? ev.touches[0] : ev;
        return { x: quelle.clientX - r.left, y: quelle.clientY - r.top };
      }
      function treffer(p) { return knoten.filter(function (k) { var dx = p.x - k.x, dy = p.y - k.y; return dx * dx + dy * dy <= Math.pow(radius(k) + 5, 2); })[0] || null; }
      canvas.onpointerdown = function (ev) {
        gezogen = treffer(pos(ev)); bewegt = 0;
        if (gezogen) { gezogen.fixiert = true; canvas.setPointerCapture(ev.pointerId); }
      };
      canvas.onpointermove = function (ev) {
        if (!gezogen) return;
        var p = pos(ev);
        bewegt += Math.abs(p.x - gezogen.x) + Math.abs(p.y - gezogen.y);
        gezogen.x = Math.max(30, Math.min(g.breite - 30, p.x)); gezogen.y = Math.max(26, Math.min(g.hoehe - 26, p.y));
        zeichne();
      };
      canvas.onpointerup = function (ev) {
        if (gezogen) { gezogen.fixiert = false; if (bewegt < 6) openNote(gezogen.id); gezogen = null; zeichne(); }
      };
      canvas.style.cursor = 'grab';

      var fuss = h('p', { class: 'muted pad', text: knoten.length + ' notes · ' + kanten.length + ' links (' + g.verweise + ' references, resolved where both notes exist).' });
      list.appendChild(fuss);
    }).catch(function (e) { toast(e.message, true); });
  }

  function openNote(id) {  function openNote(id) {  function openNote(id) {
    api('/api/notes/' + encodeURIComponent(id)).then(function (d) {
      var n = d.note;
      var geloescht = !!n.deletedAt;
      var gueltig = n.validFrom || n.validTo ? 'Valid ' + (n.validFrom ? 'from ' + datum(n.validFrom) + ' ' : '') + (n.validTo ? 'until ' + datum(n.validTo) : '') : null;
      drawer(h('div', {},
        h('div', { class: 'panel-head' }, chip(n.type), h('span', { class: 'muted small', text: 'Updated ' + ago(n.updatedAt) + ' · created ' + datum(n.createdAt) }),
          h('button', { class: 'btn icon close', type: 'button', 'aria-label': 'Close', onclick: schliessen }, '×')),
        h('h2', { class: 'panel-title', text: n.displayTitle || n.title }),
        n.path ? h('p', { class: 'path panel-path', title: 'Stored under this name', text: n.path }) : null,
        gueltig ? h('p', { class: 'validity', text: gueltig.trim() }) : null,
        n.supersededBy ? h('p', { class: 'validity', text: 'Superseded by a newer note.' }) : null,
        geloescht ? h('p', { class: 'validity', text: 'In the trash since ' + datum(n.deletedAt) + '.' }) : null,
        n.properties && n.properties.length ? h('dl', { class: 'props' }, n.properties.map(function (p) { return [h('dt', { text: p[0] }), h('dd', { text: p[1] })]; })) : null,
        markdown(n.body, h('div', { class: 'content md' })),
        n.source ? h('p', { class: 'muted small source', text: 'Source: ' + n.source }) : null,
        n.tags.length ? h('div', { class: 'tags' }, n.tags.map(function (t) { return h('button', { class: 'tagchip', type: 'button', onclick: function () { schliessen(); setTag(t); } }, '#' + t); })) : null,
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
      toast('“' + (n.displayTitle || n.title) + '” moved to the trash.');
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

  loadStatus().then(function () { load(true); einordnungPruefen(); holeAktivitaet(true); }).catch(function (e) { toast('KEPTA is not reachable: ' + e.message, true); });
  setInterval(function () { if (!document.hidden) holeAktivitaet(false); }, 3000);
})();
`;
