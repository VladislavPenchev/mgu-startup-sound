'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const {Companion, privateIp} = require('../apps/vgp_startup_sound/companion');
const {tone} = require('../apps/vgp_startup_sound/wav');
test('QR prefers private uplink address for the hotspot-hosting phone', () => {
    const previous = os.networkInterfaces;
    try {
        os.networkInterfaces = () => ({wlan_bridge: [{family: 'IPv4', address: '172.16.222.97', internal: false}], wlan0: [{family: 'IPv4', address: '172.20.10.10', internal: false}]});
        assert.equal(require('../apps/vgp_startup_sound/companion').address(), '172.20.10.10');
        os.networkInterfaces = () => ({wlan_bridge: [{family: 'IPv4', address: '172.16.222.97', internal: false}]});
        assert.equal(require('../apps/vgp_startup_sound/companion').address(), '172.16.222.97');
    } finally { os.networkInterfaces = previous; }
});
async function fixture() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'startup-phone-'));
    const values = {sound: 'chime'}; let allowed = true, busy = false, tests = 0;
    const ctx = {dataDir: dir, settings: {get: (k) => values[k], set: (k, v) => { values[k] = v; }}};
    const yt = {status: () => ({state: 'idle'}), cancel() {}, start: () => ({state: 'downloading'})};
    const phone = new Companion(ctx, {allowed: () => allowed, busy: () => busy, test: async () => tests++, stop() {}}, {port: 0, host: '127.0.0.1', youtube: yt});
    await phone.start();
    const request = (route, data, extra, method) => new Promise((resolve, reject) => {
        const payload = data === undefined ? null : Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data));
        const req = http.request({hostname: '127.0.0.1', port: phone.port, path: route, method: method || (payload ? 'POST' : 'GET'),
            headers: Object.assign({'X-MGU-Token': phone.token}, payload ? {'Content-Length': payload.length} : {}, extra)}, (res) => {
            const chunks = []; res.on('data', (b) => chunks.push(b)); res.on('end', () => resolve({code: res.statusCode, bytes: Buffer.concat(chunks), headers: res.headers}));
        }); req.on('error', reject); req.end(payload);
    });
    return {dir, phone, request, values, tests: () => tests, allowed: (v) => { allowed = v; }, busy: (v) => { busy = v; }, async close() { await phone.stop(); fs.rmSync(dir, {recursive: true}); }};
}
test('phone upload, select, preview, test and delete operate on a validated clip', async () => {
    const f = await fixture(); try {
        assert.equal((await f.request('/upload', tone(false), {'X-Filename': encodeURIComponent('Моят звук.mp3')})).code, 201);
        const pairing = JSON.parse(fs.readFileSync(path.join(f.dir, 'phone-pairing.json'), 'utf8'));
        assert.equal(pairing.token, f.phone.token);
        assert.equal(f.values.sound, 'custom');
        const s = JSON.parse((await f.request('/status')).bytes); assert.equal(s.custom.name, 'Моят звук.mp3');
        assert.equal((await f.request('/sound?id=custom')).bytes.slice(0, 4).toString(), 'RIFF');
        assert.equal((await f.request('/select', {sound: 'soft'})).code, 200); assert.equal(f.values.sound, 'soft');
        assert.equal((await f.request('/test', {})).code, 200); assert.equal(f.tests(), 1);
        await f.request('/select', {sound: 'custom'}); await f.request('/delete', {});
        assert.equal(f.values.sound, 'chime'); assert.equal(fs.existsSync(path.join(f.dir, 'custom.wav')), false);
    } finally { await f.close(); }
});
test('invalid WAV, busy playback and changed car state preserve previous sound', async () => {
    const f = await fixture(); try {
        const valid = tone(false); await f.request('/upload', valid);
        assert.equal((await f.request('/upload', Buffer.from('bad'))).code, 400);
        assert.deepEqual(fs.readFileSync(path.join(f.dir, 'custom.wav')), valid);
        f.busy(true); assert.equal((await f.request('/delete', {})).code, 409);
        f.allowed(false); assert.equal((await f.request('/upload', valid)).code, 409);
        assert.deepEqual(fs.readFileSync(path.join(f.dir, 'custom.wav')), valid);
    } finally { await f.close(); }
});
test('pairing token, origin, host, expiry and arbitrary paths are checked', async () => {
    const f = await fixture(); try {
        assert.equal((await f.request('/status', undefined, {'X-MGU-Token': 'wrong'})).code, 403);
        assert.equal((await f.request('/status', undefined, {Origin: 'https://evil.example'})).code, 403);
        assert.equal((await f.request('/status', undefined, {Host: 'evil.example'})).code, 403);
        assert.equal((await f.request('/usb/audio?id=../../README.md')).code, 400);
        assert.equal((await f.request('/')).code, 200);
        f.phone.expires = Date.now() - 1; assert.equal((await f.request('/status')).code, 403);
    } finally { await f.close(); }
});
test('phone listener only starts when car is stationary and rejects public clients', async () => {
    assert.equal(privateIp('8.8.8.8'), false); assert.equal(privateIp('::ffff:172.16.222.2'), true);
    const f = await fixture(); try { await f.phone.stop(); f.allowed(false); await assert.rejects(f.phone.start()); } finally { await f.close(); }
});
