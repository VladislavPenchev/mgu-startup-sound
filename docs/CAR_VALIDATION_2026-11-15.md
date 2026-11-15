# X5 40i validation — 2026-11-15

Firmware: BMW MGU P18_23w44.2-1-3, ID7. App 0.3.1, helper 0.2.1.

Confirmed on the actual head unit:

- Owner heard the built-in clip from the physical TEST SOUND button after the helper fix.
- Authenticated audio helper is reachable by UID 12243; no audio-group or root privileges were added to the app.
- STOP/disconnected client releases the helper's busy state. Invalid and unauthenticated clips are rejected.
- Phone QR displayed; helper installed its dedicated Wi-Fi firewall rule.
- Desktop Chromium at mobile viewport connected through an SSH port forward to the actual app's phone server.
- File upload, Web Audio decode, preview, 0.7-second trim, save and selection worked against the real car backend. Speaker test logged Played successfully.
- Built-in selection and USB enumeration completed. No physical USB drive was connected.
- YouTube public clip jNQXAC9IVRw downloaded as the app UID. The complete real-browser flow downloaded, decoded, trimmed to 0.6 seconds and saved a YouTube clip.
- Browser tests restored the previous custom clip (if any) and selected sound.
- Owner enabled automatic playback and performed an ignition cycle: log at 14:27:08 UTC showed Engine running, at 14:27:10 Startup sound requested, then Playing and Played successfully at 14:27:13. Audible confirmation for this ignition cycle is pending.
- Final settings: automatic on, built-in chime, 20% clip level, two-second delay. Phone mode closed; pairing file removed and firewall helper inactive for phone access.
- Source and helper updates were installed through MGU Store, not by replacing live app files.

Not yet confirmed: audible feedback for the ignition test, automatic Start/Stop, cold-boot timing, physical USB media and the owner's iPhone browser. Those require their own on-car checks. Chromium emulation does not establish iOS Safari compatibility.

Local regression suite: 31 tests passed. Mobile browser fixture also passed all file/YouTube/USB editing flows; its simulated backend is separate from the real-car validation above.
