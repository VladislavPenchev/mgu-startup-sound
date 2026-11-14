'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {Session, rpmOf, speedOf, conditionOf} = require('../apps/vgp_startup_sound/session');
function fixture() {
    let time = 0, count = 0;
    const options = {enabled: true, delayMs: 2000};
    const s = new Session({now: () => time, options: () => options, play: () => count++});
    const advance = (ms) => { time += ms; s.tick(); };
    const off = () => { s.update({condition: 7, rpm: 0, speed: 0}); advance(1600); };
    const start = () => { s.update({condition: 8, rpm: 150}); s.update({condition: 10, rpm: 850}); };
    return {s, advance, off, start, options, count: () => count};
}
test('normal start plays once after delay; stop/start and repeated packets never repeat', () => {
    const f = fixture(); f.off(); f.start(); f.advance(1999); assert.equal(f.count(), 0);
    f.advance(1); assert.equal(f.count(), 1);
    for (let i = 0; i < 5; i++) { f.s.update({rpm: 0}); f.advance(60000); f.s.update({rpm: 850}); f.advance(6000); }
    assert.equal(f.count(), 1);
});
test('a genuine ignition-off re-arms the next journey', () => {
    const f = fixture(); f.off(); f.start(); f.advance(2000);
    f.s.update({condition: 12, rpm: 0}); f.advance(3000); f.off(); f.start(); f.advance(2000);
    assert.equal(f.count(), 2);
});
test('process restart during a running engine is silent, even after a long stop/start', () => {
    const f = fixture(); f.s.update({condition: 10, rpm: 850, speed: 0}); f.advance(10000);
    f.s.update({rpm: 0}); f.advance(600000); f.s.update({rpm: 850}); f.advance(10000);
    assert.equal(f.count(), 0);
});
test('unlock/contact alone and starter cranking are silent', () => {
    const f = fixture(); f.off(); f.s.update({condition: 5}); f.advance(20000);
    f.s.update({condition: 8, rpm: 250}); f.advance(10000); assert.equal(f.count(), 0);
});
test('movement cancels startup rather than playing after stopping again', () => {
    const f = fixture(); f.off(); f.start(); f.advance(500); f.s.update({speed: 5});
    f.advance(4000); f.s.update({speed: 0}); f.advance(10000); assert.equal(f.count(), 0);
});
test('unknown state/speed and invalid RPM cannot trigger playback', () => {
    const f = fixture(); f.off(); f.s.update({condition: null, rpm: 850}); f.advance(6000);
    f.s.update({condition: 10, speed: null}); f.advance(6000); assert.equal(f.count(), 0);
    assert.equal(rpmOf({actualValueRPMEngineCrankshaft: 65535}), null);
    assert.equal(speedOf({speedVehicleCentreOfGravity: 65535}), null);
    assert.equal(conditionOf('FAHREN'), 10); assert.equal(conditionOf(15), null);
});
test('disabling and re-enabling on a running engine does not cause a late greeting', () => {
    const f = fixture(); f.off(); f.options.enabled = false; f.start(); f.advance(10000);
    f.options.enabled = true; f.advance(10000); assert.equal(f.count(), 0);
});
test('stalled engine during the delay resets the delay but does not make a second session', () => {
    const f = fixture(); f.off(); f.start(); f.advance(1500); f.s.update({rpm: 0});
    f.advance(5000); f.s.update({rpm: 800}); f.advance(1999); assert.equal(f.count(), 0);
    f.advance(1); assert.equal(f.count(), 1);
});
test('short out-of-order ignition-off packet does not rearm a played session', () => {
    const f = fixture(); f.off(); f.start(); f.advance(2000);
    f.s.update({condition: 7, rpm: 0}); f.advance(200); f.s.update({condition: 10, rpm: 850}); f.advance(10000);
    assert.equal(f.count(), 1);
});
test('stationary ignition-on state does not repeatedly cancel manual speaker tests', () => {
    let cancellations = 0, t = 0;
    const s = new Session({now: () => t, options: () => ({enabled: false}), play: () => {}, cancel: () => cancellations++});
    s.update({condition: 7, rpm: 0, speed: 0});
    t = 2000; s.tick(); t = 4000; s.tick();
    assert.equal(cancellations, 0);
    s.update({condition: 3}); assert.equal(cancellations, 1);
});
