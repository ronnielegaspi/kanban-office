# Adaptive AI Opponent Commander

> Spec produced by the PM Floor team — Client intake → Scoper → Game Designer / Unreal
> Engineer / Sim Engineer → Task Writer → Estimator → Scheduler.
> **Priority: P1** · **Capacity: 6 focused hours/day** · **Plan length: 19 days (~84.5h)**

## Problem & why

In a real-time strategy/tactics game with simulated AI, a static or scripted enemy
commander becomes predictable after a few sessions. Players stop being challenged,
replayability collapses, and the core tension of a *contested* match evaporates — the
fastest path to churn. We need an opponent that **reads the player's patterns** (unit
composition, attack timing, map control) and **shifts its own strategy mid-match**, so
difficulty feels like a smarter rival, not a stat multiplier. The target moment is the
player thinking *"it adapted to me."*

## Desired outcome / success criteria

- The commander observes player behavior across a match and meaningfully shifts strategy in
  response — players notice and remark on it.
- Difficulty reads as a smarter opponent, not a numbers buff.
- Designers tune it via data (adaptation rate, aggression ceiling, archetype weights) — no
  hard-coded logic.
- QA can replay a session and reproduce the exact AI decision sequence (deterministic
  replay).
- No perceptible frame-rate impact from AI computation during normal play.
- Playtest target: **2–3 meaningful adaptations per ~20-minute match**, each noticed by the
  player, and **zero "came from nowhere"** reports on Hard.

## Scope & assumptions (this cycle)

- **Within-match adaptation only** — no cross-session player profile yet; state resets at
  match end.
- **Single-player / server-authoritative** — no client replication this cycle (fields
  designed replication-ready).
- **Three archetypes**: Rusher, Turtler, Harasser.
- **Deterministic replay is non-negotiable** — seeded RNG, recorded + reproducible decision
  trace.
- **Data-driven tuning** via UE Data Assets / Data Tables.
- **UE-native** — no external ML runtime (ONNX / Python sidecar) this cycle.
- Builds on an existing game foundation (units, map, command layer, match loop).

**Out of scope:** multiplayer AI, co-op AI partners, persistent player profiles, a 4th
archetype, player-facing "AI thought" UI.

## Top risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Determinism breaks under UE's async task graph (float non-determinism, async BT ticks, GC timers) | High | High | Single `FRandomStream`; audit every random/time path early; SHA-256 replay gate (t13). |
| Sensor / influence-map overhead tanks frame budget at scale | Medium | High | Commander reads a *cached* zone-control snapshot; async time-sliced eval, <0.1 ms frame delta (t24). |
| Adaptation model oscillates / won't converge (t8↔t9) | High | High | Hysteresis + tuning sweep (t16); schedule slack between model and sweep. |
| Archetype transitions feel abrupt or invisible | Medium | Medium | Telegraph sequence + barks (t18); legibility playtest (t22). |
| Data Asset schema churn breaks dependent structs/BTs | Medium | Low-Med | Freeze the StrategyContext contract (t1) and schema (t2) before downstream work. |

## Design notes (Game Designer)

**Adaptation loop:** player action stream → Pattern Sampler (rolling 90–120 s window) →
Archetype Scorer → Strategy State Machine (current archetype + aggression) → orders into
the existing BT/EQS layer → player responds → loop. The commander changes the *goals* fed
to the BT, not the unit-level execution logic. The interface is the **`StrategyContext`**
blackboard contract (t1) — the hard blocker for all BT work.

**Archetype doctrines:**

| Archetype | Doctrine | Vs. player aggression | Economy |
|---|---|---|---|
| Rusher | All-in timed attacks; trades eco for an early kill | Doubles down or concedes | Minimal |
| Turtler | Layered static defense; techs to a late-game edge | Absorbs, counters on overextend | Maximal |
| Harasser | Persistent low-cost raids; disrupts eco/map control | Probes, avoids pitched battles | Moderate |

**Transitions are blended, not instant** — an `archetypeBlendWeight[3]` vector shifts the
dominant archetype over a `blendDuration` window (default 45 s). Aggression is a separate
`[0,1]` scalar clamped by `aggressionCeiling`. A legibility guardrail forbids a persistent
33/33/33 blend (>15 s) so behavior always stays readable (t21).

**Fairness via telegraphing** — every adaptation is preceded by a tell (commander bark at
T+0, portrait flash, musical sting at T+2 s) with the behavior change landing at ~T+12 s,
giving a reaction window. Adaptation must never be a sudden, unexplained change (t18).

**Tunable knobs (per difficulty tier):** `adaptationRate`, `aggressionCeiling`,
`sampleWindowSeconds`, `blendDuration`, `archetypeWeights[3]`, `adaptationTellLeadTime`,
`minTimeBeforeFirstAdaptation`. Presets: Easy / Normal / Hard / Expert (t3).

## Technical approach (Unreal Engine)

**Two-tier AI.** A **Commander tier** (custom C++ strategic layer) owns observation,
adaptation, and archetype logic. The **Squad/Unit tier** is the existing Behavior Tree +
EQS stack, driven downward via Blackboard keys. This keeps strategic cognition off
per-unit ticks and keeps BT authoring designer-friendly.

- **`UCommanderComponent`** on a server-side `ACommanderController` owns the observation
  buffer (`FPlayerObservationSnapshot`, plain structs — no UObjects/GC in the hot path),
  the archetype weight vector, the seeded `FRandomStream`, and a utility scorer.
- **Time-sliced eval** via `FTimerManager` (default 5 s); scoring math runs on a background
  thread (`AsyncTask`), results marshalled back to the game thread before any Blackboard
  write — the primary mechanism for zero frame-rate impact (t24).
- **Data-driven config:** `UCommanderArchetypeDataAsset` (one per difficulty preset) +
  `FArchetypeThresholdRow` DataTable for transition thresholds — the designer tuning
  surface (t3, t10). Pin DataAssets as hard refs at match start (avoid async-load race).
- **Squad integration:** `UCommanderSubsystem` (world subsystem, atomic
  `GetCurrentDirective`) is polled by `UBTService_CommanderDirective`, which writes the
  `CommanderOrder` blackboard key. EQS converts abstract orders
  (Advance / Defend / Harass / Expand) into world positions (t11, t12). The strategic layer
  never calls EQS directly.
- **Determinism:** one `FRandomStream` seeded from a match seed in `AGameState`; no
  `FMath::GlobalRandom`; integer-bucketed scoring where possible. Decisions are appended to
  a binary decision log (`FArchive`); `bReplayMode` bypasses the scorer and replays the log;
  a SHA-256 state-snapshot hash gates determinism in CI (t13, t17).
- **Telemetry:** `FOnCommanderDecision` multicast → BP-subclassable
  `UCommanderTelemetryComponent` writes JSON-L on a background thread (t14).
- **Dev tooling:** UMG debug HUD (archetype, weights, score, countdown) + in-editor
  live-reload tuning sliders, both stripped from shipping (t19).

**Key engine watch-outs:** Blackboard is not thread-safe (marshal back, never write from
the background task); register the commander timer in `HandleMatchHasStarted` (timers don't
survive seamless travel); confirm `FRandomStream` output stability across UE5 minor
versions before freezing the replay format; full-cook before determinism regression runs.

## Simulation requirements (Sim Engineer)

A **headless sim harness** mirrors the in-engine models so adaptation can be validated and
tuned without the editor. The model/determinism kernel is built once in the sim layer
(t5, t7, t8, t9) and wrapped for UE (t10).

- **Player-behavior model:** unit composition, attack tempo (rolling mean/stddev, earliest
  attack), map control, economic aggression, harassment preference. Event-driven for
  discrete events; 5 s poll for continuous signals. Exponential confidence decay with a
  designer-tunable half-life. Starts neutral (0.5).
- **World/threat model:** own/enemy inventories (node positions, HP, observation age),
  resource state, per-zone threat with distance + staleness decay. Recomputed each AI
  decision tick (default 2 s). No omniscience — only scouted observations.
- **Strategy portfolio:** scored strategies with hysteresis (anti-thrash) and an aggression
  clamp to `aggressionCeiling`.
- **Determinism:** fixed logical ticks (default 100 ms); single seeded platform-independent
  RNG with per-subsystem child seeds; no wall-clock / thread-scheduling influence;
  append-only snapshot log; replay reconstructs state from seed + event stream and must
  match the stored hash.
- **Scenarios S1–S8** (data files, machine-checkable pass criteria): S1 passive baseline
  (no false adaptation), S2 rush detect+counter (≤4 s), S3 composition pivot, S4
  adaptation-rate sweep (monotonic reaction-time curve), S5 aggression-ceiling clamp
  (zero violations), S6 stale-observation decay, S7 determinism CI gate (byte-identical
  trace ×3), S8 scripted-baseline believability comparison.
- **Validation metrics:** strategy-switch rate 0.5–3.0/min, adaptation lag decreasing with
  rate, replay hash match 100%, positive behavioral divergence vs scripted baseline, plus a
  designer human sign-off on trace believability.

## Prioritized task breakdown

Priority: **P0** foundations/blockers · **P1** core feature · **P2** validation & polish ·
**P3** nice-to-haves.

| ID | Task | Owner | Pri | Hrs | Day | Deps |
|---|---|---|---|---|---|---|
| t1 | Author StrategyContext blackboard contract | gamedesign | P0 | 2 | 1 | — |
| t2 | Define player-behavior model schema | simulation | P0 | 2.5 | 1 | — |
| t4 | Scaffold ACommanderController + UCommanderComponent | unreal | P0 | 2 | 2 | t1 |
| t5 | Seeded RNG with child-seed derivation | simulation | P0 | 1.5 | 2 | t2 |
| t3 | Archetype doctrine tables + difficulty presets | gamedesign | P1 | 3 | 3 | t1 |
| t6 | FPlayerObservationSnapshot struct + circular buffer | unreal | P1 | 2.5 | 3 | t2, t4 |
| t7 | Fixed-tick sim loop with event ingestion | simulation | P1 | 4 | 4 | t5 |
| t8 | Player-behavior + world/threat model | simulation | P1 | 5 | 5 | t7 |
| t9 | Strategy portfolio scorer (hysteresis + ceiling) | simulation | P1 | 4 | 6 | t8 |
| t10 | UE utility scorer + DataAsset + DataTable | unreal | P1 | 4 | 7 | t3, t5, t6, t9 |
| t24 | Async time-slice eval cycle + perf validation | unreal | P1 | 4 | 8 | t10 |
| t11 | UCommanderSubsystem facade + BT service | unreal | P1 | 3 | 9 | t1, t10 |
| t20 | Prototype offline pattern sampler | gamedesign | P3 | 3 | 9 | t2, t3 |
| t12 | EQS order-to-position queries | unreal | P1 | 4 | 10 | t11 |
| t13 | Decision log + replay mode + SHA-256 snapshot | unreal | P1 | 5 | 11 | t10, t7 |
| t15 | Headless sim harness CLI | simulation | P1 | 5 | 12 | t9, t13 |
| t25 | Author S1–S8 scenarios + S7 CI gate | simulation | P1 | 5 | 13 | t15 |
| t14 | Telemetry component + JSON-L + CI schema validation | unreal | P2 | 5 | 14 | t10 |
| t17 | Automation test suite | unreal | P1 | 4 | 15 | t13, t14, t24 |
| t18 | Commander bark script + adaptation telegraph | gamedesign | P2 | 2 | 15 | t14 |
| t16 | Adaptation-rate sweep + tuning curve + baseline | simulation | P2 | 4 | 16 | t25 |
| t21 | Enforce archetype blend legibility rule | gamedesign | P3 | 1.5 | 16 | t10, t25 |
| t19 | Debug HUD widget + designer tuning UI | unreal | P2 | 3 | 17 | t10, t11 |
| t22 | Playtest legibility pass (Normal) | gamedesign | P2 | 2.5 | 18 | t18, t19, t17 |
| t23 | Playtest fairness pass (Hard) | gamedesign | P2 | 3 | 19 | t22 |

## Day-by-day schedule (6h/day cap)

| Day | Tasks | Hours |
|---|---|---|
| 1 | t1, t2 | 4.5 |
| 2 | t4, t5 | 3.5 |
| 3 | t3, t6 | 5.5 |
| 4 | t7 | 4.0 |
| 5 | t8 | 5.0 |
| 6 | t9 | 4.0 |
| 7 | t10 | 4.0 |
| 8 | t24 | 4.0 |
| 9 | t11, t20 | 6.0 |
| 10 | t12 | 4.0 |
| 11 | t13 | 5.0 |
| 12 | t15 | 5.0 |
| 13 | t25 | 5.0 |
| 14 | t14 | 5.0 |
| 15 | t17, t18 | 6.0 |
| 16 | t16, t21 | 5.5 |
| 17 | t19 | 3.0 |
| 18 | t22 | 2.5 |
| 19 | t23 | 3.0 |

**Critical path:** t2 → t5 → t7 → t8 → t9 → t10 → t13 → t15 → t25 → t14 → t17 → t19 →
t22 → t23. The adaptation-model chain (t7→t8→t9) and the determinism chain
(t13→t15→t25) dominate; the t22/t23 playtests are the validation tail.
