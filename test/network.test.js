'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {makeFirewall} = require('../native/startup-net/firewall');
const {makeNetwork} = require('../native/startup-net/server');
test('network bridge only changes its own dedicated Wi-Fi rule', async () => {
    let rows = ['iifname "wlan_bridge" tcp dport 18890 accept comment "mgu-phone-bridge" # handle 1', 'counter drop # handle 2'];
    let handle = 3;
    const run = async (args) => {
        if (args[0] === '-a') return rows.join('\n');
        if (args[0] === 'insert') { rows.unshift(args.slice(5).join(' ') + ' # handle ' + handle++); return ''; }
        if (args[0] === 'delete') { rows = rows.filter((r) => !r.endsWith('handle ' + args[6])); return ''; }
        throw Error('Unexpected nft request');
    };
    const fw = makeFirewall({run}); assert.equal(await fw.ensure(), 'added');
    assert.ok(rows[0].includes('tcp dport 18887 accept')); assert.equal(await fw.ensure(), 'kept');
    await fw.close(); assert.equal(rows.length, 2); assert.ok(rows[0].includes('mgu-phone-bridge'));
});
test('network readiness tracks the listener and closes the dedicated rule on stop', async () => {
    const calls = []; let listening = true;
    const network = makeNetwork({firewall: {close: async () => calls.push('close'), ensure: async () => calls.push('ensure')}, probe: async () => listening, statusPort: 0, intervalMs: 60000});
    try {
        await network.start(); assert.equal(network.status().ready, true); assert.ok(calls.includes('ensure'));
        listening = false; await network.check(); assert.equal(network.status().ready, false);
    } finally { await network.stop(); }
    assert.equal(calls[calls.length - 1], 'close');
});
