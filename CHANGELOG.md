# Changes

## 0.3.1

- Confirmed manual speaker playback from the actual car UI on X5 40i ID7.
- SmartX requires privileges beyond filesystem access: use a local authenticated helper for bounded PCM playback, not a privileged app.
- Helper accepts only validated 48 kHz stereo PCM up to ten seconds; fixed player/device, cancellation, timeout and temporary-file cleanup.
- Preserve an already available idle CarLifeMedia source and disconnect only the connection created for the clip.
- Verified YouTube audio download on the head unit as the app UID. Unavailable videos still fail without replacing the existing sound.
- Include the kit license in partial builds; phone pairing diagnostics are private and removed on close.
- 31 automated tests. Physical ignition, Start/Stop, USB and iPhone playback still require their own validation.

## 0.2.0

- Temporary QR phone page in Bulgarian, same-network token pairing and scoped Wi-Fi helper.
- Phone file import (browser-supported MP3/WAV/M4A), USB scan and import via the phone.
- Pinned yt-dlp audio-only YouTube download with MGU uplink DNS and Node.js 22 dependency.
- Browser-side 48 kHz stereo PCM conversion, start/duration selection, fades and preview.
- Save/select one custom slot, listen on the phone, test in the car, stop and delete.
- Bounds on file size, duration, request size and lifetime; previous sound kept on download/validation failure.
- Network helper and App Kit / yt-dlp licenses bundled. No ffmpeg dependency.
- 29 automated tests plus Chromium mobile-size browser flow verification.
- Still experimental: actual Wi-Fi, YouTube connectivity and audio routing require car validation.

## 0.1.0

- Initial ID7 prototype: background ignition-session detection, built-in chimes,
  custom PCM WAV playback and AudioManager/SmartX speaker test.
