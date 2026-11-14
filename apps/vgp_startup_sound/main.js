'use strict';
const fs = require('fs');
const path = require('path');
const mgu = require('./kit/mgu');
const {Session, conditionOf, rpmOf, speedOf} = require('./session');
const {Audio} = require('./audio');
const mono = () => { const t = process.hrtime(); return t[0] * 1000 + t[1] / 1000000; };

mgu.run({
    async background(bg) {
        bg.log.info('Startup Sound data directory: ' + bg.dataDir);
        const audio = new Audio(bg);
        const options = () => ({enabled: bg.settings.get('enabled') === true, delayMs: Number(bg.settings.get('delay') || 2) * 1000});
        const play = () => audio.play(bg.settings.get('sound'), bg.settings.get('gain'));
        const session = new Session({now: mono, options, play, cancel: () => audio.stop(), save: (value) => {
            // Diagnostic only: every process starts disarmed and must observe a fresh off state.
            try { fs.writeFileSync(path.join(bg.dataDir, 'session.json'), JSON.stringify(value)); }
            catch (e) { bg.log.warn('session log: ' + e); }
        }});
        const watches = [];
        const watch = async (iface, fields) => {
            try { const sub = await bg.signals.watch(iface, '1', fields, bg.log); watches.push(sub); if (sub.error) bg.log.warn(sub.error); }
            catch (e) { bg.log.warn('signal subscription: ' + e); }
        };
        await watch('de.bmw.infotainment.vehicle.CDS', {statusEngineSpeed2: (v) => session.update({rpm: rpmOf(v)})});
        await watch('de.bmw.infotainment.vehicle.Vehicle2', {statusCarSpeed2: (v) => session.update({speed: speedOf(v)})});
        await watch('de.bmw.infrastructure.VehicleCondition', {VehicleCondition: (v) => session.update({condition: conditionOf(v && v.statusConditionVehicle)})});
        let lastStatus = '';
        const tick = setInterval(() => {
            session.tick();
            const status = session.status + ' | ' + audio.status;
            if (status !== lastStatus) { lastStatus = status; bg.log.info(status); }
        }, 200);
        bg.settings.onChange((key) => { if (key === 'enabled') { audio.stop(); session.tick(); } });
        bg.app.on('shutdown', () => { clearInterval(tick); audio.stop(); watches.forEach((w) => { if (w.shutdown) w.shutdown(); }); });
        return {audio, session, async test() {
            if (session.speed === null || session.speed >= 3 || session.condition === null || session.condition <= 3 || session.condition === 12) {
                audio.status = 'Test requires a stationary, awake car with live speed data'; return;
            }
            await play();
        }};
    },
    async start(ctx) {
        const state = ctx.background;
        if (!state) { ctx.log.error('Background initialization failed'); return; }
        ctx.ui.onClick('BTN_TEST', () => state.test());
        ctx.ui.onClick('BTN_STOP', () => state.audio.stop());
        ctx.loop('MAIN', 2, async () => {
            const cv = ctx.canvas(1600, 520), t = ctx.theme();
            cv.fillRect(0, 0, 1600, 520, t.bg);
            cv.text('STARTUP SOUND', 65, 100, 48, t.text, {font: 'bold'});
            cv.text(ctx.settings.get('enabled') ? 'AUTOMATIC: ON' : 'AUTOMATIC: OFF', 65, 158, 25, '#4da3ff');
            cv.text(state.session.status, 65, 230, 28, t.text);
            // Limit line length to keep player errors readable on the head unit.
            const message = String(state.audio.status);
            cv.text(message.slice(0, 85), 65, 285, 24, t.dim);
            if (message.length > 85) cv.text(message.slice(85, 170), 65, 320, 24, t.dim);
            const rpm = state.session.rpm, speed = state.session.speed;
            cv.text('RPM: ' + (rpm === null ? '--' : Math.round(rpm)) + '     SPEED: ' + (speed === null ? '--' : speed.toFixed(1)) + ' km/h     STATE: ' + (state.session.condition === null ? '--' : state.session.condition), 65, 380, 24, t.dim);
            cv.text('Upload custom.wav here: ' + ctx.dataDir, 65, 430, 20, t.dim);
            cv.text('One sound per observed ignition cycle. Stop/Start does not rearm it.', 65, 473, 23, t.dim);
            await ctx.ui.image('MAIN_GFX', cv);
        });
    },
});
