import { sendToAgentChatAndConfirm } from "@agent-native/core/client/agent-chat";

const COMPOSER = '[aria-label="Message agent..."]';

/** Open the agent panel and wait (up to `ms`) until its composer is mounted. */
async function openAgentPanel(ms = 10000) {
  if (document.querySelector(COMPOSER)) return;
  window.dispatchEvent(new CustomEvent("agent-panel:set-mode", { detail: { mode: "chat" } }));
  window.dispatchEvent(new CustomEvent("agent-panel:open"));
  const end = Date.now() + ms;
  while (!document.querySelector(COMPOSER) && Date.now() < end) {
    await new Promise((r) => setTimeout(r, 150));
  }
}

/**
 * Send a message to the agent chat and wait until the chat confirms it.
 * A send made while the panel is closed can be dropped if the chat takes
 * longer to mount than the framework buffers it, so open the panel first
 * and send once it is ready.
 */
export async function sendToAgent(message: string, context: string): Promise<boolean> {
  try {
    await openAgentPanel();
    const r = await sendToAgentChatAndConfirm(
      { message, context, submit: true, chatTarget: "local" },
      { timeoutMs: 15000 },
    );
    return r.delivered;
  } catch {
    return false;
  }
}
