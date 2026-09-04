# KEPTA - LinkedIn EN - Final

## Headline A (RECOMMENDED)
Founder @ KEPTA — Local memory for AI agents. Your AI forgets. KEPTA remembers. | Open Source • No Cloud • No Account

## Headline B
Building KEPTA — Local-first AI memory over MCP | SQLite + FTS5 · Hybrid Retrieval (RRF) · Knowledge Graph | React + Electron

## Headline C
Founder @ KEPTA — Keeps what matters. One SQLite file on your machine, not in the cloud.

## About
Your AI assistant forgets you after every chat. KEPTA doesn't.

I build KEPTA — a local memory system that runs on your own machine and remembers what matters. In one file. No cloud, no account, no subscription.

The problem is simple: You explain your project, your client, your preferences to ChatGPT or Claude. Tomorrow you open a new chat and it's gone. So you explain it again. And again.

KEPTA solves it where it should be solved: locally. A small desktop app (macOS / Windows / Linux) that your AI agent can read and write by itself via MCP. What one agent learns, the next one already knows.

→ One brain for every tool: Claude Desktop, Cursor and any MCP client share the same knowledge base. 8 tools over stdio + Streamable HTTP (POST /mcp), protocol 2026-07-28. Listed in the official MCP Registry. Install without the app: npx -y kepta-mcp

→ Hybrid retrieval that actually finds: FTS5 BM25 + vector KNN (Ollama, optional) + entity match, fused with RRF k=60. One code path for UI, API and MCP.

→ Memory with a date: type (semantic/episodic/procedural), scope (user/agent/session), validity window and confidence. Expired x0.5, superseded x0.4. Trash with restore.

→ Capture without friction: Drag & drop PDF/MD/TXT/JSON, URL clipper with SSRF protection, watched inbox, Obsidian import/export ([[wiki links]] -> graph edges).

→ Knowledge graph with time slider: "What did I know in November?"

→ Private & auditable: ~/.kepta/kepta.db, 127.0.0.1 only, no telemetry, MIT licensed.

Built with TypeScript, React 19, Electron, SQLite + FTS5. Quality: ~345 tests, ~91% coverage (src/core 100% funcs), 23 API routes, CI gates, Hit@1 92%.

GitHub: github.com/DamianTodorovic/kepta
