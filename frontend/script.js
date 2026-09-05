/* =========================================================
   DATA MODEL  (backend-ready shape — swap the arrays below for
   API responses without touching any rendering code)

   Hotspot: { id, name, location, coordinates:[lng,lat], thermalPower(MW),
              temperature(K), confidence(0-100), severity('HIGH'|'MODERATE'|'LOW'),
              detectedAt, area(km²), type, classification:[{label,val,color}],
              activity:[{color,text,time}] }
   IndustrialCluster: derived from Hotspot via clusterPolygon()
   Facility: { id, name, coordinates:[lng,lat], type, risk }
   SatelliteObservation: { time, hotspotId, text, color }  (see timelineEvents)
   Incident: a Hotspot rendered in the Incidents / Live Feed views
   RiskAssessment: { thermalIntensity, confidence, spreadPotential } — derived
                   per-hotspot in buildRiskAssessment()

   Future backend endpoints this frontend is shaped for:
     GET /hotspots            -> hotspots
     GET /incidents           -> hotspots (time-ordered)
     GET /facilities          -> facilities
     GET /satellite-observations -> timelineEvents
     GET /clusters             -> clusterFeatures
   ========================================================= */
const hotspots = [
  {
    id:'rr', name:'RR Venkatapuram', location:'Kapileswarapuram Road, Visakhapatnam, Andhra Pradesh',
    coordinates:[83.1950, 17.6300], thermalPower:47.2, temperature:312, confidence:88,
    severity:'HIGH', detectedAt:'04 Sep 2025, 19:35 IST', area:2.8, type:'industrial-fire',
    classification:[
      {label:'Industrial Fire', val:54, color:'var(--red)'},
      {label:'Chemical Release (Possible)', val:16, color:'var(--orange)'},
      {label:'Thermal Anomaly (Process)', val:24, color:'var(--amber)'},
      {label:'Vegetation Fire', val:6, color:'var(--green)'}
    ],
    activity:[
      {color:'var(--amber)', text:'Anomaly flagged by Suomi NPP VIIRS', time:'19:21'},
      {color:'var(--red)', text:'Thermal intensity increased', time:'19:35'}
    ]
  },
  {
    id:'atc', name:'Atchutapuram SEZ', location:'Atchutapuram, Visakhapatnam, Andhra Pradesh',
    coordinates:[83.1691, 17.5965], thermalPower:32.6, temperature:298, confidence:81,
    severity:'MODERATE', detectedAt:'04 Sep 2025, 19:42 IST', area:1.9, type:'thermal-anomaly',
    classification:[
      {label:'Industrial Fire', val:31, color:'var(--red)'},
      {label:'Chemical Release (Possible)', val:12, color:'var(--orange)'},
      {label:'Thermal Anomaly (Process)', val:48, color:'var(--amber)'},
      {label:'Vegetation Fire', val:9, color:'var(--green)'}
    ],
    activity:[
      {color:'var(--green)', text:'Detection confirmed by multiple sources', time:'19:30'},
      {color:'var(--amber)', text:'Thermal reading stable', time:'19:42'}
    ]
  },
  {
    id:'para', name:'Parawada Industrial Cluster', location:'Parawada, Visakhapatnam, Andhra Pradesh',
    coordinates:[83.2233, 17.6027], thermalPower:64.8, temperature:326, confidence:94,
    severity:'HIGH', detectedAt:'04 Sep 2025, 19:58 IST', area:4.2, type:'industrial-fire',
    classification:[
      {label:'Industrial Fire', val:62, color:'var(--red)'},
      {label:'Chemical Release (Possible)', val:21, color:'var(--orange)'},
      {label:'Thermal Anomaly (Process)', val:12, color:'var(--amber)'},
      {label:'Vegetation Fire', val:3, color:'var(--green)'}
    ],
    activity:[
      {color:'var(--green)', text:'Detection confirmed by multiple sources', time:'19:58'},
      {color:'var(--red)', text:'Thermal intensity increased', time:'19:42'},
      {color:'var(--amber)', text:'Anomaly flagged by Suomi NPP VIIRS', time:'19:21'}
    ]
  }
];

const facilities = [
  {id:'hpcl', name:'HPCL Visakhapatnam Refinery', coordinates:[83.1966, 17.6531], type:'Refinery', risk:'HIGH'},
  {id:'lt',   name:'L&T Shipbuilding',              coordinates:[83.2100, 17.6400], type:'Shipyard', risk:'MODERATE'},
  {id:'port', name:'Adani Vizag Port',               coordinates:[83.2960, 17.6868], type:'Port', risk:'LOW'},
  {id:'hsl',  name:'Hindustan Shipyard',              coordinates:[83.2907, 17.6910], type:'Shipyard', risk:'LOW'},
  {id:'coro', name:'Coromandel Fertilizers Plant',    coordinates:[83.2020, 17.6250], type:'Chemical Plant', risk:'MODERATE'}
];

const places = {
  'visakhapatnam':[83.2185, 17.6868], 'vizag':[83.2185, 17.6868],
  'parawada':[83.2233, 17.6027],
  'atchutapuram':[83.1691, 17.5965],
  'bheemunipatnam':[83.4483, 17.8905],
  'duvvada':[83.1560, 17.6931],
  'rr venkatapuram':[83.1950, 17.6300]
};

function haversine(a, b){
  const R = 6371;
  const dLat = (b[1]-a[1]) * Math.PI/180;
  const dLng = (b[0]-a[0]) * Math.PI/180;
  const lat1 = a[1] * Math.PI/180, lat2 = b[1] * Math.PI/180;
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1-h));
}
function clusterPolygon(center, r){
  const pts = [];
  const n = 6;
  for(let i=0;i<=n;i++){
    const ang = (i/n) * Math.PI*2 + Math.PI/6;
    pts.push([center[0] + Math.cos(ang)*r*1.3, center[1] + Math.sin(ang)*r]);
  }
  return pts;
}

/* =========================================================
   MAP INIT
   ---------------------------------------------------------
   Wrapped in try/catch so that if the MapLibre library fails
   to load (blocked CDN, offline, corporate firewall, etc.)
   the rest of the dashboard — search, filters, day/night
   toggle, tabs, nav — keeps working instead of the whole
   script silently dying on the very first line.
   ========================================================= */
const mapLibLoaded = typeof maplibregl !== 'undefined';
let map;

function makeStubMap(){
  return {
    on(){}, off(){}, addControl(){}, addSource(){}, addLayer(){},
    setPaintProperty(){}, setLayoutProperty(){}, setFilter(){},
    getLayer(){ return false; },
    getCanvas(){ return {style:{}}; },
    getSource(){ return null; },
    flyTo(){}, easeTo(){}, resize(){},
    getZoom(){ return 10.6; },
    getCenter(){ return {lat:17.6600, lng:83.2050}; }
  };
}

function showMapFallbackNotice(){
  const wrap = document.getElementById('mapWrap');
  if(!wrap) return;
  const notice = document.createElement('div');
  notice.style.cssText = 'position:absolute; inset:0; z-index:9; display:flex; align-items:center; justify-content:center; text-align:center; padding:30px; background:var(--map-land, #050602);';
  notice.innerHTML = `<div style="max-width:360px; color:var(--text-secondary,#A2A39A); font-family:var(--sans,sans-serif); font-size:13px; line-height:1.6;">
    <div style="font-size:26px; margin-bottom:10px;">🗺️</div>
    <div style="color:var(--text-primary,#E8E9E4); font-weight:700; margin-bottom:6px;">Map tiles unavailable</div>
    The MapLibre library couldn't load — likely a blocked script or no internet connection.<br>
    Search, filters, layers, day/night mode and every other control on this page still work normally.
  </div>`;
  wrap.appendChild(notice);
}

try{
  if(!mapLibLoaded) throw new Error('maplibregl failed to load (script blocked or offline).');

  map = new maplibregl.Map({
    container:'maplibre-map',
    style:{
      version:8,
      sources:{
        'osm':{
          type:'raster',
          tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize:256,
          attribution:'© OpenStreetMap contributors'
        }
      },
      layers:[
        {id:'osm-layer', type:'raster', source:'osm',
          paint:{
            'raster-brightness-max':0.32,
            'raster-brightness-min':0,
            'raster-saturation':-0.55,
            'raster-contrast':0.15,
            'raster-hue-rotate':25
          }
        }
      ]
    },
    center:[83.2050, 17.6600],
    zoom:10.6,
    attributionControl:true
  });

  map.addControl(new maplibregl.NavigationControl({showCompass:false}), 'bottom-right');
}catch(err){
  console.error('AGNIRA: map failed to initialize, continuing in degraded (no-map) mode.', err);
  map = makeStubMap();
  showMapFallbackNotice();
}

/* =========================================================
   DAY / NIGHT THEME  (persists to localStorage)
   ========================================================= */
const THEME_KEY = 'agnira-theme';
let currentTheme = localStorage.getItem(THEME_KEY) === 'day' ? 'day' : 'night';
let currentMapStyle = 'satellite';

const stylePresets = {
  night:{
    standard:{brightnessMax:0.28, brightnessMin:0,    saturation:-0.75, contrast:0.05, hue:0,  tint:'rgba(20,20,18,.30)'},
    satellite:{brightnessMax:0.32, brightnessMin:0,    saturation:-0.55, contrast:0.15, hue:25, tint:'rgba(31,32,29,.28)'},
    thermal:{brightnessMax:0.18, brightnessMin:0,    saturation:-0.85, contrast:0.28, hue:0,  tint:'rgba(10,6,4,.42)'}
  },
  day:{
    standard:{brightnessMax:1.25, brightnessMin:0.55, saturation:-0.20, contrast:0.02, hue:0,  tint:'rgba(241,240,234,.08)'},
    satellite:{brightnessMax:1.05, brightnessMin:0.35, saturation:0.05,  contrast:0.08, hue:12, tint:'rgba(214,196,150,.10)'},
    thermal:{brightnessMax:0.85, brightnessMin:0.15, saturation:-0.50, contrast:0.22, hue:0,  tint:'rgba(90,40,20,.16)'}
  }
};
function applyStylePreset(name){
  currentMapStyle = name;
  const p = stylePresets[currentTheme][name];
  document.body.classList.toggle('mode-thermal', name === 'thermal');
  if(!map.getLayer('osm-layer')) return;
  map.setPaintProperty('osm-layer','raster-brightness-max', p.brightnessMax);
  map.setPaintProperty('osm-layer','raster-brightness-min', p.brightnessMin);
  map.setPaintProperty('osm-layer','raster-saturation', p.saturation);
  map.setPaintProperty('osm-layer','raster-contrast', p.contrast);
  map.setPaintProperty('osm-layer','raster-hue-rotate', p.hue);
  document.getElementById('mapTint').style.background = p.tint;
}
function applyTheme(mode){
  currentTheme = mode === 'day' ? 'day' : 'night';
  const isNight = currentTheme === 'night';
  document.body.classList.toggle('theme-day', !isNight);
  dayNightToggle.classList.toggle('is-night', isNight);
  dayNightToggle.classList.toggle('is-day', !isNight);
  dayNightToggle.setAttribute('aria-checked', String(!isNight));
  document.getElementById('modeBadge').textContent = 'MONITORING [' + (isNight ? 'NIGHT' : 'DAY') + ']';
  localStorage.setItem(THEME_KEY, currentTheme);
  applyStylePreset(currentMapStyle);
}
const dayNightToggle = document.getElementById('dayNightToggle');
applyTheme(currentTheme); // reflect persisted/default theme in the topbar before first paint

let selectedId = 'para';
let activeFilters = new Set();
let activeRiskFilters = new Set();
let confidenceThreshold = 65;
const markers = {};      // hotspot markers
const facMarkers = {};   // facility markers
let searchMarker = null;

map.on('load', ()=>{
  applyStylePreset('satellite');

  /* --- Industrial cluster polygons (real GeoJSON layer) --- */
  const clusterFeatures = hotspots.map(h=>({
    type:'Feature',
    properties:{ id:h.id, risk:h.severity, confidence:h.confidence, type:h.type },
    geometry:{ type:'Polygon', coordinates:[clusterPolygon(h.coordinates, h.severity==='HIGH' && h.area>3 ? 0.018 : 0.012)] }
  }));
  map.addSource('clusters', {type:'geojson', data:{type:'FeatureCollection', features:clusterFeatures}});
  map.addLayer({
    id:'clusters-fill', type:'fill', source:'clusters',
    paint:{
      'fill-color':['match', ['get','risk'], 'HIGH', '#FF3B3B', 'MODERATE', '#F5A900', '#FF633D'],
      'fill-opacity':0.10
    }
  });
  map.addLayer({
    id:'clusters-line', type:'line', source:'clusters',
    paint:{
      'line-color':['match', ['get','risk'], 'HIGH', '#FF3B3B', 'MODERATE', '#F5A900', '#FF633D'],
      'line-width':1.5,
      'line-dasharray':[2,2]
    }
  });
  map.on('mouseenter','clusters-fill', ()=> map.getCanvas().style.cursor='pointer');
  map.on('mouseleave','clusters-fill', ()=> map.getCanvas().style.cursor='');
  map.on('click','clusters-fill', (e)=>{
    const id = e.features[0].properties.id;
    selectHotspot(id);
  });

  /* --- Roads & Transport overlay: NH16 corridor --- */
  map.addSource('nh16', {type:'geojson', data:{type:'Feature', geometry:{type:'LineString', coordinates:[
    [83.1400,17.6600],[83.1750,17.6350],[83.2050,17.6100],[83.2300,17.5850],[83.2600,17.5600]
  ]}}});
  map.addLayer({id:'nh16-line', type:'line', source:'nh16', paint:{
    'line-color': getCSSVar('--map-major-roads'), 'line-width':2, 'line-dasharray':[0.2,2]
  }});

  /* --- Water bodies overlay (Bay of Bengal band) --- */
  map.addSource('water', {type:'geojson', data:{type:'Feature', geometry:{type:'Polygon', coordinates:[[
    [83.32,17.50],[83.55,17.50],[83.55,17.95],[83.32,17.95],[83.32,17.50]
  ]]}}});
  map.addLayer({id:'water-fill', type:'fill', source:'water', paint:{
    'fill-color': getCSSVar('--map-water'), 'fill-opacity':0.55
  }}, 'clusters-fill');

  /* --- Administrative boundary (rough district outline) --- */
  map.addSource('admin', {type:'geojson', data:{type:'Feature', geometry:{type:'LineString', coordinates:[
    [83.05,17.50],[83.30,17.45],[83.55,17.60],[83.55,17.95],[83.30,18.00],[83.05,17.85],[83.05,17.50]
  ]}}});
  map.addLayer({id:'admin-line', type:'line', source:'admin', paint:{
    'line-color': getCSSVar('--map-boundaries'), 'line-width':1.2, 'line-dasharray':[3,2]
  }});
  map.setLayoutProperty('admin-line','visibility','none');

  /* --- Population density heatmap (demo) --- */
  map.addSource('population', {type:'geojson', data:{type:'FeatureCollection', features:[
    {type:'Feature', properties:{weight:0.9}, geometry:{type:'Point', coordinates:[83.2185,17.6868]}},
    {type:'Feature', properties:{weight:0.6}, geometry:{type:'Point', coordinates:[83.2050,17.6600]}},
    {type:'Feature', properties:{weight:0.5}, geometry:{type:'Point', coordinates:[83.1691,17.5965]}},
    {type:'Feature', properties:{weight:0.4}, geometry:{type:'Point', coordinates:[83.2960,17.6868]}}
  ]}});
  map.addLayer({id:'population-heat', type:'heatmap', source:'population', paint:{
    'heatmap-weight':['get','weight'],
    'heatmap-intensity':1.1,
    'heatmap-radius':60,
    'heatmap-opacity':0.55,
    'heatmap-color':[
      'interpolate',['linear'],['heatmap-density'],
      0,'rgba(0,0,0,0)',
      0.3, 'rgba(69,71,63,.4)',
      0.6, 'rgba(245,169,0,.45)',
      1, 'rgba(255,99,61,.65)'
    ]
  }});
  map.setLayoutProperty('population-heat','visibility','none');

  /* --- Hotspot markers --- */
  hotspots.forEach(h=>{
    const el = document.createElement('div');
    el.className = 'hs-marker';
    el.dataset.id = h.id;
    const c = h.severity === 'HIGH' ? 'red' : (h.severity==='MODERATE' ? 'amber' : 'orange');
    const glowColor = c==='red' ? 'rgba(255,59,59,.5)' : (c==='amber' ? 'rgba(245,169,0,.45)' : 'rgba(255,99,61,.45)');
    const glowDim = h.area > 3 ? 130 : 95;
    const coreDim = h.area > 3 ? 20 : 13;
    el.innerHTML = `
      <div class="hs-glow" style="width:${glowDim}px; height:${glowDim}px; background:radial-gradient(circle, ${glowColor} 0%, transparent 72%);"></div>
      <div class="hs-core" style="width:${coreDim}px; height:${coreDim}px;"></div>
      <div class="hs-label">
        <div class="name">🔥 ${h.name}</div>
        <div class="meta"><span class="val ${c==='amber'?'amber':''}">${h.thermalPower.toFixed(1)} MW</span> · ${h.severity==='HIGH' ? (h.area>3?'High Risk':'High') : 'Moderate'}</div>
      </div>`;
    el.addEventListener('click', (e)=>{ e.stopPropagation(); selectHotspot(h.id); });
    const marker = new maplibregl.Marker({element:el, anchor:'center'}).setLngLat(h.coordinates).addTo(map);
    markers[h.id] = marker;
  });

  /* --- Facility markers --- */
  facilities.forEach(f=>{
    const el = document.createElement('div');
    el.className = 'fac-marker';
    el.title = f.name;
    el.addEventListener('click', (e)=>{
      e.stopPropagation();
      new maplibregl.Popup({offset:12, closeButton:false})
        .setLngLat(f.coordinates)
        .setHTML(`<b>${f.name}</b><br><span style="color:var(--text-secondary);font-size:11px;">${f.type} · ${f.risk} risk</span>`)
        .addTo(map);
    });
    const marker = new maplibregl.Marker({element:el, anchor:'center'}).setLngLat(f.coordinates).addTo(map);
    facMarkers[f.id] = marker;
  });

  map.on('click', (e)=>{
    if(e.defaultPrevented) return;
  });

  applyThreshold();
  selectHotspot('para');
});

map.on('mousemove', (e)=>{
  document.getElementById('coordReadout').textContent =
    `LAT ${e.lngLat.lat.toFixed(4)} · LNG ${e.lngLat.lng.toFixed(4)} · Z ${map.getZoom().toFixed(1)}`;
});

function getCSSVar(name){
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/* =========================================================
   RIGHT PANEL
   ========================================================= */
function selectHotspot(id, opts){
  opts = opts || {};
  selectedId = id;
  const h = hotspots.find(x=>x.id===id);
  Object.values(markers).forEach(m=>m.getElement().classList.remove('selected'));
  if(markers[id]) markers[id].getElement().classList.add('selected');
  if(opts.fly !== false){
    map.flyTo({center:h.coordinates, zoom:Math.max(map.getZoom(), 12.3), speed:0.9});
  }

  document.getElementById('hsTitle').textContent = h.name;
  document.getElementById('hsLoc').textContent = h.location;
  const badge = document.getElementById('hsRiskBadge');
  badge.textContent = h.severity + ' RISK';
  badge.className = 'risk-badge' + (h.severity!=='HIGH' ? ' amber' : '');
  const flame = document.getElementById('hsFlame');
  flame.className = 'hs-flame' + (h.severity!=='HIGH' ? ' amber' : '');
  document.getElementById('hsPower').innerHTML = h.thermalPower.toFixed(1) + ' <span style="font-size:12px;">MW</span>';
  document.getElementById('hsTemp').innerHTML = h.temperature + ' <span style="font-size:12px;">K</span>';
  document.getElementById('hsConf').textContent = h.confidence + '%';
  document.getElementById('hsDetected').textContent = h.detectedAt;
  document.getElementById('hsArea').textContent = '~' + h.area + ' km²';

  document.getElementById('classificationList').innerHTML = h.classification.map(c=>`
    <div class="class-row">
      <div class="class-label"><span>${c.label}</span><b>${c.val}%</b></div>
      <div class="class-bar-bg"><div class="class-bar" style="width:${c.val}%; background:${c.color};"></div></div>
    </div>`).join('');

  document.getElementById('activityList').innerHTML = h.activity.slice().reverse().map(a=>`
    <div class="act-row"><span class="act-dot" style="background:${a.color};"></span>${a.text}<span class="act-time">${a.time}</span></div>`).join('');

  const nearby = facilities
    .map(f=>({...f, dist:haversine(h.coordinates, f.coordinates)}))
    .filter(f=>f.dist <= 5)
    .sort((a,b)=>a.dist-b.dist);
  document.getElementById('facilitiesList').innerHTML = nearby.map(f=>`
    <div class="fac-row" data-fac="${f.id}"><span class="fac-icon">${f.type==='Port'||f.type==='Shipyard'?'⚓':'🏭'}</span><span class="fac-name">${f.name}</span><span class="fac-dist">${f.dist.toFixed(1)} km</span></div>`).join('')
    || '<div style="color:var(--text-muted); font-size:12.5px;">No facilities within 5 km.</div>';

  document.querySelectorAll('#facilitiesList .fac-row').forEach(row=>{
    row.addEventListener('click', ()=>{
      const f = facilities.find(x=>x.id===row.dataset.fac);
      map.flyTo({center:f.coordinates, zoom:13.5});
      Object.entries(facMarkers).forEach(([fid,m])=> m.getElement().classList.toggle('highlight', fid===f.id));
      setTimeout(()=>{ if(facMarkers[f.id]) facMarkers[f.id].getElement().classList.remove('highlight'); }, 3000);
    });
  });

  buildRiskAssessment(h);
  buildWhyList(h, nearby);
  buildImageryGrid(h);
}

function buildRiskAssessment(h){
  const thermalPct = Math.min(100, Math.round((h.thermalPower/70)*100));
  const spreadLabel = h.area > 3 ? 'HIGH' : (h.area > 2 ? 'MODERATE' : 'LOW');
  const spreadPct = spreadLabel === 'HIGH' ? 82 : (spreadLabel === 'MODERATE' ? 52 : 26);
  const rows = [
    {label:'Thermal Intensity', val:thermalPct, tag:h.severity, color: h.severity==='HIGH' ? 'var(--red)' : 'var(--amber)'},
    {label:'Confidence', val:h.confidence, tag:h.confidence+'%', color:'var(--green)'},
    {label:'Spread Potential', val:spreadPct, tag:spreadLabel, color: spreadLabel==='HIGH' ? 'var(--red)' : (spreadLabel==='MODERATE' ? 'var(--amber)' : 'var(--green)')}
  ];
  document.getElementById('riskAssessment').innerHTML = rows.map(r=>`
    <div class="class-row">
      <div class="class-label"><span>${r.label}</span><b>${r.tag}</b></div>
      <div class="class-bar-bg"><div class="class-bar" style="width:${r.val}%; background:${r.color};"></div></div>
    </div>`).join('');
}

function buildWhyList(h, nearby){
  const bullets = [];
  bullets.push(h.severity === 'HIGH'
    ? `Thermal output of ${h.thermalPower.toFixed(1)} MW exceeds the regional monitoring baseline for this zone.`
    : `Thermal output of ${h.thermalPower.toFixed(1)} MW is elevated relative to the surrounding area's baseline.`);
  bullets.push(`Located within a mapped industrial cluster classified as ${h.type.replace('-', ' ')}.`);
  bullets.push(nearby.length
    ? `${nearby.length} industrial ${nearby.length===1?'facility is':'facilities are'} located within 5 km, including ${nearby[0].name} (${nearby[0].dist.toFixed(1)} km).`
    : 'No major industrial facilities detected within 5 km of this anomaly.');
  bullets.push(`Detection confidence of ${h.confidence}% classifies this as a ${h.confidence>=90?'high-confidence':'moderate-confidence'} anomaly.`);
  document.getElementById('whyList').innerHTML = bullets.map(b=>`<li>${b}</li>`).join('')
    + '<li style="color:var(--text-muted); font-size:11px;">Analysis generated from a demo VIIRS dataset, for illustrative purposes only.</li>';
}

function buildImageryGrid(h){
  const bands = ['M13', 'M11', 'I05'];
  const times = [...new Set(h.activity.map(a=>a.time).concat([latestTimeStr(h)]))]
    .sort((a,b)=> timeToMinutes(b) - timeToMinutes(a)).slice(0,4);
  const grid = document.getElementById('imageryGrid');
  grid.innerHTML = times.map((t,i)=>{
    const hot = i % 2 === 0;
    return `<div class="imagery-tile ${hot?'hot':''} ${i===0?'sel':''}">${t} · ${bands[i % bands.length]}</div>`;
  }).join('');
  grid.querySelectorAll('.imagery-tile').forEach(tile=>{
    tile.addEventListener('click', ()=>{
      grid.querySelectorAll('.imagery-tile').forEach(t=>t.classList.remove('sel'));
      tile.classList.add('sel');
    });
  });
  document.getElementById('imgHotspotName').textContent = h.name;
  document.getElementById('imageryMeta').textContent = `Sensor: Suomi NPP / NOAA-20 VIIRS · Confidence ${h.confidence}% · Resolution 375 m`;
}

/* =========================================================
   TABS
   ========================================================= */
document.querySelectorAll('.tab').forEach(tab=>{
  tab.addEventListener('click', ()=>{
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    ['layers','filters','time'].forEach(name=>{
      document.getElementById('tab-'+name).classList.toggle('hidden', name !== tab.dataset.tab);
    });
  });
});
document.querySelectorAll('.rtab').forEach(tab=>{
  tab.addEventListener('click', ()=>{
    document.querySelectorAll('.rtab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    ['overview','imagery','facilities'].forEach(name=>{
      document.getElementById('rtab-'+name).classList.toggle('hidden', name !== tab.dataset.rtab);
    });
  });
});

/* =========================================================
   LAYER TOGGLES (real MapLibre layers + markers)
   ========================================================= */
document.querySelectorAll('.layer-row').forEach(row=>{
  row.addEventListener('click', ()=>{
    const chk = row.querySelector('.chk');
    const on = chk.classList.toggle('on');
    chk.textContent = on ? '✓' : '';
    row.classList.toggle('dim', !on);
    const layer = row.dataset.layer;
    const vis = on ? 'visible' : 'none';

    if(layer === 'heat'){
      Object.values(markers).forEach(m=> m.getElement().style.display = on ? '' : 'none');
    } else if(layer === 'clusters'){
      if(map.getLayer('clusters-fill')) map.setLayoutProperty('clusters-fill','visibility',vis);
      if(map.getLayer('clusters-line')) map.setLayoutProperty('clusters-line','visibility',vis);
    } else if(layer === 'facilities'){
      Object.values(facMarkers).forEach(m=> m.getElement().style.display = on ? '' : 'none');
    } else if(layer === 'population'){
      if(map.getLayer('population-heat')) map.setLayoutProperty('population-heat','visibility',vis);
    } else if(layer === 'roads'){
      if(map.getLayer('nh16-line')) map.setLayoutProperty('nh16-line','visibility',vis);
    } else if(layer === 'admin'){
      if(map.getLayer('admin-line')) map.setLayoutProperty('admin-line','visibility',vis);
    } else if(layer === 'water'){
      if(map.getLayer('water-fill')) map.setLayoutProperty('water-fill','visibility',vis);
    }
  });
});

/* =========================================================
   QUICK FILTERS
   ========================================================= */
document.querySelectorAll('.quick-filter[data-filter]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    btn.classList.toggle('active');
    const f = btn.dataset.filter;
    if(activeFilters.has(f)) activeFilters.delete(f); else activeFilters.add(f);
    applyThreshold();
  });
});

/* =========================================================
   RISK-LEVEL FILTERS (Filters tab)
   ========================================================= */
document.querySelectorAll('.quick-filter[data-risk]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    btn.classList.toggle('active');
    const r = btn.dataset.risk;
    if(activeRiskFilters.has(r)) activeRiskFilters.delete(r); else activeRiskFilters.add(r);
    applyThreshold();
  });
});

/* =========================================================
   CONFIDENCE THRESHOLD (real filtering)
   ========================================================= */
const sliderTrack = document.getElementById('sliderTrack');
const sliderFill = document.getElementById('sliderFill');
const sliderHandle = document.getElementById('sliderHandle');
const thresholdVal = document.getElementById('thresholdVal');
let sliderDragging = false;

function setSlider(pct){
  pct = Math.max(0, Math.min(100, pct));
  confidenceThreshold = Math.round(pct);
  sliderFill.style.width = pct + '%';
  sliderHandle.style.left = pct + '%';
  thresholdVal.textContent = confidenceThreshold + '%';
  applyThreshold();
}
function passesAllFilters(h){
  const passesConfidence = h.confidence >= confidenceThreshold;
  const passesFilter = activeFilters.size === 0 || activeFilters.has(h.type);
  const passesRisk = activeRiskFilters.size === 0 || activeRiskFilters.has(h.severity);
  const passesReveal = !revealedSet || revealedSet.has(h.id);
  return passesConfidence && passesFilter && passesRisk && passesReveal;
}
function applyThreshold(){
  hotspots.forEach(h=>{
    const visible = passesAllFilters(h);
    if(markers[h.id]){
      markers[h.id].getElement().classList.toggle('faded', !visible);
      markers[h.id].getElement().style.pointerEvents = visible ? '' : 'none';
    }
  });
  if(map.getLayer('clusters-fill')){
    const visibleIds = hotspots.filter(passesAllFilters).map(h=>h.id);
    const filterExpr = ['in', ['get','id'], ['literal', visibleIds]];
    map.setFilter('clusters-fill', filterExpr);
    map.setFilter('clusters-line', filterExpr);
  }
  updateHud();
}
function updateHud(){
  const visible = hotspots.filter(passesAllFilters);
  document.getElementById('hudActive').textContent = String(visible.length).padStart(2,'0');
  document.getElementById('hudHigh').textContent = String(visible.filter(h=>h.severity==='HIGH').length).padStart(2,'0');
}
sliderTrack.addEventListener('mousedown', (e)=>{
  sliderDragging = true;
  const rect = sliderTrack.getBoundingClientRect();
  setSlider(((e.clientX - rect.left) / rect.width) * 100);
});
window.addEventListener('mousemove', (e)=>{
  if(!sliderDragging) return;
  const rect = sliderTrack.getBoundingClientRect();
  setSlider(((e.clientX - rect.left) / rect.width) * 100);
});
window.addEventListener('mouseup', ()=> sliderDragging = false);

/* =========================================================
   TIME TAB — real observation timeline & playback
   ========================================================= */
function timeToMinutes(t){ const [hh,mm] = t.split(':').map(Number); return hh*60+mm; }
function latestTimeStr(h){ const m = h.detectedAt.match(/(\d{2}:\d{2})/); return m ? m[1] : '00:00'; }

const timelineEvents = [];
hotspots.forEach(h=> h.activity.forEach(a=> timelineEvents.push({time:a.time, text:a.text, color:a.color, hotspotId:h.id, hotspotName:h.name})));
timelineEvents.sort((a,b)=> timeToMinutes(a.time) - timeToMinutes(b.time));

let obsIndex = timelineEvents.length - 1; // default: fully revealed (live state)
let revealedSet = null;                    // null => show everything (default live view)
let playing = false;
let playTimer = null;

function timePct(t){
  const mins = timeToMinutes(t), startMin = 18*60, endMin = 20*60;
  return Math.max(0, Math.min(100, ((mins-startMin)/(endMin-startMin))*100));
}
function pctToObsIndex(pct){
  const mins = 18*60 + (pct/100)*120;
  let idx = -1;
  for(let i=0;i<timelineEvents.length;i++){ if(timeToMinutes(timelineEvents[i].time) <= mins) idx = i; else break; }
  return idx;
}
function renderObsLog(){
  document.getElementById('obsLog').innerHTML = timelineEvents.map((ev,i)=>`
    <div class="obs-item ${i===obsIndex?'current':''}"><span>${ev.time}</span><span>${ev.hotspotName} — ${ev.text}</span></div>`).join('');
}
function applyObsState(){
  const timeFill = document.getElementById('timeFill');
  const timeHandle = document.getElementById('timeHandle');
  const cursor = document.getElementById('timeCursor');
  let pct, label;
  if(obsIndex < 0){ pct = 0; label = '18:00 IST'; }
  else { pct = timePct(timelineEvents[obsIndex].time); label = timelineEvents[obsIndex].time + ' IST'; }
  timeFill.style.width = pct + '%';
  timeHandle.style.left = pct + '%';
  cursor.textContent = label;

  if(obsIndex >= timelineEvents.length - 1 && !playing){
    revealedSet = null; // fully caught up -> treat as live/default state
  } else {
    revealedSet = new Set();
    for(let i=0;i<=obsIndex;i++) revealedSet.add(timelineEvents[i].hotspotId);
  }
  applyThreshold();
  renderObsLog();
  renderLiveFeed(revealedSet);
}
function startPlayback(){
  playing = true;
  document.getElementById('playBtn').classList.add('playing');
  document.getElementById('playIcon').textContent = '⏸';
  document.getElementById('playLabel').textContent = 'PAUSE';
  if(obsIndex >= timelineEvents.length - 1) obsIndex = -1;
  applyObsState();
  playTimer = setInterval(()=>{
    obsIndex++;
    if(obsIndex >= timelineEvents.length){ stopPlayback(); applyObsState(); return; }
    applyObsState();
  }, 1400);
}
function stopPlayback(){
  playing = false;
  clearInterval(playTimer);
  document.getElementById('playBtn').classList.remove('playing');
  document.getElementById('playIcon').textContent = '▶';
  document.getElementById('playLabel').textContent = 'PLAY';
}
document.getElementById('playBtn').addEventListener('click', ()=>{
  playing ? stopPlayback() : startPlayback();
});

const timeTrack = document.getElementById('timeTrack');
let timeDragging = false;
function scrub(pct){ obsIndex = pctToObsIndex(Math.max(0, Math.min(100, pct))); applyObsState(); }
timeTrack.addEventListener('mousedown', (e)=>{
  timeDragging = true; stopPlayback();
  const rect = timeTrack.getBoundingClientRect();
  scrub(((e.clientX - rect.left) / rect.width) * 100);
});
window.addEventListener('mousemove', (e)=>{
  if(!timeDragging) return;
  const rect = timeTrack.getBoundingClientRect();
  scrub(((e.clientX - rect.left) / rect.width) * 100);
});
window.addEventListener('mouseup', ()=> timeDragging = false);
renderObsLog();

/* =========================================================
   MAP VIEW STYLE PRESETS
   ========================================================= */
document.querySelectorAll('.mv-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.mv-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    applyStylePreset(btn.dataset.style);
  });
});

/* =========================================================
   DAY / NIGHT toggle click (theme + map style defined near map init)
   ========================================================= */
dayNightToggle.addEventListener('click', ()=>{
  applyTheme(currentTheme === 'night' ? 'day' : 'night');
});
dayNightToggle.addEventListener('keydown', (e)=>{
  if(e.key === 'Enter' || e.key === ' '){
    e.preventDefault();
    applyTheme(currentTheme === 'night' ? 'day' : 'night');
  }
});

/* =========================================================
   THUMBNAIL EXPAND + VIEW ALL ACTIVITY
   ========================================================= */
document.getElementById('expandThumb').addEventListener('click', (e)=>{
  const thumb = e.currentTarget.closest('.block').querySelector('.thumb');
  thumb.classList.toggle('thumb-zoomed');
});
document.getElementById('viewAllActivity').addEventListener('click', (e)=>{
  e.preventDefault();
  document.querySelector('.nav a[data-nav="Incidents"]').click();
});
document.querySelector('.icon-btn').addEventListener('click', ()=>{
  document.querySelector('.nav a[data-nav="Incidents"]').click();
});

/* =========================================================
   COLLAPSE / CLOSE
   ========================================================= */
document.getElementById('collapseBtn').addEventListener('click', ()=>{
  document.getElementById('leftPanel').classList.add('collapsed');
  document.getElementById('panelReopen').classList.add('show');
  setTimeout(()=> map.resize(), 200);
});
document.getElementById('panelReopen').addEventListener('click', ()=>{
  document.getElementById('leftPanel').classList.remove('collapsed');
  document.getElementById('panelReopen').classList.remove('show');
  setTimeout(()=> map.resize(), 200);
});
document.getElementById('closePanel').addEventListener('click', ()=>{
  document.querySelector('.right').classList.toggle('hidden');
  setTimeout(()=> map.resize(), 50);
});

/* =========================================================
   LIVE FEED (data-driven, same dataset as the map)
   ========================================================= */
function renderLiveFeed(filterSet){
  const list = filterSet ? hotspots.filter(h=>filterSet.has(h.id)) : hotspots;
  const sorted = list.slice().sort((a,b)=> timeToMinutes(latestTimeStr(b)) - timeToMinutes(latestTimeStr(a)));
  const container = document.getElementById('liveFeedItems');
  container.innerHTML = sorted.map(h=>`
    <div class="status-item" data-select="${h.id}">● ${latestTimeStr(h)} <b>${h.name}</b> – ${h.severity==='HIGH'?'High':'Moderate'} thermal activity (${h.thermalPower.toFixed(1)} MW)</div>`).join('')
    || '<span style="color:var(--text-muted);">No incidents in the current observation window.</span>';
  container.querySelectorAll('.status-item[data-select]').forEach(item=>{
    item.addEventListener('click', ()=> goToLiveMapAndSelect(item.dataset.select));
  });
}
function goToLiveMapAndSelect(id){
  document.querySelector('.nav a[data-nav="Live Map"]').click();
  document.querySelector('.right').classList.remove('hidden');
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.querySelector('.tab[data-tab="layers"]').classList.add('active');
  ['layers','filters','time'].forEach(name=> document.getElementById('tab-'+name).classList.toggle('hidden', name!=='layers'));
  setTimeout(()=> selectHotspot(id), 60);
}
renderLiveFeed(null);

/* =========================================================
   SEARCH (place names + lat/lng, flyTo)
   ========================================================= */
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
  if(searchMarker){ searchMarker.remove(); searchMarker = null; }
  if(focusAfter) searchInput.focus();
}

searchInput.addEventListener('focus', ()=> searchHint.classList.add('show'));
searchInput.addEventListener('blur', ()=> setTimeout(()=>searchHint.classList.remove('show'), 150));
searchInput.addEventListener('input', updateSearchClearVisibility);

searchClear.addEventListener('click', ()=> clearSearch(true));

searchInput.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape'){ clearSearch(false); searchInput.blur(); return; }
  if(e.key !== 'Enter') return;
  const q = e.target.value.trim();
  if(!q){ clearSearch(true); return; }
  const qLower = q.toLowerCase();

  const latLngMatch = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  let target = null;

  if(latLngMatch){
    const lat = parseFloat(latLngMatch[1]);
    const lng = parseFloat(latLngMatch[2]);
    target = [lng, lat];
  } else if(places[qLower]){
    target = places[qLower];
  } else {
    const hotspotMatch = hotspots.find(h => h.name.toLowerCase().includes(qLower));
    if(hotspotMatch){ target = hotspotMatch.coordinates; if(hotspotMatch){ selectHotspot(hotspotMatch.id); document.querySelector('.right').classList.remove('hidden'); } }
    else {
      const placeKey = Object.keys(places).find(k => k.includes(qLower) || qLower.includes(k));
      if(placeKey) target = places[placeKey];
    }
  }

  if(target){
    map.flyTo({center:target, zoom:13});
    if(searchMarker) searchMarker.remove();
    if(mapLibLoaded){
      const el = document.createElement('div');
      el.className = 'search-marker';
      searchMarker = new maplibregl.Marker({element:el, anchor:'bottom'}).setLngLat(target).addTo(map);
    }
  } else {
    searchHint.textContent = `No match for "${q}". Try a place name or "lat, lng".`;
    searchHint.classList.add('show');
  }
});

/* =========================================================
   RESET VIEWPORT
   ========================================================= */
document.getElementById('resetViewport').addEventListener('click', ()=>{
  map.flyTo({center:[83.2050, 17.6600], zoom:10.6, bearing:0, pitch:0});
});

/* =========================================================
   NAV — real page switching
   ========================================================= */
const otherPages = ['Incidents','Analytics','Satellites','Reports'];
document.querySelectorAll('.nav a').forEach(a=>{
  a.addEventListener('click', ()=>{
    document.querySelectorAll('.nav a').forEach(n=>n.classList.remove('active'));
    a.classList.add('active');
    const page = a.dataset.nav;
    document.querySelector('.main').classList.toggle('hidden', page !== 'Live Map');
    otherPages.forEach(p=>{
      const el = document.getElementById('page-'+p);
      if(el) el.classList.toggle('hidden', page !== p);
    });
    if(page === 'Live Map') setTimeout(()=> map.resize(), 60);
    else if(page === 'Incidents') renderIncidentsPage();
    else if(page === 'Analytics') renderAnalyticsPage();
    else if(page === 'Reports') renderReportsPage();
    else if(page === 'Satellites') renderSatellitesPage();
  });
});

function renderIncidentsPage(){
  const rows = hotspots.slice().sort((a,b)=> timeToMinutes(latestTimeStr(b)) - timeToMinutes(latestTimeStr(a)));
  document.getElementById('incidentsTableBody').innerHTML = rows.map(h=>`
    <tr data-id="${h.id}">
      <td>${latestTimeStr(h)} IST</td>
      <td style="color:var(--text-primary); font-family:var(--sans);">${h.name}</td>
      <td>${h.type.replace('-', ' ')}</td>
      <td>${h.thermalPower.toFixed(1)} MW</td>
      <td>${h.confidence}%</td>
      <td><span class="pill ${h.severity==='HIGH'?'red':'amber'}">${h.severity}</span></td>
    </tr>`).join('');
  document.querySelectorAll('#incidentsTableBody tr').forEach(row=>{
    row.addEventListener('click', ()=> goToLiveMapAndSelect(row.dataset.id));
  });
}

function renderAnalyticsPage(){
  document.getElementById('anTotal').textContent = hotspots.length;
  document.getElementById('anHigh').textContent = hotspots.filter(h=>h.severity==='HIGH').length;
  document.getElementById('anMod').textContent = hotspots.filter(h=>h.severity!=='HIGH').length;
  document.getElementById('anPower').textContent = hotspots.reduce((s,h)=>s+h.thermalPower,0).toFixed(1) + ' MW';
  document.getElementById('anPeak').textContent = Math.max(...hotspots.map(h=>h.thermalPower)).toFixed(1) + ' MW';
  document.getElementById('anConf').textContent = Math.round(hotspots.reduce((s,h)=>s+h.confidence,0)/hotspots.length) + '%';

  const agg = {};
  hotspots.forEach(h=> h.classification.forEach(c=>{ agg[c.label] = (agg[c.label]||0) + c.val; }));
  const total = Object.values(agg).reduce((a,b)=>a+b,0) || 1;
  document.getElementById('anBreakdown').innerHTML = '<div class="pc-title">By Classification</div>' +
    Object.entries(agg).map(([label,val])=>`<div class="pc-row"><span>${label}</span><b style="color:var(--text-primary)">${Math.round(val/total*100)}%</b></div>`).join('');
}

function renderReportsPage(){
  document.getElementById('reportsGrid').innerHTML = hotspots.map(h=>`
    <div class="page-card">
      <div class="pc-title">${h.name} <span class="pill ${h.severity==='HIGH'?'red':'amber'}">${h.severity}</span></div>
      <div class="pc-row"><span>Detected</span><span>${h.detectedAt}</span></div>
      <div class="pc-row"><span>Thermal Power</span><span>${h.thermalPower.toFixed(1)} MW</span></div>
      <div class="pc-row"><span>Confidence</span><span>${h.confidence}%</span></div>
      <div class="pc-row"><span>Area</span><span>~${h.area} km²</span></div>
      <button class="reset-link" data-id="${h.id}" style="margin-top:10px; color:var(--orange);">↗ Open on Live Map</button>
    </div>`).join('');
  document.querySelectorAll('#reportsGrid button[data-id]').forEach(btn=>{
    btn.addEventListener('click', ()=> goToLiveMapAndSelect(btn.dataset.id));
  });
}

function renderSatellitesPage(){
  const times = hotspots.map(h=>latestTimeStr(h)).sort((a,b)=>timeToMinutes(a)-timeToMinutes(b));
  document.getElementById('satPass1').textContent = times[times.length-1] + ' IST';
  document.getElementById('satPass2').textContent = times[0] + ' IST';
}

/* =========================================================
   CLOCK
   ========================================================= */
function updateClock(){
  const now = new Date();
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const hh = String(now.getHours()).padStart(2,'0');
  const mm = String(now.getMinutes()).padStart(2,'0');
  document.getElementById('clock').textContent = days[now.getDay()] + ', ' + hh + ':' + mm;
  if(!revealedSet){ document.getElementById('hudTime').textContent = hh + ':' + mm + ' IST'; }
}
updateClock();
setInterval(updateClock, 30000);

map.on('move', ()=>{
  const c = map.getCenter();
  document.getElementById('coordReadout').textContent =
    `LAT ${c.lat.toFixed(4)} · LNG ${c.lng.toFixed(4)} · Z ${map.getZoom().toFixed(1)}`;
});

window.addEventListener('resize', ()=> map.resize());
