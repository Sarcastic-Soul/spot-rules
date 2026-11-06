import { defineAction } from "@agent-native/core/action";
import { and, eq, max } from "drizzle-orm";
import { z } from "zod";

import { ruleBodySchema } from "../shared/rules.js";
import { getDb, schema } from "../server/db/index.js";
import { getOwnedSpot, requireEmail } from "../server/lib/spots.js";

// Direct edits from the rule chips in the UI. Hidden from the agent: the agent
// must go through propose-rule so the user reviews every agent change.
export default defineAction({
  description: "Save a hand-edited rule as the new active version (UI chip editor only).",
  schema: z.object({
    spotId: z.string().describe("Spot id"),
    body: ruleBodySchema,
    sourceText: z.string().min(3).max(600).describe("Rule in plain English"),
    reason: z.string().max(300).optional().describe("What changed"),
  }),
  agentTool: false,
  run: async (args, ctx) => {
    const ownerEmail = requireEmail(ctx);
    const spot = await getOwnedSpot(args.spotId, ownerEmail);
    return getDb().transaction(async (tx) => {
      const r = schema.rules;
      await tx.select({ id: schema.spots.id }).from(schema.spots).where(eq(schema.spots.id, spot.id)).for("update");
      const [topRow] = await tx.select({ top: max(r.version) }).from(r).where(eq(r.spotId, spot.id));
      const version = (topRow?.top ?? 0) + 1;
      const now = new Date().toISOString();
      await tx.update(r).set({ status: "archived", decidedAt: now }).where(and(eq(r.spotId, spot.id), eq(r.status, "active")));
      const id = crypto.randomUUID();
      await tx.insert(r).values({
        id,
        spotId: spot.id,
        version,
        body: args.body,
        sourceText: args.sourceText.trim(),
        status: "active",
        createdBy: "user",
        reason: args.reason?.trim() || "Edited by hand",
        ownerEmail,
        decidedAt: now,
      });
      return { id, version };
    });
  },
});
