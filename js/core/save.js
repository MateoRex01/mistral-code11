import { uid, fmtTime } from './utils.js';

const V_KEY = 'mekanik_vehicles_v1';
const M_KEY = 'mekanik_maps_v1';
const R_KEY = 'mekanik_records_v1';

function safe(k, fallback) { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } }

export const storage = {
  listCreations() { return safe(V_KEY, []); },
  saveCreation(data) {
    const list = this.listCreations();
    const i = list.findIndex(v => v.id === data.id);
    if (i >= 0) list[i] = data; else list.push(data);
    try { localStorage.setItem(V_KEY, JSON.stringify(list)); return true; }
    catch { return false; }
  },
  deleteCreation(id) {
    try { localStorage.setItem(V_KEY, JSON.stringify(this.listCreations().filter(v => v.id !== id))); } catch { /* límite */ }
  },

  listMaps() { return safe(M_KEY, []); },
  saveMap(map) {
    const list = this.listMaps();
    const i = list.findIndex(m => m.id === map.id);
    if (i >= 0) list[i] = map; else list.push(map);
    try { localStorage.setItem(M_KEY, JSON.stringify(list)); return true; } catch { return false; }
  },
  deleteMap(id) { try { localStorage.setItem(M_KEY, JSON.stringify(this.listMaps().filter(m => m.id !== id))); } catch { /* límite */ } },

  records() { return safe(R_KEY, {}); },
  setRecord(mapId, chalId, key, ms) {
    const all = this.records();
    if (!all[mapId]) all[mapId] = {};
    if (!all[mapId][chalId]) all[mapId][chalId] = { best: null, runs: 0, last: null };
    const r = all[mapId][chalId];
    r.runs++; r.last = { key, ms, when: Date.now() };
    if (ms != null && (r.best == null || ms < r.best.ms)) r.best = { key, ms, when: Date.now() };
    try { localStorage.setItem(R_KEY, JSON.stringify(all)); } catch { /* límite */ }
    return r;
  },
  getRecord(mapId, chalId) { return (safe(R_KEY, {})[mapId] || {})[chalId] || null; },
  resetRecords() { try { localStorage.removeItem(R_KEY); } catch { /* límite */ } },

  fmt: fmtTime,
  newId: uid,
};
