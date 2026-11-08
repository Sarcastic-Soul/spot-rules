import { createToolkitAuthPlugin } from "@agent-native/toolkit/app/auth/server";

export default createToolkitAuthPlugin({
  workspaceAppPublicPaths: ["/"],
  rootAuth: true,
  marketing: false,
  // Shared rule links: read-only JSON keyed by an unguessable token.
  publicPaths: ["/api/public/rules"],
});
