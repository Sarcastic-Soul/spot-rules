# Spot Rules — Agent Guide

Spot Rules is built on the agent-native chat template. `/` redirects to shared sign-in, then `/spots` (`app.homePath` in `server/plugins/agent-native-email-branding.ts`). Chat lives at `/chat`. Actions carry capabilities; screens exist only for durable workflows. Database admin and observability screens from the template were removed.

## Skills

Search with `rg --hidden --follow`; read the exact linked guide before deeper work. `.agents/skills/build-an-app/SKILL.md` — start here for vague requests to create a domain app. `.agents/skills/adding-a-feature/SKILL.md` — cross-area feature checklist. Data/integrations: `.agents/skills/actions/SKILL.md`, `.agents/skills/storing-data/SKILL.md`, `.agents/skills/security/SKILL.md`, `.agents/skills/secrets/SKILL.md`, `.agents/skills/sharing/SKILL.md`. UI: `.agents/skills/frontend-design/SKILL.md`, `.agents/skills/shadcn-ui/SKILL.md`, `.agents/skills/client-side-routing/SKILL.md`. Agent context/workflows: `.agents/skills/context-awareness/SKILL.md`, `.agents/skills/real-time-sync/SKILL.md`, `.agents/skills/reliable-mutations/SKILL.md`, `.agents/skills/performance/SKILL.md`, `.agents/skills/delegate-to-agent/SKILL.md`. Framework: `.agents/skills/agent-native-docs/SKILL.md`, `.agents/skills/agent-native-toolkit/SKILL.md`, `.agents/skills/customizing-agent-native/SKILL.md`.

Use local docs only (no web research): `pnpm action docs-search --query "<topic>"`, `pnpm action docs-search --slug "<slug>"`, `pnpm action docs-search --list`, `pnpm action source-search --query "<pattern>"`, `pnpm action source-search --path <path>`, or `pnpm action source-search --list`. For external-agent integrations, read `pnpm action docs-search --slug "external-agents"`.

## Core rules

- UI feedback: target 100 ms, never exceed 400 ms; acknowledge before network work.
- Normal app data must flow through actions. Keep actions deterministic and focused; use agent chat/AgentSidebar for AI work and follow-ups in the same thread. Keep structured state in SQL and large files in configured storage; persist references only.
- For external integrations, inspect the workspace/provider connection catalog first; reuse its scoped resolver. Never hardcode credentials, webhook URLs, or private/customer data.
- Never fabricate. Report failures and recover; verify writes by reading the row or screen. Navigation is in `<current-screen>`; use `view-screen` for fresh visible-record details.

For custom branding, keep `server/plugins/agent-native-email-branding.ts` aligned: `app.name` appears in transactional email and optional `app.logoUrl` must be an absolute HTTPS URL.

## Application state

- `navigation` describes the view and selected ids. Chat is `chat` at `/chat` and `/chat/<threadId>`; spots are `spots` at `/spots` and `/spots/<id>`; `/` opens shared sign-in/signup, then `/spots`.
- Use `navigate` when supported and `view-screen` for a fresh read of visible details; basic navigation is already in `<current-screen>`.

## Changing the app

Domain routes live in `app/routes/` (`spots*.tsx`). The sidebar link is in `app/components/layout/Sidebar.tsx`; `app.homePath` is set in `server/plugins/agent-native-email-branding.ts`. Use `adding-a-feature` for functional parity and `frontend-design` for a user-facing screen. `README.md` (overview and run steps), `DESIGN.md` (the look) and `docs/SPEC.md` (spec and what shipped) describe this app; keep them in step with changes.

After all edits run `pnpm test`, `pnpm typecheck` and `pnpm agent-native:doctor`; fix findings before done. Production builds use `NITRO_PRESET=vercel` (set in `vercel.json`); a plain `node` preset build misses nested dependencies such as `yjs` on Vercel.

## Spot Rules (this app)

Spot Rules: users pin outdoor spots and describe a good day in plain English. The agent writes typed rule drafts; `shared/evaluate.ts` (plain code) decides GO / MAYBE / NO from Open-Meteo weather. Never decide or guess a verdict; read it from `get-spot` or `backtest-rule`.

- Screens: `/spots` (list + map), `/spots/:id?tab=next|past|history&day=YYYY-MM-DD`. Navigation state carries `view: "spots"`, `spotId`, `tab`, `day`.
- Rule changes always go through `propose-rule` (saves a draft and returns its effect, including `feedbackCheck`). Users approve in the UI; call `decide-rule-draft` only when the user clearly says approve. `edit-rule` is UI-only (chip edits); the agent never calls it.
- Wrong call: `give-feedback` (UI usually did this and passes `feedbackId`), then `propose-rule` with the smallest change plus `feedbackId`. Report changed days from the preview.
- Reading: `list-spots`, `get-spot`, `backtest-rule`, `compare-spots` (rank spots for one day; the "Where to go" panel on `/spots` shows the same ranking and puts the picked day in navigation as `compareDate`), `view-screen` (what the user sees, including the open draft and selected day). `navigate` takes `spotId`, `tab`, `day`.
- Spot management: `create-spot`, `update-spot`, `delete-spot` (needs approval), `search-places`, `refresh-weather`.
- Sharing: `share-rule` makes a public read-only link `/r/<token>` (rule + next 7 calls, no coordinates; needs approval); `revoke: true` turns the spot's links off. The page reads `server/routes/api/public/rules/[token].get.ts`, listed in `publicPaths` in `server/plugins/auth.ts`.
- Sunrise/sunset: a rule window can carry `anchor: { to: "sunrise"|"sunset", startOffset, endOffset }`; the evaluator moves the window each day from Open-Meteo's `is_day` hours.
- Replay: `set-replay-date` freezes "today" on cached real weather for demos.
- Daily summary: `morning-check`. To schedule it, create an automation with `manage-automations` (e.g. cron `0 6 * * *`, instructions "Run morning-check").
- Rule schema, examples and pitfalls: `.agents/skills/spot-rules/SKILL.md`.
- Write numbers and units as plain text (e.g. "gusts under 35 km/h"). Never use LaTeX or `$...$` math in replies.
