'use strict';
// Local, authenticated PCM player. No caller-selected paths, devices or commands.
const fs = require('fs');
const crypto = require('crypto');
const cp = require('child_process');
const path = require('path');
const wav = require('./wav');
const ROOT = '/var/opt/public/oap';
class AudioBridge {
    constructor() { this.token = ''; this.uid = null; this.child = null; this.busy = false; }
    identity() {
        const state = JSON.parse(fs.readFileSync('/var/opt/mgu-deploy/state.json', 'utf8'));
        const uid = state.apps && state.apps.vgp_startup_sound && state.apps.vgp_startup_sound.uid;
        if (!Number.isInteger(uid) || uid < 12000 || uid > 65535) throw Error('Startup Sound is not installed');
        const dir = ROOT + '/oap_' + uid + '/data';
        const st = fs.lstatSync(dir);
        if (!st.isDirectory() || st.isSymbolicLink() || st.gid !== uid || fs.realpathSync(dir) !== dir) throw Error('Invalid app data directory');
        if (this.uid !== uid || !this.token) {
            this.token = crypto.randomBytes(32).toString('hex'); this.uid = uid;
        }
        const file = path.join(dir, 'audio-bridge-token');
        let valid = false;
        try { const s = fs.lstatSync(file); valid = s.isFile() && !s.isSymbolicLink() && s.uid === 0 && s.gid === uid && (s.mode & 511) === 416 && fs.readFileSync(file, 'utf8') === this.token; } catch (e) {}
        if (!valid) {
            const temp = file + '.' + crypto.randomBytes(8).toString('hex');
            fs.writeFileSync(temp, this.token, {flag: 'wx', mode: 0o600});
            fs.chownSync(temp, 0, uid); fs.chmodSync(temp, 0o640); fs.renameSync(temp, file);
        }
    }
    stop() { if (this.child) this.child.kill('SIGKILL'); }
    async handle(req, res) {
        const reply = (code, data) => { if (!res.destroyed && !res.headersSent) { res.writeHead(code, {'Content-Type': 'application/json'}); res.end(JSON.stringify(data)); } };
        if (req.url !== '/audio/play' || req.method !== 'POST') return false;
        let file = null, child = null, timer = null, owned = false;
        try {
            this.identity();
            const token = Buffer.from(String(req.headers['x-audio-token'] || ''));
            const wanted = Buffer.from(this.token);
            if (token.length !== wanted.length || !crypto.timingSafeEqual(token, wanted)) { reply(403, {error: 'Audio pairing refused'}); return true; }
            if (this.busy) { reply(409, {error: 'Audio player busy'}); return true; }
            this.busy = true; owned = true;
            req.setTimeout(5000, () => req.destroy());
            const chunks = []; let size = 0;
            const data = await new Promise((resolve, reject) => {
                req.on('data', b => { size += b.length; if (size > 3000000) { reject(Error('Clip too large')); req.destroy(); } else chunks.push(b); });
                req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject); req.on('aborted', () => reject(Error('Upload cancelled')));
            });
            const clip = wav.inspect(data);
            if (res.destroyed) throw Error('Playback cancelled');
            file = '/run/vgp-startup-audio-' + crypto.randomBytes(16).toString('hex') + '.wav';
            fs.writeFileSync(file, wav.encode(clip.data), {flag: 'wx', mode: 0o600});
            let stderr = '';
            await new Promise((resolve, reject) => {
                child = this.child = cp.spawn('/var/opt/mgu-python/current/bin/python3', [path.join(__dirname, 'player.py'), file, 'smartx:CarLifeMedia_CF_48_STEREO'], {stdio: ['ignore', 'ignore', 'pipe']});
                timer = setTimeout(() => child.kill('SIGKILL'), Math.ceil((clip.seconds + 5) * 1000));
                res.once('close', () => { if (child) child.kill('SIGKILL'); });
                child.stderr.on('data', b => { stderr = (stderr + b).slice(-1000); });
                child.once('error', reject); child.once('close', code => code === 0 ? resolve() : reject(Error(stderr || 'Audio player stopped')));
            });
            reply(200, {ok: true});
        } catch (e) { reply(400, {error: e.message}); }
        finally {
            if (file) { try { fs.unlinkSync(file); } catch (e) {} }
            if (timer) clearTimeout(timer);
            // A rejected concurrent request must not clear the active player's lock.
            if (owned) { if (this.child === child) this.child = null; this.busy = false; }
        }
        return true;
    }
}
module.exports = {AudioBridge};
