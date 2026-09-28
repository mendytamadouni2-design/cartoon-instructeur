// Cartoon Instructeur · Graphiques animés des plans illustrés (motion design) : compteur, barres, liste, comparaison,
// frise chronologique, chaîne cause → conséquence, avant / après (morphing d'icône)
// (scripts classiques chargés dans l'ordre par index.html : ils partagent les mêmes variables globales)
//
// Règles appliquées partout (voir js/motion.js) : aucune vitesse constante, entrées sur 3 propriétés à la fois,
// décalages entre éléments, ressorts pour les « pop », sorties plus courtes que les entrées, élément courant mis en
// avant (principe de signalisation de Mayer), petite respiration des éléments au repos.

const GR_INK = '#1f1f1f', GR_SOFT = '#8fb3e8', GR_BLUE = '#4a7fd6', GR_MUTED = '#9a9a9a';

// ─────────────── Icônes : forme prête à dessiner (Path2D + longueur de chaque trait) ───────────────
const iconShapeCache = new Map();
function iconShape(name, paths) {
    if (iconShapeCache.has(name)) return iconShapeCache.get(name);
    const parts = [];
    for (const d of paths || []) {
        for (const sp of normalizePath(d)) {
            const pts = flattenSegs(sp.segs);
            let len = 0;
            for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
            if (len > 0.01) { try { parts.push({ p2d: new Path2D(segsToD(sp.segs)), len }); } catch (e) {} }
        }
    }
    const shape = parts.length ? { name, paths, parts, total: parts.reduce((a, b) => a + b.len, 0) } : null;
    iconShapeCache.set(name, shape);
    return shape;
}
const iconLookupCache = new Map(), morphCache = new Map();
function resolveIcon(keywords) {
    const key = String(keywords || '').trim().toLowerCase();
    if (!key) return null;
    if (iconLookupCache.has(key)) return iconLookupCache.get(key);
    const hit = typeof findIcon === 'function' ? findIcon(key.split(/\s*[,;|]\s*/)) : null;
    const shape = hit ? iconShape(hit.name, hit.paths) : null;
    if (ICONS) iconLookupCache.set(key, shape);   // on ne mémorise qu'une fois la bibliothèque chargée
    return shape;
}
// Dessine une icône (grille 24) centrée en (cx, cy), taille en pixels ; prog = part tracée (0 à 1, effet feutre)
function drawIcon(ctx, shape, cx, cy, size, prog = 1, { color = GR_INK, width = 2, alpha = 1 } = {}) {
    if (!shape || prog <= 0 || alpha <= 0) return;
    const s = size / 24;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(cx - size / 2, cy - size / 2); ctx.scale(s, s);
    ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = color;
    let remaining = shape.total * clamp01m(prog);
    for (const part of shape.parts) {
        if (remaining <= 0) break;
        const f = Math.min(1, remaining / part.len);
        remaining -= part.len;
        if (f >= 1) { ctx.setLineDash([]); ctx.stroke(part.p2d); }
        else { ctx.setLineDash([part.len * f, part.len + 1]); ctx.stroke(part.p2d); ctx.setLineDash([]); }
    }
    ctx.restore();
}

// ─────────────── Outils de mise en page du texte ───────────────
function fitFont(ctx, text, weight, family, maxW, start, min = 12) {
    let fs = Math.round(start);
    ctx.font = weight + ' ' + fs + 'px ' + family;
    while (ctx.measureText(text).width > maxW && fs > min) { fs -= 1; ctx.font = weight + ' ' + fs + 'px ' + family; }
    return fs;
}
function wrap2(ctx, text, maxW) { const l = wrapLines(ctx, String(text || ''), maxW); return l.length > 2 ? [l[0], l.slice(1).join(' ')] : l; }
// Nombre : entier pour les grands nombres, une décimale sinon ; années sans séparateur de milliers
const fmtNum = (v, final) => (Math.abs(final ?? v) >= 20 || Number.isInteger(final ?? v) ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString('fr-FR');
const fmtYear = v => String(Math.round(v));
const looksLikeYear = v => Number.isInteger(v) && v >= -3000 && v <= 2200 && Math.abs(v) >= 100;

// ─────────────── Point d'entrée ───────────────
function drawGraphic(ctx, area, gr, t, dur) {
    const max = gr.type === 'timeline' ? 6 : 5;
    const items = (gr.items || []).slice(0, max);
    if (!items.length) return;
    const e = {
        ctx, area, t, dur, items, gr,
        unit: gr.unit ? ' ' + gr.unit : '', acc: accentColor(), base: Math.min(area.w, area.h),
        // les éléments s'enchaînent sur les 70 % du plan (le dernier reste lisible au moins 1 s)
        span: Math.max(0.8, Math.min(dur * 0.7, dur - 1.2) - 0.3),
        wide: area.w >= area.h * 1.05
    };
    ctx.save(); ctx.textBaseline = 'middle';
    (GRAPHICS[gr.type] || (() => {}))(e);
    ctx.restore();
}
const atOf = (e, i) => 0.3 + e.span * i / Math.max(1, e.items.length);

const GRAPHICS = {
    // ── Compteur : le chiffre défile (freinage exponentiel), rebondit en arrivant, puis respire
    counter(e) {
        const { ctx, area, t, items, unit, acc, base } = e, it = items[0], ic = resolveIcon(it.icon);
        const cx = area.x + area.w / 2, numY = area.y + area.h * (ic ? 0.52 : 0.42);
        if (ic) drawIcon(ctx, ic, cx, area.y + area.h * 0.2, base * 0.28, clamp01m((t - 0.05) / 0.8), { color: GR_INK, width: 1.8 });
        const p = EASE.outExpo(clamp01m((t - 0.3) / 1.6));
        const final = fmtNum(it.value || 0, it.value) + unit, txt = fmtNum((it.value || 0) * p, it.value) + unit;
        const fs = fitFont(ctx, final, '900', UI_FONT, area.w * 0.92, base * (ic ? 0.26 : 0.34), 20);
        const pop = spring(t - 0.3, SPRINGS.bouncy), sc = (0.55 + 0.45 * pop) * (1 + (t > 2 ? 0.012 * breathe(t, { period: 2.6 }) : 0));
        ctx.save();
        ctx.globalAlpha = clamp01m((t - 0.3) / 0.2);
        ctx.translate(cx, numY); ctx.scale(sc, sc);
        ctx.font = '900 ' + fs + 'px ' + UI_FONT; ctx.textAlign = 'center';
        ctx.lineWidth = Math.max(2, fs * 0.07); ctx.strokeStyle = GR_INK; ctx.lineJoin = 'round';
        ctx.strokeText(txt, 0, 0); ctx.fillStyle = acc; ctx.fillText(txt, 0, 0);
        ctx.restore();
        const lfs = fitFont(ctx, it.label || '', '700', UI_FONT, area.w * 0.92, fs * 0.3, 12);
        drawTextReveal(ctx, it.label || '', cx, numY + fs * 0.72 + lfs * 0.2, t - 1.1, { font: '700 ' + lfs + 'px ' + UI_FONT, color: GR_INK });
    },

    // ── Barres : étiquette au-dessus, barre qui pousse sur un ressort (léger dépassement), valeur qui compte
    bars(e) {
        const { ctx, area, t, items, unit, acc, base } = e, n = items.length;
        const rowH = Math.min(area.h / n, base * 0.5);
        let fs = Math.max(14, Math.min(rowH * 0.24, area.w * 0.07)), valW;
        for (;;) {
            ctx.font = '800 ' + Math.round(fs) + 'px ' + UI_FONT;
            valW = Math.max(...items.map(i => ctx.measureText(fmtNum(i.value, i.value) + unit).width)) + fs * 0.5;
            if (valW <= area.w * 0.55 || fs <= 12) break;
            fs -= 1;
        }
        const top = area.y + (area.h - rowH * n) / 2, max = Math.max(...items.map(i => Math.abs(i.value) || 0), 1e-6);
        const big = items.reduce((a, b) => (Math.abs(b.value) > Math.abs(a.value) ? b : a));
        const allDone = t > atOf(e, n - 1) + 1.2;
        items.forEach((it, k) => {
            const at = 0.25 + k * Math.min(0.35, e.span / n), y0 = top + rowH * k, ic = resolveIcon(it.icon);
            const icS = ic ? fs * 1.25 : 0, lx = area.x + (ic ? icS + fs * 0.35 : 0);
            if (ic) drawIcon(ctx, ic, area.x + icS / 2, y0 + rowH * 0.28, icS, clamp01m((t - at) / 0.5), { width: 2 });
            drawTextWipe(ctx, wrapLines(ctx, it.label, area.w - (lx - area.x))[0] || '', lx, y0 + rowH * 0.28, (t - at) / 0.4, { font: '700 ' + Math.round(fs) + 'px ' + UI_FONT, color: GR_INK, align: 'left' });
            const g = t - at - 0.15, grow = g > 0 ? spring(g, SPRINGS.smooth) : 0, count = EASE.outCubic(clamp01m(g / 1.0));
            const bh = Math.min(rowH * 0.36, fs * 1.5), by = y0 + rowH * 0.64, barMax = Math.max(area.w * 0.2, area.w - valW);
            const bw = Math.max(grow > 0 ? bh * 0.4 : 0, barMax * (Math.abs(it.value) / max) * grow);
            if (bw <= 0) return;
            ctx.save();
            if (it === big && allDone) { ctx.shadowColor = acc; ctx.shadowBlur = fs * (0.6 + 0.4 * breathe(t, { period: 1.8 })); }
            ctx.fillStyle = it === big ? acc : GR_SOFT;
            roundRectPath(ctx, area.x, by - bh / 2, bw, bh, bh * 0.25); ctx.fill();
            ctx.restore();
            ctx.globalAlpha = clamp01m(g / 0.25);
            ctx.fillStyle = GR_INK; ctx.textAlign = 'left'; ctx.font = '800 ' + Math.round(fs) + 'px ' + UI_FONT;
            ctx.fillText(fmtNum(it.value * count, it.value) + unit, area.x + bw + fs * 0.4, by);
            ctx.globalAlpha = 1;
        });
    },

    // ── Liste : chaque ligne entre (fondu + montée + échelle) au moment où on en parle ; la ligne courante est mise en avant
    list(e) {
        const { ctx, area, t, items, acc, base } = e, n = items.length;
        const rowH = Math.min(area.h / n, base * 0.32);
        let fs = Math.max(14, Math.min(rowH * 0.46, area.h * 0.13, area.w * 0.075));
        for (;;) {
            ctx.font = '700 ' + Math.round(fs) + 'px ' + UI_FONT;
            const fits = items.every(i => { const l = wrapLines(ctx, i.label || '', area.w - fs * 2.6); return l.length <= 2 && (l.length === 1 || fs * 2.3 <= rowH); });
            if (fits || fs <= 12) break;
            fs -= 1;
        }
        const top = area.y + (area.h - rowH * n) / 2;
        let current = -1;
        items.forEach((_, k) => { if (t >= atOf(e, k)) current = k; });
        items.forEach((it, k) => {
            const at = atOf(e, k), st = enterState(t, { delay: at, rise: fs * 0.7, scaleFrom: 0.92, spring: SPRINGS.natural });
            if (st.alpha <= 0) return;
            const y = top + rowH * (k + 0.5), bx = area.x + fs * 0.95, ic = resolveIcon(it.icon);
            ctx.save();
            // lignes passées un peu estompées : l'œil suit la ligne en cours
            const dim = k < current ? 0.55 + 0.45 * (1 - clamp01m((t - atOf(e, k + 1)) / 0.4)) : 1;
            applyState(ctx, { ...st, alpha: st.alpha * dim }, area.x, y);
            const pop = spring(t - at, SPRINGS.bouncy), r = fs * 0.62 * Math.max(0, pop);
            ctx.fillStyle = k === current ? acc : GR_SOFT; ctx.beginPath(); ctx.arc(bx, y, Math.max(0, r), 0, Math.PI * 2); ctx.fill();
            if (ic) drawIcon(ctx, ic, bx, y, fs * 0.9, clamp01m((t - at - 0.1) / 0.45), { color: GR_INK, width: 2.2 });
            else {   // coche tracée au feutre
                const cp = EASE.outCubic(clamp01m((t - at - 0.12) / 0.3));
                ctx.strokeStyle = GR_INK; ctx.lineWidth = fs * 0.13; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                const pts = [[bx - fs * 0.26, y], [bx - fs * 0.06, y + fs * 0.2], [bx + fs * 0.28, y - fs * 0.22]], l1 = Math.hypot(fs * 0.2, fs * 0.2), l2 = Math.hypot(fs * 0.34, fs * 0.42), L = (l1 + l2) * cp;
                ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
                if (L <= l1) ctx.lineTo(pts[0][0] + (pts[1][0] - pts[0][0]) * L / l1, pts[0][1] + (pts[1][1] - pts[0][1]) * L / l1);
                else { ctx.lineTo(pts[1][0], pts[1][1]); const f = (L - l1) / l2; ctx.lineTo(pts[1][0] + (pts[2][0] - pts[1][0]) * f, pts[1][1] + (pts[2][1] - pts[1][1]) * f); }
                ctx.stroke();
            }
            ctx.fillStyle = GR_INK; ctx.textAlign = 'left'; ctx.font = (k === current ? '800 ' : '700 ') + Math.round(fs) + 'px ' + UI_FONT;
            const ls = wrap2(ctx, it.label, area.w - fs * 2.6);
            ls.forEach((l, j) => ctx.fillText(l, area.x + fs * 2.05, y + (j - (ls.length - 1) / 2) * fs * 1.15));
            ctx.restore();
        });
    },

    // ── Comparaison : deux colonnes, valeurs qui comptent, « VS » qui tombe en tournant ; la plus grande valeur en couleur
    compare(e) {
        const { ctx, area, t, items, unit, acc, base } = e, two = items.slice(0, 2);
        const bigger = Math.abs(two[1].value) >= Math.abs(two[0].value) ? 1 : 0;
        two.forEach((it, k) => {
            const at = 0.25 + k * 0.5, ic = resolveIcon(it.icon);
            // paysage : deux colonnes ; vertical : deux blocs l'un sous l'autre
            const box = e.wide ? { x: area.x + area.w * (k ? 0.54 : 0.02), y: area.y, w: area.w * 0.44, h: area.h } : { x: area.x, y: area.y + area.h * (k ? 0.56 : 0), w: area.w, h: area.h * 0.44 };
            const cx = box.x + box.w / 2, colW = box.w;
            const st = enterState(t, { delay: at, rise: base * 0.05, scaleFrom: 0.9 });
            if (st.alpha <= 0) return;
            ctx.save(); applyState(ctx, st, cx, box.y + box.h * 0.5);
            let y = box.y + box.h * 0.12;
            if (ic) { const isz = Math.min(box.h * 0.32, colW * 0.4); drawIcon(ctx, ic, cx, y + isz * 0.35, isz, clamp01m((t - at) / 0.6), { width: 1.8 }); y += isz * 0.95; }
            const hasVal = it.value !== 0 || two.some(x => x.value !== 0);
            if (hasVal) {
                const p = EASE.outExpo(clamp01m((t - at - 0.1) / 1.2)), final = fmtNum(it.value, it.value) + unit;
                const fs = fitFont(ctx, final, '900', UI_FONT, colW * 0.95, Math.min(box.h * (ic ? 0.3 : 0.4), base * 0.22), 14);
                ctx.textAlign = 'center'; ctx.fillStyle = k === bigger ? acc : GR_BLUE; ctx.font = '900 ' + fs + 'px ' + UI_FONT;
                ctx.lineWidth = Math.max(2, fs * 0.06); ctx.strokeStyle = GR_INK; ctx.lineJoin = 'round';
                const txt = fmtNum(it.value * p, it.value) + unit;
                if (k === bigger) ctx.strokeText(txt, cx, y + fs * 0.4);
                ctx.fillText(txt, cx, y + fs * 0.4); y += fs * 1.05;
            }
            const lfs = fitFont(ctx, it.label || '', '700', UI_FONT, colW * 0.95, Math.min(box.h * 0.13, base * 0.08), 12);
            ctx.font = '700 ' + lfs + 'px ' + UI_FONT; ctx.fillStyle = GR_INK; ctx.textAlign = 'center';
            wrap2(ctx, it.label, colW * 0.95).forEach((l, j) => ctx.fillText(l, cx, y + lfs * (0.7 + j * 1.2)));
            ctx.restore();
        });
        // « VS » : tombe en tournant, rebondit
        const vp = spring(t - 0.6, SPRINGS.bouncy);
        if (vp > 0) {
            const vx = area.x + area.w / 2, vy = e.wide ? area.y + area.h * 0.45 : area.y + area.h * 0.5, r = base * 0.085;
            ctx.save(); ctx.translate(vx, vy); ctx.rotate((1 - vp) * -0.6); ctx.scale(vp, vp);
            ctx.fillStyle = GR_INK; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.font = '900 ' + Math.round(r * 0.9) + 'px ' + UI_FONT; ctx.textAlign = 'center'; ctx.fillText('VS', 0, r * 0.05);
            ctx.restore();
        }
    },

    // ── Frise chronologique : l'axe se trace, chaque date « tombe » dessus au moment où on en parle
    timeline(e) {
        const { ctx, area, t, items, acc, base, wide } = e, n = items.length;
        const lineP = EASE.standard(clamp01m((t - 0.1) / 0.7));
        let current = -1; items.forEach((_, k) => { if (t >= atOf(e, k)) current = k; });
        const dateOf = it => looksLikeYear(it.value) ? fmtYear(it.value) : it.value ? fmtNum(it.value, it.value) : '';
        ctx.strokeStyle = GR_INK; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(3, base * 0.012);
        if (wide) {
            const y = area.y + area.h * 0.55, x0 = area.x + area.w * 0.02, x1 = area.x + area.w * 0.98, H = area.h;
            ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + (x1 - x0) * lineP, y); ctx.stroke();
            if (lineP > 0.98) { ctx.beginPath(); ctx.moveTo(x1 - base * 0.03, y - base * 0.025); ctx.lineTo(x1, y); ctx.lineTo(x1 - base * 0.03, y + base * 0.025); ctx.stroke(); }
            const step = (x1 - x0) / n, colW = step * 0.94;
            items.forEach((it, k) => {
                const at = atOf(e, k), x = x0 + step * (k + 0.5);
                if (t < at) return;
                timelineDot(ctx, x, y, Math.max(5, H * 0.04), t - at, k === current, acc);
                const date = dateOf(it), dfs = fitFont(ctx, date || '•', '900', UI_FONT, colW * 0.95, Math.min(H * 0.15, colW * 0.3), 12);
                if (date) drawTextReveal(ctx, date, x, y - H * 0.16, t - at - 0.05, { font: '900 ' + dfs + 'px ' + UI_FONT, color: k === current ? GR_INK : '#444' });
                const ic = resolveIcon(it.icon);
                if (ic) drawIcon(ctx, ic, x, y - H * 0.16 - dfs * 0.6 - H * 0.14, Math.min(H * 0.24, colW * 0.4), clamp01m((t - at) / 0.5), { width: 1.9 });
                const lfs = Math.max(12, Math.min(H * 0.085, colW * 0.14));
                ctx.font = '700 ' + lfs + 'px ' + UI_FONT;
                wrap2(ctx, it.label, colW).forEach((l, j) => drawTextWipe(ctx, l, x, y + H * 0.12 + j * lfs * 1.2, (t - at - 0.15 - j * 0.1) / 0.4, { font: '700 ' + lfs + 'px ' + UI_FONT, color: GR_INK }));
            });
        } else {   // vertical (format portrait)
            const x = area.x + area.w * 0.12, y0 = area.y + area.h * 0.03, y1 = area.y + area.h * 0.97;
            ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + (y1 - y0) * lineP); ctx.stroke();
            const step = (y1 - y0) / n;
            items.forEach((it, k) => {
                const at = atOf(e, k), y = y0 + step * (k + 0.5);
                if (t < at) return;
                timelineDot(ctx, x, y, base * 0.035, t - at, k === current, acc);
                const date = dateOf(it), tx = x + base * 0.09, maxW = area.x + area.w - tx;
                const dfs = fitFont(ctx, date || '', '900', UI_FONT, maxW, Math.min(step * 0.34, base * 0.09), 12);
                if (date) drawTextReveal(ctx, date, tx, y - dfs * 0.45, t - at - 0.05, { font: '900 ' + dfs + 'px ' + UI_FONT, color: GR_INK, align: 'left' });
                const lfs = fitFont(ctx, it.label || '', '700', UI_FONT, maxW, Math.min(step * 0.24, base * 0.065), 12);
                drawTextWipe(ctx, wrapLines(ctx, it.label, maxW)[0] || '', tx, y + (date ? dfs * 0.55 : 0), (t - at - 0.15) / 0.4, { font: '700 ' + lfs + 'px ' + UI_FONT, color: GR_INK, align: 'left' });
            });
        }
    },

    // ── Chaîne cause → conséquence : chaque étape (icône dans un rond) entre sur un ressort, la flèche suivante se trace
    chain(e) {
        const { ctx, area, t, items, acc, base, wide } = e, n = Math.min(4, items.length);
        let current = -1; items.slice(0, n).forEach((_, k) => { if (t >= atOf(e, k)) current = k; });
        const pos = k => wide ? { x: area.x + area.w * (k + 0.5) / n, y: area.y + area.h * 0.4 } : { x: area.x + area.w * 0.5, y: area.y + area.h * (k + 0.5) / n - area.h * 0.04 };
        const r = wide ? Math.min(area.w / n * 0.24, area.h * 0.24) : Math.min(area.h / n * 0.3, area.w * 0.2);
        for (let k = 0; k < n; k++) {
            const it = items[k], at = atOf(e, k), p = pos(k);
            if (t < at) continue;
            // flèche depuis l'étape précédente
            if (k > 0) {
                const a = pos(k - 1), ap = EASE.standard(clamp01m((t - at + 0.05) / 0.35));
                const sx = wide ? a.x + r * 1.25 : a.x, sy = wide ? a.y : a.y + r * 1.25 + base * 0.06, ex = wide ? p.x - r * 1.25 : p.x, ey = wide ? p.y : p.y - r * 1.25;
                const cx2 = sx + (ex - sx) * ap, cy2 = sy + (ey - sy) * ap;
                ctx.strokeStyle = GR_INK; ctx.lineWidth = Math.max(3, base * 0.012); ctx.lineCap = 'round';
                ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(cx2, cy2); ctx.stroke();
                if (ap > 0.95) { const ang = Math.atan2(ey - sy, ex - sx), h = base * 0.03; ctx.beginPath(); ctx.moveTo(ex - h * Math.cos(ang - 0.5), ey - h * Math.sin(ang - 0.5)); ctx.lineTo(ex, ey); ctx.lineTo(ex - h * Math.cos(ang + 0.5), ey - h * Math.sin(ang + 0.5)); ctx.stroke(); }
            }
            const lt = t - at - 0.2, sc = Math.max(0, spring(lt, SPRINGS.bouncy));
            if (sc <= 0) continue;
            ctx.save(); ctx.translate(p.x, p.y); ctx.scale(sc * (k === current ? 1 + 0.02 * breathe(t, { period: 1.6 }) : 1), sc);
            ctx.fillStyle = k === current ? acc : '#fff'; ctx.strokeStyle = GR_INK; ctx.lineWidth = Math.max(3, base * 0.01);
            ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            const ic = resolveIcon(it.icon);
            if (ic) drawIcon(ctx, ic, 0, 0, r * 1.15, clamp01m(lt / 0.5), { width: 2 });
            else { ctx.fillStyle = GR_INK; ctx.font = '900 ' + Math.round(r * 0.9) + 'px ' + UI_FONT; ctx.textAlign = 'center'; ctx.fillText(String(k + 1), 0, r * 0.05); }
            ctx.restore();
            const colW = wide ? area.w / n * 0.95 : area.w * 0.9, lfs = fitFont(ctx, it.label || '', '800', UI_FONT, colW, wide ? Math.min(area.h * 0.09, colW * 0.14) : r * 0.5, 12);
            if (wide) wrap2(ctx, it.label, colW).forEach((l, j) => drawTextWipe(ctx, l, p.x, p.y + r * 1.45 + j * lfs * 1.2, (lt - 0.1 - j * 0.1) / 0.4, { font: '800 ' + lfs + 'px ' + UI_FONT, color: GR_INK }));
            else drawTextWipe(ctx, wrapLines(ctx, it.label, colW)[0] || '', p.x, p.y + r * 1.4, (lt - 0.1) / 0.4, { font: '800 ' + lfs + 'px ' + UI_FONT, color: GR_INK });
        }
    },

    // ── Avant / après : l'icône « avant » se dessine, puis se transforme (morphing) en icône « après »
    beforeafter(e) {
        const { ctx, area, t, dur, items, acc, base } = e, a = items[0], b = items[1] || items[0];
        const ia = resolveIcon(a.icon), ib = resolveIcon(b.icon);
        const cx = area.x + area.w / 2, cy = area.y + area.h * 0.47, size = Math.min(area.h * 0.52, area.w * 0.45);
        const tm = Math.max(1.4, Math.min(dur * 0.45, dur - 1.6)), mp = clamp01m((t - tm) / 0.9);
        // étiquette « Avant » / « Après » (pastille qui change)
        const tag = mp < 0.5 ? 'Avant' : 'Après', tfs = Math.round(Math.max(12, area.h * 0.075));
        ctx.font = '800 ' + tfs + 'px ' + UI_FONT;
        const tw = ctx.measureText(tag).width + tfs * 1.2, tp = spring(t - 0.1, SPRINGS.snappy) * (1 - 0.25 * Math.sin(mp * Math.PI));
        ctx.save(); ctx.translate(cx, area.y + tfs * 0.9); ctx.scale(tp, tp);
        ctx.fillStyle = mp < 0.5 ? GR_MUTED : acc; roundRectPath(ctx, -tw / 2, -tfs * 0.75, tw, tfs * 1.5, tfs * 0.75); ctx.fill();
        ctx.fillStyle = mp < 0.5 ? '#fff' : GR_INK; ctx.textAlign = 'center'; ctx.fillText(tag, 0, 0);
        ctx.restore();
        if (ia && ib) {
            if (mp <= 0) drawIcon(ctx, ia, cx, cy, size, clamp01m((t - 0.2) / 0.9), { width: 1.6 });
            else {
                const mk = ia.name + '>' + ib.name;
                if (!morphCache.has(mk)) morphCache.set(mk, buildMorph(ia.paths, ib.paths, 72));
                const s = size / 24;
                ctx.save(); ctx.translate(cx - size / 2, cy - size / 2); ctx.scale(s, s);
                ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = GR_INK;
                drawMorph(ctx, morphCache.get(mk), mp);
                ctx.restore();
            }
        } else {   // sans icônes : deux cartes et une flèche
            [a, b].forEach((it, k) => {
                const at = k ? tm : 0.2, st = enterState(t, { delay: at, rise: base * 0.04 });
                if (st.alpha <= 0) return;
                const x = area.x + area.w * (k ? 0.75 : 0.25);
                ctx.save(); applyState(ctx, st, x, cy);
                ctx.fillStyle = k ? acc : '#eef2f8'; roundRectPath(ctx, x - area.w * 0.2, cy - size * 0.35, area.w * 0.4, size * 0.7, base * 0.03); ctx.fill();
                ctx.restore();
            });
        }
        // libellés : l'ancien sort vite, le nouveau entre par un masque
        const lfs = fitFont(ctx, (mp < 0.5 ? a.label : b.label) || '', '800', UI_FONT, area.w * 0.9, Math.max(14, area.h * 0.1), 12), ly = Math.min(area.y + area.h - lfs * 0.6, cy + size * 0.62);
        if (mp < 0.5) {
            const ex = exitState(t, { at: tm, dur: 0.25 });
            ctx.save(); ctx.globalAlpha = ex.alpha;
            drawTextReveal(ctx, a.label, cx, ly + ex.dy, t - 0.5, { font: '800 ' + lfs + 'px ' + UI_FONT, color: GR_INK });
            ctx.restore();
        } else drawTextReveal(ctx, b.label, cx, ly, t - tm - 0.45, { font: '800 ' + lfs + 'px ' + UI_FONT, color: GR_INK });
    }
};
// Point d'une frise : tombe sur un ressort, anneau qui s'élargit quand c'est la date en cours
function timelineDot(ctx, x, y, r, lt, current, acc) {
    const sc = Math.max(0, spring(lt, SPRINGS.bouncy));
    ctx.save();
    if (current) {
        const ring = (lt % 1.6) / 1.6;
        ctx.globalAlpha = 0.5 * (1 - ring); ctx.strokeStyle = acc; ctx.lineWidth = r * 0.35;
        ctx.beginPath(); ctx.arc(x, y, r * (1.2 + ring * 1.4), 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    }
    ctx.translate(x, y); ctx.scale(sc * (current ? 1.25 : 1), sc * (current ? 1.25 : 1));
    ctx.fillStyle = current ? acc : '#fff'; ctx.strokeStyle = GR_INK; ctx.lineWidth = r * 0.35;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
}
