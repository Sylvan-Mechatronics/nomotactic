import { normaliseDeviceUrl } from "@/lib/deviceUrl";

describe("normaliseDeviceUrl", () => {
  it("accepts an https origin with a port", () => {
    expect(normaliseDeviceUrl("https://pi.tail1234.ts.net:8443")).toBe(
      "https://pi.tail1234.ts.net:8443",
    );
  });

  it("strips a trailing slash and whitespace", () => {
    expect(normaliseDeviceUrl("  https://10.0.0.5:8443/  ")).toBe("https://10.0.0.5:8443");
  });

  it.each([
    ["http://10.0.0.5:8443", "cleartext"],
    ["https://user:pw@10.0.0.5:8443", "embedded credentials"],
    ["https://10.0.0.5:8443/api", "path"],
    ["https://10.0.0.5:8443/?x=1", "query"],
    ["https://10.0.0.5:8443/#frag", "fragment"],
    ["javascript:alert(1)", "non-http scheme"],
    ["not a url", "garbage"],
    ["", "empty"],
  ])("rejects %s (%s)", (input) => {
    expect(normaliseDeviceUrl(input)).toBeNull();
  });
});
