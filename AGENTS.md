# Cafmoda development workflow

After changing the app, complete the local update instead of leaving only a
build artifact:

1. Run the relevant checks and `deno task build`.
   For tray interaction changes, run `deno task test:tray-runtime` as well.
   It exercises real AppKit menu events and TypeScript callbacks; a mocked
   event-monitor test is insufficient to verify menu-bar clicks.
2. Close any running Cafmoda instance before installing the update. Identify
   processes by their Cafmoda app bundle path; do not terminate unrelated
   applications using the Laufey runtime.
3. Install `dist/Cafmoda.app` in the standard `/Applications/Cafmoda.app`
   location, replacing the previous copy.
4. Verify the installed bundle's signature with
   `codesign --verify --deep --strict /Applications/Cafmoda.app`.
5. Start the app from `/Applications/Cafmoda.app`, then verify that it is running
   with the updated payload. The launcher runs the extracted runtime under
   `~/Library/Application Support/dev.osim.cafmoda/`; this is expected. Its
   `CAFMODA_APP_PATH` must point to `/Applications/Cafmoda.app`.

Do not leave the app closed or require the user to install or restart it after
an app change, unless the user explicitly asks for that.
