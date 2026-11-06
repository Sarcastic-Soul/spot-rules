---
name: spot-rules
description: >-
  How to turn a user's plain-English "good day" description into a Spot Rules
  rule body, how to fix a rule after the user says a day was called wrong, and
  how to read verdicts. Use for any request about spots, rules, verdicts,
  backtests, replay mode or the morning check.
---

# Spot Rules

## Who decides what

- You write rule drafts. Plain code (`shared/evaluate.ts`) decides verdicts.
- Never state a GO / MAYBE / NO you did not read from `get-spot`,
  `backtest-rule` or a `propose-rule` preview.
- Nothing goes live until the user approves the draft.

## Rule body

```json
{
  "window": { "startHour": 5, "endHour": 10, "minHours": 2 },
  "days": [0, 6],
  "conditions": [
    { "id": "c1", "metric": "precipitation", "op": "<=", "value": 0.2,
      "scope": { "kind": "lookback", "hours": 18 }, "agg": "sum",
      "severity": "hard", "note": "no rain since 6 pm the day before" },
    { "id": "c2", "metric": "wind_speed", "op": "<", "value": 20,
      "scope": { "kind": "window" }, "agg": "max", "severity": "hard",
      "note": "wind under 20" },
    { "id": "c3", "metric": "temperature", "op": "between", "value": [12, 30],
      "scope": { "kind": "window" }, "agg": "max", "severity": "soft" }
  ]
}
```

- `window`: local hours. The evaluator looks for the best run of `minHours`
  inside `startHour`..`endHour` (end is exclusive, max 24).
- `days`: optional weekday filter, 0 = Sunday. Other days show as SKIP.
- Metrics: temperature, apparent_temperature (°C), precipitation (mm),
  precipitation_probability, cloud_cover, relative_humidity (%), wind_speed,
  wind_gusts (km/h), uv_index, visibility (m).
- `op`: `<`, `<=`, `>`, `>=`, or `between` with `[min, max]`.
- `scope`: `window` (during the activity) or `lookback` with `hours` (the hours
  before the run starts, e.g. rain that makes trails muddy).
- `agg`: `sum` for rain totals, `max` for "never above", `min` for "never
  below", `avg` rarely.
- `severity`: `hard` fail = NO, `soft` fail = MAYBE. Use soft for "not ideal",
  "prefer", "ideally"; hard for "never", "no way", "must".
- Keep the user's words in `sourceText` and in each condition's `note`.
- "Since 6 pm the day before" with a 5 am start = lookback 11 hours. Work out
  the hours from the window start.

## Fixing a wrong call

1. The UI sends the user's message with `feedbackId` and `spotId` in context.
   If there is no feedbackId, call `give-feedback` first.
2. Read the failing condition from the feedback result or `get-spot`.
3. Make the smallest change that fixes that day: move one threshold, switch
   hard to soft, change the metric (wind_speed to wind_gusts), or shorten a
   lookback. Do not rewrite the whole rule.
4. Call `propose-rule` with `feedbackId` and a one-line `reason`.
5. Report from the preview: how many of the past 30 and next 7 days change,
   and whether the feedback day now matches what the user said.

## Other actions

- `list-spots`, `get-spot`, `backtest-rule` for reading.
- `create-spot` needs lat/lon; use `search-places` first for a place name.
- `set-replay-date` (`null` = live) for demos on past weather.
- `morning-check` posts today's and tomorrow's calls to the inbox. To run it
  every day, create an automation with `manage-automations`
  (schedule `0 6 * * *`, instructions "Run morning-check").
