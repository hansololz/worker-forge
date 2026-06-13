/**
 * electron-builder config.
 *
 * Signing + notarization are OFF by default (ad-hoc / unsigned build) and turn
 * ON automatically when the relevant env vars are present — so no code change is
 * needed once you enroll in the Apple Developer Program.
 *
 * To sign:
 *   export CSC_LINK=/path/to/DeveloperIDApp.p12   # or CSC_NAME="Developer ID Application: …"
 *   export CSC_KEY_PASSWORD=...                    # p12 password
 * To also notarize (requires signing):
 *   export APPLE_ID=you@example.com
 *   export APPLE_APP_SPECIFIC_PASSWORD=abcd-efgh-ijkl-mnop
 *   export APPLE_TEAM_ID=ABCDE12345
 *
 * NOTE: the backend is bundled as a PyInstaller *onefile* binary. Notarization
 * requires every nested executable to be signed with the hardened runtime; a
 * onefile binary self-extracts unsigned content at runtime and will fail
 * notarization/library-validation. Before notarizing, switch the PyInstaller
 * build to *onedir* (see SPEC.md §11) so each nested file can be signed.
 */

const signing = Boolean(process.env.CSC_LINK || process.env.CSC_NAME)
const canNotarize =
  signing &&
  process.env.APPLE_ID &&
  process.env.APPLE_APP_SPECIFIC_PASSWORD &&
  process.env.APPLE_TEAM_ID

/** @type {import('electron-builder').Configuration} */
const config = {
  appId: 'com.workerforge.app',
  productName: 'Worker Forge',
  directories: {
    output: 'dist',
    buildResources: 'build-assets',
  },
  files: ['out/**/*', 'package.json'],
  extraResources: [
    { from: 'backend/dist/worker-forge-backend', to: 'backend/worker-forge-backend' },
  ],
  asar: true,
  mac: {
    target: ['dmg', 'zip'],
    category: 'public.app-category.developer-tools',
    icon: 'build-assets/icon.icns',
    ...(signing
      ? {
          hardenedRuntime: true,
          gatekeeperAssess: false,
          entitlements: 'build-assets/entitlements.mac.plist',
          entitlementsInherit: 'build-assets/entitlements.mac.plist',
        }
      : { identity: null }),
    ...(canNotarize ? { notarize: { teamId: process.env.APPLE_TEAM_ID } } : {}),
  },
}

module.exports = config
