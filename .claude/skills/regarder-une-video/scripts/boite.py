#!/usr/bin/env python3
"""Boîte à vidéo pour Claude (Cartoon Instructeur 9.2) : la dernière vidéo finie de l'utilisateur,
déposée par l'appli sur son serveur Cloudflare.

  python3 boite.py infos                 → ce qu'il y a dans la boîte (date, durée, style, plans…)
  python3 boite.py recuperer [--out DIR] → télécharge seulement la vidéo (+ boite.json)
  python3 boite.py regarder [--out DIR]  → la télécharge et la regarde (regarder.py, raccords inclus)
  python3 boite.py vider                 → vide la boîte (après le rapport)

Clé : variable d'environnement CARTOON_BOITE_CLE (réglages de l'environnement Claude, jamais dans la
conversation). Serveur : CARTOON_SERVEUR, sinon DEFAULT_PROXY_URL de js/core.js.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ICI = Path(__file__).resolve().parent


def serveur() -> str:
    if os.environ.get('CARTOON_SERVEUR'):
        return os.environ['CARTOON_SERVEUR'].rstrip('/')
    for racine in (ICI.parents[3], Path('/home/user/cartoon-instructeur')):
        core = racine / 'js' / 'core.js'
        if core.is_file():
            m = re.search(r"DEFAULT_PROXY_URL = '([^']+)'", core.read_text(encoding='utf-8'))
            if m:
                return m.group(1).rstrip('/')
    raise SystemExit('Adresse du serveur introuvable : définir CARTOON_SERVEUR ou cloner cartoon-instructeur.')


def appel(chemin: str, methode: str = 'GET', sortie: Path | None = None) -> tuple[int, bytes]:
    """curl (proxy et certificats du conteneur) ; la clé passe par l'entrée standard, jamais en argument."""
    cle = os.environ.get('CARTOON_BOITE_CLE', '').strip()
    conf = ''
    if cle:
        if not re.fullmatch(r'[\w-]{40,64}', cle):
            raise SystemExit('CARTOON_BOITE_CLE ne ressemble pas à une clé de boîte (recopier depuis l\'appli).')
        conf = f'header = "Authorization: Bearer {cle}"\n'
    with tempfile.NamedTemporaryFile(delete=False) as corps:
        corps_path = corps.name
    try:
        cmd = ['curl', '-sS', '-K', '-', '-X', methode, '-o', str(sortie) if sortie else corps_path,
               '-w', '%{http_code}', '--max-time', '600', serveur() + chemin]
        r = subprocess.run(cmd, input=conf, capture_output=True, text=True)
        if r.returncode != 0:
            if 'CONNECT tunnel failed, response 403' in r.stderr:
                raise SystemExit('Réseau : le conteneur ne peut pas joindre ' + serveur() + '. L\'utilisateur doit ajouter cette '
                                 'adresse aux sites autorisés (réglages de l\'environnement → Network access).')
            raise SystemExit('curl : ' + r.stderr.strip()[-400:])
        code = int(r.stdout.strip() or 0)
        data = b'' if sortie else Path(corps_path).read_bytes()
        return code, data
    finally:
        os.unlink(corps_path)


def erreur(code: int, data: bytes) -> None:
    try:
        msg = json.loads(data or b'{}').get('error', '')
    except ValueError:
        msg = data[:200].decode('utf-8', 'replace')
    if code == 401:
        raise SystemExit('Clé refusée ou absente (' + msg + ') : l\'utilisateur doit copier la clé depuis l\'appli '
                         '(Réglages → Aide et journal → Boîte à vidéo) dans la variable CARTOON_BOITE_CLE de l\'environnement.')
    if code == 404:
        raise SystemExit('Boîte vide (' + msg + ') : aucune nouvelle vidéo depuis la dernière fois.')
    raise SystemExit(f'Erreur du serveur {code} : {msg}')


def infos() -> dict:
    code, data = appel('/boite')
    if code != 200:
        erreur(code, data)
    return json.loads(data)


def main() -> None:
    ap = argparse.ArgumentParser(description='Boîte à vidéo pour Claude (Cartoon Instructeur).')
    ap.add_argument('action', choices=['infos', 'recuperer', 'regarder', 'vider'])
    ap.add_argument('--out', help='dossier des résultats (défaut : dossier temporaire)')
    a = ap.parse_args()
    if a.action == 'vider':
        code, data = appel('/boite', 'DELETE')
        if code != 200:
            erreur(code, data)
        r = json.loads(data)
        print('Boîte vidée' + (' (copie de la boîte effacée du serveur).' if r.get('efface') else ' (la vidéo reste dans la bibliothèque de l\'utilisateur).'))
        return
    i = infos()
    print('## Boîte à vidéo\n\n```json\n' + json.dumps(i, ensure_ascii=False, indent=1) + '\n```')
    if a.action == 'infos':
        return
    if not i.get('present'):
        raise SystemExit('La vidéo de la boîte a été supprimée de la bibliothèque : rien à regarder (vider la boîte).')
    out = Path(a.out).resolve() if a.out else Path(tempfile.mkdtemp(prefix='boite-'))
    out.mkdir(parents=True, exist_ok=True)
    ext = '.mp4' if 'mp4' in (i.get('type') or 'mp4') else '.webm'
    video = out / ('derniere-video' + ext)
    code, data = appel('/boite/video', sortie=video)
    if code != 200:
        erreur(code, video.read_bytes() if video.exists() else b'')
    if i.get('size') and video.stat().st_size != i['size']:
        raise SystemExit(f'Vidéo incomplète ({video.stat().st_size} octets sur {i["size"]}) : relancer.')
    (out / 'boite.json').write_text(json.dumps(i, ensure_ascii=False, indent=1), encoding='utf-8')
    if a.action == 'recuperer':
        print(f'Vidéo : {video} ({video.stat().st_size} octets)')
        return
    # raccords entre plans : 0,1 s avant et après chaque début de plan
    debuts = [p['debut'] for p in (i.get('info') or {}).get('plans', []) if isinstance(p, dict) and isinstance(p.get('debut'), (int, float))]
    moments = sorted({round(max(0.0, t + d), 2) for t in debuts[1:] for d in (-0.1, 0.1)})
    cmd = [sys.executable, '-I', str(ICI / 'regarder.py'), str(video), '--out', str(out / 'regard')]
    if moments:
        cmd += ['--moments', ','.join(str(m) for m in moments[:60])]
    print(f'\nVidéo : {video} ({video.stat().st_size / 1e6:.1f} Mo)\n')
    sys.exit(subprocess.run(cmd).returncode)


if __name__ == '__main__':
    main()
