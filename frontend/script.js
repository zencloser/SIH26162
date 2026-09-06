/* =========================================================
   AGNIRA — Live Industrial Thermal Map
   Watermark-free Tiles + Speedometer Risk Dial + Semantic GIS
========================================================= */

const AOI = { minLat: 17.46, minLng: 82.90, maxLat: 17.80, maxLng: 83.36 };
const MAP_CENTER = [83.19, 17.645];
const MAP_ZOOM = 10.6;

// Keyless raster tiles
const OSM_RASTER_TILES = ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'];
const SATELLITE_TILES = ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'];

const SEVERITY_COLOR = { low: '#28d788', medium: '#fdb830', high: '#ff7a33', critical: '#ff4438' };
const SEVERITY_RADIUS = { low: 4.5, medium: 6, high: 7.5, critical: 8.5 };
const SEVERITY_RISK_KM = { low: 0.8, medium: 1.5, high: 2.5, critical: 3.2 };

// Clean inline SVGs for facilities
const SVG_ICONS = {
  fire: '<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M19.5 13.5A7.5 7.5 0 1 1 12 6c.5 1.5 2 3 2 4.5a2.5 2.5 0 0 0 2.5 2.5c1 0 2-.5 3 .5Z" fill="none" stroke="#ff4438" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 18a3 3 0 0 0 3-3c0-1-1-2-1.5-2.5a1.5 1.5 0 0 0-3 1.5c0 1.5 1 3 1.5 4Z" fill="#ff7a33"/></svg>',
  hospital: '<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="#28d788" stroke-width="1.8"/><path d="M12 8v8M8 12h8" stroke="#28d788" stroke-width="2" stroke-linecap="round"/></svg>',
  industrial: '<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M3 21V10l6 3V9l6 3V6l6 4v11H3Z" fill="none" stroke="#ff7a33" stroke-width="1.8" stroke-linejoin="round"/></svg>'
};

const agniraData = {
  hotspots: [],
  industrialFacilities: [],
  emergencyFacilities: [],
  riskZones: []
};

function featureCollection(features) { return { type: 'FeatureCollection', features }; }

function hotspotFeature(h) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: h.coordinates },
    properties: {
      id: h.id, name: h.name, location: h.location,
      confidence: h.confidence, severity: h.severity, status: h.status,
      category: h.category || 'industrial',
      source: 'FIRMS DATA', ts: new Date(h.timestamp).getTime(),
      thermal: h.thermal, temp: h.temp, riskScore: h.riskScore || 75,
      area: h.area, riskRadiusKm: h.riskRadiusKm
    }
  };
}

function facilityFeature(f) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: f.coordinates },
    properties: { id: f.id, name: f.name, type: f.type, status: f.status }
  };
}

async function fetchHotspots() {
  const response = await fetch('http://127.0.0.1:8000/api/hotspots');
  const data = await response.json();

  const raw = data.events.map(e => ({
    id: e.id,
    name: e.context.facility_name || `Thermal Anomaly · ${e.latitude.toFixed(2)}°N, ${e.longitude.toFixed(2)}°E`,
    location: `${e.latitude.toFixed(3)}, ${e.longitude.toFixed(3)}`,
    coordinates: [e.longitude, e.latitude],
    confidence: Math.round(e.classification.confidence * 100),
    severity: e.risk.severity,
    category: e.context.industrial_area ? 'industrial' : (e.classification.label === 'unknown' ? 'others' : e.classification.label),
    status: e.persistence.detection_count > 1 ? 'Monitoring' : 'Active',
    timestamp: e.timestamp,
    thermal: e.frp,
    temp: e.brightness,
    riskScore: e.risk.score,
    area: null
  })).map(h => ({ ...h, riskRadiusKm: SEVERITY_RISK_KM[h.severity] }));

  return featureCollection(raw.map(hotspotFeature));
}

async function fetchFacilities() {
  const industrial = [
    { id: 'nh16-facility', name: 'NH16 Roadside Facility', type: 'industrial', status: 'Operational', coordinates: [83.140, 17.660] },
    { id: 'parawada-fac-2', name: 'Parawada Facility Block B', type: 'industrial', status: 'Operational', coordinates: [83.210, 17.598] },
    { id: 'vizag-steel-plant', name: 'Visakhapatnam Steel Plant', type: 'industrial', status: 'Operational', coordinates: [83.1946, 17.6296] },
    { id: 'hpcl-refinery', name: 'HPCL Refinery Visakhapatnam', type: 'industrial', status: 'Operational', coordinates: [83.2185, 17.6868] },
    { id: 'atchutapuram-industrial', name: 'Atchutapuram SEZ Industrial Park', type: 'industrial', status: 'Operational', coordinates: [83.075, 17.522] }
  ];
  const emergency = [
    { id: 'kgh-hospital', name: 'King George Hospital', type: 'hospital', status: 'Operational', coordinates: [83.3016, 17.7231] },
    { id: 'jagadamba-fire', name: 'Jagadamba Fire Station', type: 'fire', status: 'Operational', coordinates: [83.2975, 17.7060] },
    { id: 'parawada-fire', name: 'Parawada Fire Station', type: 'fire', status: 'Operational', coordinates: [83.225, 17.605] },
    { id: 'anakapalle-chc', name: 'Anakapalle Community Health Centre', type: 'hospital', status: 'Operational', coordinates: [83.0037, 17.6870] }
  ];
  return {
    industrial: featureCollection(industrial.map(facilityFeature)),
    emergency: featureCollection(emergency.map(facilityFeature))
  };
}

const toRad = d => d * Math.PI / 180;
const toDeg = r => r * 180 / Math.PI;

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function circlePolygon(centerLng, centerLat, radiusKm, steps = 64) {
  const R = 6371;
  const angularDist = radiusKm / R;
  const lat1 = toRad(centerLat), lon1 = toRad(centerLng);
  const coords = [];
  for (let i = 0; i <= steps; i++) {
    const bearing = toRad((i * 360) / steps);
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angularDist) + Math.cos(lat1) * Math.sin(angularDist) * Math.cos(bearing));
    const lon2 = lon1 + Math.atan2(
      Math.sin(bearing) * Math.sin(angularDist) * Math.cos(lat1),
      Math.cos(angularDist) - Math.sin(lat1) * Math.sin(lat2)
    );
    coords.push([toDeg(lon2), toDeg(lat2)]);
  }
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: {} };
}

function nearestFacilities(hotspotFeature, maxResults = 4) {
  const [hLng, hLat] = hotspotFeature.geometry.coordinates;
  const all = [
    ...agniraData.industrialFacilities.features.map(f => ({ f, kind: 'industrial' })),
    ...agniraData.emergencyFacilities.features.map(f => ({ f, kind: f.properties.type }))
  ];
  return all
    .map(({ f, kind }) => ({
      feature: f,
      kind,
      distanceKm: haversineKm(hLat, hLng, f.geometry.coordinates[1], f.geometry.coordinates[0])
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, maxResults);
}

/* ---------------------------------------------------------
   STATE
--------------------------------------------------------- */
let map;
let currentTheme = 'night';
let activeFilter = 'all'; // 'all' | 'industrial' | 'natural' | 'others' | 'facilities'
let minConfidence = 0;
let currentMapMode = 'standard'; // 'standard' | 'satellite'
let selectedId = null;
let layerVisibility = { hotspots: true, riskzones: true, industrial: true, emergency: true };
let timelineCutoffMs = Infinity;
let timelineMinMs = 0, timelineMaxMs = 0;
let timelinePlaying = false, timelineTimer = null;
let currentGaugeAnim = null;
let clickPulseAnimId = null;

function getHotspotById(id) {
  return agniraData.hotspots.features.find(f => f.properties.id === id) || null;
}

function timeFilteredHotspots() {
  return agniraData.hotspots.features.filter(f => {
    const matchTime = f.properties.ts <= timelineCutoffMs;
    const matchConf = f.properties.confidence >= minConfidence;
    let matchFilter = true;
    if (activeFilter === 'facilities') {
      matchFilter = false;
    } else if (activeFilter !== 'all') {
      matchFilter = f.properties.category === activeFilter;
    }
    return matchTime && matchConf && matchFilter;
  });
}

/* ---------------------------------------------------------
   MAP ENGINE INITIALIZATION
--------------------------------------------------------- */
function initMap() {
  if (typeof maplibregl === 'undefined') return;

  map = new maplibregl.Map({
    container: 'glMap',
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    attributionControl: false,
    style: {
      version: 8,
      sources: {
        'osm-tiles': { type: 'raster', tiles: OSM_RASTER_TILES, tileSize: 256 },
        'sat-tiles': { type: 'raster', tiles: SATELLITE_TILES, tileSize: 256 }
      },
      layers: [
        { id: 'osm-base', type: 'raster', source: 'osm-tiles', paint: { 'raster-opacity': 1 } },
        { id: 'sat-base', type: 'raster', source: 'sat-tiles', layout: { visibility: 'none' }, paint: { 'raster-opacity': 1 } }
      ]
    },
    center: MAP_CENTER,
    zoom: MAP_ZOOM
  });

  map.on('load', onMapLoad);
  map.on('mousemove', e => updateCoordHud(e.lngLat));
  map.on('click', e => updateCoordHud(e.lngLat));
  map.on('zoom', updateScaleBar);
  map.on('moveend', updateScaleBar);
}

async function onMapLoad() {
  try {
    const [hotspots, facilities] = await Promise.all([fetchHotspots(), fetchFacilities()]);
    agniraData.hotspots = hotspots;
    agniraData.industrialFacilities = facilities.industrial;
    agniraData.emergencyFacilities = facilities.emergency;

    addEmptySource('risk-zone');
    addEmptySource('proximity-lines');
    addEmptySource('click-pulse');

    map.addSource('hotspots-src', { type: 'geojson', data: agniraData.hotspots });
    map.addSource('industrial-src', { type: 'geojson', data: agniraData.industrialFacilities });
    map.addSource('emergency-src', { type: 'geojson', data: agniraData.emergencyFacilities });

    // Risk perimeter polygon
    map.addLayer({
      id: 'risk-zone-fill', type: 'fill', source: 'risk-zone',
      paint: { 'fill-color': '#ff4438', 'fill-opacity': 0.12 }
    });
    map.addLayer({
      id: 'risk-zone-line', type: 'line', source: 'risk-zone',
      paint: { 'line-color': '#ff4438', 'line-width': 1.6, 'line-dasharray': [3, 2], 'line-opacity': 0.85 }
    });
    map.addLayer({
      id: 'proximity-lines-layer', type: 'line', source: 'proximity-lines',
      paint: { 'line-color': '#fdb830', 'line-width': 1.2, 'line-dasharray': [2, 2], 'line-opacity': 0.8 }
    });

    // Facility markers
    map.addLayer({
      id: 'industrial-facilities-layer', type: 'circle', source: 'industrial-src',
      paint: {
        'circle-radius': 5,
        'circle-color': '#ffffff',
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#111210',
        'circle-opacity': 0.95
      }
    });
    map.addLayer({
      id: 'emergency-facilities-layer', type: 'circle', source: 'emergency-src',
      paint: {
        'circle-radius': 5,
        'circle-color': ['match', ['get', 'type'], 'fire', '#ff5a46', '#39e7a5'],
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#111210',
        'circle-opacity': 0.95
      }
    });

    // Hotspot markers with radial halo
    map.addLayer({
      id: 'hotspots-pulse', type: 'circle', source: 'hotspots-src',
      filter: ['any', ['==', ['get', 'severity'], 'high'], ['==', ['get', 'severity'], 'critical']],
      paint: {
        'circle-radius': 11,
        'circle-color': ['match', ['get', 'severity'], 'critical', SEVERITY_COLOR.critical, SEVERITY_COLOR.high],
        'circle-opacity': 0.3
      }
    });

    // Dynamic Expanding Click Wavefront Layer
    map.addLayer({
      id: 'click-pulse-layer',
      type: 'circle',
      source: 'click-pulse',
      paint: {
        'circle-radius': 6,
        'circle-color': '#ff4438',
        'circle-opacity': 0.8,
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ff7a33',
        'circle-stroke-opacity': 0.9
      }
    });

    map.addLayer({
      id: 'hotspots-circle', type: 'circle', source: 'hotspots-src',
      paint: {
        'circle-radius': ['match', ['get', 'severity'],
          'low', SEVERITY_RADIUS.low, 'medium', SEVERITY_RADIUS.medium, 'high', SEVERITY_RADIUS.high, 'critical', SEVERITY_RADIUS.critical, 5.5],
        'circle-color': ['match', ['get', 'severity'],
          'low', SEVERITY_COLOR.low, 'medium', SEVERITY_COLOR.medium, 'high', SEVERITY_COLOR.high, 'critical', SEVERITY_COLOR.critical, '#ffffff'],
        'circle-stroke-width': 1.6,
        'circle-stroke-color': '#111210',
        'circle-opacity': 0.95
      }
    });

    wireMapInteractions();
    setupTimeline();
    applyAllLayerVisibility();
    renderMiniBars();
    renderAnalytics();
    updateStatusCounts();
    updateScaleBar();

    const initial = agniraData.hotspots.features.slice().sort((a, b) => b.properties.riskScore - a.properties.riskScore)[0];
    if (initial) selectHotspot(initial.properties.id, { fly: false });
  } catch (err) {
    console.error('GIS layer setup error:', err);
  } finally {
    const loading = document.getElementById('mapLoading');
    if (loading) loading.classList.add('hidden');
  }
}

function addEmptySource(id) {
  map.addSource(id, { type: 'geojson', data: featureCollection([]) });
}

function wireMapInteractions() {
  map.on('click', 'hotspots-circle', e => {
    if (!e.features.length) return;
    selectHotspot(e.features[0].properties.id, { fly: false });
  });

  map.on('mouseenter', 'hotspots-circle', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'hotspots-circle', () => { map.getCanvas().style.cursor = ''; });

  map.on('click', 'industrial-facilities-layer', e => showFacilityPopup(e.features[0], 'industrial'));
  map.on('click', 'emergency-facilities-layer', e => showFacilityPopup(e.features[0], e.features[0].properties.type));
}

function showFacilityPopup(feature, kind) {
  const [lng, lat] = feature.geometry.coordinates;
  const iconSvg = SVG_ICONS[kind] || SVG_ICONS.industrial;
  new maplibregl.Popup({ closeButton: true, maxWidth: '240px' })
    .setLngLat([lng, lat])
    .setHTML(`
      <div class="gl-popup-title">${iconSvg} ${feature.properties.name}</div>
      <div class="gl-popup-row"><span>Type</span><b>${kind.toUpperCase()}</b></div>
      <div class="gl-popup-row"><span>Status</span><b>${feature.properties.status}</b></div>
      <div class="gl-popup-row"><span>Coords</span><b>${lat.toFixed(4)}, ${lng.toFixed(4)}</b></div>
    `)
    .addTo(map);
}

function updateCoordHud(lngLat) {
  document.getElementById('hudLat').textContent = lngLat.lat.toFixed(5);
  document.getElementById('hudLon').textContent = lngLat.lng.toFixed(5);
  document.getElementById('hudZoom').textContent = map.getZoom().toFixed(1);
}

function updateScaleBar() {
  const zoom = map.getZoom();
  const center = map.getCenter();
  const metersPerPixel = 156543.03392 * Math.cos(toRad(center.lat)) / Math.pow(2, zoom);
  const targetPx = 96;
  const km = (metersPerPixel * targetPx) / 1000;
  const nice = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200].reduce((a, b) => Math.abs(b - km) < Math.abs(a - km) ? b : a);
  document.getElementById('scaleMaxLabel').textContent = nice >= 1 ? `${nice} km` : `${nice * 1000} m`;
  document.getElementById('scaleMidLabel').textContent = nice >= 1 ? `${(nice / 2)}` : `${(nice * 1000) / 2}`;
}

/* ---------------------------------------------------------
   CLICK PULSE WAVEFRONT ANIMATION
--------------------------------------------------------- */
function triggerClickPulse(coords, severity) {
  const pulseFeature = {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: coords },
    properties: {}
  };

  const pulseSource = map.getSource('click-pulse');
  if (!pulseSource) return;

  pulseSource.setData(featureCollection([pulseFeature]));

  const color = SEVERITY_COLOR[severity] || '#ff4438';
  map.setPaintProperty('click-pulse-layer', 'circle-color', color);
  map.setPaintProperty('click-pulse-layer', 'circle-stroke-color', color);

  if (clickPulseAnimId) cancelAnimationFrame(clickPulseAnimId);

  const duration = 1200;
  const start = performance.now();
  const maxRadius = 38;
  const startRadius = 6;

  function animate(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const easeOut = 1 - Math.pow(1 - progress, 2);

    const currentRadius = startRadius + (maxRadius - startRadius) * easeOut;
    const currentOpacity = (1 - progress) * 0.75;
    const strokeOpacity = (1 - progress) * 0.95;

    if (map && map.getLayer('click-pulse-layer')) {
      map.setPaintProperty('click-pulse-layer', 'circle-radius', currentRadius);
      map.setPaintProperty('click-pulse-layer', 'circle-opacity', currentOpacity);
      map.setPaintProperty('click-pulse-layer', 'circle-stroke-opacity', strokeOpacity);
    }

    if (progress < 1) {
      clickPulseAnimId = requestAnimationFrame(animate);
    } else {
      pulseSource.setData(featureCollection([]));
      clickPulseAnimId = null;
    }
  }

  clickPulseAnimId = requestAnimationFrame(animate);
}

/* ---------------------------------------------------------
   HOTSPOT SELECTION & SPEEDOMETER ANIMATION
--------------------------------------------------------- */
function selectHotspot(id, opts = {}) {
  const h = getHotspotById(id);
  if (!h) return;
  selectedId = id;

  const [lng, lat] = h.geometry.coordinates;

  triggerClickPulse(h.geometry.coordinates, h.properties.severity);

  const circle = circlePolygon(lng, lat, h.properties.riskRadiusKm);
  map.getSource('risk-zone').setData(featureCollection([circle]));

  const near = nearestFacilities(h, 4);
  const lines = near.slice(0, 3).map(n => ({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [h.geometry.coordinates, n.feature.geometry.coordinates] },
    properties: {}
  }));
  map.getSource('proximity-lines').setData(featureCollection(lines));

  fillDetailCard(h, near);

  if (opts.fly !== false) {
    map.flyTo({ center: h.geometry.coordinates, zoom: Math.max(map.getZoom(), 12), speed: 0.9 });
  }
}

function clearSelection() {
  selectedId = null;
  if (clickPulseAnimId) {
    cancelAnimationFrame(clickPulseAnimId);
    clickPulseAnimId = null;
  }
  map.getSource('click-pulse')?.setData(featureCollection([]));
  map.getSource('risk-zone').setData(featureCollection([]));
  map.getSource('proximity-lines').setData(featureCollection([]));

  document.getElementById('selectedSection').classList.add('hidden');
  document.getElementById('overviewSection').classList.remove('hidden');
}

function animateSpeedometer(targetScore) {
  const totalArc = 220;
  const arcEl = document.getElementById('speedoArc');
  const needleGroup = document.getElementById('speedoNeedleGroup');
  const scoreNumEl = document.getElementById('speedoVal');
  const bandTag = document.getElementById('riskBandTag');

  if (currentGaugeAnim) cancelAnimationFrame(currentGaugeAnim);

  const startVal = 0;
  const startTime = performance.now();
  const duration = 850;

  function frame(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);

    const currentScore = Math.round(startVal + (targetScore - startVal) * ease);
    scoreNumEl.textContent = currentScore;

    const offset = totalArc - (currentScore / 100) * totalArc;
    arcEl.style.strokeDashoffset = offset;

    const deg = -90 + (currentScore / 100) * 180;
    needleGroup.setAttribute('transform', `translate(90, 95) rotate(${deg})`);

    if (progress < 1) {
      currentGaugeAnim = requestAnimationFrame(frame);
    } else {
      if (targetScore >= 70) {
        bandTag.textContent = 'HIGH';
        bandTag.style.color = 'var(--red)';
      } else if (targetScore >= 40) {
        bandTag.textContent = 'MODERATE';
        bandTag.style.color = 'var(--amber)';
      } else {
        bandTag.textContent = 'LOW';
        bandTag.style.color = 'var(--green)';
      }
    }
  }

  currentGaugeAnim = requestAnimationFrame(frame);
}

function fillDetailCard(h, nearest) {
  const p = h.properties;
  const color = SEVERITY_COLOR[p.severity] || '#ffffff';

  document.getElementById('overviewSection').classList.add('hidden');
  document.getElementById('selectedSection').classList.remove('hidden');

  const dot = document.getElementById('detailRiskDot');
  const label = document.getElementById('detailRiskLabel');
  dot.style.background = color;
  dot.style.boxShadow = `0 0 6px ${color}`;
  label.textContent = p.severity.toUpperCase() + ' RISK';
  label.style.color = color;

  document.getElementById('detailTitle').textContent = p.name;
  document.getElementById('detailLoc').textContent = p.location;
  const [lng, lat] = h.geometry.coordinates;
  document.getElementById('detailCoords').textContent = `${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E`;

  document.getElementById('statThermal').innerHTML = `${p.thermal} <span class="unit">MW</span>`;
  document.getElementById('statTemp').innerHTML = `${p.temp} <span class="unit">K</span>`;
  document.getElementById('statConf').innerHTML = `${p.confidence}<span class="unit">%</span>`;

  // Animate bike speedometer needle & arc from 0 to target
  animateSpeedometer(p.riskScore || 60);

  const list = document.getElementById('nearestList');
  if (!nearest.length) {
    list.innerHTML = '<div style="font-size:11px; color:var(--text-muted); font-style:italic">No proximate facilities indexed.</div>';
  } else {
    list.innerHTML = nearest.map(n => {
      const iconSvg = SVG_ICONS[n.kind] || SVG_ICONS.industrial;
      return `
        <div class="nearest-item" data-id="${n.feature.properties.id}">
          <span class="ni-name">${iconSvg} ${n.feature.properties.name}</span>
          <span class="ni-dist">${n.distanceKm.toFixed(2)} km</span>
        </div>`;
    }).join('');

    list.querySelectorAll('.nearest-item').forEach(row => {
      row.addEventListener('click', () => {
        const fid = row.dataset.id;
        const all = agniraData.industrialFacilities.features.concat(agniraData.emergencyFacilities.features);
        const f = all.find(x => x.properties.id === fid);
        if (f) map.flyTo({ center: f.geometry.coordinates, zoom: 13.5 });
      });
    });
  }
}

/* ---------------------------------------------------------
   LAYER VISIBILITY & FILTERS
--------------------------------------------------------- */
function setLayerVisible(ids, visible) {
  ids.forEach(id => {
    if (map && map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
  });
}

function applyAllLayerVisibility() {
  const showHotspots = layerVisibility.hotspots && activeFilter !== 'facilities';
  setLayerVisible(['hotspots-circle', 'hotspots-pulse'], showHotspots);
  setLayerVisible(['risk-zone-fill', 'risk-zone-line'], layerVisibility.riskzones);
  setLayerVisible(['industrial-facilities-layer'], layerVisibility.industrial);
  setLayerVisible(['emergency-facilities-layer'], layerVisibility.emergency);
  applyHotspotFilter();
}

function applyHotspotFilter() {
  const conditions = [
    ['<=', ['get', 'ts'], timelineCutoffMs === Infinity ? Number.MAX_SAFE_INTEGER : timelineCutoffMs],
    ['>=', ['get', 'confidence'], minConfidence]
  ];
  if (activeFilter === 'facilities') {
    conditions.push(['==', ['get', 'id'], '__none__']);
  } else if (activeFilter !== 'all') {
    conditions.push(['==', ['get', 'category'], activeFilter]);
  }
  const filter = ['all', ...conditions];
  if (map && map.getLayer('hotspots-circle')) map.setFilter('hotspots-circle', filter);
  if (map && map.getLayer('hotspots-pulse')) map.setFilter('hotspots-pulse', filter);

  updateStatusCounts();
  renderAnalytics();
}

/* ---------------------------------------------------------
   MAP MODES: STANDARD / SATELLITE
--------------------------------------------------------- */
function setMapMode(mode) {
  currentMapMode = mode;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));

  if (mode === 'satellite') {
    document.body.classList.add('mode-satellite-active');
    map.setLayoutProperty('osm-base', 'visibility', 'none');
    map.setLayoutProperty('sat-base', 'visibility', 'visible');
  } else {
    document.body.classList.remove('mode-satellite-active');
    map.setLayoutProperty('sat-base', 'visibility', 'none');
    map.setLayoutProperty('osm-base', 'visibility', 'visible');
  }

  setLayerVisible(['hotspots-circle', 'hotspots-pulse'], layerVisibility.hotspots && activeFilter !== 'facilities');
}

/* ---------------------------------------------------------
   TIMELINE / TEMPORAL PLAYBACK
--------------------------------------------------------- */
function setupTimeline() {
  const times = agniraData.hotspots.features.map(f => f.properties.ts);
  timelineMinMs = Math.min(...times);
  timelineMaxMs = Math.max(...times);
  timelineCutoffMs = timelineMaxMs;

  document.getElementById('timelineTimeStart').textContent = fmtHM(timelineMinMs);
  document.getElementById('timelineTimeEnd').textContent = fmtHM(timelineMaxMs);

  const slider = document.getElementById('timelineSlider');
  slider.value = 100;
  slider.addEventListener('input', () => {
    const pct = Number(slider.value) / 100;
    timelineCutoffMs = timelineMinMs + pct * (timelineMaxMs - timelineMinMs);
    const nowEl = document.getElementById('timelineNow');
    if (pct < 0.99) {
      nowEl.textContent = fmtHM(timelineCutoffMs);
      nowEl.classList.add('scrubbing');
    } else {
      nowEl.textContent = 'LIVE';
      nowEl.classList.remove('scrubbing');
    }
    applyHotspotFilter();
    if (selectedId && !timeFilteredHotspots().some(f => f.properties.id === selectedId)) clearSelection();
  });

  document.getElementById('timelinePlay').addEventListener('click', toggleTimelinePlayback);
}

function fmtHM(ms) {
  return new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function toggleTimelinePlayback() {
  const btn = document.getElementById('timelinePlay');
  timelinePlaying = !timelinePlaying;
  btn.querySelector('.icon-play').style.display = timelinePlaying ? 'none' : '';
  btn.querySelector('.icon-pause').style.display = timelinePlaying ? '' : 'none';
  const slider = document.getElementById('timelineSlider');
  if (timelinePlaying) {
    if (Number(slider.value) >= 100) slider.value = 0;
    timelineTimer = setInterval(() => {
      let v = Number(slider.value) + 1.5;
      if (v >= 100) { v = 100; toggleTimelinePlayback(); }
      slider.value = v;
      slider.dispatchEvent(new Event('input'));
    }, 120);
  } else {
    clearInterval(timelineTimer);
  }
}

function updateStatusCounts() {
  const active = timeFilteredHotspots();
  const highRiskCount = active.filter(f => f.properties.severity === 'critical' || f.properties.severity === 'high').length;
  document.getElementById('activeHotspotsCount').textContent = active.length;
  document.getElementById('highRiskCount').textContent = highRiskCount;
}

function renderAnalytics() {
  const active = timeFilteredHotspots();
  const total = active.length;
  const highRisk = active.filter(f => f.properties.severity === 'high' || f.properties.severity === 'critical').length;
  const avgConfidence = total ? Math.round(active.reduce((s, f) => s + f.properties.confidence, 0) / total) : 0;

  const box = document.getElementById('analyticsStats');
  if (!box) return;
  box.innerHTML = `
    <div class="a-stat"><span class="a-label">Total Hotspots</span><span class="a-value">${total}</span></div>
    <div class="a-stat"><span class="a-label">High/Crit</span><span class="a-value" style="color:var(--red)">${highRisk}</span></div>
    <div class="a-stat"><span class="a-label">Avg Conf</span><span class="a-value">${avgConfidence}%</span></div>
    <div class="a-stat"><span class="a-label">Status</span><span class="a-value" style="color:var(--green)">NOMINAL</span></div>
  `;
}

function renderMiniBars() {
  const active = timeFilteredHotspots();
  const cats = [
    { key: 'industrial', label: 'Industrial', color: 'var(--orange)' },
    { key: 'natural', label: 'Natural', color: 'var(--green)' },
    { key: 'others', label: 'Others', color: 'var(--amber)' }
  ];
  const max = Math.max(...cats.map(c => active.filter(f => f.properties.category === c.key).length), 1);
  const box = document.getElementById('miniBars');
  if (!box) return;
  box.innerHTML = cats.map(c => {
    const count = active.filter(f => f.properties.category === c.key).length;
    return `
      <div class="mini-bar-row">
        <span class="lbl">${c.label}</span>
        <span class="track"><span class="fill" style="width:${(count / max) * 100}%; background:${c.color};"></span></span>
        <span class="val">${count}</span>
      </div>`;
  }).join('');
}

/* ---------------------------------------------------------
   DAY / NIGHT MODE SYSTEM
--------------------------------------------------------- */
const dayNightToggle = document.getElementById('dayNightToggle');
const THEME_KEY = 'agnira-theme-v8';

function applyTheme(mode) {
  const isNight = mode === 'night';
  currentTheme = isNight ? 'night' : 'day';
  document.body.classList.toggle('theme-day', !isNight);
  document.body.classList.toggle('theme-night', isNight);
  dayNightToggle.classList.toggle('is-night', isNight);
  dayNightToggle.classList.toggle('is-day', !isNight);
  dayNightToggle.setAttribute('aria-checked', String(!isNight));
  document.getElementById('modeWord').textContent = isNight ? 'NIGHT' : 'DAY';
  localStorage.setItem(THEME_KEY, currentTheme);
}

applyTheme(localStorage.getItem(THEME_KEY) || 'night');

dayNightToggle.addEventListener('click', () => applyTheme(currentTheme === 'night' ? 'day' : 'night'));
dayNightToggle.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); applyTheme(currentTheme === 'night' ? 'day' : 'night'); }
});

/* ---------------------------------------------------------
   CONTROLS, SEARCH & POPOVERS
--------------------------------------------------------- */


const popovers = {
  layers: document.getElementById('layersPopover'),
  filter: document.getElementById('filterPopover'),
  chart: document.getElementById('chartPopover')
};
const toolButtons = {
  layers: document.getElementById('toolLayers'),
  filter: document.getElementById('toolFilter'),
  chart: document.getElementById('toolChart')
};

function togglePopover(key) {
  const isOpen = popovers[key].classList.contains('show');
  Object.keys(popovers).forEach(k => { popovers[k].classList.remove('show'); toolButtons[k]?.classList.remove('active'); });
  if (!isOpen) { popovers[key].classList.add('show'); toolButtons[key]?.classList.add('active'); }
}

document.getElementById('toolLayers').addEventListener('click', e => { e.stopPropagation(); togglePopover('layers'); });
document.getElementById('toolFilter').addEventListener('click', e => { e.stopPropagation(); togglePopover('filter'); });
document.getElementById('toolChart').addEventListener('click', e => { e.stopPropagation(); renderAnalytics(); renderMiniBars(); togglePopover('chart'); });
document.getElementById('toolLocate').addEventListener('click', () => { map.flyTo({ center: MAP_CENTER, zoom: MAP_ZOOM }); });
document.getElementById('toolFullscreen').addEventListener('click', () => {
  if (!document.fullscreenElement) document.getElementById('app').requestFullscreen?.();
  else document.exitFullscreen?.();
});

document.addEventListener('click', e => {
  if (!Object.values(popovers).some(p => p.contains(e.target))) {
    Object.keys(popovers).forEach(k => { popovers[k].classList.remove('show'); toolButtons[k]?.classList.remove('active'); });
  }
});

document.querySelectorAll('.layer-row input').forEach(input => {
  input.addEventListener('change', () => {
    const layer = input.dataset.layer;
    if (layer in layerVisibility) layerVisibility[layer] = input.checked;
    applyAllLayerVisibility();
  });
});

document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => setMapMode(btn.dataset.mode));
});

const confSlider = document.getElementById('confSlider');
const confValue = document.getElementById('confValue');
confSlider.addEventListener('input', () => {
  minConfidence = Number(confSlider.value);
  confValue.textContent = minConfidence + '%';
  applyHotspotFilter();
});

document.getElementById('detailClose').addEventListener('click', () => clearSelection());

const legendIndicator = document.getElementById('legendIndicator');
function positionLegendIndicator() {
  const active = document.querySelector('#legendOptions .legend-opt.active');
  if (!active || !legendIndicator) return;
  legendIndicator.style.left = active.offsetLeft + 'px';
  legendIndicator.style.width = active.offsetWidth + 'px';
}

document.getElementById('legendOptions').addEventListener('click', e => {
  const btn = e.target.closest('[data-filter]');
  if (!btn) return;
  activeFilter = btn.dataset.filter;
  document.querySelectorAll('#legendOptions [data-filter]').forEach(b => {
    b.classList.toggle('active', b === btn);
    b.classList.toggle('dimmed', activeFilter !== 'all' && b !== btn);
  });
  positionLegendIndicator();
  applyAllLayerVisibility();
});

const navIndicator = document.getElementById('navIndicator');
function positionNavIndicator() {
  const active = document.querySelector('#mainNav a.active');
  if (!active || !navIndicator) return;
  navIndicator.style.left = active.offsetLeft + 'px';
  navIndicator.style.width = active.offsetWidth + 'px';
}

document.getElementById('mainNav').addEventListener('click', e => {
  const link = e.target.closest('a');
  if (!link) return;
  e.preventDefault();
  const page = link.dataset.page;
  const newStage = document.getElementById('page-' + page);
  const oldStage = document.querySelector('.stage:not(.hidden)');

  document.querySelectorAll('#mainNav a').forEach(a => a.classList.toggle('active', a === link));
  positionNavIndicator();

  if (!newStage || newStage === oldStage) return;
  oldStage.classList.add('hidden');
  newStage.classList.remove('hidden');
  if (page === 'Map' && map) setTimeout(() => map.resize(), 50);
});

document.getElementById('exportBtn').addEventListener('click', () => {
  const h = getHotspotById(selectedId);
  if (!h) return;
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(h, null, 2));
  const dlAnchorElem = document.createElement('a');
  dlAnchorElem.setAttribute('href', dataStr);
  dlAnchorElem.setAttribute('download', `incident_${h.properties.id}.geojson`);
  dlAnchorElem.click();
  showToast('GeoJSON exported successfully');
});

let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    searchInput.focus();
  }
});

window.addEventListener('resize', () => {
  positionNavIndicator();
  positionLegendIndicator();
  if (map) map.resize();
});

initMap();
requestAnimationFrame(positionNavIndicator);
requestAnimationFrame(positionLegendIndicator);