'use strict';
const fs = require('fs');
function inspect(b) {
    if (!Buffer.isBuffer(b) || b.length < 44 || b.length > 3000000 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw Error('Use a PCM WAV file, at most 10 seconds / 3 MB');
    let fmt = null, data = null;
    for (let p = 12; p + 8 <= b.length;) {
        const size = b.readUInt32LE(p + 4), end = p + 8 + size;
        if (end > b.length) throw Error('Truncated WAV chunk');
        const tag = b.toString('ascii', p, p + 4);
        if (tag === 'fmt ' && size >= 16) fmt = {format: b.readUInt16LE(p + 8), channels: b.readUInt16LE(p + 10), rate: b.readUInt32LE(p + 12), align: b.readUInt16LE(p + 20), bits: b.readUInt16LE(p + 22)};
        if (tag === 'data') data = b.slice(p + 8, end);
        p = end + (size & 1);
    }
    if (!fmt || !data || !data.length || fmt.format !== 1 || fmt.channels !== 2 || fmt.rate !== 48000 || fmt.bits !== 16 || fmt.align !== 4 || data.length % 4 || data.length / 192000 > 10) throw Error('Required: stereo PCM WAV, 48000 Hz, 16 bit, 0–10 seconds');
    return {data, seconds: data.length / 192000};
}
function encode(pcm) {
    const h = Buffer.alloc(44);
    h.write('RIFF'); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16);
    h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(48000, 24); h.writeUInt32LE(192000, 28);
    h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
    return Buffer.concat([h, pcm]);
}
function tone(soft) {
    const notes = soft ? [523.25, 659.25] : [523.25, 659.25, 783.99];
    const seconds = soft ? 1.2 : 1.7, pcm = Buffer.alloc(Math.ceil(seconds * 48000) * 4);
    for (let i = 0; i < pcm.length / 4; i++) {
        const t = i / 48000; let sample = 0;
        notes.forEach((f, j) => { const a = t - j * 0.23; if (a >= 0) sample += Math.sin(2 * Math.PI * f * a) * Math.min(1, a / 0.015) * Math.exp(-a * 5) / notes.length; });
        const fade = Math.min(1, (seconds - t) / 0.03);
        const s = Math.round(sample * Math.max(0, fade) * 22000);
        pcm.writeInt16LE(s, i * 4); pcm.writeInt16LE(s, i * 4 + 2);
    }
    return encode(pcm);
}
function prepare(dir, sound, gain) {
    const path = require('path');
    let b;
    if (sound === 'custom') {
        const file = path.join(dir, 'custom.wav');
        if (fs.statSync(file).size > 3000000) throw Error('custom.wav exceeds 3 MB');
        b = fs.readFileSync(file);
    } else b = tone(sound === 'soft');
    const parsed = inspect(b), pcm = Buffer.from(parsed.data);
    const level = Math.min(0.5, Math.max(0.01, Number(gain) / 100 || 0.2));
    for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE(Math.round(pcm.readInt16LE(i) * level), i);
    const target = path.join(dir, 'playback.wav'); fs.writeFileSync(target, encode(pcm));
    return {file: target, seconds: parsed.seconds};
}
module.exports = {inspect, encode, tone, prepare};
