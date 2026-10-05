// Exemple complet : planche « tableau blanc 9:16 » de 3 autocollants, avant/après si APRES est donné.
// Lancer : node ${CLAUDE_SKILL_DIR}/scripts/exemple-planche.js   (sortie : /tmp/planches/exemple.png)
const { open, save } = require('./harness');
(async () => {
    const { b, pages } = await open();
    const sections = [];
    for (const [k, p] of Object.entries(pages)) {
        const cells = await p.evaluate(async () => {
            await CK.prepDrawing();
            return ['check', 'circle', 'didyouknow'].map(kind => {
                const r = CK.board(1080, 1920, kind, kind === 'didyouknow' ? 'Une fourmi fait deux cent cinquante siestes par jour' : '250 siestes', 1.5);
                const m = r.meas, bad = m.onDraw || m.onHead || m.onCap || m.onTikTok;
                return { url: CK.cell(CK.overlay(r.canvas, r.area), { x: 0, y: 0, w: 1080, h: 1920 }, 300), label: kind + '\nsur dessin ' + m.onDraw + ' · tête ' + m.onHead + ' · sous-titres ' + m.onCap, bad: !!bad };
            });
        });
        sections.push({ title: k.toUpperCase(), cols: 3, cellW: 300, cells, color: k === 'avant' ? '#8a1c2b' : '#1e6b3a' });
    }
    const url = await pages.avant.evaluate((s) => CK.compose('Exemple · tableau blanc 9:16', s), sections);
    console.log(save('/tmp/planches/exemple.png', url));
    await b.close();
})();
