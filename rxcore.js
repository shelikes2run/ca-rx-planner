/* rxcore.js — shared logic for the CA Prescribed Fire Planner tools (burn evaluator, smoke screening, compare/rank).
   Browser-only, no keys. Exposes window.RX. */
(function () {
'use strict';
const RX = {};
RX.TZ = 'America/Los_Angeles';
RX.UNITS_SVC = 'https://gis.reshapewildfire.org/arcgis/rest/services/Hosted/Treatment_Index_View/FeatureServer/0';
RX.L = {
  air: 'https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services/BurnPermits_AirDistrictBoundaries/FeatureServer/0',
  class1: 'https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/Mandatory_Class1_Federal_Areas/FeatureServer/0',
  schools: 'https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/Public_Schools/FeatureServer/3',
  hospitals: 'https://services2.arcgis.com/C8EMgrsFcRFL6LrL/arcgis/rest/services/Hospitals/FeatureServer/0',
  places: 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer'
};
const esc = RX.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
RX.clean = v => { if (v == null) return null; const s = String(v).trim(); return (!s || /^\{.*\}$/.test(s) || /^(none|null|undefined)$/i.test(s)) ? null : s; };
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
RX.compass = d => d == null || isNaN(d) ? '–' : COMPASS[Math.round(((d % 360) + 360) % 360 / 22.5) % 16];

// ---------- geodesy (miles) ----------
const R = 3958.8, rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
RX.dest = (lat, lon, brg, mi) => { const d = mi / R, b = rad(brg), p1 = rad(lat), l1 = rad(lon); const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b)); return [deg(p2), deg(l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2)))]; };
RX.dist = (a, b) => { const dp = rad(b[0] - a[0]), dl = rad(b[1] - a[1]); const h = Math.sin(dp / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dl / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
RX.bearing = (a, b) => { const p1 = rad(a[0]), p2 = rad(b[0]), dl = rad(b[1] - a[1]); return (deg(Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl))) + 360) % 360; };
RX.inPoly = (pt, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [yi, xi] = ring[i], [yj, xj] = ring[j]; if (((yi > pt[0]) !== (yj > pt[0])) && (pt[1] < (xj - xi) * (pt[0] - yi) / (yj - yi) + xi)) c = !c; } return c; };
// distance from pt to a polyline, plus the along-path distance of the nearest point
RX.nearOnPath = (pt, path) => { let best = { d: Infinity, along: 0 }, run = 0;
  if (path.length === 1) return { d: RX.dist(pt, path[0]), along: 0 };
  for (let i = 0; i < path.length - 1; i++) { const a = path[i], b = path[i + 1], seg = RX.dist(a, b);
    for (let k = 0; k <= 8; k++) { const q = [a[0] + (b[0] - a[0]) * k / 8, a[1] + (b[1] - a[1]) * k / 8]; const d = RX.dist(pt, q); if (d < best.d) best = { d, along: run + seg * k / 8 }; }
    run += seg; }
  return best; };
RX.pathLen = p => p.reduce((a, q, i) => i ? a + RX.dist(p[i - 1], q) : 0, 0);
RX.meanBearing = arr => { const s = arr.reduce((a, d) => [a[0] + Math.sin(rad(d)), a[1] + Math.cos(rad(d))], [0, 0]); return (deg(Math.atan2(s[0], s[1])) + 360) % 360; };

// ---------- units ----------
const ringArea = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return a / 2; };
RX.centroid = rings => {
  let best = null, bA = -1; for (const r of rings) { const a = Math.abs(ringArea(r)); if (a > bA) { bA = a; best = r; } }
  if (!best || !best.length) return null; let cx = 0, cy = 0, A = 0;
  for (let i = 0, j = best.length - 1; i < best.length; j = i++) { const f = best[j][0] * best[i][1] - best[i][0] * best[j][1]; cx += (best[j][0] + best[i][0]) * f; cy += (best[j][1] + best[i][1]) * f; A += f; }
  if (Math.abs(A) < 1e-12) { const n = best.length; return { lon: best.reduce((s, p) => s + p[0], 0) / n, lat: best.reduce((s, p) => s + p[1], 0) / n }; }
  return { lon: cx / (3 * A), lat: cy / (3 * A) };
};
// planar acres from lon/lat rings (good to a few % at unit scale)
RX.acresOf = rings => { let tot = 0; for (const r of rings) { if (r.length < 3) continue; const lat0 = r.reduce((s, p) => s + p[1], 0) / r.length; const kx = 69.172 * Math.cos(rad(lat0)), ky = 69.0; tot += Math.abs(ringArea(r.map(p => [p[0] * kx, p[1] * ky]))); } return tot * 640; };
RX.makeUnit = (rings, name, attrs = {}) => { const c = RX.centroid(rings); if (!c || !isFinite(c.lat)) return null;
  return { id: attrs.objectid ?? null, name: name || 'Unit', lat: c.lat, lon: c.lon, rings, acres: attrs.acres || RX.acresOf(rings) || null, type: attrs.type || null, agency: attrs.agency || null, attrs }; };
const nameKey = p => Object.keys(p || {}).find(k => /^(unit_?name|name|burn_?unit|unit|label)$/i.test(k));
// every feature in a GeoJSON becomes its own unit (multi-unit shapefiles for compare)
RX.unitsFromGeoJSON = (g, base = 'Unit') => {
  const fc = Array.isArray(g) ? g.flatMap(x => x.features || []) : g.type === 'FeatureCollection' ? g.features : g.type === 'Feature' ? [g] : [{ type: 'Feature', geometry: g, properties: {} }];
  const out = [];
  fc.forEach((f, i) => { const geom = f.geometry; if (!geom) return; const rings = [];
    if (geom.type === 'Polygon') rings.push(...geom.coordinates); else if (geom.type === 'MultiPolygon') geom.coordinates.forEach(p => rings.push(...p)); else if (geom.type === 'Point') rings.push([geom.coordinates]); else return;
    const p = f.properties || {}; const k = nameKey(p);
    const u = RX.makeUnit(rings, (k && RX.clean(p[k])) || `${base} ${i + 1}`, { ...p, acres: +p.acres || +p.ACRES || +p.GIS_ACRES || null, type: p.type || p.TYPE || null });
    if (u) { u.rxFromAttrs = RX.rxFromAttrs(p); out.push(u); } });
  return out;
};
RX.unitsFromKML = text => { const doc = new DOMParser().parseFromString(text, 'text/xml'); const out = [];
  doc.querySelectorAll('Placemark').forEach((pm, i) => { const rings = [];
    pm.querySelectorAll('Polygon outerBoundaryIs coordinates, Point coordinates').forEach(el => { const pts = el.textContent.trim().split(/\s+/).map(s => s.split(',').map(Number)).filter(p => p.length >= 2 && p.every(isFinite)).map(p => [p[0], p[1]]); if (pts.length) rings.push(pts); });
    const nm = pm.querySelector('name'); const u = RX.makeUnit(rings, (nm && RX.clean(nm.textContent)) || `Unit ${i + 1}`); if (u) out.push(u); });
  return out; };
RX.unitsFromFile = async file => {
  const base = file.name.replace(/\.[^.]+$/, '');
  if (/\.zip$/i.test(file.name)) { if (typeof shp !== 'function') throw new Error('Shapefile reader did not load. Try GeoJSON or KML.'); return RX.unitsFromGeoJSON(await shp(await file.arrayBuffer()), base); }
  if (/\.kml$/i.test(file.name)) return RX.unitsFromKML(await file.text());
  return RX.unitsFromGeoJSON(JSON.parse(await file.text()), base);
};
RX.unitById = async (id, svc = RX.UNITS_SVC) => {
  const j = await fetch(`${svc}/query?where=${encodeURIComponent('objectid=' + id)}&outFields=objectid,name,acres,type,agency,status&returnGeometry=true&outSR=4326&f=json`).then(r => r.json());
  const f = j.features && j.features[0]; if (!f || !f.geometry) throw new Error(`Unit ${id} was not found in the treatment layer.`);
  const g = f.geometry; return RX.makeUnit(g.rings || [[[g.x, g.y]]], RX.clean(f.attributes.name) || 'Unit ' + id, f.attributes);
};
RX.searchUnits = async q => {
  const where = `UPPER(name) LIKE '%${q.toUpperCase().replace(/'/g, "''")}%'`;
  const j = await fetch(`${RX.UNITS_SVC}/query?where=${encodeURIComponent(where)}&geometry=-124.6,32.4,-114,42.1&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=objectid,name,agency,type,acres&returnGeometry=false&resultRecordCount=25&f=json`).then(r => r.json()).catch(() => ({}));
  return (j.features || []).map(f => ({ ...f.attributes, label: `${f.attributes.name} · ${f.attributes.agency || ''} · #${f.attributes.objectid}` }));
};

// ---------- prescriptions ----------
RX.RX_KEYS = ['minT', 'maxT', 'minRH', 'maxRH', 'maxW', 'maxG', 'minV', 'bpS', 'bpE', 'minRun'];
RX.RX_LABELS = { minT: 'Min T °F', maxT: 'Max T °F', minRH: 'Min RH %', maxRH: 'Max RH %', maxW: 'Max 20-ft wind', maxG: 'Max gust', minV: 'Min vent (k kt-ft)', bpS: 'Start hr', bpE: 'End hr', minRun: 'Min hrs' };
RX.DEFAULT_RX = { minT: 40, maxT: 80, minRH: 20, maxRH: 50, maxW: 12, maxG: 20, minV: 0, bpS: 9, bpE: 17, minRun: 4 };
// accept common attribute spellings, e.g. RX_MINT, MIN_TEMP, MinRH, MAXWIND
RX.rxFromAttrs = p => {
  const map = { minT: /^(rx_?)?min_?t(emp)?$/i, maxT: /^(rx_?)?max_?t(emp)?$/i, minRH: /^(rx_?)?min_?rh$/i, maxRH: /^(rx_?)?max_?rh$/i, maxW: /^(rx_?)?max_?w(ind|s)?(_?20)?$/i, maxG: /^(rx_?)?max_?g(ust)?$/i, minV: /^(rx_?)?min_?v(ent)?$/i };
  const out = {}; let n = 0; for (const [k, re] of Object.entries(map)) { const key = Object.keys(p || {}).find(x => re.test(x)); if (key != null && isFinite(+p[key]) && p[key] !== '') { out[k] = +p[key]; n++; } }
  return n ? out : null;
};
RX.test = (h, r) => {
  const f = [];
  if (h.t == null || h.rh == null || h.w20 == null) return { ok: false, fails: ['no data'] };
  if (r.minT != null && h.t < r.minT) f.push('T low'); if (r.maxT != null && h.t > r.maxT) f.push('T high');
  if (r.minRH != null && h.rh < r.minRH) f.push('RH low'); if (r.maxRH != null && h.rh > r.maxRH) f.push('RH high');
  if (r.maxW != null && h.w20 > r.maxW) f.push('Wind'); if (r.maxG != null && h.g != null && h.g > r.maxG) f.push('Gust');
  if (r.minV > 0 && h.v != null && h.v < r.minV) f.push('Vent');
  return { ok: f.length === 0, fails: f };
};
RX.inPeriod = (hour, r) => r.bpE > r.bpS ? hour >= r.bpS && hour < r.bpE : (hour >= r.bpS || hour < r.bpE);
RX.dayStats = (hours, r) => {
  const m = new Map();
  for (const h of hours) { if (!RX.inPeriod(h.hour, r)) continue;
    let d = m.get(h.date); if (!d) { d = { run: 0, cur: 0, inRx: 0, period: 0, fails: {}, first: null, last: null, runStart: null, bestStart: null }; m.set(h.date, d); }
    d.period++; const res = RX.test(h, r);
    if (res.ok) { d.inRx++; if (d.first == null) d.first = h.hour; d.last = h.hour; if (d.cur === 0) d.runStart = h.hour; d.cur++; if (d.cur > d.run) { d.run = d.cur; d.bestStart = d.runStart; } }
    else { d.cur = 0; res.fails.forEach(x => d.fails[x] = (d.fails[x] || 0) + 1); } }
  for (const d of m.values()) { d.burn = d.run >= r.minRun; d.topFail = Object.entries(d.fails).sort((a, b) => b[1] - a[1])[0]?.[0] || null; }
  return m;
};

// ---------- time ----------
RX.local = ms => { const p = new Intl.DateTimeFormat('en-CA', { timeZone: RX.TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms)); const g = t => p.find(x => x.type === t).value; return { date: `${g('year')}-${g('month')}-${g('day')}`, hour: +g('hour') }; };
RX.dayLabel = (d, opts = { weekday: 'short', month: 'numeric', day: 'numeric' }) => new Date(d + 'T12:00').toLocaleDateString('en-US', opts);

// ---------- NWS gridded forecast (≈7 days, hourly) ----------
const isoDur = s => { const m = /P(?:(\d+)D)?(?:T(?:(\d+)H)?)?/.exec(s) || []; return (+m[1] || 0) * 24 + (+m[2] || 0); };
const expand = prop => { const out = new Map(); if (!prop || !prop.values) return out; const u = prop.uom || '';
  const conv = v => v == null ? null : /degC/.test(u) ? v * 9 / 5 + 32 : /km_h/.test(u) ? v * 0.621371 : /m_s/.test(u) ? v * 2.23694 : /:m$/.test(u) ? v * 3.28084 : v;
  for (const { validTime, value } of prop.values) { const [s, d] = validTime.split('/'); const t0 = Date.parse(s); const n = Math.max(1, isoDur(d)); for (let i = 0; i < n; i++) out.set(t0 + i * 3600e3, conv(value)); } return out; };
const nwsCache = new Map();
RX.nws = async (lat, lon) => {
  const key = lat.toFixed(3) + ',' + lon.toFixed(3); if (nwsCache.has(key)) return nwsCache.get(key);
  const p = (async () => {
    const pt = await fetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`).then(r => { if (!r.ok) throw new Error('NWS point lookup failed (' + r.status + ')'); return r.json(); });
    const g = (await fetch(pt.properties.forecastGridData).then(r => { if (!r.ok) throw new Error('NWS grid failed (' + r.status + ')'); return r.json(); })).properties;
    const S = { T: expand(g.temperature), RH: expand(g.relativeHumidity), W: expand(g.windSpeed), G: expand(g.windGust), WD: expand(g.windDirection), MH: expand(g.mixingHeight), TWS: expand(g.transportWindSpeed), TWD: expand(g.transportWindDirection) };
    const t0 = Math.floor(Date.now() / 3600e3) * 3600e3 - 3600e3 * 12, hours = [];
    for (let ms = t0; ms < t0 + 8 * 864e5; ms += 3600e3) { if (!S.T.has(ms)) continue; const w = S.W.get(ms), mh = S.MH.get(ms), tw = S.TWS.get(ms);
      hours.push({ ms, ...RX.local(ms), t: S.T.get(ms) ?? null, rh: S.RH.get(ms) ?? null, w20: w == null ? null : w / 1.15, g: S.G.get(ms) ?? null, wd: S.WD.get(ms) ?? null,
        mh: mh ?? null, tws: tw ?? null, twd: S.TWD.get(ms) ?? null, v: mh == null || tw == null ? null : mh * tw * 0.868976 / 1000, src: 'NWS' }); }
    return { hours, office: pt.properties.gridId, zone: (pt.properties.fireWeatherZone || '').split('/').pop() };
  })();
  nwsCache.set(key, p); p.catch(() => nwsCache.delete(key)); return p;
};
// ---------- Open-Meteo 16-day hourly (fills days beyond NWS) ----------
RX.om16 = async (lat, lon) => {
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,boundary_layer_height,wind_speed_120m,wind_direction_120m&forecast_days=16&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=${encodeURIComponent(RX.TZ)}`;
  const j = await fetch(u).then(r => r.json()); if (j.error) throw new Error(j.reason); const h = j.hourly;
  return h.time.map((t, i) => { const w = h.wind_speed_10m[i], blh = h.boundary_layer_height?.[i], tw = h.wind_speed_120m?.[i];
    return { date: t.slice(0, 10), hour: +t.slice(11, 13), t: h.temperature_2m[i], rh: h.relative_humidity_2m[i], w20: w == null ? null : w / 1.15, g: h.wind_gusts_10m?.[i] ?? null, wd: h.wind_direction_10m?.[i] ?? null,
      mh: blh == null ? null : blh * 3.28084, tws: tw ?? null, twd: h.wind_direction_120m?.[i] ?? null, v: blh == null || tw == null ? null : blh * 3.28084 * tw * 0.868976 / 1000, src: '16d' }; });
};
// NWS for the days it covers, Open-Meteo after
RX.blended = async (lat, lon) => {
  const [n, o] = await Promise.all([RX.nws(lat, lon).catch(e => ({ hours: [], err: e.message })), RX.om16(lat, lon).catch(e => [])]);
  const nwsDates = new Set(n.hours.map(h => h.date)); const lastNws = [...nwsDates].sort().pop() || '';
  // keep NWS only for full-ish days (≥ 18 hours) so a ragged last day falls back to 16-day
  const cnt = {}; n.hours.forEach(h => cnt[h.date] = (cnt[h.date] || 0) + 1); const fullNws = new Set(Object.keys(cnt).filter(d => cnt[d] >= 18 || d === RX.local(Date.now()).date));
  const hours = [...n.hours.filter(h => fullNws.has(h.date)), ...o.filter(h => !fullNws.has(h.date) && h.date > (RX.local(Date.now()).date))];
  return { hours, office: n.office, zone: n.zone, nwsErr: n.err, nwsDays: fullNws };
};

// ---------- terrain drainage (steepest descent, Open-Meteo elevation) ----------
RX.elev = async pts => { const out = []; for (let i = 0; i < pts.length; i += 100) { const c = pts.slice(i, i + 100);
  const j = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${c.map(p => p[0].toFixed(5)).join(',')}&longitude=${c.map(p => p[1].toFixed(5)).join(',')}`).then(r => r.json());
  if (!j.elevation) throw new Error('elevation service unavailable'); out.push(...j.elevation); } return out; };
RX.drainage = async (start, miles) => {
  const step = 0.25, path = [start]; let cur = start, [z] = await RX.elev([start]); const z0 = z;
  for (let s = 0; s < Math.ceil(miles / step) * 2; s++) { let moved = false;
    for (const reach of [step, step * 2, step * 4]) { const cand = []; for (let b = 0; b < 360; b += 22.5) cand.push(RX.dest(cur[0], cur[1], b, reach));
      const zs = await RX.elev(cand); let bi = -1, bz = z; zs.forEach((v, i) => { if (v < bz - 0.5) { bz = v; bi = i; } });
      if (bi >= 0) { cur = cand[bi]; z = bz; path.push(cur); moved = true; break; } }
    if (!moved || RX.pathLen(path) >= miles) break; }
  return { path, drop: z0 - z };
};

// ---------- receptors ----------
const q = async (url, extra) => { const j = await fetch(`${url}/query?${extra}&f=json`).then(r => r.json()); if (j.error) throw new Error(j.error.message); return j.features || []; };
RX.q = q;
RX.receptorsIn = async (bbox) => {
  const env = `geometry=${bbox.join(',')}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&returnGeometry=false`;
  const [inc, cdp, sch, hos, c1] = await Promise.all([
    q(`${RX.L.places}/4`, `where=1%3D1&${env}&outFields=NAME,INTPTLAT,INTPTLON`).catch(() => []),
    q(`${RX.L.places}/5`, `where=1%3D1&${env}&outFields=NAME,INTPTLAT,INTPTLON`).catch(() => []),
    q(RX.L.schools, `where=STATE%3D%27CA%27&${env}&outFields=NAME,CITY,LATITUDE,LONGITUDE`).catch(() => []),
    q(RX.L.hospitals, `where=STATE%3D%27CA%27&${env}&outFields=NAME,CITY,LATITUDE,LONGITUDE`).catch(() => []),
    q(RX.L.class1, `where=1%3D1&geometry=${bbox.join(',')}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=NAME&returnGeometry=true&outSR=4326&maxAllowableOffset=0.003`).catch(() => [])]);
  const pts = [];
  inc.forEach(f => pts.push({ type: 'Community', name: f.attributes.NAME, lat: +f.attributes.INTPTLAT, lon: +f.attributes.INTPTLON }));
  cdp.forEach(f => pts.push({ type: 'Community (CDP)', name: f.attributes.NAME, lat: +f.attributes.INTPTLAT, lon: +f.attributes.INTPTLON }));
  sch.forEach(f => pts.push({ type: 'School', name: `${f.attributes.NAME}, ${f.attributes.CITY}`, lat: +f.attributes.LATITUDE, lon: +f.attributes.LONGITUDE }));
  hos.forEach(f => pts.push({ type: 'Hospital', name: `${f.attributes.NAME}, ${f.attributes.CITY}`, lat: +f.attributes.LATITUDE, lon: +f.attributes.LONGITUDE }));
  const class1 = c1.map(f => ({ name: f.attributes.NAME, rings: (f.geometry?.rings || []).map(r => r.map(p => [p[1], p[0]])) }));
  return { pts, class1 };
};
RX.airDistrict = async (lat, lon) => { const f = await q(RX.L.air, `where=1%3D1&geometry=${lon},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=NAME,District_W,District_C,AirDistrict_Email&returnGeometry=false`).catch(() => []); return f[0]?.attributes || null; };
RX.bboxOf = pts => { const la = pts.map(p => p[0]), lo = pts.map(p => p[1]); return [Math.min(...lo), Math.min(...la), Math.max(...lo), Math.max(...la)]; };

// ---------- smoke: emissions + screening concentration ----------
// Fuel consumption presets (tons/acre consumed) and PM2.5 emission factor (g/kg) — screening values in line with FOFEM/CONSUME-scale defaults
RX.FUELS = {
  grass: { label: 'Grass / annual grassland', tpa: 1.5, ef: 9, smolder: 0.05 },
  brush: { label: 'Brush / chaparral', tpa: 8, ef: 9, smolder: 0.10 },
  understory: { label: 'Conifer understory (broadcast)', tpa: 6, ef: 13, smolder: 0.25 },
  hardwood: { label: 'Oak woodland / hardwood litter', tpa: 4, ef: 12, smolder: 0.20 },
  machinepile: { label: 'Machine piles (per unit acre)', tpa: 12, ef: 8, smolder: 0.35 },
  handpile: { label: 'Hand piles (per unit acre)', tpa: 4, ef: 8, smolder: 0.30 },
  custom: { label: 'Custom', tpa: 5, ef: 12, smolder: 0.2 }
};
// one day's burn: the unit's acres, capped (large units are rarely burned in a single day)
RX.burnAcres = u => u && u.acres ? Math.round(Math.min(u.acres, 250)) : null;
RX.fuelFromType = t => { t = (t || '').toLowerCase(); if (/machine.*pile|landing/.test(t)) return 'machinepile'; if (/hand.*pile|pile/.test(t)) return 'handpile'; if (/grass|range/.test(t)) return 'grass'; if (/brush|chaparral|shrub/.test(t)) return 'brush'; return 'understory'; };
// Briggs open-country sigmas (m), x in m
const SIG = { A: [0.22, 0.20, 0, 0], B: [0.16, 0.12, 0, 0], C: [0.11, 0.08, 0.0002, -0.5], D: [0.08, 0.06, 0.0015, -0.5] };
const sigma = (cls, x) => { const [ay, az, bz, pz] = SIG[cls]; const sy = ay * x / Math.sqrt(1 + 0.0001 * x); const sz = bz ? az * x * Math.pow(1 + bz * x, pz) : az * x; return [sy, sz]; };
const stability = (w20mph, mhft) => { const u = (w20mph || 0) * 0.447; // daytime, moderate insolation (Pasquill-Turner)
  let c = u < 2 ? 'A' : u < 3 ? 'B' : u < 5 ? 'C' : 'D'; if (mhft != null && mhft < 1500 && c === 'A') c = 'B'; return c; };
/* Day: Gaussian plume, ground-level, ground reflection + mixed-layer cap (well-mixed beyond σz ≈ 1.6 H).
   Emission rate from flaming-phase PM2.5 over the burn hours; plume rise from Briggs final rise with heat release (18 MJ/kg, 50% convective), capped below mixing height. */
RX.dayModel = (unit, hours, opt) => {
  const fuel = RX.FUELS[opt.fuel] || RX.FUELS.understory; const tpa = opt.tpa ?? fuel.tpa, ef = opt.ef ?? fuel.ef, smolder = opt.smolder ?? fuel.smolder;
  const acres = Math.max(1, opt.acres || unit.acres || 50);
  const kgFuel = acres * tpa * 907.185, pmTotal = kgFuel * ef; // grams
  const dur = Math.max(1, hours.length);
  const qDay = pmTotal * (1 - smolder) / (dur * 3600); // g/s
  const burnRate = kgFuel * (1 - smolder) / (dur * 3600); // kg/s
  const F = 8.8e-6 * burnRate * 18e6 * 0.5; // m4/s3
  const res = { pmTotalTons: pmTotal / 907185, qDay, smolderG: pmTotal * smolder, hourly: [] };
  for (const h of hours) {
    const u = Math.max(1, (h.tws ?? h.w20 ?? 5) * 0.447), H = Math.max(150, (h.mh ?? 1500) / 3.28084);
    const rise = F < 55 ? 21.4 * Math.pow(F, 0.75) / u : 38.7 * Math.pow(F, 0.6) / u;
    res.hourly.push({ hour: h.hour, down: (((h.twd ?? h.wd ?? 0) + 180) % 360), u, H, he: Math.min(rise, 0.8 * H), cls: stability(h.w20, h.mh) });
  }
  // ground-level conc (µg/m3) at downwind x (m), crosswind y (m) for one hour
  res.conc = (k, x, y) => { const hr = res.hourly[k]; if (x <= 10) return 0; const [sy, sz] = sigma(hr.cls, x);
    if (sz > 1.6 * hr.H) return 1e6 * qDay / (Math.sqrt(2 * Math.PI) * sy * hr.u * hr.H) * Math.exp(-0.5 * (y / sy) ** 2);
    let vert = 0; for (let n = -2; n <= 2; n++) vert += Math.exp(-0.5 * ((hr.he + 2 * n * hr.H) / sz) ** 2) + Math.exp(-0.5 * ((-hr.he + 2 * n * hr.H) / sz) ** 2);
    return 1e6 * qDay / (2 * Math.PI * sy * sz * hr.u) * Math.exp(-0.5 * (y / sy) ** 2) * vert; };
  // peak over burn hours at a lat/lon
  res.at = (lat, lon) => { let m = 0; const dMi = RX.dist([unit.lat, unit.lon], [lat, lon]); if (dMi < 0.01) return null; const b = RX.bearing([unit.lat, unit.lon], [lat, lon]);
    res.hourly.forEach((hr, k) => { const off = rad(((b - hr.down + 540) % 360) - 180); const x = dMi * 1609.34 * Math.cos(off), y = dMi * 1609.34 * Math.sin(off); if (x > 0) m = Math.max(m, res.conc(k, x, y)); }); return m; };
  return res;
};
/* Night (PB-Piedmont concept): night share of smoldering emissions over 10 hours carried by a shallow drainage flow
   (default 1 m/s, 100 m deep) whose width grows downstream. C(s) = Qn / (u·D·W(s)). */
RX.nightModel = (unit, path, day, opt = {}) => {
  // about half of residual smoldering is emitted after sunset; the rest burns down during the afternoon
  const ud = opt.drainSpeed || 1.0, D = opt.drainDepth || 100, hrs = opt.nightHours || 10, nightFrac = opt.nightFrac ?? 0.5;
  const qn = day.smolderG * nightFrac / (hrs * 3600); const w0 = Math.max(150, Math.sqrt(Math.max(1, opt.acres || unit.acres || 50) * 4046.86));
  const at = s => qn > 0 ? 1e6 * qn / (ud * D * (w0 + 0.25 * s * 1609.34)) : 0; // s in miles along path
  const segs = []; let run = 0; for (let i = 0; i < path.length - 1; i++) { const seg = RX.dist(path[i], path[i + 1]); segs.push({ a: path[i], b: path[i + 1], c: at(run + seg / 2) }); run += seg; }
  return { qn, at, segs };
};
// PM2.5 categories (24-hr AQI breakpoints, µg/m3) used to shade the screening estimate
RX.PM_CATS = [[12, '#00e400', 'Good'], [35.4, '#ffff00', 'Moderate'], [55.4, '#ff7e00', 'USG'], [150.4, '#ff0000', 'Unhealthy'], [250.4, '#8f3f97', 'Very unhealthy'], [Infinity, '#7e0023', 'Hazardous']];
RX.pmCat = c => RX.PM_CATS.find(x => c <= x[0]) || RX.PM_CATS[RX.PM_CATS.length - 1];

// full smoke screening for one unit on one date
RX.smoke = async (unit, date, plan, wx) => {
  const g = wx || await RX.nws(unit.lat, unit.lon);
  const hours = g.hours.filter(h => h.date === date && h.hour >= plan.start && h.hour < plan.start + plan.dur && (h.twd != null || h.wd != null));
  if (!hours.length) throw new Error('No transport-wind forecast for that date/window');
  const downs = hours.map(h => ((h.twd ?? h.wd) + 180) % 360), mb = RX.meanBearing(downs);
  const offs = downs.map(d => ((d - mb + 540) % 360) - 180), lo = Math.min(...offs) - 20, hi = Math.max(...offs) + 20;
  const cone = [[unit.lat, unit.lon]]; for (let o = lo; o <= hi + 0.01; o += Math.max(2, (hi - lo) / 30)) cone.push(RX.dest(unit.lat, unit.lon, mb + o, plan.dayMi)); cone.push([unit.lat, unit.lon]);
  const dr = await RX.drainage([unit.lat, unit.lon], plan.nightMi).catch(e => ({ path: [[unit.lat, unit.lon]], drop: 0, err: e.message }));
  const day = RX.dayModel(unit, hours, plan); const night = RX.nightModel(unit, dr.path, day, plan);
  const ext = [...cone, ...dr.path.flatMap(p => [0, 90, 180, 270].map(b => RX.dest(p[0], p[1], b, plan.bufMi)))];
  const rec = await RX.receptorsIn(RX.bboxOf(ext));
  const rows = [];
  // a receptor is a daytime hit only if it is inside the screening cone AND the plume estimate puts ≥ 1 µg/m3 there
  for (const p of rec.pts) { const pt = [p.lat, p.lon]; const inCone = RX.inPoly(pt, cone); const pmDay = inCone ? day.at(p.lat, p.lon) : null; const inDay = inCone && pmDay >= 1;
    const np = RX.nearOnPath(pt, dr.path); const inNight = np.d <= plan.bufMi;
    if (!inDay && !inNight) continue; rows.push({ ...p, d: RX.dist([unit.lat, unit.lon], pt), brg: RX.bearing([unit.lat, unit.lon], pt), inDay, inNight, pmDay: inDay ? pmDay : null, pmNight: inNight ? night.at(np.along) : null }); }
  rows.sort((a, b) => a.d - b.d);
  const class1 = rec.class1.map(c => { const verts = c.rings.flat(); let inDay = verts.some(v => RX.inPoly(v, cone)) || cone.some(v => c.rings.some(r => RX.inPoly(v, r)));
    let minD = Infinity; for (const v of verts) minD = Math.min(minD, RX.nearOnPath(v, dr.path).d);
    const close = verts.reduce((m, v) => { const d = RX.dist([unit.lat, unit.lon], v); return d < m.d ? { d, v } : m; }, { d: Infinity, v: null });
    return { ...c, inDay, inNight: minD <= plan.bufMi, d: close.d, brg: close.v ? RX.bearing([unit.lat, unit.lon], close.v) : null }; });
  const tws = hours.map(h => h.tws).filter(v => v != null), vents = hours.map(h => h.v).filter(v => v != null);
  const peak = Math.max(0, ...rows.map(r => Math.max(r.pmDay || 0, r.pmNight || 0)));
  return { unit, date, plan, hours, mb, lo, hi, cone, drain: dr, day, night, rows, class1, peak,
    twsRange: tws.length ? [Math.min(...tws), Math.max(...tws)] : null, vent: vents.length ? vents.reduce((a, b) => a + b, 0) / vents.length : null };
};
// grid of peak day concentration inside the cone (for the overlay)
RX.concGrid = (S, n = 26) => { const cells = []; const step = S.plan.dayMi / n; const aStep = Math.max(2, (S.hi - S.lo) / 30);
  for (let r = step / 2; r < S.plan.dayMi; r += step) for (let o = S.lo; o < S.hi; o += aStep) { const c = RX.dest(S.unit.lat, S.unit.lon, S.mb + o + aStep / 2, r); const v = S.day.at(c[0], c[1]);
    if (v > 1) cells.push({ ring: [RX.dest(S.unit.lat, S.unit.lon, S.mb + o, r - step / 2), RX.dest(S.unit.lat, S.unit.lon, S.mb + o + aStep, r - step / 2), RX.dest(S.unit.lat, S.unit.lon, S.mb + o + aStep, r + step / 2), RX.dest(S.unit.lat, S.unit.lon, S.mb + o, r + step / 2)], v }); }
  return cells; };

window.RX = RX;
})();
