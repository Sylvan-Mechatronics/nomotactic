---
applyTo: "**"
---

# nomotactic Coding Instructions

nomotactic is the user-facing Expo/React Native interface for the nomon robot fleet. It targets web, iOS, and Android from a single TypeScript codebase.

## Technology Stack

- **Expo SDK 58** (`expo@~58.0.19`) with `expo-router` file-based routing
- **React 19.3 / React Native 0.88** — use built-in components first
- **TypeScript strict mode** — all files must pass `tsconfig.json` strict settings
- **`@react-navigation/bottom-tabs`** and `@react-navigation/native` for tab navigation
- **Expo modules**: `expo-haptics`, `expo-secure-store`, `expo-image`, `expo-constants`

## Design Philosophy

1. **Lightweight over feature-rich.** Single-screen layouts with inline state changes. Only add a new route when the context genuinely changes.
2. **Speed is UX.** Minimise bundle size, render count, and network round-trips. Prefer Expo/RN built-ins over third-party UI libraries.
3. **Simple state.** Use `useState` and `useContext`. Avoid Redux, Zustand, or other heavy state libraries.
4. **Progressive disclosure.** Show only what the user needs now. Expand inline — never navigate away just to show more details.
5. **Platform-native feel.** Safe area, gestures, haptics — use platform defaults, not custom chrome.

## Project Structure

```
app/             expo-router pages (_layout.tsx, index.tsx, login.tsx)
components/      Reusable UI components (StatusCard, MotorCard, SensorCard, etc.)
lib/             Service layer (api.ts, auth.tsx, transport.tsx, devices.ts, endpoints.ts, theme.ts)
assets/          Static assets
plugins/         Expo config plugins
tests/           Jest tests
```

## TypeScript Conventions

```tsx
// Props: always an explicit named interface, never inline object types
interface StatusCardProps {
  voltage: number;
  isConnected: boolean;
}

export function StatusCard({ voltage, isConnected }: StatusCardProps) {
  return (
    <View style={styles.card}>
      <Text>{isConnected ? `${voltage}V` : 'Offline'}</Text>
    </View>
  );
}

// Styles: always StyleSheet.create — static allocation, optimised by RN
const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 8 },
});
```

- **No `any` types.** Use `unknown` + type narrowing or specific types.
- **No `@ts-ignore`** without an explanatory comment and a linked issue.
- Export explicit `interface` for all component props.

## API & Transport Layer

- **Transport**: commands route through `lib/transport.tsx` (`TransportMode: "https" | "disconnected"`).
- **REST calls**: `lib/api.ts` and `lib/endpoints.ts`. Use `fetch` — not axios.
- **Never put API calls inside components.** All network logic lives in `lib/`.
- Handle loading / error states with simple boolean flags (`isLoading`, `error`).
- Base URL and device credentials must come from `expo-secure-store` or `.env` — never hardcoded.

## State Management

- Component-local state: `useState`.
- Shared cross-component state: `useContext` with a typed context file in `lib/`.
- Custom hooks in `lib/` for polling patterns (`usePolling`, `useDeviceCommand`).
- No global state library unless the feature cannot be expressed with context.

## Navigation

- `expo-router` file-based routing — pages live in `app/`.
- Use `@react-navigation/bottom-tabs` for the tab bar.
- Add a new route only when the user genuinely moves to a different task context.

## Dependencies

- **No new `npm install`** without justification.
- Prefer Expo SDK packages over bare community packages (better managed updates).
- Every new dependency must be documented in the PR with the reason.

## Testing

```bash
cd nomotactic && npx expo lint
cd nomotactic && npx jest --passWithNoTests
```

- Jest with `jest-expo` preset.
- Test files live in `tests/`.
- Mock `fetch` and device services; never hit real hardware in tests.
- `npx expo lint` must pass clean before any PR.

## Security

- No secrets, device IPs, or credentials in source code.
- Use `expo-secure-store` for sensitive values (auth tokens, pairing keys).
- Validate all user inputs before submitting to the API.
- Log only non-sensitive debugging information — never log auth tokens or device credentials.

## Key Files

| File | Purpose |
|------|---------|
| `app/_layout.tsx` | Root layout and tab bar configuration |
| `app/index.tsx` | Main landing screen |
| `lib/transport.tsx` | Unified command transport (HTTPS) |
| `lib/api.ts` | Raw `fetch` wrappers for nomothetic REST API |
| `lib/endpoints.ts` | API endpoint constants |
| `lib/auth.tsx` | Auth state context |
| `lib/devices.ts` | Device registry helpers |
| `lib/theme.ts` | Design tokens (colours, spacing) |
