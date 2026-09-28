// Construit data/icons.json à partir de lucide-static (licence ISC) :
// chaque icône devient une liste de tracés absolus M/L/C/Q/Z (arcs et formes convertis), + ses étiquettes.
// Usage : node tools/build-icons.js <dossier lucide-static/package>
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = process.argv[2];
const ctx = { console, document: undefined, fetch: undefined };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'motion.js'), 'utf8'), ctx);
const nodes = JSON.parse(fs.readFileSync(path.join(src, 'icon-nodes.json'), 'utf8'));
const tags = JSON.parse(fs.readFileSync(path.join(src, 'tags.json'), 'utf8'));
// icônes inutiles pour illustrer une idée (lettres, mise en forme de texte, interfaces)
const skip = /^(a-|align-|arrow-(big-)?(down|up|left|right)-(from|to|narrow|wide|a-z|z-a|0-1|1-0)|axis-|bold|italic|underline|strikethrough|heading|text-|type|pilcrow|list-|indent|outdent|wrap-text|panel-|layout-|columns-|rows-|square-(dashed|split|chart-gantt|menu)|gallery-|between-|table-|grid-|chevrons?-|ellipsis|more-|toggle-|toolbar|tablet-smartphone|remove-formatting|subscript|superscript|spell-check|case-|whole-word|regex|letter-|ligature|baseline|decimals|parentheses|brackets|braces|code-xml|square-code)/;
const out = {};
let n = 0;
for (const [name, els] of Object.entries(nodes)) {
    if (skip.test(name)) continue;
    const d = [];
    for (const [tag, at] of els) d.push(...ctx.svgElementToD(tag, at));
    if (!d.length) continue;
    out[name] = { d, t: (tags[name] || []).join('|') };
    n++;
}
fs.writeFileSync(path.join(__dirname, '..', 'data', 'icons.json'), JSON.stringify({ source: 'Lucide (lucide.dev), ISC License, Copyright (c) Lucide Icons and Contributors', viewBox: 24, icons: out }));
console.log(n + ' icônes');
