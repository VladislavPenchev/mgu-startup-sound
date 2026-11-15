'use strict';
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const wav = require('./wav');
const AM = 'org.genivi.am.commandinterface.CommandControl';
const ROUTING = 'org.genivi.am.routinginterface.RoutingControlObserver';
const listOf = (r) => Array.isArray(r) ? r : (r && Object.keys(r).map((k) => r[k]).find(Array.isArray)) || [];
const ok = (r) => r && (r.amError === 'E_OK' || r.amError === 0);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
class Audio {
    constructor(ctx, deps) {
        this.ctx = ctx; this.config = ctx.spec.config || {};
        this.spawn = deps && deps.spawn || cp.spawn;
        this.prepare = deps && deps.prepare || wav.prepare;
        this.platform = deps && deps.platform || process.platform;
        this.busy = false; this.child = null; this.token = 0;
        this.status = 'Speaker test required';
    }
    stop() {
        if (!this.busy) return;
        this.token++;
        if (this.child) {
            const child = this.child;
            child.kill('SIGTERM');
            const t = setTimeout(() => { if (this.child === child) child.kill('SIGKILL'); }, 500);
            if (t.unref) t.unref();
        }
    }
    async proxy(iface) {
        const p = await this.ctx.signals.proxy(iface, '1');
        await new Promise((resolve) => {
            const timer = setTimeout(resolve, 4000);
            this.ctx.signals.onAvailable(p, (a) => { if (a) { clearTimeout(timer); resolve(); } });
        });
        return p;
    }
    async play(sound, gain) {
        if (this.busy) return false;
        this.busy = true;
        const token = ++this.token, c = this.config;
        let command = null, routing = null, id = null, changed = false, connectedAttempt = false;
        let mediaTimer = null, mediaWatch = false, mediaPending = false, mediaInterrupted = false;
        const sourceID = c.sourceId, sinkID = c.sinkId;
        const call = (p, name, args) => this.ctx.signals.call(p, name, args, 3500);
        const foreignMedia = list => list.some(x => x.sourceID !== sourceID && x.sinkID === sinkID && x.connectionState !== 'CS_DISCONNECTED' && x.connectionState !== 4);
        const ensure = () => { if (token !== this.token) throw Error('Playback cancelled'); };
        try {
            this.status = 'Preparing audio';
            if (this.platform !== 'linux') throw Error('Car audio is available only on the head unit');
            const clip = this.prepare(this.ctx.dataDir, sound, gain);
            if (!fs.existsSync(c.python)) throw Error('Install/update the MGU Python tool first');
            command = await this.proxy(AM); ensure();
            routing = await this.proxy(ROUTING); ensure();
            const connections = listOf(await call(command, 'getListMainConnections', {})); ensure();
            if (connections.some((x) => x.sourceID === sourceID)) throw Error('Audio source busy (CarLife / another app); no route changed');
            if (foreignMedia(connections)) throw Error('Skipped: music is already using the speakers');
            const sources = listOf(await call(command, 'getListMainSources', {})); ensure();
            const source = sources.find((x) => x.sourceID === sourceID);
            if (!source || !/CarLifeMedia/i.test(String(source.name || source.sourceName || ''))) throw Error('Expected CarLifeMedia audio source is missing; validate audio configuration');
            const available = source.availability && source.availability.availability;
            const wasUnavailable = available === 'A_UNAVAILABLE' || available === 2;
            if (!wasUnavailable) throw Error('Audio source already available; no route changed');
            const a = await call(routing, 'hookSourceAvailablityStatusChange', {sourceID, availability: {availability: 'A_AVAILABLE', availabilityReason: 0}});
            // Some routing observers return void. A successful RPC still owns the availability change.
            if (a && a.amError !== undefined && !ok(a)) throw Error('Audio availability request refused');
            changed = true; ensure();
            connectedAttempt = true;
            const r = await call(command, 'connect', {sourceID, sinkID});
            if (!ok(r) || r.mainConnectionID === undefined) {
                if (r && r.amError !== undefined && r.amError !== 'E_ALREADY_EXISTS') connectedAttempt = false;
                throw Error('Audio connection refused');
            }
            id = r.mainConnectionID; ensure();
            let ready = false;
            for (let n = 0; n < 15; n++) {
                ensure();
                const list = listOf(await call(command, 'getListMainConnections', {}));
                const connection = list.find((x) => x.mainConnectionID === id);
                if (connection && (connection.connectionState === 'CS_CONNECTED' || connection.connectionState === 2)) { ready = true; break; }
                await sleep(100);
            }
            if (!ready) throw Error('Audio route did not become ready');
            const beforePlay = listOf(await call(command, 'getListMainConnections', {}));
            if (foreignMedia(beforePlay)) throw Error('Skipped: music started while preparing audio');
            mediaWatch = true;
            mediaTimer = setInterval(async () => {
                if (!mediaWatch || mediaPending) return;
                mediaPending = true;
                try {
                    const current = listOf(await call(command, 'getListMainConnections', {}));
                    if (mediaWatch && foreignMedia(current)) { mediaInterrupted = true; this.stop(); }
                } catch (e) { if (mediaWatch) this.stop(); }
                finally { mediaPending = false; }
            }, 250);
            ensure(); this.status = 'Playing';
            await this.runPlayer(clip.file, clip.seconds, token);
            this.status = 'Played successfully';
            return true;
        } catch (e) {
            this.status = mediaInterrupted ? 'Stopped: music started' : e.message || String(e);
            this.ctx.log.warn('audio: ' + this.status);
            return false;
        } finally {
            mediaWatch = false; clearInterval(mediaTimer);
            // Disconnect only the connection returned to this invocation. Never sweep other apps' routes.
            let released = !connectedAttempt;
            if (id !== null) {
                try {
                    const r = await call(command, 'disconnect', {mainConnectionID: id});
                    released = false;
                    if (ok(r) || r && (r.amError === 'E_NON_EXISTENT' || r.amError === 8)) {
                        for (let n = 0; n < 15; n++) {
                            const current = listOf(await call(command, 'getListMainConnections', {}));
                            if (!current.some(x => x.mainConnectionID === id)) { released = true; break; }
                            await sleep(100);
                        }
                    }
                }
                catch (e) { this.ctx.log.warn('audio disconnect: ' + e); }
            }
            if (changed && released) {
                try {
                    const left = listOf(await call(command, 'getListMainConnections', {}));
                    if (!left.some((x) => x.sourceID === sourceID)) await call(routing, 'hookSourceAvailablityStatusChange', {sourceID, availability: {availability: 'A_UNAVAILABLE', availabilityReason: 0}});
                } catch (e) { this.ctx.log.warn('audio restore: ' + e); }
            } else if (changed) this.ctx.log.warn('audio route ownership uncertain: left availability unchanged; inspect AudioManager before another test');
            for (const p of [command, routing]) { try { if (p && p.shutdown) await p.shutdown(); } catch (e) { /* shutdown */ } }
            this.busy = false; this.child = null;
        }
    }
    runPlayer(file, seconds, token) {
        if (this.config.audioBridge) return this.runBridge(file, seconds, token);
        return new Promise((resolve, reject) => {
            let stderr = '', settled = false;
            const child = this.spawn(this.config.python, [path.join(__dirname, 'player.py'), file, this.config.alsaDevice], {stdio: ['ignore', 'ignore', 'pipe']});
            this.child = child;
            const timeout = setTimeout(() => child.kill('SIGKILL'), Math.ceil((seconds + 5) * 1000));
            const finish = (error) => { if (settled) return; settled = true; clearTimeout(timeout); this.child = null; if (error) reject(error); else resolve(); };
            if (child.stderr) child.stderr.on('data', (b) => { stderr = (stderr + b.toString()).slice(-1200); });
            child.on('error', finish);
            child.on('close', (code) => finish(code === 0 && token === this.token ? null : Error(stderr || 'Playback stopped or timed out')));
        });
    }
    runBridge(file, seconds, token) {
        return new Promise((resolve, reject) => {
            const http = require('http');
            const data = fs.readFileSync(file);
            const secret = fs.readFileSync(path.join(this.ctx.dataDir, 'audio-bridge-token'), 'utf8');
            let settled = false;
            const finish = error => { if (settled) return; settled = true; this.child = null; if (error) reject(error); else resolve(); };
            const req = http.request({hostname: '127.0.0.1', port: 18987, path: '/audio/play', method: 'POST', headers: {'X-Audio-Token': secret, 'Content-Length': data.length, 'Content-Type': 'audio/wav'}}, res => {
                let body = ''; res.on('data', b => { body += b; if (body.length > 4096) req.destroy(Error('Invalid audio helper response')); });
                res.on('end', () => {
                    try { const result = JSON.parse(body); finish(res.statusCode === 200 && result.ok && token === this.token ? null : Error(result.error || 'Playback cancelled')); }
                    catch (e) { finish(e); }
                });
                res.on('error', finish);
            });
            this.child = {kill: () => req.destroy(Error('Playback cancelled'))};
            req.setTimeout(Math.ceil((seconds + 7) * 1000), () => req.destroy(Error('Audio helper timeout')));
            req.on('error', finish); req.end(data);
        });
    }
}
module.exports = {Audio, listOf};
