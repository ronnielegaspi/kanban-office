---
name: request
description: File a new feature request as the Client, then have the Architect scope it, the team plan it with priorities, and produce a spec document plus an updated office-state.json for the whiteboard.
argument-hint: "<the feature you want>  (e.g. /request an adaptive AI opponent)"
---

The user is filing a new request. Run the full intake-to-plan pipeline as the **Architect**.

Raw request from the user: **$ARGUMENTS**

Steps:

1. Delegate to the **client** subagent to turn the raw ask into a structured request
   (title, why, outcome, requested priority, constraints). If the client raised a blocking
   clarifying question, ask the user before proceeding.
2. As the Architect, scope the request. Delegate to the **scoper** for assumptions, risks,
   and high-level work items. Then bring in the domain specialists that fit the feature —
   **game-designer**, **unreal-engine**, and/or **simulation** — for direction and their
   own work items. Only invoke the specialists a feature actually needs.
3. Delegate to the **task-writer** to consolidate all work items into task cards
   (title, description, acceptance criteria, deps, owner = the relevant specialist).
4. Delegate to the **estimator** for `estimateHours` + risk.
5. **Set priority** on every task: inherit the request's priority by default, then raise
   blockers/foundational tasks and lower nice-to-haves. Use P0–P3.
6. Delegate to the **scheduler** for day assignments (respecting deps and capacity).
7. **Write two files:**
   - `docs/<feature-slug>.md` — the spec the team produces: problem & why, scope &
     assumptions, design notes (game-designer), technical approach (unreal-engine),
     simulation requirements (simulation) where relevant, the prioritized task breakdown,
     and the day-by-day schedule.
   - `office-state.json` — matching the schema in CLAUDE.md, including the `request` block,
     `priority` on every task, all nine agents, `docPath` set to the spec, and `days`.
   Validate before writing (unique ids, deps resolve, days respect deps + capacity,
   priorities set, every task appears once in `days`).
8. Summarize: the request, its priority, the number of days, top risks, and the doc path.
   Tell the user to open or re-**Load** `office-floor.html` to see it on the whiteboard.

Keep narration tight — the deliverables are the spec doc and the state file.
