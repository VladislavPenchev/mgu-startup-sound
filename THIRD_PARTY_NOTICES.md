# Third-party components

`kit/` is vendored from the MIT-licensed
[cauliflowermossgrape/idrive7-apps](https://github.com/cauliflowermossgrape/idrive7-apps)
at `8d860de5818a2da11d3a3750aab36866cecf6bde`. Full MIT license:
`kit/LICENSE.upstream`. Font notices remain in their original folders.

Local kit changes: build copies the Python helper, preserves license, mguHmi
and requires in generated package metadata, includes the upstream license in
installed runtime files; preview stub initializes background before start.

Hardware reference, not copied code:
[JustAnotherPU/moonride](https://github.com/JustAnotherPU/moonride) at
`d1073cef7c5be72fbbd2cdeb441e874342ae6083`: AudioManager source/sink routing in
apps/jap_moonride/main.js and SmartX device in the systemd service.

Python ctypes calls the head unit's existing libasound.so.2 via the ALSA C ABI.
ALSA and BMW binaries are not redistributed. Proprietary oap-sdk comes from
the owner's head unit, is ignored by Git, and is supplied by Store on-unit builds.
