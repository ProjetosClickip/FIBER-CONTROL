/* ClickIP FiberControl — utilitários gerais (sem dependências) */
(function (FC) {
  'use strict';
  const U = FC.util = {};

  U.uid = (p = '') => p + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  U.now = () => new Date().toISOString();
  U.$ = (s, r = document) => r.querySelector(s);
  U.$$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /** Escapa HTML — usar em TODO conteúdo vindo de arquivos ou usuários */
  U.esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Template tag que escapa interpolações (use raw() para HTML confiável) */
  U.html = (strings, ...vals) => strings.reduce((a, s, i) => a + s + (i < vals.length ? (vals[i] && vals[i].__raw ? vals[i].v : Array.isArray(vals[i]) ? vals[i].map(x => x && x.__raw ? x.v : U.esc(x)).join('') : U.esc(vals[i])) : ''), '');
  U.raw = (v) => ({ __raw: true, v: String(v) });

  const nf = (d) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  U.num = (v, d = 2) => (v == null || v === '' || isNaN(v)) ? '—' : nf(d).format(+v);
  U.m = (v, d = 1) => v == null || isNaN(v) ? '—' : U.num(v, d) + ' m';
  U.km = (vm, d = 3) => vm == null || isNaN(vm) ? '—' : U.num(vm / 1000, d) + ' km';
  U.db = (v, d = 2) => v == null || isNaN(v) ? '—' : U.num(v, d) + ' dB';
  U.pct = (v, d = 2) => v == null || isNaN(v) ? '—' : (v > 0 ? '+' : '') + U.num(v, d) + '%';
  U.date = (iso) => iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';
  U.dt = (iso) => iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  U.monthKey = (iso) => iso ? iso.slice(0, 7) : '';
  U.monthLabel = (k) => { const [y, m] = k.split('-'); return ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+m - 1] + '/' + y.slice(2); };

  /** Converte texto numérico em pt-BR ou en ("1.234,5", "1234.5", "1,2 km") para número */
  U.parseNum = (v) => {
    if (v == null) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    let s = String(v).trim().replace(/\s/g, '');
    if (!s) return null;
    s = s.replace(/[^\d,.\-]/g, '');
    if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (s.includes(',')) s = s.replace(',', '.');
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  };

  U.sum = (a, f = x => x) => a.reduce((s, x) => s + (+f(x) || 0), 0);
  U.avg = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
  U.median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  U.stdev = (a) => { if (a.length < 2) return 0; const m = U.avg(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
  U.groupBy = (a, f) => a.reduce((o, x) => { const k = f(x); (o[k] = o[k] || []).push(x); return o; }, {});
  U.uniq = (a) => [...new Set(a.filter(x => x != null && x !== ''))].sort((x, y) => String(x).localeCompare(String(y), 'pt-BR'));
  U.clone = (o) => JSON.parse(JSON.stringify(o));
  U.debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  U.norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  /** SHA-256 hex de um ArrayBuffer ou string (detecção de duplicados, assinatura) */
  U.sha256 = async (data) => {
    const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const h = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
  };

  U.readAsArrayBuffer = (file) => file.arrayBuffer ? file.arrayBuffer() : new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsArrayBuffer(file); });
  U.readAsDataURL = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
  U.ext = (name) => (String(name).split('.').pop() || '').toLowerCase();
  U.bytes = (n) => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';

  /** Download de Blob — funciona em navegador/hospedagem própria */
  U.download = (blob, name) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    FC.ui && FC.ui.toast('Arquivo gerado: ' + name, 'ok');
  };

  /** Carrega script externo sob demanda (bibliotecas pesadas: pdf.js, tesseract, supabase) */
  const loaded = {};
  U.loadScript = (src) => loaded[src] || (loaded[src] = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error('Não foi possível carregar ' + src)); };
    document.head.appendChild(s);
  }));

  U.storage = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { console.warn('localStorage indisponível', e); return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* */ } }
  };

  /** IndexedDB simples para arquivos (anexos) e traços OTDR */
  U.idb = (() => {
    let dbp;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      try {
        const r = indexedDB.open('clickip-fibercontrol', 1);
        r.onupgradeneeded = () => { r.result.createObjectStore('files'); r.result.createObjectStore('traces'); };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    }));
    const tx = async (store, mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction(store, mode); const s = t.objectStore(store); const r = fn(s); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }); };
    const mem = { files: new Map(), traces: new Map() };
    return {
      async put(store, key, val) { try { await tx(store, 'readwrite', s => s.put(val, key)); } catch (e) { mem[store].set(key, val); } },
      async get(store, key) { try { const v = await tx(store, 'readonly', s => s.get(key)); return v !== undefined ? v : mem[store].get(key); } catch (e) { return mem[store].get(key); } },
      async del(store, key) { try { await tx(store, 'readwrite', s => s.delete(key)); } catch (e) { mem[store].delete(key); } },
      async clear(store) { try { await tx(store, 'readwrite', s => s.clear()); } catch (e) { mem[store].clear(); } }
    };
  })();
})(window.FC = window.FC || {});
