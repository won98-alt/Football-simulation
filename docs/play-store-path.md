# Play Store Path

This project is being prepared as an offline-first Android app.

## Product decision

The durable path is:

1. Keep the prediction engine and UI bundled in the app.
2. Let users enter, import, and edit match data locally.
3. Treat online search or external sports APIs as optional helpers, not as the
   only way the app works.
4. Package the web UI with Capacitor for Android.
5. Publish an Android App Bundle (`.aab`) through Play Console.

This avoids depending on a long-running backend server for core prediction
features. Users who already installed the app can keep using the local simulator
even if external data providers change.

## Important limitation

Google Play distribution itself is not permanent without any future maintenance.
Target API requirements and Play policies change over time. If the app is never
updated, already-installed users may keep using it, but new users on newer
Android versions may eventually stop seeing or installing it from Play Store.

## Local development

Install JDK 21 and Android command-line tools first. Capacitor 8 uses Java 21
source compatibility for its Android build.

On Apple Silicon macOS with Homebrew:

```bash
HOMEBREW_NO_AUTO_UPDATE=1 brew install openjdk@21 android-commandlinetools
```

Prepare the SDK:

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
yes | sdkmanager --sdk_root=/opt/homebrew/share/android-commandlinetools --licenses
sdkmanager --sdk_root=/opt/homebrew/share/android-commandlinetools \
  "platform-tools" \
  "platforms;android-36" \
  "build-tools;36.0.0"
```

Create `android/local.properties`:

```properties
sdk.dir=/opt/homebrew/share/android-commandlinetools
```

Then run:

```bash
pnpm install
pnpm android:sync
pnpm android:debug
```

Build a signed release bundle:

```bash
pnpm android:bundle
```

The release bundle is generated at:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

## Signing

Release signing is configured through local ignored files:

```text
android/keystore.properties
android/keystores/football-simulation-upload.jks
```

Keep both files backed up in a password manager or secure storage. If the upload
key is lost, future Play Store updates become painful and may require a key
reset process through Play Console.

## Release checklist

- Create a Google Play developer account.
- Prepare a production app name, icon, feature graphic, screenshots, and short
  and full descriptions.
- Create a privacy policy URL.
- Complete Play Console Data safety declarations.
- Configure Android app signing.
- Build and upload a signed `.aab`.
- If using a new personal Play developer account, complete the required closed
  test before requesting production access.

## Data strategy

The app should work without a server by supporting:

- built-in sample data
- JSON import/export
- user-managed local data saved in browser or Android WebView storage
- future user-edited team ratings
- future user-entered match results

Optional online helpers can be added later:

- fixture lookup
- sports API imports
- search-result assisted data entry
- AI-assisted text extraction from copied match summaries
