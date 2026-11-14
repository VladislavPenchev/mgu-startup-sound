# Third-party components

`kit/` is vendored from the MIT-licensed
[cauliflowermossgrape/idrive7-apps](https://github.com/cauliflowermossgrape/idrive7-apps)
at `8d860de5818a2da11d3a3750aab36866cecf6bde`. Full MIT license:
`kit/LICENSE.upstream`. Font notices remain in their original folders.

Local kit changes: build copies the Python helper, preserves license, mguHmi
and requires/mguInternet in generated package metadata, includes the upstream license in
installed runtime files; preview stub initializes background before start.

Hardware reference, not copied code:
[JustAnotherPU/moonride](https://github.com/JustAnotherPU/moonride) at
`d1073cef7c5be72fbbd2cdeb441e874342ae6083`: AudioManager source/sink routing in
apps/jap_moonride/main.js and SmartX device in the systemd service.

Python ctypes calls the head unit's existing libasound.so.2 via the ALSA C ABI.
ALSA and BMW binaries are not redistributed. Proprietary oap-sdk comes from
the owner's head unit, is ignored by Git, and is supplied by Store on-unit builds.

Version 0.2 additions:

- `kit/runtime/qr.js` from the MIT App Kit vendored in JustAnotherPU/ridetube,
  commit `63364945d85344071dda0821464c4822372001e7`; same kit MIT license applies.
- `native/startup-net/` adapted from NamelsMissing/mgu-apps `native/video-net`,
  commit `e4f14e0f6aa4b9cbab79451b058292a63430044e`, MIT. Full copyright / license
  retained in native/startup-net/LICENSE and installed with the tool. Names,
  ports, health endpoint and dependency metadata were scoped to Startup Sound.
- Official yt-dlp zipapp `2026.10.26` from
  https://github.com/yt-dlp/yt-dlp/releases/download/2026.10.26/yt-dlp,
  SHA256 `e51e69e89489f199530f13d32a4342da3ddb2cf34842f364603a066db05afbf3`.
  `apps/vgp_startup_sound/YTDLP_LICENSE` (Unlicense) and `EJS_LICENSE` (MIT)
  accompany the zipapp and are copied to installed packages.
  Node.js 22 is an external MGU Store dependency, not redistributed here.
- New phone UI, upload/library implementation and Python uplink DNS adapter
  are original MIT application code. No ffmpeg binary or source is included.
