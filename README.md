# PM Floor

A visual, multi-agent project planner for Claude Code, tuned for game / simulation work.
A **Client** files a feature request; the **Architect** scopes it; design, Unreal, and
simulation specialists weigh in; the team breaks it down, sets priorities, writes a spec
document, and the plan plays out on an animated **office floor with a whiteboard**.

## Download Kanban Office (desktop app)

The desktop app (Kanban Office) bundles the floor + whiteboard and runs Claude Code on your
own account. Pick the build for your machine — links always point to the **latest release**:

| Build | Windows on ARM (Snapdragon / Surface) | Windows Intel / AMD (x64) |
| --- | --- | --- |
| **Installer** (recommended — auto-updates) | [KanbanOffice-Setup.exe](https://github.com/ronnielegaspi/kanban-office/releases/latest/download/KanbanOffice-Setup.exe) | [KanbanOffice-Setup-x64.exe](https://github.com/ronnielegaspi/kanban-office/releases/latest/download/KanbanOffice-Setup-x64.exe) |
| **Portable** (no install — unzip & run `Kanban Office.exe`) | [KanbanOffice-Portable-arm64.zip](https://github.com/ronnielegaspi/kanban-office/releases/latest/download/KanbanOffice-Portable-arm64.zip) | [KanbanOffice-Portable-x64.zip](https://github.com/ronnielegaspi/kanban-office/releases/latest/download/KanbanOffice-Portable-x64.zip) |

Not sure which? Most new Windows laptops marketed as "Copilot+ PCs" / Snapdragon are **ARM**;
traditional Intel/AMD desktops and laptops are **x64**. The installer adds a desktop shortcut
and updates itself; the portable build leaves no footprint. All builds need Claude Code
installed (see Prerequisite below). · [All releases & changelogs](https://github.com/ronnielegaspi/kanban-office/releases)

```
User ─► Client (files request + priority)
            │
        Architect (you, the main session)
            │ delegates to read-only specialists
   ┌────────┼─────────┬───────────┬───────────┬──────────┬──────────┐
 Scoper  GameDesign  Unreal    Simulation  TaskWriter  Estimator  Scheduler
            └──────────────── Architect writes ──────────────────┘
                         │                         │
              docs/<feature>.md          office-state.json ─► office-floor.html
```

## What's in here

```
CLAUDE.md                          the Architect's brief + the state-file contract
office-floor.html                  the animated floor + whiteboard (open in a browser)
office-state.json                  the shared state the floor reads
.claude/skills/request/            /request — file a request, plan it, write the spec
.claude/skills/plan-project/       /plan-project — plan a goal directly with the Architect
.claude/agents/                    client, scoper, game-designer, unreal-engine,
                                   simulation, task-writer, estimator, scheduler
```

## Prerequisite (do this first)

You need **Claude Code installed and working** in a terminal. On Windows ARM, install via
npm:

```powershell
npm install -g @anthropic-ai/claude-code
claude --version
```

Then `cd` into this folder, run `claude`, and confirm it can create and read a local file.
If that works, you're ready. (If it can't write locally on your machine, the file-writing
steps won't work — flag it and we'll adjust.)

## Quickstart

1. Put this `pm-floor` folder on your PC.
2. Open a terminal in it and run `claude` — it reads `CLAUDE.md` and becomes the Architect.
3. File a request — `/request an adaptive AI opponent commander, P1, 6 hrs/day` — or just
   talk to the Architect. The specialists invoked depend on the feature.
4. It writes `docs/<feature>.md` and `office-state.json`, then open `office-floor.html`,
   click **Load office-state.json**, and watch it on the whiteboard.

## Re-skinning

The floor is plain HTML5 canvas in `office-floor.html` — agents, desks, zones, the
whiteboard, and priority colors are all editable. Ask Claude Code to change them.

## Next steps (when you want them)

- Live auto-refresh (small local static server).
- Push prioritized tasks to a Notion database via the Notion MCP server.
- "Replan from day N" without redoing earlier days.
