// Sticky unit + Rx shared by every tool page (Weather Evaluator, Smoke Modeling, Compare & Rank).
// All pages are served from the same origin and embedded in the same Experience Builder app,
// so they share this browser storage. Choosing a unit anywhere makes it the current unit everywhere;
// the user can still pick another unit or edit the Rx at any time.
(() => {
  'use strict';
  const UK = 'caRxPlanner.unit.v1', RK = 'caRxPlanner.rx.v1';
  const get = k => { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (_) { return null; } };
  const put = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } };
  // keep storage small: thin very large polygons (geometry is only used for the centroid and the preview map)
  const thin = rings => { const n = rings.reduce((a, r) => a + r.length, 0); if (n <= 4000) return rings; const step = Math.ceil(n / 4000);
    return rings.map(r => r.length < 8 ? r : r.filter((_, i) => i % step === 0 || i === r.length - 1)).filter(r => r.length); };
  const r5 = v => Math.round(v * 1e5) / 1e5;
  const keyOf = u => u.stickyKey ? u.stickyKey : u.id != null ? 'id' + u.id : 'p' + (+u.lat).toFixed(4) + ',' + (+u.lon).toFixed(4) + ':' + (u.name || '');
  const STICKY = {
    // u: {name, lat, lon, rings, id?, acres?, type?, agency?}
    saveUnit(u) {
      if (!u || !isFinite(u.lat) || !isFinite(u.lon)) return;
      const rec = { key: keyOf(u), name: u.name || 'Unit', lat: u.lat, lon: u.lon, id: u.id ?? null, acres: u.acres ?? null, type: u.type ?? null, agency: u.agency ?? null,
        rings: thin((u.rings || []).map(r => r.map(p => [r5(p[0]), r5(p[1])]))), ts: Date.now() };
      const cur = get(UK); if (cur && cur.key === rec.key) return; // unchanged: don't wake the other tabs
      put(UK, rec);
    },
    unit: () => get(UK),
    clear() { put(UK, null); },
    saveRx(rx) { if (!rx) return; const clean = {}; Object.entries(rx).forEach(([k, v]) => { if (v != null && v !== '' && isFinite(+v)) clean[k] = +v; });
      const cur = get(RK); if (cur && JSON.stringify(cur.rx) === JSON.stringify(clean)) return; put(RK, { rx: clean, ts: Date.now() }); },
    rx: () => (get(RK) || {}).rx || null,
    keyOf,
    // cb(kind, value) when another tab changes the unit ('unit') or Rx ('rx')
    onChange(cb) { window.addEventListener('storage', e => { if (e.key === UK) cb('unit', get(UK)); else if (e.key === RK) cb('rx', (get(RK) || {}).rx || null); }); },
    // small "carries across tabs · clear" note under a page title
    note(el, onClear) { if (!el) return; const box = document.createElement('div'); box.className = 'sticky-note';
      box.style.cssText = 'font-size:12px;color:#5b6b7b;margin:2px 0 6px';
      const paint = () => { const u = get(UK); box.innerHTML = u ? `Current unit <b>${String(u.name).replace(/[<>&]/g, '')}</b> carries across all tabs. Pick another unit any time to change it · <a href="#" style="color:#0b4f8a">clear</a>` : 'The unit you choose here will carry across all tabs.';
        const a = box.querySelector('a'); if (a) a.onclick = ev => { ev.preventDefault(); STICKY.clear(); paint(); onClear && onClear(); }; };
      paint(); el.insertAdjacentElement('afterend', box); window.addEventListener('storage', e => { if (e.key === UK) paint(); }); STICKY._paint = paint; },
    refresh() { STICKY._paint && STICKY._paint(); },
    // run fn now if this page is on screen, otherwise the next time it is shown (hidden EB tabs don't re-run in the background)
    whenVisible(fn) {
      if (!('IntersectionObserver' in window)) return fn();
      let done = false; const io = new IntersectionObserver(es => { if (!done && es.some(e => e.isIntersecting)) { done = true; io.disconnect(); fn(); } });
      io.observe(document.body);
    }
  };
  window.STICKY = STICKY;
})();
