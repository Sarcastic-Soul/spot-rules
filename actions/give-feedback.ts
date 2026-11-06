import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { evaluateDay } from "../shared/evaluate.js";
import { getDb, schema } from "../server/db/index.js";
import {
  getOwnedSpot,
  getReplayDate,
  getRuleByStatus,
  loadWeather,
  requireEmail,
} from "../server/lib/spots.js";

export default defineAction({
  description:
    "Record that the app called a day wrong (e.g. said NO but it was fine). Stores the day's verdict and weather reasons. Then propose-rule with the smallest change that fixes it, passing this feedbackId.",
  schema: z.object({
    spotId: z.string().describe("Spot id"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Local date YYYY-MM-DD"),
    userSays: z.enum(["GO", "MAYBE", "NO"]).describe("What the verdict should have been"),
    reason: z.string().min(2).max(400).describe("The user's words, e.g. \"gusts 33 were fine\""),
  }),
  run: async (args, ctx) => {
    const ownerEmail = requireEmail(ctx);
    const spot = await getOwnedSpot(args.spotId, ownerEmail);
    const active = await getRuleByStatus(spot.id, "active");
    if (!active) fail("This spot has no active rule yet.", { errorCode: "no_rule", statusCode: 409 });
    const replayDate = await getReplayDate(ownerEmail);
    const weather = await loadWeather(spot, { replay: Boolean(replayDate) });
    const verdict = evaluateDay(active.body, weather.hourly, args.date);
    if (verdict.result === "UNKNOWN")
      fail("No weather data for that date.", { errorCode: "no_data", statusCode: 409 });
    const id = crypto.randomUUID();
    await getDb().insert(schema.feedback).values({
      id,
      spotId: spot.id,
      date: args.date,
      ruleVersion: active.version ?? 0,
      userSays: args.userSays,
      reasonText: args.reason.trim(),
      verdict,
      ownerEmail,
    });
    return {
      feedbackId: id,
      appSaid: verdict.result,
      userSays: args.userSays,
      conditions: verdict.conditions,
      activeRule: { version: active.version, body: active.body, sourceText: active.sourceText },
    };
  },
});
