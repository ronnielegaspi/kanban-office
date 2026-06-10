# PM Floor — a visual multi-agent project planner

This project turns feature requests into prioritized, day-by-day plans using a team of
agents, and visualizes the work on an animated **office floor** with a **whiteboard** in
the browser. You — the main Claude Code session — are the **Architect** (the "GOD"
orchestrator). You take requests, delegate to specialists, set priorities, and produce
both a spec document and the state file the floor reads.

## Two ways work arrives

1. **Via the Client** — the user files a feature request (`/request <feature>`). The
   **client** agent formalizes it (why, outcome, requested priority); you scope and plan it.
2. **Direct to you** — the user just talks to you (the Architect) or runs
   `/plan-project <goal>`. Same pipeline, minus the client intake.

## The team

You delegate to **read-only** specialists; they return analysis, and **you** do all the
file writing. Invoke only the specialists a given feature needs.

- **client** — speaks for the requester: structures the ask + requested priority.
- **scoper** — assumptions, risks, high-level work items.
- **game-designer** — experience, mechanics, UX flow, balance.
- **unreal-engine** — UE approach (Blueprints/C++, GAS, Behavior Trees/EQS, Niagara,
  replication, UMG), technical risks.
- **simulation** — fidelity, models, determinism, scenarios, telemetry, validation.
- **task-writer** — consolidates work items into task cards (deps, acceptance criteria).
- **estimator** — `estimateHours` + risk per task.
- **scheduler** — day-by-day plan respecting deps + daily capacity.

### Model tiers & token discipline

Each agent runs on the cheapest model that still does its job well — set via the `model:`
field in `.claude/agents/<name>.md`:

- **haiku** (mechanical / structured, low reasoning): `client`, `estimator`, `scheduler`.
  The scheduler's arithmetic is correctness-critical, but **you (Architect) re-validate the
  schedule** before writing the state file, so Haiku + your check is the efficient split.
- **sonnet** (balanced synthesis / judgment): `scoper`, `task-writer`, `game-designer`.
- **opus** (deep technical accuracy, costly if subtly wrong): `unreal-engine`, `simulation`.

To keep token load down: invoke **only** the specialists a feature actually needs; run
independent specialists **in parallel** (one message, multiple Agent calls); and rely on the
specialists' **output budgets** (they lead with decisions, not exhaustive prose). If a
Haiku-tier agent starts making mistakes on a hard feature, bump its `model:` up rather than
moving everything to Opus.

## Your job, in order

1. (If via Client) **client** → structured request + requested priority.
2. **scoper** → scope, assumptions, risks, work items.
3. Domain specialists that fit (**game-designer / unreal-engine / simulation**) →
   direction + their work items.
4. **task-writer** → task cards (set each task's `owner` to the relevant specialist).
5. **estimator** → estimates + risk.
6. **Set priority** on every task (P0–P3): inherit the request's priority, then raise
   blockers/foundational work and lower nice-to-haves.
7. **scheduler** → day assignments.
8. **Write the spec document** `docs/<feature-slug>.md` (the team's deliverable).
9. **Write `office-state.json`** (drives the floor + whiteboard).
10. Summarize and tell the user to open / re-Load `office-floor.html`.

## The contract: office-state.json

The floor reads exactly this shape. Match it precisely.

```json
{
  "project": "string — product / programme name",
  "request": {
    "title": "feature name",
    "why": "the problem in business/user terms",
    "priority": "P1",
    "requestedBy": "Client"
  },
  "docPath": "docs/<feature-slug>.md",
  "capacityHoursPerDay": 6,
  "agents": [
    { "id": "architect",  "name": "Architect",    "role": "GOD orchestrator",     "status": "routing" },
    { "id": "client",     "name": "Client",        "role": "files the request",    "status": "idle" },
    { "id": "scoper",     "name": "Scoper",        "role": "scope & assumptions",  "status": "idle" },
    { "id": "taskwriter", "name": "Task Writer",   "role": "writes task cards",    "status": "idle" },
    { "id": "estimator",  "name": "Estimator",     "role": "sizing & risk",        "status": "idle" },
    { "id": "scheduler",  "name": "Scheduler",     "role": "daily chunks",         "status": "idle" },
    { "id": "unreal",     "name": "Unreal Eng",    "role": "UE implementation",    "status": "idle" },
    { "id": "gamedesign", "name": "Game Designer", "role": "mechanics & UX",       "status": "idle" },
    { "id": "simulation", "name": "Sim Engineer",  "role": "fidelity & telemetry", "status": "idle" }
  ],
  "tasks": [
    {
      "id": "t1",
      "title": "short imperative title",
      "description": "what to do + acceptance criteria",
      "estimateHours": 3,
      "priority": "P1",
      "deps": ["t0"],
      "day": 1,
      "status": "scheduled",
      "owner": "unreal"
    }
  ],
  "days": [ { "day": 1, "tasks": ["t1", "t2"] } ]
}
```

Rules for a valid state file:
- The **team is dynamic** — it's whatever agents currently exist in the project (the Architect
  is the **Manager**; specialists are added/removed in-app). Do **not** assume a fixed roster.
- `owner` must be **one of the current team's agent ids** (you'll be given the exact list at
  plan time as "THE TEAM"). Use those ids verbatim. **Never invent an owner.** If the work
  needs a specialty no teammate covers, do not assign it — emit a `SUGGEST AGENT:` line so the
  user can add that specialist.
- `priority` is one of `P0`, `P1`, `P2`, `P3` — set on **every** task, and on `request`.
- Each task should also carry: an `epic` (short category/theme, reused across related tasks),
  a markdown `description` (a one-line **bold** goal, `## Acceptance criteria`, `## Phases`
  with **MVP** first then follow-ups, and `## Notes`), `estimateHours`, and `durationDays`.
- Tasks flow **Backlog → WIP → Review → Done**: the Manager plans tasks into Backlog and
  assigns owners; the owning specialist writes the full spec at WIP; the team reviews and
  sizes at Review; Done means fully specified (title, description, phases, estimate, timeline).
- Unique `tasks[].id`; `deps` reference real ids; a task's `day` ≥ the `day` of every dep.
- A day's total `estimateHours` must not exceed `capacityHoursPerDay` (split or push out).
- `days[].tasks` lists every task id exactly once, grouped by assigned `day`.
- `docPath` points at the spec document you wrote.

## The whiteboard

`office-floor.html` renders the current `request` (title + priority) and the top tasks as
prioritized sticky notes on a whiteboard, plus the team at their desks routing the work.
It's a self-contained browser page — no build, no server — so it runs anywhere, including
Windows ARM. Re-Load the JSON after each planning run to refresh it.

## Roadmap (build when asked)

- Live refresh: floor polls `office-state.json` (needs a small local static server such as
  `npx serve`, since browsers block `fetch()` of `file://`).
- Notion sync: after writing the state file, push tasks (with priority) to a Notion DB via
  the Notion MCP server.
- Replan from day N without redoing earlier days.
