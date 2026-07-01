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

/* ─── IPTV PLAYER ──────────────────────────────────── */
let player    = null;
let activeUrl = null;
let pollTimer = null;

function showEmpty(show) {
  const el = document.getElementById('videoEmpty');
  if (el) el.classList.toggle('hidden', !show);
}

function initPlayer(m3u8) {
  // Уничтожаем старый плеер если есть
  if (player) {
    try { player.dispose(); } catch(e) { console.warn('dispose error:', e); }
    player = null;
  }

  // Video.js требует чистый video элемент после dispose
  const box = document.getElementById('video-box');
  const oldEl = document.getElementById('player');
  if (oldEl) oldEl.remove();
  const videoEl = document.createElement('video');
  videoEl.id = 'player';
  videoEl.className = 'video-js vjs-default-skin';
  videoEl.setAttribute('playsinline', '');
  // Вставляем перед stage-empty
  const empty = document.getElementById('videoEmpty');
  box.insertBefore(videoEl, empty);

  try {
    player = videojs('player', {
      autoplay: true,
      controls: true,
      preload: 'auto',
      fluid: false,
      fill: true,
      liveui: true,
      html5: {
        vhs: {
          overrideNative: true,           // важно для Android Chrome
          enableLowInitialPlaylist: true, // быстрый старт
          smoothQualityChange: true,
          allowSeeksWithinUnsafeLiveWindow: true,
          handlePartialData: true,
        },
        nativeAudioTracks: false,
        nativeVideoTracks: false,
      },
    });

    // Загружаем источник
    player.src({ src: m3u8, type: 'application/x-mpegURL' });

    // Успешное воспроизведение
    player.on('playing', () => {
      showEmpty(false);
      const onair = document.getElementById('onairChip');
      if (onair) { onair.className='onair live'; onair.innerHTML='<i></i>LIVE'; }
    });

    // Плеер готов — пробуем играть
    player.on('ready', () => {
      player.play().catch(err => {
        // Autoplay заблокирован браузером — включаем muted и пробуем снова
        console.warn('Autoplay blocked, trying muted:', err);
        player.muted(true);
        player.play().catch(e => console.error('Muted play failed:', e));
      });
    });

    // Ошибки плеера
    player.on('error', () => {
      const err = player.error();
      console.error('Video.js error:', err?.code, err?.message);

      // Код 2 = сеть, код 3 = декодирование, код 4 = источник не поддерживается
      if (err?.code === 2) {
        // Сетевая ошибка — ждём и перезапрашиваем URL (он мог протухнуть)
        console.warn('Network error — refreshing stream in 5s');
        setTimeout(() => { activeUrl = null; pollStream(); }, 5000);
      } else if (err?.code === 3) {
        // Ошибка декодирования — пробуем перезагрузить
        console.warn('Decode error — reloading source');
        player.src({ src: m3u8, type: 'application/x-mpegURL' });
        player.load();
        player.play().catch(() => {});
      } else {
        // Другая ошибка — через 6 сек перезапускаем полностью
        console.warn('Fatal error — reinitializing in 6s');
        setTimeout(() => { activeUrl = null; pollStream(); }, 6000);
      }
    });

    // Стол — видео застряло (stalled > 10 сек)
    let stallTimer = null;
    player.on('stalled', () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        console.warn('Stream stalled — trying to recover');
        player.load();
        player.play().catch(() => {});
      }, 10000);
    });
    player.on('playing', () => clearTimeout(stallTimer));

    // Страховка — убираем спиннер через 4 сек
    setTimeout(() => showEmpty(false), 4000);

  } catch(e) {
    console.error('Video.js init failed:', e);
    // Фолбэк на нативный HTML5 если Video.js сломался
    const fallback = document.getElementById('player');
    if (fallback) {
      fallback.src = m3u8;
      fallback.play().catch(() => {});
      showEmpty(false);
    }
  }
}

async function pollStream() {
  const data = await api(`${BACKEND}/api/stream.json`);
  const onair   = document.getElementById('onairChip');
  const srcName = document.getElementById('streamSourceName');

  if (!data?.m3u8 || data.status === 'offline') {
    diag('diagStream','warn');
    if (onair) { onair.className='onair'; onair.innerHTML='<i></i>ОЖИДАНИЕ'; }
    if (srcName) srcName.textContent = 'источник не выбран';
    return;
  }

  diag('diagStream','ok');
  if (onair) { onair.className='onair live'; onair.innerHTML='<i></i>LIVE'; }
  if (srcName) srcName.textContent = data.provider || 'IPTV';

  if (data.m3u8 !== activeUrl) {
    activeUrl = data.m3u8;
    // Заворачиваем через прокси — Railway обходит CORS за нас
    const proxyUrl = `${BACKEND}/api/proxy?url=${encodeURIComponent(data.m3u8)}`;
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
