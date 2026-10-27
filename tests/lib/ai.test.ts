/**
 * Tests for the AI chat-command client (device Claude relay).
 */

import {
  clearAiKey,
  describeCommandError,
  getAiKeyStatus,
  isKeyProblem,
  sendAiCommand,
  setAiKey,
} from "@/lib/ai";
import { ApiRequestError, setDeviceBaseUrl } from "@/lib/api";

const DEVICE_URL = "https://device.test:8443";

const mockFetch = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
global.fetch = mockFetch as unknown as typeof fetch;

function makeOkResponse(body: unknown, status = 200): Partial<Response> {
  return { ok: true, status, json: async () => body };
}

function makeErrorResponse(status: number, errorMsg: string): Partial<Response> {
  return {
    ok: false,
    status,
    json: async () => ({ error: errorMsg, timestamp: new Date().toISOString() }),
  };
}

function lastBody(call = 0): unknown {
  const init = mockFetch.mock.calls[call][1];
  return init?.body !== undefined ? JSON.parse(init.body as string) : undefined;
}

function commandResponse(conversationId = "conv-1") {
  return {
    reply: "Driving forward.",
    actions: [{ tool: "drive", input: { speed_pct: 50 }, ok: true, result: 4 }],
    model: "claude-opus-4-8",
    stop_reason: "end_turn",
    conversation_id: conversationId,
    timestamp: "t",
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  setDeviceBaseUrl(DEVICE_URL);
});

// ---------------------------------------------------------------------------
// sendAiCommand
// ---------------------------------------------------------------------------

describe("sendAiCommand", () => {
  it("POSTs only the new message and returns the reply, actions and conversation id", async () => {
    mockFetch.mockResolvedValueOnce(makeOkResponse(commandResponse()) as Response);

    const resp = await sendAiCommand("drive forward");

    expect(resp.reply).toBe("Driving forward.");
    expect(resp.actions[0].tool).toBe("drive");
    expect(resp.actions[0].ok).toBe(true);
    expect(resp.conversation_id).toBe("conv-1");
    expect(resp.contextReset).toBe(false);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`${DEVICE_URL}/api/ai/command`);
    expect(init?.method).toBe("POST");
    // No prior turns ever leave the app (review S-24).
    expect(lastBody()).toEqual({ message: "drive forward" });
  });

  it("continues a conversation by id", async () => {
    mockFetch.mockResolvedValueOnce(makeOkResponse(commandResponse("conv-1")) as Response);
    const resp = await sendAiCommand("now stop", "conv-1");
    expect(resp.contextReset).toBe(false);
    expect(lastBody()).toEqual({ message: "now stop", conversation_id: "conv-1" });
  });

  it("retries once in a new conversation when the device forgot the id (404)", async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeErrorResponse(404, "Conversation not found or expired; start a new one.") as Response,
      )
      .mockResolvedValueOnce(makeOkResponse(commandResponse("conv-2")) as Response);

    const resp = await sendAiCommand("now stop", "conv-1");

    expect(resp.contextReset).toBe(true);
    expect(resp.conversation_id).toBe("conv-2");
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(lastBody(1)).toEqual({ message: "now stop" });
  });

  it("does not retry a 404 for a new conversation", async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(404, "Not Found") as Response);
    await expect(sendAiCommand("hi")).rejects.toBeInstanceOf(ApiRequestError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("rejects with ApiRequestError carrying the device's error text", async () => {
    mockFetch.mockResolvedValueOnce(
      makeErrorResponse(503, "No AI API key configured. Store one via PUT /api/ai/key.") as Response,
    );
    await expect(sendAiCommand("hi")).rejects.toBeInstanceOf(ApiRequestError);
  });

  it("passes a busy-conversation 409 through without retrying", async () => {
    mockFetch.mockResolvedValueOnce(
      makeErrorResponse(409, "A command is already running in this conversation.") as Response,
    );
    await expect(sendAiCommand("again", "conv-1")).rejects.toMatchObject({ status: 409 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Key management
// ---------------------------------------------------------------------------

describe("AI key management", () => {
  it("getAiKeyStatus GETs the key endpoint", async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ configured: false, source: null, timestamp: "t" }) as Response,
    );
    const status = await getAiKeyStatus();
    expect(status.configured).toBe(false);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`${DEVICE_URL}/api/ai/key`);
    expect(init?.method).toBe("GET");
  });

  it("setAiKey PUTs the key in the body", async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ configured: true, source: "stored", timestamp: "t" }) as Response,
    );
    const status = await setAiKey("sk-ant-test-0123456789");
    expect(status.source).toBe("stored");
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`${DEVICE_URL}/api/ai/key`);
    expect(init?.method).toBe("PUT");
    expect(lastBody()).toEqual({ api_key: "sk-ant-test-0123456789" });
  });

  it("clearAiKey DELETEs the key with no body", async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ configured: false, source: null, timestamp: "t" }) as Response,
    );
    await clearAiKey();
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`${DEVICE_URL}/api/ai/key`);
    expect(init?.method).toBe("DELETE");
    expect(init?.body).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// isKeyProblem
// ---------------------------------------------------------------------------

describe("isKeyProblem", () => {
  it("matches the device's no-key 503", () => {
    const err = new ApiRequestError(
      "No AI API key configured. Store one via PUT /api/ai/key.",
      503,
    );
    expect(isKeyProblem(err)).toBe(true);
  });

  it("matches the provider-rejected-key 502", () => {
    const err = new ApiRequestError("the AI provider rejected the configured API key", 502);
    expect(isKeyProblem(err)).toBe(true);
  });

  it("does not match other 502s (provider outage is not a key problem)", () => {
    expect(isKeyProblem(new ApiRequestError("AI provider request failed: overloaded", 502))).toBe(
      false,
    );
  });

  it("does not match unrelated errors", () => {
    expect(isKeyProblem(new ApiRequestError("daemon down", 503))).toBe(false);
    expect(isKeyProblem(new ApiRequestError("Request timed out", 0))).toBe(false);
    expect(isKeyProblem(new Error("boom"))).toBe(false);
    expect(isKeyProblem(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// describeCommandError
// ---------------------------------------------------------------------------

describe("describeCommandError", () => {
  it("explains an unreachable device for a network error (status 0)", () => {
    const msg = describeCommandError(new ApiRequestError("Network error", 0));
    expect(msg).toMatch(/couldn't reach the device/i);
    // The raw transport text must not leak through as the whole message.
    expect(msg).not.toBe("Network error");
  });

  it("explains a timeout distinctly from a plain network failure", () => {
    const msg = describeCommandError(new ApiRequestError("Request timed out", 0));
    expect(msg).toMatch(/too long to respond/i);
  });

  it("tells the user to reconnect on a 401", () => {
    const msg = describeCommandError(new ApiRequestError("Unauthorized", 401));
    expect(msg).toMatch(/session expired/i);
  });

  it("passes through a device-supplied message for other HTTP errors", () => {
    const msg = describeCommandError(
      new ApiRequestError("HAT daemon unavailable", 503),
    );
    expect(msg).toBe("HAT daemon unavailable");
  });

  it("falls back for a non-API error", () => {
    expect(describeCommandError(new Error("boom"))).toBe("boom");
    expect(describeCommandError(undefined)).toMatch(/something went wrong/i);
    expect(describeCommandError({})).toMatch(/something went wrong/i);
  });
});
