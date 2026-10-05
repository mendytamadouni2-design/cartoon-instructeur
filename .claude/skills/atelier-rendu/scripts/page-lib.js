// Code injecté dans la page de l'appli : rendus réalistes + mesures de chevauchement (aucune modif de l'appli)
window.CK = (() => {
    const CK = {};
    CK.mk = (W, H) => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
    // Personnage simulé : silhouette recadrée comme loadPuppetSprites (2 % de marge en haut), tête bien visible
    CK.sprite = (headOnly) => {
        const c = CK.mk(360, 1000), g = c.getContext('2d');
        if (!headOnly) {
            g.fillStyle = '#2f6fdf'; roundRectPath(g, 40, 300, 280, 520, 50); g.fill();
            g.fillStyle = '#1e3a8a'; g.fillRect(85, 800, 75, 195); g.fillRect(200, 800, 75, 195);
        }
        g.fillStyle = '#f4a261'; g.beginPath(); g.arc(180, 157, 135, 0, Math.PI * 2); g.fill();
        g.lineWidth = 8; g.strokeStyle = '#7a3e12'; g.stroke();
        if (!headOnly) {
            g.fillStyle = '#222'; g.beginPath(); g.arc(135, 140, 14, 0, 7); g.arc(225, 140, 14, 0, 7); g.fill();
            g.lineWidth = 8; g.beginPath(); g.arc(180, 185, 50, 0.2, Math.PI - 0.2); g.stroke();
        }
        return c;
    };
    CK.puppet = (g, W, H, spr) => drawPuppet(g, W, H, { sprite: { closed: spr }, t: 3, env: null, bufTime: 0, first: false, poseChanged: false, wb: true });
    CK.prepDrawing = async () => {
        state.selectedStyle = 'whiteboard'; state.iconStyle = 'auto';
        await loadIcons();
        const raw = { link: 'arrow', elements: [
            { label: 'Fourmi', word: '', icon: 'bug', paths: [] },
            { label: 'Sieste', word: '', icon: 'moon', paths: [] },
            { label: 'Énergie', word: '', icon: 'zap', paths: [] }] };
        CK.drawing = compileDrawing(layoutDrawing(raw));
        CK.spr = CK.sprite(false); CK.head = CK.sprite(true);
        return !!CK.drawing;
    };
    // sous-titres : 6 mots calés, le groupe « par petites siestes. » est affiché à t = 1,5 s
    CK.words = [['Les', 0.2, 0.5], ['fourmis', 0.5, 0.9], ['dorment', 0.9, 1.3], ['par', 1.3, 1.45], ['petites', 1.45, 1.9], ['siestes.', 1.9, 2.4]].map(([text, start, end]) => ({ text, start, end }));
    const alphaMask = c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, m = new Uint8Array(c.width * c.height); for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 60 ? 1 : 0; return m; };
    const bbox = (m, W) => { let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; for (let i = 0; i < m.length; i++) if (m[i]) { const x = i % W, y = (i / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return x1 < 0 ? null : { x0, y0, x1, y1 }; };
    const inter = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] && b[i]) n++; return n; };
    // Image complète du tableau blanc + mesures : annotation ∩ dessin / tête / corps / sous-titres / interface TikTok
    CK.board = (W, H, kind, text, t, opt = {}) => {
        const area = opt.area || puppetDrawingArea(W, H);
        const L = {};
        L.puppet = CK.mk(W, H); CK.puppet(L.puppet.getContext('2d'), W, H, CK.spr);
        L.head = CK.mk(W, H); CK.puppet(L.head.getContext('2d'), W, H, CK.head);
        // montage : avec le correctif, le dessin prend la case que la note lui laisse (boardNoteLayout(...).draw)
        const note = typeof boardNoteLayout === 'function' ? boardNoteLayout(CK.mk(8, 8).getContext('2d'), area, kind, text, true) : null;
        const sketchArea = note ? note.draw : area;
        L.draw = CK.mk(W, H); drawSketch(L.draw.getContext('2d'), sketchArea, CK.drawing, 1, 1);
        L.stk = CK.mk(W, H); const sg = L.stk.getContext('2d'), fonts = [];
        const ft = sg.fillText.bind(sg); sg.fillText = (s, ...a) => { fonts.push(String(s) + ' @' + sg.font.match(/(\d+(?:\.\d+)?)px/)[1] + 'px'); return ft(s, ...a); };
        const st = sg.strokeText.bind(sg); sg.strokeText = (s, ...a) => st(s, ...a);
        (opt.fn || drawBoardSticker)(sg, area, kind, text, t, 3, W, H, note);   // même mise en page que le montage
        L.cap = CK.mk(W, H); drawWordCaptions(L.cap.getContext('2d'), W, H, captionGroups(CK.words), t);
        const out = CK.mk(W, H), g = out.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
        ['puppet', 'draw', 'stk', 'cap'].forEach(k => g.drawImage(L[k], 0, 0));
        const M = {}; ['puppet', 'head', 'draw', 'stk', 'cap'].forEach(k => M[k] = alphaMask(L[k]));
        const tik = new Uint8Array(W * H);
        if (H > W * 1.1) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const fx = x / W, fy = y / H; if ((fx > 0.83 && fy > 0.35 && fy < 0.87) || fy > 0.8 || fy < 0.08) tik[y * W + x] = 1; }
        const sb = bbox(M.stk, W), db = bbox(M.draw, W), cb = bbox(M.cap, W), hb = bbox(M.head, W);
        const meas = { kind, area: [area.x, area.y, area.w, area.h].map(Math.round), stk: sb, drawInk: db, cap: cb, head: hb,
            onDraw: inter(M.stk, M.draw), onHead: inter(M.stk, M.head), onBody: inter(M.stk, M.puppet) - inter(M.stk, M.head), onCap: inter(M.stk, M.cap), onTikTok: inter(M.stk, tik),
            gapToCap: sb && cb ? cb.y0 - sb.y1 : null, gapToHead: sb && hb ? hb.y0 - sb.y1 : null, sketch: [sketchArea.x, sketchArea.y, sketchArea.w, sketchArea.h].map(Math.round), fonts };
        return { canvas: out, meas, area, sketchArea };
    };
    // Calques de contrôle (sur une COPIE) : zones masquées par TikTok / Shorts, zone sûre de l'appli, zone du dessin
    CK.overlay = (src, area, opts = {}) => {
        const W = src.width, H = src.height, c = CK.mk(W, H), g = c.getContext('2d');
        g.drawImage(src, 0, 0);
        if (H > W * 1.1) {
            g.fillStyle = 'rgba(255,0,0,' + (opts.alpha || 0.16) + ')';
            g.fillRect(W * 0.83, H * 0.35, W * 0.17, H * 0.45); g.fillRect(0, H * 0.8, W, H * 0.2); g.fillRect(0, 0, W, H * 0.08);
            const sz = safeZone(W, H);
            if (sz.on) { g.setLineDash([18, 12]); g.lineWidth = 4; g.strokeStyle = 'rgba(0,160,0,0.8)'; g.strokeRect(sz.cx - sz.maxW / 2, sz.top, sz.maxW, H * 0.8 - sz.top); g.setLineDash([]); }
        }
        if (area && opts.area !== false) { g.setLineDash([10, 10]); g.lineWidth = 3; g.strokeStyle = 'rgba(0,170,220,0.9)'; g.strokeRect(area.x, area.y, area.w, area.h); g.setLineDash([]); }
        return c;
    };
    // Planche : cases réduites + étiquettes
    CK.sheet = (cells, cols, cw, ch, title, opts = {}) => {
        const lab = opts.lab || 30, pad = 10, top = title ? 46 : 0, rows = Math.ceil(cells.length / cols);
        const c = CK.mk(cols * (cw + pad) + pad, top + rows * (ch + lab + pad) + pad), g = c.getContext('2d');
        g.fillStyle = '#e9e9ee'; g.fillRect(0, 0, c.width, c.height);
        if (title) { g.fillStyle = '#111'; g.font = 'bold 26px Arial'; g.textBaseline = 'middle'; g.fillText(title, pad, 24); }
        cells.forEach((cell, i) => {
            const x = pad + (i % cols) * (cw + pad), y = top + pad + Math.floor(i / cols) * (ch + lab + pad);
            g.fillStyle = '#111'; g.font = 'bold ' + (opts.labFont || 18) + 'px Arial'; g.textBaseline = 'middle';
            String(cell.label).split('\n').forEach((l, k, arr) => g.fillText(l, x + 2, y + lab / 2 + (k - (arr.length - 1) / 2) * ((opts.labFont || 18) + 2), cw - 4));
            if (cell.canvas) {
                const s = cell.crop || { x: 0, y: 0, w: cell.canvas.width, h: cell.canvas.height }, k = Math.min(cw / s.w, ch / s.h);
                g.imageSmoothingQuality = 'high';
                g.drawImage(cell.canvas, s.x, s.y, s.w, s.h, x, y + lab, s.w * k, s.h * k);
                g.strokeStyle = cell.bad ? '#e00' : '#999'; g.lineWidth = cell.bad ? 4 : 1; g.strokeRect(x, y + lab, s.w * k, s.h * k);
            }
        });
        return c;
    };
    return CK;
})();
// Case réduite (recadrage + échelle) en PNG
CK.cell = (src, crop, w) => {
    const k = w / crop.w, c = CK.mk(Math.round(crop.w * k), Math.round(crop.h * k)), g = c.getContext('2d');
    g.imageSmoothingQuality = 'high'; g.drawImage(src, crop.x, crop.y, crop.w, crop.h, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
};
// Assemble une planche : sections [{ title, cols, cellW, cells: [{ url, label, bad }] }]
CK.compose = async (title, sections) => {
    const pad = 10, labH = 40, load = u => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = u; });
    for (const s of sections) for (const c of s.cells) c.img = c.url ? await load(c.url) : null;
    const width = Math.max(...sections.map(s => s.cols * (s.cellW + pad) + pad));
    let H = 56;
    const rowsOf = s => { const r = []; for (let i = 0; i < s.cells.length; i += s.cols) r.push(s.cells.slice(i, i + s.cols)); return r; };
    sections.forEach(s => { H += 36; rowsOf(s).forEach(r => { H += labH + Math.max(...r.map(c => c.img ? c.img.height : 0)) + pad; }); H += 6; });
    const cv = CK.mk(width, H), g = cv.getContext('2d');
    g.fillStyle = '#ececf1'; g.fillRect(0, 0, width, H);
    g.fillStyle = '#111'; g.font = 'bold 24px Arial'; g.textBaseline = 'middle'; g.fillText(title, pad, 28, width - 2 * pad);
    let y = 56;
    sections.forEach(s => {
        g.fillStyle = s.color || '#222'; g.fillRect(pad, y + 3, width - 2 * pad, 28);
        g.fillStyle = '#fff'; g.font = 'bold 18px Arial'; g.fillText(s.title, pad + 8, y + 17, width - 2 * pad - 16); y += 36;
        rowsOf(s).forEach(r => {
            const rh = Math.max(...r.map(c => c.img ? c.img.height : 0));
            r.forEach((c, i) => {
                const x = pad + i * (s.cellW + pad);
                g.fillStyle = c.bad ? '#b00020' : '#111'; g.font = 'bold 14px Arial';
                String(c.label || '').split('\n').slice(0, 2).forEach((l, k) => g.fillText(l, x + 2, y + 11 + k * 17, s.cellW - 4));
                if (c.img) { g.drawImage(c.img, x, y + labH); g.strokeStyle = c.bad ? '#e00020' : '#8a8a8a'; g.lineWidth = c.bad ? 3 : 1; g.strokeRect(x + 0.5, y + labH + 0.5, c.img.width - 1, c.img.height - 1); }
            });
            y += labH + rh + pad;
        });
        y += 6;
    });
    return cv.toDataURL('image/png');
};
