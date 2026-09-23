// Relais de téléchargement pour Cartoon Instructeur (Cloudflare Worker).
//
// Le serveur vidéo d'Agnes n'autorise pas les navigateurs à télécharger les
// scènes (CORS). Ce relais récupère la vidéo à la place de l'appli et la lui
// renvoie avec l'autorisation qui manque. Il ne stocke rien.
//
// Sécurité : seul le site de l'appli peut l'utiliser (ALLOWED_ORIGINS), et il
// ne relaie que des fichiers vidéo, image ou audio en https.

const ALLOWED_ORIGINS = [
    'https://mendytamadouni2-design.github.io'
];

export default {
    async fetch(request) {
        const origin = request.headers.get('Origin') || '';
        const allowed = ALLOWED_ORIGINS.includes(origin);
        const cors = {
            'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': 'Range',
            'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Content-Type',
            'Vary': 'Origin'
        };
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
        if (!allowed) return new Response('Origine non autorisée : ' + origin, { status: 403, headers: cors });

        const target = new URL(request.url).searchParams.get('url');
        if (!target) return new Response('Relais OK', { status: 200, headers: cors });
        let url;
        try { url = new URL(target); } catch (e) { return new Response('Adresse invalide', { status: 400, headers: cors }); }
        if (url.protocol !== 'https:') return new Response('Seul https est accepté', { status: 400, headers: cors });

        const range = request.headers.get('Range');
        const upstream = await fetch(url.toString(), { headers: range ? { Range: range } : {} });
        const type = (upstream.headers.get('Content-Type') || '').toLowerCase();
        if (upstream.ok && !/^(video|image|audio)\/|octet-stream/.test(type)) {
            return new Response('Type de fichier refusé : ' + type, { status: 415, headers: cors });
        }
        const headers = new Headers(cors);
        ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges'].forEach(h => {
            const v = upstream.headers.get(h);
            if (v) headers.set(h, v);
        });
        return new Response(upstream.body, { status: upstream.status, headers });
    }
};
