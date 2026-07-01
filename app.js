/* ════════════════════════════════════════════════════════
   LIBERTY FORMULA — app.js v9.0
   Чистая архитектура: лента, sticky плеер, IPTV, OpenF1
   ════════════════════════════════════════════════════════ */

const BACKEND = 'https://libertyformula-production-a845.up.railway.app';
const OPENF1  = 'https://api.openf1.org/v1';

/* ─── DRIVER DATA ──────────────────────────────────── */
const TEAM_CLASS = {
  1:'tm-mercedes',63:'tm-mercedes',44:'tm-ferrari',16:'tm-ferrari',
  4:'tm-mclaren',81:'tm-mclaren',33:'tm-redbull',22:'tm-redbull',
  30:'tm-rb',6:'tm-rb',27:'tm-sauber',5:'tm-sauber',
  10:'tm-alpine',43:'tm-alpine',87:'tm-haas',31:'tm-haas',
  23:'tm-williams',55:'tm-williams',18:'tm-aston',14:'tm-aston',
  77:'tm-sauber',11:'tm-redbull',
};
const DRIVER_CODE = {
  1:'ANT',63:'RUS',44:'HAM',16:'LEC',4:'NOR',81:'PIA',
  33:'VER',22:'HAD',30:'LAW',6:'LIN',27:'HUL',5:'BOR',
  10:'GAS',43:'COL',87:'BEA',31:'OCO',23:'ALB',55:'SAI',
  11:'PER',77:'BOT',18:'STR',14:'ALO',
};
const DRIVER_FULL = {
  1:'ANTONELLI',63:'RUSSELL',44:'HAMILTON',16:'LECLERC',
  4:'NORRIS',81:'PIASTRI',33:'VERSTAPPEN',22:'HADJAR',
  30:'LAWSON',6:'LINDBLAD',27:'HULKENBERG',5:'BORTOLETO',
  10:'GASLY',43:'COLAPINTO',87:'BEARMAN',31:'OCON',
  23:'ALBON',55:'SAINZ',11:'PEREZ',77:'BOTTAS',18:'STROLL',14:'ALONSO',
};

/* ─── HELPERS ──────────────────────────────────────── */
async function api(url) {
  try { const r = await fetch(url); return r.ok ? r.json() : null; }
  catch { return null; }
}
function diag(id, state) {
  const el = document.getElementById(id);
  if (el) el.className = `diag-pulse ${state}`;
}
function gapText(iv) {
  if (!iv) return '—';
  const g = iv.gap_to_leader;
  if (g == null || g === 0) return 'LEADER';
  return typeof g === 'number' ? `+${g.toFixed(3)}` : String(g);
}

/* ─── THEME ────────────────────────────────────────── */
function toggleTheme() {
  const light = document.body.dataset.theme === 'light';
  document.body.dataset.theme = light ? '' : 'light';
  localStorage.setItem('lf_theme', light ? 'dark' : 'light');
}
(function initTheme() {
  if (localStorage.getItem('lf_theme') === 'light')
    document.body.dataset.theme = 'light';
})();

/* ─── ROLES ────────────────────────────────────────── */
function setRole(role) {
  document.body.dataset.role = role;
  document.querySelectorAll('.role-pill').forEach(b =>
    b.classList.toggle('active', b.dataset.role === role)
  );
  localStorage.setItem('lf_role', role);
}
setRole(localStorage.getItem('lf_role') || 'viewer');

/* ─── SIDEBAR ──────────────────────────────────────── */
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}

/* ─── OPENF1 ───────────────────────────────────────── */
async function refreshTiming() {
  const sessions = await api(`${OPENF1}/sessions?year=2026`);
  if (!sessions?.length) { diag('diagOpenF1','err'); return; }
  diag('diagOpenF1','ok');

  const session = sessions.sort((a,b) =>
    new Date(b.date_start) - new Date(a.date_start)
  )[0];

  const chip = document.getElementById('sessionChip');
  if (chip) chip.textContent =
    `${(session.meeting_name||'GP').toUpperCase()} · ${session.session_name||''}`;

  const [positions, intervals] = await Promise.all([
    api(`${OPENF1}/position?session_key=${session.session_key}`),
    api(`${OPENF1}/intervals?session_key=${session.session_key}`),
  ]);
  if (!positions?.length) return;

  const latest = {}, ivMap = {};
  for (const p of positions) {
    const d = p.driver_number;
    if (!latest[d] || p.date > latest[d].date) latest[d] = p;
  }
  if (intervals) for (const iv of intervals) {
    const d = iv.driver_number;
    if (!ivMap[d] || iv.date > ivMap[d].date) ivMap[d] = iv;
  }

  const sorted = Object.values(latest)
    .sort((a,b) => (a.position||99) - (b.position||99))
    .slice(0,12);

  /* Podium */
  document.querySelectorAll('#podiumStrip .pod-cell').forEach((cell,i) => {
    if (!sorted[i]) return;
    const drv = sorted[i].driver_number;
    cell.querySelector('.pod-name').textContent = DRIVER_CODE[drv] || `#${drv}`;
    cell.querySelector('.pod-gap').textContent  = gapText(ivMap[drv]);
  });

  /* HUD */
  if (sorted[0]) {
    const drv = sorted[0].driver_number;
    const hp = document.getElementById('hudPos');
    const hd = document.getElementById('hudDriver');
    if (hp) hp.textContent = 'P' + sorted[0].position;
    if (hd) hd.textContent = DRIVER_FULL[drv] || '';
  }

  /* Table */
  const tbody = document.getElementById('timingBody');
  if (tbody) tbody.innerHTML = sorted.map(row => {
    const drv = row.driver_number;
    const gap = gapText(ivMap[drv]);
    return `<tr class="${TEAM_CLASS[drv]||''}">
      <td class="t-pos">${row.position}</td>
      <td><div class="t-driver"><span class="t-stripe"></span>${DRIVER_CODE[drv]||'#'+drv}</div></td>
      <td class="t-gap mono ${gap==='LEADER'?'text-purple':''}">${gap}</td>
      <td class="c role-commentator-only"><span class="tyre">M</span></td>
    </tr>`;
  }).join('');
}
refreshTiming();
setInterval(refreshTiming, 5000);

/* ─── RSS NEWS ─────────────────────────────────────── */
async function refreshNews() {
  const data = await api(`${BACKEND}/api/feed.json`);
  if (!data?.length) { diag('diagRSS','err'); return; }
  diag('diagRSS','ok');

  const container = document.getElementById('newsRows');
  if (!container) return;
  container.innerHTML = data.slice(0,12).map(item => `
    <div class="news-item${item.alert?' alert':''}" data-cat="${item.category||'all'}">
      <span class="news-time mono">${item.time||'—'}</span>
      <p>${item.alert?'🚨 <span class="news-alert-tag">СРОЧНО:</span> ':''}${item.text}</p>
    </div>
  `).join('');
}
function filterNews(cat) {
  document.querySelectorAll('.filter-tag').forEach(t =>
    t.classList.toggle('active', t.dataset.cat === cat)
  );
  document.querySelectorAll('.news-item').forEach(row => {
    row.style.display = (cat==='all'||row.dataset.cat===cat) ? 'flex' : 'none';
  });
}
refreshNews();
setInterval(refreshNews, 60000);

/* ─── BANNER (admin уведомления) ───────────────────── */
async function refreshBanner() {
  const state = await api(`${BACKEND}/api/state.json`);
  const banner = document.getElementById('feedBanner');
  if (!banner) return;
  if (state?.banner?.text) {
    banner.innerHTML = `<span>📢</span><span>${state.banner.text}</span>`;
    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
  }
}
refreshBanner();
setInterval(refreshBanner, 30000);

/* ─── SMART PLAYER ENGINE ─────────────────────────── */
/*
  Цепочка фолбэков: Shaka → Clappr → Native HTML5
  Автоопределение формата по URL (.mpd = DASH, иначе HLS)
  Мгновенное переключение плеера без перезагрузки
*/

let player        = null;
let activeUrl     = null;
let activeEngine  = null; // 'shaka' | 'clappr' | 'native'
let forcedEngine  = null; // null = AUTO, или принудительный выбор
let pollTimer     = null;
let reconnectTimer = null;
let reconnectDelay = 3000;
let bufferHealth  = 0;
let healthTimer   = null;

function showEmpty(show) {
  const el = document.getElementById('videoEmpty');
  if (el) el.classList.toggle('hidden', !show);
}

function setEngineIndicator(engine) {
  activeEngine = engine;
  // Сообщаем админке
  const indicator = document.getElementById('engineIndicator');
  if (indicator) indicator.textContent = engine?.toUpperCase() || 'AUTO';
}

function detectFormat(url) {
  if (!url) return 'hls';
  if (url.includes('.mpd') || url.includes('dash')) return 'dash';
  return 'hls';
}

function chooseEngine(url, preferred) {
  if (preferred && preferred !== 'auto') return preferred;
  const fmt = detectFormat(url);
  // DASH → Shaka лучше, HLS → Clappr проверен
  return fmt === 'dash' ? 'shaka' : 'clappr';
}

/* ── Уничтожить активный плеер ── */
function destroyPlayer() {
  clearTimeout(reconnectTimer);
  clearInterval(healthTimer);
  if (player) {
    try {
      if (activeEngine === 'shaka') player.destroy();
      else if (activeEngine === 'clappr') player.destroy();
    } catch(e) {}
    player = null;
  }
  const box = document.getElementById('player');
  if (box) box.innerHTML = '';
  setEngineIndicator(null);
}

/* ── Shaka Player ── */
async function initShaka(m3u8) {
  shaka.polyfill.installAll();
  if (!shaka.Player.isBrowserSupported()) {
    console.warn('Shaka not supported, falling back to Clappr');
    return initClappr(m3u8);
  }

  const box = document.getElementById('player');
  box.innerHTML = '';
  const video = document.createElement('video');
  video.id = 'videoEl';
  video.autoplay = true;
  video.controls = true;
  video.playsInline = true;
  video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;background:#000;';
  box.appendChild(video);

  const shakaPlayer = new shaka.Player(video);

  // Конфиг Shaka для живых потоков
  shakaPlayer.configure({
    streaming: {
      lowLatencyMode: true,
      inaccurateManifestTolerance: 0,
      rebufferingGoal: 2,
      bufferingGoal: 10,
    },
    manifest: { retryParameters: { maxAttempts: 6, baseDelay: 1000 } },
    drm: {},
  });

  shakaPlayer.addEventListener('error', (e) => {
    console.error('Shaka error:', e.detail.code, e.detail.message);
    console.warn('Shaka failed — falling back to Clappr');
    destroyPlayer();
    setTimeout(() => initClappr(m3u8), 500);
  });

  try {
    await shakaPlayer.load(m3u8);
    video.play().catch(() => { video.muted = true; video.play().catch(() => {}); });
    showEmpty(false);
    player = shakaPlayer;
    setEngineIndicator('shaka');
    startHealthMonitor(video);
    reconnectDelay = 3000; // сбрасываем задержку при успехе
  } catch(e) {
    console.error('Shaka load failed:', e);
    console.warn('Shaka load failed — falling back to Clappr');
    destroyPlayer();
    setTimeout(() => initClappr(m3u8), 500);
  }
}

/* ── Clappr ── */
function initClappr(m3u8) {
  const box = document.getElementById('player');
  if (!box) return;
  box.innerHTML = '';

  const clapprPlayer = new Clappr.Player({
    source:   m3u8,
    parentId: '#player',
    width:    '100%',
    height:   '100%',
    autoPlay: true,
    hlsjsConfig: {
      enableWorker:                true,
      liveSyncDurationCount:       3,
      liveMaxLatencyDurationCount: 10,
      manifestLoadingMaxRetry:     8,
      fragLoadingMaxRetry:         8,
    },
    events: {
      onPlay() {
        showEmpty(false);
        reconnectDelay = 3000;
        const v = document.querySelector('#player video');
        if (v) startHealthMonitor(v);
      },
      onReady() {
        showEmpty(false);
        clapprPlayer.play();
      },
      onError(e) {
        console.error('Clappr error:', e);
        console.warn('Clappr failed — falling back to Native');
        destroyPlayer();
        setTimeout(() => initNative(m3u8), 500);
      },
    },
  });

  player = clapprPlayer;
  setEngineIndicator('clappr');
  setTimeout(() => showEmpty(false), 3000);
}

/* ── Native HTML5 (последний рубеж) ── */
function initNative(m3u8) {
  const box = document.getElementById('player');
  if (!box) return;
  box.innerHTML = '';

  const video = document.createElement('video');
  video.autoplay = true;
  video.controls = true;
  video.playsInline = true;
  video.src = m3u8;
  video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;background:#000;';
  box.appendChild(video);

  video.addEventListener('canplay', () => {
    showEmpty(false);
    video.play().catch(() => { video.muted = true; video.play().catch(() => {}); });
    reconnectDelay = 3000;
  });
  video.addEventListener('error', () => {
    console.error('Native video error — all engines failed');
    // Все плееры упали — ждём и перезапрашиваем URL
    scheduleReconnect(m3u8);
  });
  video.addEventListener('stalled', () => scheduleReconnect(m3u8));

  player = { destroy: () => { video.src = ''; video.remove(); } };
  setEngineIndicator('native');
  setTimeout(() => showEmpty(false), 4000);
}

/* ── Буферное здоровье потока ── */
function startHealthMonitor(video) {
  clearInterval(healthTimer);
  healthTimer = setInterval(() => {
    if (!video || video.paused) return;
    try {
      const buf = video.buffered;
      if (buf.length > 0) {
        bufferHealth = buf.end(buf.length - 1) - video.currentTime;
        const indicator = document.getElementById('bufferBar');
        if (indicator) {
          const pct = Math.min(100, (bufferHealth / 10) * 100);
          indicator.style.width = pct + '%';
          indicator.style.background = pct > 50 ? 'var(--live)' : pct > 20 ? 'var(--yellow)' : 'var(--accent)';
        }
      }
    } catch(e) {}
  }, 1000);
}

/* ── Умный реконнект с экспоненциальной задержкой ── */
function scheduleReconnect(m3u8) {
  clearTimeout(reconnectTimer);
  console.warn(`Reconnecting in ${reconnectDelay}ms...`);
  reconnectTimer = setTimeout(() => {
    activeUrl = null; // форсируем перезапрос URL
    pollStream();
    reconnectDelay = Math.min(reconnectDelay * 2, 30000); // макс 30 сек
  }, reconnectDelay);
}

/* ── Главная точка входа ── */
function initPlayer(m3u8) {
  destroyPlayer();
  const engine = chooseEngine(m3u8, forcedEngine);
  console.log(`Starting engine: ${engine} for ${m3u8.slice(0, 60)}...`);

  if (engine === 'shaka') {
    initShaka(m3u8);
  } else if (engine === 'clappr') {
    initClappr(m3u8);
  } else {
    initNative(m3u8);
  }
}

/* ── PiP (Picture in Picture) ── */
async function togglePiP() {
  const video = document.querySelector('#player video');
  if (!video) return;
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else {
      await video.requestPictureInPicture();
    }
  } catch(e) { console.warn('PiP not supported:', e); }
}

async function pollStream() {
  const data = await api(`${BACKEND}/api/stream.json`);
  const onair   = document.getElementById('onairChip');
  const srcName = document.getElementById('streamSourceName');

  if (!data?.m3u8 || data.status === 'offline') {
    diag('diagStream', 'warn');
    if (onair)   { onair.className='onair'; onair.innerHTML='<i></i>ОЖИДАНИЕ'; }
    if (srcName) srcName.textContent = 'источник не выбран';
    return;
  }

  diag('diagStream', 'ok');
  if (onair)   { onair.className='onair live'; onair.innerHTML='<i></i>LIVE'; }
  if (srcName) srcName.textContent = data.provider || 'IPTV';

  // Принудительный движок из настроек сервера
  if (data.engine) forcedEngine = data.engine;

  const proxyUrl = `${BACKEND}/api/proxy?url=${encodeURIComponent(data.m3u8)}`;

  if (data.m3u8 !== activeUrl) {
    activeUrl = data.m3u8;
    initPlayer(proxyUrl);
  }
}

pollStream();
pollTimer = setInterval(pollStream, 10000);

/* ─── SYNC ─────────────────────────────────────────── */
let syncOffset = 0;
function adjustSync(delta) {
  syncOffset = Math.round((syncOffset + delta) * 10) / 10;
  const el = document.getElementById('syncVal');
  if (el) el.textContent = `${syncOffset.toFixed(1)}s`;
}

/* ─── AUDIO CHIPS ──────────────────────────────────── */
document.addEventListener('click', e => {
  if (e.target.classList.contains('audio-chip')) {
    document.querySelectorAll('.audio-chip').forEach(c => c.classList.remove('active'));
    e.target.classList.add('active');
  }
});
