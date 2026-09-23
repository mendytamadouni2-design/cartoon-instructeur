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

export default {
    async fetch(request, env) {
        const origin = request.headers.get('Origin') || '';
        const allowed = ALLOWED_ORIGINS.includes(origin);
        const cors = {
            'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
            'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Range, Content-Type',
            'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Content-Type',
            'Vary': 'Origin'
        };
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
        if (!allowed) return new Response('Origine non autorisée : ' + origin, { status: 403, headers: cors });

        const url = new URL(request.url);
        if (url.pathname.startsWith('/jobs')) return handleJobs(request, env, url, cors);

        const target = url.searchParams.get('url');
        if (!target) return new Response(env.JOBS ? 'Relais OK · jobs' : 'Relais OK', { status: 200, headers: cors });
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

// ══════════════════════════════════════════════════════════════════
// Un projet de vidéo = un Durable Object (stockage + réveil périodique)
// ══════════════════════════════════════════════════════════════════
export class VideoJob {
    constructor(ctx, env) { this.ctx = ctx; this.storage = ctx.storage; }

    async fetch(request) {
        const action = new URL(request.url).pathname.slice(1);
        if (action === 'start') return this.start(request);
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

    async start(request) {
        let p;
        try { p = await request.json(); } catch (e) { return Response.json({ error: 'Données illisibles' }, { status: 400 }); }
        if (!p.agnesKey || !p.image || !Array.isArray(p.templates) || !p.templates.length) {
            return Response.json({ error: 'Projet incomplet (clé Agnes, photo ou scènes manquantes)' }, { status: 400 });
        }
        if (p.image.length > 1900000) return Response.json({ error: 'Photo trop lourde' }, { status: 413 });
        const n = p.templates.length;
        const job = {
            status: 'planning', message: 'Mise en scène…', createdAt: Date.now(), updatedAt: Date.now(),
            frames: p.frames || 153, frameRate: p.frameRate || 24,
            plan: p.fallbackPlan || null, planRequest: p.planRequest || null,
            drawingRequests: Array.isArray(p.drawingRequests) ? p.drawingRequests : [],
            drawingsDone: 0, nextCreateAt: 0,
            scenes: Array.from({ length: n }, (_, i) => ({ index: i, status: 'pending', videoId: null, videoUrl: null, error: null, startedAt: null, attempts: 0 }))
        };
        await this.storage.put('job', job);
        await this.storage.put('templates', p.templates);
        await this.storage.put('image', p.image);
        await this.storage.put('secrets', { agnesKey: p.agnesKey, claudeKey: p.claudeKey || '', claudeModel: p.claudeModel || 'claude-opus-5' });
        await this.storage.put('drawings', []);
        await this.storage.setAlarm(Date.now() + 500);
        return Response.json({ ok: true });
    }

    async alarm() {
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
        if (job.drawingsDone < job.drawingRequests.length && secrets.claudeKey) {
            const i = job.drawingsDone;
            const drawings = (await this.storage.get('drawings')) || [];
            try {
                const req = { ...job.drawingRequests[i] };
                const spoken = job.plan?.scenes?.[i]?.spoken;
                if (spoken && req.prompt) req.prompt = req.prompt.replace('{{SPOKEN}}', spoken);
                else if (req.prompt) req.prompt = req.prompt.replace('{{SPOKEN}}', req.fallbackText || '');
                drawings[i] = await callClaude(secrets, req);
            } catch (e) { drawings[i] = null; }
            await this.storage.put('drawings', drawings);
            job.drawingsDone++;
        } else if (!secrets.claudeKey) job.drawingsDone = job.drawingRequests.length;

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
                    if (u) { sc.status = 'done'; sc.videoUrl = u; } else { sc.status = 'failed'; sc.error = 'terminé sans vidéo'; }
                } else if (['failed', 'error', 'cancelled'].includes(status)) { sc.status = 'failed'; sc.error = 'échec Agnes (' + status + ')'; }
            } catch (e) { /* réseau : on réessaiera au prochain réveil */ }
        }

        // 3. Création de la scène suivante (une à la fois, limite de débit Agnes)
        const next = job.scenes.find(s => s.status === 'pending');
        if (next && now >= job.nextCreateAt) {
            const templates = await this.storage.get('templates');
            const image = await this.storage.get('image');
            const prompt = fillTemplate(templates[next.index], job.plan?.scenes?.[next.index], job.plan?.setting);
            try {
                const res = await fetch(AGNES_API + '/videos', {
                    method: 'POST',
                    headers: { Authorization: 'Bearer ' + secrets.agnesKey, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: AGNES_MODEL, prompt, image, num_frames: job.frames, frame_rate: job.frameRate })
                });
                if (res.status === 429 || res.status === 503) {
                    job.nextCreateAt = now + 90000;
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
        job.message = done + '/' + job.scenes.length + ' scènes prêtes' + (drawingsLeft > 0 ? ' · ' + drawingsLeft + ' dessins en cours' : '');
        if (done + failed === job.scenes.length && drawingsLeft <= 0) {
            job.status = done ? 'done' : 'failed';
            job.message = done ? 'Scènes prêtes : il ne reste que le montage' : 'Aucune scène n\'a pu être générée';
        }
    }

    // Fin (terminé, échoué ou arrêté) : on efface les clés et les données lourdes.
    async finish(job) {
        await this.storage.delete(['secrets', 'image', 'templates']);
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
        scenes: job.scenes.map(s => ({ index: s.index, status: s.status, videoUrl: s.videoUrl, error: s.error, progress: s.progress || 0 }))
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
            return { spoken: s.spoken || f.spoken, action: s.action || f.action, camera: s.camera || f.camera, bubble: String(s.bubble || '').slice(0, 60) };
        })
    };
}

async function callClaude(secrets, req) {
    const model = secrets.claudeModel || 'claude-opus-5';
    const body = { model, max_tokens: req.maxTokens || 16000, system: req.system, messages: [{ role: 'user', content: req.prompt }] };
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
