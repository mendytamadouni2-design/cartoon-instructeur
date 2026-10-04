// Cartoon Instructeur · Habillage façon TikTok / Instagram : autocollants animés, carte « Suivre » de fin,
// styles de sous-titres supplémentaires et rythme serré (silences coupés au milieu des phrases, à la manière de video-use).
// Idées reprises de HyperFrames (HeyGen, Apache 2.0) et video-use (Browser Use), redessinées pour le canvas.
// (scripts classiques chargés dans l'ordre par index.html : ils partagent les mêmes variables globales)

// ══════════════════════════════════════════════════════════════════
// AUTOCOLLANTS — un par réplique au plus, choisi par Claude (champ « sticker » + « stickerText »)
// ══════════════════════════════════════════════════════════════════
const STICKERS = {
    arrow: { label: '↘️ Note + flèche dessinée', use: 'attirer l\'œil sur le personnage ou un détail ("regarde !", "le piège")', text: true },
    circle: { label: '⭕ Mot entouré à la main', use: 'LE mot ou chiffre à retenir', text: true },
    underline: { label: '〰️ Mot souligné', use: 'une idée importante, une nuance', text: true },
    didyouknow: { label: '💡 Notification « Le savais-tu ? »', use: 'une anecdote ou un fait étonnant (phrase courte de 4 à 9 mots)', text: true },
    check: { label: '✅ Validé + confettis', use: 'bonne réponse, vrai, réussite', text: true },
    cross: { label: '❌ Tampon « FAUX »', use: 'idée reçue démentie, erreur fréquente', text: true },
    confetti: { label: '🎉 Confettis', use: 'célébration, conclusion, record', text: false },
    badge: { label: '🏅 Badge', use: 'un titre court qui claque ("TOP 1", "100 % VRAI", "ASTUCE")', text: true }
};
const STICKER_NAMES = Object.keys(STICKERS);
const STICKER_HOLD = 2.6;

function stickerPlanLine() {
    return '- "sticker" : un autocollant animé façon TikTok sur environ une réplique sur trois (jamais deux de suite, jamais la première, jamais sur une réplique qui a déjà une bulle "bubble" ou un "highlight"), sinon "none". Choix : ' +
        STICKER_NAMES.map(n => '"' + n + '" (' + STICKERS[n].use + ')').join(', ') + '.\n' +
        '- "stickerText" : le texte de l\'autocollant, dans la langue de la vidéo, 1 à 4 mots (sauf "didyouknow" : 4 à 9 mots), exact ; "" si sticker vaut "none" ou "confetti".\n';
}
// Position commune : en haut de l'image, dans la zone visible des Shorts (pas sous les boutons ni la description)
function stickerBox(W, H) {
    const sz = typeof safeZone === 'function' ? safeZone(W, H) : { on: false, cx: W / 2, top: 0, maxW: W * 0.9 };
    return { cx: sz.cx, top: Math.max(H * 0.07, sz.top + H * 0.02), maxW: sz.maxW, base: Math.min(W, H) };
}
// Texte manuscrit (feutre) qui s'écrit de gauche à droite
function writeMarker(ctx, text, x, y, fs, p, color) {
    ctx.save();
    ctx.font = '900 ' + fs + 'px ' + MARKER_FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width;
    ctx.beginPath(); ctx.rect(x - w / 2 - fs, y - fs, (w + fs * 2) * clamp01(p), fs * 2); ctx.clip();
    ctx.lineJoin = 'round'; ctx.lineWidth = fs * 0.22; ctx.strokeStyle = '#fff'; ctx.strokeText(text, x, y);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
    ctx.restore();
    return w;
}
// Trait « à la main » tracé progressivement (p de 0 à 1)
function handStroke(ctx, pts, p, color, width) {
    if (pts.length < 2 || p <= 0) return;
    let total = 0; const seg = [];
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); total += l; }
    let left = total * clamp01(p);
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    [[ '#fff', width * 1.9 ], [ color, width ]].forEach(([c, w]) => {
        ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
        let rest = left;
        for (let i = 1; i < pts.length && rest > 0; i++) {
            const k = Math.min(1, rest / seg[i - 1]);
            ctx.lineTo(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k);
            rest -= seg[i - 1];
        }
        ctx.stroke();
    });
    ctx.restore();
}
// Petit tremblé régulier (pas d'aléatoire : même image à chaque rendu)
const wob = (i, a) => Math.sin(i * 12.9898) * a;

function drawConfetti(ctx, W, H, t, cx, cy) {
    if (t < 0 || t > 2.2) return;
    const cols = [accentColor(), '#ff4f7b', '#4fc3ff', '#7cff6b', '#ffd23f', '#b06bff'], base = Math.min(W, H);
    ctx.save();
    for (let i = 0; i < 70; i++) {
        const ang = (i / 70) * Math.PI * 2 + wob(i, 0.4), sp = base * (0.5 + 0.5 * Math.abs(Math.sin(i * 7.1))) * 0.9;
        const x = cx + Math.cos(ang) * sp * t, y = cy + Math.sin(ang) * sp * t * 0.8 + base * 0.9 * t * t;
        ctx.globalAlpha = clamp01(1.6 - t / 1.4);
        ctx.fillStyle = cols[i % cols.length];
        ctx.save(); ctx.translate(x, y); ctx.rotate(t * 8 + i);
        ctx.fillRect(-base * 0.009, -base * 0.004, base * 0.018, base * 0.008); ctx.restore();
    }
    ctx.restore();
}

// Dessine l'autocollant de la réplique ; t = temps depuis son apparition (s), left = temps restant dans la réplique
function drawSticker(ctx, W, H, kind, text, t, left) {
    if (!STICKERS[kind] || t < 0) return;
    const hold = Math.min(STICKER_HOLD, t + left);
    if (t > hold + 0.25) return;
    const out = t > hold ? clamp01((t - hold) / 0.25) : 0;
    const b = stickerBox(W, H), base = b.base, acc = accentColor();
    text = String(text || '').trim();
    ctx.save(); ctx.globalAlpha = 1 - out;
    switch (kind) {
        case 'arrow': case 'circle': case 'underline': {
            const fs = Math.round(base * 0.075), y = b.top + fs * 1.1;
            ctx.font = '900 ' + fs + 'px ' + MARKER_FONT;
            const w = Math.min(b.maxW, ctx.measureText(text).width);
            writeMarker(ctx, text, b.cx, y, fs, t / 0.45, kind === 'circle' ? '#e5322d' : '#1f1f1f');
            if (kind === 'circle') {
                const rx = w / 2 + fs * 0.6, ry = fs * 0.95, pts = [];
                for (let i = 0; i <= 40; i++) { const a = -2.6 + (i / 40) * Math.PI * 2.15; pts.push([b.cx + Math.cos(a) * (rx + wob(i, fs * 0.05)), y + Math.sin(a) * (ry + wob(i + 3, fs * 0.04))]); }
                handStroke(ctx, pts, (t - 0.35) / 0.4, '#e5322d', fs * 0.12);
            } else if (kind === 'underline') {
                const pts = []; for (let i = 0; i <= 16; i++) pts.push([b.cx - w / 2 + (w * i / 16), y + fs * 0.7 + Math.sin(i * 0.9) * fs * 0.08]);
                handStroke(ctx, pts, (t - 0.35) / 0.3, acc, fs * 0.14);
            } else {
                // flèche courbe qui descend vers le personnage
                const x0 = b.cx + w / 2 * 0.6, y0 = y + fs * 0.8, x1 = b.cx + base * 0.03, y1 = y0 + H * 0.16, pts = [];
                for (let i = 0; i <= 20; i++) { const k = i / 20; pts.push([x0 + (x1 - x0) * k + Math.sin(k * Math.PI) * base * 0.12, y0 + (y1 - y0) * k]); }
                const pa = (t - 0.35) / 0.35;
                handStroke(ctx, pts, pa, acc, fs * 0.13);
                if (pa >= 1) {
                    const [px, py] = pts[pts.length - 2], ang = Math.atan2(y1 - py, x1 - px), hl = fs * 0.55;
                    handStroke(ctx, [[x1 - Math.cos(ang - 0.5) * hl, y1 - Math.sin(ang - 0.5) * hl], [x1, y1], [x1 - Math.cos(ang + 0.5) * hl, y1 - Math.sin(ang + 0.5) * hl]], 1, acc, fs * 0.13);
                }
            }
            break;
        }
        case 'didyouknow': {
            // notification façon iPhone qui glisse depuis le haut
            const fs = Math.round(base * 0.04), bw = Math.min(b.maxW * 1.05, W * 0.86), pad = fs * 0.8;
            ctx.font = '600 ' + fs + 'px ' + UI_FONT;
            const lines = wrapLines(ctx, text, bw - pad * 2 - fs * 2.6).slice(0, 3), bh = pad * 2 + fs * 1.4 + lines.length * fs * 1.25;
            const slide = t > hold ? 1 - EASE.exit(out) : spring(t, SPRINGS.natural);
            const x = b.cx - bw / 2, y = b.top - (bh + b.top) * (1 - slide);
            ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = fs; ctx.shadowOffsetY = fs * 0.2;
            ctx.fillStyle = 'rgba(245,245,247,0.96)'; roundRectPath(ctx, x, y, bw, bh, fs * 1.1); ctx.fill();
            ctx.shadowColor = 'transparent';
            ctx.fillStyle = acc; roundRectPath(ctx, x + pad, y + pad, fs * 2, fs * 2, fs * 0.5); ctx.fill();
            ctx.font = fs * 1.2 + 'px ' + UI_FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('💡', x + pad + fs, y + pad + fs * 1.05);
            ctx.textAlign = 'left'; ctx.fillStyle = '#111'; ctx.font = '800 ' + fs + 'px ' + UI_FONT;
            ctx.fillText('Le savais-tu ?', x + pad + fs * 2.6, y + pad + fs * 0.6);
            ctx.fillStyle = '#8e8e93'; ctx.font = '500 ' + Math.round(fs * 0.8) + 'px ' + UI_FONT; ctx.textAlign = 'right';
            ctx.fillText('maintenant', x + bw - pad, y + pad + fs * 0.6);
            ctx.textAlign = 'left'; ctx.fillStyle = '#222'; ctx.font = '500 ' + fs + 'px ' + UI_FONT;
            lines.forEach((l, i) => ctx.fillText(l, x + pad + fs * 2.6, y + pad + fs * 1.9 + i * fs * 1.25));
            break;
        }
        case 'check': case 'cross': {
            const ok = kind === 'check', r = base * 0.09, cx = b.cx, cy = b.top + r * 1.3;
            const s = Math.max(0, spring(t, SPRINGS.bouncy));
            ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s); ctx.rotate(ok ? 0 : -0.12);
            ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = r * 0.3;
            if (ok) { ctx.fillStyle = '#22c55e'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); }
            else { ctx.strokeStyle = '#e5322d'; ctx.lineWidth = r * 0.14; roundRectPath(ctx, -r * 1.6, -r * 0.65, r * 3.2, r * 1.3, r * 0.2); ctx.stroke(); }
            ctx.shadowColor = 'transparent';
            if (ok) handStroke(ctx, [[-r * 0.45, 0], [-r * 0.1, r * 0.35], [r * 0.5, -r * 0.35]], (t - 0.15) / 0.25, '#fff', r * 0.2);
            else { ctx.fillStyle = '#e5322d'; ctx.font = '900 ' + Math.round(r * 0.85) + 'px ' + UI_FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('FAUX', 0, r * 0.04); }
            ctx.restore();
            if (text) {
                const fs = Math.round(base * 0.055);
                writeMarker(ctx, text, cx, cy + r * (ok ? 1.55 : 1.1) + fs * 0.4, fs, (t - 0.3) / 0.4, ok ? '#15803d' : '#b91c1c');
            }
            if (ok) drawConfetti(ctx, W, H, t - 0.2, cx, cy);
            break;
        }
        case 'confetti': drawConfetti(ctx, W, H, t, W / 2, H * 0.3); drawConfetti(ctx, W, H, t - 0.25, W * 0.3, H * 0.25); break;
        case 'badge': {
            // étoile-tampon qui tourne en arrivant
            const r = base * 0.15, cx = b.cx + b.maxW * 0.24, cy = b.top + r * 1.1, s = Math.max(0, spring(t, SPRINGS.bouncy));
            ctx.translate(cx, cy); ctx.rotate(-0.2 + (1 - Math.min(1, s)) * -1.2); ctx.scale(s, s);
            ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = r * 0.25;
            ctx.fillStyle = acc; ctx.beginPath();
            for (let i = 0; i < 32; i++) { const a = i / 32 * Math.PI * 2, rr = i % 2 ? r * 0.86 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
            ctx.closePath(); ctx.fill(); ctx.shadowColor = 'transparent';
            ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = r * 0.04; ctx.beginPath(); ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2); ctx.stroke();
            let fs = Math.round(r * 0.42); ctx.font = '900 ' + fs + 'px ' + captionFontFamily();
            const words = text.toUpperCase().split(/\s+/).filter(Boolean), lines = words.length > 2 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [words.join(' ')];
            while (Math.max(...lines.map(l => ctx.measureText(l).width)) > r * 1.3 && fs > 10) { fs -= 2; ctx.font = '900 ' + fs + 'px ' + captionFontFamily(); }
            ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = fs * 0.14; ctx.lineJoin = 'round'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            lines.forEach((l, i) => { const ly = (i - (lines.length - 1) / 2) * fs * 1.05; ctx.strokeText(l, 0, ly); ctx.fillText(l, 0, ly); });
            break;
        }
    }
    ctx.restore();
}

// ══════════════════════════════════════════════════════════════════
// CARTE « SUIVRE » (fin des Shorts) — façon TikTok ou Instagram, le bouton se fait « appuyer »
// ══════════════════════════════════════════════════════════════════
const FOLLOW_SEC = 2.4;
function followHandle() {
    const n = (typeof getCharter === 'function' ? getCharter().name : '') || 'cartooninstructeur';
    return '@' + n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9._]+/g, '').slice(0, 24);
}
function drawFollowCard(ctx, W, H, t, avatar) {
    const style = state.followCard;
    if (style !== 'tiktok' && style !== 'instagram' || t < 0) return;
    const base = Math.min(W, H), insta = style === 'instagram';
    const cw = Math.min(W * 0.78, base * 0.8), chh = base * 0.22, x = W / 2 - cw / 2;
    const sz = typeof safeZone === 'function' ? safeZone(W, H) : null, y0 = H * (sz && sz.on ? 0.5 : 0.62);
    const enter = spring(t, SPRINGS.natural), y = y0 + (1 - enter) * H * 0.25;
    ctx.save(); ctx.globalAlpha = clamp01(t / 0.2);
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = base * 0.04; ctx.shadowOffsetY = base * 0.01;
    ctx.fillStyle = insta ? 'rgba(255,255,255,0.97)' : 'rgba(22,24,35,0.94)'; roundRectPath(ctx, x, y, cw, chh, base * 0.04); ctx.fill();
    ctx.shadowColor = 'transparent';
    // avatar rond (personnage stable, logo ou initiale), anneau dégradé façon story Instagram
    const r = chh * 0.3, ax = x + chh * 0.42, ay = y + chh / 2;
    if (insta) { const gr = ctx.createLinearGradient(ax - r, ay + r, ax + r, ay - r); gr.addColorStop(0, '#feda75'); gr.addColorStop(0.5, '#d62976'); gr.addColorStop(1, '#4f5bd5'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(ax, ay, r * 1.14, 0, Math.PI * 2); ctx.fill(); }
    ctx.save(); ctx.beginPath(); ctx.arc(ax, ay, r, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.clip();
    if (avatar && avatar.width) { const k = Math.max(2 * r / avatar.width, 2 * r / (avatar.height * 0.55)); ctx.drawImage(avatar, ax - avatar.width * k / 2, ay - r * 0.85, avatar.width * k, avatar.height * k); }
    else { ctx.fillStyle = accentColor(); ctx.fillRect(ax - r, ay - r, 2 * r, 2 * r); ctx.fillStyle = '#fff'; ctx.font = '900 ' + Math.round(r) + 'px ' + UI_FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(followHandle().charAt(1).toUpperCase(), ax, ay); }
    ctx.restore();
    // nom + bouton
    const tx = ax + r * 1.5, fs = Math.round(chh * 0.17);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = insta ? '#111' : '#fff'; ctx.font = '800 ' + fs + 'px ' + UI_FONT;
    ctx.fillText(followHandle(), tx, y + chh * 0.33, cw - (tx - x) - chh * 0.2);
    ctx.fillStyle = insta ? '#737373' : 'rgba(255,255,255,0.65)'; ctx.font = '500 ' + Math.round(fs * 0.8) + 'px ' + UI_FONT;
    ctx.fillText(insta ? 'Abonne-toi pour la suite' : 'Abonne-toi pour la suite 👀', tx, y + chh * 0.53, cw - (tx - x) - chh * 0.2);
    const tapAt = 1.2, tapped = t > tapAt, press = Math.abs(t - tapAt) < 0.12 ? 0.92 : 1;
    const bw = cw - (tx - x) - chh * 0.25, bh = chh * 0.22, bx = tx, by = y + chh * 0.66;
    ctx.save(); ctx.translate(bx + bw / 2, by + bh / 2); ctx.scale(press, press); ctx.translate(-(bx + bw / 2), -(by + bh / 2));
    ctx.fillStyle = tapped ? (insta ? '#efefef' : 'rgba(255,255,255,0.18)') : (insta ? '#0095f6' : '#fe2c55');
    roundRectPath(ctx, bx, by, bw, bh, insta ? bh * 0.25 : bh * 0.18); ctx.fill();
    ctx.fillStyle = tapped && insta ? '#111' : '#fff'; ctx.font = '800 ' + Math.round(bh * 0.5) + 'px ' + UI_FONT; ctx.textAlign = 'center';
    ctx.fillText(tapped ? (insta ? 'Abonné(e) ✓' : 'Abonné ✓') : (insta ? 'Suivre' : 'Suivre'), bx + bw / 2, by + bh / 2 + 1);
    ctx.restore();
    // doigt qui appuie
    if (t > tapAt - 0.45 && t < tapAt + 0.5) {
        const k = clamp01((t - (tapAt - 0.45)) / 0.45), fx = bx + bw * 0.7 + (1 - k) * base * 0.12, fy = by + bh * 0.8 + (1 - k) * base * 0.1;
        ctx.globalAlpha = 1 - clamp01((t - tapAt - 0.2) / 0.3);
        ctx.font = Math.round(base * 0.08) + 'px ' + UI_FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('👆', fx, fy);
    }
    ctx.restore();
}

// ══════════════════════════════════════════════════════════════════
// STYLES DE SOUS-TITRES SUPPLÉMENTAIRES (mot par mot, calés sur la voix)
// ══════════════════════════════════════════════════════════════════
const CAPTION_STYLES_X = ['caps2', 'pill', 'emoji', 'slam', 'neon', 'marker', 'gradient'];
const CAPTION_EMOJI = [
    [/^(argent|euro|prix|cout|payer|riche|salaire|dollar)/, '💰'], [/^(temps|heure|minute|seconde|vite|rapide)/, '⏱️'], [/^(idee|astuce|conseil|solution)/, '💡'],
    [/^(danger|attention|piege|risque|interdit)/, '⚠️'], [/^(feu|chaud|chaleur|brul)/, '🔥'], [/^(froid|glace|neige|hiver)/, '🥶'], [/^(eau|mer|ocean|pluie)/, '💧'],
    [/^(terre|planete|monde|pays)/, '🌍'], [/^(soleil|ete|lumiere)/, '☀️'], [/^(lune|nuit|dormir|sommeil)/, '🌙'], [/^(etoile|espace|fusee|galaxie)/, '🚀'],
    [/^(coeur|amour|aimer)/, '❤️'], [/^(cerveau|pense|memoire|intelligen)/, '🧠'], [/^(oui|vrai|exact|correct|bravo|gagn)/, '✅'], [/^(non|faux|erreur|jamais)/, '❌'],
    [/^(question|pourquoi|comment)/, '🤔'], [/^(secret|cache|mystere)/, '🤫'], [/^(livre|lire|ecole|apprendre|cours)/, '📚'], [/^(science|chimie|experience|labo)/, '🧪'],
    [/^(ordinateur|internet|ia|robot|tech|telephone)/, '🤖'], [/^(sport|courir|muscle|force)/, '💪'], [/^(manger|nourriture|repas|faim)/, '🍽️'], [/^(animal|chien|chat)/, '🐾'],
    [/^(plante|arbre|foret|nature)/, '🌳'], [/^(record|premier|champion|meilleur|top)/, '🏆'], [/^(incroyable|fou|dingue|waouh|choc)/, '🤯'], [/^(rire|drole|blague)/, '😂'],
    [/^(million|milliard|beaucoup|enorme|geant)/, '📈'], [/^(maison|ville|batiment)/, '🏠'], [/^(voiture|route|voyage|avion)/, '✈️'], [/^(musique|chanson|son)/, '🎵']
];
function captionEmojiFor(words) {
    for (const w of words) { const n = normWord(w.text); if (n.length < 2) continue; const hit = CAPTION_EMOJI.find(([re]) => re.test(n)); if (hit) return hit[1]; }
    return '';
}
// Groupes de mots selon le style (2 mots en MAJUSCULES, 1 mot pour « slam »)
function styledGroups(sc, style) {
    const key = '_grp_' + style;
    if (sc[key]) return sc[key];
    const n = style === 'slam' ? 1 : style === 'caps2' ? 2 : 3, groups = [];
    let cur = [];
    sc.words.forEach((w, i) => {
        cur.push(w);
        if (cur.length >= n || /[.,!?;:…]$/.test(w.text) || i === sc.words.length - 1) { groups.push({ words: cur, start: cur[0].start }); cur = []; }
    });
    groups.forEach((g, i) => { g.end = i < groups.length - 1 ? groups[i + 1].start : g.words[g.words.length - 1].end + 0.6; });
    sc[key] = groups;
    return groups;
}
function drawStyledCaptions(ctx, W, H, sc, t, style) {
    const groups = styledGroups(sc, style);
    if (!groups.length || t < groups[0].start - 0.05) return;
    const g = groups.find(gr => t >= gr.start - 0.05 && t < gr.end); if (!g) return;
    const upper = style === 'caps2' || style === 'slam';
    const words = g.words.map(w => ({ ...w, text: upper ? w.text.toUpperCase() : w.text }));
    const sz = safeZone(W, H), base = Math.min(W, H), acc = accentColor();
    let fs = Math.round(base * (style === 'slam' ? 0.13 : style === 'caps2' ? 0.095 : 0.08));
    const font = () => (style === 'marker' ? '900 ' + fs + 'px ' + MARKER_FONT : '900 ' + fs + 'px ' + captionFontFamily());
    ctx.save(); ctx.font = font();
    const text = words.map(w => w.text).join(' ');
    while (ctx.measureText(text).width > sz.maxW && fs > 18) { fs -= 2; ctx.font = font(); }
    const y = sz.capY || H * (isWhiteboard() ? 0.84 : 0.8), lt = t - g.start;
    // entrée du groupe
    let s = 0.85 + 0.15 * easeOut(lt / 0.12), rot = 0;
    if (style === 'slam') { s = 1 + 0.8 * Math.max(0, 1 - spring(lt, SPRINGS.snappy)); rot = (words.length && (g.start * 10 | 0) % 2 ? 0.05 : -0.05) * clamp01(1 - lt / 0.2); }
    ctx.translate(sz.cx, y); ctx.rotate(rot); ctx.scale(s, s); ctx.translate(-sz.cx, -y);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.lineJoin = 'round';
    const widths = words.map((w, i) => ctx.measureText(w.text + (i < words.length - 1 ? ' ' : '')).width), total = widths.reduce((a, b) => a + b, 0);
    if (style === 'pill') {
        const pad = fs * 0.35;
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; roundRectPath(ctx, sz.cx - total / 2 - pad * 1.4, y - fs * 0.78, total + pad * 2.8, fs * 1.56, fs * 0.5); ctx.fill();
    }
    if (style === 'emoji') {
        const em = captionEmojiFor(g.words);
        if (em) { const k = Math.max(0, spring(lt, SPRINGS.bouncy)); ctx.save(); ctx.font = Math.round(fs * 1.3 * k) + 'px ' + UI_FONT; ctx.textAlign = 'center'; ctx.fillText(em, sz.cx, y - fs * 1.35); ctx.restore(); }
    }
    let x = sz.cx - total / 2;
    words.forEach((w, i) => {
        const piece = w.text + (i < words.length - 1 ? ' ' : ''), ww = ctx.measureText(w.text).width;
        const spoken = t >= w.start - 0.03, active = spoken && t < w.end + 0.15;
        switch (style) {
            case 'pill':
                if (active) { ctx.fillStyle = acc; roundRectPath(ctx, x - fs * 0.15, y - fs * 0.62, ww + fs * 0.3, fs * 1.24, fs * 0.3); ctx.fill(); }
                ctx.fillStyle = active ? '#111' : '#fff'; ctx.fillText(piece, x, y); break;
            case 'neon':
                ctx.lineWidth = fs * 0.16; ctx.strokeStyle = 'rgba(10,10,30,0.75)'; ctx.strokeText(piece, x, y);
                ctx.save(); ctx.shadowColor = acc; ctx.shadowBlur = fs * (active ? 0.7 : 0.35);
                ctx.fillStyle = spoken ? '#fff' : 'rgba(255,255,255,0.55)'; ctx.fillText(piece, x, y); ctx.fillText(piece, x, y); ctx.restore();
                ctx.lineWidth = fs * 0.04; ctx.strokeStyle = acc; ctx.strokeText(piece, x, y); break;
            case 'marker': {
                const k = clamp01((t - w.start) / 0.18);
                if (k > 0) { ctx.save(); ctx.fillStyle = '#ffe14d'; ctx.globalAlpha = 0.92; ctx.beginPath(); ctx.moveTo(x - fs * 0.1, y - fs * 0.38); ctx.lineTo(x - fs * 0.1 + (ww + fs * 0.2) * k, y - fs * 0.44); ctx.lineTo(x - fs * 0.1 + (ww + fs * 0.2) * k, y + fs * 0.42); ctx.lineTo(x - fs * 0.1, y + fs * 0.38); ctx.closePath(); ctx.fill(); ctx.restore(); }
                if (k <= 0) { ctx.lineWidth = fs * 0.18; ctx.strokeStyle = '#111'; ctx.strokeText(piece, x, y); }
                ctx.fillStyle = k > 0 ? '#111' : '#fff'; ctx.fillText(piece, x, y); break;
            }
            case 'gradient': {
                const gr = ctx.createLinearGradient(x, y - fs / 2, x + ww, y + fs / 2);
                gr.addColorStop(0, acc); gr.addColorStop(0.55, '#ff4fd8'); gr.addColorStop(1, '#7a5cff');
                ctx.lineWidth = fs * 0.2; ctx.strokeStyle = '#111'; ctx.strokeText(piece, x, y);
                ctx.fillStyle = spoken ? gr : '#fff'; ctx.fillText(piece, x, y); break;
            }
            default:   // caps2, emoji, slam : contour noir, mot prononcé à la couleur de la chaîne
                ctx.lineWidth = fs * (style === 'slam' ? 0.24 : 0.2); ctx.strokeStyle = '#111'; ctx.strokeText(piece, x, y);
                ctx.fillStyle = style === 'slam' ? (i % 2 ? '#fff' : acc) : active ? acc : '#fff'; ctx.fillText(piece, x, y);
        }
        x += widths[i];
    });
    ctx.restore();
}

// ══════════════════════════════════════════════════════════════════
// RYTHME SERRÉ — les silences au milieu des phrases sont raccourcis (comme un monteur TikTok, idée video-use)
// On garde des morceaux [début, fin] du son ; le temps de la vidéo est remappé dessus.
// ══════════════════════════════════════════════════════════════════
function tightActive() { return state.trimMode === 'tight' || (state.trimMode === 'auto' && shortsMode()); }
// Plages à garder dans buf entre from et to (secondes) : silences de plus de minGap ramenés à keepGap
function silenceKeepRanges(buf, from, to, { minGap = 0.38, keepGap = 0.14 } = {}) {
    if (!buf || to - from < 1) return null;
    const sr = buf.sampleRate, win = Math.round(sr * 0.02), data = buf.getChannelData(0);
    const i0 = Math.max(0, Math.floor(from * sr)), i1 = Math.min(data.length, Math.floor(to * sr));
    const rms = [];
    for (let i = i0; i + win <= i1; i += win) { let s = 0; for (let k = i; k < i + win; k += 2) s += data[k] * data[k]; rms.push(Math.sqrt(s / (win / 2))); }
    if (rms.length < 10) return null;
    const sorted = rms.slice().sort((a, b) => a - b), loud = sorted[Math.floor(sorted.length * 0.8)];
    if (!loud) return null;
    const thr = Math.max(0.004, loud * 0.12), quiet = rms.map(v => v < thr);
    // on ne touche qu'aux silences ENTRE deux zones de parole
    const first = quiet.indexOf(false), last = quiet.lastIndexOf(false);
    if (first < 0) return null;
    const ranges = []; let start = from, i = first;
    while (i <= last) {
        if (!quiet[i]) { i++; continue; }
        let j = i; while (j <= last && quiet[j]) j++;
        const gap = (j - i) * 0.02;
        if (gap >= minGap && j <= last) {
            const gs = from + i * 0.02, ge = from + j * 0.02, half = keepGap / 2;
            ranges.push([start, gs + half]); start = ge - half;
        }
        i = j;
    }
    if (!ranges.length) return null;
    ranges.push([start, to]);
    return ranges;
}
// Fonctions de passage entre le temps de la vidéo (sortie) et le temps du son d'origine
function rangeMapper(ranges) {
    const outStart = []; let acc = 0;
    ranges.forEach(r => { outStart.push(acc); acc += r[1] - r[0]; });
    return {
        ranges, outStart, total: acc,
        src(t) { for (let i = ranges.length - 1; i >= 0; i--) if (t >= outStart[i]) return ranges[i][0] + Math.min(t - outStart[i], ranges[i][1] - ranges[i][0] + 1); return ranges[0][0] + t; },
        out(s) { for (let i = 0; i < ranges.length; i++) { if (s < ranges[i][0]) return outStart[i]; if (s <= ranges[i][1]) return outStart[i] + s - ranges[i][0]; } return acc + (s - ranges[ranges.length - 1][1]); }
    };
}
