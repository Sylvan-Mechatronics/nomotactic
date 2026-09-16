/**
 * Unit tests for device API convenience helpers:
 *   deleteDeviceSession, getDeviceIdentity, registerDeviceWithFleet
 */

import { ApiRequestError, deleteDeviceSession, getDeviceIdentity, registerDeviceWithFleet, setDeviceBaseUrl } from "@/lib/api";

const DEVICE_URL = "https://device.test:8443";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Mock global fetch before each test.
const mockFetch = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
global.fetch = mockFetch as unknown as typeof fetch;

function makeOkResponse(body: unknown, status = 200): Partial<Response> {
  return {
    ok: true,
    status,
    json: async () => body,
  };
}

function makeErrorResponse(status: number, errorMsg: string): Partial<Response> {
  return {
    ok: false,
    status,
    json: async () => ({ error: errorMsg, timestamp: new Date().toISOString() }),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  setDeviceBaseUrl(DEVICE_URL);
});

// ---------------------------------------------------------------------------
// getDeviceIdentity
// ---------------------------------------------------------------------------

describe("getDeviceIdentity", () => {
  it("returns all identity fields including registration_proof on 200", async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({
        vin: "DEADBEEF00001234",
        model: "nomon",
        hostname: "nomon-abcd.local",
        registration_proof: "proof.payload.sig",
      }) as Response,
    );

    const identity = await getDeviceIdentity();

    expect(identity.vin).toBe("DEADBEEF00001234");
    expect(identity.model).toBe("nomon");
    expect(identity.hostname).toBe("nomon-abcd.local");
    expect(identity.registration_proof).toBe("proof.payload.sig");
  });

  it("calls the correct device endpoint", async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ vin: "A", model: "nomon", hostname: "h", registration_proof: "p" }) as Response,
    );
    await getDeviceIdentity();
    expect(mockFetch).toHaveBeenCalledWith(
      `${DEVICE_URL}/api/device/auth/identity`,
      expect.any(Object),
    );
  });

  it("throws ApiRequestError on 401 (no token / expired)", async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(401, "Unauthorised") as Response);
    await expect(getDeviceIdentity()).rejects.toBeInstanceOf(ApiRequestError);
  });

  it("wraps network timeout in ApiRequestError with status 0", async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    mockFetch.mockRejectedValueOnce(abortError);
    const err = await getDeviceIdentity().catch((e) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect((err as ApiRequestError).status).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// registerDeviceWithFleet
// ---------------------------------------------------------------------------

describe("deleteDeviceSession", () => {
  it("calls the correct device endpoint with DELETE", async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ success: true, timestamp: new Date().toISOString() }) as Response,
    );

    const result = await deleteDeviceSession();

    expect(result.success).toBe(true);
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toBe(`${DEVICE_URL}/api/device/auth/session`);
    expect((init as RequestInit).method).toBe("DELETE");
  });

  it("throws ApiRequestError on 401", async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(401, "Unauthorised") as Response);
    await expect(deleteDeviceSession()).rejects.toBeInstanceOf(ApiRequestError);
  });
});

// ---------------------------------------------------------------------------
// registerDeviceWithFleet
// ---------------------------------------------------------------------------

describe("registerDeviceWithFleet", () => {
  const VIN = "DEADBEEF00001234";
  const MODEL = "nomon";
  const PROOF = "proof.payload.sig";

  it("sends vin, model, and registration_proof in the request body", async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ vin: VIN, model: MODEL, registered_at: "", timestamp: "" }, 201) as Response,
    );

    await registerDeviceWithFleet(VIN, MODEL, PROOF);

    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain("/api/fleet/devices");
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ vin: VIN, model: MODEL, registration_proof: PROOF });
  });

  it("resolves without error on 201", async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ vin: VIN, model: MODEL, registered_at: "", timestamp: "" }, 201) as Response,
    );
    await expect(registerDeviceWithFleet(VIN, MODEL, PROOF)).resolves.toBeUndefined();
  });

  it("throws ApiRequestError with status 409 on duplicate registration", async () => {
    mockFetch.mockResolvedValueOnce(
      makeErrorResponse(409, "Device already registered") as Response,
    );
    const err = await registerDeviceWithFleet(VIN, MODEL, PROOF).catch((e) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect((err as ApiRequestError).status).toBe(409);
  });

  it("throws ApiRequestError with status 401 on expired central session", async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(401, "Unauthorised") as Response);
    const err = await registerDeviceWithFleet(VIN, MODEL, PROOF).catch((e) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect((err as ApiRequestError).status).toBe(401);
  });

  it("throws ApiRequestError with status 400 on invalid proof", async () => {
    mockFetch.mockResolvedValueOnce(
      makeErrorResponse(400, "Invalid or expired registration proof") as Response,
    );
    const err = await registerDeviceWithFleet(VIN, MODEL, "bad-proof").catch((e) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect((err as ApiRequestError).status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// registerDeviceWithFleet
// ---------------------------------------------------------------------------

describe("registerDeviceWithFleet", () => {
  it("posts vin, model, proof and the device public key", async () => {
    mockFetch.mockResolvedValueOnce(makeOkResponse({ vin: "A", model: "nomon" }, 201) as Response);
    await registerDeviceWithFleet("A", "nomon", "p.q.r", "-----BEGIN PUBLIC KEY-----\nX\n");
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain("/api/fleet/devices");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      vin: "A",
      model: "nomon",
      registration_proof: "p.q.r",
      device_public_key: "-----BEGIN PUBLIC KEY-----\nX\n",
    });
  });

  it("omits device_public_key when the device did not provide one", async () => {
    mockFetch.mockResolvedValueOnce(makeOkResponse({ vin: "A", model: "nomon" }, 201) as Response);
    await registerDeviceWithFleet("A", "nomon", "p.q.r", null);
    const [, init] = mockFetch.mock.calls[0];
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      vin: "A",
      model: "nomon",
      registration_proof: "p.q.r",
    });
  });
});
