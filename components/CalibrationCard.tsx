/**
 * Device calibration controls.
 *
 * Edits motor/servo/grayscale calibration against the device API and persists
 * via save/reset. Talks to the currently-connected device (deviceApi); degrades
 * gracefully when the device is unreachable.
 */

import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { ExpandableCard } from "@/components/ExpandableCard";
import { ApiRequestError } from "@/lib/api";
import {
  type CalibrationSnapshot,
  captureGrayscale,
  getCalibration,
  getNormalizedGrayscale,
  type NormalizedGrayscale,
  resetCalibration,
  saveCalibration,
  setMotorCalibration,
  setServoCalibration,
} from "@/lib/calibration";
import { borderRadius, colors, spacing, typography } from "@/lib/theme";

const SPEED_SCALE_STEP = 0.05;
const DEADBAND_STEP = 1;
const TRIM_STEP = 10;

export function CalibrationCard() {
  const [snapshot, setSnapshot] = useState<CalibrationSnapshot | null>(null);
  const [normalized, setNormalized] = useState<NormalizedGrayscale | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Bumped by Retry to re-run the fetch effect. */
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    // Ignore a response that lands after a retry or unmount.
    let ignore = false;
    async function fetchCalibration() {
      try {
        const snap = await getCalibration();
        if (ignore) return;
        setSnapshot(snap);
        const norm = await getNormalizedGrayscale().catch(() => null);
        if (!ignore) setNormalized(norm);
      } catch (err) {
        if (!ignore) {
          setError(
            err instanceof ApiRequestError
              ? `Device not reachable (${err.message})`
              : "Device not reachable",
          );
        }
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }
    fetchCalibration();
    return () => {
      ignore = true;
    };
  }, [reloadKey]);

  const load = useCallback(() => {
    setIsLoading(true);
    setError(null);
    setReloadKey((k) => k + 1);
  }, []);

  const runAction = useCallback(async (fn: () => Promise<void>, okMessage: string) => {
    setBusy(true);
    setStatus(null);
    setError(null);
    try {
      await fn();
      setStatus(okMessage);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }, []);

  const updateMotor = useCallback(
    (channel: number, patch: { speed_scale?: number; deadband_pct?: number; reversed?: boolean }) =>
      runAction(async () => {
        const updated = await setMotorCalibration(channel, patch);
        setSnapshot((prev) =>
          prev === null
            ? prev
            : { ...prev, motors: prev.motors.map((m) => (m.channel === channel ? updated : m)) },
        );
      }, "Motor updated"),
    [runAction],
  );

  const updateServo = useCallback(
    (servo: string, trimUs: number) =>
      runAction(async () => {
        await setServoCalibration(servo, trimUs);
        setSnapshot((prev) =>
          prev === null
            ? prev
            : { ...prev, servos: { ...prev.servos, [servo]: { trim_us: trimUs } } },
        );
      }, "Servo trim updated"),
    [runAction],
  );

  const capture = useCallback(
    (channel: number, surface: "white" | "black") =>
      runAction(async () => {
        await captureGrayscale(channel, surface);
        const snap = await getCalibration();
        setSnapshot(snap);
      }, `Captured ${surface}`),
    [runAction],
  );

  if (isLoading) {
    return <ActivityIndicator color={colors.primary} size="large" style={styles.loader} />;
  }

  if (snapshot === null) {
    return (
      <View style={styles.card}>
        <Text style={styles.errorText}>{error ?? "Device not reachable"}</Text>
        <Pressable style={styles.button} onPress={load}>
          <Text style={styles.buttonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      {error !== null && <Text style={styles.errorText}>{error}</Text>}
      {status !== null && <Text style={styles.statusText}>{status}</Text>}

      <ExpandableCard title="Motors" defaultExpanded>
        {snapshot.motors.map((m) => (
          <View key={m.channel} style={styles.block}>
            <Text style={styles.blockTitle}>Motor {m.channel}</Text>
            <Stepper
              label="Speed scale"
              value={m.speed_scale.toFixed(2)}
              disabled={busy}
              onDec={() => updateMotor(m.channel, { speed_scale: m.speed_scale - SPEED_SCALE_STEP })}
              onInc={() => updateMotor(m.channel, { speed_scale: m.speed_scale + SPEED_SCALE_STEP })}
            />
            <Stepper
              label="Deadband %"
              value={m.deadband_pct.toFixed(0)}
              disabled={busy}
              onDec={() => updateMotor(m.channel, { deadband_pct: m.deadband_pct - DEADBAND_STEP })}
              onInc={() => updateMotor(m.channel, { deadband_pct: m.deadband_pct + DEADBAND_STEP })}
            />
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Reversed</Text>
              <Pressable
                disabled={busy}
                onPress={() => updateMotor(m.channel, { reversed: !m.reversed })}
                style={[styles.toggle, m.reversed && styles.toggleOn]}
              >
                <Text style={[styles.toggleText, m.reversed && styles.toggleTextOn]}>
                  {m.reversed ? "ON" : "OFF"}
                </Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ExpandableCard>

      <ExpandableCard title="Servos">
        {Object.entries(snapshot.servos).map(([name, servo]) => (
          <View key={name} style={styles.block}>
            <Stepper
              label={`${name} trim (µs)`}
              value={String(servo.trim_us)}
              disabled={busy}
              onDec={() => updateServo(name, servo.trim_us - TRIM_STEP)}
              onInc={() => updateServo(name, servo.trim_us + TRIM_STEP)}
            />
          </View>
        ))}
      </ExpandableCard>

      <ExpandableCard title="Grayscale">
        {snapshot.grayscale.map((g, i) => (
          <View key={g.channel} style={styles.block}>
            <Text style={styles.blockTitle}>
              Sensor {g.channel} (ADC {g.adc_channel})
            </Text>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>White / Black</Text>
              <Text style={styles.rowValue}>
                {g.white_raw} / {g.black_raw}
              </Text>
            </View>
            {normalized !== null && normalized.normalized[i] !== undefined && (
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Normalized</Text>
                <Text style={styles.rowValue}>{normalized.normalized[i].toFixed(2)}</Text>
              </View>
            )}
            <View style={styles.captureRow}>
              <Pressable
                disabled={busy}
                style={styles.button}
                onPress={() => capture(g.channel, "white")}
              >
                <Text style={styles.buttonText}>Capture White</Text>
              </Pressable>
              <Pressable
                disabled={busy}
                style={styles.button}
                onPress={() => capture(g.channel, "black")}
              >
                <Text style={styles.buttonText}>Capture Black</Text>
              </Pressable>
            </View>
          </View>
        ))}
        <Pressable
          disabled={busy}
          style={styles.button}
          onPress={() =>
            runAction(async () => {
              setNormalized(await getNormalizedGrayscale());
            }, "Readings refreshed")
          }
        >
          <Text style={styles.buttonText}>Refresh readings</Text>
        </Pressable>
      </ExpandableCard>

      <View style={styles.actionRow}>
        <Pressable
          disabled={busy}
          style={[styles.button, styles.primaryButton]}
          onPress={() => runAction(async () => void (await saveCalibration()), "Saved to device")}
        >
          <Text style={[styles.buttonText, styles.primaryButtonText]}>Save</Text>
        </Pressable>
        <Pressable
          disabled={busy}
          style={styles.button}
          onPress={() =>
            runAction(async () => {
              await resetCalibration();
              setSnapshot(await getCalibration());
            }, "Reset to defaults")
          }
        >
          <Text style={styles.buttonText}>Reset</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Stepper({
  label,
  value,
  onDec,
  onInc,
  disabled,
}: {
  label: string;
  value: string;
  onDec: () => void;
  onInc: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.stepperGroup}>
        <Pressable disabled={disabled} style={styles.stepBtn} onPress={onDec}>
          <Text style={styles.stepBtnText}>−</Text>
        </Pressable>
        <Text style={styles.stepValue}>{value}</Text>
        <Pressable disabled={disabled} style={styles.stepBtn} onPress={onInc}>
          <Text style={styles.stepBtnText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loader: { marginVertical: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  block: { marginBottom: spacing.md },
  blockTitle: { ...typography.label, color: colors.text, marginBottom: spacing.xs },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  rowLabel: { ...typography.label, color: colors.textSecondary },
  rowValue: { ...typography.body },
  stepperGroup: { flexDirection: "row", alignItems: "center" },
  stepBtn: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  stepBtnText: { color: colors.primary, fontSize: 18, fontWeight: "600" },
  stepValue: { ...typography.body, minWidth: 56, textAlign: "center" },
  toggle: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceElevated,
  },
  toggleOn: { backgroundColor: colors.primary },
  toggleText: { ...typography.caption, color: colors.textSecondary },
  toggleTextOn: { color: colors.background, fontWeight: "600" },
  captureRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  button: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
    marginTop: spacing.xs,
  },
  buttonText: { color: colors.primary, fontWeight: "500" },
  primaryButton: { backgroundColor: colors.primary, flex: 1, marginRight: spacing.sm },
  primaryButtonText: { color: colors.background },
  actionRow: { flexDirection: "row", marginTop: spacing.md },
  errorText: { color: colors.error, marginBottom: spacing.sm },
  statusText: { color: colors.secondary, marginBottom: spacing.sm },
});
