/**
 * Wi-Fi credential provisioning form — shown inline after successful pairing.
 *
 * Submits home SSID + WPA2 password to the device API which connects in the
 * background.  The Soft AP watchdog shuts the hotspot down automatically once
 * the device achieves full internet connectivity.
 *
 * After credentials are submitted, this component polls the device's mDNS
 * hostname (stored by AuthProvider from the pairing response) until it
 * responds on the home network, then automatically switches the active device
 * URL — no manual URL entry required.
 */

import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ApiRequestError, deviceApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { borderRadius, colors, spacing, typography } from "@/lib/theme";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 120_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WifiProvisionResponse {
  status: "connecting";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WifiProvisionForm() {
  const { deviceUrl, confirmDeviceUrl } = useAuth();
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "submitted" | "reconnecting" | "reconnected" | "timeout" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStart = useRef<number>(0);

  // Start polling the home-network URL once WiFi provisioning is submitted.
  useEffect(() => {
    if (status !== "reconnecting") return;
    if (!deviceUrl) return;

    pollStart.current = Date.now();

    async function probe() {
      if (Date.now() - pollStart.current > POLL_TIMEOUT_MS) {
        setStatus("timeout");
        return;
      }
      try {
        // Probe the health endpoint on the home-network URL.
        const res = await fetch(`${deviceUrl}/`, {
          method: "GET",
          signal: AbortSignal.timeout(3_000),
        });
        if (res.ok) {
          // Device is reachable — persist and activate the home-network URL.
          await confirmDeviceUrl(deviceUrl);
          setStatus("reconnected");
          return;
        }
      } catch {
        // Not yet reachable — keep polling.
      }
      pollTimer.current = setTimeout(probe, POLL_INTERVAL_MS);
    }

    pollTimer.current = setTimeout(probe, POLL_INTERVAL_MS);
    return () => {
      if (pollTimer.current !== null) clearTimeout(pollTimer.current);
    };
  }, [status, deviceUrl, confirmDeviceUrl]);

  async function handleSubmit() {
    if (!ssid.trim()) return;
    setStatus("submitting");
    setErrorMessage(null);

    try {
      const data = await deviceApi<WifiProvisionResponse>(
        "/api/device/network/configure",
        { method: "POST", body: { ssid: ssid.trim(), password } },
      );
      if (data.status === "connecting") {
        setStatus("reconnecting");
      } else {
        throw new Error("Unexpected response from device");
      }
    } catch (err: unknown) {
      const message =
        err instanceof ApiRequestError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to configure Wi-Fi";
      setErrorMessage(message);
      setStatus("error");
    }
  }

  // ---------------------------------------------------------------------------
  // Reconnected — device answered on home network
  // ---------------------------------------------------------------------------

  if (status === "reconnected") {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>Connected \u2713</Text>
        <Text style={styles.successText}>
          Your device is online on your home network. You can now issue
          commands from this screen.
        </Text>
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Reconnecting — polling spinner
  // ---------------------------------------------------------------------------

  if (status === "reconnecting") {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>Waiting for device\u2026</Text>
        <Text style={styles.description}>
          Connecting to <Text style={styles.ssidHighlight}>{ssid}</Text>.
          {" "}The hotspot will shut down once the device joins your home network.
          Switch your phone back to your home network now.
        </Text>
        <Text style={styles.pollNote}>
          Checking for device automatically every {POLL_INTERVAL_MS / 1000} s\u2026
        </Text>
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Poll timed out
  // ---------------------------------------------------------------------------

  if (status === "timeout") {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>Device not found</Text>
        <Text style={styles.errorText}>
          Could not reach the device at {deviceUrl} within{" "}
          {POLL_TIMEOUT_MS / 1000} s. Ensure you are on the same network as
          the device and try again.
        </Text>
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={() => setStatus("reconnecting")}
        >
          <Text style={styles.buttonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Input state (idle / error)
  // ---------------------------------------------------------------------------

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Step 2 \u2014 Configure Home Wi-Fi</Text>
      <Text style={styles.description}>
        Enter your home Wi-Fi credentials. The device will connect in the
        background and the hotspot will turn off automatically.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="Network name (SSID)"
        placeholderTextColor={colors.textMuted}
        value={ssid}
        onChangeText={setSsid}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TextInput
        style={styles.input}
        placeholder="Password (leave blank for open networks)"
        placeholderTextColor={colors.textMuted}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
      />
      {errorMessage !== null && (
        <Text style={styles.errorText}>{errorMessage}</Text>
      )}
      <Pressable
        style={({ pressed }) => [
          styles.button,
          pressed && styles.buttonPressed,
          status === "submitting" && styles.buttonDisabled,
        ]}
        onPress={handleSubmit}
        disabled={status === "submitting"}
      >
        <Text style={styles.buttonText}>
          {status === "submitting" ? "Connecting\u2026" : "Connect to Home Wi-Fi"}
        </Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  heading: {
    ...typography.label,
    marginBottom: spacing.sm,
  },
  description: {
    ...typography.caption,
    marginBottom: spacing.md,
  },
  successText: {
    ...typography.caption,
    color: colors.text,
  },
  ssidHighlight: {
    fontWeight: "600" as const,
  },
  pollNote: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  input: {
    backgroundColor: colors.background,
    color: colors.text,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    fontSize: 16,
    marginBottom: spacing.sm,
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
    marginBottom: spacing.sm,
  },
  button: {
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.md,
    alignItems: "center" as const,
    marginTop: spacing.xs,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: "600" as const,
  },
});

