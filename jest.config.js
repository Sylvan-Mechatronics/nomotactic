/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          strict: true,
          types: ["jest", "node"],
          // node16 honours package.json "exports" — react-native ≥0.80 publishes
          // its types only there. Still emits CommonJS (no "type": "module").
          module: "node16",
          moduleResolution: "node16",
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
        },
        // TS151002 suggests isolatedModules for node16, which would turn off
        // type-checking in tests; the CommonJS emit above is what we want.
        diagnostics: { ignoreCodes: [151002] },
      },
    ],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^react-native$": "<rootDir>/tests/__mocks__/react-native.js",
    "^expo-audio$": "<rootDir>/tests/__mocks__/expo-audio.js",
    "^expo-speech$": "<rootDir>/tests/__mocks__/expo-speech.js",
  },
};
