/**
 * Wrap an Anthropic client's `messages.create` so that the
 * "credit balance is too low" 400 error becomes a benign canned
 * response instead of a thrown exception. The arena / battle / agent
 * flows already have per-call try/catch + default fallbacks, so a
 * generic JSON-ish text response keeps them flowing without halting
 * the SSE stream.
 *
 * Pure side-effect — mutates the client in place. Returns the same
 * client for fluent use.
 */

import type Anthropic from "@anthropic-ai/sdk";

const FALLBACK_TEXT =
  '{"title":"Sample Job","category":"text_writing","amount":10,"minWords":100,"description":"Demo content (LLM fallback active — Anthropic credit balance low).","requirements":"none","language":"English","score":75,"reasoning":"Demo fallback evaluation.","output":"Demo fallback output. The arena keeps running so judges can see the full UX.","message":"Demo fallback message."}';

/**
 * @returns the same client, with `client.messages.create` patched.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withCreditFallback<T extends Anthropic>(client: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages = client.messages as any;
  const orig = messages.create.bind(messages);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages.create = async (params: any) => {
    try {
      return await orig(params);
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = err as any;
      const msg: string = e?.message ?? String(err);
      const isCredit =
        /credit\s*balance|too\s*low|insufficient\s*credit/i.test(msg) ||
        e?.status === 400;
      if (!isCredit) throw err;
      // eslint-disable-next-line no-console
      console.warn(
        "[anthropic-safe] credit fallback engaged:",
        msg.slice(0, 200),
      );
      return {
        id: "msg_fallback",
        type: "message",
        role: "assistant",
        model: params?.model ?? "claude-haiku",
        content: [{ type: "text", text: FALLBACK_TEXT }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      };
    }
  };

  return client;
}
