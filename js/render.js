// Cartoon Instructeur · Montage image par image (WebCodecs) : chaque image est calculée puis encodée en H.264,
// le son est mixé hors temps réel (OfflineAudioContext) puis encodé, et le tout est rangé dans un MP4.
// Avantages sur l'enregistrement de l'écran (MediaRecorder) : images parfaites (aucune saccade), souvent plus rapide
// que le temps réel, indifférent au passage en arrière-plan. Repli automatique sur l'ancien montage en cas de souci.
// (scripts classiques chargés dans l'ordre par index.html : ils partagent les mêmes variables globales)

const RENDER_FPS = 30;
const scriptLoads = new Map();
function loadScriptOnce(src) {
    if (!scriptLoads.has(src)) scriptLoads.set(src, new Promise((res, rej) => {
        const s = document.createElement('script'); s.src = src; s.async = true;
        s.onload = res; s.onerror = () => { scriptLoads.delete(src); rej(new Error('chargement de ' + src + ' impossible')); };
        document.head.appendChild(s);
    }));
    return scriptLoads.get(src);
}
function webcodecsAvailable() {
    return typeof VideoEncoder === 'function' && typeof VideoFrame === 'function' && typeof AudioEncoder === 'function' &&
        typeof AudioData === 'function' && typeof OfflineAudioContext === 'function' && typeof EncodedVideoChunk === 'function';
}
const tick = () => new Promise(r => setTimeout(r, 0));

// ─────────────── Encodeurs : on prend le meilleur profil que l'appareil sait encoder ───────────────
// H.264 d'abord (lu partout : iPhone, YouTube, TikTok) ; VP9 / AV1 en MP4 seulement si l'appareil n'a pas de H.264
async function pickVideoConfig(W, H, bitrate) {
    const list = [['avc1.640028', 'avc'], ['avc1.4d0028', 'avc'], ['avc1.42e028', 'avc'], ['avc1.640033', 'avc'], ['avc1.42001f', 'avc'], ['vp09.00.40.08', 'vp9'], ['av01.0.08M.08', 'av1']];
    for (const [codec, mux] of list) {
        const cfg = { codec, width: W, height: H, bitrate, framerate: RENDER_FPS, latencyMode: 'quality' };
        if (mux === 'avc') cfg.avc = { format: 'avc' };
        try { const r = await VideoEncoder.isConfigSupported(cfg); if (r.supported) return { config: r.config || cfg, mux }; } catch (e) {}
    }
    return null;
}
async function pickAudioConfig(sampleRate) {
    for (const [codec, mux] of [['mp4a.40.2', 'aac'], ['opus', 'opus']]) {
        const cfg = { codec, sampleRate, numberOfChannels: 2, bitrate: 192000 };
        try { const r = await AudioEncoder.isConfigSupported(cfg); if (r.supported) return { config: r.config || cfg, mux }; } catch (e) {}
    }
    return null;
}
// Session d'encodage : frame(canvas, t) pour chaque image, finish(audioBuffer) pour terminer
async function createOfflineSession({ W, H, bitrate, sampleRate }) {
    await loadScriptOnce('js/vendor/mp4-muxer.js');
    const vsel = await pickVideoConfig(W, H, bitrate);
    if (!vsel) throw new Error('encodeur vidéo indisponible sur cet appareil');
    const vcfg = vsel.config;
    const acfg = await pickAudioConfig(sampleRate);
    if (!acfg) throw new Error('encodeur audio indisponible sur cet appareil');
    const target = new Mp4Muxer.ArrayBufferTarget();
    const muxer = new Mp4Muxer.Muxer({
        target, fastStart: 'in-memory', firstTimestampBehavior: 'offset',
        video: { codec: vsel.mux, width: W, height: H, frameRate: RENDER_FPS },
        audio: { codec: acfg.mux, numberOfChannels: 2, sampleRate }
    });
    let failure = null, count = 0;
    const venc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: e => { failure = e; } });
    venc.configure(vcfg);
    return {
        fps: RENDER_FPS, codec: vcfg.codec, audioCodec: acfg.config.codec,
        async frame(canvas, t) {
            if (failure) throw failure;
            const vf = new VideoFrame(canvas, { timestamp: Math.round(t * 1e6), duration: Math.round(1e6 / RENDER_FPS) });
            venc.encode(vf, { keyFrame: count % (RENDER_FPS * 2) === 0 });   // une image clé toutes les 2 s
            vf.close(); count++;
            while (venc.encodeQueueSize > 6) { await tick(); if (failure) throw failure; }   // pas plus de 6 images en attente (mémoire iPhone)
        },
        async finish(audio) {
            await venc.flush(); if (failure) throw failure; venc.close();
            const aenc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: e => { failure = e; } });
            aenc.configure(acfg.config);
            const block = 4096, len = audio.length, ch0 = audio.getChannelData(0), ch1 = audio.getChannelData(Math.min(1, audio.numberOfChannels - 1));
            for (let i = 0; i < len; i += block) {
                const n = Math.min(block, len - i), data = new Float32Array(n * 2);
                data.set(ch0.subarray(i, i + n), 0); data.set(ch1.subarray(i, i + n), n);
                const ad = new AudioData({ format: 'f32-planar', sampleRate, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(i / sampleRate * 1e6), data });
                aenc.encode(ad); ad.close();
                while (aenc.encodeQueueSize > 16) { await tick(); if (failure) throw failure; }
            }
            await aenc.flush(); aenc.close();
            if (failure) throw failure;
            muxer.finalize();
            return new Blob([target.buffer], { type: 'video/mp4' });
        },
        abort() { try { venc.close(); } catch (e) {} }
    };
}

// ─────────────── Sources d'images des scènes ───────────────
// 1) MP4 (scènes Agnes) : démultiplexage + VideoDecoder, lecture séquentielle très rapide
// 2) repli (WebM, codec non géré) : vidéo positionnée image par image
async function openFrameSource(item, v) {
    try {
        const head = new Uint8Array(await item.blob.slice(0, 12).arrayBuffer());
        const isMp4 = String.fromCharCode(...head.slice(4, 8)) === 'ftyp';
        if (isMp4 && typeof VideoDecoder === 'function') return await openMp4Decoder(item.blob);
    } catch (e) { log('Décodage direct de la scène ' + (item.sceneIndex + 1) + ' : ' + e.message + ' (lecture image par image)'); }
    return seekFrameSource(v);
}
function seekFrameSource(v) {
    const surf = document.createElement('canvas'); surf.width = v.videoWidth || 1280; surf.height = v.videoHeight || 720;
    const g = surf.getContext('2d');
    return {
        canvas: surf, kind: 'seek',
        async at(time) { await seekTo(v, Math.max(0, Math.min(time, (v.duration || time) - 0.01))); g.drawImage(v, 0, 0, surf.width, surf.height); },
        close() {}
    };
}
async function openMp4Decoder(blob) {
    await loadScriptOnce('js/vendor/mp4box.all.min.js');
    const buf = await blob.arrayBuffer();
    const file = MP4Box.createFile();
    const ready = new Promise((res, rej) => { file.onReady = res; file.onError = e => rej(new Error('mp4 illisible : ' + e)); });
    buf.fileStart = 0; file.appendBuffer(buf); file.flush();
    const info = await withTimeout(ready, 15000, 'mp4 illisible');
    const track = info.videoTracks[0];
    if (!track) throw new Error('pas de piste vidéo');
    // description du codec (avcC / hvcC…) exigée par VideoDecoder pour le H.264 « avc »
    const trak = file.getTrackById(track.id);
    let description;
    for (const entry of trak.mdia.minf.stbl.stsd.entries) {
        const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
        if (box) { const ds = new DataStream(undefined, 0, DataStream.BIG_ENDIAN); box.write(ds); description = new Uint8Array(ds.buffer, 8); break; }
    }
    const config = { codec: track.codec, codedWidth: track.video.width, codedHeight: track.video.height, description, optimizeForLatency: false };
    const sup = await VideoDecoder.isConfigSupported(config);
    if (!sup.supported) throw new Error('codec ' + track.codec + ' non décodable ici');
    const samples = [];
    file.onSamples = (id, user, s) => { for (const x of s) samples.push(x); };
    file.setExtractionOptions(track.id, null, { nbSamples: 1e6 });
    file.start(); file.flush();
    if (!samples.length) throw new Error('scène vide');
    const frames = [];
    let failure = null, fed = 0, flushed = false, shown = null;
    const dec = new VideoDecoder({ output: f => frames.push(f), error: e => { failure = e; } });
    dec.configure(config);
    const chunkOf = s => new EncodedVideoChunk({ type: s.is_sync ? 'key' : 'delta', timestamp: Math.round(1e6 * s.cts / s.timescale), duration: Math.round(1e6 * s.duration / s.timescale), data: s.data });
    const surf = document.createElement('canvas'); surf.width = track.video.width; surf.height = track.video.height;
    const g = surf.getContext('2d');
    const halfFrame = 1e6 * (samples[0].duration / samples[0].timescale) / 2;
    return {
        canvas: surf, kind: 'decoder', duration: info.duration / info.timescale,
        async at(time) {
            const target = time * 1e6;
            // on décode en avance jusqu'à obtenir une image au-delà de l'instant voulu
            for (let guard = 0; guard < 10000; guard++) {
                if (failure) throw failure;
                const last = frames[frames.length - 1];
                if (last && last.timestamp + halfFrame >= target) break;
                if (fed >= samples.length) { if (!flushed) { flushed = true; await dec.flush(); continue; } break; }
                const end = Math.min(samples.length, fed + 4);
                for (; fed < end; fed++) dec.decode(chunkOf(samples[fed]));
                await tick();
                while (dec.decodeQueueSize > 2 && !failure) await tick();
            }
            // image affichée : la dernière dont l'instant est atteint ; les plus anciennes sont libérées
            let pick = 0;
            for (let i = 0; i < frames.length; i++) if (frames[i].timestamp <= target + halfFrame) pick = i;
            if (!frames.length) return;
            const f = frames[pick];
            if (f !== shown) { g.drawImage(f, 0, 0, surf.width, surf.height); shown = f; }
            frames.splice(0, pick).forEach(x => { if (x !== shown) x.close(); });
        },
        close() { frames.forEach(x => { try { x.close(); } catch (e) {} }); frames.length = 0; try { dec.close(); } catch (e) {} }
    };
}

// ─────────────── Son hors temps réel ───────────────
// Durée maximale estimée du montage (pour dimensionner le mixage) : on garde une marge, puis on coupe à la vraie durée
function estimateTimeline(segs, maxDuration) {
    let total = 0;
    for (const s of segs) {
        if (s.type === 'scene') total += Math.max(12, (s.item.ttsBuffer?.duration || 0) + 2);
        else if (s.type === 'board') total += (s.item.narrBuffer?.duration || 0) + 1.5;
        else total += (s.dur || 4) + 0.5;
    }
    return Math.min(total, maxDuration) + 3;
}
// Contexte audio hors temps réel dont l'horloge suit l'image en cours de calcul
function createOfflineAudio(seconds, clock, sampleRate = 48000) {
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
    Object.defineProperty(ctx, 'currentTime', { get: () => clock.t, configurable: true });
    return ctx;
}
function trimAudio(buffer, seconds) {
    const n = Math.max(1, Math.min(buffer.length, Math.round(seconds * buffer.sampleRate)));
    const out = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: buffer.sampleRate });
    for (let c = 0; c < 2; c++) {
        const d = buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1)).subarray(0, n);
        // fondu de 20 ms à la fin : pas de clic
        const fade = Math.min(n, Math.round(0.02 * buffer.sampleRate)), copy = new Float32Array(d);
        for (let i = 0; i < fade; i++) copy[n - 1 - i] *= i / fade;
        out.copyToChannel(copy, c);
    }
    return out;
}
