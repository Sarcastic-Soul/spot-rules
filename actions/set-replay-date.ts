import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { addDays } from "../shared/evaluate.js";
import { getDb, schema } from "../server/db/index.js";
import { requireEmail, todayIn } from "../server/lib/spots.js";

export default defineAction({
  description:
    "Replay mode: pretend 'today' is a past date so verdicts use the real weather that happened (repeatable demos). Pass date null to go back to live forecasts.",
  schema: z.object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .describe("Past date YYYY-MM-DD within the last 35 days, or null for live"),
  }),
  run: async ({ date }, ctx) => {
    const ownerEmail = requireEmail(ctx);
    if (date) {
      const today = todayIn("UTC");
      if (date > addDays(today, -1) || date < addDays(today, -35))
        fail("Pick a date between 35 days ago and yesterday.", { errorCode: "invalid_date" });
    }
    const now = new Date().toISOString();
    await getDb()
      .insert(schema.userSettings)
      .values({ ownerEmail, replayDate: date, updatedAt: now })
      .onConflictDoUpdate({ target: schema.userSettings.ownerEmail, set: { replayDate: date, updatedAt: now } });
    return { replayDate: date };
  },
});
