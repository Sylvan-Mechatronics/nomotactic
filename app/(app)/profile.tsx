/**
 * User profile screen.
 *
 * View profile, edit display name, change password, and log out. Central-mode
 * only — guests are prompted to sign in.
 */

import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { ApiRequestError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatLastSeen } from "@/lib/devices";
import { getProfile, type Profile } from "@/lib/profile";
import { borderRadius, colors, spacing, typography } from "@/lib/theme";

export default function ProfileScreen() {
  const { isAuthenticated, isGuest, updateDisplayName, changePassword, logout } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const p = await getProfile();
      setProfile(p);
      setDisplayName(p.display_name);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Failed to load profile");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch-on-mount/auth-change: load() sets isLoading/error synchronously
    // before its first await, which react-hooks/set-state-in-effect flags as
    // a cascading-render risk. There's no external subscription to move this
    // into, so the flagged pattern is the fix.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isAuthenticated) load();
    else setIsLoading(false);
  }, [isAuthenticated, load]);

  const handleSaveName = useCallback(async () => {
    setSavingName(true);
    setError(null);
    setStatus(null);
    try {
      await updateDisplayName(displayName.trim());
      setProfile((prev) => (prev === null ? prev : { ...prev, display_name: displayName.trim() }));
      setStatus("Display name updated");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Failed to update name");
    } finally {
      setSavingName(false);
    }
  }, [displayName, updateDisplayName]);

  const handleChangePassword = useCallback(async () => {
    setChangingPw(true);
    setError(null);
    setStatus(null);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setStatus("Password changed");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Failed to change password");
    } finally {
      setChangingPw(false);
    }
  }, [currentPassword, newPassword, changePassword]);

  if (!isAuthenticated) {
    return (
      <View style={styles.centered}>
        <Text style={styles.subtitle}>
          {isGuest ? "Sign in to manage your profile." : "Not signed in."}
        </Text>
        <Pressable style={styles.primaryButton} onPress={() => router.push("/login")}>
          <Text style={styles.primaryButtonText}>Sign In</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} style={styles.backRow}>
        <Text style={styles.backText}>‹ Back</Text>
      </Pressable>
      <Text style={styles.title}>Profile</Text>

      {error !== null && <Text style={styles.errorText}>{error}</Text>}
      {status !== null && <Text style={styles.statusText}>{status}</Text>}

      {isLoading ? (
        <ActivityIndicator color={colors.primary} size="large" style={styles.loader} />
      ) : (
        <>
          <View style={styles.card}>
            <Row label="Email" value={profile?.email ?? "—"} />
            <Row label="Joined" value={formatLastSeen(profile?.created_at ?? null)} />
            <Row label="Last login" value={formatLastSeen(profile?.last_login_at ?? null)} />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Display name</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Display name"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="words"
            />
            <Pressable
              style={[styles.primaryButton, savingName && styles.buttonDisabled]}
              onPress={handleSaveName}
              disabled={savingName || displayName.trim().length === 0}
            >
              <Text style={styles.primaryButtonText}>{savingName ? "Saving…" : "Save name"}</Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Change password</Text>
            <TextInput
              style={styles.input}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder="Current password"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
            />
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="New password (min 8 chars)"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
            />
            <Pressable
              style={[styles.primaryButton, changingPw && styles.buttonDisabled]}
              onPress={handleChangePassword}
              disabled={changingPw || currentPassword.length === 0 || newPassword.length < 8}
            >
              <Text style={styles.primaryButtonText}>
                {changingPw ? "Changing…" : "Change password"}
              </Text>
            </Pressable>
          </View>

          <Pressable style={styles.logoutButton} onPress={logout}>
            <Text style={styles.logoutButtonText}>Log out</Text>
          </Pressable>
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
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  backRow: { marginBottom: spacing.md },
  backText: { color: colors.primary, fontSize: 16 },
  title: { ...typography.heading, marginBottom: spacing.md },
  subtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.lg },
  loader: { marginVertical: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardTitle: { ...typography.label, color: colors.text, marginBottom: spacing.sm },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.xs },
  rowLabel: { ...typography.label, color: colors.textSecondary },
  rowValue: { ...typography.body },
  input: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  primaryButtonText: { color: colors.background, fontWeight: "600", fontSize: 16 },
  buttonDisabled: { opacity: 0.5 },
  logoutButton: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.error,
  },
  logoutButtonText: { color: colors.error, fontWeight: "500" },
  errorText: { color: colors.error, marginBottom: spacing.sm },
  statusText: { color: colors.secondary, marginBottom: spacing.sm },
});
