#!/usr/bin/env python3
"""Bounded 48 kHz stereo PCM playback into SmartX via the head unit's libasound.
No shell, downloads, mixer changes or global audio settings. Routing is owned by audio.js.
"""
import ctypes as C
import signal
import sys
import time
import wave


def play(filename, device):
    lib = C.CDLL('libasound.so.2')
    ptr = C.c_void_p
    lib.snd_pcm_open.argtypes = [C.POINTER(ptr), C.c_char_p, C.c_int, C.c_int]
    lib.snd_pcm_set_params.argtypes = [ptr, C.c_int, C.c_int, C.c_uint, C.c_uint, C.c_int, C.c_uint]
    lib.snd_pcm_writei.argtypes = [ptr, ptr, C.c_ulong]
    lib.snd_pcm_writei.restype = C.c_long
    lib.snd_pcm_recover.argtypes = [ptr, C.c_int, C.c_int]
    lib.snd_pcm_close.argtypes = [ptr]
    lib.snd_pcm_drop.argtypes = [ptr]
    lib.snd_pcm_delay.argtypes = [ptr, C.POINTER(C.c_long)]
    lib.snd_strerror.argtypes = [C.c_int]
    lib.snd_strerror.restype = C.c_char_p
    pcm = ptr()

    def check(rc):
        if rc < 0:
            raise RuntimeError(lib.snd_strerror(rc).decode('utf-8', 'replace'))

    def interrupted(*_):
        raise InterruptedError('Playback stopped')

    signal.signal(signal.SIGTERM, interrupted)
    with wave.open(filename, 'rb') as wav:
        if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate(), wav.getcomptype()) != (2, 2, 48000, 'NONE'):
            raise ValueError('Expected 48 kHz stereo 16-bit PCM WAV')
        if not 0 < wav.getnframes() <= 480000:
            raise ValueError('Clip must be at most 10 seconds')
        check(lib.snd_pcm_open(C.byref(pcm), device.encode(), 0, 1))  # playback, nonblocking
        try:
            check(lib.snd_pcm_set_params(pcm, 2, 3, 2, 48000, 1, 64000))  # S16_LE, RW_INTERLEAVED
            deadline = time.monotonic() + wav.getnframes() / 48000 + 3
            while True:
                chunk = wav.readframes(1024)
                if not chunk:
                    break
                buf = C.create_string_buffer(chunk)
                offset = 0
                while offset < len(chunk):
                    if time.monotonic() > deadline:
                        raise TimeoutError('Audio device stalled')
                    n = lib.snd_pcm_writei(pcm, C.cast(C.byref(buf, offset), ptr), (len(chunk) - offset) // 4)
                    if n == -11 or n == 0:  # EAGAIN: keep a bounded nonblocking loop
                        time.sleep(0.005)
                    elif n < 0:
                        check(lib.snd_pcm_recover(pcm, n, 1))
                    else:
                        offset += n * 4
            # Drain without an unbounded snd_pcm_drain call.
            while time.monotonic() < deadline:
                delay = C.c_long()
                check(lib.snd_pcm_delay(pcm, C.byref(delay)))
                if delay.value <= 0:
                    return
                time.sleep(0.005)
            raise TimeoutError('Audio drain timeout')
        finally:
            lib.snd_pcm_drop(pcm)
            lib.snd_pcm_close(pcm)


if __name__ == '__main__':
    try:
        if len(sys.argv) != 3:
            raise ValueError('Usage: player.py FILE DEVICE')
        play(sys.argv[1], sys.argv[2])
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
