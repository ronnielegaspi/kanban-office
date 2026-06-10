---
name: plan-project
description: Plan a project end-to-end into a day-by-day task schedule and render it on the office floor. Runs the scoper → task-writer → estimator → scheduler pipeline, then writes office-state.json.
argument-hint: "<project goal>  (e.g. /plan-project build an affiliate dashboard)"
---

The user wants a full project plan. Act as the **Architect** and run the pipeline.

Goal from the user: **$ARGUMENTS**

Steps:

1. If the user hasn't told you their daily capacity, ask once: how many focused hours per
   day, and any target deadline. Wait for the answer.
2. Delegate to the **scoper** subagent with the goal. Review its brief. If it raised an
   open question that materially changes the plan, surface it to the user before going on.
3. Delegate to the **task-writer** with the scoper's work items. Get back task cards.
4. Delegate to the **estimator** with those cards. Get back estimates + risk.
5. Delegate to the **scheduler** with the estimated tasks and `capacityHoursPerDay`. Get
   back day assignments.
6. Assemble everything into the exact `office-state.json` schema documented in CLAUDE.md
   and **write the file** to the project root. Validate before writing: unique ids, deps
   resolve, days respect dependencies and capacity, every task appears once in `days`.
7. Briefly summarize the plan (number of days, any flagged/risky tasks), then tell the
   user to open or re-**Load** `office-floor.html` to watch the floor render it.

Keep your own narration tight — the value is the plan and the file, not a play-by-play.
