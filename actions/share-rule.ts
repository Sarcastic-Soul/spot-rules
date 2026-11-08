import { defineAction, fail } from "@agent-native/core/action";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { getOwnedSpot, getRuleByStatus, requireEmail } from "../server/lib/spots.js";

export default defineAction({
  description:
    "Make (or revoke) a public read-only link to a spot's live rule. Anyone with the link sees the spot name, activity, rule and its next 7 calls, but not the coordinates. Needs the user's approval when the agent calls it. Returns the path /r/<token>; revoke turns off every link for the spot.",
  schema: z.object({
    spotId: z.string().describe("Spot id"),
    revoke: z.boolean().optional().describe("true = turn off the spot's links instead of making one"),
  }),
  needsApproval: (args) => !args.revoke,
  run: async ({ spotId, revoke }, ctx) => {
    const ownerEmail = requireEmail(ctx);
    const spot = await getOwnedSpot(spotId, ownerEmail);
    const db = getDb();
    const t = schema.ruleShares;
    const live = and(eq(t.spotId, spot.id), eq(t.ownerEmail, ownerEmail), isNull(t.revokedAt));
    if (revoke) {
      const rows = await db.update(t).set({ revokedAt: new Date().toISOString() }).where(live).returning({ token: t.token });
      return { spotId: spot.id, revoked: rows.length, path: null };
    }
    if (!(await getRuleByStatus(spot.id, "active")))
      fail("This spot has no live rule to share yet.", { errorCode: "no_rule", statusCode: 409 });
    const [existing] = await db.select({ token: t.token }).from(t).where(live).limit(1);
    if (existing) return { spotId: spot.id, path: `/r/${existing.token}`, created: false };
    // 128 bits of randomness, URL-safe.
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    await db.insert(t).values({ token, spotId: spot.id, ownerEmail });
    return { spotId: spot.id, path: `/r/${token}`, created: true };
  },
});
