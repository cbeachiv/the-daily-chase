import Anthropic from "@anthropic-ai/sdk";

// Sonnet 4.6 — fast and inexpensive, well-suited to short prose like goal
// suggestions and the weekly recap. Swap to claude-opus-4-8 for richer output.
export const CLAUDE_MODEL = "claude-sonnet-4-6";

let client: Anthropic | undefined;

export function anthropic(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
    client = new Anthropic({ apiKey });
  }
  return client;
}

/** Pull the plain text out of a Claude message response. */
export function textOf(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}
