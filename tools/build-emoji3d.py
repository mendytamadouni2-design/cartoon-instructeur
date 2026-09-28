# Construit data/emoji3d.json : index des emojis 3D de Microsoft (Fluent Emoji, licence MIT)
# Usage : python3 tools/build-emoji3d.py <clone de microsoft/fluentui-emoji> <commit>
import json, os, subprocess, sys
repo, commit = sys.argv[1], sys.argv[2]
files = subprocess.run(['git', '-C', repo, 'ls-tree', '-r', '--name-only', 'HEAD'], capture_output=True, text=True).stdout.split('\n')
pngs = {}
for f in files:
    if '/3D/' not in f or not f.endswith('.png'): continue
    folder = f.split('/')[1]
    # teinte de peau : version par défaut
    if '/Default/3D/' in f or folder not in pngs: pngs[folder] = f[len('assets/'):]
out = {}
for folder, path in sorted(pngs.items()):
    meta_path = os.path.join(repo, 'assets', folder, 'metadata.json')
    try: meta = json.load(open(meta_path))
    except Exception: meta = {}
    name = (meta.get('cldr') or folder).lower()
    kw = [k.lower() for k in meta.get('keywords', []) if k.lower() != name]
    out[name] = {'p': path, 'k': '|'.join(kw), 'g': meta.get('group', '')}
json.dump({'source': 'Fluent Emoji (github.com/microsoft/fluentui-emoji), MIT License, Copyright (c) Microsoft Corporation',
           'base': 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@' + commit + '/assets/',
           'fallback': 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/' + commit + '/assets/', 'emoji': out},
          open(os.path.join(os.path.dirname(__file__), '..', 'data', 'emoji3d.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(out), 'emojis 3D')
