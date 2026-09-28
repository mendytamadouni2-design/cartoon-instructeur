// Serveur Cloudflare de Cartoon Instructeur.
//
// 1. Relais de téléchargement : le serveur vidéo d'Agnes n'autorise pas les
//    navigateurs à télécharger les scènes (CORS). Le relais récupère la vidéo
//    et la renvoie à l'appli avec l'autorisation qui manque. Il ne stocke rien.
//      GET /            → « Relais OK · jobs »
//      GET /?url=...    → la vidéo (https, vidéo/image/audio uniquement)
//
// 2. Génération en arrière-plan (téléphone éteint) : l'appli envoie le projet,
//    ce serveur fait la mise en scène Claude, les dessins, crée les scènes Agnes
//    et attend qu'elles soient prêtes. L'appli n'a plus qu'à faire le montage.
//      POST /jobs              → { jobId }
//      GET  /jobs/:id          → avancement et résultats (jamais les clés)
//      POST /jobs/:id/cancel   → arrêt
//    Les clés API ne sont gardées que pendant la génération, puis effacées.
//
// 3. Notifications : quand une génération est finie, le téléphone reçoit
//    « Tes scènes sont prêtes » (Web Push, clés VAPID créées et gardées ici).
//      GET /push/key           → clé publique à donner au téléphone
//
// 4. Stockage de tes scènes et vidéos (les liens Agnes expirent) :
//      PUT    /media/:clé      → enregistre un fichier (découpé en morceaux de 1,5 Mo)
//      GET    /media/:clé      → le récupère
//      DELETE /media/:clé      → le supprime
//      GET    /media-list?kind=final → liste des vidéos enregistrées
//
// 5. TikTok (optionnel : secrets TIKTOK_CLIENT_KEY et TIKTOK_CLIENT_SECRET dans Cloudflare) :
//      GET  /tiktok/config     → clé publique de l'appli TikTok
//      POST /tiktok/token      → échange le code de connexion contre les jetons
//      POST /tiktok/refresh    → renouvelle le jeton
//      POST /tiktok/videos     → tes vidéos et leurs statistiques
//      POST /tiktok/creator    → options de publication de ton compte
//
// 6. Publication programmée sur TikTok (la vidéo est prise dans le stockage) :
//      POST /schedule          → { id }
//      GET  /schedule/:id      → état
//      POST /schedule/:id/cancel
//    Le jeton TikTok n'est gardé que jusqu'à la publication, puis effacé.
//
// 7. Instagram (optionnel : INSTAGRAM_APP_ID et INSTAGRAM_APP_SECRET dans Cloudflare) :
//      GET  /instagram/config, POST /instagram/token, POST /instagram/refresh
//    Les Reels sont publiés par /schedule (platform: "instagram") : Instagram vient chercher
//    la vidéo à une adresse publique signée et temporaire : GET /pub/:clé?exp=…&sig=…
//
// Sécurité : seul le site de l'appli peut l'utiliser (ALLOWED_ORIGINS).

const ALLOWED_ORIGINS = [
    'https://mendytamadouni2-design.github.io'
];

const AGNES_API = 'https://apihub.agnes-ai.com/v1';
const AGNES_POLL = 'https://apihub.agnes-ai.com/agnesapi';
const AGNES_MODEL = 'agnes-video-v2.0';
const CLAUDE_API = 'https://api.anthropic.com/v1/messages';
const CLAUDE_FALLBACK_MODELS = ['claude-opus-5'];

const TICK_MS = 8000;                    // fréquence de travail
const CREATE_INTERVAL_MS = 62000;        // limite de débit Agnes entre deux créations
const SCENE_TIMEOUT_MS = 25 * 60000;     // abandon d'une scène bloquée
const JOB_MAX_AGE_MS = 3 * 24 * 3600000; // les projets sont effacés au bout de 3 jours
const TIKTOK_API = 'https://open.tiktokapis.com/v2';
const TIKTOK_CHUNK = 10 * 1024 * 1024;   // morceaux envoyés à TikTok (5 à 64 Mo)
const POST_MAX_AHEAD_MS = 60 * 24 * 3600000;
const IG_GRAPH = 'https://graph.instagram.com/v22.0';
const IG_PUB_TTL_MS = 6 * 3600000;       // durée de validité de l'adresse publique donnée à Instagram

export default {
    async fetch(request, env) {
        // Adresse publique signée (Instagram télécharge la vidéo à publier ; pas d'en-tête Origin)
        const pubUrl = new URL(request.url);
        if (pubUrl.pathname.startsWith('/pub/') && env.JOBS && ['GET', 'HEAD'].includes(request.method)) {
            const key = decodeURIComponent(pubUrl.pathname.slice(5));
            const r = await env.JOBS.get(env.JOBS.idFromName('media')).fetch('https://job/media-pub?key=' + encodeURIComponent(key) + '&exp=' + encodeURIComponent(pubUrl.searchParams.get('exp') || '') + '&sig=' + encodeURIComponent(pubUrl.searchParams.get('sig') || ''));
            return new Response(r.body, { status: r.status, headers: { 'Content-Type': r.headers.get('Content-Type') || 'video/mp4', ...(r.headers.get('Content-Length') ? { 'Content-Length': r.headers.get('Content-Length') } : {}) } });
        }
        const origin = request.headers.get('Origin') || '';
        const allowed = ALLOWED_ORIGINS.includes(origin);
        const cors = {
            'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
            'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Range, Content-Type',
            'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Content-Type',
            'Vary': 'Origin'
        };
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
        if (!allowed) return new Response('Origine non autorisée : ' + origin, { status: 403, headers: cors });

        const url = new URL(request.url);
        if (url.pathname.startsWith('/jobs')) return handleJobs(request, env, url, cors);
        if (url.pathname.startsWith('/tiktok/')) return handleTikTok(request, env, url, cors);
        if (url.pathname.startsWith('/instagram/')) return handleInstagram(request, env, url, cors);
        if (url.pathname.startsWith('/schedule')) return handleSchedule(request, env, url, cors);
        if (url.pathname.startsWith('/media')) {
            if (!env.JOBS) return json({ error: 'Stockage non activé' }, 501, cors);
            const store = env.JOBS.get(env.JOBS.idFromName('media'));
            if (url.pathname === '/media-list') { const r = await store.fetch('https://job/media-list?kind=' + encodeURIComponent(url.searchParams.get('kind') || '')); return json(await r.json(), r.status, cors); }
            const key = decodeURIComponent(url.pathname.slice('/media/'.length));
            if (!/^[\w\-\/.]{3,120}$/.test(key)) return json({ error: 'Clé invalide' }, 400, cors);
            const q = '?key=' + encodeURIComponent(key) + '&kind=' + encodeURIComponent(url.searchParams.get('kind') || 'clip') + '&title=' + encodeURIComponent(url.searchParams.get('title') || '');
            if (request.method === 'PUT') { const r = await store.fetch('https://job/media-put' + q, { method: 'POST', body: await request.arrayBuffer(), headers: { 'Content-Type': request.headers.get('Content-Type') || 'application/octet-stream' } }); return json(await r.json(), r.status, cors); }
            if (request.method === 'DELETE') { const r = await store.fetch('https://job/media-del' + q, { method: 'POST' }); return json(await r.json(), r.status, cors); }
            const r = await store.fetch('https://job/media-get' + q);
            const h = new Headers(cors); ['Content-Type', 'Content-Length'].forEach(n => { const v = r.headers.get(n); if (v) h.set(n, v); });
            return new Response(r.body, { status: r.status, headers: h });
        }
        if (url.pathname === '/push/key') {
            if (!env.JOBS) return json({ error: 'Notifications non activées' }, 501, cors);
            const res = await env.JOBS.get(env.JOBS.idFromName('vapid')).fetch('https://job/vapid', { method: 'POST' });
            return json(await res.json(), res.status, cors);
        }

        const target = url.searchParams.get('url');
        if (!target) return new Response(env.JOBS ? 'Relais OK · jobs · push · media · schedule' + (env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET ? ' · tiktok' : '') + (env.INSTAGRAM_APP_ID && env.INSTAGRAM_APP_SECRET ? ' · instagram' : '') : 'Relais OK', { status: 200, headers: cors });
        return relay(request, target, cors);
    }
};

async function relay(request, target, cors) {
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

function json(data, status, cors) {
    return new Response(JSON.stringify(data), { status: status || 200, headers: { ...cors, 'Content-Type': 'application/json' } });
}

async function handleJobs(request, env, url, cors) {
    if (!env.JOBS) return json({ error: 'Génération en arrière-plan non activée sur ce serveur' }, 501, cors);
    const parts = url.pathname.split('/').filter(Boolean);   // ['jobs', id?, action?]
    if (parts.length === 1 && request.method === 'POST') {
        const id = env.JOBS.newUniqueId();
        const res = await env.JOBS.get(id).fetch('https://job/start', { method: 'POST', body: await request.text() });
        const out = await res.json();
        if (!res.ok) return json(out, res.status, cors);
        return json({ jobId: id.toString() }, 200, cors);
    }
    if (parts.length >= 2) {
        let id;
        try { id = env.JOBS.idFromString(parts[1]); } catch (e) { return json({ error: 'Projet introuvable' }, 404, cors); }
        const action = parts[2] === 'cancel' && request.method === 'POST' ? 'cancel' : 'status';
        const res = await env.JOBS.get(id).fetch('https://job/' + action, { method: 'POST' });
        return json(await res.json(), res.status, cors);
    }
    return json({ error: 'Requête inconnue' }, 404, cors);
}

// ─────────────── TikTok ───────────────
async function tiktokToken(env, params) {
    const body = new URLSearchParams({ client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET, ...params });
    const res = await fetch(TIKTOK_API + '/oauth/token/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.error || !d.access_token) throw new Error(d.error_description || d.error || ('TikTok ' + res.status));
    return { accessToken: d.access_token, refreshToken: d.refresh_token, expiresIn: d.expires_in, refreshExpiresIn: d.refresh_expires_in, openId: d.open_id, scope: d.scope };
}
async function tiktokCall(path, token, body) {
    const res = await fetch(TIKTOK_API + path, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify(body || {}) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || (d.error && d.error.code && d.error.code !== 'ok')) throw new Error((d.error && (d.error.message || d.error.code)) || ('TikTok ' + res.status));
    return d.data || {};
}
async function handleTikTok(request, env, url, cors) {
    const ready = !!(env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET);
    const action = url.pathname.slice('/tiktok/'.length);
    if (action === 'config') return json({ clientKey: env.TIKTOK_CLIENT_KEY || '', ready }, 200, cors);
    if (!ready) return json({ error: 'TikTok n\'est pas encore configuré sur ton serveur Cloudflare' }, 501, cors);
    if (request.method !== 'POST') return json({ error: 'Requête inconnue' }, 404, cors);
    let p = {};
    try { p = JSON.parse(await request.text() || '{}'); } catch (e) { return json({ error: 'Données illisibles' }, 400, cors); }
    try {
        if (action === 'token') return json(await tiktokToken(env, { code: p.code, grant_type: 'authorization_code', redirect_uri: p.redirectUri }), 200, cors);
        if (action === 'refresh') return json(await tiktokToken(env, { grant_type: 'refresh_token', refresh_token: p.refreshToken }), 200, cors);
        if (action === 'videos') {
            const fields = 'id,title,video_description,duration,cover_image_url,share_url,view_count,like_count,comment_count,share_count,create_time';
            return json(await tiktokCall('/video/list/?fields=' + fields, p.accessToken, { max_count: 20, ...(p.cursor ? { cursor: p.cursor } : {}) }), 200, cors);
        }
        if (action === 'creator') return json(await tiktokCall('/post/publish/creator_info/query/', p.accessToken, {}), 200, cors);
    } catch (e) { return json({ error: e.message }, 502, cors); }
    return json({ error: 'Requête inconnue' }, 404, cors);
}
// ─────────────── Instagram (API « Instagram Login », compte professionnel) ───────────────
async function igLongToken(env, shortToken) {
    const r = await fetch('https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=' + encodeURIComponent(env.INSTAGRAM_APP_SECRET) + '&access_token=' + encodeURIComponent(shortToken));
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.access_token) throw new Error((d.error && d.error.message) || ('Instagram ' + r.status));
    return d;
}
async function igRefresh(token) {
    const r = await fetch('https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=' + encodeURIComponent(token));
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.access_token) throw new Error((d.error && d.error.message) || ('Instagram ' + r.status));
    return d;
}
async function igCall(method, path, token, params) {
    const q = new URLSearchParams({ ...(params || {}), access_token: token });
    const r = method === 'GET' ? await fetch(IG_GRAPH + path + '?' + q) : await fetch(IG_GRAPH + path, { method, body: q });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) throw new Error((d.error && (d.error.error_user_msg || d.error.message)) || ('Instagram ' + r.status));
    return d;
}
async function handleInstagram(request, env, url, cors) {
    const ready = !!(env.INSTAGRAM_APP_ID && env.INSTAGRAM_APP_SECRET);
    const action = url.pathname.slice('/instagram/'.length);
    if (action === 'config') return json({ appId: env.INSTAGRAM_APP_ID || '', ready }, 200, cors);
    if (!ready) return json({ error: 'Instagram n\'est pas encore configuré sur ton serveur Cloudflare' }, 501, cors);
    if (request.method !== 'POST') return json({ error: 'Requête inconnue' }, 404, cors);
    let p = {};
    try { p = JSON.parse(await request.text() || '{}'); } catch (e) { return json({ error: 'Données illisibles' }, 400, cors); }
    try {
        if (action === 'token') {
            const body = new URLSearchParams({ client_id: env.INSTAGRAM_APP_ID, client_secret: env.INSTAGRAM_APP_SECRET, grant_type: 'authorization_code', redirect_uri: p.redirectUri, code: String(p.code || '').replace(/#_$/, '') });
            const r = await fetch('https://api.instagram.com/oauth/access_token', { method: 'POST', body });
            const d = await r.json().catch(() => ({}));
            if (!r.ok || !d.access_token) throw new Error(d.error_message || (d.error && d.error.message) || ('Instagram ' + r.status));
            const long = await igLongToken(env, d.access_token);
            let username = '';
            try { username = (await igCall('GET', '/me', long.access_token, { fields: 'username' })).username || ''; } catch (e) {}
            return json({ accessToken: long.access_token, expiresIn: long.expires_in, userId: String(d.user_id), username }, 200, cors);
        }
        if (action === 'refresh') { const d = await igRefresh(p.accessToken); return json({ accessToken: d.access_token, expiresIn: d.expires_in }, 200, cors); }
    } catch (e) { return json({ error: e.message }, 502, cors); }
    return json({ error: 'Requête inconnue' }, 404, cors);
}
async function handleSchedule(request, env, url, cors) {
    if (!env.JOBS) return json({ error: 'Programmation non activée sur ce serveur' }, 501, cors);
    const parts = url.pathname.split('/').filter(Boolean);   // ['schedule', id?, action?]
    if (parts.length === 1 && request.method === 'POST') {
        const text = await request.text();
        let platform = 'tiktok';
        try { platform = JSON.parse(text).platform === 'instagram' ? 'instagram' : 'tiktok'; } catch (e) {}
        if (platform === 'tiktok' && !(env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET)) return json({ error: 'TikTok n\'est pas encore configuré sur ton serveur Cloudflare' }, 501, cors);
        if (platform === 'instagram' && !(env.INSTAGRAM_APP_ID && env.INSTAGRAM_APP_SECRET)) return json({ error: 'Instagram n\'est pas encore configuré sur ton serveur Cloudflare' }, 501, cors);
        const id = env.JOBS.newUniqueId();
        const res = await env.JOBS.get(id).fetch('https://job/post-start?origin=' + encodeURIComponent(url.origin), { method: 'POST', body: text });
        const out = await res.json();
        return json(res.ok ? { id: id.toString() } : out, res.status, cors);
    }
    if (parts.length >= 2) {
        let id;
        try { id = env.JOBS.idFromString(parts[1]); } catch (e) { return json({ error: 'Publication introuvable' }, 404, cors); }
        const action = parts[2] === 'cancel' && request.method === 'POST' ? 'post-cancel' : 'post-status';
        const res = await env.JOBS.get(id).fetch('https://job/' + action, { method: 'POST' });
        return json(await res.json(), res.status, cors);
    }
    return json({ error: 'Requête inconnue' }, 404, cors);
}

// ══════════════════════════════════════════════════════════════════
// Un projet de vidéo = un Durable Object (stockage + réveil périodique)
// ══════════════════════════════════════════════════════════════════
export class VideoJob {
    constructor(ctx, env) { this.ctx = ctx; this.storage = ctx.storage; this.env = env; }

    async fetch(request) {
        const action = new URL(request.url).pathname.slice(1);
        if (action === 'start') return this.start(request);
        if (action === 'vapid') return Response.json({ publicKey: (await getVapid(this.storage)).publicKey });
        if (action.startsWith('media')) return this.media(action, request);
        if (action.startsWith('post-')) return this.postAction(action, request);
        if (action === 'rate') {
            // une seule création Agnes par minute, tous projets confondus (séries en parallèle)
            const now = Date.now(), next = (await this.storage.get('nextAt')) || 0;
            if (now < next) return Response.json({ ok: false, waitUntil: next });
            await this.storage.put('nextAt', now + CREATE_INTERVAL_MS);
            return Response.json({ ok: true });
        }
        if (action === 'rate-delay') { await this.storage.put('nextAt', Date.now() + 90000); return Response.json({ ok: true }); }
        if (action === 'push') {
            try { await sendPush(await request.json(), await getVapid(this.storage)); return Response.json({ ok: true }); }
            catch (e) { return Response.json({ error: e.message }, { status: 500 }); }
        }
        const job = await this.storage.get('job');
        if (!job) return Response.json({ error: 'Projet introuvable ou expiré' }, { status: 404 });
        if (action === 'cancel') {
            if (!['done', 'failed', 'cancelled'].includes(job.status)) {
                job.status = 'cancelled'; job.message = 'Arrêté';
                await this.finish(job);
            }
            return Response.json(publicView(job, await this.storage.get('drawings')));
        }
        return Response.json(publicView(job, await this.storage.get('drawings')));
    }

    async media(action, request) {
        const u = new URL(request.url), key = u.searchParams.get('key') || '';
        if (action === 'media-sign' || action === 'media-pub') {
            let sk = await this.storage.get('signKey');
            if (!sk) { sk = b64url(crypto.getRandomValues(new Uint8Array(32))); await this.storage.put('signKey', sk); }
            const hmac = async (k, exp) => {
                const ck = await crypto.subtle.importKey('raw', new TextEncoder().encode(sk), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
                return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', ck, new TextEncoder().encode(k + '.' + exp))));
            };
            if (action === 'media-sign') {
                if (!(await this.storage.get('meta:' + key))) return Response.json({ error: 'Introuvable' }, { status: 404 });
                const exp = Date.now() + IG_PUB_TTL_MS;
                return Response.json({ exp, sig: await hmac(key, exp) });
            }
            const exp = +u.searchParams.get('exp');
            if (!exp || exp < Date.now() || u.searchParams.get('sig') !== await hmac(key, exp)) return new Response('Lien expiré', { status: 403 });
        }
        if (action === 'media-list') {
            const kind = u.searchParams.get('kind') || '';
            const metas = await this.storage.list({ prefix: 'meta:' });
            const items = [...metas.values()].filter(m => !kind || m.kind === kind).sort((a, b) => b.date - a.date);
            return Response.json({ items });
        }
        if (action === 'media-put') {
            const buf = new Uint8Array(await request.arrayBuffer());
            if (!buf.length) return Response.json({ error: 'Fichier vide' }, { status: 400 });
            if (buf.length > 95 * 1024 * 1024) return Response.json({ error: 'Fichier trop lourd (95 Mo max)' }, { status: 413 });
            await this.deleteMedia(key);
            // ménage : les vidéos déposées pour une publication sont effacées au bout de 70 jours
            try { const old = await this.storage.list({ prefix: 'meta:post/' }); for (const m of old.values()) if (Date.now() - m.date > 70 * 24 * 3600000) await this.deleteMedia(m.key); } catch (e) {}
            const CH = 1500000, n = Math.ceil(buf.length / CH);
            for (let i = 0; i < n; i++) await this.storage.put('chunk:' + key + ':' + i, buf.slice(i * CH, (i + 1) * CH));
            await this.storage.put('meta:' + key, { key, kind: u.searchParams.get('kind') || 'clip', title: u.searchParams.get('title') || '', type: request.headers.get('Content-Type') || 'application/octet-stream', size: buf.length, chunks: n, date: Date.now() });
            return Response.json({ ok: true, key, size: buf.length });
        }
        if (action === 'media-del') { await this.deleteMedia(key); return Response.json({ ok: true }); }
        const meta = await this.storage.get('meta:' + key);
        if (!meta) return new Response('Introuvable', { status: 404 });
        const storage = this.storage;
        const body = new ReadableStream({
            async start(ctrl) { for (let i = 0; i < meta.chunks; i++) ctrl.enqueue(new Uint8Array(await storage.get('chunk:' + key + ':' + i))); ctrl.close(); }
        });
        return new Response(body, { headers: { 'Content-Type': meta.type, 'Content-Length': String(meta.size) } });
    }
    async deleteMedia(key) {
        const meta = await this.storage.get('meta:' + key);
        if (!meta) return;
        const keys = ['meta:' + key]; for (let i = 0; i < meta.chunks; i++) keys.push('chunk:' + key + ':' + i);
        for (let i = 0; i < keys.length; i += 100) await this.storage.delete(keys.slice(i, i + 100));
    }

    async start(request) {
        let p;
        try { p = await request.json(); } catch (e) { return Response.json({ error: 'Données illisibles' }, { status: 400 }); }
        if (!p.agnesKey || !p.image || !Array.isArray(p.templates) || !p.templates.length) {
            return Response.json({ error: 'Projet incomplet (clé Agnes, photo ou scènes manquantes)' }, { status: 400 });
        }
        if (p.image.length > 1900000) return Response.json({ error: 'Photo trop lourde' }, { status: 413 });
        const n = p.templates.length;
        const given = Array.isArray(p.drawings) ? p.drawings : [];
        const job = {
            status: 'planning', message: 'Mise en scène…', createdAt: Date.now(), updatedAt: Date.now(),
            frames: p.frames || 153, frameRate: p.frameRate || 24,
            plan: p.plan || p.fallbackPlan || null, planRequest: p.plan ? null : (p.planRequest || null),
            drawingRequests: Array.isArray(p.drawingRequests) ? p.drawingRequests : [],
            drawingsDone: 0, nextCreateAt: 0, narrDone: 0, drawingRetried: [],
            push: p.push && p.push.endpoint ? p.push : null,
            poseIds: [], backup: p.backup !== false,
            scenes: Array.from({ length: n }, (_, i) => ({ index: i, status: 'pending', videoId: null, videoUrl: null, error: null, startedAt: null, attempts: 0 }))
        };
        await this.storage.put('job', job);
        await this.storage.put('templates', p.templates);
        await this.storage.put('image', p.image);
        await this.storage.put('secrets', { agnesKey: p.agnesKey, claudeKey: p.claudeKey || '', claudeModel: p.claudeModel || 'claude-opus-5', eleven: p.eleven && p.eleven.key && p.eleven.voice ? p.eleven : null });
        await this.storage.put('drawings', given);
        // les dessins déjà fournis (storyboard validé) ne sont pas refaits
        job.drawingRequests = job.drawingRequests.map((r, i) => given[i] ? null : r);
        for (const pose of (Array.isArray(p.poses) ? p.poses : []).slice(0, 8)) {
            if (!pose || !pose.id || !pose.image || pose.image.length > 1500000) continue;
            await this.storage.put('pose:' + pose.id, pose.image);
            job.poseIds.push(pose.id);
        }
        await this.storage.put('job', job);
        await this.storage.setAlarm(Date.now() + 500);
        return Response.json({ ok: true });
    }

    // ─────────────── Publication programmée (TikTok) ───────────────
    async postAction(action, request) {
        if (action === 'post-start') {
            let p;
            try { p = await request.json(); } catch (e) { return Response.json({ error: 'Données illisibles' }, { status: 400 }); }
            const platform = p.platform === 'instagram' ? 'instagram' : 'tiktok';
            if (!p.mediaKey || (platform === 'tiktok' ? !p.refreshToken : !(p.igToken && p.igUserId))) return Response.json({ error: 'Connexion ' + (platform === 'tiktok' ? 'TikTok' : 'Instagram') + ' ou vidéo manquante' }, { status: 400 });
            const at = Math.max(Date.now() + 1000, +p.at || 0);
            if (at > Date.now() + POST_MAX_AHEAD_MS) return Response.json({ error: 'Date trop lointaine (60 jours maximum)' }, { status: 400 });
            const post = {
                status: 'scheduled', message: 'Programmée', at, createdAt: Date.now(), attempts: 0, polls: 0,
                mode: p.mode === 'inbox' ? 'inbox' : 'direct', mediaKey: String(p.mediaKey), title: String(p.title || '').slice(0, 2200),
                privacy: String(p.privacy || 'SELF_ONLY'), push: p.push && p.push.endpoint ? p.push : null, publishId: null, deleteMedia: p.deleteMedia !== false,
                platform, origin: new URL(request.url).searchParams.get('origin') || '', igUserId: platform === 'instagram' ? String(p.igUserId) : null
            };
            await this.storage.put('post', post);
            await this.storage.put('postSecret', platform === 'tiktok' ? { refreshToken: p.refreshToken } : { igToken: p.igToken });
            await this.storage.setAlarm(at);
            return Response.json({ ok: true });
        }
        const post = await this.storage.get('post');
        if (!post) return Response.json({ error: 'Publication introuvable ou expirée' }, { status: 404 });
        if (action === 'post-cancel' && post.status === 'scheduled') {
            post.status = 'cancelled'; post.message = 'Annulée';
            await this.endPost(post);
        }
        return Response.json({ status: post.status, message: post.message, at: post.at, mode: post.mode, publishId: post.publishId, platform: post.platform || 'tiktok' });
    }
    async runPost(post) {
        if (['done', 'failed', 'cancelled'].includes(post.status)) {
            if (Date.now() - post.createdAt > POST_MAX_AHEAD_MS + JOB_MAX_AGE_MS) await this.storage.deleteAll();
            return;
        }
        try {
            if (post.platform === 'instagram') await this.runInstagram(post);
            else await this.runTikTok(post);
        } catch (e) {
            post.attempts++;
            post.message = 'Erreur : ' + e.message;
            if (post.attempts >= 4) { post.status = 'failed'; post.message = 'Échec : ' + e.message; }
            else if (post.status === 'uploading') post.status = 'scheduled';   // on recommence l'envoi
        }
        await this.storage.put('post', post);
        if (['done', 'failed'].includes(post.status)) await this.endPost(post);
        else await this.storage.setAlarm(Date.now() + (post.status === 'processing' ? 15000 : 60000 * Math.max(1, post.attempts)));
    }
    async runInstagram(post) {
        const env = this.env, secret = await this.storage.get('postSecret');
        let token = secret.igToken;
        if (post.status === 'scheduled') {
            try { const d = await igRefresh(token); token = d.access_token; await this.storage.put('postSecret', { igToken: token }); } catch (e) { /* jeton encore valable */ }
            post.status = 'uploading'; post.message = 'Envoi à Instagram…';
            const sign = await (await env.JOBS.get(env.JOBS.idFromName('media')).fetch('https://job/media-sign?key=' + encodeURIComponent(post.mediaKey))).json();
            if (!sign.sig) throw new Error('vidéo introuvable dans le stockage');
            const videoUrl = post.origin + '/pub/' + encodeURIComponent(post.mediaKey) + '?exp=' + sign.exp + '&sig=' + sign.sig;
            const c = await igCall('POST', '/' + post.igUserId + '/media', token, { media_type: 'REELS', video_url: videoUrl, caption: post.title, share_to_feed: 'true' });
            post.publishId = c.id; post.status = 'processing'; post.message = 'Instagram traite la vidéo…';
            return;
        }
        if (post.status === 'processing') {
            const st = await igCall('GET', '/' + post.publishId, token, { fields: 'status_code,status' });
            post.polls++;
            if (st.status_code === 'FINISHED') {
                await igCall('POST', '/' + post.igUserId + '/media_publish', token, { creation_id: post.publishId });
                post.status = 'done'; post.message = 'Publiée sur Instagram ✓';
            } else if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED') { post.status = 'failed'; post.message = 'Instagram a refusé : ' + (st.status || st.status_code); }
            else if (post.polls > 80) { post.status = 'failed'; post.message = 'Instagram n\'a pas fini de traiter la vidéo'; }
        }
    }
    async runTikTok(post) {
        const env = this.env;
        {
            const secret = await this.storage.get('postSecret');
            const tok = await tiktokToken(env, { grant_type: 'refresh_token', refresh_token: secret.refreshToken });
            if (tok.refreshToken) await this.storage.put('postSecret', { refreshToken: tok.refreshToken });
            if (post.status === 'scheduled') {
                post.status = 'uploading'; post.message = 'Envoi à TikTok…';
                const store = env.JOBS.get(env.JOBS.idFromName('media'));
                const media = await store.fetch('https://job/media-get?key=' + encodeURIComponent(post.mediaKey));
                if (!media.ok) throw new Error('vidéo introuvable dans le stockage');
                const size = +media.headers.get('Content-Length');
                const chunk = size < 5 * 1024 * 1024 ? size : TIKTOK_CHUNK;
                const count = Math.max(1, Math.floor(size / chunk));
                const source_info = { source: 'FILE_UPLOAD', video_size: size, chunk_size: chunk, total_chunk_count: count };
                const init = post.mode === 'inbox'
                    ? await tiktokCall('/post/publish/inbox/video/init/', tok.accessToken, { source_info })
                    : await tiktokCall('/post/publish/video/init/', tok.accessToken, { post_info: { title: post.title, privacy_level: post.privacy, disable_duet: false, disable_comment: false, disable_stitch: false, video_cover_timestamp_ms: 1000 }, source_info });
                post.publishId = init.publish_id;
                // envoi morceau par morceau (le dernier morceau prend le reste)
                const reader = media.body.getReader();
                let buf = new Uint8Array(0), sent = 0, index = 0;
                const flush = async part => {
                    const res = await fetch(init.upload_url, { method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(part.length), 'Content-Range': 'bytes ' + sent + '-' + (sent + part.length - 1) + '/' + size }, body: part });
                    if (!res.ok) throw new Error('envoi TikTok refusé (' + res.status + ')');
                    sent += part.length; index++;
                };
                for (;;) {
                    const { done, value } = await reader.read();
                    if (value) { const n = new Uint8Array(buf.length + value.length); n.set(buf); n.set(value, buf.length); buf = n; }
                    while (index < count - 1 && buf.length >= chunk) { await flush(buf.slice(0, chunk)); buf = buf.slice(chunk); }
                    if (done) break;
                }
                if (buf.length) await flush(buf);
                post.status = 'processing'; post.message = 'TikTok traite la vidéo…';
            }
            if (post.status === 'processing' || post.status === 'uploading') {
                const st = await tiktokCall('/post/publish/status/fetch/', tok.accessToken, { publish_id: post.publishId });
                post.polls++;
                if (st.status === 'PUBLISH_COMPLETE') { post.status = 'done'; post.message = 'Publiée sur TikTok ✓'; }
                else if (st.status === 'SEND_TO_USER_INBOX') { post.status = 'done'; post.message = 'Dans ta boîte de réception TikTok : ouvre TikTok pour la publier'; }
                else if (st.status === 'FAILED') { post.status = 'failed'; post.message = 'TikTok a refusé : ' + (st.fail_reason || 'raison inconnue'); }
                else if (post.polls > 60) { post.status = 'done'; post.message = 'Envoyée, TikTok la traite encore'; }
            }
        }
    }
    async endPost(post) {
        await this.storage.delete('postSecret');
        if (post.status === 'done' && post.deleteMedia && this.env?.JOBS) {
            try { await this.env.JOBS.get(this.env.JOBS.idFromName('media')).fetch('https://job/media-del?key=' + encodeURIComponent(post.mediaKey), { method: 'POST' }); } catch (e) {}
        }
        if (post.push && !post.pushed && this.env?.JOBS) {
            post.pushed = true;
            try { await this.env.JOBS.get(this.env.JOBS.idFromName('vapid')).fetch('https://job/push', { method: 'POST', body: JSON.stringify(post.push) }); } catch (e) {}
        }
        await this.storage.put('post', post);
        await this.storage.setAlarm(post.createdAt + POST_MAX_AHEAD_MS + JOB_MAX_AGE_MS);
    }

    async alarm() {
        const post = await this.storage.get('post');
        if (post) return this.runPost(post);
        const job = await this.storage.get('job');
        if (!job) return;
        if (['done', 'failed', 'cancelled'].includes(job.status)) {
            // Nettoyage final au bout de 3 jours
            if (Date.now() - job.createdAt > JOB_MAX_AGE_MS) await this.storage.deleteAll();
            else await this.storage.setAlarm(job.createdAt + JOB_MAX_AGE_MS + 1000);
            return;
        }
        const secrets = await this.storage.get('secrets');
        try {
            if (job.status === 'planning') await this.plan(job, secrets);
            else await this.work(job, secrets);
        } catch (e) {
            job.message = 'Erreur : ' + e.message;
        }
        job.updatedAt = Date.now();
        await this.storage.put('job', job);
        if (['done', 'failed', 'cancelled'].includes(job.status)) await this.finish(job);
        else await this.storage.setAlarm(Date.now() + TICK_MS);
    }

    async plan(job, secrets) {
        if (job.planRequest && secrets.claudeKey) {
            try {
                const out = await callClaude(secrets, job.planRequest);
                job.plan = mergePlan(out, job.plan);
            } catch (e) { job.planError = e.message; }
        }
        job.planRequest = null;
        job.status = 'generating';
        job.message = 'Génération des scènes…';
    }

    async work(job, secrets) {
        const now = Date.now();
        // 1. Un dessin par réveil (Claude), en parallèle des scènes
        while (job.drawingsDone < job.drawingRequests.length && !job.drawingRequests[job.drawingsDone]) job.drawingsDone++;
        if (job.drawingsDone < job.drawingRequests.length && secrets.claudeKey) {
            const i = job.drawingsDone;
            const drawings = (await this.storage.get('drawings')) || [];
            try {
                const req = { ...job.drawingRequests[i] };
                const sc = job.plan?.scenes?.[i] || {};
                if (req.prompt) req.prompt = req.prompt.split('{{SPOKEN}}').join(sc.spoken || req.fallbackText || '').split('{{NARRATION}}').join(sc.narration || '').split('{{VISUAL}}').join(sc.visual || '')
                    .replace(/\nCe qu'il faut dessiner : \s*\n/, '\n');
                drawings[i] = await callClaude(secrets, req);
                // vérification : Claude relit le dessin (tracés SVG) et le fait refaire s'il ne montre pas la bonne idée
                if (req.verify && drawings[i] && Array.isArray(drawings[i].paths)) {
                    const svg = drawings[i].paths.map(pth => '<path d="' + pth.d + '" stroke="' + pth.color + '"/>').join('\n');
                    const intent = [sc.visual, sc.spoken || req.fallbackText, sc.narration].filter(Boolean).join(' — ');
                    const check = await callClaude(secrets, {
                        system: 'Tu es directeur artistique. Tu lis un dessin au trait décrit en SVG (zone 400 × 300) et tu juges s\'il illustre clairement l\'idée demandée.',
                        prompt: 'Idée à illustrer : ' + intent + '\n\nDessin :\n' + svg + '\n\nDonne "ok" (true s\'il montre bien cette idée de façon reconnaissable) et "why" (sinon, ce qui ne va pas).',
                        schema: { type: 'object', properties: { ok: { type: 'boolean' }, why: { type: 'string' } }, required: ['ok', 'why'], additionalProperties: false }, maxTokens: 2000
                    }).catch(() => ({ ok: true }));
                    if (!check.ok) {
                        const again = await callClaude(secrets, { ...req, prompt: req.prompt + '\nUn premier dessin a été refusé pour cette raison : ' + check.why + ' Fais un dessin nettement plus clair.' }).catch(() => null);
                        if (again && Array.isArray(again.paths)) drawings[i] = again;
                    }
                }
            } catch (e) { drawings[i] = null; }
            await this.storage.put('drawings', drawings);
            job.drawingsDone++;
        } else if (!secrets.claudeKey) job.drawingsDone = job.drawingRequests.length;

        // 1 bis. Voix off des scènes riches (ElevenLabs), rangée dans le stockage
        const narrTotal = job.scenes.length;
        while (job.narrDone < narrTotal && !(secrets.eleven && job.plan?.scenes?.[job.narrDone]?.narration)) job.narrDone++;
        if (job.narrDone < narrTotal && secrets.eleven && this.env?.JOBS) {
            const i = job.narrDone, text = job.plan.scenes[i].narration;
            try {
                const r = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(secrets.eleven.voice), {
                    method: 'POST', headers: { 'xi-api-key': secrets.eleven.key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
                    body: JSON.stringify({ text, model_id: secrets.eleven.model || 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true } })
                });
                if (r.ok) {
                    const key = 'job/' + this.ctx.id.toString().slice(0, 24) + '/n' + i;
                    const put = await this.env.JOBS.get(this.env.JOBS.idFromName('media')).fetch('https://job/media-put?kind=clip&key=' + encodeURIComponent(key), { method: 'POST', body: await r.arrayBuffer(), headers: { 'Content-Type': r.headers.get('Content-Type') || 'audio/mpeg' } });
                    if (put.ok) job.scenes[i].narrKey = key;
                }
            } catch (e) { /* la voix off sera créée par le téléphone au montage */ }
            job.narrDone++;
        }

        // 2. Suivi des scènes en cours
        for (const sc of job.scenes) {
            if (sc.status !== 'processing') continue;
            if (now - sc.startedAt > SCENE_TIMEOUT_MS) { sc.status = 'failed'; sc.error = 'délai dépassé'; continue; }
            try {
                const res = await fetch(AGNES_POLL + '?video_id=' + encodeURIComponent(sc.videoId) + '&model_name=' + encodeURIComponent(AGNES_MODEL), { headers: { Authorization: 'Bearer ' + secrets.agnesKey } });
                if (!res.ok) continue;
                const d = await res.json();
                const status = d.status || '';
                sc.progress = d.progress || 0;
                if (['completed', 'succeeded', 'done'].includes(status)) {
                    const u = (d.metadata && d.metadata.url) || d.url || (d.output && d.output.url);
                    if (u) {
                        sc.status = 'done'; sc.videoUrl = u;
                        try {
                            const v = await fetch(u);
                            if (v.ok && job.backup !== false && this.env?.JOBS) {
                                const key = 'job/' + this.ctx.id.toString().slice(0, 24) + '/' + sc.index;
                                const r = await this.env.JOBS.get(this.env.JOBS.idFromName('media')).fetch('https://job/media-put?kind=clip&key=' + encodeURIComponent(key), { method: 'POST', body: await v.arrayBuffer(), headers: { 'Content-Type': v.headers.get('Content-Type') || 'video/mp4' } });
                                if (r.ok) sc.mediaKey = key;
                            }
                        } catch (e) { /* la scène reste disponible via le lien Agnes */ }
                    } else { sc.status = 'failed'; sc.error = 'terminé sans vidéo'; }
                } else if (['failed', 'error', 'cancelled'].includes(status)) { sc.status = 'failed'; sc.error = 'échec Agnes (' + status + ')'; }
            } catch (e) { /* réseau : on réessaiera au prochain réveil */ }
        }

        // 3. Création de la scène suivante (une à la fois, limite de débit Agnes)
        const next = job.scenes.find(s => s.status === 'pending');
        let slot = true;
        if (next && now >= job.nextCreateAt && this.env?.JOBS) {
            try { const r = await (await this.env.JOBS.get(this.env.JOBS.idFromName('rate')).fetch('https://job/rate', { method: 'POST' })).json(); slot = r.ok; if (!r.ok) job.nextCreateAt = r.waitUntil; } catch (e) {}
        }
        if (next && now >= job.nextCreateAt && slot) {
            const templates = await this.storage.get('templates');
            const poseId = job.plan?.scenes?.[next.index]?.pose;
            const image = (poseId && poseId !== 'main' && job.poseIds.includes(poseId) ? await this.storage.get('pose:' + poseId) : null) || await this.storage.get('image');
            const prompt = fillTemplate(templates[next.index], job.plan?.scenes?.[next.index], job.plan?.setting);
            try {
                const res = await fetch(AGNES_API + '/videos', {
                    method: 'POST',
                    headers: { Authorization: 'Bearer ' + secrets.agnesKey, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: AGNES_MODEL, prompt, image, num_frames: job.frames, frame_rate: job.frameRate })
                });
                if (res.status === 429 || res.status === 503) {
                    job.nextCreateAt = now + 90000;
                    try { await this.env.JOBS.get(this.env.JOBS.idFromName('rate')).fetch('https://job/rate-delay', { method: 'POST' }); } catch (e) {}
                } else if (!res.ok) {
                    const err = (await res.text()).slice(0, 150);
                    next.attempts++;
                    if (res.status === 401 || res.status === 403) { job.status = 'failed'; job.message = 'Clé Agnes refusée (' + res.status + ')'; return; }
                    if (next.attempts >= 3) { next.status = 'failed'; next.error = 'HTTP ' + res.status + ' ' + err; }
                    job.nextCreateAt = now + 30000;
                } else {
                    const data = await res.json();
                    const vid = data.video_id || data.id || data.task_id;
                    if (vid) { next.status = 'processing'; next.videoId = vid; next.startedAt = now; }
                    else { next.attempts++; if (next.attempts >= 3) { next.status = 'failed'; next.error = 'pas de video_id'; } }
                    job.nextCreateAt = now + CREATE_INTERVAL_MS;
                }
            } catch (e) { job.nextCreateAt = now + 20000; }
        }

        // 4. Bilan
        const done = job.scenes.filter(s => s.status === 'done').length;
        const failed = job.scenes.filter(s => s.status === 'failed').length;
        const drawingsLeft = job.drawingRequests.length - job.drawingsDone;
        const narrLeft = secrets?.eleven ? job.scenes.length - (job.narrDone || 0) : 0;
        job.message = done + '/' + job.scenes.length + ' scènes prêtes' + (drawingsLeft > 0 ? ' · ' + drawingsLeft + ' dessins en cours' : '') + (narrLeft > 0 ? ' · voix off en cours' : '');
        if (done + failed === job.scenes.length && drawingsLeft <= 0 && narrLeft <= 0) {
            job.status = done ? 'done' : 'failed';
            job.message = done ? 'Scènes prêtes : il ne reste que le montage' : 'Aucune scène n\'a pu être générée';
        }
    }

    // Fin (terminé, échoué ou arrêté) : on efface les clés et les données lourdes.
    async finish(job) {
        await this.storage.delete(['secrets', 'image', 'templates', ...(job.poseIds || []).map(id => 'pose:' + id)]);
        if (job.push && !job.pushed && this.env?.JOBS) {
            job.pushed = true;
            try { await this.env.JOBS.get(this.env.JOBS.idFromName('vapid')).fetch('https://job/push', { method: 'POST', body: JSON.stringify(job.push) }); } catch (e) {}
        }
        job.drawingRequests = []; job.planRequest = null;
        await this.storage.put('job', job);
        await this.storage.setAlarm(job.createdAt + JOB_MAX_AGE_MS + 1000);
    }
}

function publicView(job, drawings) {
    return {
        status: job.status, message: job.message, createdAt: job.createdAt, updatedAt: job.updatedAt,
        plan: job.plan, planError: job.planError || null,
        drawings: drawings || [],
        scenes: job.scenes.map(s => ({ index: s.index, status: s.status, videoUrl: s.videoUrl, mediaKey: s.mediaKey || null, narrKey: s.narrKey || null, error: s.error, progress: s.progress || 0 }))
    };
}

function fillTemplate(template, scene, setting) {
    let p = String(template || '');
    const clean = s => String(s || '').replace(/"/g, "'");
    p = p.split('{{SPOKEN}}').join(clean(scene?.spoken));
    p = p.split('{{ACTION}}').join(clean(scene?.action || 'explains with expressive gestures'));
    p = p.split('{{CAMERA}}').join(clean(scene?.camera || 'medium shot'));
    if (setting) p = p.split('{{SETTING}}').join(clean(setting));
    else p = p.replace(/Setting, identical in every shot: \{\{SETTING\}\}\.\s*/g, '');
    return p;
}

function mergePlan(out, fallback) {
    if (!out || !Array.isArray(out.scenes) || !out.scenes.length) return fallback;
    const fb = fallback?.scenes || [];
    return {
        setting: String(out.setting || ''),
        scenes: fb.map((f, i) => {
            const s = out.scenes[i] || {};
            const gr = s.graphic && ['counter', 'bars', 'list', 'compare'].includes(s.graphic.type) && Array.isArray(s.graphic.items) && s.graphic.items.length ? s.graphic : { type: 'none', title: '', unit: '', items: [] };
            return { ...f, ...s, graphic: gr, spoken: s.spoken || f.spoken, action: s.action || f.action, camera: s.camera || f.camera, bubble: String(s.bubble || '').slice(0, 60), section: i > 0 ? String(s.section || '').slice(0, 40) : '' };
        })
    };
}

async function callClaude(secrets, req) {
    const model = secrets.claudeModel || 'claude-opus-5';
    const body = { model, max_tokens: req.maxTokens || 16000, messages: [{ role: 'user', content: req.prompt }] };
    // consignes mises en cache 5 min : les appels suivants (dessins scène par scène…) les relisent à ~10 % du prix
    if (req.system) body.system = [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }];
    if (req.schema) body.output_config = { format: { type: 'json_schema', schema: req.schema } };
    const headers = { 'x-api-key': secrets.claudeKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };
    if (CLAUDE_FALLBACK_MODELS.includes(model)) { body.fallbacks = 'default'; headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'; }
    const res = await fetch(CLAUDE_API, { method: 'POST', headers, body: JSON.stringify(body) });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error?.message || ('Claude HTTP ' + res.status));
    if (data.stop_reason === 'refusal') throw new Error('Claude a refusé');
    if (data.stop_reason === 'max_tokens') throw new Error('réponse coupée');
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    return req.schema ? JSON.parse(text) : text;
}

// ══════════════════════════════════════════════════════════════════
// Notifications Web Push (sans contenu chiffré : le téléphone affiche un message fixe)
// ══════════════════════════════════════════════════════════════════
function b64url(bytes) {
    if (typeof bytes === 'string') bytes = new TextEncoder().encode(bytes);
    let s = ''; for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function getVapid(storage) {
    let v = await storage.get('vapid');
    if (!v) {
        const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
        v = { publicKey: b64url(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))), privateJwk: await crypto.subtle.exportKey('jwk', kp.privateKey) };
        await storage.put('vapid', v);
    }
    return v;
}
async function sendPush(sub, v) {
    if (!sub || !sub.endpoint) throw new Error('abonnement invalide');
    const aud = new URL(sub.endpoint).origin;
    const head = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
    const claims = b64url(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'https://mendytamadouni2-design.github.io' }));
    const key = await crypto.subtle.importKey('jwk', v.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(head + '.' + claims)));
    const res = await fetch(sub.endpoint, { method: 'POST', headers: { TTL: '86400', Urgency: 'high', Authorization: 'vapid t=' + head + '.' + claims + '.' + b64url(sig) + ', k=' + v.publicKey } });
    if (!res.ok && res.status !== 201) throw new Error('push ' + res.status);
}
