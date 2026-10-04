// Cartoon Instructeur · Transitions entre les plans : 14 effets WebGL (adaptés de HyperFrames, HeyGen, licence Apache 2.0)
// et 16 transitions dessinées en 2D. Claude choisit la plus adaptée à chaque raccord (champ « transition » de la mise en scène).
// (scripts classiques chargés dans l'ordre par index.html : ils partagent les mêmes variables globales)

// ══════════════════════════════════════════════════════════════════
// CATALOGUE — label (affiché), dur (s), use (quand Claude doit la choisir)
// ══════════════════════════════════════════════════════════════════
const TRANSITIONS = {
    // WebGL (HyperFrames)
    'flash-through-white': { label: 'Flash blanc', dur: 0.5, gl: true, use: 'chiffre choc, révélation, moment « waouh »' },
    'whip-pan': { label: 'Filé (whip pan)', dur: 0.45, gl: true, use: 'enchaînement rapide, « et ensuite… », changement d\'idée dynamique' },
    'cinematic-zoom': { label: 'Zoom cinéma', dur: 0.6, gl: true, use: 'on entre dans le détail, plongée dans une explication' },
    'sdf-iris': { label: 'Iris (cercle)', dur: 0.6, gl: true, use: 'style dessin animé, question posée, ouverture/fermeture d\'une partie' },
    'light-leak': { label: 'Fuite de lumière', dur: 0.7, gl: true, use: 'moment doux, émotion, conclusion chaleureuse' },
    'ripple-waves': { label: 'Ondulation', dur: 0.7, gl: true, use: 'idée qui change tout, souvenir, rêve, eau' },
    'glitch': { label: 'Glitch', dur: 0.4, gl: true, use: 'rebondissement, erreur, idée reçue démentie, humour (rarement)' },
    'chromatic-split': { label: 'Séparation des couleurs', dur: 0.45, gl: true, use: 'effet moderne, technologie, énergie' },
    'cross-warp-morph': { label: 'Morphing', dur: 0.7, gl: true, use: 'transformation, avant/après, évolution' },
    'domain-warp': { label: 'Dissolution déformée', dur: 0.8, gl: true, use: 'mystère, magie, imagination' },
    'ridged-burn': { label: 'Brûlure', dur: 0.8, gl: true, use: 'danger, feu, chaleur, moment dramatique (rarement)' },
    'swirl-vortex': { label: 'Tourbillon', dur: 0.7, gl: true, use: 'confusion, tête qui tourne, plongée dans le temps' },
    'gravitational-lens': { label: 'Lentille (trou noir)', dur: 0.8, gl: true, use: 'espace, gravité, aspiration, idée vertigineuse (rarement)' },
    'thermal-distortion': { label: 'Chaleur', dur: 0.7, gl: true, use: 'chaleur, été, désert, climat' },
    // 2D (dessinées par l'appli)
    'push-left': { label: 'Poussée à gauche', dur: 0.45, use: 'suite logique, étape suivante' },
    'push-right': { label: 'Poussée à droite', dur: 0.45, use: 'retour en arrière, rappel' },
    'push-up': { label: 'Poussée vers le haut', dur: 0.45, use: 'progression, montée, « en plus… »' },
    'push-down': { label: 'Poussée vers le bas', dur: 0.45, use: 'descente, conséquence, chute' },
    'slide-cover': { label: 'Recouvrement', dur: 0.45, use: 'nouvelle information qui s\'ajoute' },
    'blocks-wipe': { label: 'Volet en blocs', dur: 0.6, use: 'liste, étapes, construction' },
    'blinds-h': { label: 'Stores horizontaux', dur: 0.55, use: 'changement de sujet net' },
    'blinds-v': { label: 'Stores verticaux', dur: 0.55, use: 'comparaison, deux côtés' },
    'grid-flip': { label: 'Grille', dur: 0.65, use: 'données, organisation, système' },
    'circle-reveal': { label: 'Cercle qui s\'ouvre', dur: 0.55, use: 'focus sur un point, zoom sur une idée' },
    'clock-wipe': { label: 'Horloge', dur: 0.6, use: 'temps qui passe, histoire, dates' },
    'shutter': { label: 'Obturateur', dur: 0.5, use: 'photo, déclic, déclaration forte' },
    'zoom-out': { label: 'Zoom arrière', dur: 0.5, use: 'prendre du recul, vue d\'ensemble' },
    'blur-dissolve': { label: 'Fondu flou', dur: 0.55, use: 'transition douce, calme' },
    'pixelate': { label: 'Pixels', dur: 0.5, use: 'numérique, jeu vidéo, informatique' },
    'flip-3d': { label: 'Retournement 3D', dur: 0.6, use: 'l\'autre face, le revers, surprise' }
};
const TRANSITION_NAMES = Object.keys(TRANSITIONS);
const easeInOutCubic = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

// ══════════════════════════════════════════════════════════════════
// WEBGL : les 14 effets de HyperFrames (même code de shaders), un seul contexte réutilisé
// ══════════════════════════════════════════════════════════════════
const TX_VERT = 'attribute vec2 a_pos; varying vec2 v_uv; void main(){v_uv=a_pos*0.5+0.5; v_uv.y=1.0-v_uv.y; gl_Position=vec4(a_pos,0,1);}';
// haute précision quand l'appareil l'a (en « mediump », l'iPhone calcule sur 16 bits et le bruit des effets s'effondre)
const TX_H = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\nvarying vec2 v_uv;uniform sampler2D u_from, u_to;uniform float u_progress;uniform vec2 u_resolution;uniform vec3 u_accent;uniform vec3 u_accent_dark;uniform vec3 u_accent_bright;\n';
const TX_NQ = 'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*f*(f*(f*6.-15.)+10.);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}float fbm(vec2 p){float v=0.,a=.5;mat2 R=mat2(.8,.6,-.6,.8);for(int i=0;i<5;i++){v+=a*vnoise(p);p=R*p*2.02;a*=.5;}return v;}';
const TX_FRAG = {
    'domain-warp': TX_H + TX_NQ + 'void main(){vec2 q=vec2(fbm(v_uv*3.),fbm(v_uv*3.+vec2(5.2,1.3)));vec2 r=vec2(fbm(v_uv*3.+q*4.+vec2(1.7,9.2)),fbm(v_uv*3.+q*4.+vec2(8.3,2.8)));float n=fbm(v_uv*3.+r*2.);vec2 warpDir=(q-.5)*.4;vec4 A=texture2D(u_from,clamp(v_uv+warpDir*u_progress,0.,1.));vec4 B=texture2D(u_to,clamp(v_uv-warpDir*(1.-u_progress),0.,1.));float e=smoothstep(u_progress-.08,u_progress+.08,n);float ed=abs(n-u_progress);float em=smoothstep(.1,0.,ed)*(1.-step(1.,u_progress));vec3 ec=mix(u_accent_dark,u_accent_bright,smoothstep(0.,.1,ed));gl_FragColor=vec4(mix(B,A,e).rgb+ec*em*2.,1.);}',
    'ridged-burn': TX_H + TX_NQ + 'float ridged(vec2 p){float v=0.,a=.5;mat2 R=mat2(.8,.6,-.6,.8);for(int i=0;i<5;i++){v+=a*abs(vnoise(p)*2.-1.);p=R*p*2.02;a*=.5;}return v;}void main(){vec4 A=texture2D(u_from,v_uv),B=texture2D(u_to,v_uv);float n=ridged(v_uv*4.);float e=smoothstep(u_progress-.04,u_progress+.04,n);float heat=smoothstep(.12,0.,abs(n-u_progress))*(1.-step(1.,u_progress));vec3 burn=mix(u_accent_dark,u_accent,smoothstep(0.,.25,heat));burn=mix(burn,u_accent_bright,smoothstep(.25,.5,heat));burn=mix(burn,vec3(1),smoothstep(.5,1.,heat));float sparks=step(.92,vnoise(v_uv*80.))*heat*3.;gl_FragColor=vec4(mix(B,A,e).rgb+burn*heat*3.5+u_accent_bright*sparks,1.);}',
    'whip-pan': TX_H + 'void main(){float fromOff=u_progress*1.5;vec3 fromC=vec3(0.);for(int i=0;i<10;i++){float f=float(i)/10.;vec2 fuv=vec2(v_uv.x+fromOff+u_progress*.08*f,v_uv.y);fromC+=texture2D(u_from,clamp(fuv,0.,1.)).rgb;}fromC/=10.;float toOff=(1.-u_progress)*1.5;vec3 toC=vec3(0.);for(int i=0;i<10;i++){float f=float(i)/10.;vec2 tuv=vec2(v_uv.x-toOff-(1.-u_progress)*.08*f,v_uv.y);toC+=texture2D(u_to,clamp(tuv,0.,1.)).rgb;}toC/=10.;gl_FragColor=vec4(mix(fromC,toC,u_progress),1.);}',
    'sdf-iris': TX_H + 'void main(){vec4 A=texture2D(u_from,v_uv),B=texture2D(u_to,v_uv);vec2 uv=(v_uv-.5)*vec2(u_resolution.x/u_resolution.y,1.);float d=length(uv);float radius=u_progress*1.2;float fw=.003;float edge=smoothstep(radius+fw,radius-fw,d);float ring1=exp(-abs(d-radius)*25.);float ring2=exp(-abs(d-radius+.04)*20.)*.5;float ring3=exp(-abs(d-radius+.08)*15.)*.25;float glow=(ring1+ring2+ring3)*u_progress*(1.-u_progress)*4.;gl_FragColor=vec4(mix(A,B,edge).rgb+u_accent_bright*glow*.6,1.);}',
    'ripple-waves': TX_H + 'void main(){vec2 uv=v_uv-.5;float dist=length(uv);vec2 dir=normalize(uv+.001);float fromAmp=u_progress*.04;float fw1=exp(sin(dist*25.-u_progress*12.)-1.);float fw2=exp(sin(dist*50.-u_progress*18.)-1.)*.5;vec2 fromUv=clamp(v_uv+dir*(fw1+fw2)*fromAmp,0.,1.);float toAmp=(1.-u_progress)*.04;float tw1=exp(sin(dist*25.+u_progress*12.)-1.);float tw2=exp(sin(dist*50.+u_progress*18.)-1.)*.5;vec2 toUv=clamp(v_uv-dir*(tw1+tw2)*toAmp,0.,1.);vec4 A=texture2D(u_from,fromUv);vec4 B=texture2D(u_to,toUv);float peak=fw1*u_progress;vec3 tint=u_accent_bright*peak*.1;gl_FragColor=vec4(mix(A.rgb+tint,B.rgb,u_progress),1.);}',
    'gravitational-lens': TX_H + 'void main(){vec4 B=texture2D(u_to,v_uv);vec2 uv=v_uv-.5;float dist=length(uv);float pull=u_progress*2.;float warpStr=pull*.3/(dist+.1);vec2 warped=clamp(v_uv-uv*warpStr,0.,1.);vec4 A=texture2D(u_from,warped);float horizon=smoothstep(0.,.3,dist/(1.-u_progress*.85+.001));float shift=pull*.02/(dist+.2);float r=texture2D(u_from,clamp(v_uv-uv*(warpStr+shift),0.,1.)).r;float b=texture2D(u_from,clamp(v_uv-uv*(warpStr-shift),0.,1.)).b;float horizonStrength=smoothstep(0.,.3,u_progress);vec3 lensed=vec3(r,A.g,b)*mix(1.,horizon,horizonStrength);gl_FragColor=vec4(mix(lensed,B.rgb,smoothstep(.3,.9,u_progress)),1.);}',
    'cinematic-zoom': TX_H + 'void main(){vec2 d=v_uv-vec2(.5);float fromS=u_progress*.08;float toS=(1.-u_progress)*.06;float fr=0.,fg=0.,fb=0.;for(int i=0;i<12;i++){float f=float(i)/12.;fr+=texture2D(u_from,v_uv-d*(fromS*1.06)*f).r;fg+=texture2D(u_from,v_uv-d*fromS*f).g;fb+=texture2D(u_from,v_uv-d*(fromS*.94)*f).b;}vec3 fromBl=vec3(fr,fg,fb)/12.;float tr=0.,tg=0.,tb=0.;for(int i=0;i<12;i++){float f=float(i)/12.;tr+=texture2D(u_to,v_uv+d*(toS*1.06)*f).r;tg+=texture2D(u_to,v_uv+d*toS*f).g;tb+=texture2D(u_to,v_uv+d*(toS*.94)*f).b;}vec3 toBl=vec3(tr,tg,tb)/12.;gl_FragColor=vec4(mix(fromBl,toBl,u_progress),1.);}',
    'chromatic-split': TX_H + 'void main(){vec2 c=v_uv-.5;float fromShift=u_progress*.06;float fr=texture2D(u_from,clamp(v_uv+c*fromShift,0.,1.)).r;float fg=texture2D(u_from,v_uv).g;float fb=texture2D(u_from,clamp(v_uv-c*fromShift,0.,1.)).b;vec3 fromSplit=vec3(fr,fg,fb);float toShift=(1.-u_progress)*.06;float tr=texture2D(u_to,clamp(v_uv-c*toShift,0.,1.)).r;float tg=texture2D(u_to,v_uv).g;float tb=texture2D(u_to,clamp(v_uv+c*toShift,0.,1.)).b;vec3 toSplit=vec3(tr,tg,tb);gl_FragColor=vec4(mix(fromSplit,toSplit,u_progress),1.);}',
    'glitch': TX_H + 'float rand(vec2 co){return fract(sin(dot(co,vec2(12.9898,78.233)))*43758.5453);}void main(){float inten=u_progress*(1.-u_progress)*4.;float lineY=floor(v_uv.y*60.)/60.;float lineDisp=(rand(vec2(lineY,floor(u_progress*17.)))-.5)*.18*inten;vec2 block=floor(v_uv*vec2(12.,8.));float br=rand(block+vec2(floor(u_progress*11.)));float ba=step(.83,br)*inten;vec2 bd=(vec2(rand(block*2.1),rand(block*3.7))-.5)*.35*ba;vec2 uv=clamp(v_uv+vec2(lineDisp,0.)+bd,0.,1.);float shift=inten*.035;float r=texture2D(u_from,uv+vec2(shift,0.)).r;float g=texture2D(u_from,uv).g;float b=texture2D(u_from,uv-vec2(shift,0.)).b;vec3 col=vec3(r,g,b);col-=step(.5,fract(v_uv.y*u_resolution.y*.5))*.05*inten;col*=1.+(rand(vec2(floor(u_progress*23.)))-.5)*.3*inten;float levels=mix(256.,8.,inten*.5);col=floor(col*levels)/levels;gl_FragColor=mix(vec4(col,1.),texture2D(u_to,v_uv),u_progress);}',
    'swirl-vortex': TX_H + TX_NQ + 'void main(){vec2 uv=v_uv-.5;float dist=length(uv);float warp=fbm(v_uv*4.)*.5;float fromAng=u_progress*(1.-dist)*10.+warp*u_progress*3.;float fs=sin(fromAng),fc=cos(fromAng);vec2 fromUv=clamp(vec2(uv.x*fc-uv.y*fs,uv.x*fs+uv.y*fc)+.5,0.,1.);float toAng=-(1.-u_progress)*(1.-dist)*10.-warp*(1.-u_progress)*3.;float ts=sin(toAng),tc=cos(toAng);vec2 toUv=clamp(vec2(uv.x*tc-uv.y*ts,uv.x*ts+uv.y*tc)+.5,0.,1.);vec4 A=texture2D(u_from,fromUv);vec4 B=texture2D(u_to,toUv);gl_FragColor=mix(A,B,u_progress);}',
    'thermal-distortion': TX_H + TX_NQ + 'void main(){float heat=u_progress*1.5;float yFade=smoothstep(1.,0.,v_uv.y);float shimmer=sin(v_uv.y*40.+fbm(v_uv*6.)*8.)*fbm(v_uv*3.+vec2(0.,u_progress*2.));float dispX=shimmer*heat*.03*yFade;vec2 fromUv=clamp(v_uv+vec2(dispX,0.),0.,1.);vec4 A=texture2D(u_from,fromUv);float invShimmer=sin(v_uv.y*40.+fbm(v_uv*6.+3.)*8.)*fbm(v_uv*3.+vec2(3.,u_progress*2.));float dispX2=invShimmer*(1.-u_progress)*.03*yFade;vec2 toUv=clamp(v_uv+vec2(dispX2,0.),0.,1.);vec4 B=texture2D(u_to,toUv);float haze=heat*yFade*.15*(1.-u_progress);gl_FragColor=vec4(mix(A.rgb,B.rgb,u_progress)+u_accent_bright*haze,1.);}',
    'flash-through-white': TX_H + 'void main(){vec4 A=texture2D(u_from,v_uv),B=texture2D(u_to,v_uv);float toWhite=smoothstep(0.,.45,u_progress);vec3 fromC=mix(A.rgb,vec3(1.),toWhite);float fromWhite=1.-smoothstep(.5,1.,u_progress);vec3 toC=mix(B.rgb,vec3(1.),fromWhite);gl_FragColor=vec4(mix(fromC,toC,smoothstep(.35,.65,u_progress)),1.);}',
    'cross-warp-morph': TX_H + TX_NQ + 'void main(){vec2 disp=vec2(fbm(v_uv*3.),fbm(v_uv*3.+vec2(7.3,3.7)))-.5;vec2 fromUv=clamp(v_uv+disp*u_progress*.5,0.,1.);vec2 toUv=clamp(v_uv-disp*(1.-u_progress)*.5,0.,1.);vec4 A=texture2D(u_from,fromUv);vec4 B=texture2D(u_to,toUv);float n=fbm(v_uv*4.+vec2(3.1,1.7));float blend=smoothstep(.4,.6,n+u_progress*1.2-.6);gl_FragColor=mix(A,B,blend);}',
    'light-leak': TX_H + 'vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}void main(){vec4 A=texture2D(u_from,v_uv),B=texture2D(u_to,v_uv);vec2 lp=vec2(1.3,-.2);float dist=length(v_uv-lp);float leak=clamp(exp(-dist*1.8)*u_progress*4.,0.,1.);vec3 warmColor=mix(u_accent,u_accent_bright,dist*.7);float flare=exp(-abs(v_uv.y-(-.2+v_uv.x*.3))*15.)*leak*.3;vec3 overexposed=A.rgb+warmColor*leak*3.+u_accent_bright*flare;overexposed=aces(overexposed);gl_FragColor=vec4(mix(overexposed,B.rgb,smoothstep(.15,.85,u_progress)),1.);}'
};
let txGl = null;
function transitionGl() {
    if (txGl !== null) return txGl;
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false, depth: false, stencil: false });
        if (!gl) throw new Error('pas de WebGL');
        const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const tex = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(k => gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE)); [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach(k => gl.texParameteri(gl.TEXTURE_2D, k, gl.LINEAR)); return t; };
        const small = () => document.createElement('canvas');
        txGl = { canvas, gl, buf, progs: {}, texFrom: tex(), texTo: tex(), smallA: small(), smallB: small(), fromKey: null };
    } catch (e) { log('Transitions WebGL indisponibles : ' + e.message); txGl = false; }
    return txGl;
}
function transitionProgram(name) {
    const T = transitionGl(); if (!T) return null;
    if (T.progs[name] !== undefined) return T.progs[name];
    const gl = T.gl;
    try {
        const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
        const p = gl.createProgram();
        gl.attachShader(p, sh(gl.VERTEX_SHADER, TX_VERT)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, TX_FRAG[name]));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('lien');
        const loc = {}; ['u_from', 'u_to', 'u_progress', 'u_resolution', 'u_accent', 'u_accent_dark', 'u_accent_bright'].forEach(n => { loc[n] = gl.getUniformLocation(p, n); });
        T.progs[name] = { p, loc, apos: gl.getAttribLocation(p, 'a_pos') };
    } catch (e) { log('Transition « ' + name + ' » indisponible : ' + e.message); T.progs[name] = null; }
    return T.progs[name];
}
const hexRgb = h => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); const n = m ? parseInt(m[1], 16) : 0xffd23f; return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
function renderGlTransition(name, ctx, A, B, p, W, H, key) {
    if (txGl && txGl.gl.isContextLost()) txGl = null;   // contexte perdu (mémoire, retour d'arrière-plan) : on en recrée un
    const prog = transitionProgram(name); if (!prog) return false;
    const T = txGl, gl = T.gl;
    // calcul à résolution réduite en vertical 1080×1920 (fluide sur iPhone), puis agrandi
    const scale = Math.min(1, 1280 / Math.max(W, H)), w = Math.round(W * scale), h = Math.round(H * scale);
    if (T.canvas.width !== w || T.canvas.height !== h) { T.canvas.width = w; T.canvas.height = h; T.fromKey = null; }
    gl.viewport(0, 0, w, h);
    gl.useProgram(prog.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, T.buf);
    gl.enableVertexAttribArray(prog.apos); gl.vertexAttribPointer(prog.apos, 2, gl.FLOAT, false, 0, 0);
    // textures envoyées à la taille du calcul ; le plan A (fixe pendant tout l'effet) une seule fois par transition
    const shrink = (c, src) => { if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } c.getContext('2d').drawImage(src, 0, 0, w, h); return c; };
    try {
        if (key == null || T.fromKey !== key) {
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.texFrom); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, shrink(T.smallA, A));
            T.fromKey = key == null ? null : key;
        } else { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.texFrom); }
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, T.texTo); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, shrink(T.smallB, B));
    } catch (e) { return false; }
    const acc = hexRgb(accentColor());
    gl.uniform1i(prog.loc.u_from, 0); gl.uniform1i(prog.loc.u_to, 1);
    gl.uniform1f(prog.loc.u_progress, p); gl.uniform2f(prog.loc.u_resolution, w, h);
    gl.uniform3fv(prog.loc.u_accent, acc); gl.uniform3fv(prog.loc.u_accent_dark, acc.map(c => c * 0.35)); gl.uniform3fv(prog.loc.u_accent_bright, acc.map(c => Math.min(1, c * 0.6 + 0.4)));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (gl.isContextLost()) { txGl = null; return false; }
    ctx.drawImage(T.canvas, 0, 0, W, H);
    return true;
}

// ══════════════════════════════════════════════════════════════════
// 2D : transitions dessinées avec le canvas (A = plan précédent, B = nouveau plan)
// ══════════════════════════════════════════════════════════════════
let txScratch = null;
function scratchCanvas(W, H) { if (!txScratch) txScratch = document.createElement('canvas'); if (txScratch.width !== W || txScratch.height !== H) { txScratch.width = W; txScratch.height = H; } return txScratch; }
function render2dTransition(name, ctx, A, B, p, W, H) {
    const e = easeInOutCubic(p);
    const both = (ax, ay, bx, by) => { ctx.drawImage(A, ax, ay, W, H); ctx.drawImage(B, bx, by, W, H); };
    switch (name) {
        case 'push-left': both(-W * e, 0, W * (1 - e), 0); return true;
        case 'push-right': both(W * e, 0, -W * (1 - e), 0); return true;
        case 'push-up': both(0, -H * e, 0, H * (1 - e)); return true;
        case 'push-down': both(0, H * e, 0, -H * (1 - e)); return true;
        case 'slide-cover': {
            ctx.drawImage(A, 0, 0, W, H); ctx.fillStyle = 'rgba(0,0,0,' + 0.35 * e + ')'; ctx.fillRect(0, 0, W, H);
            const bx = W * (1 - e), sw = W * 0.05, gr = ctx.createLinearGradient(bx - sw, 0, bx, 0);
            gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.35)');
            ctx.fillStyle = gr; ctx.fillRect(bx - sw, 0, sw, H); ctx.drawImage(B, bx, 0, W, H); return true;
        }
        case 'blocks-wipe': {
            ctx.drawImage(A, 0, 0, W, H);
            const n = 6;
            for (let i = 0; i < n; i++) {
                const local = clamp01((p - i * 0.08) / (1 - (n - 1) * 0.08)), k = easeInOutCubic(local), y = H * i / n, h = Math.ceil(H / n);
                ctx.fillStyle = accentColor(); ctx.fillRect(0, y, W * Math.min(1, k * 2), h);
                if (k > 0.5) { const r = (k - 0.5) * 2; ctx.drawImage(B, 0, y, W * r, h, 0, y, W * r, h); }
            }
            return true;
        }
        case 'blinds-h': case 'blinds-v': {
            ctx.drawImage(A, 0, 0, W, H);
            const n = 10, vert = name === 'blinds-v';
            for (let i = 0; i < n; i++) {
                const s = (vert ? W : H) / n, o = s * i, k = easeInOutCubic(clamp01(p * 1.3 - i * 0.03)) * s;
                if (vert) ctx.drawImage(B, o, 0, k, H, o, 0, k, H); else ctx.drawImage(B, 0, o, W, k, 0, o, W, k);
            }
            return true;
        }
        case 'grid-flip': {
            ctx.drawImage(A, 0, 0, W, H);
            const cols = 6, rows = Math.max(4, Math.round(6 * H / W)), cw = W / cols, ch = H / rows;
            for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
                const d = (r + c) / (rows + cols - 2), local = clamp01((p - d * 0.5) / 0.5), k = easeInOutCubic(local);
                if (k <= 0) continue;
                const sx = Math.abs(Math.cos(k * Math.PI)), src = k < 0.5 ? A : B, x = c * cw, y = r * ch;
                ctx.save(); ctx.translate(x + cw / 2, y + ch / 2); ctx.scale(Math.max(0.02, sx), 1);
                ctx.drawImage(src, x, y, cw, ch, -cw / 2, -ch / 2, cw + 1, ch + 1); ctx.restore();
            }
            return true;
        }
        case 'circle-reveal': {
            ctx.drawImage(A, 0, 0, W, H);
            ctx.save(); ctx.beginPath(); ctx.arc(W / 2, H * 0.45, Math.hypot(W, H) * 0.6 * e, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(B, 0, 0, W, H); ctx.restore();
            ctx.save(); ctx.strokeStyle = accentColor(); ctx.lineWidth = Math.min(W, H) * 0.012 * (1 - e); ctx.beginPath(); ctx.arc(W / 2, H * 0.45, Math.hypot(W, H) * 0.6 * e, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
            return true;
        }
        case 'clock-wipe': {
            ctx.drawImage(A, 0, 0, W, H);
            ctx.save(); ctx.beginPath(); ctx.moveTo(W / 2, H / 2); ctx.arc(W / 2, H / 2, Math.hypot(W, H), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * e); ctx.closePath(); ctx.clip(); ctx.drawImage(B, 0, 0, W, H); ctx.restore();
            return true;
        }
        case 'shutter': {
            // deux volets se ferment (couleur de la chaîne) puis s'ouvrent sur le nouveau plan
            const close = p < 0.5 ? easeInOutCubic(p * 2) : 1 - easeInOutCubic((p - 0.5) * 2);
            ctx.drawImage(p < 0.5 ? A : B, 0, 0, W, H);
            ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H / 2 * close); ctx.fillRect(0, H - H / 2 * close, W, H / 2 * close);
            ctx.fillStyle = accentColor(); ctx.fillRect(0, H / 2 * close - 4, W, 4 * close); ctx.fillRect(0, H - H / 2 * close, W, 4 * close);
            return true;
        }
        case 'zoom-out': {
            ctx.drawImage(B, 0, 0, W, H);
            const s = 1 - 0.6 * e;
            ctx.save(); ctx.globalAlpha = 1 - e; ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.drawImage(A, -W / 2, -H / 2, W, H); ctx.restore();
            return true;
        }
        case 'blur-dissolve': {
            const b = Math.sin(p * Math.PI) * Math.min(W, H) * 0.02;
            ctx.save(); try { ctx.filter = 'blur(' + b.toFixed(1) + 'px)'; } catch (err) {}
            ctx.drawImage(A, 0, 0, W, H); ctx.globalAlpha = e; ctx.drawImage(B, 0, 0, W, H); ctx.restore();
            return true;
        }
        case 'pixelate': {
            const k = Math.sin(p * Math.PI), cell = Math.max(1, Math.round(k * Math.min(W, H) / 28)), src = p < 0.5 ? A : B;
            if (cell <= 2) { ctx.drawImage(src, 0, 0, W, H); return true; }
            const sw = Math.max(2, Math.round(W / cell)), sh = Math.max(2, Math.round(H / cell));
            const s = scratchCanvas(Math.ceil(W / 2), Math.ceil(H / 2)), sg = s.getContext('2d');
            sg.imageSmoothingEnabled = true; sg.globalAlpha = 1; sg.drawImage(src, 0, 0, sw, sh);
            ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(s, 0, 0, sw, sh, 0, 0, W, H); ctx.restore();
            return true;
        }
        case 'flip-3d': {
            // retournement autour de l'axe vertical (perspective simulée par l'échelle et un léger assombrissement)
            ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
            const ang = e * Math.PI, sx = Math.abs(Math.cos(ang)), src = ang < Math.PI / 2 ? A : B;
            ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(Math.max(0.01, sx) * (1 - 0.1 * Math.sin(ang)), 1 - 0.1 * Math.sin(ang));
            ctx.drawImage(src, -W / 2, -H / 2, W, H);
            ctx.fillStyle = 'rgba(0,0,0,' + 0.4 * Math.sin(ang) + ')'; ctx.fillRect(-W / 2, -H / 2, W, H); ctx.restore();
            return true;
        }
    }
    return false;
}

// Compile à l'avance les effets WebGL que le montage va utiliser (plan de Claude + choix automatiques possibles)
function warmTransitions(plans) {
    const names = new Set(plans.map(p => p && p.transition).concat(TX_AUTO, ['flash-through-white', 'sdf-iris', 'cross-warp-morph']));
    names.forEach(n => { if (TRANSITIONS[n]?.gl) transitionProgram(n); });
}
// Dessine la transition (repli : fondu enchaîné si l'effet n'est pas disponible sur cet appareil)
function renderTransition(name, ctx, A, B, p, W, H, key) {
    p = clamp01(p);
    const t = TRANSITIONS[name];
    const ok = t && (t.gl ? renderGlTransition(name, ctx, A, B, p, W, H, key) : render2dTransition(name, ctx, A, B, p, W, H));
    if (!ok) { ctx.drawImage(A, 0, 0, W, H); ctx.save(); ctx.globalAlpha = easeInOutCubic(p); ctx.drawImage(B, 0, 0, W, H); ctx.restore(); }
}
// Choix automatique si Claude n'a rien choisi : selon le contenu de la réplique, sans répéter deux fois la même
const TX_AUTO = ['whip-pan', 'push-left', 'cinematic-zoom', 'sdf-iris', 'push-up', 'light-leak', 'slide-cover', 'circle-reveal', 'chromatic-split', 'blocks-wipe'];
function autoTransitionFor(plan, index, prev) {
    const txt = String(plan.spoken || '').toLowerCase();
    let pick = null;
    if (plan.highlight && /\d/.test(plan.highlight)) pick = 'flash-through-white';
    else if (/\?$/.test(txt.trim())) pick = 'sdf-iris';
    else if (/\b(avant|après|devient|transform|évolu)/.test(txt)) pick = 'cross-warp-morph';
    else if (/\b(temps|siècle|année|histoire|date)/.test(txt)) pick = 'clock-wipe';
    if (!pick || pick === prev) pick = TX_AUTO[index % TX_AUTO.length];
    if (pick === prev) pick = TX_AUTO[(index + 1) % TX_AUTO.length];
    return pick;
}
// Transition qui amène la réplique : celle choisie par Claude (ou au storyboard), sinon un choix automatique une réplique sur deux
function sceneTransitionFor(plan, index, prev) {
    if (!plan || plan.transition === 'none') return null;
    if (TRANSITIONS[plan.transition]) return plan.transition === prev ? autoTransitionFor(plan, index, prev) : plan.transition;
    return index % 2 ? autoTransitionFor(plan, index, prev) : null;
}
// Consigne pour Claude (mise en scène) : liste des transitions et quand les utiliser
function transitionPlanLine() {
    return '- "transition" : l\'effet de transition qui AMÈNE cette réplique (ignoré pour la première), ou "none" pour un simple raccord. ' +
        'Mets un effet sur environ une réplique sur deux, aux moments qui le méritent, jamais deux fois le même d\'affilée, et varie. Choix : ' +
        TRANSITION_NAMES.map(n => '"' + n + '" (' + TRANSITIONS[n].use + ')').join(', ') + '.\n';
}
