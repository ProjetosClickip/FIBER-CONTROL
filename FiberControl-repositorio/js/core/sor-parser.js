/*
 * ClickIP FiberControl — Leitor de arquivos OTDR .SOR (Telcordia SR-4731, versões 1 e 2)
 * ------------------------------------------------------------------------------------
 * Leitura binária real (little-endian) dos blocos: Map, GenParams, SupParams,
 * FxdParams, KeyEvents, DataPts. Blocos proprietários (ex.: Viavi/JDSU) são listados
 * mas não interpretados. Nada é inventado: campos não encontrados ficam em `missing`.
 *
 * Módulo UMD: funciona no navegador (window.SORParser) e em Node/Deno
 * (backend / Supabase Edge Function) com `parseSOR(arrayBuffer)`.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SORParser = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SOL = 0.299792458; // velocidade da luz no vácuo, km/µs

  class Reader {
    constructor(buf, pos = 0) {
      this.dv = new DataView(buf);
      this.u8 = new Uint8Array(buf);
      this.pos = pos;
    }
    get len() { return this.u8.length; }
    need(n) { if (this.pos + n > this.len) throw new Error('Fim inesperado do arquivo na posição ' + this.pos); }
    u16() { this.need(2); const v = this.dv.getUint16(this.pos, true); this.pos += 2; return v; }
    i16() { this.need(2); const v = this.dv.getInt16(this.pos, true); this.pos += 2; return v; }
    u32() { this.need(4); const v = this.dv.getUint32(this.pos, true); this.pos += 4; return v; }
    i32() { this.need(4); const v = this.dv.getInt32(this.pos, true); this.pos += 4; return v; }
    fixed(n) { this.need(n); let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(this.u8[this.pos + i]); this.pos += n; return s; }
    str(max = 4096) {
      let s = '', i = 0;
      while (this.pos < this.len && i < max) {
        const c = this.u8[this.pos++]; i++;
        if (c === 0) return latin1Clean(s);
        s += String.fromCharCode(c);
      }
      return latin1Clean(s);
    }
  }
  function latin1Clean(s) { return s.replace(/[\u0000-\u001f]/g, ' ').trim(); }

  const FIBER_TYPES = { 651: 'G.651 (multimodo 50 µm)', 652: 'G.652 (monomodo padrão)', 653: 'G.653 (dispersão deslocada)', 654: 'G.654 (perda mínima 1550 nm)', 655: 'G.655 (NZ-DSF)', 657: 'G.657 (insensível a curvatura)' };
  const BUILD = { BC: 'Como construído (as-built)', CC: 'Condição atual (as-current)', RC: 'Após reparo (as-repaired)', OT: 'Outro' };

  function readMap(r) {
    // Versão 2 começa com "Map\0"; versão 1 começa direto com a versão
    const first = r.fixed(4);
    let format = 1;
    if (first === 'Map\0') format = 2; else r.pos = 0;
    const version = r.u16() / 100;
    const mapSize = r.u32();
    const nblocks = r.u16() - 1;
    const blocks = {};
    const order = [];
    let start = mapSize;
    for (let i = 0; i < nblocks; i++) {
      const name = r.str(64);
      const bver = r.u16() / 100;
      const size = r.u32();
      blocks[name] = { name, version: bver, size, pos: start };
      order.push(name);
      start += size;
    }
    return { format, version, mapSize, blocks, order };
  }

  function seekBlock(buf, map, name) {
    const b = map.blocks[name];
    if (!b) return null;
    if (b.pos >= buf.byteLength) throw new Error('Bloco ' + name + ' fora dos limites do arquivo');
    const r = new Reader(buf, b.pos);
    if (map.format === 2) {
      const hdr = r.str(64);
      if (hdr !== name) throw new Error('Cabeçalho do bloco ' + name + ' inválido ("' + hdr + '")');
    }
    r.end = b.pos + b.size;
    return r;
  }

  function readGen(r, fmt) {
    const g = { language: r.fixed(2) };
    g.cableId = r.str(); g.fiberId = r.str();
    if (fmt === 2) { const ft = r.u16(); g.fiberTypeCode = ft; g.fiberType = FIBER_TYPES[ft] || String(ft); }
    g.nominalWavelength = r.u16();
    g.locationA = r.str(); g.locationB = r.str(); g.cableCode = r.str();
    const bc = r.fixed(2); g.buildCondition = bc; g.buildConditionLabel = BUILD[bc] || bc;
    g.userOffset = r.i32();
    if (fmt === 2) g.userOffsetDistance = r.i32();
    g.operator = r.str(); g.comments = r.str();
    return g;
  }

  function readSup(r) {
    return { supplier: r.str(), otdr: r.str(), otdrSN: r.str(), module: r.str(), moduleSN: r.str(), software: r.str(), other: r.str() };
  }

  function readFxd(r, fmt) {
    const f = {};
    const ts = r.u32();
    f.timestamp = ts; f.date = ts ? new Date(ts * 1000).toISOString() : null;
    f.units = r.fixed(2);
    f.wavelength = r.u16() / 10; // nm
    f.acquisitionOffset = r.i32();
    if (fmt === 2) f.acquisitionOffsetDistance = r.i32();
    const n = r.u16(); f.pulseEntries = n;
    f.pulseWidths = []; f.dataSpacing = []; f.pointsPerPulse = [];
    for (let i = 0; i < n; i++) f.pulseWidths.push(r.u16()); // ns
    for (let i = 0; i < n; i++) f.dataSpacing.push(r.u32());
    for (let i = 0; i < n; i++) f.pointsPerPulse.push(r.u32());
    f.ior = r.u32() / 100000;
    f.backscatter = -r.u16() / 10; // dB
    f.averages = r.u32();
    if (fmt === 2) f.averagingTime = r.u16() / 10; // s
    f.rangeRaw = r.u32();
    if (fmt === 2) f.acquisitionRangeDistance = r.i32();
    f.frontPanelOffset = r.i32();
    f.noiseFloorLevel = r.u16();
    f.noiseFloorScale = r.i16();
    f.powerOffsetFirstPoint = r.u16();
    f.lossThreshold = r.u16() / 1000;
    f.reflThreshold = -r.u16() / 1000;
    f.eotThreshold = r.u16() / 1000;
    if (fmt === 2 && r.pos + 2 <= r.end) f.traceType = r.fixed(2);
    // Resolução: espaçamento (unidade 1e-8 µs) × c / n  -> km por ponto
    if (f.ior > 1 && f.ior < 2 && f.dataSpacing[0]) {
      f.resolutionKm = f.dataSpacing[0] * 1e-8 * SOL / f.ior;
      f.resolutionM = f.resolutionKm * 1000;
    }
    return f;
  }

  function classifyCode(code) {
    const t = code.charAt(0), m = code.charAt(1);
    const kind = t === '1' ? 'refletivo' : t === '0' ? 'nao-refletivo' : t === '2' ? 'refletivo-saturado' : 'desconhecido';
    const origin = { F: 'automático', M: 'manual', A: 'adicionado', E: 'fim de fibra', O: 'fora de faixa', D: 'automático' }[m] || m;
    return { kind, origin, end: m === 'E' };
  }

  function readEvents(r, fmt, ior) {
    const factor = 1e-4 * SOL / ior; // tempo (100 ps) -> km
    const n = r.u16();
    const events = [];
    for (let i = 0; i < n; i++) {
      const e = {};
      e.number = r.u16();
      e.distanceKm = r.u32() * factor;
      e.slope = r.i16() / 1000; // dB/km
      e.loss = r.i16() / 1000; // dB
      e.reflectance = r.i32() / 1000; // dB
      e.code = r.fixed(6);
      e.technique = r.fixed(2);
      Object.assign(e, classifyCode(e.code));
      if (fmt === 2) {
        e.markers = { endPrev: r.u32() * factor, startCurr: r.u32() * factor, endCurr: r.u32() * factor, startNext: r.u32() * factor, peak: r.u32() * factor };
      }
      e.comment = r.str();
      e.distanceM = e.distanceKm * 1000;
      events.push(e);
    }
    const summary = {};
    try {
      summary.totalLoss = r.i32() / 1000;
      summary.lossStartKm = r.i32() * factor;
      summary.lossEndKm = r.u32() * factor;
      summary.orl = r.u16() / 1000;
      summary.orlStartKm = r.i32() * factor;
      summary.orlEndKm = r.u32() * factor;
    } catch (err) { summary.error = 'Resumo de eventos incompleto'; }
    return { events, summary };
  }

  function readData(r, fxd) {
    const n = r.u32();
    const traces = r.i16();
    const n2 = r.u32();
    const scale = r.u16() / 1000;
    const count = Math.min(n2 || n, Math.floor((r.len - r.pos) / 2));
    const raw = new Uint16Array(count);
    for (let i = 0; i < count; i++) raw[i] = r.u16();
    let max = 0; for (let i = 0; i < count; i++) if (raw[i] > max) max = raw[i];
    const fs = 0.001 * scale;
    const dx = fxd.resolutionKm || 0;
    const y = new Float32Array(count);
    for (let i = 0; i < count; i++) y[i] = (max - raw[i]) * fs; // dB (offset STV, igual ao padrão de mercado)
    return { points: count, declared: n, traces, scale, dxKm: dx, y };
  }

  /**
   * Analisa um ArrayBuffer .SOR. Retorna objeto com dados extraídos, avisos e lista do que faltou.
   */
  function parseSOR(buf) {
    const res = { ok: false, warnings: [], missing: [], blocks: [] };
    const r = new Reader(buf);
    const map = readMap(r);
    res.format = map.format; res.version = map.version;
    res.blocks = map.order.map(n => ({ name: n, size: map.blocks[n].size, version: map.blocks[n].version }));
    const known = ['GenParams', 'SupParams', 'FxdParams', 'KeyEvents', 'DataPts', 'Cksum', 'LnkParams', 'MapBlock'];
    res.proprietary = map.order.filter(n => !known.includes(n));

    const tryBlock = (name, fn) => {
      try { const br = seekBlock(buf, map, name); if (!br) { res.missing.push(name); return null; } return fn(br); }
      catch (e) { res.warnings.push(name + ': ' + e.message); res.missing.push(name); return null; }
    };
    res.general = tryBlock('GenParams', br => readGen(br, map.format));
    res.supplier = tryBlock('SupParams', readSup);
    res.fixed = tryBlock('FxdParams', br => readFxd(br, map.format));
    const ior = res.fixed && res.fixed.ior > 1 && res.fixed.ior < 2 ? res.fixed.ior : null;
    if (!ior) res.warnings.push('Índice de refração ausente/inválido: distâncias de eventos não podem ser calculadas.');
    const ke = ior ? tryBlock('KeyEvents', br => readEvents(br, map.format, ior)) : null;
    if (ke) { res.events = ke.events; res.summary = ke.summary; }
    res.trace = res.fixed ? tryBlock('DataPts', br => readData(br, res.fixed)) : null;

    // Valores derivados
    const end = (res.events || []).find(e => e.end) || (res.events || []).slice(-1)[0];
    res.fiberLengthKm = end ? end.distanceKm : null;
    res.wavelength = res.fixed ? res.fixed.wavelength : (res.general ? res.general.nominalWavelength : null);
    // Alguns equipamentos gravam o comprimento de onda em outra escala: usa o nominal do GenParams e avisa
    if (res.general && (!res.wavelength || res.wavelength < 600 || res.wavelength > 1700) && res.general.nominalWavelength >= 600) {
      res.warnings.push('Comprimento de onda do FxdParams (' + res.wavelength + ') fora da faixa; usado o valor nominal ' + res.general.nominalWavelength + ' nm do GenParams.');
      res.wavelength = res.general.nominalWavelength;
    }
    res.totalLoss = res.summary && !res.summary.error && res.summary.totalLoss > 0 ? res.summary.totalLoss : null;
    res.totalLossOrigin = res.totalLoss != null ? 'arquivo' : null;
    // Se o arquivo não traz a perda total, calcula pelo método SR-4731: perdas dos eventos + atenuação × comprimento de cada seção
    if (res.totalLoss == null && res.events && res.events.length > 1) {
      let t = 0, ok = true;
      for (let i = 1; i < res.events.length; i++) {
        const a = res.events[i - 1], b = res.events[i];
        if (!(b.slope > 0)) { ok = false; break; }
        t += b.slope * (b.distanceKm - a.distanceKm);
        if (i > 0 && !b.end && i < res.events.length) t += Math.max(0, b.loss);
      }
      if (ok) { res.totalLoss = +t.toFixed(3); res.totalLossOrigin = 'calculado'; res.warnings.push('Perda total não gravada no arquivo: calculada pela soma das perdas dos eventos + atenuação de cada seção.'); }
    }
    res.orl = res.summary && res.summary.orl ? res.summary.orl : null;
    if (res.fiberLengthKm == null) res.missing.push('Comprimento total (sem evento de fim de fibra)');
    if (res.totalLoss == null) res.missing.push('Atenuação total');
    if (!res.orl) res.missing.push('ORL');
    res.ok = !!(res.fixed && (res.events || res.trace));
    return res;
  }

  /** Arquivos multi-traço (ex.: .msor) podem conter vários SOR concatenados. */
  function splitMulti(buf) {
    const u8 = new Uint8Array(buf);
    const starts = [];
    for (let i = 0; i < u8.length - 4; i++) {
      if (u8[i] === 77 && u8[i + 1] === 97 && u8[i + 2] === 112 && u8[i + 3] === 0) starts.push(i);
    }
    if (starts.length <= 1) return [buf];
    return starts.map((s, k) => buf.slice(s, k + 1 < starts.length ? starts[k + 1] : u8.length));
  }

  /** Reduz o traço para N pontos (min/max por janela) para gráficos e armazenamento. */
  function downsample(trace, maxPts = 1500) {
    if (!trace || !trace.y) return [];
    const y = trace.y, n = y.length, out = [];
    const step = Math.max(1, Math.ceil(n / (maxPts / 2)));
    for (let i = 0; i < n; i += step) {
      let lo = i, hi = i;
      for (let j = i; j < Math.min(n, i + step); j++) { if (y[j] < y[lo]) lo = j; if (y[j] > y[hi]) hi = j; }
      const a = Math.min(lo, hi), b = Math.max(lo, hi);
      out.push([+(a * trace.dxKm).toFixed(5), +y[a].toFixed(3)]);
      if (b !== a) out.push([+(b * trace.dxKm).toFixed(5), +y[b].toFixed(3)]);
    }
    return out;
  }

  return { parseSOR, splitMulti, downsample, SOL };
});
