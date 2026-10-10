// ══════════════════════════════════════════════════════════════════
// IMAGE → TRAITS DE FEUTRE (8.8)
// Une image (dessin d'Agnes Image, gratuit, ou image de l'utilisateur) devient des traits que le feutre trace un à un
// sur le tableau. Portage JavaScript de vectorcraft-trace (crates/trace/src/centerline.rs et fit.rs : distance de
// chanfrein 3-4, squelette Zhang–Suen gardant la topologie, graphe des traits entre extrémités et croisements,
// ébarbage, raccords, Douglas–Peucker) — ArtCraft Team et contributeurs de VectorCraft, MIT ou Apache 2.0.
// ══════════════════════════════════════════════════════════════════
const TRACE_SIZE = 240;          // côté de l'image analysée : assez de détail pour une case du tableau, rapide sur iPhone
const TRACE_MAX_STROKES = 30;    // traits gardés par élément (les plus longs) : 3 illustrations + flèches tiennent dans les 100 traits
const TRACE_LINE = 3.4;          // épaisseur du feutre d'une illustration retracée (4,5 pour les icônes) : détails lisibles

// Masque « encre » : pixel nettement plus sombre que son voisinage (seuil adaptatif), et pour un dessin au trait tout
// pixel bien noir. Un dessin au trait garde ses traits et ses zones pleines, une photo garde ses contours.
function traceInkMask(px, w, h, photo) {
    const n = w * h, L = new Float32Array(n), W = w + 1, S = new Float64Array(W * (h + 1));
    for (let i = 0; i < n; i++) L[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
    for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += L[y * w + x]; S[(y + 1) * W + x + 1] = S[y * W + x + 1] + row; } }
    const r = Math.max(4, Math.round(Math.max(w, h) / (photo ? 24 : 16))), C = photo ? 16 : 18, dark = photo ? 200 : 170;
    const m = new Uint8Array(n);
    for (let y = 0; y < h; y++) {
        const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
        for (let x = 0; x < w; x++) {
            const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
            const mean = (S[y1 * W + x1] - S[y0 * W + x1] - S[y1 * W + x0] + S[y0 * W + x0]) / ((x1 - x0) * (y1 - y0));
            const v = L[y * w + x];
            // dessin au trait : tout ce qui est bien noir compte (une zone pleine reste pleine, puis seul son bord est tracé)
            if ((v < mean - C && v < dark) || (!photo && v < 110)) m[y * w + x] = 1;
        }
    }
    return m;
}

// Composantes 8-connexes du masque : f(pixels) pour chacune.
function traceComponents(m, w, h, f) {
    const seen = new Uint8Array(w * h), stack = [];
    for (let s = 0; s < w * h; s++) {
        if (!m[s] || seen[s]) continue;
        const comp = []; seen[s] = 1; stack.push(s);
        while (stack.length) {
            const i = stack.pop(), x = i % w, y = (i / w) | 0;
            comp.push(i);
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx, ny = y + dy;
                if ((dx || dy) && nx >= 0 && ny >= 0 && nx < w && ny < h) { const j = ny * w + nx; if (m[j] && !seen[j]) { seen[j] = 1; stack.push(j); } }
            }
        }
        f(comp);
    }
}

// Distance de chanfrein 3-4 (3 par pas) de chaque pixel du masque au plus proche pixel dehors (le bord compte dehors).
function traceChamfer(m, w, h) {
    const d = new Uint16Array(w * h), at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : d[y * w + x];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (m[i]) d[i] = Math.min(at(x - 1, y) + 3, at(x - 1, y - 1) + 4, at(x, y - 1) + 3, at(x + 1, y - 1) + 4);
    }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        if (m[i]) d[i] = Math.min(d[i], at(x + 1, y) + 3, at(x + 1, y + 1) + 4, at(x, y + 1) + 3, at(x - 1, y + 1) + 4);
    }
    return d;
}

// Squelette d'un pixel de large (Zhang–Suen ; chaque pixel choisi n'est retiré que s'il ne coupe toujours rien, pour
// qu'un trait de 2 pixels s'amincisse au lieu de disparaître), puis coins en escalier retirés. `on` a un bord vide d'1 pixel.
function traceThin(on, w, h) {
    const ring = i => [on[i - w], on[i - w + 1], on[i + 1], on[i + w + 1], on[i + w], on[i + w - 1], on[i - 1], on[i - w - 1]];
    const removable = p => { let b = 0, a = 0; for (let k = 0; k < 8; k++) { b += p[k]; if (!p[k] && p[(k + 1) & 7]) a++; } return b >= 2 && b <= 6 && a === 1; };
    const picked = [];
    for (let changed = true; changed;) {
        changed = false;
        for (let step = 0; step < 2; step++) {
            picked.length = 0;
            for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
                const i = y * w + x;
                if (!on[i]) continue;
                const p = ring(i), N = p[0], E = p[2], S = p[4], Wt = p[6];
                const side = step === 0 ? !(E && S && (N || Wt)) : !(N && Wt && (E || S));
                if (side && removable(p)) picked.push(i);
            }
            for (const i of picked) if (removable(ring(i))) { on[i] = 0; changed = true; }
        }
    }
    // coins en escalier : pixel dont les voisins restent reliés sans lui (nombre de Yokoi 1) et qui ne termine pas le trait
    for (let changed = true; changed;) {
        changed = false;
        for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
            const i = y * w + x;
            if (!on[i]) continue;
            const p = ring(i);
            if (p.reduce((a, b) => a + b, 0) < 2) continue;
            const q = [p[2], p[1], p[0], p[7], p[6], p[5], p[4], p[3]], off = k => !q[k & 7];
            let c8 = 0;
            for (const k of [0, 2, 4, 6]) c8 += (off(k) ? 1 : 0) - (off(k) && off(k + 1) && off(k + 2) ? 1 : 0);
            if (c8 === 1) { on[i] = 0; changed = true; }
        }
    }
}

// Squelette → traits : suites de pixels entre extrémités et croisements (pixels de croisement voisins fusionnés en un
// point), boucles fermées pour les anneaux sans extrémité.
function traceRuns(on, w, h) {
    const nbr = i => { const o = []; for (const j of [i - w, i - w + 1, i + 1, i + w + 1, i + w, i + w - 1, i - 1, i - w - 1]) if (on[j]) o.push(j); return o; };
    const skel = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (on[y * w + x]) skel.push(y * w + x);
    const node = new Int32Array(on.length).fill(-1), centres = [];
    const ctr = i => [i % w + 0.5, ((i / w) | 0) + 0.5];
    for (const i of skel) {
        const d = nbr(i).length;
        if (d === 2 || node[i] >= 0) continue;
        const id = centres.length, members = [i];
        node[i] = id;
        if (d > 2) for (let k = 0; k < members.length; k++) for (const q of nbr(members[k])) if (node[q] < 0 && nbr(q).length > 2) { node[q] = id; members.push(q); }
        let sx = 0, sy = 0;
        for (const mb of members) { const c = ctr(mb); sx += c[0]; sy += c[1]; }
        centres.push([sx / members.length, sy / members.length]);
    }
    const used = new Set(), N = on.length, key = (a, b) => a < b ? a * N + b : b * N + a, runs = [];
    for (const p of skel) {
        if (node[p] < 0) continue;
        for (const q of nbr(p)) {
            if (node[q] === node[p] || used.has(key(p, q))) continue;
            used.add(key(p, q));
            const pts = [centres[node[p]], ctr(q)];
            let prev = p, cur = q;
            while (node[cur] < 0) {
                const next = nbr(cur).find(n => n !== prev && !used.has(key(cur, n)));
                if (next === undefined) break;
                used.add(key(cur, next)); pts.push(ctr(next)); prev = cur; cur = next;
            }
            const end = node[cur] >= 0 ? node[cur] : null;
            if (end !== null) pts[pts.length - 1] = centres[end];
            runs.push({ pts, ends: [node[p], end], closed: false });
        }
    }
    for (const s of skel) {
        if (node[s] >= 0 || nbr(s).some(n => used.has(key(s, n)))) continue;
        const pts = [ctr(s)];
        let prev = -1, cur = s, closed = false, next;
        while ((next = nbr(cur).find(n => n !== prev && !used.has(key(cur, n)))) !== undefined) {
            used.add(key(cur, next));
            if (next === s) { closed = true; break; }
            pts.push(ctr(next)); prev = cur; cur = next;
        }
        runs.push({ pts, ends: [null, null], closed });
    }
    return { runs, nodes: centres.length };
}
function traceLength(r) {
    let l = 0;
    for (let k = 1; k < r.pts.length; k++) l += Math.hypot(r.pts[k][0] - r.pts[k - 1][0], r.pts[k][1] - r.pts[k - 1][1]);
    if (r.closed && r.pts.length > 1) l += Math.hypot(r.pts[0][0] - r.pts[r.pts.length - 1][0], r.pts[0][1] - r.pts[r.pts.length - 1][1]);
    return l;
}
// Ébarbage : retire les petites branches que l'amincissement laisse aux croisements (plus courtes que le trait n'est
// large, d'une extrémité à un croisement qui garde au moins deux autres branches).
function tracePrune(runs, nodes, width) {
    const degree = new Array(nodes).fill(0);
    runs.forEach(r => r.ends.forEach(e => { if (e !== null) degree[e]++; }));
    const lens = runs.map(traceLength), keep = runs.map(() => true);
    runs.map((_, i) => i).sort((a, b) => lens[a] - lens[b]).forEach(i => {
        const [a, b] = runs[i].ends;
        if (a === null || b === null) return;
        const [tip, fork] = degree[a] === 1 ? [a, b] : [b, a];
        if (degree[tip] === 1 && degree[fork] >= 3 && lens[i] < Math.max(width, 2)) { keep[i] = false; degree[tip]--; degree[fork]--; }
    });
    return runs.filter((_, i) => keep[i]);
}
// Raccords : deux traits qui se rejoignent seuls en un point n'en font plus qu'un (un trait qui se rejoint se ferme).
function traceJoin(runs, nodes) {
    runs = runs.slice();
    for (let n = 0; n < nodes; n++) {
        const at = [];
        runs.forEach((r, i) => { if (r) for (let k = 0; k < 2; k++) if (r.ends[k] === n) at.push([i, k]); });
        if (at.length !== 2) continue;
        const [[i, ki], [j, kj]] = at;
        if (i === j) { const r = runs[i]; r.pts.pop(); r.ends = [null, null]; r.closed = r.pts.length >= 3; continue; }
        const a = runs[i], b = runs[j];
        runs[j] = null;
        if (ki === 0) { a.pts.reverse(); a.ends.reverse(); }
        if (kj === 1) { b.pts.reverse(); b.ends.reverse(); }
        for (let k = 1; k < b.pts.length; k++) a.pts.push(b.pts[k]);
        a.ends[1] = b.ends[1];
    }
    return runs.filter(Boolean);
}
// Douglas–Peucker (une boucle fermée est coupée en deux au point le plus éloigné de son départ).
function traceSimplify(pts, tol, closed) {
    if (pts.length < 3) return pts.slice();
    const P = closed ? pts.concat([pts[0]]) : pts, last = P.length - 1, keep = new Uint8Array(P.length);
    const segDist = (p, a, b) => {
        const vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy;
        if (l2 < 1e-12) return Math.hypot(p[0] - a[0], p[1] - a[1]);
        const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l2));
        return Math.hypot(p[0] - a[0] - vx * t, p[1] - a[1] - vy * t);
    };
    keep[0] = keep[last] = 1;
    const stack = [];
    if (closed) {
        let far = 1;
        for (let i = 2; i < last; i++) if (Math.hypot(P[i][0] - P[0][0], P[i][1] - P[0][1]) > Math.hypot(P[far][0] - P[0][0], P[far][1] - P[0][1])) far = i;
        keep[far] = 1; stack.push([0, far], [far, last]);
    } else stack.push([0, last]);
    while (stack.length) {
        const [a, b] = stack.pop();
        if (b <= a + 1) continue;
        let best = 0, bi = a;
        for (let i = a + 1; i < b; i++) { const d = segDist(P[i], P[a], P[b]); if (d > best) { best = d; bi = i; } }
        if (best > tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
    }
    return P.filter((_, i) => keep[i]);
}
// Polyligne → tracé SVG absolu (M, L, Q) : courbes douces par les milieux, angles vifs gardés (> 55°).
function traceToPath(pts, map) {
    const r = v => Math.round(v * 10) / 10, P = pts.map(map), f = p => r(p[0]) + ' ' + r(p[1]);
    if (P.length < 2) return '';
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const sharp = k => {
        const ax = P[k][0] - P[k - 1][0], ay = P[k][1] - P[k - 1][1], bx = P[k + 1][0] - P[k][0], by = P[k + 1][1] - P[k][1];
        const l = Math.hypot(ax, ay) * Math.hypot(bx, by);
        return l < 1e-9 || (ax * bx + ay * by) / l < 0.57;
    };
    let d = 'M ' + f(P[0]), atMid = false;
    for (let k = 1; k < P.length - 1; k++) {
        if (sharp(k)) { d += ' L ' + f(P[k]); atMid = false; continue; }
        if (!atMid) d += ' L ' + f(mid(P[k - 1], P[k]));
        d += ' Q ' + f(P[k]) + ' ' + f(mid(P[k], P[k + 1]));
        atMid = true;
    }
    return d + ' L ' + f(P[P.length - 1]);
}

// Pixels RGBA (w × h, fond blanc) → traits SVG dans une case de 200 × 200, dans l'ordre où une main les tracerait
// (grandes formes d'abord, puis détails, en allant au plus près). null si l'image ne donne rien d'exploitable.
function traceLineArt(px, w, h, opts = {}) {
    const photo = !!opts.photo, m = traceInkMask(px, w, h, photo);
    const minPx = photo ? 30 : 12, maxWidth = photo ? 6 : 8;
    const dt = traceChamfer(m, w, h), gw = w + 2, gh = h + 2, on = new Uint8Array(gw * gh);
    let inkPx = 0;
    const dashes = [];
    traceComponents(m, w, h, comp => {
        if (comp.length < minPx) return;   // poussières
        // petit trait allongé (rayon, tiret) : l'amincissement le réduirait à un point, on prend directement son axe
        if (comp.length <= 150) {
            let mx = 0, my = 0, sxx = 0, syy = 0, sxy = 0;
            for (const i of comp) { mx += i % w; my += (i / w) | 0; }
            mx /= comp.length; my /= comp.length;
            for (const i of comp) { const dx = i % w - mx, dy = ((i / w) | 0) - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
            const tr = (sxx + syy) / comp.length, det = (sxx * syy - sxy * sxy) / (comp.length * comp.length), disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
            const l1 = tr / 2 + disc, l2 = tr / 2 - disc;
            if (l1 > 6 * Math.max(l2, 0.25)) {
                let dx = sxy / comp.length, dy = l1 - sxx / comp.length;
                if (Math.hypot(dx, dy) < 1e-9) { dx = 1; dy = 0; }
                const n = Math.hypot(dx, dy); dx /= n; dy /= n;
                let t0 = Infinity, t1 = -Infinity;
                for (const i of comp) { const t = (i % w - mx) * dx + (((i / w) | 0) - my) * dy; if (t < t0) t0 = t; if (t > t1) t1 = t; }
                const c = [mx + 1.5, my + 1.5];   // centre du pixel, dans la grille à bord d'1 pixel
                dashes.push({ pts: [[c[0] + dx * t0, c[1] + dy * t0], [c[0] + dx * t1, c[1] + dy * t1]], ends: [null, null], closed: false });
                return;
            }
        }
        let maxd = 0;
        for (const i of comp) if (dt[i] > maxd) maxd = dt[i];
        const wide = 2 * maxd / 3 - 1 > maxWidth;   // zone pleine : seul son bord est tracé
        for (const i of comp) if (!wide || dt[i] <= 6) { on[((i / w) | 0) * gw + gw + 1 + (i % w)] = 1; inkPx++; }
    });
    if (inkPx < 20 && !dashes.length) return null;
    traceThin(on, gw, gh);
    const g = traceRuns(on, gw, gh);
    const meanWidth = runs => { const l = runs.reduce((a, r) => a + traceLength(r), 0); return Math.max(1, Math.min(maxWidth, (-l + Math.sqrt(l * l + 4 * inkPx)) / 2)); };
    let runs = traceJoin(tracePrune(g.runs, g.nodes, meanWidth(g.runs)), g.nodes).concat(dashes);
    const minLen = Math.max(w, h) * (photo ? 0.05 : 0.02);
    runs = runs.map(r => ({ pts: traceSimplify(r.pts, photo ? 1.6 : 1.1, r.closed), len: traceLength(r) })).filter(r => r.len >= minLen && r.pts.length >= 2);
    if (runs.length < 2 && !(runs.length === 1 && runs[0].len > Math.max(w, h))) return null;
    runs.sort((a, b) => b.len - a.len);
    runs = runs.slice(0, TRACE_MAX_STROKES);
    // ordre de tracé : grandes formes puis détails, chaque fois le trait le plus proche du feutre
    const maxLen = runs[0].len, order = [];
    let pen = [0, 0];
    for (const group of [runs.filter(r => r.len >= maxLen * 0.2), runs.filter(r => r.len < maxLen * 0.2)]) {
        while (group.length) {
            let best = 0, bd = Infinity, rev = false;
            group.forEach((r, i) => {
                const a = r.pts[0], b = r.pts[r.pts.length - 1];
                const da = Math.hypot(a[0] - pen[0], a[1] - pen[1]), db = Math.hypot(b[0] - pen[0], b[1] - pen[1]);
                if (da < bd) { bd = da; best = i; rev = false; }
                if (db < bd) { bd = db; best = i; rev = true; }
            });
            const r = group.splice(best, 1)[0];
            if (rev) r.pts.reverse();
            order.push(r); pen = r.pts[r.pts.length - 1];
        }
    }
    // pixels de la grille (bord d'1 pixel) → case de 200 × 200, centrée, proportions gardées
    const k = 184 / Math.max(w, h), ox = 100 - w * k / 2, oy = 100 - h * k / 2;
    const map = p => [ox + (p[0] - 1) * k, oy + (p[1] - 1) * k];
    const paths = order.map(r => traceToPath(r.pts, map)).filter(Boolean);
    return paths.length ? paths : null;
}

// Image (data URI ou adresse) → traits ; recadrée sur ce qui est dessiné pour garder le détail.
async function traceImageToPaths(src, opts = {}) {
    const img = await loadImageEl(src);
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) return null;
    const c = document.createElement('canvas'), g = c.getContext('2d', { willReadFrequently: true });
    const grab = (sx, sy, sw, sh) => {
        const k = TRACE_SIZE / Math.max(sw, sh), w = Math.max(8, Math.round(sw * k)), h = Math.max(8, Math.round(sh * k));
        c.width = w; c.height = h;
        g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
        g.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
        return { px: g.getImageData(0, 0, w, h).data, w, h, k };
    };
    try {
        let a = grab(0, 0, iw, ih);
        // « auto » : une image surtout blanche est un dessin au trait, sinon une photo (contours plus sévères)
        if (opts.photo === 'auto') { let light = 0; for (let i = 0; i < a.px.length; i += 4) if (a.px[i] + a.px[i + 1] + a.px[i + 2] > 660) light++; opts = { ...opts, photo: light < a.w * a.h * 0.6 }; }
        // zone dessinée (sans les poussières) : si elle est petite dans l'image, on refait l'analyse dessus
        const m = traceInkMask(a.px, a.w, a.h, !!opts.photo);
        let x0 = a.w, y0 = a.h, x1 = -1, y1 = -1;
        traceComponents(m, a.w, a.h, comp => {
            if (comp.length < 12) return;
            for (const i of comp) { const x = i % a.w, y = (i / a.w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        });
        if (x1 >= 0 && Math.max(x1 - x0, y1 - y0) < TRACE_SIZE * 0.75) {
            const pad = Math.max(x1 - x0, y1 - y0) * 0.06 + 2;
            const sx = Math.max(0, (x0 - pad) / a.k), sy = Math.max(0, (y0 - pad) / a.k);
            const sw = Math.min(iw - sx, (x1 - x0 + 2 * pad) / a.k), sh = Math.min(ih - sy, (y1 - y0 + 2 * pad) / a.k);
            if (sw > 4 && sh > 4) a = grab(sx, sy, sw, sh);
        }
        return traceLineArt(a.px, a.w, a.h, opts);
    } finally { c.width = c.height = 0; }   // iPhone : mémoire des canvas rendue tout de suite
}

// ── Branchement sur les illustrations ──
// Un élément sans icône toute faite (objet trop particulier : guillotine, personnage historique…) est dessiné par
// Agnes Image (gratuit) puis retracé au feutre ; sans Agnes (réglage coupé, clé absente, refus, panne), le dessin de
// Claude reste. Les images partent une à une (débit d'Agnes), même quand trois illustrations se préparent ensemble.
// Chaque objet retracé est gardé (IndexedDB « trace: ») : jamais redemandé, même pour un autre projet.
let traceQueue = Promise.resolve(), traceUnsupported = false, traceSizeRefused = false, traceCalls = 0;
function tracePromptFor(subject) {
    return 'Simple black marker line drawing of ' + subject + ', whiteboard doodle: bold clean black outlines on a pure white background, no shading, no fill, no grey, no color, no text, no letters, no frame, one single subject centered and filling the frame, few lines, minimal details, like a teacher drawing on a whiteboard.';
}
const traceCacheKey = subject => 'trace:' + subject.toLowerCase().replace(/\s+/g, ' ');
async function traceCacheGet(subject) { try { const v = await idbGet(traceCacheKey(subject)); return Array.isArray(v) && v.length ? v : null; } catch (e) { return null; } }
// opts.fresh : nouveau dessin demandé (dessin refusé par Claude) ; opts.deadline : plus d'appel à Agnes après cette heure
async function traceDrawingElements(raw, opts = {}) {
    if (state.traceDrawings === false || !Array.isArray(raw?.elements) || !getAgnesKey()) return 0;
    await loadIcons();
    const use3d = iconStyle() === '3d';
    let done = 0;
    for (const e of raw.elements.slice(0, 3)) {   // l'affichage n'en garde que 3 (layoutDrawing)
        if (!e || Array.isArray(e.traced) || state.stopRequested) continue;
        const keys = String(e.icon || '').split(/\s*[,;|]\s*/);
        if (e.icon && (findIcon(keys) || (use3d && typeof findEmoji === 'function' && findEmoji(keys)))) continue;   // icône toute faite : nette, on la garde
        // objet décrit en anglais par Claude, sinon les mots-clés anglais de l'icône introuvable (jamais le mot-clé
        // affiché, souvent abstrait : « Privilèges »)
        const subject = String(e.draw || keys.filter(Boolean).join(', ')).trim().slice(0, 120);
        if (!subject) continue;
        const cached = opts.fresh ? null : await traceCacheGet(subject);
        if (cached) { e.traced = cached; done++; continue; }
        if (agnesImageUnsupported || traceUnsupported || (opts.deadline && Date.now() > opts.deadline)) continue;
        const job = traceQueue.then(async () => {
            if (state.stopRequested || agnesImageUnsupported || traceUnsupported) return null;
            // un refus de cette demande (texte seul) ne doit pas couper Agnes Image pour le casting de poses
            const before = agnesImageUnsupported;
            const ask = size => { traceCalls++; log('Agnes Image (gratuit) : illustration « ' + subject + ' » (' + traceCalls + ' depuis l\'ouverture)'); return agnesImage(tracePromptFor(subject), null, size); };
            // taille carrée d'abord ; refusée une fois (400/422) → taille par défaut pour toute la session
            const first = traceSizeRefused ? ask() : ask('960x960').catch(err => {
                if (!/HTTP 4(00|22)/.test(err.message) || state.stopRequested) return Promise.reject(err);
                traceSizeRefused = true; return ask();
            });
            try { return await traceImageToPaths(await withTimeout(first, 150000, 'Agnes Image trop lent')); }
            catch (err) { if (agnesImageUnsupported && !before) { agnesImageUnsupported = false; traceUnsupported = true; } throw err; }
        });
        traceQueue = job.catch(() => {});
        try {
            const paths = await job;
            if (paths && paths.length >= 2) { e.traced = paths; done++; idbPut(traceCacheKey(subject), paths).catch(() => {}); }
        } catch (err) { log('Illustration « ' + subject + ' » : ' + err.message + ' — dessin de Claude gardé'); }
    }
    return done;
}
// Génération en arrière-plan : le serveur fait les dessins de Claude mais ne peut pas les retracer. Le téléphone le fait
// pendant que le serveur fabrique les vidéos (résultats gardés en cache), puis au retour des résultats (borné dans le temps).
let traceBgJob = '';
function traceBackgroundDrawings(jobId, drawings) {
    if (!jobId || traceBgJob === jobId || !Array.isArray(drawings) || !drawings.some(Boolean)) return;
    traceBgJob = jobId;
    (async () => { for (const d of drawings) if (d && Array.isArray(d.elements)) await traceDrawingElements(JSON.parse(JSON.stringify(d))).catch(() => {}); })();
}
// Image choisie par l'utilisateur (photo, dessin scanné…) → illustration au feutre de la scène i
async function drawingFromImage(i, dataUri) {
    const probe = await loadImageEl(dataUri);   // la taille se lit avant le décodage complet
    if ((probe.naturalWidth || 0) * (probe.naturalHeight || 0) > 50e6) throw new Error('image trop grande (50 millions de pixels au plus)');
    const traced = await withTimeout((async () => traceImageToPaths(await downscaleImage(dataUri, 1024, 0.9), { photo: 'auto' }))(), 30000, 'image trop longue à lire');
    if (!traced) throw new Error('rien d\'assez net à dessiner dans cette image');
    const old = state.drawings[i]?.raw;
    const label = String(old?.elements?.[0]?.label || scenePlanFor(i).bubble || '').trim().slice(0, 28);
    state.drawings[i] = await compileStoredDrawing({ elements: [{ label, word: '', icon: '', draw: '', paths: [], traced, fromImage: true }], link: 'none' });
    saveProject();
    return state.drawings[i];
}
