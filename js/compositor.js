// Cartoon Instructeur · Traitement de l'image : étalonnage des couleurs, incrustation fond vert, décor fixe, cadrage
// (scripts classiques chargés dans l'ordre par index.html : ils partagent les mêmes variables globales)

// ══════════════════════════════════════════════════════════════════
// PROCESSEUR VIDÉO (WebGL, repli 2D) : couleurs harmonisées + fond vert retiré
// ══════════════════════════════════════════════════════════════════
const KEY_GREEN = [0, 177 / 255, 64 / 255];   // #00B140
const VP_VERT = 'attribute vec2 p; varying vec2 uv; void main() { uv = vec2((p.x + 1.0) * 0.5, 1.0 - (p.y + 1.0) * 0.5); gl_Position = vec4(p, 0.0, 1.0); }';
const VP_FRAG = [
    'precision mediump float;',
    'varying vec2 uv; uniform sampler2D tex; uniform vec3 gain; uniform vec3 off; uniform float keyOn; uniform vec3 keyCol; uniform float sim; uniform float smoothv; uniform float spill;',
    'vec2 cbcr(vec3 c) { return vec2(-0.1687 * c.r - 0.3313 * c.g + 0.5 * c.b, 0.5 * c.r - 0.4187 * c.g - 0.0813 * c.b); }',
    'void main() {',
    '  vec4 src = texture2D(tex, uv);',
    '  float a = 1.0; vec3 c = src.rgb;',
    '  if (keyOn > 0.5) {',
    '    float d = distance(cbcr(c), cbcr(keyCol));',
    '    a = smoothstep(sim, sim + smoothv, d);',
    '    float s = max(0.0, c.g - max(c.r, c.b));',   // débordement de vert sur les contours
    '    c.g -= s * spill * (1.0 - smoothstep(sim + smoothv * 0.5, sim + smoothv * 1.2, d));',   // seulement près du fond : un accessoire vert garde sa couleur
    '  }',
    '  c = clamp(c * gain + off, 0.0, 1.0);',
    '  gl_FragColor = vec4(c, a);',
    '}'
].join('\n');

function createVideoProcessor() {
    const canvas = document.createElement('canvas');
    let gl = null, prog = null, tex = null, loc = {}, failed = false;
    try {
        gl = canvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true, alpha: true });
        if (gl) {
            const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
            prog = gl.createProgram();
            gl.attachShader(prog, sh(gl.VERTEX_SHADER, VP_VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, VP_FRAG));
            gl.linkProgram(prog);
            if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('programme WebGL');
            gl.useProgram(prog);
            const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
            const p = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(p); gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);
            tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
            [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(k => gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE));
            [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach(k => gl.texParameteri(gl.TEXTURE_2D, k, gl.LINEAR));
            ['tex', 'gain', 'off', 'keyOn', 'keyCol', 'sim', 'smoothv', 'spill'].forEach(n => { loc[n] = gl.getUniformLocation(prog, n); });
        }
    } catch (e) { log('WebGL indisponible : ' + e.message); gl = null; }
    // repli 2D (plus lent : image réduite)
    const c2 = gl ? null : canvas.getContext('2d', { willReadFrequently: true });
    return {
        canvas, webgl: !!gl,
        // libère le contexte WebGL (l'iPhone en limite le nombre)
        dispose() { try { if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch (e) {} gl = null; failed = true; canvas.width = canvas.height = 1; },
        // src : vidéo ou image ; opts : { grade: {gain:[r,g,b], off:[r,g,b]}, key: bool }
        process(src, opts = {}) {
            const sw = src.videoWidth || src.naturalWidth || src.width, sh = src.videoHeight || src.naturalHeight || src.height;
            if (!sw || !sh || failed) return null;
            const gain = opts.grade?.gain || [1, 1, 1], off = opts.grade?.off || [0, 0, 0];
            if (gl) {
                const scale = Math.min(1, 1280 / Math.max(sw, sh));
                const w = Math.round(sw * scale), h = Math.round(sh * scale);
                if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
                try {
                    gl.bindTexture(gl.TEXTURE_2D, tex);
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
                } catch (e) { failed = true; log('Texture vidéo refusée : ' + e.message); return null; }
                gl.uniform1i(loc.tex, 0); gl.uniform3fv(loc.gain, gain); gl.uniform3fv(loc.off, off);
                gl.uniform1f(loc.keyOn, opts.key ? 1 : 0); gl.uniform3fv(loc.keyCol, KEY_GREEN);
                gl.uniform1f(loc.sim, 0.085); gl.uniform1f(loc.smoothv, 0.06); gl.uniform1f(loc.spill, 0.85);
                gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                return canvas;
            }
            // 2D : on traite les pixels un par un sur une image réduite
            const scale = Math.min(1, 640 / Math.max(sw, sh));
            const w = Math.round(sw * scale), h = Math.round(sh * scale);
            if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
            c2.clearRect(0, 0, w, h); c2.drawImage(src, 0, 0, w, h);
            const img = c2.getImageData(0, 0, w, h), d = img.data;
            const kc = cbcrOf(KEY_GREEN[0], KEY_GREEN[1], KEY_GREEN[2]);
            for (let i = 0; i < d.length; i += 4) {
                let r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, a = 1;
                if (opts.key) {
                    const cc = cbcrOf(r, g, b), dist = Math.hypot(cc[0] - kc[0], cc[1] - kc[1]);
                    a = smoothstep(0.085, 0.145, dist);
                    g -= Math.max(0, g - Math.max(r, b)) * 0.85 * (1 - smoothstep(0.115, 0.157, dist));
                }
                d[i] = clampByte((r * gain[0] + off[0]) * 255); d[i + 1] = clampByte((g * gain[1] + off[1]) * 255); d[i + 2] = clampByte((b * gain[2] + off[2]) * 255); d[i + 3] = a * 255;
            }
            c2.putImageData(img, 0, 0);
            return canvas;
        }
    };
}
// Description du style sans ce qui concerne le fond (en mode fond vert, c'est l'appli qui pose le décor)
function stylePromptFor(style) {
    if (!style) return '';
    return state.greenScreen ? style.prompt.replace(/[^,.:;]*\bbackgrounds?\b[^,.;]*[,.;]?/gi, ' ').replace(/\s+/g, ' ').replace(/\s+([,.:;])/g, '$1').trim() : style.prompt;
}
function cbcrOf(r, g, b) { return [-0.1687 * r - 0.3313 * g + 0.5 * b, 0.5 * r - 0.4187 * g - 0.0813 * b]; }
function smoothstep(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function clampByte(x) { return x < 0 ? 0 : x > 255 ? 255 : x; }
function isKeyGreen(r, g, b) { const cc = cbcrOf(r / 255, g / 255, b / 255), kc = cbcrOf(...KEY_GREEN); return Math.hypot(cc[0] - kc[0], cc[1] - kc[1]) < 0.11; }

// ══════════════════════════════════════════════════════════════════
// MESURES : couleurs d'une image (pour harmoniser les scènes) et silhouette du personnage (fond vert)
// ══════════════════════════════════════════════════════════════════
function sampleStats(src, keyed) {
    const c = document.createElement('canvas'); c.width = 96; c.height = 54;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(src, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const sum = [0, 0, 0], sq = [0, 0, 0];
    let n = 0, minX = c.width, minY = c.height, maxX = -1, maxY = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4, r = d[i], gg = d[i + 1], b = d[i + 2];
        if (keyed && isKeyGreen(r, gg, b)) continue;
        if (keyed) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
        [r, gg, b].forEach((v, k) => { sum[k] += v / 255; sq[k] += (v / 255) ** 2; });
        n++;
    }
    if (!n) return null;
    const mean = sum.map(s => s / n), std = sq.map((s, k) => Math.sqrt(Math.max(1e-5, s / n - mean[k] ** 2)));
    const bbox = keyed && maxX >= 0 ? { x: minX / c.width, y: minY / c.height, w: (maxX - minX + 1) / c.width, h: (maxY - minY + 1) / c.height, cover: n / (c.width * c.height) } : null;
    return { mean, std, bbox };
}
function loadImageEl(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('image illisible')); i.src = src; }); }
// Réglage des couleurs d'une scène pour ressembler à la référence (corrigé à 70 %, pour rester naturel)
function gradeTowards(stats, target) {
    if (!stats || !target) return null;
    const gain = [0, 1, 2].map(k => { const g = target.std[k] / stats.std[k]; return 1 + (Math.max(0.8, Math.min(1.25, g)) - 1) * 0.7; });
    const off = [0, 1, 2].map(k => { const o = target.mean[k] - stats.mean[k] * gain[k]; return Math.max(-0.12, Math.min(0.12, o)) * 0.7; });
    return { gain, off };
}
// Mesure une scène (couleurs + silhouette) à partir de 2 images de son clip
async function measureClip(item) {
    const keyed = !!state.greenScreen;
    if (item.look !== undefined && item.lookKeyed === keyed && item.lookBlob === item.blob) return item.look;
    item.lookKeyed = keyed; item.lookBlob = item.blob;
    try {
        const frames = await Promise.all([0.35, 0.7].map(f => extractFrameAt(item.blob, f, 320, 0.8).then(loadImageEl)));
        const ss = frames.map(f => sampleStats(f, keyed)).filter(Boolean);
        if (!ss.length) { item.look = null; return null; }
        const avg = (k, j) => ss.reduce((a, s) => a + s[k][j], 0) / ss.length;
        item.look = { mean: [0, 1, 2].map(j => avg('mean', j)), std: [0, 1, 2].map(j => avg('std', j)), bbox: ss.find(s => s.bbox)?.bbox || null };
    } catch (e) { item.look = null; log('Mesure de la scène ' + (item.sceneIndex + 1) + ' : ' + e.message); }
    return item.look;
}
// Cible commune : l'image de référence, sinon la première scène
async function lookTarget(items) {
    const ref = typeof referenceImage === 'function' ? referenceImage() : null;
    if (ref) { try { return sampleStats(await loadImageEl(ref), !!state.greenScreen); } catch (e) {} }
    for (const it of items) { if (it.sceneIndex >= 0 && it.look) return it.look; }
    return null;
}

// ══════════════════════════════════════════════════════════════════
// DÉCOR FIXE (mode fond vert) : dessiné par l'appli selon le style, ou ton image
// ══════════════════════════════════════════════════════════════════
const DECOR_PALETTES = {
    whiteboard: null,
    chalkboard: ['#2f4f3a', '#243d2d', '#5b4636'],
    'manga-edu': ['#f4f4f4', '#dcdcdc', '#9a9a9a'],
    'kids-book': ['#fdf1dc', '#f6d9b8', '#c9a27b'],
    'watercolor-edu': ['#e8f1f8', '#cfe3ef', '#a9c7b5'],
    ghibli: ['#dff0e6', '#bfe0c9', '#8fb89a'],
    pixar: ['#e8f0ff', '#cfdcf7', '#b8a891'],
    claymation: ['#f3e3cf', '#e5c9a7', '#b88c63'],
    papercut: ['#fbe9d0', '#f2cfa3', '#d59a6a'],
    infographic: ['#eef3fa', '#dbe6f5', '#9fb3cf'],
    'comic-bd': ['#fff6d6', '#f5e3a8', '#d7b46a'],
    'vector-edu': ['#eaf6ff', '#cfe9fb', '#8cc5e8'],
    'cartoon-modern': ['#fff1e6', '#ffd9bf', '#e6a57e']
};
let decorCache = { key: '', canvas: null };
function drawDecor(ctx, W, H) {
    const key = state.selectedStyle + ':' + W + 'x' + H + ':' + (state.decorImage ? state.decorImage.length : 0);
    if (decorCache.key !== key) {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d');
        if (state.decorImage && state.decorImg) {
            const im = state.decorImg, s = Math.max(W / im.width, H / im.height);
            g.drawImage(im, (W - im.width * s) / 2, (H - im.height * s) / 2, im.width * s, im.height * s);
        } else {
            const pal = DECOR_PALETTES[state.selectedStyle];
            if (!pal) { g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); }
            else {
                // mur en dégradé doux, sol, halo derrière le personnage, vignettage
                const wall = g.createLinearGradient(0, 0, 0, H * 0.78); wall.addColorStop(0, pal[0]); wall.addColorStop(1, pal[1]);
                g.fillStyle = wall; g.fillRect(0, 0, W, H);
                g.fillStyle = pal[2]; g.globalAlpha = 0.55; g.fillRect(0, H * 0.78, W, H * 0.22); g.globalAlpha = 1;
                g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(0, H * 0.78, W, Math.max(2, H * 0.006));
                const halo = g.createRadialGradient(W * 0.3, H * 0.5, 0, W * 0.3, H * 0.5, Math.max(W, H) * 0.45);
                halo.addColorStop(0, 'rgba(255,255,255,0.45)'); halo.addColorStop(1, 'rgba(255,255,255,0)');
                g.fillStyle = halo; g.fillRect(0, 0, W, H);
                const vig = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
                vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.18)');
                g.fillStyle = vig; g.fillRect(0, 0, W, H);
            }
        }
        decorCache = { key, canvas: c };
    }
    ctx.drawImage(decorCache.canvas, 0, 0);
}
async function loadDecorImage() {
    try { state.decorImage = await idbGet('decor:' + state.selectedStyle) || null; } catch (e) { state.decorImage = null; }
    state.decorImg = state.decorImage ? await loadImageEl(state.decorImage).catch(() => null) : null;
    decorCache.key = '';
    renderDecorBox();
}
function renderDecorBox() {
    const box = document.getElementById('decor-box'); if (!box) return;
    box.classList.toggle('hidden', !state.greenScreen);
    const prev = document.createElement('canvas'); prev.width = 480; prev.height = 270;
    drawDecor(prev.getContext('2d'), 480, 270);
    box.innerHTML = '<img class="ref-img" src="' + prev.toDataURL('image/jpeg', 0.85) + '" alt="Décor">' +
        '<div class="hmuted">' + (state.decorImage ? 'Ton image de décor.' : isWhiteboard() ? 'Tableau blanc : fond blanc.' : 'Décor dessiné par l\'appli pour ce style. Tu peux mettre ta propre image.') + '</div>' +
        '<input type="file" id="decor-input" accept="image/*" style="display:none;">' +
        '<button type="button" class="btn-secondary" id="decor-pick-btn">🖼️ Choisir mon image de décor</button>' +
        (state.decorImage ? '<button type="button" class="btn-secondary" id="decor-reset-btn">Revenir au décor de l\'appli</button>' : '');
}
document.addEventListener('click', async e => {
    if (e.target.id === 'decor-pick-btn') document.getElementById('decor-input')?.click();
    if (e.target.id === 'decor-reset-btn') { await idbDel('decor:' + state.selectedStyle).catch(() => {}); loadDecorImage(); }
});
document.addEventListener('change', async e => {
    if (e.target.id !== 'decor-input' || !e.target.files[0]) return;
    const d = await downscaleImage(await fileToDataUri(e.target.files[0]), 1920, 0.88);
    await idbPut('decor:' + state.selectedStyle, d);
    loadDecorImage();
    showToast('Décor enregistré ✓', 'success');
});

// ══════════════════════════════════════════════════════════════════
// CADRAGE : personnage recalé d'une scène à l'autre (fond vert) + plans alternés (large / serré)
// ══════════════════════════════════════════════════════════════════
// Transformation du calque personnage pour que sa silhouette tombe au même endroit que sur la référence
function alignTransform(look, target) {
    const b = look?.bbox, r = target?.bbox;
    if (!b || !r || b.h < 0.1 || r.h < 0.1) return { s: 1, dx: 0, dy: 0 };
    const s = Math.max(0.85, Math.min(1.18, r.h / b.h));
    // on aligne le bas et le centre de la silhouette (en fraction de l'image)
    const dx = (r.x + r.w / 2) - (b.x + b.w / 2) * s, dy = (r.y + r.h) - (b.y + b.h) * s;
    return { s, dx: Math.max(-0.2, Math.min(0.2, dx)), dy: Math.max(-0.2, Math.min(0.2, dy)) };
}
// Plan serré une scène sur deux : les coupes paraissent voulues (comme un tournage à deux caméras)
function framingFor(seg, look, wb, hasDrawing) {
    if (!state.altFraming || seg.index % 2 === 0 || (wb && hasDrawing)) return null;
    const b = look?.bbox;
    const cx = b ? b.x + b.w / 2 : wb ? 0.25 : 0.5, cy = b ? b.y + b.h * 0.35 : 0.42;
    return { z: 1.16, cx, cy };
}
// Médaillon : image détourée recadrée sur la silhouette du personnage
function presenterFrom(layer, look) {
    if (!layer) return null;
    const b = look?.bbox || { x: 0, y: 0, w: 1, h: 1 };
    const m = 0.06, x = Math.max(0, b.x - m) * layer.width, y = Math.max(0, b.y - m) * layer.height;
    const w = Math.min(layer.width - x, (b.w + 2 * m) * layer.width), h = Math.min(layer.height - y, (b.h + m) * layer.height + layer.height * 0.02);
    if (w < 4 || h < 4) return null;
    const c = document.createElement('canvas'); c.width = Math.round(w); c.height = Math.round(h);
    c.getContext('2d').drawImage(layer, x, y, w, h, 0, 0, c.width, c.height);
    return c;
}
// Dessine l'image de la scène (couleurs harmonisées, fond vert remplacé par le décor, cadrage)
function drawSceneLayer(g, v, W, H, o) {
    const layer = o.proc ? o.proc.process(v, { grade: o.grade, key: o.keyed }) : null;
    const src = layer || v;
    g.save();
    if (o.framing) { const f = o.framing; g.translate(f.cx * W, f.cy * H); g.scale(f.z, f.z); g.translate(-f.cx * W, -f.cy * H); }
    if (o.keyed && layer) {
        drawDecor(g, W, H);
        const vw = v.videoWidth, vh = v.videoHeight, fit = Math.min(W / vw, H / vh);
        const dw = vw * fit, dh = vh * fit, dx = (W - dw) / 2, dy = (H - dh) / 2;
        const a = o.align || { s: 1, dx: 0, dy: 0 };
        g.drawImage(layer, dx + a.dx * dw, dy + a.dy * dh, dw * a.s, dh * a.s);
    } else if (layer) {
        drawFrame(g, layer, W, H);
    } else drawFrame(g, v, W, H);
    g.restore();
}
