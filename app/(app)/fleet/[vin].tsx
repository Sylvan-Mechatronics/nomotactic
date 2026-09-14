/**
 * Fleet device management detail.
 *
 * Central-data view for a registered device: metadata, latest telemetry,
 * a telemetry history chart, a link to the live cockpit, and removal from the
 * fleet. Distinct from the live cockpit (device/[id].tsx) — this reads only the
 * central fleet API and does not require the device to be reachable.
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { TelemetryChart, type TelemetryMetric } from "@/components/TelemetryChart";
import { ApiRequestError } from "@/lib/api";
import { formatLastSeen } from "@/lib/devices";
import {
  type FleetDeviceDetail,
  getDeviceTelemetry,
  getFleetDevice,
  removeFleetDevice,
  type TelemetryReading,
} from "@/lib/fleet";
import { borderRadius, colors, spacing, typography } from "@/lib/theme";

const METRICS: { key: TelemetryMetric; label: string; unit: string }[] = [
  { key: "battery_voltage", label: "Battery", unit: "V" },
  { key: "cpu_temp_c", label: "CPU Temp", unit: "°C" },
  { key: "uptime_seconds", label: "Uptime", unit: "s" },
];

export default function FleetDeviceScreen() {
  const { vin } = useLocalSearchParams<{ vin: string }>();
  const router = useRouter();

  const [detail, setDetail] = useState<FleetDeviceDetail | null>(null);
  const [readings, setReadings] = useState<TelemetryReading[]>([]);
  const [metric, setMetric] = useState<TelemetryMetric>("battery_voltage");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  /** Bumped by Retry to re-run the fetch effect. */
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!vin) return;
    // Ignore a response that lands after vin changed, a retry, or unmount.
    let ignore = false;
    async function fetchDevice(deviceVin: string) {
      try {
        const [d, r] = await Promise.all([
          getFleetDevice(deviceVin),
          getDeviceTelemetry(deviceVin, { limit: 100 }).catch(() => [] as TelemetryReading[]),
        ]);
        if (ignore) return;
        setDetail(d);
        setReadings(r);
      } catch (err) {
        if (!ignore) {
          setError(err instanceof ApiRequestError ? err.message : "Failed to load device");
        }
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }
    fetchDevice(vin);
    return () => {
      ignore = true;
    };
  }, [vin, reloadKey]);

  const load = useCallback(() => {
    setIsLoading(true);
    setError(null);
    setReloadKey((k) => k + 1);
  }, []);

  const handleRemove = useCallback(async () => {
    if (!vin) return;
    if (!confirmingRemove) {
      setConfirmingRemove(true);
      return;
    }
    setRemoving(true);
    try {
      await removeFleetDevice(vin);
      router.replace("/(app)");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Failed to remove device");
      setRemoving(false);
      setConfirmingRemove(false);
    }
  }, [vin, confirmingRemove, router]);

  const returnToControls = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(`/(app)/device/${vin}`);
  }, [router, vin]);

  const activeMetric = METRICS.find((m) => m.key === metric) ?? METRICS[0];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable onPress={returnToControls} style={styles.backRow}>
        <Text style={styles.backText}>‹ Controls</Text>
      </Pressable>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} size="large" style={styles.loader} />
      ) : (
        <>
          <Text style={styles.title}>{detail?.model ?? "Device"}</Text>
          <Text style={styles.subtitle}>{vin}</Text>

          {detail !== null ? (
            <>
              {error !== null && (
                <View style={styles.errorRow}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              {/* Metadata */}
              <View style={styles.card}>
                <Row label="Role" value={detail.role} />
                <Row label="Firmware" value={detail.firmware_version ?? "—"} />
                <Row label="Last seen" value={formatLastSeen(detail.last_seen_at)} />
                <Row label="Registered" value={formatLastSeen(detail.registered_at)} />
                {detail.latest_telemetry !== null && (
                  <Row
                    label="Battery"
                    value={`${detail.latest_telemetry.battery_voltage.toFixed(1)} V`}
                  />
                )}
              </View>

              {/* Telemetry chart */}
              <View style={styles.card}>
                <View style={styles.metricRow}>
                  {METRICS.map((m) => (
                    <Pressable
                      key={m.key}
                      onPress={() => setMetric(m.key)}
                      style={[styles.metricTab, metric === m.key && styles.metricTabActive]}
                    >
                      <Text
                        style={[
                          styles.metricTabText,
                          metric === m.key && styles.metricTabTextActive,
                        ]}
                      >
                        {m.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <TelemetryChart
                  readings={readings}
                  metric={activeMetric.key}
                  label={activeMetric.label}
                  unit={activeMetric.unit}
                />
              </View>
            </>
          ) : (
            // Central fleet data is unavailable (e.g. a local/guest device not
            // registered to an account, or the fleet service is unreachable).
            // Controls and calibration remain accessible below.
            <View style={styles.card}>
              <Text style={styles.unavailableText}>
                Fleet data unavailable — this device isn&apos;t registered to your account, or
                the fleet service is unreachable.
              </Text>
              {error !== null && <Text style={styles.errorText}>{error}</Text>}
              <Pressable style={styles.smallButton} onPress={load}>
                <Text style={styles.smallButtonText}>Retry</Text>
              </Pressable>
            </View>
          )}

          {/* Actions — always available */}
          <Pressable style={styles.controlButton} onPress={returnToControls}>
            <Text style={styles.controlButtonText}>Return to controls</Text>
          </Pressable>

          <Pressable style={styles.secondaryButton} onPress={() => router.push("/(app)/calibrate")}>
            <Text style={styles.secondaryButtonText}>Calibrate device</Text>
          </Pressable>

          {detail !== null && (
            <>
              <Pressable
                style={[styles.removeButton, confirmingRemove && styles.removeButtonConfirm]}
                onPress={handleRemove}
                disabled={removing}
              >
                <Text
                  style={[
                    styles.removeButtonText,
                    confirmingRemove && styles.removeButtonTextConfirm,
                  ]}
                >
                  {removing
                    ? "Removing…"
                    : confirmingRemove
                    ? "Tap again to confirm removal"
                    : "Remove from fleet"}
                </Text>
              </Pressable>
              {confirmingRemove && !removing && (
                <Pressable onPress={() => setConfirmingRemove(false)} style={styles.cancelRow}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
              )}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  backRow: { marginBottom: spacing.md },
  backText: { color: colors.primary, fontSize: 16 },
  loader: { marginVertical: spacing.xl },
  title: { ...typography.heading },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
  },
  rowLabel: { ...typography.label, color: colors.textSecondary },
  rowValue: { ...typography.body },
  metricRow: { flexDirection: "row", marginBottom: spacing.md },
  metricTab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    marginRight: spacing.sm,
    backgroundColor: colors.surfaceElevated,
  },
  metricTabActive: { backgroundColor: colors.primary },
  metricTabText: { ...typography.caption, color: colors.textSecondary },
  metricTabTextActive: { color: colors.background, fontWeight: "600" },
  controlButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginBottom: spacing.md,
  },
  controlButtonText: { color: colors.background, fontWeight: "600", fontSize: 16 },
  secondaryButton: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginBottom: spacing.md,
  },
  secondaryButtonText: { color: colors.primary, fontWeight: "600", fontSize: 16 },
  removeButton: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.error,
  },
  removeButtonConfirm: { backgroundColor: colors.error },
  removeButtonText: { color: colors.error, fontWeight: "500" },
  removeButtonTextConfirm: { color: colors.text },
  cancelRow: { alignItems: "center", marginTop: spacing.sm },
  cancelText: { color: colors.textSecondary },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: { color: colors.error, fontSize: 14, flex: 1, marginRight: spacing.sm },
  unavailableText: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.sm },
  smallButton: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  smallButtonText: { color: colors.primary, fontWeight: "500" },
});
