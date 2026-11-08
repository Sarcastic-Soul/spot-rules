# Spot Rules: Product Spec

Status: v1 shipped and live at https://spot-rules.vercel.app (2026-11-07). The
plan was written 2026-11-06 before the build. Section 10 ticks only what was
checked, section 11 lists what changed during the build, and the "Later" list
is the next step.

## 1. Problem

People who do outdoor things (cycling, running, kite surfing, hiking, fishing,
drying laundry, shooting photos at sunrise) all check the weather the same way:
open an app, scroll hourly numbers, and do the maths in their head against
their own private rules ("no rain in the last 24h or the trail is mud", "wind
under 20 km/h", "gusts matter more than average wind").

Those rules live only in their head. Weather apps show numbers, not decisions.
Generic alert tools (IFTTT and similar) need you to know the exact metric and
threshold up front, and they never learn when they get it wrong.

## 2. Product in one line

Pin your places, describe in plain English what a good day looks like for each,
and get a clear GO / MAYBE / NO for the next 7 days. When a call is wrong, say
why and the rule updates in front of you.

## 3. Who it is for

- Main user: one person with 2-6 regular outdoor spots and habits.
- Demo persona: a cyclist / runner with a hill climb, a lake loop and a
  weekend trek spot.

## 4. Core loop (people + agent)

1. **Pin a spot.** Search a place or click the map. Pick an activity.
2. **Say the rule in plain English.** "Good ride = no rain since yesterday
   evening, wind under 20, start between 6 and 9 am, not above 32 °C."
3. **Agent drafts a typed rule.** It turns the sentence into structured
   conditions and shows them as chips. You approve, edit or reject the draft.
   Nothing is saved until you approve.
4. **Code decides, not the model.** A plain TypeScript evaluator checks each
   condition against real Open-Meteo data. Every verdict shows which condition
   passed or failed and by how much. The model never decides GO / NO.
5. **Backtest.** See how the rule would have called the last 30 days. Mark days
   you remember ("that Sunday was great", "that one was a mess").
6. **Correct it.** Tap a verdict and say why it is wrong ("too gusty", "it was
   fine, 22 km/h is OK"). The agent proposes a rule change as a visible diff
   (`wind < 20` becomes `gusts < 30`). You approve it. The backtest re-runs and
   shows how many past calls changed.
7. **Morning check.** A scheduled automation refreshes forecasts daily, works
   out verdicts, and puts a summary in the in-app notification inbox
   ("Tomorrow: Hill climb GO, Lake loop NO (rain 2 mm at 7 am)").

## 5. Features

### Must have (v1)

| # | Feature | Notes |
|---|---|---|
| F1 | Map with pinned spots | MapLibre GL + OpenFreeMap tiles (no key, no usage limit). Click to add, list beside the map. |
| F2 | Place search | Open-Meteo geocoding API. |
| F3 | Plain-English rule to typed rule | Agent drafts; user approves (`needsApproval`). |
| F4 | Rule chips | Each condition shown as an editable chip. Manual edit without the agent. |
| F5 | 7-day verdict strip per spot | GO / MAYBE / NO per day, best time window, reasons per condition. |
| F6 | Deterministic evaluator | Pure function, unit tested. Same input always gives same verdict. |
| F7 | Backtest over past 30 days | Uses Open-Meteo `past_days`. Shows how many days were GO. |
| F8 | Feedback on a verdict | "Wrong because..." stored with the weather data of that day. |
| F9 | Agent-proposed rule change as diff | Approve / reject. Approved changes create a new rule version. |
| F10 | Rule history | Every version, who changed it (you or agent + approved), and why. |
| F11 | Morning automation | Scheduled job + "Run now". Writes verdicts and an inbox notification. |
| F12 | Agent sees the screen | Current spot / day / view written to `application_state`; agent can navigate the UI. |
| F13 | Live updates | Agent edits show up in the UI without reload (`useDbSync`). |
| F14 | Replay / demo mode | Freeze "today" to a recorded date with cached real weather, so the demo is repeatable. |
| F15 | Live deploy | Vercel + Neon Postgres. |

### Should have (if time)

- S1: Compare spots for one day ("where should I ride Saturday?").
- S2: Rule templates per activity (cycling, kite, hike, laundry, photo).
- S3: Sunrise / sunset aware windows ("golden hour, low cloud").
- S4: Share a rule as a link.

### Later (go broad or go deep)

- Broad: more data (air quality, tide, UV, snow), calendar sync to block GO
  windows, Telegram / email digest, multiple users sharing a spot.
- Deep: learn thresholds from many feedback points (suggest "your real limit is
  gusts 27"), confidence from ensemble forecasts, per-season rules.

## 6. Rule model (typed, not prompt text)

```ts
type Metric =
  | "temperature" | "apparent_temperature" | "precipitation"
  | "precipitation_probability" | "wind_speed" | "wind_gusts"
  | "cloud_cover" | "relative_humidity" | "uv_index" | "visibility";

type Condition = {
  id: string;
  metric: Metric;
  op: "<" | "<=" | ">" | ">=" | "between";
  value: number | [number, number];
  scope:
    | { kind: "window" }          // during the activity window
    | { kind: "lookback"; hours: number }; // e.g. rain in the past 24h
  agg: "max" | "min" | "sum" | "avg";
  severity: "hard" | "soft";      // hard fail = NO, soft fail = MAYBE
  note?: string;                  // the user's words that created it
};

type Rule = {
  spotId: string;
  version: number;
  window: { startHour: number; endHour: number; minHours: number };
  days?: number[];                // 0-6, optional weekday filter
  conditions: Condition[];
  sourceText: string;             // the original plain-English rule
};
```

Verdict per day: find the best run of `minHours` inside the window. NO if any
hard condition fails in every candidate run, MAYBE if only soft ones fail, GO
otherwise. Store per-condition actual value and margin for the UI.

## 7. Architecture

```
Browser (React Router + Agent-Native client)
  Map, spot list, verdict strip, rule chips, diff review, backtest
  <AgentSidebar />  writes navigation/selection to application_state
        |  useActionQuery / useActionMutation / useDbSync
        v
Actions (defineAction, one definition = UI call + agent tool + HTTP + MCP)
        |
        +-- evaluator (pure TS, no LLM)
        +-- open-meteo client (forecast, past_days, geocoding) + cache
        v
Postgres (PGlite local, Neon in production) via Drizzle
        ^
Agent (Gemini Flash-Lite via ai-sdk) uses the same actions
Automation "morning-check" (cron) -> refresh + evaluate + notify()
```

Rules the build follows:
- All state in the DB. No LLM calls from the UI; all AI goes through the agent.
- Every feature has UI + action + skill/AGENTS.md entry + app state.
- The model writes structured rule drafts only. Verdicts come from code.

### Tables (Drizzle)

| Table | Key columns |
|---|---|
| `spots` | id, owner, name, lat, lon, timezone, activity, created_at |
| `rules` | id, spot_id, version, window, days, conditions (jsonb), source_text, status (`active`/`draft`/`archived`), created_by (`user`/`agent`), reason, created_at |
| `weather_cache` | spot_id, timezone, hourly (jsonb, 70 past days + 8 forecast days), fetched_at |
| `feedback` | id, spot_id, date, rule_version, user_says (`GO`/`MAYBE`/`NO`), reason_text, verdict (jsonb, the day's verdict and per-condition values), status, resolved_by_version |
| `spot_user_settings` | owner, replay_date (nullable) |

Verdicts are not stored. They are computed from the cached weather on every
read, so they always match the live rule.

### Actions

| Action | Who uses it | Approval |
|---|---|---|
| `search-places` | UI, agent | no |
| `create-spot` / `update-spot` / `delete-spot` | UI, agent | delete only |
| `list-spots` / `get-spot` | UI, agent | no |
| `propose-rule` | agent (turns English into a draft rule) | no, it only saves a draft |
| `decide-rule-draft` | UI button, agent | approve needs approval for the agent |
| `edit-rule` | UI chips only (hidden from the agent) | no |
| `refresh-weather` | UI, automation | no |
| `backtest-rule` | UI, agent (also for draft rules, to preview a change) | no |
| `give-feedback` | UI, agent | no |
| `morning-check` | automation, "Run now" | no |
| `set-replay-date` | UI, agent | no |
| `compare-spots` | agent (rank every spot for one day) | no |
| `navigate` / `view-screen` | agent; `navigate` takes `spotId`, `tab`, `day`; `view-screen` returns the open spot, draft, selected day and open feedback | no |

### Agent skill

`.agents/skills/spot-rules/SKILL.md`: how to read a spot, the rule schema,
"never decide verdicts yourself, read them from get-spot", "when the user disagrees
with a verdict, call give-feedback, then propose-rule with the smallest change
that fixes it, then backtest-rule on the draft and report how many past days
change".

## 8. Tech stack

| Layer | Choice |
|---|---|
| Framework | `@agent-native/core` 0.225.0, chat template (React Router, Nitro, Vite) |
| UI | React, Tailwind, shadcn/ui (from template), MapLibre GL (react-map-gl) + OpenFreeMap, Phosphor icons |
| DB | Drizzle ORM; PGlite locally, Neon Postgres in production |
| LLM | Google Gemini Flash-Lite via `ai-sdk:google` (free tier) |
| Weather | Open-Meteo forecast + geocoding (no key) |
| Tests | Vitest for the evaluator and rule parsing checks |
| Deploy | Vercel (`NITRO_PRESET=vercel`), Neon, Vercel cron for the morning check |

## 9. Limits and risks

| Risk | Plan |
|---|---|
| Gemini free tier: 15 RPM, 500 requests/day | Agent only used for drafting rules and changes; evaluator and morning check do not need the model to decide. |
| Flash-Lite gets the rule schema wrong | Zod-validate drafts, reject and retry once, user always approves. |
| Vercel Hobby cron runs once a day | Daily morning check is the natural cadence anyway. "Run now" for demos. Needs `CRON_SECRET`. |
| Live forecast changes during the demo | Replay mode (F14) on cached real data. |
| Open-Meteo usage terms | Free for non-commercial use, credit shown in the UI footer. |
| Map tiles | OSM volunteer servers block apps (403 seen in testing). Use OpenFreeMap; show OpenStreetMap attribution. |
| Looks like "IFTTT + weather" | Lead with plain-English rules, visible reasons, backtest, and corrections that change the rule. |

## 10. Done means

- [ ] A new user can pin a spot, write a rule in English, approve the draft and
      see a 7-day verdict strip in under 2 minutes.
- [x] Every verdict explains itself per condition. (Checked live 2026-11-07:
      each day shows its main reason, e.g. "rain 2.4 mm in past 24 h".)
- [ ] Disagreeing with a verdict produces a rule diff, and approving it visibly
      changes the backtest. (Rule v2 on the live app is "drafted by agent,
      approved by you", but I did not re-run the feedback flow in the final check.)
- [ ] The morning check runs from the scheduler and from "Run now" and leaves an
      inbox notification. ("Run now" works live and shows a summary toast. The
      scheduled run and the inbox entry were not checked.)
- [ ] The agent can do every UI action, and the UI can do every agent action.
- [x] Evaluator unit tests pass; `pnpm build` passes. (93 tests in 6 files,
      typecheck, doctor and build all exit 0 on 2026-11-07.)
- [x] Live on Vercel with Neon. (https://spot-rules.vercel.app: sign-in, spot
      list, spot detail and map load, actions return data. Pushes to `main`
      deploy through `vercel.json`.)
- [x] Draft card shows the feedback check, approving shows "Rule v3 live: 2
      past days and 1 upcoming day changed", and history shows the note behind
      each version. (Run in a browser against a local build on 2026-11-07.)
- [ ] Replay mode works on the live app. (The control is there; not exercised.)

## 11. Changes during the build

- Unit field dropped from conditions: units are fixed per metric
  (`METRIC_UNITS` in `shared/rules.ts`).
- No verdicts table (see Tables).
- Rule value ranges use a 2-number array, not a tuple: Gemini rejects tuple
  JSON schemas in tool definitions.
- Morning automation: automations in Agent-Native are per user and run by the
  agent. "Morning check" runs it now; "Run daily" asks the agent to create the
  `0 6 * * *` automation with `manage-automations`.
- Fixes after end-to-end testing: rule parsing pitfalls (a condition is what a
  good day needs, `endHour` is the finish time), the MapLibre worker in
  production builds, and place search ranked by distance.
- Added `shared/rules.test.ts` (rule schema checks). Removed the template
  `hello` action.
- After a four-judge review: starter rule templates per activity (S2, no model
  needed), `compare-spots` action for the agent (S1, no screen yet), a
  feedback check on every draft (which old notes it fixes, keeps or breaks),
  rule history with diffs and the note behind each version, weather cache
  widened to 70 past days so replay and backtest no longer go blank, and a real
  `view-screen`.
- Deploys: Vercel's own Git build used the plain `node` Nitro preset and
  crashed at start (`Cannot find package 'yjs'`). `vercel.json` now builds with
  `NITRO_PRESET=vercel` and a daily cron, which fixed it.
- Cleanup: removed template leftovers (Netlify config, migration script,
  database and observability screens, Slack provider action, unused UI
  wrappers, template changelog and dev guide). README, DESIGN, CHANGELOG and the
  web manifest now describe Spot Rules.
- Nov 8: "Where to go" panel on `/spots` (the screen for compare-spots, S1),
  sunrise/sunset windows (S3, `window.anchor` from Open-Meteo `is_day`, used by
  the photography template), public share links (S4, `share-rule` +
  `/r/<token>`, token-only, no coordinates), notification bell, and agent
  sends that wait for the chat to confirm before clearing the input.

## 12. Pre-existing work used

- Agent-Native chat template and `@agent-native/core` (Builder.io).
- Open-Meteo APIs, OpenFreeMap tiles (OpenStreetMap data), MapLibre GL, shadcn/ui, Phosphor icons.
- Everything in this spec beyond the template is new work.
