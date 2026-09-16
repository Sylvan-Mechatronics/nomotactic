/**
 * VideoFeed — toggleable MJPEG stream with platform-aware display.
 *
 * Web: renders a native <img> tag for true MJPEG streaming.
 * Mobile: renders an inline WebView embedding the MJPEG stream directly.
 *
 * The window IS the control: tapping the (off) feed starts the stream; a small
 * floating Stop control overlays the live stream. There is no separate button,
 * so the feed fills the whole area it's given. State is managed internally.
 */

import React, { useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";

import { getDeviceBaseUrl } from "@/lib/api";
import { ENDPOINTS } from "@/lib/endpoints";
import { borderRadius, colors, spacing, typography } from "@/lib/theme";
import { useDeviceCommand } from "@/lib/useDeviceCommand";

// ── Response shapes ──────────────────────────────────────────────────────────

interface StreamStartResponse {
  url: string;
  host: string;
  port: string;
  /** Access token the stream server requires as ?token= on every request. */
  token?: string | null;
  /**
   * Path (relative to the device base URL) that relays the MJPEG stream
   * over the same trusted origin used for the REST API — same TLS cert
   * (or AP-mode cleartext exception) the app already reached to start the
   * stream, so no separate host/port trust decision is needed to view it.
   */
  live_path?: string | null;
  timestamp: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function VideoFeed() {
  const [active, setActive] = useState(false);
  /** Device base URL the stream is relayed through (same origin as the REST API). */
  const [streamBaseUrl, setStreamBaseUrl] = useState<string | null>(null);
  /** Path (+ query) on streamBaseUrl that serves the MJPEG stream. */
  const [streamPath, setStreamPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sendCommand = useDeviceCommand();

  /** Full MJPEG URL consumed by the <img> tag or shown to the user. */
  const mjpegUrl =
    streamBaseUrl !== null && streamPath !== null ? `${streamBaseUrl}${streamPath}` : null;

  async function toggleStream() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (active) {
        await sendCommand(ENDPOINTS.STREAM_STOP, {});
        setActive(false);
        setStreamBaseUrl(null);
        setStreamPath(null);
      } else {
        const resp = await sendCommand<StreamStartResponse>(ENDPOINTS.STREAM_START, {});
        // Always relay through the device's own trusted base URL — never
        // resp.url/host/port directly, which describe the stream server's
        // internal bind address and may be unreachable or untrusted from
        // outside the device (see nomothetic StreamStartResponse.live_path).
        // The API origin has no /stream route, so a device too old to send
        // live_path can't be viewed — say so instead of rendering a broken image.
        if (!resp.live_path) {
          await sendCommand(ENDPOINTS.STREAM_STOP, {}).catch(() => undefined);
          throw new Error("Device software is too old to relay the stream — redeploy nomothetic");
        }
        setStreamBaseUrl(getDeviceBaseUrl());
        setStreamPath(resp.live_path);
        setActive(true);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function renderStream() {
    if (Platform.OS === "web") {
      return (
        <img
          src={mjpegUrl ?? undefined}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          alt="Live stream"
        />
      );
    }

    // Mobile: render the MJPEG stream inside a WebView using a minimal inline
    // HTML page. The img src is resolved against streamBaseUrl as baseUrl, so
    // the native HTTP request goes to the same trusted origin as the REST API.
    const streamHtml = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"></head><body style="margin:0;padding:0;background:#000;overflow:hidden"><img src="${streamPath ?? ""}" style="width:100%;height:100%;object-fit:cover;display:block" /></body></html>`;
    return (
      <WebView
        source={{ html: streamHtml, baseUrl: streamBaseUrl ?? "" }}
        style={styles.streamWrapper}
        scrollEnabled={false}
        originWhitelist={["*"]}
        mediaPlaybackRequiresUserAction={false}
      />
    );
  }

  return (
    <View style={styles.container}>
      {active && mjpegUrl !== null ? (
        <View style={styles.streamWrapper}>
          {renderStream()}
          {/* Floating stop control, overlaid on the live stream */}
          <Pressable
            style={({ pressed }) => [styles.stopOverlay, pressed && styles.pressed]}
            onPress={toggleStream}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Stop stream"
          >
            <Text style={styles.stopText}>{busy ? "…" : "■ Stop"}</Text>
          </Pressable>
        </View>
      ) : (
        // The window itself starts the stream — tap anywhere on the feed.
        <Pressable
          style={({ pressed }) => [styles.offOverlay, pressed && styles.pressed]}
          onPress={toggleStream}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Start stream"
        >
          {busy ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <Text style={styles.offIcon}>▶</Text>
              <Text style={styles.offText}>Tap to start stream</Text>
            </>
          )}
        </Pressable>
      )}

      {error !== null && (
        <View style={styles.errorBanner} pointerEvents="none">
          <Text style={styles.error}>{error}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  streamWrapper: {
    flex: 1,
    backgroundColor: "#000",
  },
  offOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  offIcon: {
    fontSize: 44,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  offText: {
    ...typography.caption,
    opacity: 0.7,
  },
  // Floating Stop control over the live stream (top-right corner).
  stopOverlay: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: colors.error,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
  },
  stopText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.background,
  },
  pressed: {
    opacity: 0.6,
  },
  errorBanner: {
    position: "absolute",
    bottom: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    alignItems: "center",
  },
  error: {
    color: colors.error,
    fontSize: 12,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    overflow: "hidden",
  },
});
