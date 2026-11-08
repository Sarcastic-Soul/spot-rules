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
- `window.anchor` (optional): follow the sun instead of the clock.
  `{ "to": "sunrise", "startOffset": -1, "endOffset": 2 }` = from an hour
  before sunrise to two hours after. Use it for "golden hour", "first light",
  "before sunset". Offsets are whole hours from the sunrise hour (first
  daylight hour) or sunset hour (first dark hour); `endOffset - startOffset`
  must be at least `minHours`. Still fill startHour/endHour with rough clock
  hours; they are the fallback when daylight data is missing.
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

## Pitfalls (check every draft)

- A condition is what a GOOD day needs; it passes when true. Write the bad case
  the other way round: "if cloud is over 80% call it maybe" = `cloud_cover <= 80`
  soft, never `cloud_cover > 80`. "Not above 32" = `<= 32`.
- `endHour` is when the activity must be finished, not the latest start.
  "Start between 6 and 10 am, 4 hours" = `startHour 6, endHour 14, minHours 4`.
  "Between 6 and 10 am for 2 hours" (no "start") = `startHour 6, endHour 10`.
- "Weekends" = `days: [0, 6]`.

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
6. Navigate to the spot with `tab` "past" so the changed days show.

## Reading `feedbackCheck`

`propose-rule` (`preview.feedbackCheck`) and `get-spot` (`draft.effect.feedbackCheck`)
list the draft's verdict on every day the user gave feedback on:
`before` (active rule), `after` (draft), `userSays`, `matches`, `wasMatching`.
- `matches` true: the draft agrees with the user on that day.
- `matches` false and `wasMatching` true: the draft breaks a day the user
  already confirmed. Tell the user which date and note, and offer a smaller
  change before they approve.
- `after` "UNKNOWN": no weather for that day; do not count it either way.

## Other actions

- `list-spots`, `get-spot`, `backtest-rule` for reading.
- `create-spot` needs lat/lon; use `search-places` first for a place name.
- `update-spot` renames a spot, changes its activity or moves the pin.
- `delete-spot` removes a spot and everything under it; it needs the user's approval.
- `refresh-weather` fetches fresh weather for one spot or all.
- `edit-rule` is UI-only (rule chip edits). Every agent change goes through a reviewed draft from `propose-rule`.
- `navigate` takes `view`, `spotId`, `tab` (next, past, history) and `day`
  (YYYY-MM-DD). After `propose-rule`, navigate to `tab` "past".
- `compare-spots` ranks all spots for one date. For "where should I ride
  Saturday?": turn the weekday into a date from today's date, call
  `compare-spots`, answer from its ranking, then `navigate` to the top spot.
- `view-screen` returns the navigation state and, on a spot screen, the spot,
  active rule version, open draft with changed-day counts, the selected day's
  verdict with per-condition results, and open feedback.
- `share-rule` makes a public read-only link (`path` like `/r/<token>`) to
  the spot's live rule and next 7 calls. It needs approval. Give the user the
  full URL. `revoke: true` turns every link for the spot off.
- `set-replay-date` (`null` = live) for demos on past weather.
- `morning-check` posts today's and tomorrow's calls to the inbox. To run it
  every day, create an automation with `manage-automations`
  (schedule `0 6 * * *`, instructions "Run morning-check").
