// Cartoon Instructeur · Montage final
// (scripts classiques chargés dans l'ordre par index.html : ils partagent les mêmes variables globales)

// ══════════════════════════════════════════════════════════════════
// MONTAGE FINAL (canvas + MediaRecorder, MP4 natif sur iPhone)
// Son : musique continue avec ducking, blancs coupés, voix égalisées,
// bruitages. Image : sous-titres calés au mot, dessins synchronisés,
// zooms, transitions intelligentes, intro / titres de parties / fin, 1080p.
// ══════════════════════════════════════════════════════════════════
const FADE_SEC = 0.5;
const JOIN_SEC = 0.2;   // raccord très court entre deux plans du personnage (même pose, même cadrage)
let assembling = false;
// Pause automatique : si l'appli passe en arrière-plan pendant le montage, tout se fige
// (image, son, enregistrement) puis reprend exactement au même endroit au retour.
const montagePause = { on: false, since: 0, total: 0, rec: null, actx: null, resuming: null };
function montageNow() { return (montagePause.on ? montagePause.since : performance.now()) - montagePause.total; }
function pauseMontage() {
    const m = montagePause;
    if (m.on || !m.actx) return;
    m.on = true; m.since = performance.now();
    try { if (m.rec && m.rec.state === 'recording') m.rec.pause(); } catch (e) {}
    try { m.actx.suspend(); } catch (e) {}
    stageEl().querySelectorAll('video').forEach(v => { if (!v.paused) { v.dataset.wasPlaying = '1'; try { v.pause(); } catch (e) {} } });
    setStatus('⏸️ Montage en pause — reviens dans l\'appli pour qu\'il continue');
    log('Montage mis en pause (appli en arrière-plan)', 'info');
}
async function resumeMontage() {
    const m = montagePause;
    if (!m.on || m.resuming) return m.resuming;
    m.resuming = (async () => {
        try { await withTimeout(m.actx.resume(), 1500, 'son'); } catch (e) {}
        if (m.actx.state !== 'running') {
            // iPhone : le son ne repart qu'après un geste de l'utilisateur
            showToast('👆 Touche l\'écran pour reprendre le montage', 'info', 8000);
            await new Promise(res => { const go = () => { document.removeEventListener('pointerdown', go, true); m.actx.resume().catch(() => {}).then(res); }; document.addEventListener('pointerdown', go, true); });
        }
        if (document.hidden) { m.resuming = null; return; }
        stageEl().querySelectorAll('video').forEach(v => { if (v.dataset.wasPlaying) { delete v.dataset.wasPlaying; v.play().catch(() => {}); } });
        try { if (m.rec && m.rec.state === 'paused') m.rec.resume(); } catch (e) {}
        m.total += performance.now() - m.since; m.on = false; m.resuming = null;
        log('Montage repris', 'info');
    })();
    return m.resuming;
}
document.addEventListener('visibilitychange', () => { if (!assembling && !montagePause.actx) return; if (document.hidden) pauseMontage(); else resumeMontage(); });

function pickRecorderMime() {
    if (typeof MediaRecorder === 'undefined') return null;
    const candidates = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    for (const m of candidates) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) {} }
    return '';
}
function computeOutputSize(v, format) {
    const L = state.exportQuality === '720' ? 1280 : 1920, S = Math.round(L * 9 / 16 / 2) * 2;
    const f = format || state.videoFormat;
    if (f === 'portrait') return { w: S, h: L };
    if (f === 'landscape') return { w: L, h: S };
    if (f === 'square') return { w: S, h: S };
    const w = v.videoWidth || 720, h = v.videoHeight || 1280;
    const s = L / Math.max(w, h);
    return { w: Math.round(w * s / 2) * 2, h: Math.round(h * s / 2) * 2 };
}
function drawFrame(ctx, v, cw, ch) {
    const vw = v.videoWidth || v.width, vh = v.videoHeight || v.height;
    const wb = isWhiteboard();
    ctx.fillStyle = wb ? '#fff' : '#000'; ctx.fillRect(0, 0, cw, ch);
    if (!vw || !vh) return;
    if (Math.abs(vw / vh - cw / ch) < 0.02) { ctx.drawImage(v, 0, 0, cw, ch); return; }
    if (wb) { const f = Math.min(cw / vw, ch / vh); ctx.drawImage(v, (cw - vw * f) / 2, (ch - vh * f) / 2, vw * f, vh * f); return; }
    // Format différent : fond agrandi et estompé + image entière au centre (rien n'est coupé)
    const cover = Math.max(cw / vw, ch / vh);
    ctx.save();
    ctx.globalAlpha = 0.4;
    try { ctx.filter = 'blur(16px)'; } catch (e) {}
    ctx.drawImage(v, (cw - vw * cover) / 2, (ch - vh * cover) / 2, vw * cover, vh * cover);
    ctx.restore();
    const fit = Math.min(cw / vw, ch / vh);
    ctx.drawImage(v, (cw - vw * fit) / 2, (ch - vh * fit) / 2, vw * fit, vh * fit);
}
function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}
function wrapLines(ctx, text, maxWidth) {
    const words = String(text).split(/\s+/).filter(Boolean), lines = [];
    let cur = '';
    for (const w of words) { const test = cur ? cur + ' ' + w : w; if (ctx.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = w; } else cur = test; }
    if (cur) lines.push(cur);
    return lines;
}
const easeOut = x => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);
const clamp01 = x => Math.max(0, Math.min(1, x));
const MARKER_FONT = '"Marker Felt", "Chalkboard SE", "Comic Sans MS", -apple-system, sans-serif';
const UI_FONT = '-apple-system, "Helvetica Neue", Arial, sans-serif';

// ─────────────── Analyse du son ───────────────
// Où la parole commence et finit (volume par tranches de 20 ms), et son niveau moyen.
function analyzeSpeech(buf) {
    if (!buf) return null;
    const sr = buf.sampleRate, data = buf.getChannelData(0), win = Math.max(1, Math.round(sr * 0.02));
    const n = Math.floor(data.length / win);
    if (!n) return null;
    const rms = new Float32Array(n);
    let peak = 0;
    for (let i = 0; i < n; i++) {
        let s = 0;
        for (let j = i * win; j < (i + 1) * win; j += 2) s += data[j] * data[j];
        rms[i] = Math.sqrt(s / (win / 2));
        if (rms[i] > peak) peak = rms[i];
    }
    if (peak < 0.004) return { silent: true, start: 0, end: buf.duration, level: 0, coverage: 0 };
    const thr = Math.max(peak * 0.12, 0.004);
    let first = -1, last = -1, sum = 0, cnt = 0;
    for (let i = 0; i < n; i++) if (rms[i] > thr) { if (first < 0) first = i; last = i; sum += rms[i] * rms[i]; cnt++; }
    return { silent: false, start: first * 0.02, end: (last + 1) * 0.02, level: Math.sqrt(sum / Math.max(1, cnt)), coverage: cnt / n };
}
// Découpe de la scène : on garde la parole, sans les blancs (comme un monteur qui coupe « sur la respiration »).
function applyTrims(item, cut, vDur) {
    const e = item.edit; if (!e || (!e.trimIn && !e.trimOut)) return cut;
    const tin = Math.min(vDur - 0.5, cut.tin + (e.trimIn || 0)), tout = Math.max(tin + 0.5, cut.tout - (e.trimOut || 0));
    return { tin: Math.max(0, tin), tout: Math.min(vDur, tout) };
}
function sceneCut(item, vDur, index) { return applyTrims(item, sceneCutAuto(item, vDur, index), vDur); }
function sceneCutAuto(item, vDur, index) {
    if (state.trimMode === 'none') return { tin: 0, tout: vDur };
    const a = item.speech;
    if (state.trimMode === 'auto' && a && !a.silent && a.coverage < 0.93) {
        let tin = Math.max(0, a.start - 0.15), tout = Math.min(vDur, a.end + 0.35);
        if (tout - tin >= 1.2) return { tin, tout };
    }
    return { tin: index > 0 ? Math.min(0.4, vDur / 3) : 0, tout: vDur };
}
function voiceGainFor(item, speech) {
    const sp = speech || item.speech;
    const lvl = sp && !sp.silent ? sp.level : 0;
    return lvl ? Math.max(0.5, Math.min(3, 0.12 / lvl)) : 1;
}

// ─────────────── Mots et sous-titres ───────────────
const normWord = w => String(w).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
async function transcribeWords(blob) {
    const fd = new FormData();
    fd.append('model_id', 'scribe_v1');
    fd.append('file', blob, 'scene.mp4');
    fd.append('timestamps_granularity', 'word');
    fd.append('language_code', (state.language || 'fr-FR').split('-')[0]);
    const res = await withTimeout(fetch(ELEVENLABS_API + '/speech-to-text', { method: 'POST', headers: { 'xi-api-key': getElevenLabsKey() }, body: fd }), 60000, 'transcription trop longue');
    if (!res.ok) throw new Error('ElevenLabs ' + res.status);
    const data = await res.json();
    return (data.words || []).filter(w => w.type === 'word' || !w.type).map(w => ({ text: w.text, start: +w.start, end: +w.end }));
}
// Heure de chaque mot du script dans la scène (transcription ElevenLabs si disponible, sinon estimation sur la zone de parole).
function computeWordTimes(item, cut, dur) {
    const words = segmentsForScene(item.sceneIndex).map(s => s.text).join(' ').split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const spoken = (item.sttWords || []).map(w => ({ n: normWord(w.text), start: w.start - cut.tin, end: w.end - cut.tin })).filter(w => w.end > 0 && w.start < dur);
    if (spoken.length >= Math.max(1, words.length * 0.5)) {
        const times = new Array(words.length).fill(null);
        let j = 0;
        words.forEach((w, i) => {
            const nw = normWord(w);
            for (let k = j; k < Math.min(spoken.length, j + 4); k++) {
                if (nw && (spoken[k].n === nw || spoken[k].n.startsWith(nw) || nw.startsWith(spoken[k].n))) { times[i] = spoken[k]; j = k + 1; break; }
            }
        });
        // mots non retrouvés : interpolation entre les voisins
        for (let i = 0; i < words.length; i++) {
            if (times[i]) continue;
            let a = i - 1; while (a >= 0 && !times[a]) a--;
            let b = i + 1; while (b < words.length && !times[b]) b++;
            const t0 = a >= 0 ? times[a].end : Math.max(0, spoken[0].start);
            const t1 = b < words.length ? times[b].start : Math.min(dur, spoken[spoken.length - 1].end);
            const steps = b - a, pos = i - a;
            const s = t0 + (t1 - t0) * (pos - 1) / Math.max(1, steps - 1 || 1);
            times[i] = { start: s, end: s + Math.max(0.12, (t1 - t0) / Math.max(1, steps)) };
        }
        return words.map((w, i) => ({ text: w, start: Math.max(0, times[i].start), end: Math.min(dur, Math.max(times[i].start + 0.08, times[i].end)) }));
    }
    let s0 = 0.1, s1 = Math.max(0.5, dur - 0.25);
    const a = item.speech;
    if (a && !a.silent && a.coverage < 0.93) { s0 = Math.max(0, a.start - cut.tin); s1 = Math.min(dur, a.end - cut.tin); }
    const weights = words.map(w => w.length + 2), total = weights.reduce((x, y) => x + y, 0);
    let t = s0;
    return words.map((w, i) => { const d = (s1 - s0) * weights[i] / total; const r = { text: w, start: t, end: t + d }; t += d; return r; });
}
function captionGroups(wordTimes) {
    const groups = [];
    let cur = [];
    wordTimes.forEach((w, i) => {
        cur.push(w);
        const endPunct = /[.,!?;:…]$/.test(w.text);
        if (cur.length >= 3 || endPunct || i === wordTimes.length - 1) { groups.push({ words: cur, start: cur[0].start }); cur = []; }
    });
    groups.forEach((g, i) => { g.end = i < groups.length - 1 ? groups[i + 1].start : g.words[g.words.length - 1].end + 0.6; });
    return groups;
}
// Style « TikTok mots » : 2-3 mots à la fois, le mot prononcé s'allume.
// Format vertical (TikTok, Shorts) : on évite les zones cachées par les boutons (à droite) et la description (en bas).
function safeZone(cw, ch) {
    const on = state.safeZones !== false && ch / cw > 1.3;
    return on ? { on, cx: cw * 0.44, maxW: cw * 0.76, capY: ch * 0.66, top: ch * 0.1 } : { on, cx: cw / 2, maxW: cw * 0.9, capY: null, top: 0 };
}
function drawWordCaptions(ctx, cw, ch, groups, t) {
    if (!groups.length || t < groups[0].start - 0.05) return;
    const g = groups.find(gr => t >= gr.start - 0.05 && t < gr.end);
    if (!g) return;
    const base = Math.min(cw, ch);
    let fs = Math.round(base * 0.085);
    ctx.save();
    const setFont = () => { ctx.font = '900 ' + fs + 'px ' + captionFontFamily(); };
    setFont();
    const text = g.words.map(w => w.text).join(' ');
    const sz = safeZone(cw, ch);
    while (ctx.measureText(text).width > sz.maxW && fs > 18) { fs -= 2; setFont(); }
    const pop = easeOut((t - g.start) / 0.12);
    const y = sz.capY || ch * (isWhiteboard() ? 0.84 : 0.8);
    ctx.translate(sz.cx, y); ctx.scale(0.85 + 0.15 * pop, 0.85 + 0.15 * pop); ctx.translate(-sz.cx, -y);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.lineJoin = 'round';
    let x = sz.cx - ctx.measureText(text).width / 2;
    g.words.forEach((w, i) => {
        const piece = w.text + (i < g.words.length - 1 ? ' ' : '');
        const active = t >= w.start - 0.03;
        ctx.lineWidth = fs * 0.2; ctx.strokeStyle = '#111';
        ctx.strokeText(piece, x, y);
        ctx.fillStyle = active && t < w.end + 0.15 ? accentColor() : '#fff';
        ctx.fillText(piece, x, y);
        x += ctx.measureText(piece).width;
    });
    ctx.restore();
}
function drawSubtitle(ctx, cw, ch, text, litRatio) {
    if (!text) return;
    const style = state.subtitlesStyle, base = Math.min(cw, ch);
    let fontSize = Math.round(base * 0.052), bgColor = 'rgba(0,0,0,0.65)';
    if (style === 'tiktok') { fontSize = Math.round(base * 0.07); bgColor = null; }
    else if (style === 'minimal') { fontSize = Math.round(base * 0.042); bgColor = 'rgba(0,0,0,0.45)'; }
    ctx.save();
    ctx.font = '800 ' + fontSize + 'px ' + UI_FONT;
    ctx.textBaseline = 'middle';
    const sz = safeZone(cw, ch);
    const lines = wrapLines(ctx, text, sz.on ? sz.maxW * 0.92 : cw * 0.86);
    const lineHeight = fontSize * 1.28, pad = fontSize * 0.5;
    const boxH = lines.length * lineHeight + pad * 2;
    const boxW = Math.min(sz.on ? sz.maxW : cw * 0.92, Math.max(...lines.map(l => ctx.measureText(l).width)) + pad * 2.4);
    const boxY = sz.on ? sz.capY - boxH / 2 : ch - boxH - ch * 0.05, boxX = sz.cx - boxW / 2;
    if (bgColor) { ctx.fillStyle = bgColor; roundRectPath(ctx, boxX, boxY, boxW, boxH, fontSize * 0.5); ctx.fill(); }
    if (style === 'tiktok') { ctx.lineWidth = fontSize * 0.16; ctx.strokeStyle = '#000'; ctx.lineJoin = 'round'; }
    const totalWords = lines.reduce((a, l) => a + l.split(' ').length, 0);
    let litWords = style === 'karaoke' ? Math.round(totalWords * clamp01(litRatio)) : totalWords;
    lines.forEach((line, li) => {
        const y = boxY + pad + lineHeight * (li + 0.5);
        const words = line.split(' ');
        let x = sz.cx - ctx.measureText(line).width / 2;
        ctx.textAlign = 'left';
        words.forEach((w, wi) => {
            const piece = w + (wi < words.length - 1 ? ' ' : '');
            const lit = litWords > 0; litWords--;
            if (style === 'tiktok') ctx.strokeText(piece, x, y);
            ctx.fillStyle = style === 'karaoke' ? (lit ? accentColor() : 'rgba(255,255,255,0.85)') : '#fff';
            ctx.fillText(piece, x, y);
            x += ctx.measureText(piece).width;
        });
    });
    ctx.restore();
}
function drawCaptions(ctx, cw, ch, sc, t) {
    if (state.subtitlesStyle === 'off') return;
    if (state.subtitlesStyle === 'words') { drawWordCaptions(ctx, cw, ch, sc.groups, t); return; }
    const st = subtitleTextAt(sc.item.sceneIndex, sc.dur > 0 ? t / sc.dur : 0);
    const segWords = st.text.split(/\s+/).filter(Boolean).length || 1;
    const spokenSoFar = sc.words.filter(w => w.start <= t).length;
    drawSubtitle(ctx, cw, ch, st.text, state.subtitlesStyle === 'karaoke' ? Math.min(1, spokenSoFar / Math.max(segWords, sc.words.length)) : 1);
}

// ─────────────── Bulles, dessins ───────────────
function drawBubble(ctx, cw, ch, text, t) {
    if (!text) return;
    const appear = Math.min(1, t / 0.35);
    const scale = appear < 1 ? 0.6 + 0.4 * (1 - Math.pow(1 - appear, 3)) + Math.sin(appear * Math.PI) * 0.06 : 1;
    const fontSize = Math.round(Math.min(cw, ch) * 0.06);
    ctx.save();
    ctx.font = '800 ' + fontSize + 'px ' + UI_FONT;
    const lines = wrapLines(ctx, text, cw * 0.5);
    const pad = fontSize * 0.6, lh = fontSize * 1.2;
    const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + pad * 2;
    const h = lines.length * lh + pad * 1.6;
    const x = cw * 0.05, y = safeZone(cw, ch).on ? ch * 0.11 : ch * 0.07;
    ctx.globalAlpha = appear;
    ctx.translate(x + w * 0.2, y + h); ctx.scale(scale, scale); ctx.translate(-(x + w * 0.2), -(y + h));
    ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = fontSize * 0.4; ctx.shadowOffsetY = fontSize * 0.1;
    ctx.fillStyle = '#27ae60';
    roundRectPath(ctx, x, y, w, h, fontSize * 0.6); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + w * 0.18, y + h - 2); ctx.lineTo(x + w * 0.12, y + h + fontSize * 0.8); ctx.lineTo(x + w * 0.34, y + h - 2); ctx.closePath(); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, x + pad, y + pad * 0.8 + lh * (i + 0.5)));
    ctx.restore();
}
// Où dessiner : l'espace blanc libre à droite du personnage (ou au-dessus de la vidéo en format portrait).
function drawingArea(v, cw, ch) {
    const vw = v.videoWidth || cw, vh = v.videoHeight || ch;
    const f = Math.min(cw / vw, ch / vh), rw = vw * f, rh = vh * f, rx = (cw - rw) / 2, ry = (ch - rh) / 2;
    if (ry > ch * 0.2) { const sz = safeZone(cw, ch); return sz.on ? { x: cw * 0.06, y: sz.top, w: cw * 0.76, h: Math.max(ch * 0.1, ry - sz.top - ch * 0.02) } : { x: cw * 0.06, y: ch * 0.04, w: cw * 0.88, h: ry - ch * 0.06 }; }
    if (rw >= rh) return { x: rx + rw * 0.4, y: ry + rh * 0.07, w: rw * 0.56, h: rh * 0.6 };
    return { x: rx + rw * 0.42, y: ry + rh * 0.1, w: rw * 0.54, h: rh * 0.42 };
}
// Trace chaque trait selon sa fraction (0 à 1). Renvoie true si un trait est en cours (pour le bruit du feutre).
function strokeSketch(ctx, area, drawing, fracs, alpha, showTip) {
    if (!drawing) return false;
    const s = Math.min(area.w / DRAW_VB.w, area.h / DRAW_VB.h);
    const ox = area.x + (area.w - DRAW_VB.w * s) / 2, oy = area.y + (area.h - DRAW_VB.h * s) / 2;
    let tip = null;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(ox, oy); ctx.scale(s, s);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 4.5;
    drawing.strokes.forEach((st, i) => {
        const f = fracs[i];
        if (f <= 0) return;
        ctx.strokeStyle = st.color;
        if (f >= 1) { ctx.setLineDash([]); ctx.stroke(st.path2d); return; }
        const l = st.len * f;
        ctx.setLineDash([l, st.len + 10]); ctx.lineDashOffset = 0; ctx.stroke(st.path2d);
        try { tip = st.el.getPointAtLength(l); } catch (e) {}
    });
    (drawing.labels || []).forEach(lb => {
        const a = clamp01(((fracs[lb.stroke] ?? 0) - 0.5) / 0.5);
        if (a <= 0) return;
        ctx.globalAlpha = alpha * a;
        ctx.font = '800 ' + lb.size + 'px ' + MARKER_FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = lb.accent ? INK.red : '#1f1f1f';
        ctx.fillText(lb.text, lb.x, lb.y + (1 - a) * 6);
    });
    ctx.restore();
    if (tip && showTip && alpha > 0.5) {
        const x = ox + tip.x * s, y = oy + tip.y * s, r = Math.max(4, s * 6);
        ctx.save();
        ctx.fillStyle = '#1f1f1f'; ctx.strokeStyle = '#1f1f1f'; ctx.lineWidth = r * 0.9; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x + r * 0.6, y - r * 0.6); ctx.lineTo(x + r * 4.2, y - r * 4.2); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }
    return !!tip;
}
function drawSketch(ctx, area, drawing, progress, alpha) {
    if (!drawing) return false;
    let remaining = drawing.total * clamp01(progress);
    const fracs = drawing.strokes.map(st => { const f = clamp01(remaining / st.len); remaining -= st.len; return f; });
    return strokeSketch(ctx, area, drawing, fracs, alpha, true);
}
// Chaque trait démarre quand son mot est prononcé (sinon juste après le précédent).
function drawingSchedule(drawing, wordTimes, dur) {
    if (!drawing) return null;
    const speed = drawing.total / Math.max(1.2, dur * 0.55);
    let t = Math.max(0.15, (wordTimes[0]?.start ?? 0.2));
    const sched = drawing.strokes.map(st => {
        let trig = null;
        if (st.word) {
            const nw = normWord(st.word);
            const hit = nw && wordTimes.find(w => { const n = normWord(w.text); return n && (n === nw || (nw.length > 3 && n.startsWith(nw.slice(0, nw.length - 1))) || (n.length > 3 && nw.startsWith(n))); });
            if (hit) trig = hit.start;
        }
        const start = Math.max(t, trig ?? t), d = Math.max(0.12, st.len / speed);
        t = start + d;
        return { start, end: start + d };
    });
    const limit = dur * 0.8, first = sched[0].start, last = sched[sched.length - 1].end;
    if (last > limit && last > first) {
        const k = Math.max(0.05, (limit - first) / (last - first));
        sched.forEach(s => { s.start = first + (s.start - first) * k; s.end = first + (s.end - first) * k; });
    }
    return sched;
}
function drawSketchTimed(ctx, area, drawing, sched, t, alpha) {
    if (!drawing || !sched) return false;
    return strokeSketch(ctx, area, drawing, sched.map(s => clamp01((t - s.start) / Math.max(0.01, s.end - s.start))), alpha, true);
}
function drawSketchLabel(ctx, area, text, alpha) {
    if (!text || alpha <= 0) return;
    const fs = Math.round(Math.max(14, Math.min(area.w * 0.09, area.h * 0.13)));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = '800 ' + fs + 'px ' + MARKER_FONT;
    ctx.fillStyle = '#1f1f1f'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    wrapLines(ctx, text, area.w * 0.95).forEach((l, i) => ctx.fillText(l, area.x + area.w / 2, area.y + area.h + fs * 0.2 + i * fs * 1.1));
    ctx.restore();
}

// ─────────────── Habillage : intro, titres de parties, fin, logo ───────────────
function drawTitleCard(ctx, cw, ch, title, t, kind) {
    const wb = isWhiteboard();
    if (wb) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch); }
    else { const gr = ctx.createLinearGradient(0, 0, cw, ch); gr.addColorStop(0, '#1D2433'); gr.addColorStop(1, '#2E3A55'); ctx.fillStyle = gr; ctx.fillRect(0, 0, cw, ch); }
    const base = Math.min(cw, ch);
    let fs = Math.round(base * (kind === 'intro' ? 0.12 : 0.095));
    ctx.save();
    ctx.font = '900 ' + fs + 'px ' + MARKER_FONT;
    let lines = wrapLines(ctx, title, cw * 0.82);
    while (lines.length > 3 && fs > 20) { fs -= 4; ctx.font = '900 ' + fs + 'px ' + MARKER_FONT; lines = wrapLines(ctx, title, cw * 0.82); }
    const lh = fs * 1.15, y0 = ch / 2 - (lines.length - 1) * lh / 2 - (kind === 'intro' ? fs * 0.3 : 0);
    const reveal = easeOut(t / 0.9);
    ctx.beginPath(); ctx.rect(0, 0, cw * 0.09 + cw * 0.82 * reveal, ch); ctx.clip();
    ctx.fillStyle = wb ? '#1f1f1f' : '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, cw / 2, y0 + i * lh));
    ctx.restore();
    // soulignement tracé au feutre
    const u = clamp01((t - 0.75) / 0.45);
    if (u > 0) {
        const wMax = Math.min(cw * 0.7, fs * 6), ux = cw / 2 - wMax / 2, uy = y0 + (lines.length - 1) * lh + fs * 0.75;
        ctx.save(); ctx.strokeStyle = wb ? '#f08c00' : accentColor(); ctx.lineWidth = Math.max(4, fs * 0.09); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(ux, uy); ctx.quadraticCurveTo(ux + wMax / 2, uy + fs * 0.12, ux + wMax * u, uy - fs * 0.04); ctx.stroke(); ctx.restore();
    }
    if (kind === 'card' && t > 0) {
        ctx.save(); ctx.globalAlpha = easeOut(t / 0.4) * 0.6; ctx.fillStyle = wb ? '#8a84a3' : '#fff';
        ctx.font = '700 ' + Math.round(fs * 0.35) + 'px ' + UI_FONT; ctx.textAlign = 'center';
        ctx.fillText('— ' + (state.theme || 'La suite') + ' —', cw / 2, y0 - fs * 0.95); ctx.restore();
    }
}
function drawOutro(ctx, cw, ch, t, dur, logoImg) {
    const wb = isWhiteboard();
    ctx.fillStyle = wb ? '#fff' : '#1D2433'; ctx.fillRect(0, 0, cw, ch);
    const base = Math.min(cw, ch);
    const drawings = state.drawings.filter(Boolean).slice(0, 6);
    const portrait = ch > cw;
    let textY = ch * 0.5;
    if (drawings.length) {
        // récapitulatif du tableau
        const cols = portrait ? 2 : 3, rows = Math.ceil(drawings.length / cols);
        const gw = cw * 0.84, gh = ch * (portrait ? 0.5 : 0.56), cellW = gw / cols, cellH = gh / rows;
        drawings.forEach((d, i) => {
            const a = easeOut((t - i * 0.12) / 0.4);
            const cx = cw * 0.08 + (i % cols) * cellW, cy = ch * 0.06 + Math.floor(i / cols) * cellH;
            drawSketch(ctx, { x: cx + cellW * 0.08, y: cy + cellH * 0.06, w: cellW * 0.84, h: cellH * 0.84 }, d, 1, a);
        });
        textY = ch * 0.06 + gh + ch * 0.1;
    }
    const fs = Math.round(base * 0.075);
    ctx.save();
    ctx.globalAlpha = easeOut((t - 0.3) / 0.5);
    ctx.fillStyle = wb ? '#1f1f1f' : '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 ' + fs + 'px ' + MARKER_FONT;
    ctx.fillText('Merci d\'avoir regardé !', cw / 2, textY);
    const pulse = 1 + Math.sin(t * 5) * 0.04;
    const bw = fs * 6.2, bh = fs * 1.5, by = textY + fs * 1.4;
    ctx.translate(cw / 2, by + bh / 2); ctx.scale(pulse, pulse); ctx.translate(-cw / 2, -(by + bh / 2));
    ctx.fillStyle = '#e03e3e'; roundRectPath(ctx, cw / 2 - bw / 2, by, bw, bh, bh / 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '900 ' + Math.round(fs * 0.62) + 'px ' + UI_FONT;
    ctx.fillText('🔔 ABONNE-TOI', cw / 2, by + bh / 2 + 1);
    ctx.restore();
    if (logoImg) drawLogo(ctx, cw, ch, logoImg, 1.4);
    if (t > dur - 0.5) { ctx.fillStyle = 'rgba(0,0,0,' + clamp01((t - (dur - 0.5)) / 0.5) + ')'; ctx.fillRect(0, 0, cw, ch); }
}
// Chiffre clé ou définition affiché en grand (« callout »), avec un petit rebond.
function drawHighlight(ctx, cw, ch, text, t, remaining) {
    if (!text) return;
    const hold = Math.min(1.8, remaining + 1.8);
    if (t > hold) return;
    const appear = clamp01(t / 0.25), out = clamp01((hold - t) / 0.25);
    const bounce = appear < 1 ? 0.5 + 0.5 * easeOut(appear) + Math.sin(appear * Math.PI) * 0.12 : 1;
    const base = Math.min(cw, ch);
    let fs = Math.round(base * 0.16);
    ctx.save();
    ctx.globalAlpha = Math.min(appear, out);
    ctx.font = '900 ' + fs + 'px ' + captionFontFamily();
    while (ctx.measureText(text).width > cw * 0.8 && fs > 24) { fs -= 4; ctx.font = '900 ' + fs + 'px ' + captionFontFamily(); }
    const cy = ch * 0.45, tw = ctx.measureText(text).width;
    ctx.translate(cw / 2, cy); ctx.rotate(-0.04); ctx.scale(bounce, bounce);
    ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = fs * 0.3;
    roundRectPath(ctx, -tw / 2 - fs * 0.45, -fs * 0.75, tw + fs * 0.9, fs * 1.5, fs * 0.35); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = fs * 0.14; ctx.strokeStyle = '#1f1f1f'; ctx.strokeText(text, 0, 0);
    ctx.fillStyle = accentColor(); ctx.fillText(text, 0, 0);
    ctx.restore();
}
function drawLogo(ctx, cw, ch, img, scale = 1) {
    if (!img || !img.width) return;
    const size = Math.min(cw, ch) * 0.1 * scale, r = img.width / img.height;
    const w = r >= 1 ? size : size * r, h = r >= 1 ? size / r : size;
    ctx.save(); ctx.globalAlpha = 0.85;
    ctx.drawImage(img, cw - w - Math.min(cw, ch) * 0.04, Math.min(cw, ch) * 0.04, w, h);
    ctx.restore();
}

// ─────────────── Bruitages (synthétisés, aucun fichier) ───────────────
function createSfx(actx, out) {
    const len = actx.sampleRate * 2, noise = actx.createBuffer(1, len, actx.sampleRate), d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = actx.createBufferSource(); src.buffer = noise; src.loop = true;
    const bp = actx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 1.1;
    const amp = actx.createGain(); amp.gain.value = 0.65;
    const lfo = actx.createOscillator(); lfo.frequency.value = 11;
    const lfoGain = actx.createGain(); lfoGain.gain.value = 0.35;
    lfo.connect(lfoGain).connect(amp.gain);
    const scrib = actx.createGain(); scrib.gain.value = 0;
    src.connect(bp).connect(amp).connect(scrib).connect(out);
    src.start(); lfo.start();
    let scribOn = false;
    return {
        scribble(on) { if (on === scribOn) return; scribOn = on; scrib.gain.setTargetAtTime(on ? 0.08 : 0, actx.currentTime, 0.03); },
        pop() {
            const o = actx.createOscillator(), gn = actx.createGain(), t = actx.currentTime;
            o.type = 'sine'; o.frequency.setValueAtTime(480, t); o.frequency.exponentialRampToValueAtTime(980, t + 0.08);
            gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.22, t + 0.01); gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
            o.connect(gn).connect(out); o.start(t); o.stop(t + 0.16);
        },
        whoosh() {
            const s = actx.createBufferSource(), f = actx.createBiquadFilter(), gn = actx.createGain(), t = actx.currentTime;
            s.buffer = noise; f.type = 'bandpass'; f.Q.value = 0.8;
            f.frequency.setValueAtTime(350, t); f.frequency.exponentialRampToValueAtTime(2600, t + 0.4);
            gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.18, t + 0.15); gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
            s.connect(f).connect(gn).connect(out); s.start(t); s.stop(t + 0.55);
        },
        stop() { try { src.stop(); lfo.stop(); } catch (e) {} }
    };
}

// ─────────────── Préparation (téléchargement, analyse, transcription) ───────────────
async function prepareAssets(items, label) {
    const usePremium = state.voiceSource === 'premium';
    if (usePremium && state.ttsEngine === 'browser') showToast('La voix du navigateur ne peut pas être enregistrée : voix Agnes utilisée', 'warn', 5000);
    const premium = usePremium && state.ttsEngine !== 'browser';
    let ttsFailed = false, sttFailed = !state.syncWords || !getElevenLabsKey();
    for (let i = 0; i < items.length; i++) {
        if (state.stopRequested) throw new Error('Arrêt demandé');
        setStatus(label + ' : préparation ' + (i + 1) + '/' + items.length + '…');
        setProgress(3 + (i / items.length) * 17);
        const item = items[i];
        await fetchClipBlob(item);
        if (premium && !item.ttsBuffer && !ttsFailed) {
            try {
                const b = await generateAudioUnified(scenePlanFor(item.sceneIndex).spoken || item.sceneText);
                if (b) { item.ttsBlob = b; item.ttsBuffer = await decodeAudioBlob(b); item.ttsSpeech = analyzeSpeech(item.ttsBuffer); }
            } catch (e) { ttsFailed = true; showToast('Voix premium indisponible (' + e.message + ') : voix Agnes utilisée', 'warn', 6000); }
        }
        if (item.audioBuffer === undefined) { item.audioBuffer = await decodeAudioBlob(item.blob); item.speech = analyzeSpeech(item.audioBuffer); }
        if (typeof prepareNarration === 'function' && scenePlanFor(item.sceneIndex).narration) { setStatus(label + ' : voix off ' + (i + 1) + '/' + items.length + '…'); await prepareNarration(item); }
        if (state.voiceSource === 'fit' && !item.fitBuffer && !ttsFailed) {
            setStatus(label + ' : voix ElevenLabs ' + (i + 1) + '/' + items.length + '…');
            try { await prepareFitVoice(item); }
            catch (e) { ttsFailed = true; showToast('Voix ElevenLabs indisponible (' + e.message + ') : voix Agnes utilisée', 'warn', 6000); }
        }
        if (!sttFailed && item.sttWords === undefined && !(premium && item.ttsBuffer)) {
            setStatus(label + ' : synchronisation des sous-titres ' + (i + 1) + '/' + items.length + '…');
            try { item.sttWords = await transcribeWords(item.blob); }
            catch (e) { sttFailed = true; item.sttWords = undefined; log('Transcription : ' + e.message); showToast('Synchronisation au mot indisponible (' + e.message + ') : estimation utilisée', 'warn', 5000); }
        }
    }
    if (premium) {
        const tts = items.map(i => i.ttsBlob).filter(Boolean);
        state.finalAudioBlob = tts.length ? new Blob(tts, { type: 'audio/mpeg' }) : null;
    }
    return { premium };
}
// Contrôle qualité : scènes sans voix ou à la voix coupée.
function sceneProblem(item) {
    if (state.voiceSource === 'premium') return null;
    if (state.voiceSource === 'fit' && item.fitBuffer) return item.speech?.silent ? 'personnage muet (lèvres immobiles)' : null;
    if (!item.audioBuffer) return 'pas de son';
    if (item.speech?.silent) return 'pas de voix';
    if (item.speech && item.speech.end - item.speech.start < 0.6) return 'voix trop courte';
    return null;
}
function buildSegments(items, maxDuration) {
    const segs = [];
    if (state.introOn && (state.theme || '').trim() && maxDuration > 20) segs.push({ type: 'intro', dur: 2.4, title: state.theme.trim() });
    items.forEach((item, i) => {
        const plan = scenePlanFor(item.sceneIndex);
        const section = String(plan.section || '').trim();
        if (section && i > 0 && state.sectionCards && maxDuration > 20) segs.push({ type: 'card', dur: 1.7, title: section });
        segs.push({ type: 'scene', item, index: i, newSection: !!section && i > 0 });
        if (plan.narration && item.sceneIndex >= 0) segs.push({ type: 'board', item, index: i });
    });
    if (state.outroOn && maxDuration > 20) segs.push({ type: 'outro', dur: 3.6 });
    return segs;
}
async function loadMusicBuffer() {
    if (effectiveMusicMode() !== 'app') return null;
    try { const blob = await idbGet('music'); return blob ? await decodeAudioBlob(blob) : null; } catch (e) { return null; }
}
async function loadLogoImage() {
    try {
        const blob = await idbGet('logo'); if (!blob) return null;
        const img = new Image(); const url = URL.createObjectURL(blob);
        await new Promise(r => { img.onload = r; img.onerror = r; img.src = url; });
        return img.width ? img : null;
    } catch (e) { return null; }
}

// Boucle d'affichage pendant « dur » secondes (s'arrête aussi si shouldEnd() renvoie true).
function runFrames(dur, render, shouldEnd) {
    return new Promise(resolve => {
        // horloge du montage : le temps passé en pause (appli en arrière-plan) n'est pas compté
        const t0 = montageNow();
        let finished = false;
        const finish = () => { if (!finished) { finished = true; clearInterval(safety); resolve(Math.min(dur, (montageNow() - t0) / 1000)); } };
        const tick = () => {
            if (finished) return;
            if (montagePause.on) { requestAnimationFrame(tick); return; }
            const t = (montageNow() - t0) / 1000;
            if (state.stopRequested || t >= dur || (shouldEnd && shouldEnd(t))) { finish(); return; }
            render(t);
            requestAnimationFrame(tick);
        };
        // filet de sécurité si l'affichage se bloque (hors pause)
        const safety = setInterval(() => { if (state.stopRequested || (!montagePause.on && (montageNow() - t0) / 1000 > dur + 6)) finish(); }, 1000);
        requestAnimationFrame(tick);
    });
}

async function assembleVideo({ maxDuration = Infinity, label = 'Montage', format = null, preview = null, items: only = null } = {}) {
    const items = only || montageItems();
    if (!items.some(it => it.sceneIndex >= 0)) throw new Error('aucune scène terminée à assembler');
    const mime = preview ? '' : pickRecorderMime();
    if (mime === null) throw new Error('ce navigateur ne sait pas enregistrer de vidéo');
    const actx = getAudioCtx();
    try { await actx.resume(); } catch (e) {}
    Object.assign(montagePause, { on: false, since: 0, total: 0, rec: null, actx, resuming: null });
    const { premium } = await prepareAssets(items, label);
    const segs = buildSegments(items, maxDuration);
    const musicBuf = await loadMusicBuffer();
    const logoImg = await loadLogoImage();
    const wb = isWhiteboard();
    // Image : couleurs harmonisées entre les scènes, fond vert remplacé par le décor, personnage recalé
    const keyed = !!state.greenScreen;
    const proc = (state.colorMatch || keyed) ? createVideoProcessor() : null;
    if (proc) {
        setStatus(label + ' : harmonisation des couleurs…');
        for (const it of items) if (it.blob) await measureClip(it);
        const target = await lookTarget(items);
        // une scène tournée sans fond vert (ancienne scène, fond vert raté) reste telle quelle
        items.forEach(it => { it.keyed = keyed && !!it.look?.bbox && it.look.bbox.cover < 0.75; it.grade = state.colorMatch ? gradeTowards(it.look, target) : null; it.align = it.keyed ? alignTransform(it.look, target) : null; });
        const unkeyed = items.filter(it => keyed && it.sceneIndex >= 0 && !it.keyed).length;
        if (unkeyed) showToast(unkeyed + ' scène(s) sans fond vert : gardées telles quelles (refais-les pour avoir le décor)', 'warn', 6000);
    }
    let presenter = null;   // dernière image du personnage détouré (médaillon sur les plans illustrés)

    // Enregistrement
    const urls = new Map(items.map(it => [it, URL.createObjectURL(it.blob)]));
    let pending = await createStageVideo(urls.get(items[0]));
    const { w: W, h: H } = computeOutputSize(pending, format);
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const g = canvas.getContext('2d');
    const prevCanvas = document.createElement('canvas'); prevCanvas.width = W; prevCanvas.height = H;
    const pg = prevCanvas.getContext('2d');
    drawFrame(g, pending, W, H);
    // Aperçu : on affiche directement le canvas et on joue le son, sans rien enregistrer
    if (preview) { preview.innerHTML = ''; canvas.className = 'preview-canvas'; preview.appendChild(canvas); preview.classList.remove('hidden'); }
    const vStream = preview ? null : canvas.captureStream(30);
    const dest = preview ? actx.destination : actx.createMediaStreamDestination();
    // Voix : compresseur « studio » puis gain de rattrapage
    const comp = actx.createDynamicsCompressor();
    comp.threshold.value = -22; comp.knee.value = 12; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.2;
    const makeup = actx.createGain(); makeup.gain.value = 1.25;
    comp.connect(makeup).connect(dest);
    const sfxBus = actx.createGain(); sfxBus.gain.value = state.sfxOn ? 1 : 0; sfxBus.connect(dest);
    const sfx = createSfx(actx, sfxBus);
    const musicGain = actx.createGain(); musicGain.gain.value = 0.0001; musicGain.connect(dest);
    const musicHigh = state.musicVolume, musicLow = state.musicVolume * 0.32;
    const duckTo = level => musicGain.gain.setTargetAtTime(Math.max(0.0001, level), actx.currentTime, 0.18);
    const stream = preview ? null : new MediaStream([...vStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const rec = preview ? null : mime ? new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: state.exportQuality === '720' ? 5000000 : 10000000 }) : new MediaRecorder(stream);
    const chunks = [];
    if (rec) rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = rec ? new Promise(res => { rec.onstop = res; }) : Promise.resolve();
    const sceneTotal = items.length;
    const qa = !preview && label === 'Montage' && state.qaOn && typeof createQa === 'function' ? createQa(segs.length) : null;
    const timeline = [];
    let T = 0, hasPrev = false, prevSketch = null, prevWasScene = false, prevWasBoard = false, prevWasCard = false, musicSrc = null;
    if (rec) { rec.start(1000); montagePause.rec = rec; }
    if (musicBuf) { musicSrc = actx.createBufferSource(); musicSrc.buffer = musicBuf; musicSrc.loop = true; musicSrc.connect(musicGain); musicSrc.start(); duckTo(musicHigh); }

    try {
        for (let si = 0; si < segs.length; si++) {
            const seg = segs[si];
            if (state.stopRequested) throw new Error('Arrêt demandé');
            while (montagePause.on && !state.stopRequested) { if (!document.hidden) resumeMontage(); await new Promise(r => setTimeout(r, 300)); }
            if (rec && rec.state === 'inactive') throw new Error('le téléphone a coupé l\'enregistrement pendant que l\'appli était en arrière-plan. Relance « Assembler la vidéo finale » en gardant l\'appli ouverte');
            if (T >= maxDuration - 0.05) break;
            setProgress(22 + (si / segs.length) * 75);

            if (seg.type === 'board') {
                const item = seg.item, plan = scenePlanFor(item.sceneIndex);
                const buf = item.narrBuffer;
                if (!buf) continue;
                setStatus(label + ' : plan illustré ' + (seg.index + 1) + '/' + sceneTotal + ' — garde l\'appli ouverte');
                const sp = item.narrSpeech;
                let dur = Math.min(buf.duration + 0.15, (sp && !sp.silent ? sp.end : buf.duration) + 0.45);
                dur = Math.min(Math.max(1.5, dur), maxDuration - T);
                const words = narrationWords(plan.narration, sp, dur), groups = captionGroups(words);
                const drawing = state.drawings[item.sceneIndex] || null;
                const sched = drawing ? drawingSchedule(drawing, words, dur) : null;
                const backdrop = document.createElement('canvas'); backdrop.width = W; backdrop.height = H; backdrop.getContext('2d').drawImage(prevCanvas, 0, 0);
                if (musicBuf) duckTo(musicLow);
                sfx.whoosh();
                const src = actx.createBufferSource(); src.buffer = buf;
                const vg = actx.createGain(), now = actx.currentTime;
                const gv = voiceGainFor(item, sp);
                vg.gain.setValueAtTime(0.0001, now); vg.gain.linearRampToValueAtTime(gv, now + 0.03);
                src.connect(vg).connect(comp);
                try { src.start(actx.currentTime + 0.05, 0, dur); } catch (e) {}
                const info = { name: 'scène ' + (item.sceneIndex + 1) + ' · plan illustré' };
                // jamais de plan vide : sans dessin ni graphique, les mots-clés s'affichent en liste animée
                let boardGraphic = normalizeGraphic(plan.graphic);
                if (boardGraphic.type === 'none' && !drawing && plan.keywords?.length) boardGraphic = normalizeGraphic({ type: 'list', title: '', unit: '', items: plan.keywords.map(k => ({ label: k, value: 0 })) });
                const played = await runFrames(dur, t => {
                    const active = drawBoardShot(g, W, H, t, dur, { backdrop, drawing, sched, title: plan.bubble || '', presenter, graphic: boardGraphic, words, keywords: plan.keywords });
                    sfx.scribble(active);
                    if (plan.highlight && t > dur * 0.55) drawHighlight(g, W, H, plan.highlight, t - dur * 0.55, dur - t);
                    if (t < 0.45) {   // transition « zoom » : l'image précédente s'agrandit et s'efface
                        const e = easeOut(t / 0.45), zz = 1 + 0.18 * e;
                        g.save(); g.globalAlpha = 1 - e; g.translate(W / 2, H / 2); g.scale(zz, zz); g.translate(-W / 2, -H / 2); g.drawImage(prevCanvas, 0, 0); g.restore();
                    }
                    drawNarrationCaptions(g, W, H, words, groups, t);
                    if (logoImg) drawLogo(g, W, H, logoImg);
                    if (qa) qa.tick(canvas, T + t, t, dur, info);
                });
                sfx.scribble(false);
                try { src.stop(); } catch (e) {}
                timeline.push({ sceneIndex: item.sceneIndex, start: T, duration: played, narration: true });
                // image de fin propre (sans sous-titres ni logo) pour la transition suivante
                drawBoardShot(pg, W, H, played, dur, { backdrop, drawing, sched, title: plan.bubble || '', presenter, graphic: boardGraphic, words, keywords: plan.keywords });
                hasPrev = true; prevSketch = null; prevWasScene = false; prevWasBoard = true; prevWasCard = false;
                T += played;
                continue;
            }
            if (seg.type !== 'scene') {
                const dur = Math.min(seg.dur, maxDuration - T);
                setStatus(label + ' : habillage — garde l\'appli ouverte');
                if (musicBuf) duckTo(musicHigh);
                if (seg.type === 'intro') sfx.pop(); else if (seg.type === 'card') sfx.whoosh();
                const fadeFromPrev = hasPrev;
                const played = await runFrames(dur, t => {
                    // le titre descend et recouvre l'image précédente (pas de fondu qui assombrit le personnage)
                    const drop = fadeFromPrev && t < 0.45 ? 1 - easeOut(t / 0.45) : 0;
                    if (drop > 0) { g.drawImage(prevCanvas, 0, 0); g.save(); g.translate(0, -H * drop); }
                    if (seg.type === 'outro') drawOutro(g, W, H, t, dur, logoImg);
                    else drawTitleCard(g, W, H, seg.title, t, seg.type);
                    if (drop > 0) g.restore();
                    if (seg.type === 'outro' && musicBuf && t > dur - 1.3) musicGain.gain.setTargetAtTime(0.0001, actx.currentTime, 0.3);
                });
                if (seg.type === 'outro') drawOutro(pg, W, H, played, dur, null); else drawTitleCard(pg, W, H, seg.title, played, seg.type);
                hasPrev = true; prevSketch = null; prevWasScene = false; prevWasBoard = false; prevWasCard = true;
                T += played;
                continue;
            }

            // Scène
            const item = seg.item;
            setStatus(label + ' : scène ' + (seg.index + 1) + '/' + sceneTotal + ' — garde l\'appli ouverte');
            const v = pending || await createStageVideo(urls.get(item));
            pending = null;
            const vDur = isFinite(v.duration) && v.duration > 0 ? v.duration : 6;
            const usingTts = !!(premium && item.ttsBuffer);
            const usingFit = !usingTts && state.voiceSource === 'fit' && !!item.fitBuffer;
            let cut = usingTts ? applyTrims(item, { tin: seg.index > 0 ? Math.min(0.4, vDur / 3) : 0, tout: vDur }, vDur) : sceneCut(item, vDur, seg.index);
            let dur = cut.tout - cut.tin;
            if (usingTts) dur = Math.max(dur, item.ttsBuffer.duration + 0.25);
            dur = Math.min(dur, maxDuration - T);
            const words = usingTts
                ? computeWordTimes({ ...item, sttWords: null, speech: item.ttsSpeech }, { tin: 0, tout: dur }, dur)
                : computeWordTimes(item, cut, dur);
            const sc = { item, dur, words, groups: captionGroups(words) };
            const plan = scenePlanFor(item.sceneIndex);
            const richScene = !!(plan.narration && item.narrBuffer);
            const drawing = wb && !richScene ? state.drawings[item.sceneIndex] : null;
            const sched = drawing ? drawingSchedule(drawing, words, dur) : null;
            const shift = item.edit?.drawShift || 0;
            if (sched && shift) sched.forEach(x => { x.start = Math.max(0, Math.min(dur - 0.2, x.start + shift)); x.end = Math.max(x.start + 0.05, Math.min(dur, x.end + shift)); });
            const boardShot = !!(wb && drawing && plan.shot === 'board');
            const area = wb ? (boardShot ? { x: W * 0.08, y: H * 0.06, w: W * 0.84, h: H * 0.62 } : drawingArea(v, W, H)) : null;
            let highlightAt = null;
            if (plan.highlight) {
                const hw = normWord(String(plan.highlight).split(/\s+/)[0] || '');
                const hit = hw ? words.find(w => normWord(w.text).startsWith(hw) || (normWord(w.text).length > 2 && hw.startsWith(normWord(w.text)))) : null;
                highlightAt = hit ? hit.start : dur * 0.3;
            }
            // Zoom sur le mot important
            let zoomAt = null;
            if (state.zoomOn && plan.zoom === 'in' && !boardShot) {
                const nw = normWord(plan.emphasis || '');
                const hit = nw ? words.find(w => normWord(w.text) === nw || normWord(w.text).startsWith(nw)) : null;
                zoomAt = hit ? hit.start : dur * 0.35;
            }
            // après un titre : le titre remonte et découvre la scène (pas de fondu qui mélange texte, bulle et personnage)
            const transition = state.transition === 'cut' ? 'cut' : prevWasCard && hasPrev ? 'wipe' : state.transition === 'fade' ? 'fade' : (prevWasScene && !seg.newSection ? 'join' : 'fade');
            const fadeIn = hasPrev && (transition === 'fade' || transition === 'join');
            const wipeIn = hasPrev && transition === 'wipe';
            const overlayDelay = wipeIn ? 0.55 : hasPrev && transition === 'fade' ? 0.35 : 0;   // bulles et mises en valeur après la transition
            const fadeSec = transition === 'join' ? JOIN_SEC : prevWasBoard ? 0.3 : FADE_SEC;
            if (transition === 'fade' && prevWasScene) sfx.whoosh();
            const qaInfo = { name: 'scène ' + (item.sceneIndex + 1) };
            const layerOpts = { proc, grade: item.grade, keyed: !!item.keyed, align: item.align, framing: framingFor(seg, item.look, wb, !!drawing) };

            await seekTo(v, cut.tin);
            const buf = usingTts ? item.ttsBuffer : usingFit ? item.fitBuffer : item.audioBuffer;
            // voix calée : son début est aligné sur le début de la parole d'Agnes (les lèvres)
            const fitDelay = usingFit ? Math.max(0, (item.speech && !item.speech.silent ? item.speech.start : 0) - cut.tin) - (item.fitSpeech && !item.fitSpeech.silent ? item.fitSpeech.start : 0) : 0;
            let src = null, vg = null;
            if (buf) {
                src = actx.createBufferSource(); src.buffer = buf;
                vg = actx.createGain();
                const gv = usingTts ? 1 : usingFit ? voiceGainFor(item, item.fitSpeech) : voiceGainFor(item), now = actx.currentTime;
                vg.gain.setValueAtTime(0.0001, now); vg.gain.linearRampToValueAtTime(gv, now + 0.03);
                vg.gain.setValueAtTime(gv, now + Math.max(0.05, dur - 0.05)); vg.gain.linearRampToValueAtTime(0.0001, now + dur);
                src.connect(vg).connect(comp);
            }
            if (musicBuf) duckTo(musicLow);
            try { await v.play(); } catch (e) {}
            if (src) {
                try {
                    if (usingFit) src.start(actx.currentTime + Math.max(0, fitDelay), Math.max(0, -fitDelay), Math.max(0.1, dur - Math.max(0, fitDelay)));
                    else src.start(actx.currentTime, usingTts ? 0 : Math.min(cut.tin, buf.duration - 0.05), dur + 0.05);
                } catch (e) {}
            }
            let labelShown = false, bubblePopped = false, highlightPopped = false;
            const played = await runFrames(dur, t => {
                // calque « scène » (zoomable)
                g.save();
                if (zoomAt !== null) {
                    const z = 1 + 0.1 * easeOut((t - zoomAt) / 0.35);
                    const cx = wb && area ? W * 0.42 : W / 2, cy = H * 0.45;
                    g.translate(cx, cy); g.scale(z, z); g.translate(-cx, -cy);
                }
                if (boardShot) {
                    // plan « tableau seul » : le dessin en plein écran, léger mouvement de caméra
                    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
                    const z = 1 + 0.04 * clamp01(t / dur); g.translate(W / 2, H * 0.4); g.scale(z, z); g.translate(-W / 2, -H * 0.4);
                } else drawSceneLayer(g, v, W, H, layerOpts);
                let drawingActive = false;
                if (wb && area) {
                    if (prevSketch && t < FADE_SEC && transition === 'cut') drawSketch(g, prevSketch.area, prevSketch.drawing, 1, 1 - t / FADE_SEC);
                    drawingActive = drawSketchTimed(g, area, drawing, sched, t, Math.min(1, t / 0.15));
                    if (!drawing && plan.keywords?.length) drawGraphic(g, area, { type: 'list', title: '', unit: '', items: plan.keywords.map(k => ({ label: k, value: 0 })) }, t, dur);
                    if (state.pedagoFx.includes('bubbles') && plan.bubble) {
                        const showAt = sched ? sched[Math.floor(sched.length / 2)].end : dur * 0.45;
                        const a = clamp01((t - showAt) / 0.25);
                        if (a > 0 && !labelShown) { labelShown = true; sfx.pop(); }
                        drawSketchLabel(g, area, plan.bubble, a);
                    }
                } else if (state.pedagoFx.includes('bubbles') && plan.bubble) {
                    if (!bubblePopped && t >= overlayDelay) { bubblePopped = true; sfx.pop(); }
                    if (t >= overlayDelay) drawBubble(g, W, H, plan.bubble, t - overlayDelay);
                }
                g.restore();
                sfx.scribble(drawingActive);
                if (highlightAt !== null && t >= Math.max(highlightAt, overlayDelay)) {
                    if (!highlightPopped) { highlightPopped = true; sfx.pop(); }
                    drawHighlight(g, W, H, plan.highlight, t - highlightAt, dur - t);
                }
                if (fadeIn && t < fadeSec) { g.save(); g.globalAlpha = 1 - t / fadeSec; g.drawImage(prevCanvas, 0, 0); g.restore(); }
                if (wipeIn && t < 0.45) {   // le titre remonte et découvre la scène
                    const e = easeOut(t / 0.45);
                    g.drawImage(prevCanvas, 0, -H * e);
                }
                drawCaptions(g, W, H, sc, t);
                if (logoImg) drawLogo(g, W, H, logoImg);
                if (qa) qa.tick(canvas, T + t, t, dur, qaInfo);
            }, t => !usingTts && v.ended && t > 0.3);
            sfx.scribble(false);
            if (src) { try { src.stop(); } catch (e) {} }
            timeline.push({ sceneIndex: item.sceneIndex, start: T, duration: played });
            prevSketch = drawing && area ? { drawing, area } : null;
            drawSceneLayer(pg, v, W, H, layerOpts);
            if (item.keyed && proc) presenter = presenterFrom(proc.process(v, { grade: item.grade, key: true }), item.look);
            if (prevSketch) drawSketch(pg, area, drawing, 1, 1);
            hasPrev = true; prevWasScene = true; prevWasBoard = false; prevWasCard = false;
            disposeStageVideo(v);
            T += played;
            // précharge la scène suivante pendant qu'on est encore là
            const nextScene = segs.slice(si + 1).find(s => s.type === 'scene');
            if (nextScene && T < maxDuration - 0.05) { try { pending = await createStageVideo(urls.get(nextScene.item)); } catch (e) { pending = null; } }
        }
    } finally {
        if (montagePause.on) { try { await actx.resume(); } catch (e) {} }
        Object.assign(montagePause, { on: false, rec: null, actx: null, resuming: null });
        if (proc) proc.dispose();
        if (pending) disposeStageVideo(pending);
        sfx.stop();
        if (musicSrc) { try { musicSrc.stop(); } catch (e) {} }
        try { if (rec && rec.state !== 'inactive') rec.stop(); } catch (e) {}
        await withTimeout(stopped, 15000, 'fin d\'enregistrement').catch(() => {});
        if (stream) stream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
        [comp, makeup, sfxBus, musicGain].forEach(n => { try { n.disconnect(); } catch (e) {} });
        urls.forEach(u => URL.revokeObjectURL(u));
    }
    if (preview) return null;
    const type = (mime || rec.mimeType || 'video/webm').split(';')[0];
    const blob = new Blob(chunks, { type });
    if (!blob.size) throw new Error('la vidéo enregistrée est vide');
    if (items.every(i => !i.audioBuffer) && !premium) showToast('Le son des scènes n\'a pas pu être récupéré : vidéo sans son', 'warn', 6000);
    if (qa) state.qaFrames = qa.frames;
    return { blob, url: URL.createObjectURL(blob), timeline, ext: type.includes('mp4') ? 'mp4' : 'webm' };
}

function updateAssembleBtn() {
    const btn = document.getElementById('assemble-btn'); if (!btn) return;
    const hasDone = state.queue.some(q => q.status === 'done');
    btn.classList.toggle('hidden', !hasDone || state.isRunning || assembling || state.regenerating);
    document.getElementById('preview-btn')?.classList.toggle('hidden', !hasDone || state.isRunning || assembling || state.regenerating);
    document.getElementById('section-editor')?.classList.toggle('hidden', !hasDone);
    const sig = state.queue.filter(q => q.status === 'done').map(q => q.sceneIndex + '@' + q.videoUrl).join('|');
    if (sig !== lastEditorSig) { lastEditorSig = sig; renderMontageEditor(); }
}
var lastEditorSig = '';
function hideResultButtons() {
    ['download-final-btn', 'download-srt-btn', 'download-scenes-btn', 'download-audio-btn', 'download-zip-btn', 'download-shorts-btn', 'download-thumbnail-btn', 'download-seo-btn', 'download-chapters-btn', 'download-quiz-btn', 'youtube-upload-btn', 'backup-final-btn', 'lang-version-row', 'section-publish', 'parts-row'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
}
function resetExportButtons() {
    state.exportCache = {};
    const labels = { 'download-youtube-fmt-btn': '⬇️ Créer la version YouTube 16:9', 'download-vertical-btn': '⬇️ Créer la version Shorts/TikTok 9:16 (entière)', 'download-square-btn': '⬇️ Créer la version carrée 1:1', 'download-shorts-btn': '⬇️ Créer la version Shorts 30 s', 'download-thumbnail-btn': '⬇️ Créer la miniature', 'download-seo-btn': '⬇️ Créer le titre + description SEO', 'download-quiz-btn': '⬇️ Créer le quiz', 'download-zip-btn': '⬇️ Créer le ZIP complet', 'download-scenes-btn': '⬇️ Enregistrer les scènes séparées' };
    Object.entries(labels).forEach(([id, t]) => { const b = document.getElementById(id); if (b) b.textContent = t; });
}
function showResultButtons() {
    resetExportButtons();
    ['download-final-btn', 'download-srt-btn', 'download-scenes-btn', 'download-chapters-btn', 'lang-version-row', 'section-publish', 'parts-row'].forEach(id => document.getElementById(id)?.classList.remove('hidden'));
    const lvb = document.getElementById('lang-version-btn'); if (lvb) lvb.textContent = '🌍 Créer la version traduite';
    state.langSrt = {}; document.getElementById('lang-yt-btn')?.classList.add('hidden');
    if (typeof renderParts === 'function') renderParts();
    if (typeof updatePublishUI === 'function') updatePublishUI();
    if (state.finalAudioBlob) document.getElementById('download-audio-btn')?.classList.remove('hidden');
    if (state.extraExports.includes('zip')) document.getElementById('download-zip-btn')?.classList.remove('hidden');
    if (state.extraExports.includes('shorts')) document.getElementById('download-shorts-btn')?.classList.remove('hidden');
    ['download-youtube-fmt-btn', 'download-vertical-btn', 'download-square-btn'].forEach(id => document.getElementById(id)?.classList.remove('hidden'));
    if (state.extraExports.includes('thumbnail')) document.getElementById('download-thumbnail-btn')?.classList.remove('hidden');
    if (state.extraExports.includes('seo')) document.getElementById('download-seo-btn')?.classList.remove('hidden');
    if (state.quizCount > 0) document.getElementById('download-quiz-btn')?.classList.remove('hidden');
    if (getLS(STORAGE.YOUTUBE_TOKEN)) document.getElementById('youtube-upload-btn')?.classList.remove('hidden');
    if (typeof onFinalReady === 'function') onFinalReady();
}

async function runAssembly() {
    if (assembling) return false;
    const standalone = !state.isRunning;
    assembling = true; updateAssembleBtn();
    if (standalone) { state.stopRequested = false; document.getElementById('stop-btn').classList.add('visible'); }
    await ensureWakeLockActive();
    if (state.drawingsPromise) { setStatus('Finalisation des dessins…'); await state.drawingsPromise; }
    try {
        // Nouvelles prises faites en arrière-plan : on les récupère d'abord
        if (typeof applyPendingRedo === 'function' && !(await applyPendingRedo())) return false;
        state.qaReport = null; document.getElementById('qa-report')?.classList.add('hidden');
        // Contrôle qualité : son (voix coupée, personnage muet) + image (personnage différent de la référence)
        let items = montageItems().filter(q => q.sceneIndex >= 0);
        await prepareAssets(items, 'Vérification');
        const visualBad = !state.autoRun && typeof checkScenesAgainstReference === 'function' ? await checkScenesAgainstReference(items) : [];
        const bad = [...new Set([...items.filter(sceneProblem), ...visualBad])].sort((a, b) => a.sceneIndex - b.sceneIndex);
        const why = b => sceneProblem(b) || b.visualProblem || 'différente';
        const badMsg = bad.length + ' scène' + (bad.length > 1 ? 's semblent ratées' : ' semble ratée') + ' (' + bad.map(b => 'scène ' + (b.sceneIndex + 1) + ' : ' + why(b)).join(', ') + ').';
        // Refait automatiquement (une seule fois par scène) les scènes ratées, avant le montage
        const redo = bad.filter(b => !b.autoRedone);
        if (redo.length && !state.autoRun && getAgnesKey() && (state.images[0] || state.photoSmall)) {
            redo.forEach(b => { b.autoRedone = true; });
            log('Scènes refaites automatiquement : ' + badMsg);
            if (canRedoInBackground()) {
                showToast('🔁 ' + badMsg + ' Nouvelles prises lancées sur ton serveur : reviens appuyer sur « Terminer » quand elles sont prêtes.', 'warn', 9000);
                await redoInBackground(redo);
                return false;
            }
            showToast('🔁 ' + badMsg + ' Je les refais automatiquement (environ ' + Math.ceil(redo.length * 1.5) + ' min, garde l\'appli ouverte).', 'warn', 8000);
            state.regenerating = true; renderQueue();
            for (let i = 0; i < redo.length; i++) {
                if (state.stopRequested) throw new Error('Arrêt demandé');
                if (i > 0) await countdown(createIntervalMs, 'Nouvelle prise ' + (i + 1) + '/' + redo.length + ' dans ');
                setStatus('Nouvelle prise de la scène ' + (redo[i].sceneIndex + 1) + '…');
                try { await regenerateScene(redo[i]); } catch (e) { log('Nouvelle prise : ' + e.message); }
            }
            state.regenerating = false; renderQueue();
        }
        const result = await assembleVideo({ label: 'Montage' });
        if (state.finalVideoUrl) URL.revokeObjectURL(state.finalVideoUrl);
        state.finalBlob = result.blob; state.finalVideoUrl = result.url; state.finalExt = result.ext; state.timeline = result.timeline; state.finalFresh = true;
        document.getElementById('final-video').src = result.url;
        document.getElementById('video-preview').classList.add('visible');
        showResultButtons();
        const bfb = document.getElementById('backup-final-btn');
        if (bfb) { bfb.textContent = '☁️ Sauvegarder la vidéo sur mon Cloudflare'; bfb.classList.toggle('hidden', !mediaAvailable()); }
        // contrôle par l'IA des images du montage (en tâche de fond : la vidéo est déjà prête)
        if (state.qaOn && getClaudeKey() && !state.autoRun && state.qaFrames?.length && typeof analyzeMontage === 'function') analyzeMontage();
        backupScenes().catch(e => log('Sauvegarde : ' + e.message));
        addToHistory({ date: Date.now(), theme: state.theme || document.getElementById('theme-input').value || 'Sans titre', script: state.script, scenes: state.queue.length, duration: formatEta(result.timeline.reduce((a, t) => a + t.duration, 0)) });
        trackAnalytics('generations');
        trackAnalytics('byStyle', state.selectedStyle);
        trackAnalytics('byLanguage', state.language);
        trackAnalytics('byTTS', state.voiceSource === 'premium' ? state.ttsEngine : 'agnes');
        if (state.isSeriesMode) addSeriesResult(state.theme || 'Épisode', result.blob, result.ext);
        showToast('Vidéo finale prête ✓', 'success', 4000);
        return true;
    } catch (e) {
        if (e.message === 'Arrêt demandé') showToast('Montage arrêté. Tu peux le relancer avec « Assembler la vidéo finale ».', 'warn', 6000);
        else showToast('Montage impossible : ' + e.message, 'error', 8000);
        log('Montage : ' + e.message);
        return false;
    } finally {
        assembling = false; state.regenerating = false;
        setStatus(null); setProgress(0); renderQueue();
        if (standalone) { document.getElementById('stop-btn').classList.remove('visible'); state.stopRequested = false; }
        updateAssembleBtn();
    }
}
