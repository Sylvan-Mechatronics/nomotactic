/**
 * AI chat-command client: talk to the device's Claude relay.
 *
 * The device endpoint (`POST /api/ai/command`) runs the agentic loop
 * server-side and also holds the conversation history: the app sends only the
 * new message plus the `conversation_id` the device issued, and renders the
 * reply plus the robot actions the model took. The app never supplies prior
 * turns, so it cannot forge what the model "said" (nomothetic review S-24).
 * Tool-use blocks never reach the app.
 *
 * The Anthropic API key lives on the device (stored in a 0600 file via
 * `/api/ai/key`, or `ANTHROPIC_API_KEY` in the service environment) — it is
 * never held in the app or its storage, so web builds cannot leak it.
 */

import { ApiRequestError, deviceApi } from "@/lib/api";
import { ENDPOINTS } from "@/lib/endpoints";

// ---------------------------------------------------------------------------
// Types (mirror nomothetic ai_routes request/response models)
// ---------------------------------------------------------------------------

/** One robot tool call the model made while handling a command. */
export interface AiActionRecord {
  tool: string;
  input: Record<string, unknown>;
  ok: boolean;
  result?: unknown;
  error?: string | null;
}

/** The model's reply plus the record of every action it took. */
export interface AiCommandResponse {
  reply: string;
  actions: AiActionRecord[];
  model: string;
  stop_reason: string;
  /** Pass back on the next command to continue this conversation. */
  conversation_id: string;
  timestamp: string;
}

/** A command result, noting whether the device had to start a new conversation. */
export interface AiCommandResult extends AiCommandResponse {
  /**
   * True when the conversation id sent was unknown to the device (expired,
   * evicted, or forgotten by a restart) and the command ran in a fresh
   * conversation without the earlier context.
   */
  contextReset: boolean;
}

/** Whether the device has an AI key configured — never the key itself. */
export interface AiKeyStatus {
  configured: boolean;
  source: "stored" | "env" | null;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** AI commands run a model loop with tool round trips — allow minutes, not
 * the default 10 s API timeout. */
export const AI_COMMAND_TIMEOUT_MS = 180_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * True when a command failure means "the device needs a (working) Anthropic
 * API key" — the UI should offer the key-entry affordance. Covers both "no
 * key configured" (503) and "the provider rejected the stored key" (502).
 * Other 502s (provider outage, rate limit) are not key problems.
 */
export function isKeyProblem(err: unknown): boolean {
  if (!(err instanceof ApiRequestError)) return false;
  if (err.status === 503 && /api key/i.test(err.message)) return true;
  if (err.status === 502 && /rejected the configured api key/i.test(err.message)) return true;
  return false;
}

/**
 * Turn a failed command into a clear, actionable message for the operator.
 *
 * `isKeyProblem` drives the separate key-entry affordance; this covers every
 * other failure. The important case is a request that never reached the device
 * at all (`ApiRequestError` with `status === 0`, the client's sentinel for "no
 * HTTP response"): the raw "Network error" / "Failed to fetch" text reads like
 * the app did nothing, so we say plainly that the device was unreachable.
 */
export function describeCommandError(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.status === 0) {
      if (/tim(e|ed) out/i.test(err.message)) {
        return "The device took too long to respond. Check it's online and try again.";
      }
      return "Couldn't reach the device. Check it's powered on and you're connected to it.";
    }
    if (err.status === 401) {
      return "Your device session expired. Reconnect to the device and try again.";
    }
    return err.message;
  }
  const message = (err as Error | undefined)?.message;
  return message && message.length > 0 ? message : "Something went wrong. Try again.";
}

// ---------------------------------------------------------------------------
// Device API calls
// ---------------------------------------------------------------------------

function postCommand(
  message: string,
  conversationId: string | null,
): Promise<AiCommandResponse> {
  return deviceApi<AiCommandResponse>(ENDPOINTS.AI_COMMAND, {
    method: "POST",
    body: conversationId === null ? { message } : { message, conversation_id: conversationId },
    timeoutMs: AI_COMMAND_TIMEOUT_MS,
  });
}

/**
 * Run one chat command through the device's Claude tool loop.
 *
 * @param message The new user message.
 * @param conversationId The id from the previous response, or null to start a
 *   new conversation. If the device no longer knows it (404 — expired or
 *   restarted), the command is retried once in a fresh conversation and the
 *   result's `contextReset` is set; the 404 costs no model call.
 */
export async function sendAiCommand(
  message: string,
  conversationId: string | null = null,
): Promise<AiCommandResult> {
  try {
    const resp = await postCommand(message, conversationId);
    return { ...resp, contextReset: false };
  } catch (err) {
    if (conversationId !== null && err instanceof ApiRequestError && err.status === 404) {
      const resp = await postCommand(message, null);
      return { ...resp, contextReset: true };
    }
    throw err;
  }
}

/** Report whether the device has an AI key configured (and its source). */
export async function getAiKeyStatus(): Promise<AiKeyStatus> {
  return deviceApi<AiKeyStatus>(ENDPOINTS.AI_KEY);
}

/** Store a user-supplied Anthropic API key on the device (0600 file). */
export async function setAiKey(apiKey: string): Promise<AiKeyStatus> {
  return deviceApi<AiKeyStatus>(ENDPOINTS.AI_KEY, {
    method: "PUT",
    body: { api_key: apiKey },
  });
}

/** Remove the stored key from the device (any env fallback remains). */
export async function clearAiKey(): Promise<AiKeyStatus> {
  return deviceApi<AiKeyStatus>(ENDPOINTS.AI_KEY, { method: "DELETE" });
}
