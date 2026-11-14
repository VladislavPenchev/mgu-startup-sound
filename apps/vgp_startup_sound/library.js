'use strict';
const fs = require('fs');
const path = require('path');
const wav = require('./wav');
const USB_ROOTS = ['/media', '/run/media', '/mnt/usb', '/mnt/media_rw'];
const EXT = /\.(mp3|wav|m4a|aac|ogg|flac|mp4)$/i;
const MAX_SOURCE = 20 * 1024 * 1024;
class Library {
    constructor(dir) { this.dir = dir; this.file = path.join(dir, 'custom.wav'); this.meta = path.join(dir, 'custom.json'); this.usb = []; }
    info() {
        try {
            if (fs.statSync(this.file).size > 3000000) return null;
            const parsed = wav.inspect(fs.readFileSync(this.file));
            let meta = {}; try { meta = JSON.parse(fs.readFileSync(this.meta, 'utf8')); } catch (e) { /* externally uploaded */ }
            return {name: typeof meta.name === 'string' ? meta.name.slice(0, 120) : 'Custom sound', seconds: parsed.seconds, source: meta.source || 'file'};
        } catch (e) { return null; }
    }
    save(bytes, meta) {
        wav.inspect(bytes);
        const temp = this.file + '.new';
        fs.writeFileSync(temp, bytes, {mode: 0o600}); fs.renameSync(temp, this.file);
        const info = {name: String(meta.name || 'Custom sound').slice(0, 120), source: meta.source === 'youtube' ? 'youtube' : meta.source === 'usb' ? 'usb' : 'file'};
        fs.writeFileSync(this.meta, JSON.stringify(info), {mode: 0o600});
        return this.info();
    }
    remove() { for (const f of [this.file, this.meta]) { try { fs.unlinkSync(f); } catch (e) { if (e.code !== 'ENOENT') throw e; } } }
    scan(roots) {
        const found = [], seen = {};
        for (const root of roots || USB_ROOTS) {
            let base; try { base = fs.realpathSync(root); } catch (e) { continue; }
            const walk = (dir, depth) => {
                if (depth > 4 || found.length >= 100) return;
                let entries; try { entries = fs.readdirSync(dir).slice(0, 300); } catch (e) { return; }
                for (const name of entries) {
                    if (found.length >= 100 || name[0] === '.') continue;
                    const file = path.join(dir, name);
                    try {
                        const stat = fs.lstatSync(file);
                        if (stat.isSymbolicLink()) continue;
                        if (stat.isDirectory()) walk(file, depth + 1);
                        else if (stat.isFile() && EXT.test(name) && stat.size > 0 && stat.size <= MAX_SOURCE) {
                            const real = fs.realpathSync(file);
                            if (!real.startsWith(base + path.sep) || seen[real]) continue;
                            seen[real] = true; found.push({path: real, base, name, bytes: stat.size});
                        }
                    } catch (e) { /* unreadable mount */ }
                }
            };
            walk(base, 0);
        }
        this.usb = found;
        return found.map((x, i) => ({id: String(i), name: x.name, bytes: x.bytes}));
    }
    source(id) {
        if (!/^\d{1,3}$/.test(String(id))) throw Error('Invalid USB selection');
        const x = this.usb[Number(id)]; if (!x) throw Error('Scan USB first');
        // Recheck at use time, not just during the scan (USB may have changed).
        const real = fs.realpathSync(x.path), stat = fs.statSync(real);
        if (real !== x.path || !real.startsWith(x.base + path.sep) || !stat.isFile() || stat.size > MAX_SOURCE) throw Error('USB file changed');
        return real;
    }
}
module.exports = {Library, MAX_SOURCE};
