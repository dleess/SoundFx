# SoundFx

Automatic loudness normalization for any `<video>`/`<audio>` — across browsers and Android. Songs and videos on YouTube (and everywhere else) play at wildly different loudness; SoundFx levels them out in real time and adds equalizer-grade fine control (compressor parameters, EQ, per-site presets).

## How it works

- **Browsers**: a content script attaches a Web Audio chain (`MediaElementSource → EQ → DynamicsCompressor → auto-makeup Gain`) to every media element; an AudioWorklet measures real-time loudness (RMS-based approximate LUFS) and steers gain toward the target.
- **Android**: attaches `DynamicsProcessing` audio effects to sessions announced via `ACTION_OPEN_AUDIO_EFFECT_CONTROL_SESSION` broadcasts, with a session 0 fallback.
- **iOS**: sandboxing blocks access to other apps' audio, so iOS is covered by the Safari web extension (web playback only).

Measured result: 15.4 dB loudness spread across real tracks reduced to 0.2 dB at the output.

## Folder layout

| Path | Description |
|---|---|
| `extension/` | Chrome/Firefox/Edge extension (Manifest V3, vanilla JS). Core logic: `gain-logic.js`, `normalizer.worklet.js`, `silence-detector.js`, `settings-logic.js`. Tests in `extension/tests/`. |
| `safari/SoundFx/` | Safari extension app for macOS and iOS (Xcode project produced by the Safari converter; resources reference `extension/`, no duplication). |
| `android/` | Native Android app (Kotlin, Gradle). Applies `DynamicsProcessing` to system audio sessions. |
| `assets/` | Final app icon source (`icon-1024.png`); platform icons are derived from it. |
| `images/` | Icon design candidates and working images. |
| `goal/`, `goal2/`, `goal3/` | Development records for each phase (plan, progress, validation evidence, environment gotchas). |
| `plan.md` | PRD — platform constraints and roadmap (single source of truth). |
| `HANDOFF.md` | Session handoff notes: current status, build environment, deployment steps. |

## Build & test

```sh
# Extension tests (run from repo root; Node 24)
node --test

# Safari (macOS)
xcodebuild -project safari/SoundFx/SoundFx.xcodeproj -scheme "SoundFx (macOS)" build CODE_SIGN_IDENTITY=-

# Android
export JAVA_HOME=/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=$HOME/Library/Android/sdk
cd android && ./gradlew test assembleDebug
```

## Status

All three phases (extension, Safari port, Android app) are implemented and verified on emulators/simulators. Remaining: store deployment and real-device YouTube session verification. See `HANDOFF.md` for details.
