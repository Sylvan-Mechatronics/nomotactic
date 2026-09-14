# nomotactic — Architecture

## System Overview

nomotactic is the user-facing application for the nomon fleet. Built with
Expo (React Native), it serves Android, iOS, and web from a single TypeScript
codebase (see [ADR-001](adr/001-expo-web-mobile-single-app.md)).

```
┌──────────────────────────────────────────────────────────────────┐
│  nomotactic (Expo / React Native)                                │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │  app/                                                    │     │
│  │  ├── _layout.tsx        (root layout + AuthProvider + TransportProvider)    │     │
│  │  ├── index.tsx           (entry: landing / redirect)     │     │
│  │  ├── login.tsx           (login / register screen)       │     │
│  │  └── (app)/                                              │     │
│  │      ├── _layout.tsx     (auth guard + command bar)      │     │
│  │      ├── index.tsx       (devices dashboard + pairing)   │     │
│  │      └── device/[id].tsx (per-device control cards)      │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │  lib/api.ts  │  │ lib/auth.ts  │  │lib/devices.ts│           │
│  │  (API client)│  │(auth context)│  │ (fleet hook) │           │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘           │
│         │                 │                                       │
└─────────┼─────────────────┼───────────────────────────────────────┘
          │ HTTPS           │ HTTPS
          ▼                 ▼
  ┌───────────────┐  ┌───────────────┐
  │  nomothetic   │  │  nomothetic   │
  │ (device mode) │  │(central mode) │
  │   Pi :8443    │  │  server :443  │
  └───────────────┘  └───────────────┘
```

## Design Principles

1. **Lightweight over feature-rich.** Single-screen UIs. Minimal navigation.
2. **Speed is UX.** Small bundle. Few renders. Minimal network round-trips.
3. **Simple state.** React context + local `useState`. No Redux/MobX/Zustand.
4. **Progressive disclosure.** Show what's needed now. Expand inline.
5. **Platform-native feel.** Safe areas, gestures, haptics — not custom chrome.

## Navigation Structure

File-based routing via `expo-router`. Minimal page count.

```
app/
  _layout.tsx         → Root layout: wraps app in AuthProvider, sets StatusBar
  index.tsx           → Entry point:
                          authenticated or guest → redirect to /(app)/
                          mobile + unauthenticated → redirect to /login
                          web + unauthenticated → landing page
  login.tsx           → Login / register (single screen, mode toggle)
                          "Continue without account" → sets isGuest, enters /(app)
  (app)/
    _layout.tsx       → Auth guard (authenticated or guest) + CommandInput bar at bottom
    index.tsx         → Devices dashboard: fleet + local device list, Soft AP pairing
    register-device.tsx → Local nomothetic registration after HTTP pairing via Soft AP;
                          hosts DeviceRegistrationForm for central fleet registration
                          (Phase 8 — users with a paired device but no fleet record)
    device/[id].tsx   → Per-device control view with expandable cards
```

**Total screens: 4** (entry, login, devices dashboard, device detail).
Control cards live on the per-device screen, keeping the dashboard focused
on fleet discovery and pairing.

## Platform Modes

| Context | Behaviour |
|---------|-----------|
| **Web, unauthenticated** | Landing page (hero, features, CTA to login) |
| **Web, authenticated** | Fleet dashboard. HTTPS only. |
| **Mobile, WiFi connected** | Full device control: motors, camera, sensors, settings, calibration. HTTPS transport. |
| **Mobile, Soft AP connected** | Basic pairing flow: user connects to `nomon-<last4-of-MAC>` AP, enters pairing secret at `http://192.168.4.1:8080` (plain HTTP, interface-scoped to AP gateway), receives JWT. After pairing, nomotactic switches to HTTPS for full feature set. |
| **Mobile, guest (no account)** | Login skipped via "Continue without account". Soft AP pairing available. Dashboard shows locally-paired devices only; central fleet unavailable. |

Platform detection uses `Platform.OS` from React Native. Feature visibility
is conditional, not page-based.

## Authentication Flow

```
┌────────────┐     POST /api/auth/login      ┌────────────────┐
│  login.tsx │  ──────────────────────────▶  │  nomothetic    │
│            │  ◀──────────────────────────  │  (central mode)│
│            │  { access_token,              │                │
│            │    refresh_token }            └────────────────┘
└─────┬──────┘
      │ store tokens
      ▼
┌────────────────────────┐
│  expo-secure-store     │  (mobile: OS keychain)
│  sessionStorage        │  (web: refresh tokens — tab-scoped)
│  memory only           │  (web: access tokens — never persisted)
└────────────────────────┘
      │                        ┌────────────────┐
      │  Authorization: Bearer │  nomothetic    │
      └──────────────────────▶ │  (any mode)    │
                               └────────────────┘
```

- `AuthContext` provides `login()`, `logout()`, `register()`, `isAuthenticated`
- Login screen is the single redirect authority after submit: success updates
  auth state, and route transition is handled by one auth-state effect
- API client injects `Authorization: Bearer <token>` on every request
- On 401 response, client attempts automatic refresh via `/api/auth/refresh`
- If refresh fails, user is redirected to login
- `expo-secure-store` on mobile (OS keychain); three-tier storage on web:
  access tokens memory-only, refresh tokens in `sessionStorage`, device URL
  in `localStorage` (see ADR-018)

### Guest Mode

Users who choose "Continue without account" on the login screen call
`continueAsGuest()` in `AuthContext`, setting an in-memory `isGuest: boolean`
flag (not persisted to storage). This flag:

- Allows the `(app)` auth guard to pass without a JWT
- Is cleared on app restart or explicit logout
- The top bar renders a "Sign In" link in place of "Logout" for guests
- Guest users can pair devices via Soft AP and see them on the dashboard via the
  local device registry (see [Local Device Registry](#local-device-registry))

## API Client

`lib/api.ts` exports a typed client that wraps `fetch`:

- Base URL configurable per environment (device IP or central server URL)
- Automatic auth header injection from `AuthContext`
- Timeout handling (default 10 s for control commands, 30 s for data queries)
- Error response parsing (matches nomothetic Pydantic error shapes)
- No external HTTP library dependency — uses built-in `fetch`

## Component Architecture

Devices dashboard and detail view split responsibilities:

- `app/(app)/index.tsx` shows fleet list cards and pairing UI.
- `app/(app)/device/[id].tsx` renders the expandable control cards.

Per-device control uses **expandable card components** for progressive disclosure:

| Card | Content | Default state |
|------|---------|---------------|
| **Status** | Battery, uptime, firmware, connection | Expanded (always visible) |
| **Motor Control** | D-pad, speed slider, stop button | Collapsed |
| **Camera** | Capture button, stream link | Collapsed |
| **Sensors** | Ultrasonic, grayscale readings | Collapsed |
| **Routine** | Start/stop explore, status display | Collapsed |

Each card is a self-contained component managing its own state. Cards
fetch data independently and handle their own error states.

## Wi-Fi Soft AP Pairing

When the device is not connected to a known Wi-Fi network, the Soft AP watchdog
(`nomon-softap-watchdog.timer` in nomopractic) broadcasts a WPA2 hotspot named
`nomon-<last4-of-MAC>`. The passphrase is the long random Soft AP passphrase
written to `/run/nomothetic/ap-passphrase` on the Pi (it is deliberately not the
8-digit pairing code, which is only typed when pairing over the home network).

**Pairing flow (mobile or web):**

1. User connects their device to the `nomon-<last4-of-MAC>` Wi-Fi network.
2. nomotactic detects the Soft AP network and surfaces the pairing form at
   `http://192.168.4.1:8080`.
3. User enters the pairing secret (`POST /api/device/auth/pair`).
4. nomothetic returns a device-scoped JWT (`iss=nomon-device`).
5. nomotactic stores the device refresh token in `sessionStorage` (web) or
   `expo-secure-store` (mobile); the access token is held in memory only and
   is never written to browser storage.
6. After pairing, the user connects back to their home network; all subsequent
   device API calls use the stored JWT over HTTPS.

```
User phone                      nomon Pi
──────────                      ─────────
Join nomon-<last4> AP      ──▶  192.168.4.1 (Soft AP)
GET http://192.168.4.1:8080    ──▶  nomothetic HTTP (AP only)
POST /api/device/auth/pair     ──▶  verify pairing secret
                               ◀──  { access_token, refresh_token }
Store JWT in secure storage
Disconnect from AP
Join home Wi-Fi
API calls with Bearer <JWT>    ──▶  nomothetic device endpoints
```

The Soft AP is browser-universal — it works from the nomotactic app,
Safari, Chrome, Firefox, and any HTTP client.

### Local Device Registry

`lib/local-devices.ts` maintains a persistent list of Soft-AP-paired devices
independently of the central fleet API, enabling the dashboard to show devices
for guest users and during offline operation.

```ts
interface LocalDevice {
  id: string;       // nomothetic device ID (stable identifier)
  name: string;     // device-announced or user-assigned name
  pairedAt: string; // ISO 8601 timestamp
  vin: string | null;  // nomothetic VIN once registered, null otherwise
  source: 'local';  // discriminant
}
```

Storage: JSON-encoded array at key `nomon_local_devices`, using `localStorage`
on web (non-sensitive device metadata, not credentials) and `expo-secure-store`
on mobile.

`useDevices` loads both central and local device lists in parallel and merges
them. Deduplication: if a local device's `vin` matches a central fleet device,
the central entry takes precedence and the local entry is omitted.
`Device.source: 'central' | 'local'` distinguishes registry origin. The
dashboard renders a "Local" pill badge for source `'local'` devices.

Future: when a guest user logs in, a sync prompt will offer to promote
local-only devices to the central fleet registry.

## AI-Ready Command Input

A persistent `CommandInput` component at the bottom of the authenticated
layout (see [ADR-002](adr/002-ai-ready-ux.md)):

- Text input + submit button
- Inline response bubble
- Stub handler initially; replaced by AI endpoint in a future phase
- Keyboard-avoiding on mobile, fixed-bottom on web

## Dependencies

**Production (current):**
- `expo` ~54.x, `expo-router` ~6.x (framework + routing)
- `react` 19.x, `react-native` 0.81.x (UI runtime)
- `react-native-web` ~0.21.x (web platform support)
- `react-native-safe-area-context` (safe area insets)
- `react-native-screens` (native navigation)
- `react-native-gesture-handler` (gesture support)

**No additional UI _component_ libraries.** All components are built with core RN
primitives (`View`, `Text`, `TextInput`, `Pressable`, `ScrollView`, `Platform`).
The sole exception is **`react-native-svg`** (Phase 4) — a low-level drawing
primitive used by `TelemetryChart`, not a component kit — added because telemetry
history charts cannot be drawn with core primitives alone.

## Build & Deploy

| Platform | Build | Output |
|----------|-------|--------|
| Android | EAS Build | `.apk` / `.aab` |
| iOS | EAS Build | `.ipa` |
| Web | `expo export --platform web` | Static files (SPA) |

Web output is deployed to a CDN or served by nginx alongside the central
nomothetic API.

## Security

- Tokens stored in OS keychain on mobile (`expo-secure-store`)
- Web uses a three-tier storage model (ADR-018): access tokens are
  **memory-only** (never written to browser storage); refresh tokens use
  **`sessionStorage`** (tab-scoped, cleared on tab close); device URL in
  `localStorage` (non-sensitive). This resolves the prior `localStorage`
  XSS exposure concern.
- No secrets in source — API URLs from environment/config
- HTTPS enforced for all API communication
- Self-signed cert acceptance documented for device-mode connections
