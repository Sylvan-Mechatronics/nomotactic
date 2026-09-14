/**
 * Device registration form — shown in the registered panel when the user is
 * logged in but has no fleet devices yet.
 *
 * isPaired=true  — Device JWT already present. No pairing secret needed.
 *                  One-tap "Register" fetches the device identity and POSTs
 *                  to the central fleet API.
 * isPaired=false — Not yet paired. Collects secret + display name, pairs
 *                  with the device, then registers with the fleet API.
 */

import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ApiRequestError, getDeviceIdentity, registerDeviceWithFleet } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { borderRadius, colors, spacing, typography } from "@/lib/theme";

interface DeviceRegistrationFormProps {
  isPaired: boolean;
  onRetry: () => Promise<void>;
  onRegistered: () => Promise<void>;
}

export function DeviceRegistrationForm({ isPaired, onRetry, onRegistered }: DeviceRegistrationFormProps) {
  const { pairWithDevice } = useAuth();
  const [secret, setSecret] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function handleRegister() {
    setIsBusy(true);
    setError(null);
    try {
      if (!isPaired) {
        if (!secret.trim() || !displayName.trim()) {
          setIsBusy(false);
          return;
        }
        // The real pairing secret is ~43 chars (secrets.token_urlsafe(32)).
        // Reject obviously short inputs before making a network round-trip.
        if (secret.trim().length < 8) {
          setError("Pairing secret is too short. Check the device console and try again.");
          setIsBusy(false);
          return;
        }
        await pairWithDevice(secret.trim(), displayName.trim());
      }
      const identity = await getDeviceIdentity();
      await registerDeviceWithFleet(
        identity.vin,
        identity.model,
        identity.registration_proof,
        identity.device_public_key,
      );
      await onRegistered();
    } catch (err: unknown) {
      console.error("[DeviceRegistrationForm] Error during registration:", err);
      if (err instanceof ApiRequestError) {
        if (err.status === 409) {
          setError(err.message || "Device is already registered to another account.");
        } else if (err.status === 401) {
          setError(
            isPaired
              ? "Device session expired. Pair again to reconnect, then retry registration."
              : "Invalid pairing secret. Check the device console and retry.",
          );
        } else {
          setError(err.message || "Registration failed.");
        }
      } else {
        setError((err as Error).message || "Registration failed.");
      }
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.desc}>
        {isPaired
          ? "Device found on your network. Register it to your account."
          : "Device found on your network. Enter the pairing secret from the device console to connect and register."}
      </Text>

      {!isPaired && (
        <>
          <TextInput
            style={styles.input}
            placeholder="Pairing secret"
            placeholderTextColor={colors.textMuted}
            value={secret}
            onChangeText={setSecret}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <TextInput
            style={styles.input}
            placeholder="Display name"
            placeholderTextColor={colors.textMuted}
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
          />
        </>
      )}

      {error !== null && <Text style={styles.errorText}>{error}</Text>}

      <View style={styles.buttonRow}>
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.primaryButtonPressed,
            isBusy && styles.buttonDisabled,
          ]}
          onPress={handleRegister}
          disabled={isBusy}
          hitSlop={8}
        >
          <Text style={styles.primaryButtonText}>
            {isBusy ? "Registering\u2026" : "Register"}
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
          onPress={onRetry}
          disabled={isBusy}
          hitSlop={8}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.sm,
  },
  desc: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    color: colors.text,
    fontSize: 14,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  buttonRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
    flex: 1,
    minHeight: 44,
    paddingVertical: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: colors.background,
    fontSize: 14,
    fontWeight: "600",
  },
  retryButton: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  retryButtonPressed: {
    opacity: 0.85,
  },
  retryButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "500",
  },
});
