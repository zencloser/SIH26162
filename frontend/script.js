/* =========================================================
   AGNIRA — Live Map
   Data model + rendering + interactions.
   Swap HOTSPOTS / PLACES with real API data without touching
   any of the rendering or event-handling code below.
========================================================= */

const HOTSPOTS = [
  {
    id: 'parawada',
    name: 'Parawada Industrial Cluster',
    location: 'Visakhapatnam, Andhra Pradesh',
    lat: 17.6027, lng: 83.2233,
    x: 46.5, y: 48,          // position on the map, in % of map area
    category: 'fire',        // fire | chemical | moderate | normal
    risk: 'high',            // high | moderate | normal
    status: 'Active',
    thermal: 32.6, temp: 326, confidence: 81,
    aiClass: 'Industrial Fire', aiPct: 62,
    desc: 'Elevated thermal output within an industrial cluster. Multiple sources confirm anomaly.',
    detected: '04 Sep 2026, 22:41 IST', area: '~4.2 km²', sat: 'Suomi NPP · VIIRS I-Band',
    selected: true,
    showTooltip: true
  },
  {
    id: 'anakapalle-sensor',
    name: 'Anakapalle Transformer Yard',
    location: 'Anakapalle, Andhra Pradesh',
    lat: 17.6910, lng: 83.0037,
    x: 44, y: 20,
    category: 'watch',
    risk: 'normal',
    status: 'Monitoring',
    thermal: 4.1, temp: 301, confidence: 38,
    aiClass: 'No Anomaly', aiPct: 12,
    desc: 'Routine thermal signature consistent with grid infrastructure. No action required.',
    detected: '04 Sep 2026, 21:10 IST', area: '~0.6 km²', sat: 'NOAA-20 · VIIRS I-Band'
  },
  {
    id: 'nh16-facility',
    name: 'NH16 Roadside Facility',
    location: 'National Highway 16, Visakhapatnam',
    lat: 17.660, lng: 83.140,
    x: 57.5, y: 27,
    category: 'facilities',
    risk: 'normal',
    status: 'Operational',
    thermal: 6.4, temp: 305, confidence: 44,
    aiClass: 'Facility Baseline', aiPct: 18,
    desc: 'Registered industrial facility operating within normal thermal bounds.',
    detected: '04 Sep 2026, 20:55 IST', area: '~1.1 km²', sat: 'Suomi NPP · VIIRS I-Band'
  },
  {
    id: 'port-watch',
    name: 'Port Approach Thermal Watch',
    location: 'Visakhapatnam Port, Andhra Pradesh',
    lat: 17.685, lng: 83.290,
    x: 69, y: 32,
    category: 'moderate',
    risk: 'moderate',
    status: 'Monitoring',
    thermal: 14.8, temp: 312, confidence: 55,
    aiClass: 'Flaring Activity', aiPct: 41,
    desc: 'Intermittent flaring consistent with port refinery operations. Being tracked for persistence.',
    detected: '04 Sep 2026, 22:05 IST', area: '~2.0 km²', sat: 'NOAA-21 · VIIRS I-Band'
  },
  {
    id: 'nakkapalli-chem',
    name: 'Nakkapalli Chemical Storage',
    location: 'Nakkapalli, Andhra Pradesh',
    lat: 17.560, lng: 82.960,
    x: 23, y: 65,
    category: 'chemical',
    risk: 'moderate',
    status: 'Monitoring',
    thermal: 9.7, temp: 308, confidence: 47,
    aiClass: 'Chemical Signature', aiPct: 34,
    desc: 'Thermal profile consistent with chemical storage venting. No fire signature detected.',
    detected: '04 Sep 2026, 21:48 IST', area: '~1.4 km²', sat: 'Suomi NPP · VIIRS M-Band'
  },
  {
    id: 'atchutapuram-sez',
    name: 'Atchutapuram SEZ',
    location: 'Atchutapuram, Andhra Pradesh',
    lat: 17.520, lng: 83.070,
    x: 43, y: 79,
    category: 'facilities',
    risk: 'high',
    status: 'Active',
    thermal: 21.3, temp: 318, confidence: 69,
    aiClass: 'Industrial Fire', aiPct: 47,
    desc: 'Sustained thermal output above baseline for this SEZ zone. Recommend field verification.',
    detected: '04 Sep 2026, 22:30 IST', area: '~3.1 km²', sat: 'NOAA-20 · VIIRS I-Band'
  },
  {
    id: 'parawada-fac-2',
    name: 'Parawada Facility Block B',
    location: 'Parawada, Visakhapatnam',
    lat: 17.598, lng: 83.210,
    x: 55, y: 55,
    category: 'facilities',
    risk: 'normal',
    status: 'Operational',
    thermal: 5.9, temp: 303, confidence: 33,
    aiClass: 'Facility Baseline', aiPct: 15,
    desc: 'Registered industrial facility operating within normal thermal bounds.',
    detected: '04 Sep 2026, 21:20 IST', area: '~0.9 km²', sat: 'Suomi NPP · VIIRS I-Band'
  },
];

const PLACES = [
  { name: 'Visakhapatnam', x: 61, y: 44 },
  { name: 'Anakapalle', x: 17, y: 21 },
  { name: 'Nakkapalli', x: 11, y: 66 },
  { name: 'Parawada', x: 20.5, y: 59 },
  { name: 'Atchutapuram', x: 34, y: 75 },
  { name: 'Visakhapatnam Port', x: 62, y: 36 },
  { name: 'NH16', x: 48.5, y: 22.5 },
  { name: 'Bay of Bengal', x: 63, y: 71 },
];

const riskColor = { high: 'var(--red)', moderate: 'var(--amber)', normal: 'var(--green)' };
const categoryDotClass = { fire: 'red', chemical: 'purple', moderate: 'amber', normal: 'green', facilities: 'fac', watch: 'blue' };

let currentTheme = 'day';
let activeFilter = 'all';
let minConfidence = 0;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let selectedId = HOTSPOTS.find(h => h.selected)?.id || HOTSPOTS[0].id;
let layerVisibility = { hotspots: true, clusters: true, facilities: true, roads: true, labels: true };

/* ---------- rendering ---------- */

const markersLayer = document.getElementById('markersLayer');

function visibleHotspots(){
  return HOTSPOTS.filter(h => {
    if (h.confidence < minConfidence) return false;
    if (activeFilter === 'all') return true;
    if (activeFilter === 'facilities') return h.category === 'facilities';
    return h.category === activeFilter;
  });
}

// marker DOM elements persist across re-renders (keyed by hotspot id) so that
// showing/hiding via filters or layer toggles animates opacity instead of
// abruptly destroying and recreating nodes.
const markerEls = {};

function renderMarkers(){
  const list = visibleHotspots();
  const visibleIds = new Set();

  list.forEach(h => {
    if (h.category === 'facilities' && !layerVisibility.facilities) return;
    if (h.category !== 'facilities' && !layerVisibility.hotspots) return;
    visibleIds.add(h.id);
  });

  HOTSPOTS.forEach(h => {
    const cls = categoryDotClass[h.category] || 'green';
    const isSelected = h.id === selectedId;
    let el = markerEls[h.id];

    if (!el) {
      el = document.createElement('div');
      el.dataset.id = h.id;
      el.addEventListener('click', (e) => { e.stopPropagation(); selectHotspot(h.id); });
      markersLayer.appendChild(el);
      markerEls[h.id] = el;
    }

    el.className = `marker ${cls}` + (isSelected ? ' selected' : '') + (visibleIds.has(h.id) ? '' : ' marker--hidden');
    el.dataset.risk = h.risk;
    el.style.left = h.x + '%';
    el.style.top = h.y + '%';

    // every category — including facilities — renders as the same clean
    // solid-core point; only size/color/glow differ (handled in CSS)
    let inner = '<div class="pulse-ring"></div><div class="marker-dot"></div>';
    if (h.showTooltip && isSelected) {
      inner += `<div class="marker-tooltip">
        <div class="tt-title">${h.name}</div>
        <div class="tt-risk" style="color:${riskColor[h.risk]}"><span class="dot" style="background:${riskColor[h.risk]}"></span>${h.risk.toUpperCase()} RISK</div>
        <div class="tt-meta">${h.thermal} MW · ${h.confidence}% confidence</div>
      </div>`;
    }
    el.innerHTML = inner;
  });

  updateStatusCounts(list);
}

// brief radar-lock detection animation — plays once, only when a hotspot
// is newly selected, never on a routine re-render.
function triggerDetectAnimation(id){
  const el = markerEls[id];
  if (!el) return;
  el.classList.remove('marker--detect');
  // force reflow so the animation can restart if selected again quickly
  void el.offsetWidth;
  el.classList.add('marker--detect');
  setTimeout(() => el.classList.remove('marker--detect'), 1100);
}

function updateStatusCounts(list){
  const activeCount = list.filter(h => h.category !== 'facilities').length;
  const highRiskCount = list.filter(h => h.risk === 'high').length;
  document.getElementById('activeHotspotsCount').textContent = activeCount;
  document.getElementById('highRiskCount').textContent = highRiskCount;
}

function selectHotspot(id){
  HOTSPOTS.forEach(h => h.showTooltip = false);
  const h = HOTSPOTS.find(x => x.id === id);
  if (!h) return;
  const card = document.getElementById('detailCard');
  const isSwitchingHotspot = selectedId !== id && !card.classList.contains('hidden');
  selectedId = id;
  h.showTooltip = true;
  renderMarkers();
  triggerDetectAnimation(id);

  if (isSwitchingHotspot && !prefersReducedMotion) {
    card.classList.add('content-swap');
    setTimeout(() => {
      fillDetailCard(h);
      card.classList.remove('content-swap');
    }, 120);
  } else {
    fillDetailCard(h);
  }

  card.classList.remove('hidden');
  document.getElementById('detailExtra').classList.remove('show');
}

function fillDetailCard(h){
  const dot = document.getElementById('detailRiskDot');
  const label = document.getElementById('detailRiskLabel');
  const pill = document.getElementById('detailStatusPill');
  const color = riskColor[h.risk];
  dot.style.background = color;
  dot.style.boxShadow = `0 0 6px ${color}`;
  label.textContent = h.risk.toUpperCase() + ' RISK';
  label.style.color = color;
  pill.textContent = h.status;

  document.getElementById('detailTitle').textContent = h.name;
  document.getElementById('detailLoc').textContent = h.location;
  document.getElementById('detailCoords').textContent =
    `${h.lat.toFixed(4)}° N, ${h.lng.toFixed(4)}° E`;

  document.getElementById('statThermal').innerHTML = `${h.thermal} <span class="unit">MW</span>`;
  document.getElementById('statTemp').innerHTML = `${h.temp} <span class="unit">K</span>`;
  document.getElementById('statConf').innerHTML = `${h.confidence}<span class="unit">%</span>`;

  // replay the small sequential fade-up entrance on the three metric boxes
  document.querySelectorAll('#statRow .stat-box').forEach(box => {
    box.style.animation = 'none';
    void box.offsetWidth; // force reflow so the animation can restart
    box.style.animation = '';
  });

  document.getElementById('aiClass').textContent = h.aiClass;
  document.getElementById('aiPct').textContent = h.aiPct + '%';
  document.getElementById('aiDesc').textContent = h.desc;

  // the assessment's accent reflects what was actually found, not a fixed
  // brand color — chemical signatures read purple, everything else follows
  // the same risk severity as the status dot above
  const aiColor = h.category === 'chemical' ? 'var(--purple)' : color;
  document.getElementById('aiFlame').style.color = aiColor;
  document.getElementById('aiPct').style.color = aiColor;
  const barFill = document.getElementById('aiBarFill');
  barFill.style.background = aiColor;

  // animate the confidence bar from 0 up to its real (unaltered) value
  barFill.style.transition = 'none';
  barFill.style.width = '0%';
  void barFill.offsetWidth; // force reflow
  barFill.style.transition = '';
  requestAnimationFrame(() => { barFill.style.width = h.aiPct + '%'; });

  document.getElementById('extraDetected').textContent = h.detected;
  document.getElementById('extraArea').textContent = h.area;
  document.getElementById('extraSat').textContent = h.sat;
}

/* ---------- day / night ----------
   currentTheme is the ONE source of truth for day/night. Every visible
   signal — body theme, toggle classes (which drive the knob position,
   label color, and dot color via CSS), aria-checked, and the "DAY"/"NIGHT"
   word next to AGNIRA — is derived from it here, in one place, every time
   the mode changes. Nothing else should set or read a separate flag. */

const dayNightToggle = document.getElementById('dayNightToggle');

function applyTheme(mode){
  const isNight = mode === 'night';
  currentTheme = isNight ? 'night' : 'day';
  document.body.classList.toggle('theme-day', !isNight);
  dayNightToggle.classList.toggle('is-night', isNight);
  dayNightToggle.classList.toggle('is-day', !isNight);
  dayNightToggle.setAttribute('aria-checked', String(!isNight));
  document.getElementById('modeWord').textContent = isNight ? 'NIGHT' : 'DAY';
}

// boot from whatever mode the markup already declares, so the very first
// paint and the very first JS-driven state can never disagree
applyTheme(dayNightToggle.classList.contains('is-night') ? 'night' : 'day');

dayNightToggle.addEventListener('click', () => applyTheme(currentTheme === 'night' ? 'day' : 'night'));
dayNightToggle.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); applyTheme(currentTheme === 'night' ? 'day' : 'night'); }
});

/* ---------- search ---------- */

const searchInput = document.getElementById('searchInput');
const searchHint = document.getElementById('searchHint');
const searchClear = document.getElementById('searchClear');
const searchHintDefault = searchHint.textContent;

function updateSearchClearVisibility(){
  searchClear.style.display = searchInput.value.length ? 'flex' : 'none';
}
function clearSearch(focusAfter){
  searchInput.value = '';
  updateSearchClearVisibility();
  searchHint.textContent = searchHintDefault;
  searchHint.classList.remove('show');
  if (focusAfter) searchInput.focus();
}
searchInput.addEventListener('focus', () => searchHint.classList.add('show'));
searchInput.addEventListener('blur', () => setTimeout(() => searchHint.classList.remove('show'), 150));
searchInput.addEventListener('input', updateSearchClearVisibility);
searchClear.addEventListener('click', () => clearSearch(true));

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { clearSearch(false); searchInput.blur(); return; }
  if (e.key !== 'Enter') return;
  const q = e.target.value.trim().toLowerCase();
  if (!q) { clearSearch(true); return; }

  // try a hotspot name/location match first
  const hotspotMatch = HOTSPOTS.find(h =>
    h.name.toLowerCase().includes(q) || h.location.toLowerCase().includes(q));
  if (hotspotMatch) {
    selectHotspot(hotspotMatch.id);
    flashLocation(hotspotMatch.x, hotspotMatch.y);
    showToast(`Found: ${hotspotMatch.name}`);
    searchHint.textContent = searchHintDefault;
    return;
  }

  // then a place label
  const placeMatch = PLACES.find(p => p.name.toLowerCase().includes(q));
  if (placeMatch) {
    flashLocation(placeMatch.x, placeMatch.y);
    showToast(`Centered on ${placeMatch.name}`);
    searchHint.textContent = searchHintDefault;
    return;
  }

  // coordinate search "lat, lng"
  const coordMatch = q.match(/(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)/);
  if (coordMatch) {
    showToast(`No hotspot at ${coordMatch[1]}, ${coordMatch[2]}`);
    searchHint.textContent = searchHintDefault;
    return;
  }

  searchHint.textContent = `No match for "${e.target.value.trim()}"`;
  searchHint.classList.add('show');
});

function flashLocation(x, y){
  const ring = document.createElement('div');
  ring.style.position = 'absolute';
  ring.style.left = x + '%';
  ring.style.top = y + '%';
  ring.style.width = '30px';
  ring.style.height = '30px';
  ring.style.marginLeft = '-15px';
  ring.style.marginTop = '-15px';
  ring.style.borderRadius = '50%';
  ring.style.border = '2px solid var(--orange)';
  ring.style.zIndex = '45';
  ring.style.pointerEvents = 'none';
  ring.style.animation = 'pulseRing 1s ease-out 2';
  markersLayer.appendChild(ring);
  setTimeout(() => ring.remove(), 2000);
}

/* ---------- notification bell ---------- */

const bellBtn = document.getElementById('bellBtn');
const bellPanel = document.getElementById('bellPanel');
const bellDot = document.getElementById('bellDot');
bellBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  bellPanel.classList.toggle('show');
  if (bellPanel.classList.contains('show')) bellDot.style.display = 'none';
});
document.addEventListener('click', (e) => {
  if (!bellBtn.contains(e.target)) bellPanel.classList.remove('show');
});

/* ---------- tool rail + popovers ---------- */

const popovers = {
  layers: document.getElementById('layersPopover'),
  filter: document.getElementById('filterPopover'),
  chart: document.getElementById('chartPopover'),
};
const toolButtons = {
  layers: document.getElementById('toolLayers'),
  filter: document.getElementById('toolFilter'),
  chart: document.getElementById('toolChart'),
};

function closeAllPopovers(exceptKey){
  Object.keys(popovers).forEach(key => {
    if (key === exceptKey) return;
    popovers[key].classList.remove('show');
    toolButtons[key].classList.remove('active');
  });
}
function togglePopover(key){
  const isShowing = popovers[key].classList.contains('show');
  closeAllPopovers(key);
  popovers[key].classList.toggle('show', !isShowing);
  toolButtons[key].classList.toggle('active', !isShowing);
}

// layers icon is visually active (highlighted) to match the reference,
// but its popover starts closed
toolButtons.layers.classList.add('active');

document.getElementById('toolLayers').addEventListener('click', (e) => { e.stopPropagation(); togglePopover('layers'); });
document.getElementById('toolFilter').addEventListener('click', (e) => { e.stopPropagation(); togglePopover('filter'); });
document.getElementById('toolChart').addEventListener('click', (e) => {
  e.stopPropagation();
  renderMiniBars();
  togglePopover('chart');
});
document.getElementById('toolMenu').addEventListener('click', () => {
  showToast('Menu: use the top navigation to switch sections');
});
document.getElementById('toolLocate').addEventListener('click', () => {
  const h = HOTSPOTS.find(x => x.id === selectedId) || HOTSPOTS[0];
  flashLocation(h.x, h.y);
  showToast('Recentered on ' + h.name);
});
document.getElementById('toolFullscreen').addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.getElementById('app').requestFullscreen?.().catch(() => showToast('Fullscreen not available'));
  } else {
    document.exitFullscreen?.();
  }
});

document.addEventListener('click', (e) => {
  const clickedInsidePopover = Object.values(popovers).some(p => p.contains(e.target));
  const clickedToolBtn = Object.values(toolButtons).some(b => b.contains(e.target));
  if (!clickedInsidePopover && !clickedToolBtn) closeAllPopovers();
});

document.querySelectorAll('.layer-row input').forEach(input => {
  input.addEventListener('change', () => {
    layerVisibility[input.dataset.layer] = input.checked;
    if (input.dataset.layer === 'roads') {
      document.querySelector('.map-roads').style.display = input.checked ? '' : 'none';
    }
    if (input.dataset.layer === 'labels') {
      document.querySelectorAll('.place-label, .road-badge, .port-label').forEach(l => {
        l.style.display = input.checked ? '' : 'none';
      });
    }
    if (input.dataset.layer === 'clusters') {
      document.getElementById('clusterPoly').style.display = input.checked ? '' : 'none';
    }
    renderMarkers();
  });
});

const confSlider = document.getElementById('confSlider');
const confValue = document.getElementById('confValue');
confSlider.addEventListener('input', () => {
  minConfidence = Number(confSlider.value);
  confValue.textContent = minConfidence + '%';
  renderMarkers();
});

function renderMiniBars(){
  const cats = [
    { key: 'fire', label: 'Fire', color: 'var(--red)' },
    { key: 'chemical', label: 'Chemical', color: 'var(--purple)' },
    { key: 'moderate', label: 'Moderate', color: 'var(--amber)' },
    { key: 'normal', label: 'Normal', color: 'var(--green)' },
    { key: 'facilities', label: 'Facilities', color: 'var(--blue)' },
  ];
  const max = Math.max(...cats.map(c => HOTSPOTS.filter(h => h.category === c.key).length), 1);
  const box = document.getElementById('miniBars');
  box.innerHTML = cats.map(c => {
    const count = HOTSPOTS.filter(h => h.category === c.key).length;
    const pct = (count / max) * 100;
    return `<div class="mini-bar-row">
      <span class="lbl">${c.label}</span>
      <span class="track"><span class="fill" style="width:${pct}%; background:${c.color};"></span></span>
      <span class="val">${count}</span>
    </div>`;
  }).join('');
}

/* ---------- detail card ---------- */

document.getElementById('detailClose').addEventListener('click', () => {
  document.getElementById('detailCard').classList.add('hidden');
});
document.getElementById('viewDetailsBtn').addEventListener('click', () => {
  document.getElementById('detailExtra').classList.toggle('show');
});

/* ---------- legend / filter bar ---------- */

const legendIndicator = document.getElementById('legendIndicator');
function positionLegendIndicator(){
  const active = document.querySelector('#legendOptions .legend-opt.active');
  if (!active || !legendIndicator) return;
  legendIndicator.style.left = active.offsetLeft + 'px';
  legendIndicator.style.width = active.offsetWidth + 'px';
}

document.getElementById('legendBar').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-filter]');
  if (!btn) return;
  activeFilter = btn.dataset.filter;

  document.querySelectorAll('#legendOptions [data-filter]').forEach(b => {
    b.classList.toggle('active', b === btn);
    b.classList.toggle('dimmed', activeFilter !== 'all' && b !== btn);
  });
  positionLegendIndicator();
  renderMarkers();
});

window.addEventListener('resize', positionLegendIndicator);

/* ---------- top nav ---------- */

const navIndicator = document.getElementById('navIndicator');
function positionNavIndicator(){
  const active = document.querySelector('#mainNav a.active');
  if (!active || !navIndicator) return;
  navIndicator.style.left = active.offsetLeft + 'px';
  navIndicator.style.width = active.offsetWidth + 'px';
}

document.getElementById('mainNav').addEventListener('click', (e) => {
  const link = e.target.closest('a');
  if (!link) return;
  e.preventDefault();
  const page = link.dataset.page;
  const newStage = document.getElementById('page-' + page);
  const oldStage = document.querySelector('.stage:not(.hidden)');

  document.querySelectorAll('#mainNav a').forEach(a => a.classList.toggle('active', a === link));
  positionNavIndicator();

  if (!newStage || newStage === oldStage) return;

  if (!oldStage || prefersReducedMotion) {
    if (oldStage) oldStage.classList.add('hidden');
    newStage.classList.remove('hidden');
    return;
  }

  // exit the current page first, then swap and enter the new one —
  // the map (and every other page) stays mounted the whole time, only
  // its visibility and a short opacity/translateX transition change
  oldStage.classList.remove('stage-enter');
  oldStage.classList.add('stage-exit');

  setTimeout(() => {
    oldStage.classList.add('hidden');
    oldStage.classList.remove('stage-exit');
    newStage.classList.remove('hidden');
    newStage.classList.add('stage-enter');
    newStage.addEventListener('animationend', function onEnterDone(ev){
      if (ev.animationName !== 'pageEnter') return;
      newStage.classList.remove('stage-enter');
      newStage.removeEventListener('animationend', onEnterDone);
    });
  }, 140);
});

window.addEventListener('resize', positionNavIndicator);

/* ---------- toast ---------- */

let toastTimer = null;
function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------- keyboard shortcut ⌘K / Ctrl+K ---------- */

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    searchInput.focus();
  }
});

/* ---------- live status ticking ---------- */

function tickClock(){
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  document.getElementById('lastScan').textContent = `${h}:${m} IST`;
}
setInterval(tickClock, 30000);

/* ---------- init ---------- */

renderMarkers();
selectHotspot(selectedId);
requestAnimationFrame(positionNavIndicator);
requestAnimationFrame(positionLegendIndicator);
