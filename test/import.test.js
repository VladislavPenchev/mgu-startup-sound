'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const {EventEmitter} = require('events');
const {Library} = require('../apps/vgp_startup_sound/library');
const {Youtube, youtubeId} = require('../apps/vgp_startup_sound/youtube');
const {tone} = require('../apps/vgp_startup_sound/wav');
test('YouTube parser accepts video URLs and rejects playlists, credentials, ports and other hosts', () => {
    for (const url of ['https://youtu.be/BaW_jenozKc', 'https://www.youtube.com/watch?v=BaW_jenozKc', 'https://youtube.com/shorts/BaW_jenozKc']) assert.equal(youtubeId(url), 'BaW_jenozKc');
    for (const url of ['https://youtube.com.evil.test/watch?v=BaW_jenozKc', 'https://youtube.com/watch?v=BaW_jenozKc&list=abc', 'file:///etc/passwd', 'http://youtu.be/BaW_jenozKc', 'https://user@youtu.be/BaW_jenozKc', 'https://youtu.be:444/BaW_jenozKc']) assert.equal(youtubeId(url), null);
});
test('USB scanner lists bounded media, omits symlinks/hidden files, and cannot read arbitrary paths', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'startup-usb-'));
    try {
        const usb = path.join(dir, 'usb'); fs.mkdirSync(usb); fs.writeFileSync(path.join(usb, 'intro.wav'), tone(false)); fs.writeFileSync(path.join(usb, '.hidden.mp3'), 'x'); fs.writeFileSync(path.join(usb, 'private.txt'), 'x');
        const lib = new Library(dir), list = lib.scan([usb]); assert.equal(list.length, 1); assert.equal(list[0].name, 'intro.wav');
        assert.equal(lib.source('0'), path.join(usb, 'intro.wav')); assert.throws(() => lib.source('../private.txt'));
        fs.unlinkSync(path.join(usb, 'intro.wav')); assert.throws(() => lib.source('0'));
    } finally { fs.rmSync(dir, {recursive: true}); }
});
test('YouTube download requests audio only, has bounded limits, and preserves custom sound on failure', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'startup-yt-')); let child, args;
    try {
        const custom = tone(false); fs.writeFileSync(path.join(dir, 'custom.wav'), custom);
        const yt = new Youtube({dataDir: dir, spec: {config: {python: process.execPath, node22: process.execPath}}, log: {warn() {}}}, {spawn: (exe, a) => {
            args = a; child = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => { setImmediate(() => child.emit('close', 1)); return true; }; return child;
        }});
        assert.throws(() => yt.start('https://evil.test'));
        yt.start('https://youtu.be/BaW_jenozKc'); assert.ok(args.includes('bestaudio[ext=m4a]')); assert.ok(args.includes('20M')); assert.ok(args.includes('--no-playlist'));
        assert.throws(() => yt.start('https://youtu.be/BaW_jenozKc'));
        const closed = new Promise((r) => child.once('close', r)); yt.cancel(); await closed;
        assert.equal(yt.status().state, 'error'); assert.deepEqual(fs.readFileSync(path.join(dir, 'custom.wav')), custom);
        yt.start('https://youtu.be/BaW_jenozKc'); fs.writeFileSync(path.join(dir, 'youtube-cache/source.m4a'), 'test audio'); child.emit('close', 0);
        assert.equal(yt.status().state, 'ready'); assert.ok(yt.file().endsWith('source.m4a')); yt.cancel(); assert.equal(yt.status().state, 'idle');
    } finally { fs.rmSync(dir, {recursive: true}); }
});
test('pinned yt-dlp zipapp matches official release digest', () => {
    const zip = fs.readFileSync(path.join(__dirname, '../apps/vgp_startup_sound/ytdlp.pyz'));
    assert.equal(crypto.createHash('sha256').update(zip).digest('hex'), 'e51e69e89489f199530f13d32a4342da3ddb2cf34842f364603a066db05afbf3');
});
test('actual Python adapter starts the pinned downloader without network', () => {
    const root = path.join(__dirname, '../apps/vgp_startup_sound');
    const out = require('child_process').execFileSync(process.platform === 'win32' ? 'python' : 'python3', [path.join(root, 'youtube_fetch.py'), path.join(root, 'ytdlp.pyz'), path.join(os.tmpdir(), 'nonexistent-startup-lease.json'), '--version'], {encoding: 'utf8', timeout: 15000});
    assert.equal(out.trim(), '2026.10.26');
});
