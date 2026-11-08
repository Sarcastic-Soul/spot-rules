# Spot Rules

Pin the places you go outdoors, say in plain English what a good day looks like, and get a GO / MAYBE / NO for the next 7 days. When a call looks wrong, say why. The agent proposes the smallest rule change, you approve it, and the 30-day backtest shows which past days flip.

Built for the Builder.io Agent-Native Hackathon on [`@agent-native/core`](https://agent-native.com) 0.225.0.

**Live app:** https://spot-rules.vercel.app

## How it works

1. **Pin a spot.** Search a place or click the map, then pick an activity.
2. **Write the rule in English.** "No rain since last evening, wind under 20, ride between 6 and 9 am, below 32 C." Or start from a template.
3. **The agent drafts a typed rule.** It shows as editable chips. Nothing is live until you approve it.
4. **Plain code decides.** `shared/evaluate.ts` checks each condition against Open-Meteo data. The model never says GO or NO. Every verdict lists which conditions passed and by how much.
5. **Backtest.** See how the rule would have called the last 30 days.
6. **Correct it.** Tap a day, say why it is wrong, and the agent proposes a diff. The draft shows which days change and which of your earlier notes it fixes or breaks.
7. **Compare spots.** "Where to go" ranks your spots for any day of the week, best first, by plain code.
8. **Share a rule.** One click copies a public read-only link with the rule and its next 7 calls (no coordinates). Revoke from the agent.
9. **Follow the sun.** Rules can track sunrise or sunset ("golden hour"), so the window moves each day.
10. **Morning check.** One action refreshes every spot and posts a summary to the notification inbox. Schedule it from the agent.

Replay mode freezes "today" to a past date on cached real weather, so a demo gives the same result every time.

## Who does what

| | Agent | Plain code | You |
|---|---|---|---|
| Turn English into a typed rule | yes | validates it | approve it |
| Decide GO / MAYBE / NO | never | always | |
| Work out which days a change affects | | yes | review it |
| Edit a number on a rule | | | yes (chips) |

Every feature has four parts: a screen, an action, an entry in `AGENTS.md` and the spot-rules skill, and app state so the agent knows what you are looking at.

## Stack

- `@agent-native/core` chat template: React Router, Nitro, Vite, Tailwind, shadcn/ui
- MapLibre GL with OpenFreeMap tiles, Phosphor icons
- Drizzle ORM: PGlite locally, Neon Postgres in production
- Google Gemini through the AI SDK
- Open-Meteo for forecasts, past weather and place search (no key)
- Vitest: 98 tests for the evaluator, rule schema, templates, feedback check, weather cache and Open-Meteo client
- Vercel for hosting, with a daily cron for scheduled jobs

## Run it locally

Needs Node 22.22 or newer and pnpm.

```bash
pnpm install
cp .env.example .env     # add GOOGLE_GENERATIVE_AI_API_KEY to use the agent
pnpm dev
```

Local data lives in `data/pglite` and is created on first run. Without an API key the rest of the app works: templates, rule chips, verdicts, backtest and replay. Only the agent chat needs a model key.

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm test` | Run the tests |
| `pnpm typecheck` | Type check |
| `pnpm agent-native:doctor` | Framework checks |
| `pnpm build` | Production build |
| `pnpm action <name> --key value` | Run an action from the terminal |

## Deploy

`vercel.json` builds with `NITRO_PRESET=vercel`, which packages nested dependencies the way Vercel expects. Without it the function crashes with `Cannot find package 'yjs'`. It also sets the cron to once a day, which is the most the Hobby plan allows.

Set these in the Vercel project:

| Variable | Why |
|---|---|
| `DATABASE_URL` | Postgres, for example Neon |
| `BETTER_AUTH_SECRET` | Sign-in sessions (`openssl rand -hex 32`) |
| `CRON_SECRET` | Vercel sends it as the bearer for the cron |
| `GOOGLE_GENERATIVE_AI_API_KEY` | The agent |
| `AGENT_ENGINE` | Set to `ai-sdk:google` |

## Project layout

```
actions/    one file per capability (agent tool, UI call and HTTP endpoint at once)
shared/     evaluate.ts (verdicts), rules.ts (schema), feedback-check.ts, templates.ts
server/     db schema, Open-Meteo client, weather cache, agent plugin
app/        routes (/spots, /spots/:id), map, verdict strip, rule chips, draft card
docs/       SPEC.md, the product spec and what shipped
.agents/    skills the agent reads; spot-rules/SKILL.md is the app-specific one
```

More: [docs/SPEC.md](docs/SPEC.md) for the spec, [AGENTS.md](AGENTS.md) for how the agent works, [DESIGN.md](DESIGN.md) for the look.

## Data and credit

Weather and place search come from [Open-Meteo](https://open-meteo.com) (free for non-commercial use). Map data is from OpenStreetMap contributors, served by OpenFreeMap.
