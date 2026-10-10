// ══════════════════════════════════════════════════════════════════
// PERSONNAGE DÉFORMABLE (9.0) — maillage « aussi rigide que possible » (ARAP)
// Portage JavaScript d'effectcraft (crates/effects/src/puppet/arap.rs : Igarashi, Moscovich & Hughes, « As-Rigid-As-
// Possible Shape Manipulation », SIGGRAPH 2005 — étape similitude puis étape d'ajustement rigide, gradient conjugué
// préconditionné) — ArtCraft Team et contributeurs d'EffectCraft, MIT ou Apache 2.0.
// Différence voulue : les matrices ne dépendent que du maillage et des points tenus, elles sont donc préparées et
// factorisées une fois par personnage (`arapPrepare`, Cholesky) ; chaque image ne refait que les seconds membres.
// ══════════════════════════════════════════════════════════════════
const ARAP_REG = 1e-6;   // (1e-9 dans le Rust) assez grand pour que Cholesky reste juste sur une pièce détachée du corps

// Matrice creuse symétrique : lignes en Map pendant l'assemblage, puis réduite aux inconnues libres (CSR).
function arapSparse(n) { return Array.from({ length: n }, () => new Map()); }
function arapAdd(rows, i, j, v) { rows[i].set(j, (rows[i].get(j) || 0) + v); }
// Système réduit aux inconnues libres : A_ff x_f = b_f − A_fc x_c (la partie fixe est gardée pour le second membre)
function arapReduce(rows, free) {
    const n = rows.length, idx = [], pos = new Int32Array(n).fill(-1);
    for (let i = 0; i < n; i++) if (free[i]) { pos[i] = idx.length; idx.push(i); }
    const m = idx.length, ptr = [0], col = [], val = [], diag = new Float64Array(m).fill(1), fixCol = [], fixVal = [], fixPtr = [0];
    idx.forEach((i, k) => {
        for (const [j, v] of rows[i]) {
            if (free[j]) { col.push(pos[j]); val.push(v); if (j === i) diag[k] = Math.abs(v) > 1e-300 ? v : 1; }
            else { fixCol.push(j); fixVal.push(v); }
        }
        ptr.push(col.length); fixPtr.push(fixCol.length);
    });
    return { n, m, idx, ptr: Int32Array.from(ptr), col: Int32Array.from(col), val: Float64Array.from(val), diag,
        fixPtr: Int32Array.from(fixPtr), fixCol: Int32Array.from(fixCol), fixVal: Float64Array.from(fixVal),
        r: new Float64Array(m), z: new Float64Array(m), p: new Float64Array(m), ap: new Float64Array(m), xf: new Float64Array(m), rhs: new Float64Array(m) };
}
// Factorisation de Cholesky du système réduit (dense : m ≤ ≈ 700), faite une fois par personnage. Chaque image ne fait
// ensuite que deux substitutions (au lieu de dizaines d'itérations de gradient conjugué) : bien moins d'une milliseconde.
function arapFactor(S) {
    const m = S.m;
    if (!m || m > 900) return;   // trop grand : on garde le gradient conjugué
    const L = new Float64Array(m * m);
    for (let k = 0; k < m; k++) for (let q = S.ptr[k]; q < S.ptr[k + 1]; q++) L[k * m + S.col[q]] = S.val[q];
    for (let j = 0; j < m; j++) {
        let d = L[j * m + j];
        for (let k = 0; k < j; k++) d -= L[j * m + k] * L[j * m + k];
        if (!(d > 1e-14)) return;   // non défini positif (ne devrait pas arriver) : gradient conjugué
        d = Math.sqrt(d); L[j * m + j] = d;
        for (let i = j + 1; i < m; i++) {
            let s = L[i * m + j];
            for (let k = 0; k < j; k++) s -= L[i * m + k] * L[j * m + k];
            L[i * m + j] = s / d;
        }
    }
    for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) L[i * m + j] = 0;
    S.L = L;
}
// Résout A_ff x_f = b_f − A_fc x_c : Cholesky si prêt, sinon gradient conjugué préconditionné (Jacobi) en partant de x.
function arapSolve(S, b, x, maxIter) {
    const { m, idx, ptr, col, val, diag, fixPtr, fixCol, fixVal, r, z, p, ap, xf, rhs } = S;
    if (!m) return;
    let bnorm = 0;
    for (let k = 0; k < m; k++) {
        let s = b[idx[k]];
        for (let q = fixPtr[k]; q < fixPtr[k + 1]; q++) s -= fixVal[q] * x[fixCol[q]];
        rhs[k] = s; bnorm += s * s; xf[k] = x[idx[k]];
    }
    if (S.L) {
        const L = S.L;
        for (let i = 0; i < m; i++) { let s = rhs[i]; const o = i * m; for (let k = 0; k < i; k++) s -= L[o + k] * xf[k]; xf[i] = s / L[o + i]; }
        for (let i = m - 1; i >= 0; i--) { let s = xf[i]; for (let k = i + 1; k < m; k++) s -= L[k * m + i] * xf[k]; xf[i] = s / L[i * m + i]; }
        for (let k = 0; k < m; k++) x[idx[k]] = xf[k];
        return;
    }
    bnorm = Math.max(Math.sqrt(bnorm), 1e-30);
    const mul = (v, out) => { for (let k = 0; k < m; k++) { let s = 0; for (let q = ptr[k]; q < ptr[k + 1]; q++) s += val[q] * v[col[q]]; out[k] = s; } };
    mul(xf, ap);
    let rz = 0;
    for (let k = 0; k < m; k++) { r[k] = rhs[k] - ap[k]; z[k] = r[k] / diag[k]; p[k] = z[k]; rz += r[k] * z[k]; }
    const limit = maxIter || 4 * m + 50;
    for (let it = 0; it < limit; it++) {
        let rr = 0;
        for (let k = 0; k < m; k++) rr += r[k] * r[k];
        if (Math.sqrt(rr) <= 1e-10 * bnorm) break;   // (1e-13 dans le Rust : 1e-10 suffit à l'écran, au pixel près)
        mul(p, ap);
        let pap = 0;
        for (let k = 0; k < m; k++) pap += p[k] * ap[k];
        if (Math.abs(pap) < 1e-300) break;
        const alpha = rz / pap;
        let rz2 = 0;
        for (let k = 0; k < m; k++) { xf[k] += alpha * p[k]; r[k] -= alpha * ap[k]; z[k] = r[k] / diag[k]; rz2 += r[k] * z[k]; }
        const beta = rz2 / rz;
        rz = rz2;
        for (let k = 0; k < m; k++) p[k] = z[k] + beta * p[k];
    }
    for (let k = 0; k < m; k++) x[idx[k]] = xf[k];
}
function arapMeanEdge2(rest, tris) {
    if (!tris.length) return 1;
    let s = 0;
    for (const t of tris) { const a = rest[t[0]], b = rest[t[1]]; s += (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2; }
    return s / tris.length;
}
// Copie rigide du triangle de repos la plus proche du triangle courant (rotation autour des centres) : écrit les 3
// sommets dans `out` (6 nombres), sans rien créer (appelé pour chaque triangle à chaque image).
function arapFitRigid(rx, ry, cx, cy, a, b, c, out) {
    const crx = (rx[a] + rx[b] + rx[c]) / 3, cry = (ry[a] + ry[b] + ry[c]) / 3, ccx = (cx[a] + cx[b] + cx[c]) / 3, ccy = (cy[a] + cy[b] + cy[c]) / 3;
    let sd = 0, sc = 0;
    for (let k = 0; k < 3; k++) {
        const v = k === 0 ? a : k === 1 ? b : c, px = rx[v] - crx, py = ry[v] - cry, qx = cx[v] - ccx, qy = cy[v] - ccy;
        sd += px * qx + py * qy; sc += px * qy - py * qx;
    }
    const ang = Math.atan2(sc, sd), sn = Math.sin(ang), co = Math.cos(ang);
    for (let k = 0; k < 3; k++) { const v = k === 0 ? a : k === 1 ? b : c, px = rx[v] - crx, py = ry[v] - cry; out[2 * k] = ccx + px * co - py * sn; out[2 * k + 1] = ccy + px * sn + py * co; }
}
// Prépare un personnage : maillage de repos (`rest` [[x,y]…], `tris` [[i,j,k]…] dans le sens trigonométrique écran),
// indices des points tenus (`pinned`), poids par triangle (1 = normal). Le résultat sert à chaque image.
function arapPrepare(rest, tris, pinned, weights) {
    const n = rest.length, fixed = new Uint8Array(n);
    pinned.forEach(i => { fixed[i] = 1; });
    const w = k => (weights && weights[k]) || 1, reg = ARAP_REG * Math.min(1, 1 / Math.max(arapMeanEdge2(rest, tris), 1e-12));
    // étape 1 : énergie invariante par similitude sur 2n inconnues (x0, y0, x1, y1…)
    const A = arapSparse(2 * n);
    tris.forEach((t, k) => {
        const wk = w(k);
        for (const [i, j, l] of [[t[0], t[1], t[2]], [t[1], t[2], t[0]], [t[2], t[0], t[1]]]) {
            const ex = rest[j][0] - rest[i][0], ey = rest[j][1] - rest[i][1], dx = rest[l][0] - rest[i][0], dy = rest[l][1] - rest[i][1];
            const ee = ex * ex + ey * ey;
            if (ee <= 1e-18) continue;
            const x = (dx * ex + dy * ey) / ee, y = (dx * -ey + dy * ex) / ee;   // R90(e) = (−e.y, e.x)
            const blocks = [[l, [[1, 0], [0, 1]]], [i, [[x - 1, -y], [y, x - 1]]], [j, [[-x, y], [-y, -x]]]];
            for (const [va, ba] of blocks) for (const [vb, bb] of blocks) for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
                const v = ba[0][r] * bb[0][c] + ba[1][r] * bb[1][c];
                if (v !== 0) arapAdd(A, 2 * va + r, 2 * vb + c, wk * v);
            }
        }
    });
    for (let i = 0; i < 2 * n; i++) arapAdd(A, i, i, reg);
    // étape 2 : laplacien des arêtes (x et y séparément)
    const L = arapSparse(n);
    tris.forEach((t, k) => {
        const wk = w(k);
        for (const [i, j] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) { arapAdd(L, i, i, wk); arapAdd(L, j, j, wk); arapAdd(L, i, j, -wk); arapAdd(L, j, i, -wk); }
    });
    for (let i = 0; i < n; i++) arapAdd(L, i, i, reg);
    const free2 = Array.from({ length: 2 * n }, (_, k) => !fixed[k >> 1]), free1 = Array.from({ length: n }, (_, i) => !fixed[i]);
    const S1 = arapReduce(A, free2), S2 = arapReduce(L, free1), xs = new Float64Array(n), ys = new Float64Array(n);
    arapFactor(S1); arapFactor(S2);
    return { n, rest, tris, pinned: pinned.slice(), w: tris.map((_, k) => w(k)), reg, S1, S2,
        rx: Float64Array.from(rest, p => p[0]), ry: Float64Array.from(rest, p => p[1]), tri: Int32Array.from(tris.flat()),
        x: new Float64Array(2 * n), b1: new Float64Array(2 * n), xs, ys, bx: new Float64Array(n), by: new Float64Array(n),
        fit: new Float64Array(6), out: { x: xs, y: ys } };
}
// Déforme : `targets` = positions des points tenus (même ordre que `pinned`). Rend { x, y } (Float64Array, n points),
// réutilisés d'une image à l'autre. `refine` : passes de rigidité en plus. Aucune allocation par image.
function arapDeform(P, targets, refine = 0) {
    const { n, rx, ry, tri, pinned, reg, S1, S2, x, b1, xs, ys, bx, by, fit, w } = P;
    if (!n) return P.out;
    let tx = 0, ty = 0;
    for (let k = 0; k < pinned.length; k++) { tx += targets[k][0] - rx[pinned[k]]; ty += targets[k][1] - ry[pinned[k]]; }
    if (pinned.length) { tx /= pinned.length; ty /= pinned.length; }
    if (pinned.length <= 1) { for (let i = 0; i < n; i++) { xs[i] = rx[i] + tx; ys[i] = ry[i] + ty; } return P.out; }   // un point : translation exacte (#313 du Rust)
    // départ : le repos décalé du déplacement moyen des points tenus ; attache faible (régularisation) vers lui
    for (let i = 0; i < n; i++) { x[2 * i] = rx[i] + tx; x[2 * i + 1] = ry[i] + ty; b1[2 * i] = reg * (rx[i] + tx); b1[2 * i + 1] = reg * (ry[i] + ty); }
    for (let k = 0; k < pinned.length; k++) { x[2 * pinned[k]] = targets[k][0]; x[2 * pinned[k] + 1] = targets[k][1]; }
    arapSolve(S1, b1, x);   // étape 1 : similitude
    for (let i = 0; i < n; i++) { xs[i] = x[2 * i]; ys[i] = x[2 * i + 1]; }
    for (let pass = 0; pass <= refine; pass++) {   // étape 2 : triangles rigides, puis arêtes ajustées
        for (let i = 0; i < n; i++) { bx[i] = reg * (rx[i] + tx); by[i] = reg * (ry[i] + ty); }
        for (let k = 0, T = tri.length / 3; k < T; k++) {
            const a = tri[3 * k], b = tri[3 * k + 1], c = tri[3 * k + 2], wk = w[k];
            arapFitRigid(rx, ry, xs, ys, a, b, c, fit);
            for (let e = 0; e < 3; e++) {
                const i = e === 0 ? a : e === 1 ? b : c, j = e === 0 ? b : e === 1 ? c : a, fi = e, fj = (e + 1) % 3;
                const dx = fit[2 * fj] - fit[2 * fi], dy = fit[2 * fj + 1] - fit[2 * fi + 1];
                bx[j] += wk * dx; bx[i] -= wk * dx; by[j] += wk * dy; by[i] -= wk * dy;
            }
        }
        for (let k = 0; k < pinned.length; k++) { xs[pinned[k]] = targets[k][0]; ys[pinned[k]] = targets[k][1]; }
        arapSolve(S2, bx, xs); arapSolve(S2, by, ys);
    }
    return P.out;
}

// ── Maillage d'une pose ──
// Grille de triangles posée sur la silhouette (cases touchées par le personnage, élargies d'une case pour ne rien
// couper quand il se plie) : plus simple que la triangulation de Delaunay d'EffectCraft et suffisant ici, la
// transparence de l'image faisant le contour exact.
const PUPPET_MESH_ROWS = 26;
function puppetMeshFor(canvas) {
    const W = canvas.width, H = canvas.height;
    if (!W || !H) return null;
    const cs = H / PUPPET_MESH_ROWS, cols = Math.max(2, Math.ceil(W / cs)), rows = PUPPET_MESH_ROWS, cw = W / cols;   // cases calées sur l'image
    // transparence lue en pleine résolution, une fois par pose (un objet fin détaché ne doit pas disparaître)
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    let a;
    try { const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(canvas, 0, 0); a = g.getImageData(0, 0, W, H).data; }
    finally { c.width = c.height = 0; }
    const on = new Uint8Array(cols * rows);
    for (let y = 0; y < H; y++) { const j = Math.min(rows - 1, (y / cs) | 0); for (let x = 0; x < W; x++) if (a[(y * W + x) * 4 + 3] > 20) on[j * cols + Math.min(cols - 1, (x / cw) | 0)] = 1; }
    const grown = on.slice();   // élargi d'une case
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) if (on[j * cols + i]) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < cols && jj < rows) grown[jj * cols + ii] = 1; }
    const vid = new Int32Array((cols + 1) * (rows + 1)).fill(-1), rest = [], tris = [];
    const v = (i, j) => { const k = j * (cols + 1) + i; if (vid[k] < 0) { vid[k] = rest.length; rest.push([i * cw, j * cs]); } return vid[k]; };
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) if (grown[j * cols + i]) {
        const a0 = v(i, j), b0 = v(i + 1, j), c0 = v(i + 1, j + 1), d0 = v(i, j + 1);
        tris.push([a0, c0, b0], [a0, d0, c0]);
    }
    if (tris.length < 4 || rest.length > 65535) return null;   // indices 16 bits
    // points tenus : les pieds (bas 8 %) restent, la tête (haut 24 %) bouge d'un bloc ; le corps entre les deux se plie
    let top = Infinity, bottom = -Infinity;
    rest.forEach(p => { top = Math.min(top, p[1]); bottom = Math.max(bottom, p[1]); });
    const span = bottom - top, feet = [], head = [];
    rest.forEach((p, k) => { if (p[1] >= bottom - span * 0.08) feet.push(k); else if (p[1] <= top + span * 0.24) head.push(k); });
    if (!feet.length || !head.length) return null;
    let hx = 0; head.forEach(k => { hx += rest[k][0]; }); hx /= head.length;
    const pinned = feet.concat(head), P = arapPrepare(rest, tris, pinned);
    return { W, H, rest, tris, uv: rest.map(p => [p[0] / W, p[1] / H]), P, pinned, nFeet: feet.length, pivot: [hx, top + span * 0.24], span,
        targets: pinned.map(k => [rest[k][0], rest[k][1]]), idx: Uint16Array.from(tris.flat()) };
}
// Positions des points tenus pour une image : la tête tourne autour du cou (θ) et se décale (dx, dy), les pieds restent.
function puppetTargets(M, theta, dx, dy) {
    const cs = Math.cos(theta), sn = Math.sin(theta), [px, py] = M.pivot;
    M.pinned.forEach((k, n) => {
        const p = M.rest[k];
        if (n < M.nFeet) { M.targets[n][0] = p[0]; M.targets[n][1] = p[1]; return; }
        const x = p[0] - px, y = p[1] - py;
        M.targets[n][0] = px + x * cs - y * sn + dx; M.targets[n][1] = py + x * sn + y * cs + dy;
    });
    return M.targets;
}

// ── Rendu WebGL du maillage déformé (un seul contexte pour tout le montage ; sans WebGL : personnage rigide) ──
let puppetGl = null;
function puppetGlRenderer() {
    if (puppetGl && !puppetGl.failed && !puppetGl.lost && puppetGl.gl.isContextLost()) { puppetGl.lost = true; puppetGl.canvas.width = puppetGl.canvas.height = 1; }
    if (puppetGl && !puppetGl.lost) return puppetGl.failed ? null : puppetGl;
    const canvas = document.createElement('canvas');
    let gl = null;
    try { gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: true, preserveDrawingBuffer: true }); } catch (e) {}
    if (!gl) { puppetGl = { failed: true }; return null; }
    const R = { canvas, gl, lost: false, tex: new WeakMap(), mesh: null };
    try {
        const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
        const prog = gl.createProgram();
        gl.attachShader(prog, sh(gl.VERTEX_SHADER, 'attribute vec2 pos; attribute vec2 uv; uniform vec2 size; varying vec2 v; void main() { v = uv; gl_Position = vec4(pos.x / size.x * 2.0 - 1.0, 1.0 - pos.y / size.y * 2.0, 0.0, 1.0); }'));
        gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\nvarying vec2 v; uniform sampler2D tex; void main() { gl_FragColor = texture2D(tex, v); }'));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('programme WebGL');
        gl.useProgram(prog);
        R.loc = { pos: gl.getAttribLocation(prog, 'pos'), uv: gl.getAttribLocation(prog, 'uv'), size: gl.getUniformLocation(prog, 'size'), tex: gl.getUniformLocation(prog, 'tex') };
        R.posBuf = gl.createBuffer(); R.uvBuf = gl.createBuffer(); R.idxBuf = gl.createBuffer();
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // plis : textures prémultipliées
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    } catch (e) { log('Personnage déformable indisponible (' + e.message + ') : personnage rigide'); puppetGl = { failed: true }; return null; }
    canvas.addEventListener('webglcontextlost', () => { R.lost = true; });   // iPhone : nouveau contexte à l'image suivante (pas de restauration : mémoire)
    // k : échelle de rendu (taille affichée) — moins de pixels à recopier dans l'image de la vidéo à chaque image
    R.draw = (img, M, def, pad, k = 1) => {
        const W = M.W + 2 * pad, H = M.H + 2 * pad, cw = Math.max(1, Math.round(W * k)), chh = Math.max(1, Math.round(H * k));
        if (canvas.width !== cw || canvas.height !== chh) { canvas.width = cw; canvas.height = chh; }
        gl.viewport(0, 0, cw, chh);
        if (R.mesh !== M) {   // maillage changé (autre pose) : coordonnées de texture et triangles
            gl.bindBuffer(gl.ARRAY_BUFFER, R.uvBuf); gl.bufferData(gl.ARRAY_BUFFER, Float32Array.from(M.uv.flat()), gl.STATIC_DRAW);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, R.idxBuf); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, M.idx, gl.STATIC_DRAW);
            R.pos = new Float32Array(M.rest.length * 2); R.mesh = M;
        }
        for (let i = 0; i < M.rest.length; i++) { R.pos[2 * i] = def.x[i] + pad; R.pos[2 * i + 1] = def.y[i] + pad; }
        gl.bindBuffer(gl.ARRAY_BUFFER, R.posBuf); gl.bufferData(gl.ARRAY_BUFFER, R.pos, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(R.loc.pos); gl.vertexAttribPointer(R.loc.pos, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, R.uvBuf); gl.enableVertexAttribArray(R.loc.uv); gl.vertexAttribPointer(R.loc.uv, 2, gl.FLOAT, false, 0, 0);
        let tex = R.tex.get(img);   // chaque image de bouche envoyée une seule fois
        if (!tex) {
            tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
            [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(k => gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE));
            [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach(k => gl.texParameteri(gl.TEXTURE_2D, k, gl.LINEAR));
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            R.tex.set(img, tex);
        } else gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform2f(R.loc.size, W, H); gl.uniform1i(R.loc.tex, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, R.idxBuf);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawElements(gl.TRIANGLES, M.idx.length, gl.UNSIGNED_SHORT, 0);
        return canvas;
    };
    R.dispose = () => { try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch (e) {} canvas.width = canvas.height = 1; puppetGl = null; };
    puppetGl = R;
    return R;
}
function disposePuppetRenderer() { if (puppetGl && puppetGl.dispose) puppetGl.dispose(); puppetGl = null; puppetSlow = { n: 0, sum: 0, off: false }; puppetBudget = PUPPET_SLOW_MS; }

// Personnage vivant : la tête penche et hoche quand il parle, le corps se plie doucement au-dessus des pieds.
// img = image de bouche à dessiner, base = image bouche fermée de la même pose (maillage commun, même cadre).
// Rend { canvas, pad } ou null (réglage coupé, pas de WebGL, maillage impossible) → personnage rigide comme avant.
const puppetMeshes = new WeakMap();
// Garde-fou : si un appareil met trop longtemps à dessiner le personnage vivant (copie de l'image WebGL lente),
// l'appli repasse d'elle-même au personnage rigide jusqu'à la fin du montage (remis à zéro par disposePuppetRenderer).
const PUPPET_SLOW_MS = 14;
let puppetSlow = { n: 0, sum: 0, off: false }, puppetBudget = PUPPET_SLOW_MS;
function setPuppetBudget(ms) { puppetBudget = ms; }
function puppetCost(ms) {
    if (puppetSlow.off) return;
    puppetSlow.n++; puppetSlow.sum += ms;
    if (puppetSlow.n >= 12 && puppetSlow.sum / puppetSlow.n > puppetBudget) { puppetSlow.off = true; log('Personnage vivant trop lent sur cet appareil (' + Math.round(puppetSlow.sum / puppetSlow.n) + ' ms par image) : personnage rigide pour ce montage'); }
    if (puppetSlow.n >= 60) { puppetSlow.n = 0; puppetSlow.sum = 0; }   // moyenne glissante
}
function deformedPuppet(img, base, t, talk, k) {
    if (state.puppetDeform === false || puppetSlow.off || !img || !base) return null;
    const R = puppetGlRenderer();
    if (!R) return null;
    let M = puppetMeshes.get(base);
    if (M === undefined) { try { M = puppetMeshFor(base); } catch (e) { log('Maillage du personnage impossible : ' + e.message); M = null; } puppetMeshes.set(base, M); }
    if (!M) return null;
    // tête qui penche (≈ 5°) et hoche en parlant, corps qui se plie (≈ 3,5 % de la hauteur) : visible sans être agité
    const theta = 0.085 * Math.sin(t * 2 * Math.PI / 3.7 + 0.5) + 0.05 * talk * Math.sin(t * 2 * Math.PI * 1.4);
    const dx = M.span * 0.035 * Math.sin(t * 2 * Math.PI / 5.3 + 1), dy = M.span * 0.012 * talk;
    const def = arapDeform(M.P, puppetTargets(M, theta, dx, dy), 0);
    const pad = Math.round(M.span * 0.1);
    const cv = R.draw(img, M, def, pad, Math.min(1, k || 1));
    if (R.gl.isContextLost()) { R.lost = true; return null; }   // cette image-ci rigide, la suivante avec un nouveau contexte
    return { canvas: cv, pad };
}

// 5. Préparation des poses avant le montage (maillage, Cholesky, textures) : pas d'à-coup à leur première apparition
async function prewarmPuppet(sprites) {
    if (state.puppetDeform === false) return;
    for (const sp of Object.values(sprites || {})) {
        if (!sp || !sp.closed || sp.rigid) continue;
        for (const k of ['closed', 'mid', 'open']) if (sp[k]) deformedPuppet(sp[k], sp.closed, 0, 0, 1);
        await new Promise(r => setTimeout(r, 0));
    }
}
