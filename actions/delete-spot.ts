import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireEmail } from "../server/lib/spots.js";

export default defineAction({
  description: "Delete a spot with its rules, feedback and cached weather. Needs the user's approval.",
  schema: z.object({ id: z.string().describe("Spot id") }),
  needsApproval: true,
  run: async ({ id }, ctx) => {
    const ownerEmail = requireEmail(ctx);
    const [deleted] = await getDb()
      .delete(schema.spots)
      .where(and(eq(schema.spots.id, id), eq(schema.spots.ownerEmail, ownerEmail)))
      .returning({ id: schema.spots.id, name: schema.spots.name });
    if (!deleted) fail("Spot not found.", { errorCode: "not_found", statusCode: 404 });
    return deleted;
  },
});
