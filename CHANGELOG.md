# Changes

## 0.4.0

- Skip greetings/tests while another source already owns the same speaker sink. Stop an in-progress greeting if music connects.
- Require the reserved source to start unavailable; never borrow an already available source.
- Confirm the exact owned connection has disappeared after disconnect before restoring its availability. Leave foreign connections untouched.
- Recovered the idle source left available during earlier testing; owner reported YouTube Music no longer stuttered without another ignition cycle. Automatic playback temporarily disabled pending the post-update comparison.
- 32 regression tests, including music starting during a greeting and cleanup after cancellation.

## 0.3.3

- Allow the numeric tailnet Host header when Tailscale's userspace proxy connects from loopback. Pairing token and exact Origin validation still apply.
- The owner's iPhone timed out over the hotspot in both Chrome and Safari; packet capture observed no incoming requests. Local-network access for Chrome was already enabled. Direct hotspot access is not confirmed.

## 0.3.2

- Fix pairing from the iPhone providing the car's hotspot: prefer the car's private wlan0 address in the QR code.
- While phone mode is open, allow its one port on both the car Wi-Fi bridge and private uplink. Remove both dedicated rules on close.
- 32 regression tests, including hotspot QR address selection.

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
