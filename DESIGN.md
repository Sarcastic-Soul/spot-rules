# Visual Design Contract

Spot Rules looks like a field notebook: warm paper, dark ink, one burnt-orange accent. The verdict is the loudest thing on screen.

## Product mode

- Mode: `operate`
- Audience and cadence: one person with a few regular outdoor spots, checking each morning or before a trip.
- Primary workflow: open a spot, see the next 7 days at a glance, tap a day for reasons, correct a wrong call.

## Visual direction

- Direction name: Field notebook
- Palette: paper `hsl(40 38% 93%)`, ink `hsl(33 20% 11%)`, one accent `--signal` `hsl(16 71% 41%)`. No gradients and no second accent colour.
- Type: Fraunces (display, rule quotes and headings), Manrope (body), IBM Plex Mono (numbers, units and dates).
- Shape: square corners (`--radius: 0.125rem`), hairline borders, flat surfaces, no shadows for depth.
- Icons: Phosphor only.
- Motion: short fades and rises (180 ms), a staggered entrance on the 7-day strip, a brief highlight on days a new rule changed. All of it stops under `prefers-reduced-motion`.

## Verdicts never depend on colour

| Verdict | Fill | Extra cue |
|---|---|---|
| GO | solid accent | check mark |
| MAYBE | diagonal hatch | italic label |
| NO | muted grey | strikethrough |
| SKIP / UNKNOWN | empty | muted text |

The same cell styles are used in the list strip, the detail strip, the 30-day calendar and the map pins (`.cell-GO`, `.cell-MAYBE`, `.cell-NO` in `app/global.css`).

## Layout

- Spot page: tabs and the 7-day strip come first, above the rule, on desktop and phone. The rule shows as a large italic quote with editable chips below the strip. An open draft stays prominent above both.
- List page: map beside the spot list; each spot carries its own 7-day strip.
- The agent panel and the spots screens share one palette, so the chat feels like part of the same product.

## Voice

Plain and direct. Say what happened and what the user can do: "not live until you approve", "drafted by agent, approved by you", "Rule v3 live: 2 past days and 1 upcoming day changed". Write numbers and units as plain text, such as "gusts under 35 km/h".

## Anti-references

Weather-app blue skies, purple or blue gradients, gradient text, emoji, Lucide icons, card grids of equal tiles, and colour as the only signal for a verdict.
