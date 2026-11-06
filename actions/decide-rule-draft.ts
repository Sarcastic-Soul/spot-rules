import { defineAction, fail } from "@agent-native/core/action";
import { and, eq, max } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireEmail } from "../server/lib/spots.js";

export default defineAction({
  description:
    "Approve or reject a spot's pending draft rule. Approving makes it the active rule as a new version (needs the user's approval when the agent calls it). Usually the user clicks Approve in the panel instead.",
  schema: z.object({
    draftId: z.string().describe("Draft rule id"),
    decision: z.enum(["approve", "reject"]).describe("approve = make it live, reject = discard it"),
  }),
  needsApproval: (args) => args.decision === "approve",
  run: async ({ draftId, decision }, ctx) => {
    const ownerEmail = requireEmail(ctx);
    return getDb().transaction(async (tx) => {
      const r = schema.rules;
      const [draft] = await tx
        .select()
        .from(r)
        .where(and(eq(r.id, draftId), eq(r.ownerEmail, ownerEmail)))
        .for("update");
      if (!draft) fail("Draft not found.", { errorCode: "not_found", statusCode: 404 });
      if (draft.status !== "draft")
        fail(`This draft was already ${draft.status}.`, { errorCode: "not_a_draft", statusCode: 409 });
      const now = new Date().toISOString();
      if (decision === "reject") {
        await tx.update(r).set({ status: "rejected", decidedAt: now }).where(eq(r.id, draftId));
        return { draftId, status: "rejected" as const, version: null };
      }
      const [topRow] = await tx
        .select({ top: max(r.version) })
        .from(r)
        .where(eq(r.spotId, draft.spotId));
      const version = (topRow?.top ?? 0) + 1;
      await tx
        .update(r)
        .set({ status: "archived", decidedAt: now })
        .where(and(eq(r.spotId, draft.spotId), eq(r.status, "active")));
      await tx.update(r).set({ status: "active", version, decidedAt: now }).where(eq(r.id, draftId));
      if (draft.feedbackId) {
        await tx
          .update(schema.feedback)
          .set({ status: "resolved", resolvedByVersion: version })
          .where(eq(schema.feedback.id, draft.feedbackId));
      }
      return { draftId, status: "active" as const, version, spotId: draft.spotId };
    });
  },
});
