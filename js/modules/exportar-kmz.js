/* ClickIP FiberControl — Exportação KMZ/KML: rota, caixas e eventos ruins do OTDR
 * ---------------------------------------------------------------------------------
 * Gera um arquivo para Google Earth / Google Maps / QGIS com:
 *   • a ROTA do trecho (t.coords, em [lat, lng]);
 *   • as CAIXAS (t.caixas) — com coordenadas próprias ou posicionadas pela distância no traçado;
 *   • os EVENTOS RUINS do teste OTDR (nível "reprovado" e "atenção" de FC.calc.analyze),
 *     posicionados sobre a rota a partir da distância medida, usando o mesmo fator
 *     (OTDR ÷ OZmap), bobina de lançamento e sentido de medição do diagrama de caixas.
 *
 * Instalação: salvar em js/modules/exportar-kmz.js e incluir em index.html, depois de
 * js/modules/ferramentas.js e antes de <script>FC.boot();</script>:
 *   <script src="js/modules/exportar-kmz.js"></script>
 * Os botões "Exportar KMZ" aparecem sozinhos em Análise OTDR e em Comparativo > Caixas.
 */
(function (FC) {
  'use strict';
  const K = FC.kmz = FC.kmz || {};

  /* ---------- Geometria (própria, sem depender de FC.geo) ---------- */
  const R = 6371008.8, rad = (x) => x * Math.PI / 180;
  const hav = (a, b) => {
    const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  };
  const pathLen = (r) => { let s = 0; for (let i = 1; i < r.length; i++) s += hav(r[i - 1], r[i]); return s; };
  /** Ponto [lat, lng] a "d" metros do início da rota (d é limitado ao tamanho da rota) */
  const pointAt = (route, d) => {
    if (!route || !route.length) return null;
    if (route.length === 1 || d <= 0) return route[0].slice(0, 2);
    let cum = 0;
    for (let i = 1; i < route.length; i++) {
      const seg = hav(route[i - 1], route[i]);
      if (cum + seg >= d) { const t = seg ? (d - cum) / seg : 0; return [route[i - 1][0] + (route[i][0] - route[i - 1][0]) * t, route[i - 1][1] + (route[i][1] - route[i - 1][1]) * t]; }
      cum += seg;
    }
    return route[route.length - 1].slice(0, 2);
  };
  K._geo = { hav, pathLen, pointAt };

  /* ---------- XML ---------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  const cdata = (s) => '<![CDATA[' + String(s).replace(/\]\]>/g, ']]]]><![CDATA[>') + ']]>';
  const ll = (p) => `${p[1].toFixed(7)},${p[0].toFixed(7)},0`;
  const f = (v, d = 1) => (v == null || isNaN(v) ? '—' : (+v).toFixed(d).replace('.', ','));
  const LEVEL = { reprovado: 'Reprovado', atencao: 'Atenção', ok: 'OK' };
  const ICON = 'http://maps.google.com/mapfiles/kml/';
  // KML usa cor em AABBGGRR
  const STYLES = `
  <Style id="rota"><LineStyle><color>ffc8781f</color><width>4</width></LineStyle></Style>
  <Style id="caixa"><IconStyle><color>ffc8781f</color><scale>1.0</scale><Icon><href>${ICON}shapes/placemark_square.png</href></Icon></IconStyle><LabelStyle><scale>0.8</scale></LabelStyle></Style>
  <Style id="caixaRuim"><IconStyle><color>ff2a2ae0</color><scale>1.1</scale><Icon><href>${ICON}shapes/placemark_square.png</href></Icon></IconStyle><LabelStyle><scale>0.8</scale></LabelStyle></Style>
  <Style id="evReprovado"><IconStyle><scale>1.2</scale><Icon><href>${ICON}paddle/red-circle.png</href></Icon></IconStyle></Style>
  <Style id="evAtencao"><IconStyle><scale>1.1</scale><Icon><href>${ICON}paddle/ylw-circle.png</href></Icon></IconStyle></Style>
  <Style id="evOk"><IconStyle><scale>0.7</scale><Icon><href>${ICON}paddle/grn-circle.png</href></Icon></IconStyle><LabelStyle><scale>0</scale></LabelStyle></Style>
  <Style id="fim"><IconStyle><scale>1.2</scale><Icon><href>${ICON}paddle/orange-blank.png</href></Icon></IconStyle></Style>`;

  const table = (rows) => '<table border="0" cellpadding="3" cellspacing="0">' + rows.filter(Boolean).map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join('') + '</table>';

  /** Posição de um evento do OTDR sobre a rota. Mesma regra do diagrama de caixas. */
  K.eventPosition = (e, ctx) => {
    const x = Math.max(0, (e.distM - (ctx.launchM || 0)) / (ctx.factor || 1)); // metros do ponto de medição, em escala OZmap
    const fromA = ctx.fromB && ctx.oz ? ctx.oz - x : x;                        // metros a partir do POP A
    const clamp = Math.min(Math.max(fromA, 0), ctx.oz || fromA);
    const dGeom = ctx.oz ? clamp * (ctx.geoLen / ctx.oz) : clamp;               // alinha a geometria à distância oficial
    return { ozFromA: fromA, point: pointAt(ctx.route, Math.min(dGeom, ctx.geoLen)), beyond: ctx.oz ? fromA > ctx.oz * 1.0005 || fromA < 0 : false };
  };

  /**
   * Monta o KML. t = trecho, m = medição, r = FC.boxes.match(t, m), events = FC.calc.analyze(m, t).events
   * opts: { includeAttention=true, includeAll=false }
   */
  K.build = ({ link, t, m, r, events, opts = {} }) => {
    const o = Object.assign({ includeAttention: true, includeAll: false }, opts);
    let route = (t.coords || []).filter(p => p && isFinite(p[0]) && isFinite(p[1]));
    const caixas = t.caixas || [];
    const warnings = [];
    if (route.length < 2) {
      const pts = caixas.filter(c => isFinite(c.lat) && isFinite(c.lng)).sort((a, b) => (a.distM || 0) - (b.distM || 0)).map(c => [c.lat, c.lng]);
      if (pts.length >= 2) { route = pts; warnings.push('O trecho não tem traçado cadastrado: a rota foi aproximada ligando as caixas em linha reta. Importe o KMZ do OZmap no Comparativo > Caixas para ter o traçado real.'); }
      else throw new Error('Este trecho não tem traçado nem caixas com coordenadas. Importe o KMZ/KML do OZmap em Comparativo > Caixas e tente de novo.');
    }
    const geoLen = pathLen(route);
    const oz = (r && r.oz) || +t.ozmapM || geoLen;
    const ctx = { route, geoLen, oz, factor: r ? r.factor : 1, fromB: r ? r.fromB : false, launchM: m ? (+m.launchM || 0) : 0 };
    if (ctx.oz && Math.abs(geoLen - ctx.oz) / ctx.oz > 0.15) warnings.push(`A geometria (${f(geoLen, 0)} m) difere ${f(Math.abs(geoLen - ctx.oz) / ctx.oz * 100, 0)}% da distância do OZmap (${f(ctx.oz, 0)} m); as posições foram escaladas para a distância do OZmap.`);

    const bad = events.filter(e => !e.end && (e.level === 'reprovado' || (o.includeAttention && e.level === 'atencao')));
    const rest = o.includeAll ? events.filter(e => !e.end && !bad.includes(e)) : [];
    const endEv = events.find(e => e.end);
    const rowOf = new Map(); // evento nº → caixa casada
    (r ? r.rows : []).forEach(x => { if (x.ev) rowOf.set(x.ev.n, x); });
    const orphan = new Set((r ? r.orphans : []).map(e => e.n));

    const evPlacemark = (e, vis) => {
      const pos = K.eventPosition(e, ctx); if (!pos.point) return '';
      const cx = rowOf.get(e.n);
      const style = e.level === 'reprovado' ? 'evReprovado' : e.level === 'atencao' ? 'evAtencao' : 'evOk';
      const desc = table([['Avaliação', LEVEL[e.level] || e.level], ['Tipo', e.tipo], ['Distância no OTDR', f(e.distM, 1) + ' m'], ['Distância a partir de ' + (link && link.popA || 'A'), f(pos.ozFromA, 0) + ' m'], ['Perda', f(e.loss, 3) + ' dB'], ['Refletância', e.reflectance ? f(e.reflectance, 1) + ' dB' : null], ['Atenuação da seção', e.slope ? f(e.slope, 3) + ' dB/km' : null], ['Caixa (OZmap)', cx ? cx.c.nome : orphan.has(e.n) ? 'sem caixa no diagrama' : null], ['Observação', e.note]]);
      return `<Placemark><name>${esc(`Evento ${e.n} · ${f(e.loss, 2)} dB`)}</name>${vis ? '' : '<visibility>0</visibility>'}<styleUrl>#${style}</styleUrl><description>${cdata(desc + (pos.beyond ? '<p><i>Evento fora da extensão da rota; posição limitada ao extremo.</i></p>' : ''))}</description><Point><coordinates>${ll(pos.point)}</coordinates></Point></Placemark>`;
    };

    const boxPlacemark = (c) => {
      const row = r && r.rows.find(x => x.c === c);
      let p = isFinite(c.lat) && isFinite(c.lng) ? [c.lat, c.lng] : (c.distM != null ? pointAt(route, Math.min(c.distM * (geoLen / oz), geoLen)) : null);
      if (!p) return '';
      const ev = row && row.ev;
      const ruim = ev && (ev.level === 'reprovado' || ev.level === 'atencao');
      const sit = !row ? '' : { casada: 'Evento encontrado no OTDR', 'sem-evento': 'Sem evento no OTDR', passagem: 'Passagem / reserva', 'sem-medicao': 'Sem medição', 'sem-posicao': 'Sem posição' }[row.status];
      const desc = table([['Tipo', c.tipo], ['Distância no traçado', c.distM != null ? f(c.distM, 0) + ' m' : null], ['Ação', c.acao], ['Execução', c.status], ['Situação no OTDR', sit], ev ? ['Evento OTDR', `nº ${ev.n} · ${f(ev.distM, 1)} m · ${f(ev.loss, 3)} dB · ${LEVEL[ev.level] || ''}`] : null, c.obs ? ['Obs.', c.obs] : null]);
      return `<Placemark><name>${esc(c.nome)}</name><styleUrl>#${ruim ? 'caixaRuim' : 'caixa'}</styleUrl><description>${cdata(desc)}</description><Point><coordinates>${ll(p)}</coordinates></Point></Placemark>`;
    };

    const title = `${link ? link.nome : 'Enlace'} / ${t.nome}`;
    const resumo = `${bad.length} evento(s) ruim(ns) · ${caixas.length} caixa(s) · rota ${f(geoLen, 0)} m` + (m ? ` · medição de ${(m.data || '').slice(0, 10)}` : '');
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(title)}</name><description>${esc(resumo)}</description>${STYLES}
<Folder><name>Rota</name><Placemark><name>${esc(title)}</name><styleUrl>#rota</styleUrl><description>${cdata(table([['Enlace', link && link.nome], ['Trecho', t.nome], ['Comprimento da rota', f(geoLen, 0) + ' m'], ['Distância OZmap', f(oz, 0) + ' m'], m ? ['Distância OTDR', f(m.lengthM, 0) + ' m'] : null, m ? ['Medição', (m.data || '').slice(0, 16).replace('T', ' ') + (m.fileName ? ' · ' + m.fileName : '')] : null, ['Fator OTDR ÷ OZmap', f(ctx.factor, 4)]]))}</description><LineString><tessellate>1</tessellate><coordinates>${route.map(ll).join(' ')}</coordinates></LineString></Placemark></Folder>
<Folder><name>Caixas (${caixas.length})</name>${caixas.map(boxPlacemark).join('')}</Folder>
<Folder><name>Eventos ruins (${bad.length})</name>${bad.map(e => evPlacemark(e, true)).join('')}</Folder>${rest.length ? `<Folder><name>Demais eventos (${rest.length})</name><visibility>0</visibility>${rest.map(e => evPlacemark(e, false)).join('')}</Folder>` : ''}${endEv ? (() => { const p = K.eventPosition(endEv, ctx); return p.point ? `<Folder><name>Fim da fibra medida</name><Placemark><name>Fim da fibra (OTDR)</name><styleUrl>#fim</styleUrl><description>${cdata(table([['Distância no OTDR', f(endEv.distM, 1) + ' m'], ['Rota total (OZmap)', f(oz, 0) + ' m'], ['Falta até o fim da rota', f(ctx.fromB ? p.ozFromA : oz - p.ozFromA, 0) + ' m']]))}</description><Point><coordinates>${ll(p.point)}</coordinates></Point></Placemark></Folder>` : ''; })() : ''}
</Document></kml>`;
    return { kml, warnings, stats: { bad: bad.length, rest: rest.length, caixas: caixas.length, geoLen, oz, factor: ctx.factor } };
  };

  /** Empacota em KMZ (ZIP com doc.kml) */
  K.toKMZ = async (kml) => {
    const z = new window.JSZip(); z.file('doc.kml', kml);
    return z.generateAsync({ type: 'blob', mimeType: 'application/vnd.google-earth.kmz', compression: 'DEFLATE' });
  };

  /* ---------- Interface ---------- */
  const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); };

  K.exportFlow = (t, m) => {
    const U = FC.util, ui = FC.ui, C = FC.calc, store = FC.store;
    if (!t) return ui.toast('Selecione um trecho.', 'warn');
    if (!m) return ui.toast('Este trecho não tem medição OTDR. Importe um teste primeiro.', 'warn');
    const link = store.get('links', t.linkId) || {};
    const a = C.analyze(m, t); const n = a.events.filter(e => !e.end);
    const nBad = n.filter(e => e.level === 'reprovado').length, nWarn = n.filter(e => e.level === 'atencao').length;
    ui.modal({
      title: 'Exportar KMZ — ' + link.nome + ' / ' + t.nome,
      body: `<p class="small muted">Rota, caixas e eventos do teste de ${U.esc((m.data || '').slice(0, 10))} (${U.esc(m.fileName || 'registro manual')}). Abre no Google Earth, Google Maps (Meu Mapas) e QGIS.</p>
      <div class="note ${nBad ? 'bad' : 'ok'}">${ui.icon(nBad ? 'alert' : 'check')}<div><b>${nBad}</b> evento(s) reprovado(s) e <b>${nWarn}</b> em atenção, de ${n.length} evento(s).</div></div>
      <form class="grid" id="kf">
        <label class="check"><input type="checkbox" name="warn" checked> Incluir eventos em <b>atenção</b> (além dos reprovados)</label>
        <label class="check"><input type="checkbox" name="all"> Incluir também os demais eventos (ficam ocultos no mapa)</label>
        <div class="field"><span class="lbl">Formato</span><select name="fmt"><option value="kmz">KMZ (compactado)</option><option value="kml">KML (texto)</option></select></div>
      </form>`,
      actions: [{ label: 'Cancelar', cls: 'ghost' }, {
        label: 'Gerar arquivo', cls: 'primary', icon: 'download', onClick: async (b) => {
          const fd = ui.formData(U.$('#kf', b));
          try {
            let r = null; try { r = FC.boxes && FC.boxes.match(t, m); } catch (e) { /* segue sem caixas casadas */ }
            const out = K.build({ link, t, m, r, events: a.events, opts: { includeAttention: !!fd.warn, includeAll: !!fd.all } });
            const base = U.norm(`${link.nome}-${t.nome}`).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + (m.data || '').slice(0, 10);
            if (fd.fmt === 'kml') download(new Blob([out.kml], { type: 'application/vnd.google-earth.kml+xml' }), base + '.kml');
            else download(await K.toKMZ(out.kml), base + '.kmz');
            ui.toast(`Arquivo gerado: ${out.stats.bad} evento(s) ruim(ns), ${out.stats.caixas} caixa(s).` + (out.warnings.length ? ' Atenção: ' + out.warnings[0] : ''), out.warnings.length ? 'warn' : 'ok', out.warnings.length ? 10000 : 5000);
            store.audit && store.audit('exportou', 'trechos', t.id, 'KMZ/KML gerado: ' + base);
          } catch (e) { ui.toast(e.message, 'err', 9000); return false; }
        }
      }]
    });
  };

  /* ---------- Botões nas telas existentes (sem editar otdr.js / caixas.js) ---------- */
  const inject = () => {
    const U = FC.util, ui = FC.ui, store = FC.store, C = FC.calc; if (!U || !ui || !store || !C || !FC.route) return;
    const mk = (id, cls) => { const b = document.createElement('button'); b.id = id; b.className = cls; b.type = 'button'; b.innerHTML = ui.icon('map') + 'Exportar KMZ'; return b; };
    if (FC.route.id === 'otdr') {
      const rep = document.getElementById('rep');
      if (rep && !document.getElementById('kmzBtn')) {
        const p = FC.route.params || {};
        const m = p.measurementId ? store.get('measurements', p.measurementId) : p.trechoId ? C.latest(p.trechoId) : null;
        if (m) { const b = mk('kmzBtn', 'btn'); b.onclick = () => K.exportFlow(store.get('trechos', m.trechoId), m); rep.after(b); }
      }
    } else if (FC.route.id === 'comparativo') {
      const x = document.getElementById('bxX'), sel = document.getElementById('bxs');
      if (x && sel && !document.getElementById('kmzBtn2')) {
        const b = mk('kmzBtn2', 'btn'); b.onclick = () => { const t = store.get('trechos', sel.value); K.exportFlow(t, t && C.latest(t.id)); }; x.after(b);
      }
    }
  };
  let tmr = null;
  new MutationObserver(() => { clearTimeout(tmr); tmr = setTimeout(inject, 60); }).observe(document.documentElement, { childList: true, subtree: true });
})(window.FC = window.FC || {});
