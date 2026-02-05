# Mission Control

AI Agent Orchestration Dashboard - Manage AI agents, assign tasks, and coordinate multi-agent collaboration.

Inspired by [Bhanu Teja P's guide](https://x.com/pbteja1998/status/2017662163540971756) on building an AI Agent Squad with 10 agents working together like a real team.

## Features

- **Workspace Management** - Multiple workspaces for different projects
- **Agent Squad** - Create and manage AI agents with roles, personalities (SOUL.md), and team awareness (AGENTS.md)
- **Mission Queue (Kanban)** - 7-stage task pipeline: Planning > Inbox > Assigned > In Progress > Testing > Review > Done
- **Drag-and-Drop** - Move tasks between stages with drag-and-drop
- **Live Feed** - Real-time event stream showing all task and agent activity
- **Task Activities & Deliverables** - Track agent work output and file deliverables
- **Real-time Updates** - Server-Sent Events for live dashboard updates
- **Dark Theme** - GitHub-inspired dark UI with JetBrains Mono font

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Database**: SQLite (better-sqlite3)
- **State**: Zustand
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Real-time**: Server-Sent Events (SSE)

## Getting Started

```bash
# Install dependencies
npm install

# Seed the database with sample data
npm run db:seed

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the dashboard.

## Agent Squad (Default)

| Agent | Role | Description |
|-------|------|-------------|
| Jarvis | Squad Lead | Master orchestrator who coordinates all agents |
| Shuri | Product Analyst | Skeptical tester, finds edge cases and UX issues |
| Fury | Customer Researcher | Deep researcher, every claim comes with receipts |
| Vision | SEO Analyst | Thinks in keywords and search intent |
| Loki | Content Writer | Pro-Oxford comma, anti-passive voice |
| Quill | Social Media Manager | Thinks in hooks and threads |
| Wanda | Designer | Visual thinker, makes things beautiful |
| Developer | Code & Automation | Writes code, creates automations |

## Architecture

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # REST API endpoints
│   │   ├── agents/        # Agent CRUD
│   │   ├── events/        # Event feed + SSE stream
│   │   ├── tasks/         # Task CRUD + activities + deliverables
│   │   └── workspaces/    # Workspace management
│   ├── workspace/[slug]/  # Workspace dashboard page
│   └── page.tsx           # Home (workspace selector)
├── components/            # React UI components
├── hooks/                 # Custom hooks (useSSE)
└── lib/                   # Core utilities
    ├── db/               # SQLite schema, seed
    ├── events.ts         # SSE broadcaster
    ├── store.ts          # Zustand state
    └── types.ts          # TypeScript types
```
