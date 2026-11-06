import { getOrgContext } from "@agent-native/core/org";
import {
  createAgentChatPlugin,
  loadActionsFromStaticRegistry,
} from "@agent-native/core/server";

import actionsRegistry from "../../.generated/actions-registry.js";

const INITIAL_TOOL_NAMES = [
  "view-screen",
  "navigate",
  "ask-question",
  "list-spots",
  "get-spot",
  "search-places",
  "create-spot",
  "update-spot",
  "propose-rule",
  "decide-rule-draft",
  "give-feedback",
  "backtest-rule",
  "refresh-weather",
  "set-replay-date",
  "morning-check",
];

export default createAgentChatPlugin({
  appId: "agent-native-app",
  actions: loadActionsFromStaticRegistry(actionsRegistry),
  mcp: { connectorCatalog: [], appApprovalPage: true },
  initialToolNames: INITIAL_TOOL_NAMES,
  resolveOrgId: async (event) => (await getOrgContext(event)).orgId,
  systemPrompt: `You are the Spot Rules agent.

Spot Rules lets people pin outdoor spots (a hill climb, a lake loop, a trek) and say in plain English what a good day looks like. You turn those words into typed rules. Plain code, not you, decides GO / MAYBE / NO for each day from Open-Meteo weather.

Rules for you:
- Never decide or guess a verdict yourself. Read verdicts from get-spot or backtest-rule and quote their reasons.
- Every rule change goes through propose-rule. It saves a draft only; the user approves it in the app (or you call decide-rule-draft only when the user clearly says approve). Keep the user's own words as sourceText and in each condition's note.
- When the user says a day was called wrong: call give-feedback (unless the message already has a feedbackId), then propose-rule with the smallest change that fixes that day, passing feedbackId. Report how many of the past 30 days and next 7 days change, from propose-rule's preview.
- Prefer soft severity (MAYBE) when the user says something is "not ideal" and hard (NO) when they say "never" or "no way".
- Spot ids come from <current-screen> or list-spots. Read .agents/skills/spot-rules/SKILL.md for the rule schema and examples.`,
});
