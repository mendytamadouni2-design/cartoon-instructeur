// Tests unitaires du moteur de motion design (Node, sans navigateur) : node tests/unit-motion.js
const vm = require('vm'), fs = require('fs'), path = require('path');
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'motion.js'), 'utf8'), ctx);
const E = src => vm.runInContext(src, ctx);
let fails = 0;
const check = (ok, name) => { console.log((ok ? '  ✅ ' : '  ❌ ') + name); if (!ok) fails++; };
const near = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;

console.log('▶ Courbes et ressorts');
// cubic-bezier(0.25, 0.1, 0.25, 1) (« ease » CSS) : valeur de référence des navigateurs à x = 0.5 ≈ 0.8024
check(near(E('cubicBezier(0.25, 0.1, 0.25, 1)(0.5)'), 0.8024, 2e-3), 'Bézier cubique identique aux navigateurs (ease à 50 % = 0,802)');
check(E('cubicBezier(0,0,1,1)(0.37)') - 0.37 < 1e-4 && E('EASE.standard(0)') === 0 && E('EASE.standard(1)') === 1, 'bornes et courbe linéaire exactes');
check(E('[0,0.1,0.3,0.6,1].every(x => Math.abs(EASE.outBounce(x)) <= 1.0001)') && near(E('EASE.outElastic(1)'), 1), 'Penner : rebond et élastique bornés');
check(near(E('interpolate(5, [0, 10], [100, 200])'), 150) && E('interpolate(20, [0, 10], [0, 1])') === 1 && near(E('interpolate(15, [0, 10, 20], [0, 1, 3])'), 2), 'interpolation multi-segments avec bornes');
const sp = E('[0.05,0.2,0.5,1,2].map(t => spring(t, SPRINGS.natural))');
check(sp[0] > 0 && sp[4] > 0.995 && sp[4] < 1.005, 'ressort « natural » : part de 0, arrive à 1');
check(E('Math.max(...Array.from({length: 100}, (_, i) => spring(i / 50, SPRINGS.bouncy)))') > 1.05, 'ressort « bouncy » : dépasse la cible (rebond)');
check(E('Math.max(...Array.from({length: 100}, (_, i) => spring(i / 50, { stiffness: 100, damping: 20, mass: 1 })))') <= 1.0001, 'ressort critique : aucun dépassement');
check(E('springSettle(SPRINGS.snappy)') < E('springSettle(SPRINGS.smooth)'), 'durée de stabilisation cohérente (snappy < smooth)');
check(E('stagger(2, 5)') === E('2 * 0.12') && E('stagger(0, 5, { from: "center" })') === E('stagger(4, 5, { from: "center" })'), 'décalages (stagger) depuis le début et depuis le centre');

console.log('▶ Tracés SVG');
const d1 = E('normalizePath("m10 10 l5 0 h5 v5 z").map(s => segsToD(s.segs)).join("|")');
check(d1 === 'M 10 10 L 15 10 L 20 10 L 20 15 Z', 'commandes relatives + H/V → absolues (' + d1 + ')');
const arc = E('normalizePath("M 0 10 A 10 10 0 0 1 20 10")[0].segs');
const mid = E('flattenSegs(normalizePath("M 0 10 A 10 10 0 0 1 20 10")[0].segs)');
const top = mid.reduce((a, p) => p[1] < a[1] ? p : a, [0, 99]);
check(arc.every((s, i) => i === 0 || s[0] === 'C') && near(top[0], 10, 0.3) && near(top[1], 0, 0.3), 'arc elliptique → Bézier (demi-cercle passant par le sommet 10,0)');
check(E('normalizePath("M2 16l4.039-9.69a.5.5 0 0 1 .923 0L11 16").length') === 1 && E('normalizePath("M2 16l4.039-9.69a.5.5 0 0 1 .923 0L11 16")[0].segs.length') >= 4, 'nombres collés et drapeaux d\'arc compacts (syntaxe Lucide)');
check(E('normalizePath("M 1 1 L 2 2 3 3").map(s => segsToD(s.segs))[0]') === 'M 1 1 L 2 2 L 3 3', 'coordonnées implicites répétées');
check(E('normalizePath("M 0 0 S 10 10 20 0")[0].segs[1][0]') === 'C' && E('normalizePath("M 0 0 Q 5 5 10 0 T 20 0")[0].segs[2].join(" ")') === 'Q 15 -5 20 0', 'S et T (points de contrôle réfléchis)');
const bb = E('pathsBBox([ellipseD(50, 50, 20, 10)])');
check(near(bb.x, 30, 0.2) && near(bb.w, 40, 0.2) && near(bb.h, 20, 0.2), 'boîte englobante d\'une ellipse');
check(E('normalizePath("M 0 0 L 5 5 X 9 9").length') === 1, 'tracé invalide : lecture arrêtée proprement');
const tr = E('transformPaths(["M 0 0 L 10 0"], 2, 5, 5)[0]');
check(tr === 'M 5 5 L 25 5', 'transformation (échelle + translation)');
const morph = E('buildMorph([ellipseD(0,0,10,10)], ["M -10 -10 L 10 -10 L 10 10 L -10 10 Z"], 32)');
check(morph.length === 1 && morph[0][0].length === 32 && morph[0][1].length === 32, 'morphing : traits appariés et rééchantillonnés');

console.log('▶ Icônes');
ctx.fetch = async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'icons.json'), 'utf8')) });
E('loadIcons()').then(() => {
    const f = k => (E('findIcon(' + JSON.stringify(k) + ')') || {}).name;
    check(Object.keys(E('ICONS')).length > 1500, E('Object.keys(ICONS).length') + ' icônes chargées');
    check(f(['crown']) === 'crown' && f(['king']) === 'crown' && f(['water drop']) === 'droplet' && f(['people']) === 'users', 'recherche : nom exact, synonyme, expression');
    check(f(['microscope', 'science']) === 'microscope' && f(['zzzz qqqq']) === undefined, 'recherche : priorité au 1er mot-clé, rien si aucun rapport');
    check(E('Object.values(ICON_SYNONYMS).every(n => !!ICONS[n])'), 'tous les synonymes pointent vers une icône existante');
    console.log(fails ? '\n❌ ' + fails + ' échec(s)' : '\n✅ Tests du moteur OK');
    process.exit(fails ? 1 : 0);
});
