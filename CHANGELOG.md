# Changes

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
