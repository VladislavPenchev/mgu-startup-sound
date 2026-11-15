'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('events');
const {Audio} = require('../apps/vgp_startup_sound/audio');
function fixture(mode) {
    const calls = [], warnings = [];
    let connected = false, child;
    const ctx = {dataDir: '.', spec: {config: {python: process.execPath, sourceId: 287, sinkId: 1024, alsaDevice: 'test'}}, log: {warn: (x) => warnings.push(x)}, signals: {
        proxy: async () => ({shutdown: async () => {}}), onAvailable: (p, fn) => fn(true),
        call: async (p, name, args) => {
            calls.push({name, args});
            if (name === 'getListMainConnections') return {listConnections: mode === 'busy' ? [{sourceID: 287, mainConnectionID: 99}] : connected ? [{sourceID: 287, mainConnectionID: 7, connectionState: 'CS_CONNECTED'}] : []};
            if (name === 'getListMainSources') return {listSources: [{sourceID: 287, name: mode === 'wrong' ? 'OtherSource' : 'CarLifeMedia', availability: {availability: mode === 'available' ? 'A_AVAILABLE' : mode === 'unknown' ? 'A_UNKNOWN' : 'A_UNAVAILABLE'}}]};
            if (name === 'connect') { if (mode === 'refuse') return {amError: 'E_NOT_POSSIBLE'}; connected = true; return {amError: 'E_OK', mainConnectionID: 7}; }
            if (name === 'disconnect') { connected = false; return {amError: 'E_OK'}; }
            return {amError: 'E_OK'};
        },
    }};
    const a = new Audio(ctx, {platform: 'linux', prepare: () => ({file: 'clip.wav', seconds: 1}), spawn: () => {
        child = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => { setImmediate(() => child.emit('close', null)); return true; };
        if (mode !== 'cancel') setImmediate(() => child.emit('close', mode === 'fail' ? 1 : 0));
        return child;
    }});
    return {a, calls, warnings, child: () => child};
}
test('speaker route is released and availability restored after playback', async () => {
    const f = fixture(); assert.equal(await f.a.play('chime', 20), true);
    assert.deepEqual(f.calls.filter((x) => x.name === 'disconnect').map((x) => x.args), [{mainConnectionID: 7}]);
    assert.equal(f.calls.filter((x) => x.name === 'hookSourceAvailablityStatusChange').pop().args.availability.availability, 'A_UNAVAILABLE');
});
test('busy or mismatched source is untouched', async () => {
    for (const mode of ['busy', 'wrong', 'unknown']) { const f = fixture(mode); assert.equal(await f.a.play('chime', 20), false); assert.ok(!f.calls.some((x) => x.name === 'connect' || x.name === 'hookSourceAvailablityStatusChange')); }
});

test('idle available source keeps its original availability', async () => {
    const f = fixture('available'); assert.equal(await f.a.play('chime', 20), true);
    assert.ok(!f.calls.some((x) => x.name === 'hookSourceAvailablityStatusChange'));
    assert.deepEqual(f.calls.filter((x) => x.name === 'disconnect').map((x) => x.args), [{mainConnectionID: 7}]);
});
test('player failure still disconnects only its own route', async () => {
    const f = fixture('fail'); assert.equal(await f.a.play('chime', 20), false);
    assert.equal(f.calls.filter((x) => x.name === 'disconnect').length, 1); assert.equal(f.a.busy, false);
});
test('explicit connect refusal restores source availability without disconnecting other routes', async () => {
    const f = fixture('refuse'); assert.equal(await f.a.play('chime', 20), false);
    assert.equal(f.calls.filter((x) => x.name === 'disconnect').length, 0);
    assert.equal(f.calls.filter((x) => x.name === 'hookSourceAvailablityStatusChange').pop().args.availability.availability, 'A_UNAVAILABLE');
});
test('stop cancels player and cleanup runs before busy is released', async () => {
    const f = fixture('cancel'); const playing = f.a.play('chime', 20);
    while (!f.child()) await new Promise((r) => setImmediate(r));
    assert.equal(await f.a.play('chime', 20), false); f.a.stop(); assert.equal(await playing, false);
    assert.ok(f.calls.some((x) => x.name === 'disconnect')); assert.equal(f.a.busy, false);
});
