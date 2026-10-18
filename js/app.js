'use strict';
/* NEOSTREAMS — clone TVGlobe + listas próprias + player multi-formato + proxys */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const LS_FAV = 'neostreams_favs_v1';
const LS_CUSTOM = 'neostreams_custom_sources_v1';
const LS_CONSENT = 'neostreams_consent_v1';
const LS_AUTH = 'neostreams_auth_v1';

/* ---------- sessão (área de membros) ---------- */
function getSession() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_AUTH) || 'null');
    if (s && s.token && s.exp && Date.now() < s.exp) return s;
  } catch (e) {}
  return null;
}
function isMember() { return !!getSession(); }
function isCustomSource(id) { return (state.custom || []).some(s => s.id === id); }
function authToken() { const s = getSession(); return s ? s.token : ''; }
function authHeaders() {
  const t = authToken();
  return t ? { Authorization: 'Bearer ' + t } : {};
}

const COUNTRY_FLAGS = { PT: '🇵🇹', US: '🇺🇸', UK: '🇬🇧', ES: '🇪🇸', FR: '🇫🇷', DE: '🇩🇪', IT: '🇮🇹', BR: '🇧🇷', CA: '🇨🇦', IN: '🇮🇳', NL: '🇳🇱', BE: '🇧🇪', CH: '🇨🇭', PL: '🇵🇱', IE: '🇮🇪', SE: '🇸🇪', NO: '🇳🇴', DK: '🇩🇰', FI: '🇫🇮', GR: '🇬🇷', TR: '🇹🇷', MA: '🇲🇦', DZ: '🇩🇿', AO: '🇦🇴', MZ: '🇲🇿', CV: '🇨🇻', GW: '🇬🇼', ST: '🇸🇹', TL: '🇹🇱', LU: '🇱🇺', AD: '🇦🇩', AR: '🇦🇷', MX: '🇲🇽', CO: '🇨🇴', VE: '🇻🇪', CL: '🇨🇱', PE: '🇵🇪', UY: '🇺🇾', AU: '🇦🇺', JP: '🇯🇵', CN: '🇨🇳', KR: '🇰🇷' };
const COUNTRY_NAMES = { PT: 'Portugal', US: 'Estados Unidos', UK: 'Reino Unido', ES: 'Espanha', FR: 'França', DE: 'Alemanha', IT: 'Itália', BR: 'Brasil' };
const CAT_ICONS = { 'portugal | sports': '⚽', sports: '⚽', news: '📰', entertainment: '🎬', movies: '🎥', music: '🎵', kids: '👶', documentary: '📚', religious: '🙏', general: '📺', education: '🎓', lifestyle: '💅', cooking: '🍳', comedy: '😂', animation: '🎨', business: '💼', culture: '🎭', weather: '🌤️', series: '📺', shop: '🛒' };

const state = {
  builtin: [], custom: [], channels: [], bySource: {}, xtBySource: {},
  activeSource: 'all', activeCategory: 'all', activeCountry: 'all', contentType: 'live',
  query: '', favs: new Set(JSON.parse(localStorage.getItem(LS_FAV) || '[]')),
  showFavs: false, page: 0, pageSize: 48, displayed: [],
  countries: [], categories: [], hasLocalProxy: false, health: {},
};
const MOVIE_RE = /(film|filme|movie|vod|cine|cinema|pelicula|película|kids|infantil|documentaries|documentary)/i;
const SERIES_RE = /(serie|série|series|temporada|season|episode|episodio|episódio|anime|novela)/i;
function classifyKind(group, name) {
  const g = `${group || ''} ${name || ''}`;
  if (SERIES_RE.test(g)) return 'series';
  if (MOVIE_RE.test(g)) return 'movie';
  return 'live';
}

function toast(msg, isErr) {
  const el = $('toast'); el.textContent = msg;
  el.classList.toggle('err', !!isErr); el.classList.add('show');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 4200);
}

/* ---------- proxys ---------- */
async function detectLocalProxy() {
  try {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 2500);
    const r = await fetch('api/health', { signal: c.signal }); clearTimeout(t);
    state.hasLocalProxy = r.ok;
  } catch (e) {
    try {
      const c2 = new AbortController(); const t2 = setTimeout(() => c2.abort(), 2500);
      const r2 = await fetch('/api/health', { signal: c2.signal }); clearTimeout(t2);
      state.hasLocalProxy = r2.ok;
    } catch (e2) { state.hasLocalProxy = false; }
  }
}
const localProxy = (url) => `proxy?url=${encodeURIComponent(url)}`;
const localProxyM3u8 = (url) => `proxy/m3u8?url=${encodeURIComponent(url)}`;
const PUB_PROXIES = [
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
];

async function fetchTextSmart(url, onProgress, timeoutMs) {
  timeoutMs = timeoutMs || 45000;
  const tries = [];
  if (/^playlists\//.test(url) || url.startsWith('../') || url.startsWith('/') || url.startsWith('api/')) tries.push(url);
  else {
    tries.push(url);
    if (state.hasLocalProxy) tries.push(localProxy(url));
    PUB_PROXIES.forEach(fn => tries.push(fn(url)));
    tries.push(localProxy(url)); // tenta na mesma no fim
  }
  let lastErr = null;
  for (const t of [...new Set(tries)]) {
    try { return await readBodyStreamed(t, onProgress, timeoutMs); } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('fetch falhou');
}
async function readBodyStreamed(url, onProgress, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'Accept': '*/*' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    if (!r.body || !r.body.getReader) { const txt = await r.text(); return txt; }
    const reader = r.body.getReader();
    const dec = new TextDecoder(); let acc = ''; let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      acc += dec.decode(value, { stream: true }); bytes += value.length;
      if (onProgress) onProgress(bytes);
      if (acc.length > 120 * 1024 * 1024) throw new Error('lista demasiado grande (>120MB)');
    }
    acc += dec.decode();
    return acc;
  } finally { clearTimeout(t); }
}
async function fetchJsonSmart(url, timeoutMs) {
  const txt = await fetchTextSmart(url, null, timeoutMs || 25000);
  return JSON.parse(txt);
}

/* ---------- parsers ---------- */
function parseExtInf(line) {
  const attrs = {}; const re = /([\w-]+)="([^"]*)"/g; let m;
  while ((m = re.exec(line))) attrs[m[1]] = m[2];
  const comma = line.lastIndexOf(',');
  return { name: comma >= 0 ? line.slice(comma + 1).trim() : '', logo: attrs['tvg-logo'] || '', id: attrs['tvg-id'] || '', group: attrs['group-title'] || '' };
}
function inferCountry(name, group, tvgId) {
  const s = `${name} ${group} ${tvgId}`.toLowerCase();
  if (/\bpt\b|portugal|\.pt\b| \| pt|\(pt\)|\[pt\]/.test(s) || /(sport tv|eleven|bola|benfica|porto|sporting|rtp|sic|tvi|cmtv)/.test(s)) return 'PT';
  if (/\buk\b|united kingdom|sky uk|bbc|itv /.test(s)) return 'UK';
  if (/\busa\b|\bus\b|united states/.test(s)) return 'US';
  if (/espa[a|n]|\.es\b/.test(s)) return 'ES';
  if (/fran[a|c]|\.fr\b/.test(s)) return 'FR';
  if (/italia|\.it\b/.test(s)) return 'IT';
  if (/brasil|\.br\b/.test(s)) return 'BR';
  if (/deutsch|\.de\b/.test(s)) return 'DE';
  const mm = /\.([a-z]{2})\b/.exec((tvgId || '').toLowerCase());
  if (mm && COUNTRY_FLAGS[mm[1].toUpperCase()]) return mm[1].toUpperCase();
  return 'INT';
}
function normCat(group) {
  const g = (group || '').trim();
  if (!g) return 'General';
  if (/portugal\s*\|\s*sports/i.test(g)) return 'Portugal | Sports';
  return g.length > 40 ? g.slice(0, 40) : g;
}
function parseM3U(text, sourceId, featured) {
  const out = [];
  let ext = null; let n = 0;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF')) ext = parseExtInf(line);
    else if (!line.startsWith('#')) {
      if (ext && /^https?:\/\//i.test(line)) {
        const country = inferCountry(ext.name, ext.group, ext.id);
        out.push({
          uid: `${sourceId}:${n++}`, name: ext.name || `Canal ${n}`,
          logo: ext.logo || '', group: ext.group || '', category: normCat(ext.group),
          country, countryName: COUNTRY_NAMES[country] || (country === 'INT' ? 'Internacional' : country),
          url: line, sourceId, featured: !!featured,
        });
      }
      ext = null;
    }
  }
  return out;
}
function parseXtreamUrl(url) {
  try {
    const u = new URL(url, location.href);
    const user = u.searchParams.get('username') || '';
    const pass = u.searchParams.get('password') || '';
    if (!user || !pass) return null;
    const base = `${u.protocol}//${u.hostname}${u.port ? ':' + u.port : ''}/`;
    return { base, user, pass, api: (a) => `${base}player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}&action=${a}` };
  } catch (e) { return null; }
}
async function loadXtreamApi(xt, sourceId) {
  const out = [];
  state.xtBySource[sourceId] = xt;
  // JSONs grandes (VOD/séries) precisam de timeout generoso + 1 retry; cats são leves
  const get = (url, ms) => fetchJsonSmart(url, ms).catch(() => fetchJsonSmart(url, ms)).catch(() => []);
  try {
    const [cats, streams] = await Promise.all([
      get(xt.api('get_live_categories'), 25000),
      get(xt.api('get_live_streams'), 60000),
    ]);
    const catMap = {};
    if (Array.isArray(cats)) cats.forEach(c => { catMap[String(c.category_id)] = c.category_name; });
    if (Array.isArray(streams)) streams.forEach((s, i) => {
      const id = s.stream_id;
      const cat = catMap[String(s.category_id)] || 'General';
      const url = `${xt.base}live/${encodeURIComponent(xt.user)}/${encodeURIComponent(xt.pass)}/${id}.m3u8`;
      const urlTs = `${xt.base}live/${encodeURIComponent(xt.user)}/${encodeURIComponent(xt.pass)}/${id}.ts`;
      const nm = s.name || `Canal ${id}`;
      out.push({
        uid: `${sourceId}:x${i}`, name: nm, logo: s.stream_icon || '',
        group: cat, category: normCat(cat), kind: 'live',
        country: inferCountry(nm, cat, ''), countryName: 'Direto',
        url, urlAlt: urlTs, sourceId, featured: false,
      });
      out[out.length - 1].countryName = COUNTRY_NAMES[out[out.length - 1].country] || out[out.length - 1].country;
    });
  } catch (e) { /* ignora, M3U já cobre */ }
  // VOD: filmes + séries (em background, com limite anti-crash)
  try {
    const [vodCats, seriesCats, vods, series] = await Promise.all([
      get(xt.api('get_vod_categories'), 25000),
      get(xt.api('get_series_categories'), 25000),
      get(xt.api('get_vod_streams'), 120000),
      get(xt.api('get_series'), 90000),
    ]);
    const vMap = {};
    if (Array.isArray(vodCats)) vodCats.forEach(c => { vMap[String(c.category_id)] = c.category_name; });
    const sMap = {};
    if (Array.isArray(seriesCats)) seriesCats.forEach(c => { sMap[String(c.category_id)] = c.category_name; });
    if (Array.isArray(vods)) vods.slice(0, 20000).forEach((v, i) => {
      const ext = (v.container_extension || 'mp4').replace(/^\./, '');
      const cat = vMap[String(v.category_id)] || 'Filmes';
      out.push({
        uid: `${sourceId}:m${i}`, name: v.name || `Filme ${v.stream_id}`, logo: v.stream_icon || '',
        group: cat, category: normCat(cat), kind: 'movie',
        country: 'INT', countryName: 'Internacional', rating: v.rating ? Number(v.rating) : null,
        url: `${xt.base}movie/${encodeURIComponent(xt.user)}/${encodeURIComponent(xt.pass)}/${v.stream_id}.${ext}`,
        sourceId, featured: false,
      });
    });
    if (Array.isArray(series)) series.slice(0, 8000).forEach((s, i) => {
      const cat = sMap[String(s.category_id)] || 'Séries';
      out.push({
        uid: `${sourceId}:s${i}`, name: s.name || `Série ${s.series_id}`, logo: s.cover || '',
        group: cat, category: normCat(cat), kind: 'series',
        country: 'INT', countryName: 'Internacional', sid: String(s.series_id),
        url: null, sourceId, featured: false,
      });
    });
  } catch (e) { /* VOD opcional */ }
  return out;
}
async function getSeriesEpisodes(item) {
  const xt = state.xtBySource[item.sourceId];
  if (!xt || !item.sid) return [];
  const json = await fetchJsonSmart(xt.api('get_series_info&series_id=' + encodeURIComponent(item.sid)));
  const seasons = [];
  const mk = (arr, season) => (arr || []).map(e => {
    const num = e.episode_num != null ? e.episode_num : 0;
    const ext = (e.container_extension || 'mp4').replace(/^\./, '');
    return {
      name: e.title || `Episódio ${num}`, num,
      url: `${xt.base}series/${encodeURIComponent(xt.user)}/${encodeURIComponent(xt.pass)}/${item.sid}/${season}/${num}.${ext}`,
      logo: (e.info && e.info.movie_image) || item.logo || '',
    };
  });
  if (Array.isArray(json.seasons)) json.seasons.forEach(so => {
    const num = so.season_number != null ? so.season_number : 1;
    if (Array.isArray(so.episodes) && so.episodes.length) seasons.push({ number: num, episodes: mk(so.episodes, num) });
  });
  if (!seasons.length && json.episodes && typeof json.episodes === 'object') {
    Object.keys(json.episodes).forEach(k => {
      const num = parseInt(k, 10);
      if (!isNaN(num) && Array.isArray(json.episodes[k]) && json.episodes[k].length) {
        seasons.push({ number: num, episodes: mk(json.episodes[k], num) });
      }
    });
  }
  seasons.sort((a, b) => a.number - b.number);
  return seasons;
}

/* ---------- stream candidates (todos os formatos + proxys) ---------- */
function innerOf(playUrl) {
  try {
    const m = /proxy\?url=([^&]+)/.exec(playUrl) || /proxy\/m3u8\?url=([^&]+)/.exec(playUrl);
    if (m) return decodeURIComponent(m[1]);
  } catch (e) {}
  return playUrl;
}
function kindOf(url) {
  const l = url.toLowerCase().split('?')[0];
  if (l.includes('.m3u8') || /\.m3u$/.test(l)) return 'HLS'; // .m3u (ex.: swift) é playlist HLS atrás de redirect
  if (l.includes('.mpd')) return 'DASH';
  if (/\.(mp4|m4v|mov|webm|mkv|ogv|ogg)($|\?)/.test(l)) return 'NATIVE';
  if (/\.(ts|m2ts|mts|mp2t|flv)($|\?)/.test(l)) return 'MPEG-TS';
  if (/\.(mp3|aac)($|\?)/.test(l)) return 'AUDIO';
  return 'AUTO';
}
const NATIVE_HLS = (() => { try { const v = document.createElement('video'); return !!v.canPlayType && v.canPlayType('application/vnd.apple.mpegurl') !== ''; } catch (e) { return false; } })();
function buildCandidates(origUrl, urlAlt) {
  const variants = [];
  const push = (u, label) => { if (u && !variants.some(v => v.u === u)) variants.push({ u, label }); };
  push(origUrl, 'orig');
  if (urlAlt) push(urlAlt, 'alt');
  const low = (origUrl || '').toLowerCase();
  const noExt = !/\.(m3u8|mpd|mp4|ts|m2ts|mkv|webm|mov|flv|m4v|ogv)($|\?)/i.test(low);
  if (noExt) { push(origUrl + '.m3u8', '+m3u8'); push(origUrl + '.ts', '+ts'); }
  if (/\.ts(\?.*)?$/i.test(low)) push(origUrl.replace(/\.ts(\?.*)?$/i, '.m3u8$1'), 'ts→m3u8');
  if (low.includes('.m3u8')) push(origUrl.replace(/\.m3u8(\?.*)?$/i, '.ts$1'), 'm3u8→ts');
  // http<->https (conteúdo misto: a página é https, fontes http precisam de upgrade ou proxy)
  variants.slice().forEach(v => {
    if (v.u.startsWith('http://')) push('https://' + v.u.slice(7), 'https');
    if (v.u.startsWith('https://')) push('http://' + v.u.slice(8), 'http');
  });
  // 1) DIRETO da fonte: o vídeo vem do servidor original, sem passar por nós.
  //    O <video> nativo não precisa de CORS; hls/mpegts diretos precisam que a fonte envie CORS.
  const direct = [];
  variants.forEach(v => {
    const k = kindOf(v.u);
    const order = (k === 'HLS' && NATIVE_HLS) ? ['NATIVE', 'HLS']
      : k === 'HLS' ? ['HLS', 'NATIVE']
      : k === 'DASH' ? ['DASH', 'NATIVE']
      : k === 'MPEG-TS' ? ['MPEG-TS', 'NATIVE']
      : k === 'AUTO' ? ['AUTO', 'NATIVE'] : ['NATIVE'];
    order.forEach(kind => direct.push({ playUrl: v.u, kind, via: 'direct', proxy: 'DIRETO', note: v.label }));
  });
  // 2) PROXY só em último recurso (relay contínuo de vídeo não aguenta sessões longas em serverless)
  const prox = [];
  variants.forEach(v => {
    const k = kindOf(v.u);
    const kk = k === 'AUTO' ? 'AUTO' : k;
    if (kk === 'HLS' && state.hasLocalProxy) prox.push({ playUrl: localProxyM3u8(v.u), kind: 'HLS', via: 'proxy', proxy: 'PROXY local', note: v.label });
    if (state.hasLocalProxy) prox.push({ playUrl: localProxy(v.u), kind: kk, via: 'proxy', proxy: 'PROXY local', note: v.label });
    PUB_PROXIES.forEach((fn, i) => prox.push({ playUrl: fn(v.u), kind: kk, via: 'proxy', proxy: 'PROXY pub' + (i + 1), note: v.label }));
  });
  // Página https + fonte http: os motores JS (fetch/XHR) são bloqueados por conteúdo misto,
  // por isso o PROXY (https, relay funcional) tenta primeiro. Em página http ou fonte https, direto primeiro.
  const pageHttps = typeof location !== 'undefined' && location.protocol === 'https:';
  const httpSrc = /^http:\/\//i.test(origUrl || '');
  const ordered = (pageHttps && httpSrc) ? [...prox, ...direct] : [...direct, ...prox];
  return ordered.slice(0, 28);
}

/* ---------- player ---------- */
const player = { items: [], index: 0, cands: [], ci: 0, aid: 0, t0: 0, log: [], hls: null, dash: null, mpegts: null, timer: null, curKind: '', curProxy: '' };
function destroyEngine() {
  if (player.timer) { clearTimeout(player.timer); player.timer = null; }
  if (player.stallTimer) { clearTimeout(player.stallTimer); player.stallTimer = null; }
  const vv = $('videoPlayer');
  if (vv) {
    if (player._wl) { try { vv.removeEventListener('waiting', player._wl); } catch (e) {} player._wl = null; }
    if (player._pl) { try { vv.removeEventListener('playing', player._pl); } catch (e) {} player._pl = null; }
  }
  if (player.hls) { try { player.hls.destroy(); } catch (e) {} player.hls = null; }
  if (player.dash) { try { player.dash.reset(); } catch (e) {} player.dash = null; }
  if (player.mpegts) { try { player.mpegts.destroy(); } catch (e) {} player.mpegts = null; }
  const v = $('videoPlayer');
  v.removeAttribute('src'); try { v.load(); } catch (e) {}
}
function setLoading(on, txt) {
  $('loadingOverlay').classList.toggle('active', !!on);
  if (txt) $('loadingText').textContent = txt;
}
function updateAuthUI() {
  const member = isMember();
  const customs = (state.custom || []).length > 0;
  document.body.classList.toggle('locked', !member);
  document.body.classList.toggle('has-custom', !member && customs);
  // sem login e sem listas próprias: frase pública, sem contadores a zero
  const bare = !member && !customs;
  const hs = $('heroStats'); if (hs) hs.style.display = bare ? 'none' : '';
  const hi = $('heroInfoLine'); if (hi) hi.style.display = bare ? 'block' : 'none';
}
function openPlayer(items, index) {
  const ch = items[index];
  if (!isMember() && !(ch && isCustomSource(ch.sourceId))) { openLogin(); return; }
  player.items = items; player.index = index;
  $('playerModal').classList.add('active');
  document.body.style.overflow = $('playerModal').classList.contains('mini') ? '' : 'hidden';
  startChannel();
}
function closePlayer() {
  if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
  destroyEngine(); setLoading(false);
  $('playerModal').classList.remove('active', 'mini');
  document.body.style.overflow = '';
  notifyVideoState(false);
}
function notifyVideoState(playing) {
  try { if (window.NeoApp && NeoApp.onVideoState) NeoApp.onVideoState(!!playing); } catch (e) {}
}
function minimizePlayer() {
  if (!$('playerModal').classList.contains('active')) return;
  $('playerModal').classList.add('mini');
  document.body.style.overflow = '';
}
function expandPlayer() {
  $('playerModal').classList.remove('mini');
  document.body.style.overflow = 'hidden';
}
function currentChannel() { return player.items[player.index]; }
function startChannel() {
  const ch = currentChannel();
  if (!ch) return;
  $('playerChannelName').textContent = ch.name;
  $('playerCountry').textContent = `${COUNTRY_FLAGS[ch.country] || '🌍'} ${ch.countryName || ch.country}`;
  $('playerCategory').textContent = ch.category || 'General';
  player.cands = buildCandidates(ch.url, ch.urlAlt);
  player.ci = 0; player.log = []; player.stallTip = false;
  tryCandidate();
}
function videoErr(tag) {
  const v = $('videoPlayer');
  const e = v.error;
  return `${tag} (code=${e ? e.code : '?'}` + `${e && e.message ? ' ' + e.message : ''})`;
}
function fmtErr(a) {
  return a.map(x => {
    if (x == null) return '';
    if (typeof x === 'string') return x;
    try {
      if (typeof Error !== 'undefined' && x instanceof Error) return `${x.name}: ${x.message}`;
      const j = JSON.stringify(x);
      if (j && j !== '{}') return j.slice(0, 200);
    } catch (e) {}
    try { return String(x).slice(0, 200); } catch (e2) { return '?'; }
  }).join(' ').slice(0, 260);
}
function logAttempt(why) {
  const c = player.cands[player.ci];
  const entry = { n: player.ci + 1, kind: c ? c.kind : '?', via: c ? c.proxy : '?', note: c ? (c.note || '') : '', why, ms: Date.now() - (player.t0 || Date.now()) };
  player.log.push(entry);
  try { console.log('[neostreams]', JSON.stringify(entry)); } catch (e) {}
  const last = $('streamMeta');
  if (last) last.innerHTML = `tentativa <b>${entry.n}/${player.cands.length}</b> ✗ ${esc(String(why).slice(0, 90))}`;
}
async function runConnTest() {
  const box = $('connResults');
  const row = (name, ok, detail) => {
    const d = document.createElement('div');
    d.innerHTML = `${ok === null ? '⏳' : ok ? '✅' : '❌'} <b>${esc(name)}</b> — ${esc(detail)}`;
    box.appendChild(d);
    return d;
  };
  box.innerHTML = '';
  const t = async (name, fn) => {
    const r = row(name, null, 'a testar…');
    const t0 = Date.now();
    try {
      const detail = await fn();
      r.innerHTML = `✅ <b>${esc(name)}</b> — ${esc(detail)} (${Date.now() - t0}ms)`;
    } catch (e) {
      r.innerHTML = `❌ <b>${esc(name)}</b> — ${esc(e.message || String(e)).slice(0, 160)} (${Date.now() - t0}ms)`;
    }
  };
  const firstBytes = async (url, ms) => {
    const ctrl = new AbortController();
    const killer = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const rd = r.body.getReader();
      const { value } = await rd.read();
      try { await rd.cancel(); } catch (e) {}
      return `${r.status} ${r.headers.get('content-type') || ''} ${value ? value.length + 'B' : 'vazio'}`;
    } finally { clearTimeout(killer); }
  };
  await t('Site (ficheiros)', async () => {
    const r = await fetch('playlists/custom-pt.m3u');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return 'lista PT carrega';
  });
  await t('Proxy do site', async () => 'API ' + (await (await fetch('api/health')).json().then(j => j.ok ? 'OK' : 'falha')));
  await t('Stream via proxy', () => firstBytes(localProxy('http://neosfpoo.top:8080/4571764082049390/c38ry7k9fsa9/24984'), 20000));
  row('ℹ️', true, 'Se falhar aqui, há bloqueio no aparelho/rede — envia print no Telegram');
}
function copyDiag() {
  const ch = currentChannel() || {};
  let mse = false;
  try { mse = !!window.MediaSource; } catch (e) {}
  const diag = {
    canal: ch.name || '?', url: ch.url || '?',
    browser: (navigator.userAgent || '').slice(0, 140),
    mse, mpegts: !!(window.mpegts && mpegts.isSupported()), hls: !!(window.Hls && Hls.isSupported()),
    proxyLocal: state.hasLocalProxy, tentativas: player.log,
  };
  const txt = JSON.stringify(diag, null, 1);
  const done = () => toast('Diagnóstico copiado — cola no Telegram do suporte');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, () => prompt('Copia o diagnóstico:', txt));
  else prompt('Copia o diagnóstico:', txt);
}
function tryCandidate() {
  destroyEngine(); setLoading(true);
  const ch = currentChannel();
  if (player.ci >= player.cands.length) {
    setLoading(false);
    $('streamMeta').innerHTML = `fonte sem resposta após <b>${player.log.length} tentativas</b> — prime 📋 e envia no Suporte`;
    toast('Fonte sem resposta. Prime 📋 no player e envia o diagnóstico no Suporte.', true);
    return;
  }
  const aid = ++player.aid;
  if (player.ci === 0) player.t0 = Date.now();
  const c = player.cands[player.ci];
  player.curKind = c.kind; player.curProxy = c.proxy;
  $('streamMeta').innerHTML = `tentativa <b>${player.ci + 1}/${player.cands.length}</b> • <b>${esc(c.kind)}</b> • <b>${esc(c.proxy)}</b> • ${esc(c.note || '')}`;
  setLoading(true, `A ligar à fonte (${c.kind} • ${c.proxy})... tentativa ${player.ci + 1}/${player.cands.length}`);
  const v = $('videoPlayer');
  // diretas falham rápido (<8s); proxy envolve handshake+token e origens lentas — dá 20s
  const tmo = c.via === 'proxy' ? 20000 : 8000;
  player.timer = setTimeout(() => { if (aid === player.aid) { logAttempt(`timeout ${tmo / 1000}s`); nextCandidate(); } }, tmo);
  const ok = () => { if (aid !== player.aid) return; if (player.timer) { clearTimeout(player.timer); player.timer = null; } setLoading(false); v.play().catch(() => {}); notifyVideoState(true); };
  const fail = (why) => { if (aid !== player.aid) return; logAttempt(why); nextCandidate(); };
  // vigilância de stalls: mostra "a estabilizar" só se prender >2.5s; ao 3.º soluço sugere trocar de proxy
  let stalls = 0;
  player._wl = () => {
    if (aid !== player.aid) return;
    stalls++;
    if (player.stallTimer) clearTimeout(player.stallTimer);
    player.stallTimer = setTimeout(() => { if (aid === player.aid) setLoading(true, 'A estabilizar ligação…'); }, 2500);
    if (stalls === 3 && !player.stallTip) { player.stallTip = true; toast('Transmissão instável — experimenta ⇄ Trocar proxy'); }
  };
  player._pl = () => {
    if (aid !== player.aid) return;
    if (player.stallTimer) { clearTimeout(player.stallTimer); player.stallTimer = null; }
    setLoading(false);
  };
  v.addEventListener('waiting', player._wl);
  v.addEventListener('playing', player._pl);
  try {
    if (c.kind === 'HLS' && window.Hls && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, manifestLoadingTimeOut: 15000, levelLoadingTimeOut: 15000, fragLoadingTimeOut: 20000, manifestLoadingMaxRetry: 2, levelLoadingMaxRetry: 2, maxBufferLength: 60, backBufferLength: 30 });
      player.hls = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, ok);
      hls.on(Hls.Events.ERROR, (_, d) => { if (d && d.fatal) fail(`hls ${d.details || 'fatal'}${d.response && d.response.code ? ' http=' + d.response.code : ''}`); });
      hls.loadSource(c.playUrl); hls.attachMedia(v);
    } else if (c.kind === 'HLS' && v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = c.playUrl;
      v.addEventListener('loadedmetadata', ok, { once: true });
      v.addEventListener('error', () => fail(videoErr('native-hls')), { once: true });
    } else if (c.kind === 'DASH') {
      const goNative = () => { if (aid !== player.aid) return; v.src = c.playUrl; v.addEventListener('canplay', ok, { once: true }); v.addEventListener('error', () => fail(videoErr('dash-native')), { once: true }); };
      if (window.dashjs) {
        try {
          const dp = dashjs.MediaPlayer().create();
          player.dash = dp; dp.initialize(v, c.playUrl, true);
          dp.on(dashjs.MediaPlayer.events.STREAM_INITIALIZED, ok);
          dp.on(dashjs.MediaPlayer.events.ERROR, (e) => fail('dash ' + String((e && e.error) || '').slice(0, 80)));
        } catch (e) { goNative(); }
      } else {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/dashjs@4.7.4/dist/dash.all.min.js';
        s.onload = () => tryCandidate();
        s.onerror = goNative;
        document.head.appendChild(s);
        clearTimeout(player.timer); setLoading(true, 'A carregar motor DASH...');
        return;
      }
    } else if ((c.kind === 'MPEG-TS' || (c.kind === 'AUTO' && window.mpegts && mpegts.isSupported())) && window.mpegts && mpegts.isSupported()) {
      try {
        const mp = mpegts.createPlayer({ type: 'mpegts', isLive: true, url: c.playUrl }, {
          enableWorker: false,            // transmux na thread principal (menos uma peça móvel)
          enableStashBuffer: true,
          stashInitialSize: 768 * 1024,   // colchão inicial ~1MB antes de debitar
          liveBufferLatencyChasing: false, // NÃO saltar em frente a cada soluço — fluidez > latência
          lazyLoad: true, lazyLoadMaxDuration: 120, lazyLoadRecoverDuration: 15,
          autoCleanupMaxBackwardDuration: 60, autoCleanupMinBackwardDuration: 30,
          fixAudioTimestampGap: true,
        });
        player.mpegts = mp;
        mp.on(mpegts.Events.MEDIA_INFO, ok);
        mp.on(mpegts.Events.ERROR, (...a) => fail('mpegts ' + fmtErr(a)));
        mp.attachMediaElement(v); mp.load(); mp.play().catch(() => {});
        v.addEventListener('playing', ok, { once: true });
      } catch (e) { fail('mpegts-init ' + String(e.message || e).slice(0, 80)); }
    } else {
      v.src = c.playUrl;
      v.addEventListener('canplay', ok, { once: true });
      v.addEventListener('error', () => fail(videoErr('native')), { once: true });
      v.play().catch(() => {});
    }
  } catch (e) { fail('init ' + String(e.message || e).slice(0, 80)); }
}
function nextCandidate() {
  if (player.timer) { clearTimeout(player.timer); player.timer = null; }
  player.ci++;
  tryCandidate();
}

/* ---------- load sources ---------- */
function allSources() { return [...state.builtin, ...state.custom]; }
function healthDetail(e) {
  const m = String((e && e.message) || e || '');
  if (/HTTP 403/.test(m)) return 'HTTP 403 — o painel bloqueia este servidor (funciona em rede residencial/app local)';
  if (/HTTP 404/.test(m)) return 'HTTP 404 — lista não encontrada na origem';
  if (/HTTP 401/.test(m)) return 'HTTP 401 — credenciais inválidas/expiradas';
  if (/abort|timeout/i.test(m) || (e && e.name === 'AbortError')) return 'timeout de rede — origem lenta ou offline';
  return m.slice(0, 120) || 'falha de rede';
}
async function loadBuiltin() {
  // membros: definições completas (com URLs) via API; resto: pré-visualização pública sem URLs
  const s = getSession();
  if (s) {
    try {
      const r = await fetch('api/playlists', { headers: { Authorization: 'Bearer ' + s.token } });
      if (r.ok) { const j = await r.json(); if (Array.isArray(j)) return j; }
    } catch (e) {}
  }
  try { return await (await fetch('playlists/playlists.json')).json(); }
  catch (e) { return []; }
}
function renderLanding() {
  updateAuthUI();
}
async function boot() {
  await detectLocalProxy();
  try { state.custom = JSON.parse(localStorage.getItem(LS_CUSTOM) || '[]'); } catch (e) { state.custom = []; }
  renderLanding();
  bindUI();
  updateAuthUI();
  if (!isMember()) {
    // público: só listas próprias (sem login)
    renderSourcesBar();
    renderAll();
    for (const s of state.custom) {
      loadSourceById(s.id, false).then(() => renderAll()).catch(() => {});
      await sleep(300);
    }
    return;
  }
  await startApp();
}
async function openLogin() { $('loginModal').classList.add('active'); setTimeout(() => $('loginUser').focus(), 50); }
function closeLogin() { $('loginModal').classList.remove('active'); const e = $('loginErr'); if (e) e.style.display = 'none'; }
async function doLogin() {
  const u = $('loginUser').value.trim();
  const p = $('loginPass').value;
  const err = $('loginErr');
  const btn = $('loginGo');
  err.style.display = 'none';
  if (!u || !p) { err.textContent = 'Indica utilizador e password.'; err.style.display = 'block'; return; }
  btn.disabled = true; btn.textContent = 'A entrar…';
  try {
    let j = null;
    try {
      const r = await fetch('api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: u, pass: p }) });
      if (r.ok) j = await r.json().catch(() => null);
      else if (r.status === 401 || r.status === 403) {
        const ej = await r.json().catch(() => ({}));
        throw new Error((ej && ej.error) || 'Credenciais inválidas');
      }
    } catch (netErr) {
      if (netErr && netErr.message === 'Credenciais inválidas') throw netErr;
    }
    if (!j || !j.token) {
      // Fallback estático (GitHub Pages)
      if ((u === 'admin' || u === 'ptlegion') && (p === 'neostreams' || p === 'admin123')) {
        j = { token: 'static-member-token', exp: Date.now() + 30 * 86400 * 1000, user: u };
      } else {
        throw new Error('Falha no login');
      }
    }
    try { localStorage.setItem(LS_AUTH, JSON.stringify({ token: j.token, exp: j.exp, user: j.user })); } catch (e) {}
    closeLogin();
    document.body.classList.remove('locked');
    if (j.expires) {
      try { toast(`Bem-vindo! Acesso de convidado até ${new Date(j.expires).toLocaleDateString('pt-PT')}`); }
      catch (e) { toast(`Bem-vindo, ${j.user}!`); }
    } else toast(`Bem-vindo, ${j.user}!`);
    await startApp();
  } catch (e) {
    err.textContent = e.message || 'Falha no login';
    err.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'Entrar';
  }
}
function doLogout() {
  try { localStorage.removeItem(LS_AUTH); } catch (e) {}
  location.reload();
}
function requestAccess(e) {
  if (e) e.preventDefault();
  closeLogin();
  const s = $('supportSection');
  if (s) s.scrollIntoView({ behavior: 'smooth' });
  const card = $('supportMainCard');
  if (card) { card.classList.remove('flash'); setTimeout(() => card.classList.add('flash'), 400); setTimeout(() => card.classList.remove('flash'), 3000); }
  toast('Para o acesso grátis de 30 dias, entra em contacto no Suporte 👇');
}
async function startApp() {
  let builtin = await loadBuiltin();
  state.builtin = Array.isArray(builtin) ? builtin : [];
  try { state.custom = JSON.parse(localStorage.getItem(LS_CUSTOM) || '[]'); } catch (e) { state.custom = []; }
  renderSourcesBar();
  // 1) PT featured primeiro (rápido)
  await loadSourceById('neo-sports-pt', true);
  renderAll();
  // 2) resto em background
  for (const s of allSources()) {
    if (s.id === 'neo-sports-pt' || s.id === 'iptv-org' || s.type === 'iptv-org') continue;
    loadSourceById(s.id, false).then(() => renderAll()).catch(() => {});
    await sleep(300);
  }
  // 3) iptv-org só se o user pedir? carrega leve em background mas desligável
  const org = allSources().find(s => s.type === 'iptv-org');
  if (org) loadIptvOrg().then(() => renderAll()).catch(() => {});
}
async function loadSourceById(id, showToast) {
  const src = allSources().find(s => s.id === id);
  if (!src || !src.url || state.bySource[id]) return state.bySource[id] || [];
  if (src.type === 'iptv-org') return [];
  state.bySource[id] = []; // marca em carregamento (evita duplicar)
  const xt = parseXtreamUrl(src.url);
  const commit = (arr, label) => {
    if (!arr || !arr.length) return;
    state.bySource[id] = dedupe([...(state.bySource[id] || []), ...arr]);
    state.channels = dedupe([...state.channels, ...arr]);
    if (label) {
      if (!state._announced) state._announced = {};
      if (!state._announced[id + label]) {
        state._announced[id + label] = true;
        toast(`${src.name}: ${label}`);
      }
    }
    refreshFacets(); renderSourcesBar(); renderAll();
  };
  const jobs = [];
  // 1) API Xtream em paralelo (rápida: filmes/séries aparecem primeiro)
  if (xt && !src.url.includes('../') && !src.url.startsWith('playlists/') && !src.url.startsWith('api/')) {
    jobs.push(loadXtreamApi(xt, src.id)
      .then(arr => commit(arr, arr.some(c => c.kind && c.kind !== 'live') ? `${arr.length} itens (incl. filmes/séries)` : `${arr.length} canais`))
      .catch(() => {}));
  }
  // 2) M3U (grande, mais lento)
  jobs.push((async () => {
    try {
      if (showToast) toast(`A carregar ${src.name}...`);
      let txt;
      if (src.url.startsWith('api/')) {
        // fonte interna: Bearer token, sem proxy
        const r = await fetch(src.url, { headers: authHeaders() });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        txt = await r.text();
      } else {
        txt = await fetchTextSmart(src.url, (b) => {
          const mb = (b / 1048576).toFixed(1);
          if (showToast) toast(`${src.name} — ${mb} MB...`);
        }, 120000);
      }
      // parse em blocos p/ não bloquear com listas grandes
      let m3uChannels = await parseLarge(txt, src.id, !!src.featured);
      if (m3uChannels.length > 150000) {
        m3uChannels = m3uChannels.slice(0, 150000);
        toast(`${src.name}: limitada a 150k canais (lista gigante)`, false);
      }
      if (showToast) toast(`${src.name}: ${m3uChannels.length} canais`);
      state.health[src.id] = { ok: m3uChannels.length > 0, detail: m3uChannels.length ? `${m3uChannels.length} canais online` : 'lista vazia na origem' };
      commit(m3uChannels);
    } catch (e) {
      state.health[src.id] = { ok: false, detail: healthDetail(e) };
      if (showToast) toast(`Falha ${src.name}: ${state.health[src.id].detail}`, true);
      renderSourcesBar();
    }
  })());
  await Promise.all(jobs);
  return state.bySource[id] || [];
}
function parseLarge(text, sourceId, featured) {
  return new Promise((resolve) => {
    // chunked p/ UI não congelar
    const lines = text.split(/\r?\n/);
    const out = []; let ext = null; let n = 0; let i = 0;
    const CH = 20000;
    function step() {
      const end = Math.min(i + CH, lines.length);
      for (; i < end; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        if (line.startsWith('#EXTINF')) ext = parseExtInf(line);
        else if (!line.startsWith('#')) {
          if (ext && /^https?:\/\//i.test(line)) {
            const country = inferCountry(ext.name, ext.group, ext.id);
            out.push({ uid: `${sourceId}:${n++}`, name: ext.name || `Canal ${n}`, logo: ext.logo || '', group: ext.group || '', category: normCat(ext.group), kind: classifyKind(ext.group, ext.name), country, countryName: COUNTRY_NAMES[country] || (country === 'INT' ? 'Internacional' : country), url: line, sourceId, featured: !!featured });
          }
          ext = null;
        }
      }
      if (i < lines.length) setTimeout(step, 0);
      else resolve(out);
    }
    step();
  });
}
function dedupe(arr) {
  const seen = new Set(); const out = [];
  for (const c of arr) { const k = (c.url || '') + '|' + (c.name || ''); if (!seen.has(k)) { seen.add(k); out.push(c); } }
  // featured primeiro
  out.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
  return out;
}
async function loadIptvOrg() {
  const base = 'https://iptv-org.github.io/api/';
  const [channels, streams, countries, categories] = await Promise.all([
    fetchJsonSmart(base + 'channels.json').catch(() => []),
    fetchJsonSmart(base + 'streams.json').catch(() => []),
    fetchJsonSmart(base + 'countries.json').catch(() => []),
    fetchJsonSmart(base + 'categories.json').catch(() => []),
  ]);
  const streamMap = new Map();
  streams.forEach(s => { if (!streamMap.has(s.channel)) streamMap.set(s.channel, []); streamMap.get(s.channel).push(s); });
  const cMap = {}; countries.forEach(c => { cMap[c.code] = c.name; });
  const list = [];
  channels.forEach((ch, i) => {
    const ss = streamMap.get(ch.id);
    if (!ss || !ss.length || ch.is_nsfw) return;
    const code = ch.country || 'INT';
    list.push({
      uid: `iptv-org:${i}`, name: ch.name, logo: ch.logo || '',
      group: (ch.categories && ch.categories[0]) || 'General', category: normCat((ch.categories && ch.categories[0]) || 'General'),
      country: COUNTRY_FLAGS[code] ? code : 'INT', countryName: cMap[code] || code,
      url: ss[0].url, urlAlt: ss[1] ? ss[1].url : null, sourceId: 'iptv-org', featured: false,
    });
  });
  state.bySource['iptv-org'] = list;
  state.channels = dedupe([...state.channels, ...list]);
  state.health['iptv-org'] = { ok: list.length > 0, detail: list.length ? `${list.length} canais online` : 'falha a carregar' };
  refreshFacets(); renderSourcesBar();
}

/* ---------- facets + render ---------- */
function activeKind() {
  // normaliza tab ('movies') -> kind guardado ('movie')
  return state.contentType === 'movies' ? 'movie' : (state.contentType || 'live');
}
function scopedList() {
  const kind = activeKind();
  const byKind = state.channels.filter(c => (c.kind || 'live') === kind);
  if (state.activeSource === 'all') return byKind;
  return byKind.filter(c => c.sourceId === state.activeSource);
}
function resetFilters() {
  state.activeCategory = 'all'; state.activeCountry = 'all';
  state.query = ''; state.showFavs = false;
  const si = $('searchInput'); if (si) si.value = '';
  document.querySelectorAll('.nav-link').forEach(x => x.classList.remove('active'));
  const home = document.querySelector('.nav-link[data-section="home"]'); if (home) home.classList.add('active');
}
function refreshFacets() {
  // contagens limitadas à fonte ativa — evita mostrar países/categorias de outras fontes
  const base = scopedList();
  const catCount = {}; const ctryCount = {}; const ctryName = {};
  base.forEach(c => {
    catCount[c.category] = (catCount[c.category] || 0) + 1;
    ctryCount[c.country] = (ctryCount[c.country] || 0) + 1;
    ctryName[c.country] = c.countryName;
  });
  state.categories = Object.entries(catCount).sort((a, b) => b[1] - a[1]);
  state.countries = Object.entries(ctryCount).map(([code, count]) => ({ code, count, name: ctryName[code] || code })).sort((a, b) => b.count - a.count);
  state.scopedCount = base.length;
}
function filtered() {
  const kind = activeKind();
  let list = state.channels.filter(c => (c.kind || 'live') === kind);
  // sem sessão: só listas próprias do utilizador (conteúdo de membros escondido)
  if (!isMember()) list = list.filter(c => isCustomSource(c.sourceId));
  if (state.activeSource !== 'all') list = list.filter(c => c.sourceId === state.activeSource);
  if (state.showFavs) list = list.filter(c => state.favs.has(c.uid));
  if (state.activeCategory !== 'all') list = list.filter(c => c.category === state.activeCategory);
  if (state.activeCountry !== 'all') list = list.filter(c => c.country === state.activeCountry);
  if (state.query) {
    const q = state.query.toLowerCase();
    list = list.filter(c => c.name.toLowerCase().includes(q));
  }
  return list;
}
function renderSourcesBar() {
  const bar = $('sourcesBar');
  const member = isMember();
  const all = member ? allSources() : state.custom;
  const total = member ? state.channels.length : state.channels.filter(c => isCustomSource(c.sourceId)).length;
  let html = `<button class="src ${state.activeSource === 'all' ? 'active' : ''}" data-src="all"><span class="dot ${total ? 'ok' : ''}"></span>Todas <span class="count">${total}</span></button>`;
  html += all.map(s => {
    const n = (state.bySource[s.id] || []).length;
    const h = (state.health || {})[s.id];
    const dot = h ? (h.ok ? 'ok' : 'bad') : (n ? 'ok' : '');
    const title = h ? h.detail : (n ? `${n} canais` : 'a carregar…');
    return `<button class="src ${state.activeSource === s.id ? 'active' : ''}" data-src="${esc(s.id)}" title="${esc(title)}"><span class="dot ${dot}"></span>${esc(s.name)} <span class="count">${n}</span></button>`;
  }).join('');
  html += `<button class="src" id="addSrcTop">+ Lista</button>`;
  bar.innerHTML = html;
  bar.querySelectorAll('[data-src]').forEach(b => b.addEventListener('click', () => {
    state.activeSource = b.dataset.src; state.page = 0;
    // mudar de fonte limpa categoria/país/pesquisa (eram da fonte anterior)
    state.activeCategory = 'all'; state.activeCountry = 'all'; state.query = '';
    const si = $('searchInput'); if (si) si.value = '';
    if (!state.bySource[state.activeSource] && state.activeSource !== 'all') loadSourceById(state.activeSource, true).then(() => renderAll());
    renderAll();
  }));
  const add = $('addSrcTop');
  if (add) add.addEventListener('click', openSources);
}
function renderAll() {
  updateAuthUI();
  refreshFacets();
  // stats (visíveis conforme updateAuthUI)
  $('totalChannels').textContent = state.channels.length.toLocaleString('pt-PT');
  $('totalCountries').textContent = new Set(state.channels.map(c => c.country)).size;
  $('totalCategories').textContent = new Set(state.channels.map(c => c.category)).size;
  // contadores das tabs por tipo
  const nLive = state.channels.filter(c => (c.kind || 'live') === 'live').length;
  const nMov = state.channels.filter(c => c.kind === 'movie').length;
  const nSer = state.channels.filter(c => c.kind === 'series').length;
  const setC = (id, n) => { const e = $(id); if (e) e.textContent = n ? n.toLocaleString('pt-PT') : ''; };
  setC('cntLive', nLive); setC('cntMovies', nMov); setC('cntSeries', nSer);
  document.querySelectorAll('#typeTabs [data-type]').forEach(b => b.classList.toggle('active', b.dataset.type === state.contentType));
  renderCategories(); renderCountries(); renderChannels(true);
  renderSourcesBar();
}
function renderCategories() {
  const el = $('categoriesContainer');
  const top = state.categories.slice(0, 20);
  el.innerHTML = `<button class="category-btn ${state.activeCategory === 'all' ? 'active' : ''}" data-cat="all">📺 Todas <span class="count">${state.scopedCount || 0}</span></button>` +
    top.map(([c, n]) => `<button class="category-btn ${state.activeCategory === c ? 'active' : ''}" data-cat="${esc(c)}">${CAT_ICONS[c.toLowerCase()] || '📺'} ${esc(c)} <span class="count">${n}</span></button>`).join('');
  el.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => {
    state.activeCategory = b.dataset.cat;
    state.activeCountry = 'all'; state.query = ''; state.showFavs = false;
    const si = $('searchInput'); if (si) si.value = '';
    state.page = 0; renderAll();
  }));
}
function renderCountries() {
  const q = ($('countrySearchInput').value || '').toLowerCase().trim();
  let list = state.countries;
  if (q) list = list.filter(c => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q));
  const el = $('countriesContainer');
  el.innerHTML = list.slice(0, 24).map(c => `<button class="country-btn ${state.activeCountry === c.code ? 'active' : ''}" data-cc="${c.code}"><span class="country-flag">${COUNTRY_FLAGS[c.code] || '🌍'}</span><span class="country-name">${esc(c.name)}</span><span class="country-count">${c.count}</span></button>`).join('') || '<p style="color:var(--muted)">Sem países.</p>';
  el.querySelectorAll('[data-cc]').forEach(b => b.addEventListener('click', () => {
    state.activeCountry = state.activeCountry === b.dataset.cc ? 'all' : b.dataset.cc;
    state.activeCategory = 'all'; state.query = ''; state.showFavs = false;
    const si = $('searchInput'); if (si) si.value = '';
    state.page = 0; renderAll();
  }));
}
function cardHtml(c, i) {
  const initials = esc((c.name || '?').slice(0, 2).toUpperCase());
  const fav = state.favs.has(c.uid) ? 'on' : '';
  return `<div class="channel-card" data-i="${i}" tabindex="0">${c.featured ? '<span class="badge-featured">DESTAQUE PT</span>' : ''}
    <button class="fav-btn ${fav}" data-fav="${esc(c.uid)}">★</button>
    <div class="channel-thumbnail">
      ${c.logo ? `<img class="channel-logo-img" src="${esc(c.logo)}" alt="${esc(c.name)}" loading="lazy" onerror="this.remove()">` : ''}
      <div class="channel-logo">${initials}</div>
      <div class="play-overlay"><div class="play-icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></div></div>
    </div>
    <div class="channel-content"><h3 class="channel-name">${esc(c.name)}</h3>
      <div class="channel-tags"><span class="channel-tag country">${COUNTRY_FLAGS[c.country] || '🌍'} ${esc(c.countryName || c.country)}</span><span class="channel-tag">${esc(c.category)}</span></div>
    </div></div>`;
}
function renderChannels(reset) {
  const el = $('channelsContainer');
  state.displayed = filtered();
  const typeName = state.contentType === 'movies' ? 'Filmes' : state.contentType === 'series' ? 'Séries' : '';
  const parts = [];
  if (typeName) parts.push(typeName);
  if (state.showFavs) parts.push('Favoritos');
  if (state.activeCategory !== 'all') parts.push(state.activeCategory);
  if (state.activeCountry !== 'all') {
    const cc = state.countries.find(c => c.code === state.activeCountry);
    parts.push(cc ? cc.name : state.activeCountry);
  }
  if (state.query) parts.push(`“${state.query}”`);
  $('channelsTitle').textContent = (parts.length ? parts.join(' • ') : 'Todos os canais') + ` (${state.displayed.length})`;
  if (reset) { state.page = 0; el.innerHTML = ''; }
  const slice = state.displayed.slice(0, (state.page + 1) * state.pageSize);
  if (!slice.length) {
    const active = [];
    if (state.activeSource !== 'all') { const s = allSources().find(x => x.id === state.activeSource); active.push('fonte: ' + (s ? s.name : state.activeSource)); }
    if (state.activeCategory !== 'all') active.push('categoria: ' + state.activeCategory);
    if (state.activeCountry !== 'all') active.push('país: ' + state.activeCountry);
    if (state.showFavs) active.push('só favoritos');
    if (state.query) active.push('pesquisa: “' + state.query + '”');
    const emptyName = state.contentType === 'movies' ? 'Sem filmes' : state.contentType === 'series' ? 'Sem séries' : 'Sem canais';
    el.innerHTML = `<div class="no-results"><h3>${emptyName}</h3><p>${active.length ? 'Filtros ativos — ' + esc(active.join(' · ')) : 'Nenhuma lista carregada ainda.'}</p><button class="load-more-btn" id="clearFilters">Limpar filtros</button></div>`;
    $('loadMoreBtn').style.display = 'none';
    const cf = $('clearFilters');
    if (cf) cf.addEventListener('click', () => { state.activeSource = 'all'; resetFilters(); renderAll(); });
    return;
  }
  el.innerHTML = slice.map(cardHtml).join('');
  $('loadMoreBtn').style.display = slice.length < state.displayed.length ? 'block' : 'none';
  el.querySelectorAll('[data-fav]').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = b.dataset.fav;
    if (state.favs.has(id)) state.favs.delete(id); else state.favs.add(id);
    localStorage.setItem(LS_FAV, JSON.stringify([...state.favs]));
    renderChannels(false);
  }));
  el.querySelectorAll('.channel-card').forEach(card => card.addEventListener('click', (e) => {
    if (e.target.closest('[data-fav]')) return;
    const idx = parseInt(card.dataset.i, 10);
    const ch = state.displayed[idx];
    if (!ch) return;
    // série Xtream (sem URL direta) -> painel de temporadas/episódios
    if (ch.kind === 'series' && !ch.url && ch.sid) { openSeries(ch); return; }
    const pos = state.displayed.indexOf(ch);
    openPlayer(state.displayed, pos >= 0 ? pos : idx);
  }));
}

/* ---------- séries: temporadas -> episódios ---------- */
async function openSeries(item) {
  const sheet = $('seriesModal');
  if (!sheet) { if (item.url) openPlayer([item], 0); return; }
  $('seriesTitle').textContent = item.name || 'Série';
  $('seriesSeasons').innerHTML = '';
  $('seriesEps').innerHTML = '<p style="color:var(--muted)">⏳ A carregar episódios…</p>';
  sheet.classList.add('active');
  try {
    const seasons = await getSeriesEpisodes(item);
    if (!seasons.length) { $('seriesEps').innerHTML = '<p style="color:var(--muted)">Sem episódios disponíveis.</p>'; return; }
    const renderSeason = (si) => {
      const se = seasons[si];
      $('seriesSeasons').innerHTML = seasons.map((s2, i) =>
        `<button class="category-btn${i === si ? ' active' : ''}" data-se="${i}">T${s2.number} (${s2.episodes.length})</button>`).join('');
      $('seriesSeasons').querySelectorAll('[data-se]').forEach(b => b.addEventListener('click', () => renderSeason(parseInt(b.dataset.se, 10))));
      $('seriesEps').innerHTML = se.episodes.map((e, i) =>
        `<div class="series-ep" data-ep="${i}" tabindex="0"><span class="ep-num">${e.num}</span><span style="flex:1">${esc(e.name)}</span><span>▶</span></div>`).join('');
      $('seriesEps').querySelectorAll('[data-ep]').forEach(el => el.addEventListener('click', () => {
        const i = parseInt(el.dataset.ep, 10);
        sheet.classList.remove('active');
        const items = se.episodes.map(x => ({ name: `${item.name} — ${x.name}`, url: x.url, logo: x.logo || item.logo, type: 'vod' }));
        openPlayer(items, i);
      }));
    };
    renderSeason(0);
  } catch (e) {
    $('seriesEps').innerHTML = `<p style="color:var(--muted)">Falha a carregar: ${esc(e.message || 'erro')}</p>`;
  }
}

/* ---------- modals / filtros ---------- */
function openSources() {
  $('sourcesModal').classList.add('active');
  const el = $('sourcesList');
  const vis = isMember() ? allSources() : state.custom;
  el.innerHTML = vis.length ? vis.map(s => `<div style="display:flex;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)"><div style="flex:1"><b>${esc(s.name)}</b><div style="font-size:11px;color:var(--muted)">${esc(s.url || '')}</div></div><button class="action-btn" data-rm="${esc(s.id)}">Remover</button></div>`).join('')
    : '<p style="color:var(--muted)">Sem listas. Adiciona a tua em baixo.</p>';
  el.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => {
    state.custom = state.custom.filter(x => x.id !== b.dataset.rm);
    state.builtin = state.builtin.filter(x => x.id !== b.dataset.rm);
    delete state.bySource[b.dataset.rm];
    state.channels = state.channels.filter(c => c.sourceId !== b.dataset.rm);
    localStorage.setItem(LS_CUSTOM, JSON.stringify(state.custom));
    openSources(); renderAll();
  }));
}

/* ---------- events ---------- */
function bindUI() {
  let t = null;
  $('searchInput').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { state.query = e.target.value.trim(); state.page = 0; renderChannels(true); }, 250); });
  $('countrySearchInput').addEventListener('input', () => renderCountries());
  $('loadMoreBtn').addEventListener('click', () => { state.page++; renderChannels(false); });
  $('gridViewBtn').addEventListener('click', () => { $('channelsContainer').classList.remove('list-view'); $('gridViewBtn').classList.add('active'); $('listViewBtn').classList.remove('active'); });
  $('listViewBtn').addEventListener('click', () => { $('channelsContainer').classList.add('list-view'); $('listViewBtn').classList.add('active'); $('gridViewBtn').classList.remove('active'); });
  $('closePlayer').addEventListener('click', closePlayer);
  $('miniBtn').addEventListener('click', minimizePlayer);
  $('expandBtn').addEventListener('click', expandPlayer);
  // bridge p/ app Android (PiP nativo ao minimizar)
  try {
    const vv = $('videoPlayer');
    vv.addEventListener('playing', () => notifyVideoState(true));
    vv.addEventListener('pause', () => notifyVideoState(false));
  } catch (e) {}
  $('retryBtn').addEventListener('click', () => { player.ci = 0; player.log = []; tryCandidate(); });
  $('proxyBtn').addEventListener('click', () => nextCandidate('manual'));
  $('diagBtn').addEventListener('click', copyDiag);
  const ctb = $('connTestBtn'); if (ctb) ctb.addEventListener('click', runConnTest);
  $('prevBtn').addEventListener('click', () => { if (player.items.length > 1) { player.index = (player.index - 1 + player.items.length) % player.items.length; startChannel(); } });
  $('nextBtn').addEventListener('click', () => { if (player.items.length > 1) { player.index = (player.index + 1) % player.items.length; startChannel(); } });
  $('fullscreenBtn').addEventListener('click', () => {
    const m = $('playerModal');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (m.requestFullscreen) m.requestFullscreen().catch(() => {});
  });
  $('pipBtn').addEventListener('click', async () => {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await $('videoPlayer').requestPictureInPicture();
    } catch (e) { toast('PiP indisponível', true); }
  });
  $('playerModal').addEventListener('click', (e) => { if (e.target.id === 'playerModal') closePlayer(); });
  document.addEventListener('keydown', (e) => {
    if ($('loginModal').classList.contains('active') && e.key === 'Escape') { closeLogin(); return; }
    if (!$('playerModal').classList.contains('active')) return;
    if (e.key === 'Escape') closePlayer();
    if (e.key === 'ArrowRight') $('nextBtn').click();
    if (e.key === 'ArrowLeft') $('prevBtn').click();
  });
  document.querySelectorAll('.nav-link').forEach(a => a.addEventListener('click', (e) => {
    e.preventDefault();
    if (a.id === 'navAddList') { openSources(); return; }
    document.querySelectorAll('.nav-link').forEach(x => x.classList.remove('active'));
    a.classList.add('active');
    const s = a.dataset.section;
    state.showFavs = s === 'favorites';
    if (s === 'home' || s === 'favorites') { state.activeCategory = 'all'; state.activeCountry = 'all'; state.query = ''; const si = $('searchInput'); if (si) si.value = ''; }
    if (s === 'home') { state.showFavs = false; window.scrollTo({ top: 0, behavior: 'smooth' }); }
    if (s === 'categories') $('categoriesSection').scrollIntoView({ behavior: 'smooth' });
    if (s === 'countries') $('countriesSection').scrollIntoView({ behavior: 'smooth' });
    if (s === 'favorites') $('channelsContainer').scrollIntoView({ behavior: 'smooth' });
    if (s === 'support') $('supportSection').scrollIntoView({ behavior: 'smooth' });
    state.page = 0; renderAll();
  }));
  $('startBtn').addEventListener('click', () => $('channelsContainer').scrollIntoView({ behavior: 'smooth' }));
  $('browseBtn').addEventListener('click', () => $('categoriesSection').scrollIntoView({ behavior: 'smooth' }));
  $('logoHome').addEventListener('click', (e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  document.querySelectorAll('[data-filter-cat]').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); state.activeCategory = a.dataset.filterCat; state.activeCountry = 'all'; state.query = ''; const si = $('searchInput'); if (si) si.value = ''; state.page = 0; renderAll(); $('channelsContainer').scrollIntoView({ behavior: 'smooth' }); }));
  $('manageSources').addEventListener('click', (e) => { e.preventDefault(); openSources(); });
  $('closeSources').addEventListener('click', () => $('sourcesModal').classList.remove('active'));
  $('sourcesModal').addEventListener('click', (e) => { if (e.target.id === 'sourcesModal') $('sourcesModal').classList.remove('active'); });
  $('addSrcBtn').addEventListener('click', async () => {
    const url = $('newSrcUrl').value.trim(); const name = $('newSrcName').value.trim() || url;
    if (!url || !/^https?:\/\//i.test(url)) { toast('URL inválida', true); return; }
    const src = { id: 'c' + Date.now(), name, type: 'xtream-m3u', url };
    const xt = parseXtreamUrl(url);
    if (xt) src.xtream = { base: xt.base, username: xt.user, password: xt.pass };
    state.custom.push(src);
    try { localStorage.setItem(LS_CUSTOM, JSON.stringify(state.custom)); } catch (e) {}
    $('sourcesModal').classList.remove('active');
    renderSourcesBar();
    await loadSourceById(src.id, true); renderAll();
  });
  // tabs AO VIVO / FILMES / SÉRIES
  document.querySelectorAll('#typeTabs [data-type]').forEach(b => b.addEventListener('click', () => {
    state.contentType = b.dataset.type;
    state.activeCategory = 'all'; state.activeCountry = 'all'; state.query = ''; state.showFavs = false;
    const si = $('searchInput'); if (si) si.value = '';
    // se a fonte ativa não tem este tipo (ex.: PT só tem direto), volta a "todas"
    if (state.activeSource !== 'all') {
      const hasKind = (state.bySource[state.activeSource] || []).some(c => (c.kind || 'live') === activeKind());
      if (!hasKind) state.activeSource = 'all';
    }
    state.page = 0; renderAll();
    $('channelsContainer').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  // séries modal
  $('closeSeries').addEventListener('click', () => $('seriesModal').classList.remove('active'));
  $('seriesModal').addEventListener('click', (e) => { if (e.target.id === 'seriesModal') $('seriesModal').classList.remove('active'); });
  // termos e condições
  $('termsLink').addEventListener('click', (e) => { e.preventDefault(); $('termsModal').classList.add('active'); });
  $('closeTerms').addEventListener('click', () => $('termsModal').classList.remove('active'));
  $('termsModal').addEventListener('click', (e) => { if (e.target.id === 'termsModal') $('termsModal').classList.remove('active'); });
  const tsup = $('termsSupport');
  if (tsup) tsup.addEventListener('click', (e) => { e.preventDefault(); $('termsModal').classList.remove('active'); const s = $('supportSection'); if (s) s.scrollIntoView({ behavior: 'smooth' }); });
  // navegação comando TV (D-pad): Enter ativa o cartão/episódio focado
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== 'NumpadEnter' && e.key !== ' ') return;
    if ($('playerModal').classList.contains('active')) return;
    const a = document.activeElement;
    if (a && (a.classList.contains('channel-card') || a.classList.contains('series-ep'))) {
      e.preventDefault();
      a.click();
    }
  });
  // login / logout
  $('loginBtn').addEventListener('click', openLogin);
  $('lockedLoginBtn').addEventListener('click', openLogin);
  const mlb = $('memberLoginBtn'); if (mlb) mlb.addEventListener('click', openLogin);
  const lab = $('lockedAddBtn'); if (lab) lab.addEventListener('click', openSources);
  $('logoutBtn').addEventListener('click', doLogout);
  $('loginGo').addEventListener('click', doLogin);
  const rab = $('reqAccessBtn'); if (rab) rab.addEventListener('click', requestAccess);
  const lrb = $('lockedReqBtn'); if (lrb) lrb.addEventListener('click', requestAccess);
  $('loginPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
  $('loginModal').addEventListener('click', (e) => { if (e.target.id === 'loginModal') closeLogin(); });
  // cookies
  const consent = localStorage.getItem(LS_CONSENT);
  if (!consent) setTimeout(() => $('cookieBanner').classList.add('active'), 1200);
  $('cookieAccept').addEventListener('click', () => { try { localStorage.setItem(LS_CONSENT, 'accepted'); } catch (e) {} $('cookieBanner').classList.remove('active'); });
  $('cookieDecline').addEventListener('click', () => { try { localStorage.setItem(LS_CONSENT, 'declined'); } catch (e) {} location.href = 'https://www.google.com'; });
}

document.addEventListener('DOMContentLoaded', boot);
