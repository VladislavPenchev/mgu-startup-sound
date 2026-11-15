'use strict';
const fs = require('fs');
const path = require('path');
const mgu = require('./kit/mgu');
const {Session, conditionOf, rpmOf, speedOf} = require('./session');
const {Audio} = require('./audio');
const {Companion} = require('./companion');
const QR = require('./kit/qr');
const http = require('http');
const mono = () => { const t = process.hrtime(); return t[0] * 1000 + t[1] / 1000000; };

mgu.run({
    async background(bg) {
        bg.log.info('Startup Sound data directory: ' + bg.dataDir);
        const audio = new Audio(bg);
        let phone = null;
        const allowed = () => session.speed !== null && session.speed < 3 && session.condition !== null && session.condition > 3 && session.condition !== 12;
        const options = () => ({enabled: bg.settings.get('enabled') === true && !(phone && phone.active()), delayMs: Number(bg.settings.get('delay') || 2) * 1000});
        const play = () => audio.play(bg.settings.get('sound'), bg.settings.get('gain'));
        const session = new Session({now: mono, options, play, cancel: () => audio.stop(), save: (value) => {
            // Diagnostic only: every process starts disarmed and must observe a fresh off state.
            try { fs.writeFileSync(path.join(bg.dataDir, 'session.json'), JSON.stringify(value)); }
            catch (e) { bg.log.warn('session log: ' + e); }
        }});
        const test = async () => {
            if (!allowed()) { audio.status = 'Test requires a stationary, awake car with live speed data'; return; }
            await play();
        };
        phone = new Companion(bg, {allowed, busy: () => audio.busy, test, stop: () => audio.stop()});
        let networkReady = false, networkPending = false, networkError = '';
        const probe = () => {
            if (!phone.active() || networkPending) return;
            networkPending = true;
            const req = http.get({hostname: '127.0.0.1', port: 18987, path: '/status'}, (res) => {
                let data = ''; res.on('data', (b) => { data += b; if (data.length > 4096) req.destroy(); });
                res.on('end', () => { try { const s = JSON.parse(data); networkReady = s.ready === true && s.port === 18887; networkError = s.error || ''; } catch (e) { networkReady = false; networkError = 'Invalid network helper reply'; } networkPending = false; });
            });
            req.setTimeout(1500, () => req.destroy(Error('Phone network helper unavailable')));
            req.on('error', (e) => { networkReady = false; networkPending = false; networkError = e.message; });
        };
        const networkTimer = setInterval(probe, 2500);
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
            if (phone.active() && !allowed()) { networkReady = false; phone.stop().catch((e) => bg.log.warn('phone close: ' + e)); }
            const status = session.status + ' | ' + audio.status;
            if (status !== lastStatus) { lastStatus = status; bg.log.info(status); }
        }, 200);
        bg.settings.onChange((key) => { if (key === 'enabled') { audio.stop(); session.tick(); } });
        bg.app.on('shutdown', () => { clearInterval(tick); clearInterval(networkTimer); audio.stop(); phone.stop(); watches.forEach((w) => { if (w.shutdown) w.shutdown(); }); });
        return {audio, session, phone, test, network: () => ({ready: networkReady, error: networkError}), async togglePhone() {
            if (phone.active()) { await phone.stop(); networkReady = false; return; }
            networkReady = false; await phone.start(); probe();
        }};
    },
    async start(ctx) {
        const state = ctx.background;
        if (!state) { ctx.log.error('Background initialization failed'); return; }
        ctx.ui.onClick('BTN_TEST', () => state.test());
        ctx.ui.onClick('BTN_STOP', () => state.audio.stop());
        ctx.ui.onClick('BTN_PHONE', () => state.togglePhone().catch((e) => { state.audio.status = e.message; }));
        ctx.loop('MAIN', 2, async () => {
            const cv = ctx.canvas(1600, 520), t = ctx.theme();
            cv.fillRect(0, 0, 1600, 520, t.bg);
            cv.text('STARTUP SOUND', 65, 100, 48, t.text, {font: 'bold'});
            cv.text(ctx.settings.get('enabled') ? 'AUTOMATIC: ON' : 'AUTOMATIC: OFF', 65, 158, 25, '#4da3ff');
            if (state.phone.active()) {
                const n = state.network(), link = state.phone.link();
                cv.text('PHONE / USB', 65, 225, 30, t.text);
                cv.text('1. Use your hotspot phone or the same Wi-Fi', 65, 275, 25, t.dim);
                cv.text('2. Scan QR: upload, YouTube or USB', 65, 320, 25, t.dim);
                cv.text('3. Preview a clip and Save', 65, 365, 25, t.dim);
                cv.text('Phone session: 30 minutes. Tap Phone / USB to close.', 65, 440, 21, t.dim);
                if (n.ready && link) QR.draw(cv, link, 1110, 135, 7);
                else {
                    cv.text('Waiting for phone connection...', 950, 245, 23, t.dim);
                    cv.text((n.error || 'Network helper is checking Wi-Fi').slice(0, 45), 950, 290, 20, t.dim);
                }
                await ctx.ui.image('MAIN_GFX', cv); return;
            }
            cv.text(state.session.status, 65, 230, 28, t.text);
            // Limit line length to keep player errors readable on the head unit.
            const message = String(state.audio.status);
            cv.text(message.slice(0, 85), 65, 285, 24, t.dim);
            if (message.length > 85) cv.text(message.slice(85, 170), 65, 320, 24, t.dim);
            const rpm = state.session.rpm, speed = state.session.speed;
            cv.text('RPM: ' + (rpm === null ? '--' : Math.round(rpm)) + '     SPEED: ' + (speed === null ? '--' : speed.toFixed(1)) + ' km/h     STATE: ' + (state.session.condition === null ? '--' : state.session.condition), 65, 380, 24, t.dim);
            cv.text('PHONE / USB: import a file, YouTube link or USB clip', 65, 430, 20, t.dim);
            cv.text('One sound per observed ignition cycle. Stop/Start does not rearm it.', 65, 473, 23, t.dim);
            await ctx.ui.image('MAIN_GFX', cv);
        });
    },
});
