'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const {AudioBridge} = require('../native/startup-net/audio-bridge');
test('audio bridge rejects unauthenticated and concurrent requests without unlocking another player', async () => {
    const bridge = new AudioBridge(); bridge.token = 'test-secret'; bridge.identity = () => {};
    const server = http.createServer((req, res) => bridge.handle(req, res));
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const request = (token, data) => new Promise((resolve, reject) => {
        const req = http.request({hostname: '127.0.0.1', port: server.address().port, path: '/audio/play', method: 'POST', headers: {'X-Audio-Token': token}}, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
        req.on('error', reject); req.end(data);
    });
    try {
        bridge.busy = true;
        assert.equal(await request('wrong', ''), 403); assert.equal(bridge.busy, true);
        assert.equal(await request('test-secret', ''), 409); assert.equal(bridge.busy, true);
        bridge.busy = false;
        assert.equal(await request('test-secret', 'invalid PCM'), 400); assert.equal(bridge.busy, false); assert.equal(bridge.child, null);
    } finally { await new Promise(r => server.close(r)); }
});
