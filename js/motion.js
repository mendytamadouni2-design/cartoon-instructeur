// Cartoon Instructeur · Moteur de motion design : courbes de vitesse, ressorts, chorégraphie, texte, tracés SVG, icônes
// (scripts classiques chargés dans l'ordre par index.html : ils partagent les mêmes variables globales)
//
// Principe : une image de la vidéo est une fonction du temps. Chaque élément calcule son état (opacité, position,
// échelle, flou) à l'instant t à partir de ces primitives, sans état caché : le rendu est identique quelle que soit
// la cadence, et peut être recalculé image par image (export WebCodecs) ou en temps réel (MediaRecorder).

// ══════════════════════════════════════════════════════════════════
// COURBES DE VITESSE (easing)
// ══════════════════════════════════════════════════════════════════
// Bézier cubique CSS (x1, y1, x2, y2) : même algorithme que les navigateurs (Newton-Raphson puis dichotomie).
function cubicBezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = t => ((ax * t + bx) * t + cx) * t, sy = t => ((ay * t + by) * t + cy) * t, dx = t => (3 * ax * t + 2 * bx) * t + cx;
    const solve = x => {
        let t = x;
        for (let i = 0; i < 8; i++) { const e = sx(t) - x; if (Math.abs(e) < 1e-6) return t; const d = dx(t); if (Math.abs(d) < 1e-6) break; t -= e / d; }
        let lo = 0, hi = 1; t = x;
        for (let i = 0; i < 30 && hi - lo > 1e-6; i++) { if (sx(t) < x) lo = t; else hi = t; t = (lo + hi) / 2; }
        return t;
    };
    return x => x <= 0 ? 0 : x >= 1 ? 1 : sy(solve(x));
}
// Équations de Robert Penner (t de 0 à 1)
const EASE = {
    linear: t => t,
    inQuad: t => t * t, outQuad: t => t * (2 - t), inOutQuad: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
    inCubic: t => t * t * t, outCubic: t => 1 - Math.pow(1 - t, 3), inOutCubic: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    outQuart: t => 1 - Math.pow(1 - t, 4), outQuint: t => 1 - Math.pow(1 - t, 5),
    inExpo: t => t === 0 ? 0 : Math.pow(2, 10 * t - 10), outExpo: t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
    inOutExpo: t => t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
    outCirc: t => Math.sqrt(1 - Math.pow(t - 1, 2)),
    outBack: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    inBack: t => { const c1 = 1.70158; return (c1 + 1) * t * t * t - c1 * t * t; },
    outElastic: t => t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1,
    outBounce: t => { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375; return n * (t -= 2.625 / d) * t + 0.984375; },
    // courbes « maison » des grands systèmes de design
    standard: cubicBezier(0.2, 0, 0, 1),        // Material 3 : entrées et déplacements
    emphasized: cubicBezier(0.05, 0.7, 0.1, 1), // arrivée franche puis long freinage
    ios: cubicBezier(0.32, 0.72, 0, 1),         // feuilles iOS
    exit: cubicBezier(0.3, 0, 1, 1)             // sorties : accélèrent et partent
};
const clamp01m = x => x < 0 ? 0 : x > 1 ? 1 : x;
const easeBy = e => typeof e === 'function' ? e : (EASE[e] || EASE.standard);

// Remappe x de [in0, in1, …] vers [out0, out1, …] (plusieurs segments, bornes serrées par défaut)
function interpolate(x, input, output, { easing = 'linear', clamp = true } = {}) {
    const ez = easeBy(easing);
    if (x <= input[0]) return clamp ? output[0] : output[0] + (x - input[0]) * (output[1] - output[0]) / (input[1] - input[0]);
    const n = input.length - 1;
    if (x >= input[n]) return clamp ? output[n] : output[n] + (x - input[n]) * (output[n] - output[n - 1]) / (input[n] - input[n - 1]);
    let i = 0; while (i < n - 1 && x > input[i + 1]) i++;
    const p = ez((x - input[i]) / (input[i + 1] - input[i]));
    return output[i] + (output[i + 1] - output[i]) * p;
}

// ══════════════════════════════════════════════════════════════════
// RESSORTS (oscillateur amorti, solution exacte : pas d'intégration, même valeur à n'importe quel t)
// m·x'' + c·x' + k·x = 0 ; valeurs par défaut de Remotion (m = 1, c = 10, k = 100)
// ══════════════════════════════════════════════════════════════════
const SPRINGS = {
    snappy: { stiffness: 200, damping: 12, mass: 0.5 },  // mots, pastilles
    natural: { stiffness: 100, damping: 15, mass: 1 },   // entrée standard
    smooth: { stiffness: 80, damping: 15, mass: 1 },     // barres, cartes
    gentle: { stiffness: 100, damping: 20, mass: 1 },    // transitions discrètes
    bouncy: { stiffness: 180, damping: 9, mass: 0.8 }    // accents joueurs
};
// Progression 0 → 1 (peut dépasser 1 : c'est le rebond) au temps t (secondes)
function spring(t, cfg = SPRINGS.natural) {
    if (t <= 0) return 0;
    const { stiffness: k, damping: c, mass: m = 1, velocity: v0 = 0 } = typeof cfg === 'string' ? SPRINGS[cfg] || SPRINGS.natural : cfg;
    const w0 = Math.sqrt(k / m), zeta = c / (2 * Math.sqrt(k * m)), x0 = -1;   // écart initial à la cible
    let x;
    if (zeta < 1) {        // sous-amorti : oscille en se calmant
        const wd = w0 * Math.sqrt(1 - zeta * zeta);
        x = Math.exp(-zeta * w0 * t) * (x0 * Math.cos(wd * t) + ((v0 + zeta * w0 * x0) / wd) * Math.sin(wd * t));
    } else if (zeta === 1) {   // critique : le plus rapide sans dépasser
        x = Math.exp(-w0 * t) * (x0 + (v0 + w0 * x0) * t);
    } else {               // sur-amorti : lent et sans rebond
        const r1 = -w0 * (zeta - Math.sqrt(zeta * zeta - 1)), r2 = -w0 * (zeta + Math.sqrt(zeta * zeta - 1));
        const b = (v0 - r1 * x0) / (r2 - r1), a = x0 - b;
        x = a * Math.exp(r1 * t) + b * Math.exp(r2 * t);
    }
    return 1 + x;
}
// Durée au bout de laquelle le ressort reste à moins de 0,5 % de sa cible
function springSettle(cfg = SPRINGS.natural) {
    for (let t = 0.05; t < 6; t += 0.02) {
        let ok = true;
        for (let u = t; u < t + 0.5; u += 0.05) if (Math.abs(spring(u, cfg) - 1) > 0.005) { ok = false; break; }
        if (ok) return t;
    }
    return 6;
}

// ══════════════════════════════════════════════════════════════════
// CHORÉGRAPHIE
// ══════════════════════════════════════════════════════════════════
// Décalage de départ de l'élément i sur n (0,3 à 0,5 s entre deux éléments est la norme des studios)
function stagger(i, n, { each = 0.12, from = 'start', total = null } = {}) {
    const step = total !== null && n > 1 ? total / (n - 1) : each;
    const origin = from === 'center' ? (n - 1) / 2 : from === 'end' ? n - 1 : 0;
    return Math.abs(i - origin) * step;
}
// État d'une entrée « pro » : 3 propriétés à la fois (opacité, montée, échelle) + léger flou qui se dissipe
function enterState(t, { delay = 0, rise = 18, scaleFrom = 0.9, spring: sp = 'natural', blur = 0 } = {}) {
    const lt = t - delay;
    if (lt <= 0) return { alpha: 0, dy: rise, scale: scaleFrom, blur, p: 0 };
    const p = spring(lt, sp), a = clamp01m(lt / 0.22);
    return { alpha: a, dy: rise * (1 - p), scale: scaleFrom + (1 - scaleFrom) * p, blur: blur * (1 - clamp01m(lt / 0.3)), p };
}
// Sortie : plus courte et plus discrète que l'entrée
function exitState(t, { at, dur = 0.22, drop = 8 } = {}) {
    if (at === undefined || t < at) return { alpha: 1, dy: 0, scale: 1 };
    const p = EASE.exit(clamp01m((t - at) / dur));
    return { alpha: 1 - p, dy: -drop * p, scale: 1 - 0.04 * p };
}
// Micro-mouvement au repos : un élément immobile « respire »
function breathe(t, { amp = 1, period = 3.2, phase = 0 } = {}) { return Math.sin((t / period + phase) * Math.PI * 2) * amp; }
// Applique un état au contexte autour d'un pivot (cx, cy). À appeler entre save() et restore().
let canvasFilterOk = null;
function applyState(ctx, s, cx, cy) {
    ctx.globalAlpha *= clamp01m(s.alpha);
    ctx.translate(cx, cy + (s.dy || 0) + (s.breath || 0)); ctx.scale(s.scale || 1, s.scale || 1); ctx.translate(-cx, -cy);
    if (s.blur > 0.3) {
        if (canvasFilterOk === null) { try { const c = document.createElement('canvas').getContext('2d'); c.filter = 'blur(2px)'; canvasFilterOk = c.filter === 'blur(2px)'; } catch (e) { canvasFilterOk = false; } }
        if (canvasFilterOk) ctx.filter = 'blur(' + s.blur.toFixed(1) + 'px)';
    }
}

// ══════════════════════════════════════════════════════════════════
// TEXTE : révélation par masque (le texte ne bouge pas, c'est le cache qui glisse), mot par mot
// ══════════════════════════════════════════════════════════════════
function drawTextReveal(ctx, text, x, y, t, { font, color = '#1f1f1f', align = 'center', each = 0.07, dur = 0.38, rise = 0.35, stroke = null, strokeWidth = 0 } = {}) {
    if (!text) return;
    ctx.save();
    ctx.font = font; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const words = String(text).split(/\s+/).filter(Boolean), space = ctx.measureText(' ').width;
    const widths = words.map(w => ctx.measureText(w).width), total = widths.reduce((a, b) => a + b, 0) + space * (words.length - 1);
    const size = parseFloat((font.match(/(\d+(?:\.\d+)?)px/) || [0, 20])[1]);
    let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    words.forEach((w, i) => {
        const p = EASE.emphasized(clamp01m((t - i * each) / dur));
        if (p > 0) {
            ctx.save();
            ctx.beginPath(); ctx.rect(cx - 2, y - size * 0.75, widths[i] + 4, size * 1.5); ctx.clip();   // fenêtre du mot
            const off = (1 - p) * size * (1 + rise);
            if (stroke && strokeWidth) { ctx.lineWidth = strokeWidth; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.strokeText(w, cx, y + off); }
            ctx.fillStyle = color; ctx.fillText(w, cx, y + off);
            ctx.restore();
        }
        cx += widths[i] + space;
    });
    ctx.restore();
}
// Balayage horizontal d'un texte (mot-clé sous un dessin) : un masque découvre le texte de gauche à droite
function drawTextWipe(ctx, text, x, y, p, { font, color = '#1f1f1f', align = 'center' } = {}) {
    if (!text || p <= 0) return;
    ctx.save();
    ctx.font = font; ctx.textBaseline = 'middle'; ctx.textAlign = align;
    const w = ctx.measureText(text).width, x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    const e = EASE.standard(clamp01m(p)), size = parseFloat((font.match(/(\d+(?:\.\d+)?)px/) || [0, 20])[1]);
    ctx.beginPath(); ctx.rect(x0 - 4, y - size, (w + 8) * e, size * 2); ctx.clip();
    ctx.fillStyle = color; ctx.fillText(text, x, y + (1 - e) * size * 0.15);
    ctx.restore();
}

// ══════════════════════════════════════════════════════════════════
// TRACÉS SVG : normalisation complète (commandes relatives, H/V, S/T, arcs A → Bézier) vers M, L, C, Q, Z absolus
// ══════════════════════════════════════════════════════════════════
const PATH_ARGS = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
function tokenizePath(d) {
    const out = [], re = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;
    let m, cmd = null, args = [], argIndex = 0;
    const src = String(d || '');
    // les drapeaux des arcs peuvent être collés (« a.5.5 0 01.9 0 ») : on lit caractère par caractère quand il le faut
    let i = 0;
    const flush = () => { if (cmd) out.push([cmd, args]); args = []; };
    while (i < src.length) {
        const ch = src[i];
        if (/[\s,]/.test(ch)) { i++; continue; }
        if (/[MmLlHhVvCcSsQqTtAaZz]/.test(ch)) { flush(); cmd = ch; argIndex = 0; i++; if (ch === 'Z' || ch === 'z') { flush(); cmd = null; } continue; }
        if (cmd && (cmd === 'A' || cmd === 'a') && (argIndex % 7 === 3 || argIndex % 7 === 4) && (ch === '0' || ch === '1')) { args.push(+ch); argIndex++; i++; continue; }
        re.lastIndex = i; m = re.exec(src);
        if (!m || m.index !== i || m[1]) return out.concat(cmd ? [[cmd, args]] : []);   // caractère invalide : on s'arrête proprement
        args.push(parseFloat(m[2])); argIndex++; i = re.lastIndex;
    }
    flush();
    return out;
}
// Arc elliptique (paramètres SVG) → liste de Bézier cubiques (spécification SVG, annexe F.6)
function arcToCubics(x1, y1, rx, ry, phi, fa, fs, x2, y2) {
    if ((x1 === x2 && y1 === y2)) return [];
    if (!rx || !ry) return [[x1, y1, x2, y2, x2, y2]];
    rx = Math.abs(rx); ry = Math.abs(ry);
    const sinP = Math.sin(phi * Math.PI / 180), cosP = Math.cos(phi * Math.PI / 180);
    const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
    const x1p = cosP * dx + sinP * dy, y1p = -sinP * dx + cosP * dy;
    const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; }
    const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p, den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    const co = (fa === fs ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
    const cxp = co * (rx * y1p / ry), cyp = co * (-ry * x1p / rx);
    const cx = cosP * cxp - sinP * cyp + (x1 + x2) / 2, cy = sinP * cxp + cosP * cyp + (y1 + y2) / 2;
    const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
    let t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry), dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!fs && dt > 0) dt -= 2 * Math.PI; else if (fs && dt < 0) dt += 2 * Math.PI;
    const segs = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2))), step = dt / segs, k = 4 / 3 * Math.tan(step / 4), res = [];
    const pt = (a, sx = 1) => [cx + rx * Math.cos(a) * cosP - ry * Math.sin(a) * sinP, cy + rx * Math.cos(a) * sinP + ry * Math.sin(a) * cosP];
    const dpt = a => [-rx * Math.sin(a) * cosP - ry * Math.cos(a) * sinP, -rx * Math.sin(a) * sinP + ry * Math.cos(a) * cosP];
    for (let s = 0; s < segs; s++) {
        const a1 = t1 + s * step, a2 = a1 + step, p1 = pt(a1), p2 = pt(a2), d1 = dpt(a1), d2 = dpt(a2);
        res.push([p1[0] + k * d1[0], p1[1] + k * d1[1], p2[0] - k * d2[0], p2[1] - k * d2[1], p2[0], p2[1]]);
    }
    return res;
}
// d quelconque → liste de sous-tracés [{ segs: [['M',x,y] | ['L',x,y] | ['Q',x1,y1,x,y] | ['C',x1,y1,x2,y2,x,y] | ['Z']] }]
function normalizePath(d) {
    const subs = [];
    let cur = null, x = 0, y = 0, sx = 0, sy = 0, lastC = null, lastQ = null;
    const start = (nx, ny) => { cur = { segs: [['M', nx, ny]] }; subs.push(cur); x = sx = nx; y = sy = ny; };
    for (const [cmd, a] of tokenizePath(d)) {
        const up = cmd.toUpperCase(), rel = cmd !== up, n = PATH_ARGS[up];
        if (up === 'Z') { if (cur) cur.segs.push(['Z']); x = sx; y = sy; lastC = lastQ = null; continue; }
        if (!n || a.length < n) continue;
        for (let i = 0; i + n <= a.length; i += n) {
            const v = a.slice(i, i + n), ox = rel ? x : 0, oy = rel ? y : 0;
            let c = up;
            if (up === 'M' && i > 0) c = 'L';   // coordonnées supplémentaires après un M = lignes
            if (c === 'M') { start(v[0] + ox, v[1] + oy); lastC = lastQ = null; continue; }
            if (!cur) start(x, y);
            if (c === 'L') { x = v[0] + ox; y = v[1] + oy; cur.segs.push(['L', x, y]); lastC = lastQ = null; }
            else if (c === 'H') { x = v[0] + (rel ? x : 0); cur.segs.push(['L', x, y]); lastC = lastQ = null; }
            else if (c === 'V') { y = v[0] + (rel ? y : 0); cur.segs.push(['L', x, y]); lastC = lastQ = null; }
            else if (c === 'C') { const s = ['C', v[0] + ox, v[1] + oy, v[2] + ox, v[3] + oy, v[4] + ox, v[5] + oy]; cur.segs.push(s); lastC = [s[3], s[4]]; lastQ = null; x = s[5]; y = s[6]; }
            else if (c === 'S') { const r = lastC ? [2 * x - lastC[0], 2 * y - lastC[1]] : [x, y]; const s = ['C', r[0], r[1], v[0] + ox, v[1] + oy, v[2] + ox, v[3] + oy]; cur.segs.push(s); lastC = [s[3], s[4]]; lastQ = null; x = s[5]; y = s[6]; }
            else if (c === 'Q') { const s = ['Q', v[0] + ox, v[1] + oy, v[2] + ox, v[3] + oy]; cur.segs.push(s); lastQ = [s[1], s[2]]; lastC = null; x = s[3]; y = s[4]; }
            else if (c === 'T') { const r = lastQ ? [2 * x - lastQ[0], 2 * y - lastQ[1]] : [x, y]; const s = ['Q', r[0], r[1], v[0] + ox, v[1] + oy]; cur.segs.push(s); lastQ = [r[0], r[1]]; lastC = null; x = s[3]; y = s[4]; }
            else if (c === 'A') {
                const ex = v[5] + ox, ey = v[6] + oy;
                for (const b of arcToCubics(x, y, v[0], v[1], v[2], v[3] ? 1 : 0, v[4] ? 1 : 0, ex, ey)) cur.segs.push(['C', ...b]);
                x = ex; y = ey; lastC = lastQ = null;
            }
        }
    }
    return subs.filter(s => s.segs.length > 1);
}
const fmtN = v => String(Math.round(v * 100) / 100);
function segsToD(segs) { return segs.map(s => s[0] + (s.length > 1 ? ' ' + s.slice(1).map(fmtN).join(' ') : '')).join(' '); }
// Formes SVG simples → tracés
const K_CIRC = 0.5522847498;
function ellipseD(cx, cy, rx, ry) {
    const kx = rx * K_CIRC, ky = ry * K_CIRC;
    return 'M ' + fmtN(cx + rx) + ' ' + fmtN(cy) + ' C ' + [cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry].map(fmtN).join(' ') + ' C ' + [cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy].map(fmtN).join(' ') +
        ' C ' + [cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry].map(fmtN).join(' ') + ' C ' + [cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy].map(fmtN).join(' ') + ' Z';
}
function rectD(x, y, w, h, rx = 0, ry = rx) {
    rx = Math.min(rx || 0, w / 2); ry = Math.min(ry || rx, h / 2);
    if (!rx) return 'M ' + [x, y].map(fmtN).join(' ') + ' L ' + [x + w, y].map(fmtN).join(' ') + ' L ' + [x + w, y + h].map(fmtN).join(' ') + ' L ' + [x, y + h].map(fmtN).join(' ') + ' Z';
    const kx = rx * K_CIRC, ky = ry * K_CIRC, r = [];
    r.push('M', x + rx, y, 'L', x + w - rx, y, 'C', x + w - rx + kx, y, x + w, y + ry - ky, x + w, y + ry, 'L', x + w, y + h - ry, 'C', x + w, y + h - ry + ky, x + w - rx + kx, y + h, x + w - rx, y + h,
        'L', x + rx, y + h, 'C', x + rx - kx, y + h, x, y + h - ry + ky, x, y + h - ry, 'L', x, y + ry, 'C', x, y + ry - ky, x + rx - kx, y, x + rx, y, 'Z');
    return r.map(v => typeof v === 'number' ? fmtN(v) : v).join(' ');
}
// Élément d'icône ([tag, attributs]) → d absolus normalisés (un par sous-tracé)
function svgElementToD(tag, at) {
    const n = k => parseFloat(at[k]) || 0;
    let d = '';
    if (tag === 'path') d = at.d;
    else if (tag === 'circle') d = ellipseD(n('cx'), n('cy'), n('r'), n('r'));
    else if (tag === 'ellipse') d = ellipseD(n('cx'), n('cy'), n('rx'), n('ry'));
    else if (tag === 'rect') d = rectD(n('x'), n('y'), n('width'), n('height'), n('rx') || n('ry'), n('ry') || n('rx'));
    else if (tag === 'line') d = 'M ' + n('x1') + ' ' + n('y1') + ' L ' + n('x2') + ' ' + n('y2');
    else if (tag === 'polyline' || tag === 'polygon') { const p = String(at.points || '').trim().split(/[\s,]+/).map(Number); if (p.length >= 4) d = 'M ' + p.slice(0, 2).join(' ') + ' L ' + p.slice(2).join(' ') + (tag === 'polygon' ? ' Z' : ''); }
    return d ? normalizePath(d).map(s => segsToD(s.segs)) : [];
}

// ─────────────── Géométrie des tracés : aplatissement, boîte, morphing ───────────────
function flattenSegs(segs, tol = 0.6) {
    const pts = [];
    let x = 0, y = 0, x0 = 0, y0 = 0;
    for (const s of segs) {
        if (s[0] === 'M') { x = x0 = s[1]; y = y0 = s[2]; pts.push([x, y]); }
        else if (s[0] === 'L') { x = s[1]; y = s[2]; pts.push([x, y]); }
        else if (s[0] === 'Z') { x = x0; y = y0; pts.push([x, y]); }
        else {
            const cubic = s[0] === 'C', len = Math.hypot(s[s.length - 2] - x, s[s.length - 1] - y) + (cubic ? Math.hypot(s[1] - x, s[2] - y) + Math.hypot(s[5] - s[3], s[6] - s[4]) : Math.hypot(s[1] - x, s[2] - y));
            const steps = Math.max(2, Math.min(40, Math.ceil(len / (tol * 4))));
            for (let i = 1; i <= steps; i++) {
                const t = i / steps, u = 1 - t;
                if (cubic) pts.push([u * u * u * x + 3 * u * u * t * s[1] + 3 * u * t * t * s[3] + t * t * t * s[5], u * u * u * y + 3 * u * u * t * s[2] + 3 * u * t * t * s[4] + t * t * t * s[6]]);
                else pts.push([u * u * x + 2 * u * t * s[1] + t * t * s[3], u * u * y + 2 * u * t * s[2] + t * t * s[4]]);
            }
            x = s[s.length - 2]; y = s[s.length - 1];
        }
    }
    return pts;
}
function pathsBBox(ds) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const d of ds) for (const sp of normalizePath(d)) for (const [px, py] of flattenSegs(sp.segs)) { if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; }
    return isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}
// Transforme des tracés (échelle s puis translation) en gardant uniquement M L C Q Z absolus
function transformPaths(ds, s, tx, ty) {
    return ds.map(d => normalizePath(d).map(sp => segsToD(sp.segs.map(seg => seg.length === 1 ? seg : [seg[0], ...seg.slice(1).map((v, i) => i % 2 === 0 ? v * s + tx : v * s + ty)]))).join(' '));
}
// Rééchantillonne un polygone en n points également espacés (base du morphing)
function resample(pts, n) {
    if (pts.length < 2) return Array.from({ length: n }, () => pts[0] || [0, 0]);
    const acc = [0];
    for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = acc[acc.length - 1] || 1, out = [];
    let j = 1;
    for (let k = 0; k < n; k++) {
        const target = total * k / (n - 1);
        while (j < acc.length - 1 && acc[j] < target) j++;
        const seg = acc[j] - acc[j - 1] || 1, f = (target - acc[j - 1]) / seg;
        out.push([pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * f, pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * f]);
    }
    return out;
}
// Prépare le morphing de l'icône A vers l'icône B : chaque trait de A est apparié au trait de B le plus proche
function buildMorph(dsA, dsB, n = 64) {
    const polys = ds => ds.flatMap(d => normalizePath(d).map(sp => flattenSegs(sp.segs))).filter(p => p.length > 1);
    const A = polys(dsA), B = polys(dsB), m = Math.max(A.length, B.length), pairs = [];
    const centroid = p => p.reduce((a, q) => [a[0] + q[0] / p.length, a[1] + q[1] / p.length], [0, 0]);
    const used = new Set();
    for (let i = 0; i < m; i++) {
        const a = A[i % A.length];
        let best = -1, bd = Infinity;
        B.forEach((b, j) => { if (used.has(j) && used.size < B.length) return; const ca = centroid(a), cb = centroid(b), d = Math.hypot(ca[0] - cb[0], ca[1] - cb[1]); if (d < bd) { bd = d; best = j; } });
        if (best < 0) best = i % B.length;
        used.add(best);
        let ra = resample(a, n), rb = resample(B[best], n);
        // sens de parcours : on inverse B si cela rapproche les extrémités
        const dSame = Math.hypot(ra[0][0] - rb[0][0], ra[0][1] - rb[0][1]), dRev = Math.hypot(ra[0][0] - rb[n - 1][0], ra[0][1] - rb[n - 1][1]);
        if (dRev < dSame) rb = rb.slice().reverse();
        pairs.push([ra, rb]);
    }
    return pairs;
}
function drawMorph(ctx, pairs, p) {
    const e = EASE.inOutCubic(clamp01m(p));
    for (const [a, b] of pairs) {
        ctx.beginPath();
        a.forEach((pa, i) => { const x = pa[0] + (b[i][0] - pa[0]) * e, y = pa[1] + (b[i][1] - pa[1]) * e; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
        ctx.stroke();
    }
}

// ══════════════════════════════════════════════════════════════════
// BIBLIOTHÈQUE D'ICÔNES (Lucide, licence ISC) : 1 800+ pictogrammes au trait, chargés à la demande
// ══════════════════════════════════════════════════════════════════
let ICONS = null, iconsLoading = null, iconIndex = null;
function loadIcons() {
    if (ICONS) return Promise.resolve(ICONS);
    if (!iconsLoading) iconsLoading = fetch('data/icons.json?v=1').then(r => r.ok ? r.json() : null).then(j => {
        ICONS = j && j.icons ? j.icons : {};
        // index des mots : nom de l'icône (poids fort) + étiquettes
        iconIndex = new Map();
        const add = (w, name, score) => { if (!w) return; const l = iconIndex.get(w) || []; l.push([name, score]); iconIndex.set(w, l); };
        for (const [name, ic] of Object.entries(ICONS)) {
            name.split('-').forEach((w, i) => add(STEM(w), name, i === 0 ? 3 : 2));
            (ic.t || '').split('|').forEach(tag => { const ws = tag.split(/\s+/); ws.forEach(w => add(STEM(w), name, ws.length === 1 ? 1.6 : 1)); });
        }
        return ICONS;
    }).catch(() => { ICONS = {}; iconIndex = new Map(); return ICONS; });
    return iconsLoading;
}
// Synonymes des notions scolaires les plus fréquentes → nom exact d'icône
const ICON_SYNONYMS = {
    document: 'file-text', paper: 'file-text', law: 'scale', justice: 'scale', court: 'gavel', judge: 'gavel', people: 'users', crowd: 'users', population: 'users', citizen: 'user',
    idea: 'lightbulb', lightbulb: 'lightbulb', bulb: 'lightbulb', money: 'banknote', cash: 'banknote', tax: 'receipt', price: 'tag', water: 'droplet', drop: 'droplet', rain: 'cloud-rain',
    food: 'utensils', meal: 'utensils', prison: 'lock', jail: 'lock', freedom: 'bird', peace: 'bird', war: 'swords', battle: 'swords', army: 'shield', soldier: 'shield', king: 'crown', queen: 'crown',
    president: 'landmark', government: 'landmark', parliament: 'landmark', state: 'landmark', vote: 'vote', election: 'vote', city: 'building-complex', town: 'building', village: 'house', country: 'flag', nation: 'flag',
    world: 'globe', planet: 'earth', science: 'flask-conical', chemistry: 'flask-conical', experiment: 'flask-conical', energy: 'zap', electricity: 'zap', heat: 'thermometer', temperature: 'thermometer', cold: 'snowflake',
    growth: 'trending-up', increase: 'trending-up', decrease: 'trending-down', decline: 'trending-down', health: 'heart-pulse', doctor: 'stethoscope', medicine: 'pill', hospital: 'hospital', school: 'school',
    student: 'graduation-cap', learning: 'graduation-cap', teacher: 'presentation', question: 'circle-question-mark', answer: 'message-circle', talk: 'message-circle', speech: 'megaphone', revolution: 'megaphone', protest: 'megaphone',
    time: 'clock', history: 'rotate-ccw-clock', date: 'calendar', year: 'calendar', danger: 'triangle-alert', warning: 'triangle-alert', death: 'skull', execution: 'skull', guillotine: 'skull', trade: 'handshake', agreement: 'handshake',
    work: 'briefcase', job: 'briefcase', worker: 'hard-hat', farm: 'wheat', agriculture: 'wheat', bread: 'wheat', ship: 'ship', travel: 'plane', car: 'car', train: 'train-front', communication: 'radio', internet: 'wifi', computer: 'monitor',
    phone: 'smartphone', data: 'database', brain: 'brain', memory: 'brain', emotion: 'face-slightly-smiling', happy: 'face-slightly-smiling', sad: 'face-slightly-frowning', love: 'heart', family: 'users', child: 'baby', light: 'sun', sun: 'sun', night: 'moon', star: 'star',
    animal: 'paw-print', nature: 'leaf', plant: 'sprout', forest: 'trees', ocean: 'waves-horizontal', sea: 'waves-horizontal', river: 'waves-horizontal', cell: 'microscope', biology: 'microscope', mountain: 'mountain', fire: 'flame', pollution: 'factory', recycling: 'recycle', key: 'key', secret: 'key',
    search: 'search', discovery: 'search', book: 'book-open', writing: 'pen-line', letter: 'mail', news: 'newspaper', press: 'newspaper', religion: 'church', church: 'church', castle: 'castle', map: 'map', target: 'target', goal: 'target'
};
const STEM = w => String(w || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '').replace(/(ies)$/, 'y').replace(/([^s])s$/, '$1');
// Mots-clés anglais (« guillotine, blade, execution ») → meilleure icône, ou null
function findIcon(keywords) {
    if (!ICONS || !iconIndex) return null;
    const list = (Array.isArray(keywords) ? keywords : String(keywords || '').split(/[,;|]/)).map(k => String(k).trim().toLowerCase()).filter(Boolean);
    let best = null, bestScore = 0;
    list.forEach((kw, rank) => {
        const weight = 1 / (1 + rank * 0.35), slug = kw.replace(/\s+/g, '-');
        if (ICONS[slug]) { const sc = 10 * weight; if (sc > bestScore) { best = slug; bestScore = sc; } return; }
        const syn = ICON_SYNONYMS[kw] || ICON_SYNONYMS[STEM(kw)];
        if (syn && ICONS[syn]) { const sc = 8 * weight; if (sc > bestScore) { best = syn; bestScore = sc; } return; }
        // expression de plusieurs mots (« water drop ») : synonyme d'un des mots
        for (const w of kw.split(/[\s-]+/)) { const sw = ICON_SYNONYMS[w] || ICON_SYNONYMS[STEM(w)]; if (sw && ICONS[sw]) { const sc = 5 * weight; if (sc > bestScore) { best = sw; bestScore = sc; } } }
        const words = kw.split(/[\s-]+/).map(STEM).filter(w => w.length > 1), tally = new Map();
        words.forEach(w => {
            const hits = (iconIndex.get(w) || []).concat(w !== kw ? [] : []);
            // variantes simples (pluriel / singulier déjà traité par STEM) + correspondance exacte sur le nom brut
            hits.forEach(([name, s]) => tally.set(name, (tally.get(name) || 0) + s));
            if (ICONS[w]) tally.set(w, (tally.get(w) || 0) + 4);
        });
        tally.forEach((s, name) => {
            // on préfère les icônes au nom court (les plus génériques) à score égal
            const sc = (s / Math.max(1, words.length)) * weight - name.split('-').length * 0.05;
            if (sc > bestScore) { best = name; bestScore = sc; }
        });
    });
    return best && bestScore >= 1.2 ? { name: best, paths: ICONS[best].d } : null;
}

// ══════════════════════════════════════════════════════════════════
// EMOJIS 3D (Fluent Emoji de Microsoft, licence MIT) : rendu moderne des icônes pour les styles colorés.
// Index local (data/emoji3d.json) ; images téléchargées à la demande (jsDelivr, secours GitHub) puis gardées en mémoire.
// ══════════════════════════════════════════════════════════════════
let EMOJI3D = null, emojiLoading = null, emojiIndex = null, emojiBase = [];
function loadEmoji3d() {
    if (EMOJI3D) return Promise.resolve(EMOJI3D);
    if (!emojiLoading) emojiLoading = fetch('data/emoji3d.json?v=1').then(r => r.ok ? r.json() : null).then(j => {
        EMOJI3D = j && j.emoji ? j.emoji : {};
        emojiBase = j ? [j.base, j.fallback].filter(Boolean) : [];
        emojiIndex = new Map();
        const add = (w, name, score) => { if (!w) return; const l = emojiIndex.get(w) || []; l.push([name, score]); emojiIndex.set(w, l); };
        for (const [name, e] of Object.entries(EMOJI3D)) {
            name.replace(/[():,]/g, ' ').split(/[\s-]+/).filter(Boolean).forEach((w, i) => add(STEM(w), name, i === 0 ? 3 : 2));
            (e.k || '').split('|').forEach(k => { const ws = k.split(/\s+/); ws.forEach(w => add(STEM(w), name, ws.length === 1 ? 1.6 : 1)); });
        }
        return EMOJI3D;
    }).catch(() => { EMOJI3D = {}; emojiIndex = new Map(); return EMOJI3D; });
    return emojiLoading;
}
const EMOJI_SYNONYMS = {
    law: 'balance scale', justice: 'balance scale', court: 'balance scale', vote: 'ballot box with ballot', election: 'ballot box with ballot', king: 'crown', queen: 'crown', monarchy: 'crown',
    people: 'busts in silhouette', crowd: 'busts in silhouette', population: 'busts in silhouette', citizen: 'person', family: 'busts in silhouette', money: 'money bag', coins: 'coin', cash: 'dollar banknote', tax: 'receipt', price: 'label',
    idea: 'light bulb', bulb: 'light bulb', lightbulb: 'light bulb', memory: 'brain', science: 'test tube', chemistry: 'test tube', experiment: 'test tube', war: 'crossed swords', battle: 'crossed swords', sword: 'crossed swords', swords: 'crossed swords', army: 'military helmet', soldier: 'military helmet',
    revolution: 'megaphone', protest: 'megaphone', speech: 'megaphone', document: 'page facing up', paper: 'page facing up', 'file-text': 'page facing up', constitution: 'scroll', treaty: 'scroll', book: 'books', 'book-open': 'open book', student: 'graduation cap', learning: 'graduation cap', teacher: 'woman teacher',
    world: 'globe showing europe-africa', earth: 'globe showing europe-africa', globe: 'globe showing europe-africa', planet: 'ringed planet', map: 'world map', time: 'hourglass done', history: 'hourglass done', hourglass: 'hourglass done', date: 'calendar', year: 'calendar',
    danger: 'warning', 'triangle-alert': 'warning', death: 'skull', execution: 'skull', guillotine: 'skull', water: 'droplet', rain: 'cloud with rain', 'cloud-rain': 'cloud with rain', flame: 'fire', energy: 'high voltage', electricity: 'high voltage', zap: 'high voltage',
    heat: 'thermometer', cold: 'snowflake', light: 'sun', night: 'crescent moon', moon: 'crescent moon', industry: 'factory', pollution: 'factory', city: 'cityscape', town: 'houses', village: 'house', home: 'house', religion: 'church', palace: 'castle', landmark: 'classical building', government: 'classical building', parliament: 'classical building', state: 'classical building',
    food: 'bread', farm: 'sheaf of rice', agriculture: 'sheaf of rice', wheat: 'sheaf of rice', growth: 'chart increasing', increase: 'chart increasing', 'trending-up': 'chart increasing', decrease: 'chart decreasing', decline: 'chart decreasing', 'trending-down': 'chart decreasing', statistics: 'bar chart', 'chart-column': 'bar chart',
    health: 'stethoscope', doctor: 'stethoscope', medicine: 'pill', virus: 'microbe', bacteria: 'microbe', cell: 'microbe', trade: 'handshake', agreement: 'handshake', work: 'briefcase', job: 'briefcase', worker: 'construction worker',
    boat: 'sailboat', plane: 'airplane', car: 'automobile', train: 'locomotive', 'train-front': 'locomotive', computer: 'laptop', monitor: 'desktop computer', phone: 'mobile phone', smartphone: 'mobile phone', internet: 'globe with meridians', wifi: 'globe with meridians', data: 'bar chart', database: 'card file box',
    freedom: 'dove', peace: 'dove', bird: 'dove', love: 'red heart', heart: 'red heart', happy: 'grinning face', sad: 'crying face', angry: 'angry face', question: 'red question mark', yes: 'check mark button', no: 'cross mark',
    target: 'bullseye', goal: 'bullseye', search: 'magnifying glass tilted left', discovery: 'magnifying glass tilted left', secret: 'key', prison: 'locked', jail: 'locked', lock: 'locked', news: 'newspaper', press: 'newspaper',
    writing: 'writing hand', 'pen-line': 'writing hand', letter: 'envelope', mail: 'envelope', tree: 'deciduous tree', trees: 'evergreen tree', forest: 'evergreen tree', plant: 'seedling', sprout: 'seedling', leaf: 'leaf fluttering in wind', nature: 'seedling', flower: 'blossom',
    ocean: 'water wave', sea: 'water wave', river: 'water wave', wave: 'water wave', 'waves-horizontal': 'water wave', wind: 'wind face', weather: 'sun behind cloud', animal: 'paw prints', 'paw-print': 'paw prints', dinosaur: 'sauropod',
    space: 'rocket', atom: 'atom symbol', robot: 'robot', ai: 'robot', recycling: 'recycling symbol', recycle: 'recycling symbol', winner: 'trophy', victory: 'trophy', music: 'musical note', art: 'artist palette', sport: 'soccer ball', game: 'video game',
    clock: 'alarm clock', gift: 'wrapped gift', party: 'party popper', celebration: 'party popper', medal: '1st place medal', muscle: 'flexed biceps', strength: 'flexed biceps', thinking: 'thinking face', weapon: 'dagger', flag: 'triangular flag',
    'flask-conical': 'test tube', 'graduation-cap': 'graduation cap', 'heart-pulse': 'anatomical heart', stethoscope: 'stethoscope', pill: 'pill', users: 'busts in silhouette', user: 'bust in silhouette', scale: 'balance scale', gavel: 'balance scale',
    banknote: 'dollar banknote', receipt: 'receipt', handshake: 'handshake', shield: 'shield', skull: 'skull', megaphone: 'megaphone', newspaper: 'newspaper', factory: 'factory', castle: 'castle', church: 'church', crown: 'crown'
};
// Mots-clés anglais → nom d'emoji 3D (ou null)
function findEmoji(keywords) {
    if (!EMOJI3D || !emojiIndex) return null;
    const list = (Array.isArray(keywords) ? keywords : String(keywords || '').split(/[,;|]/)).map(k => String(k).trim().toLowerCase()).filter(Boolean);
    let best = null, bestScore = 0;
    list.forEach((kw, rank) => {
        const weight = 1 / (1 + rank * 0.35);
        const direct = EMOJI3D[kw] ? kw : EMOJI3D[kw.replace(/-/g, ' ')] ? kw.replace(/-/g, ' ') : null;
        if (direct) { const sc = 10 * weight; if (sc > bestScore) { best = direct; bestScore = sc; } return; }
        const syn = EMOJI_SYNONYMS[kw] || EMOJI_SYNONYMS[STEM(kw)];
        if (syn && EMOJI3D[syn]) { const sc = 8 * weight; if (sc > bestScore) { best = syn; bestScore = sc; } return; }
        for (const w of kw.split(/[\s-]+/)) { const sw = EMOJI_SYNONYMS[w] || EMOJI_SYNONYMS[STEM(w)]; if (sw && EMOJI3D[sw]) { const sc = 5 * weight; if (sc > bestScore) { best = sw; bestScore = sc; } } }
        const words = kw.split(/[\s-]+/).map(STEM).filter(w => w.length > 1), tally = new Map();
        words.forEach(w => (emojiIndex.get(w) || []).forEach(([name, s]) => tally.set(name, (tally.get(name) || 0) + s)));
        tally.forEach((s, name) => {
            const sc = (s / Math.max(1, words.length)) * weight - name.split(/\s+/).length * 0.08 - (/skin tone|:/.test(name) ? 1 : 0);
            if (sc > bestScore) { best = name; bestScore = sc; }
        });
    });
    return best && bestScore >= 1.4 ? best : null;
}
// Image d'un emoji 3D (promesse mémorisée) ; essaie jsDelivr puis GitHub
const emojiImages = new Map();
function loadEmojiImage(name) {
    if (!EMOJI3D || !EMOJI3D[name]) return Promise.resolve(null);
    if (!emojiImages.has(name)) {
        const path = EMOJI3D[name].p.split('/').map(encodeURIComponent).join('/');
        const tryUrl = i => i >= emojiBase.length ? Promise.resolve(null) : new Promise(res => {
            const img = new Image(); img.crossOrigin = 'anonymous';   // indispensable : sinon le canvas est « souillé » et l'export échoue
            img.onload = () => res(img); img.onerror = () => res(null);
            img.src = emojiBase[i] + path;
        }).then(img => img || tryUrl(i + 1));
        const p = tryUrl(0).then(img => { const rec = { img, ready: !!img }; emojiImages.set(name, rec); return img; });
        emojiImages.set(name, { promise: p, ready: false });
    }
    const rec = emojiImages.get(name);
    return rec.promise || Promise.resolve(rec.img || null);
}
function emojiImageNow(name) { const r = emojiImages.get(name); return r && r.ready ? r.img : null; }
// Style des icônes : traits (tableau blanc, tableau noir) ou emojis 3D (styles colorés)
function iconStyle() {
    const pref = state.iconStyle || 'auto';
    if (pref === '3d' || pref === 'line') return pref;
    return (typeof isWhiteboard === 'function' && isWhiteboard()) || state.selectedStyle === 'chalkboard' ? 'line' : '3d';
}
// Précharge les emojis 3D de toute la vidéo avant le montage (mots-clés des graphiques et des illustrations)
async function preloadVideoIcons(keywordLists) {
    await loadIcons();
    if (iconStyle() !== '3d') return 0;
    await loadEmoji3d();
    const names = [...new Set(keywordLists.map(k => findEmoji(String(k || '').split(/\s*[,;|]\s*/))).filter(Boolean))];
    const imgs = await Promise.all(names.map(n => withTimeoutSafe(loadEmojiImage(n), 12000)));
    return imgs.filter(Boolean).length;
}
function withTimeoutSafe(p, ms) { return Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]); }
