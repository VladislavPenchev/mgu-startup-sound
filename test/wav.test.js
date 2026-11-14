'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {tone, inspect, encode, prepare} = require('../apps/vgp_startup_sound/wav');
test('built-in clips are bounded stereo PCM with faded endpoints', () => {
    for (const soft of [true, false]) {
        const {data, seconds} = inspect(tone(soft)); assert.ok(seconds < 2);
        assert.equal(data.readInt16LE(0), 0); assert.ok(Math.abs(data.readInt16LE(data.length - 2)) < 10);
    }
});
test('reject malformed, compressed, oversized and non-48kHz WAVs', () => {
    assert.throws(() => inspect(Buffer.from('bad')));
    const b = tone(false); b.writeUInt32LE(44100, 24); assert.throws(() => inspect(b));
    const b2 = tone(false); b2.writeUInt16LE(3, 20); assert.throws(() => inspect(b2));
    assert.throws(() => inspect(encode(Buffer.alloc(48000 * 4 * 11))));
});
test('custom clip path is fixed and clip gain is applied without amplification', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'startup-wav-'));
    try {
        const pcm = Buffer.alloc(400); for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE(10000, i);
        fs.writeFileSync(path.join(dir, 'custom.wav'), encode(pcm));
        const out = prepare(dir, 'custom', 20); assert.equal(inspect(fs.readFileSync(out.file)).data.readInt16LE(0), 2000);
        const limited = prepare(dir, 'custom', 999); assert.equal(inspect(fs.readFileSync(limited.file)).data.readInt16LE(0), 5000);
    } finally { fs.rmSync(dir, {recursive: true}); }
});
