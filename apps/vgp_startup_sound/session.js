'use strict';
// No synthetic/demo signals. An actual ignition-off state must be seen before arming.
// RPM=0 by itself (traffic-light stop/start) never arms another sound.
class Session {
    constructor(opts) {
        this.now = opts.now;
        this.play = opts.play;
        this.cancel = opts.cancel || (() => {});
        this.save = opts.save || (() => {});
        this.options = opts.options;
        this.condition = null;
        this.rpm = null;
        this.speed = null;
        this.offSince = null;
        this.runningSince = null;
        this.armed = false;
        this.blocked = true;
        this.status = 'Waiting for ignition-off state';
    }
    update(values) {
        Object.keys(values).forEach((k) => { this[k] = values[k]; });
        this.tick();
    }
    tick() {
        const t = this.now(), opts = this.options();
        const off = [1, 2, 3, 5, 7].indexOf(this.condition) >= 0 && this.rpm !== null && this.rpm < 400;
        if (off) {
            // Ignition-on/engine-off is also where the owner tests the speakers.
            // Cancel a pending/running automatic greeting once, not every manual test.
            if (this.condition <= 3 || this.runningSince !== null) this.cancel();
            this.runningSince = null;
            if (this.offSince === null) this.offSince = t;
            if (t - this.offSince >= 1500 && !this.armed) {
                this.armed = true; this.blocked = false;
                this.save({blocked: false});
                this.status = 'Ready for next engine start';
            }
            return;
        }
        this.offSince = null;
        if (this.condition === null || this.rpm === null || this.speed === null) {
            this.cancel(); this.runningSince = null;
            this.status = 'Waiting for live vehicle signals'; return;
        }
        if (!opts.enabled) {
            this.runningSince = null; this.status = 'Automatic sound is off';
            if (this.rpm !== null && this.rpm >= 400 && (this.condition === 8 || this.condition === 10)) {
                this.armed = false; this.blocked = true;
            }
            return;
        }
        if (this.condition === 12 || (this.condition !== null && this.condition <= 3)) {
            this.cancel(); this.runningSince = null; return;
        }
        if (this.speed !== null && this.speed >= 3) {
            // Never play a delayed startup sound once the car is moving.
            if (this.armed) { this.armed = false; this.blocked = true; this.save({blocked: true}); }
            this.cancel(); this.runningSince = null;
            this.status = 'Skipped: car moving'; return;
        }
        const running = this.rpm !== null && this.rpm >= 400 && (this.condition === 8 || this.condition === 10);
        if (!running) { this.runningSince = null; return; }
        if (!this.armed || this.blocked) return;
        if (this.speed === null) { this.status = 'Waiting for vehicle speed'; return; }
        if (this.runningSince === null) this.runningSince = t;
        this.status = 'Engine running: waiting for sound';
        if (t - this.runningSince < opts.delayMs) return;
        // Consume before invoking audio: failure, reentrant samples, and process restarts must not loop audio.
        this.armed = false; this.blocked = true;
        this.save({blocked: true});
        this.status = 'Startup sound requested';
        this.play();
    }
}
const CONDITIONS = {PARKEN_BN_NIO: 1, PARKEN_BN_IO: 2, STANDFUNKTIONEN_KUNDE_NICHT_IM_FZG: 3,
    WOHNEN: 5, PRUEFEN_ANALYSE_DIAGNOSE: 7, FAHRBEREITSCHAFT_HERSTELLEN: 8, FAHREN: 10, FAHRBEREITSCHAFT_BEENDEN: 12};
function conditionOf(raw) {
    const n = typeof raw === 'number' ? raw : CONDITIONS[raw];
    return [1, 2, 3, 5, 7, 8, 10, 12].indexOf(n) >= 0 ? n : null;
}
function rpmOf(v) { const x = v && v.actualValueRPMEngineCrankshaft; return typeof x === 'number' && x >= 0 && x < 65535 ? x * 0.25 : null; }
function speedOf(v) { const x = v && v.speedVehicleCentreOfGravity; return typeof x === 'number' && x >= 0 && x < 65535 ? x * 0.015625 : null; }
module.exports = {Session, conditionOf, rpmOf, speedOf};
