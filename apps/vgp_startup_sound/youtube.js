'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const URL = require('url').URL;
const MAX = 20 * 1024 * 1024;
function youtubeId(input) {
    let u; try { u = new URL(String(input)); } catch (e) { return null; }
    if (u.protocol !== 'https:' || u.username || u.password || u.port || u.searchParams.has('list')) return null;
    const host = u.hostname.toLowerCase(), parts = u.pathname.split('/').filter(Boolean);
    let id;
    if (host === 'youtu.be' || host === 'www.youtu.be') id = parts[0];
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].indexOf(host) >= 0) {
        if (parts[0] === 'watch') id = u.searchParams.get('v');
        else if (['shorts', 'embed', 'live'].indexOf(parts[0]) >= 0) id = parts[1];
    }
    return typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}
class Youtube {
    constructor(ctx, deps) {
        this.ctx = ctx; this.spawn = deps && deps.spawn || cp.spawn;
        this.dir = path.join(ctx.dataDir, 'youtube-cache');
        if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, {mode: 0o700});
        this.child = null; this.job = {state: 'idle'};
        // Only this class's known temporary names; never remove a user's custom.wav.
        this.clean();
    }
    clean() { for (const name of ['source.m4a', 'source.m4a.part', 'source.m4a.ytdl']) { try { fs.unlinkSync(path.join(this.dir, name)); } catch (e) { /* absent */ } } }
    status() { return Object.assign({}, this.job); }
    start(url) {
        const id = youtubeId(url); if (!id) throw Error('Use a single https YouTube video link, without a playlist');
        if (this.child) throw Error('A download is already running');
        const c = this.ctx.spec.config;
        if (!fs.existsSync(c.python) || !fs.existsSync(c.node22)) throw Error('Install MGU Python and Node.js 22 from JustAnotherPU/mgu-apps');
        this.clean(); this.job = {state: 'downloading', id};
        const file = path.join(this.dir, 'source.m4a');
        const args = [path.join(__dirname, 'youtube_fetch.py'), path.join(__dirname, 'ytdlp.pyz'), path.join(this.ctx.dataDir, 'uplink.json'), '--ignore-config', '--no-cache-dir', '--no-playlist', '--no-progress', '--no-part', '--force-ipv4',
            '--socket-timeout', '15', '--retries', '1', '--fragment-retries', '1', '--max-filesize', '20M', '--match-filter', '!is_live & duration <= 600',
            '--js-runtimes', 'node:' + c.node22, '--format', 'bestaudio[ext=m4a]', '--output', file, 'https://www.youtube.com/watch?v=' + id];
        const env = Object.assign({}, process.env, {SSL_CERT_FILE: '/var/opt/mgu-python/current/ssl/cacert.pem'});
        const child = this.spawn(c.python, args, {env, stdio: ['ignore', 'ignore', 'pipe']});
        this.child = child; let errors = '', done = false;
        const fail = (why) => {
            this.job = {state: 'error', error: why}; child.kill('SIGTERM');
            const kill = setTimeout(() => { if (this.child === child) child.kill('SIGKILL'); }, 1000);
            if (kill.unref) kill.unref();
        };
        const timeout = setTimeout(() => fail('Download timed out; previous sound was kept'), 120000);
        const quota = setInterval(() => { try { if (fs.statSync(file).size > MAX) fail('Audio exceeds 20 MB'); } catch (e) { /* not created */ } }, 200);
        const finish = (code, error) => {
            if (done) return; done = true; clearInterval(quota); clearTimeout(timeout); this.child = null;
            if (this.job.state !== 'error' && code === 0 && fs.existsSync(file) && fs.statSync(file).size > 0 && fs.statSync(file).size <= MAX) this.job = {state: 'ready', id};
            else {
                if (this.job.state !== 'error') this.job = {state: 'error', error: error || 'YouTube download failed. Check car internet / update yt-dlp. Previous sound was kept.'};
                this.ctx.log.warn('YouTube import failed: ' + errors.slice(-500)); this.clean();
            }
        };
        child.stderr.on('data', (b) => { errors = (errors + b.toString()).slice(-1500); });
        child.on('error', (e) => finish(1, e.message)); child.on('close', (code) => finish(code));
        return this.status();
    }
    file() { if (this.job.state !== 'ready') throw Error('Audio is not ready'); return path.join(this.dir, 'source.m4a'); }
    cancel() {
        if (this.child) {
            this.job = {state: 'error', error: 'Cancelled'}; const child = this.child; child.kill('SIGTERM');
            const t = setTimeout(() => { if (this.child === child) child.kill('SIGKILL'); }, 1000); if (t.unref) t.unref();
        } else { this.clean(); this.job = {state: 'idle'}; }
    }
}
module.exports = {Youtube, youtubeId};
