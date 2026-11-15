'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const os = require('os');
const URL = require('url').URL;
const {tone} = require('./wav');
const {Library} = require('./library');
const {Youtube} = require('./youtube');
const PORT = 18887, TTL = 30 * 60 * 1000;
function privateIp(s) {
    s = String(s || '').replace(/^::ffff:/, '');
    if (s === '::1') return true;
    const p = s.split('.').map(Number);
    return p.length === 4 && p.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) &&
        (p[0] === 127 || p[0] === 10 || p[0] === 192 && p[1] === 168 || p[0] === 172 && p[1] >= 16 && p[1] <= 31 || p[0] === 169 && p[1] === 254);
}
function address() {
    const ips = [];
    const interfaces = os.networkInterfaces();
    const uplink = (interfaces.wlan0 || []).find(x => !x.internal && x.family === 'IPv4' && privateIp(x.address));
    if (uplink) return uplink.address;
    Object.keys(os.networkInterfaces()).forEach((name) => (os.networkInterfaces()[name] || []).forEach((x) => { if (!x.internal && x.family === 'IPv4' && privateIp(x.address)) ips.push(x.address); }));
    return ips.find((x) => x.indexOf('172.16.222.') === 0) || ips[0] || null;
}
function body(req, limit) {
    return new Promise((resolve, reject) => {
        const chunks = []; let n = 0;
        req.on('data', (b) => { n += b.length; if (n > limit) { reject(Error('Request too large')); req.destroy(); } else chunks.push(b); });
        req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject); req.on('aborted', () => reject(Error('Upload interrupted')));
    });
}
class Companion {
    constructor(ctx, actions, deps) {
        this.ctx = ctx; this.actions = actions;
        this.library = deps && deps.library || new Library(ctx.dataDir);
        this.youtube = deps && deps.youtube || new Youtube(ctx);
        this.port = deps && deps.port !== undefined ? deps.port : PORT;
        this.host = deps && deps.host || '0.0.0.0';
        this.server = null; this.token = ''; this.expires = 0; this.error = ''; this.sockets = new Set();
        this.pairingFile = path.join(ctx.dataDir, 'phone-pairing.json');
        try { fs.unlinkSync(this.pairingFile); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
    active() { return !!this.server && Date.now() < this.expires; }
    link() { const ip = address(); return this.active() && ip ? 'http://' + ip + ':' + this.port + '/#' + this.token : null; }
    async start() {
        if (!this.actions.allowed()) throw Error('Phone setup requires a stationary, awake car with live signals');
        if (this.server) await this.stop();
        this.token = crypto.randomBytes(16).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        this.expires = Date.now() + TTL;
        const server = this.server = http.createServer((req, res) => this.handle(req, res).catch((e) => { if (!res.headersSent && !res.destroyed) this.reply(res, 400, {error: e.message}); else res.destroy(); }));
        server.on('connection', (socket) => { this.sockets.add(socket); socket.on('close', () => this.sockets.delete(socket)); });
        server.setTimeout(30000);
        try {
            await new Promise((resolve, reject) => { server.once('error', reject); server.listen(this.port, this.host, resolve); });
            this.port = server.address().port; this.error = '';
            fs.writeFileSync(this.pairingFile, JSON.stringify({port: this.port, token: this.token, expires: this.expires}), {mode: 0o600});
            this.timer = setTimeout(() => this.stop(), TTL); if (this.timer.unref) this.timer.unref();
            return this.link();
        } catch (e) { this.server = null; this.token = ''; this.error = e.message; throw e; }
    }
    async stop() {
        try { fs.unlinkSync(this.pairingFile); } catch (e) { if (e.code !== 'ENOENT') throw e; }
        clearTimeout(this.timer); this.token = ''; this.expires = 0; this.youtube.cancel();
        const server = this.server; this.server = null;
        if (server) { this.sockets.forEach((x) => x.destroy()); await new Promise((r) => server.close(r)); }
    }
    reply(res, code, data, type) {
        res.writeHead(code, {'Content-Type': type || 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
            'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; media-src 'self' blob:; img-src 'self'; frame-ancestors 'none'"});
        res.end(Buffer.isBuffer(data) || typeof data === 'string' ? data : JSON.stringify(data));
    }
    file(res, file, mime) {
        const stat = fs.statSync(file);
        if (!stat.isFile() || stat.size > 20 * 1024 * 1024) throw Error('Source file is too large');
        res.writeHead(200, {'Content-Type': mime, 'Content-Length': stat.size, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff'});
        const stream = fs.createReadStream(file); stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res);
    }
    async handle(req, res) {
        if (!privateIp(req.socket.remoteAddress)) return this.reply(res, 403, {error: 'Same private Wi-Fi network required'});
        const u = new URL(req.url, 'http://localhost');
        if (u.pathname === '/.startup-sound-health' && req.method === 'GET' && /^127\.|^::1$/.test(String(req.socket.remoteAddress).replace(/^::ffff:/, ''))) {
            res.setHeader('X-Startup-Sound', '1'); return this.reply(res, 200, {ok: this.active()});
        }
        const local = String(req.socket.localAddress).replace(/^::ffff:/, '');
        const expected = local + ':' + this.port;
        if (req.headers.host !== expected) return this.reply(res, 403, {error: 'Unexpected host'});
        if (req.headers.origin && req.headers.origin !== 'http://' + expected) return this.reply(res, 403, {error: 'Unexpected origin'});
        if (!this.active()) return this.reply(res, 403, {error: 'Pairing expired; reopen Phone / USB on the car'});
        if (req.method === 'GET' && u.pathname === '/') return this.reply(res, 200, fs.readFileSync(path.join(__dirname, 'phone.html')), 'text/html; charset=utf-8');
        const received = Buffer.from(String(req.headers['x-mgu-token'] || ''));
        const token = Buffer.from(this.token);
        if (received.length !== token.length || !crypto.timingSafeEqual(received, token)) return this.reply(res, 403, {error: 'Invalid pairing; scan the QR code again'});
        if (!this.actions.allowed()) return this.reply(res, 409, {error: 'Car must be stationary and awake'});
        const json = async () => JSON.parse((await body(req, 8192)).toString('utf8'));
        if (req.method === 'GET' && u.pathname === '/status') return this.reply(res, 200, {selected: this.ctx.settings.get('sound'), custom: this.library.info(), youtube: this.youtube.status(), expires: this.expires, busy: this.actions.busy()});
        if (req.method === 'GET' && u.pathname === '/sound') {
            const sound = u.searchParams.get('id');
            if (sound === 'chime' || sound === 'soft') return this.reply(res, 200, tone(sound === 'soft'), 'audio/wav');
            if (sound === 'custom' && this.library.info()) return this.file(res, this.library.file, 'audio/wav');
            throw Error('Sound is missing');
        }
        if (req.method === 'POST' && u.pathname === '/select') {
            const value = (await json()).sound;
            if (['chime', 'soft', 'custom'].indexOf(value) < 0 || value === 'custom' && !this.library.info()) throw Error('Choose an available sound');
            this.ctx.settings.set('sound', value); return this.reply(res, 200, {ok: true});
        }
        if (req.method === 'POST' && u.pathname === '/upload') {
            if (this.actions.busy()) return this.reply(res, 409, {error: 'Stop playback before replacing the sound'});
            const bytes = await body(req, 3000000);
            if (!this.actions.allowed() || this.actions.busy()) throw Error('Car state changed; previous sound kept');
            let name; try { name = decodeURIComponent(req.headers['x-filename'] || 'Custom sound'); } catch (e) { throw Error('Invalid name'); }
            const info = this.library.save(bytes, {name, source: req.headers['x-source']});
            this.ctx.settings.set('sound', 'custom'); this.youtube.cancel();
            return this.reply(res, 201, info);
        }
        if (req.method === 'POST' && u.pathname === '/delete') {
            if (this.actions.busy()) return this.reply(res, 409, {error: 'Stop playback first'});
            this.library.remove(); if (this.ctx.settings.get('sound') === 'custom') this.ctx.settings.set('sound', 'chime');
            return this.reply(res, 200, {ok: true});
        }
        if (req.method === 'POST' && u.pathname === '/test') { await this.actions.test(); return this.reply(res, 200, {ok: true}); }
        if (req.method === 'POST' && u.pathname === '/stop') { this.actions.stop(); this.youtube.cancel(); return this.reply(res, 200, {ok: true}); }
        if (req.method === 'POST' && u.pathname === '/youtube') return this.reply(res, 202, this.youtube.start((await json()).url));
        if (req.method === 'GET' && u.pathname === '/youtube/audio') return this.file(res, this.youtube.file(), 'audio/mp4');
        if (req.method === 'GET' && u.pathname === '/usb') return this.reply(res, 200, this.library.scan());
        if (req.method === 'GET' && u.pathname === '/usb/audio') return this.file(res, this.library.source(u.searchParams.get('id')), 'application/octet-stream');
        return this.reply(res, 404, {error: 'Not found'});
    }
}
module.exports = {Companion, privateIp, address, PORT};
