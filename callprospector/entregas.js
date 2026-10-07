/* LUPE CONTROL · 🤝 ENTREGAS (6-oct-2026, pedido de José)
 *
 * Aquí se le entrega a una persona (aliado o telemercaderista) un pedazo del árbol:
 *   empresa → departamento → municipio → zona → bases.
 * Cada base entregada es una BASE DE TRABAJO (mkr_trabajo): un filtro, no una copia.
 * Su nombre se arma solo: LÍNEA / Depto / Municipio / Zona / TIPO.
 *
 * Reglas (José):
 *  · Aliado = UNA sola empresa. Telemercaderista = puede tener varias (trabaja una a la vez).
 *  · Quien llama ve solo el nombre de sus bases, nunca el árbol ni las cantidades.
 *  · Dos aliados no pueden tener la misma base en zonas que se pisan (v1: se bloquea;
 *    el recorte automático "opción A" queda para después). Telemercaderistas sí pueden
 *    compartir: Lupe ya les reparte la lista.
 *  · La seguridad de verdad (que no puedan leer lo ajeno) es la fase 4: hasta entonces
 *    NO se le da acceso a aliados reales.
 *
 * Usa lo que ya define bases.html: $, esc, num, js, GET, GETALL, POST, PATCH, SB, H, M.
 */
const E = {
  paso: 0, cargado: false, arbol: [], trabajos: [], entregas: [], lineas: [],
  emp: '', baseSel: '', abiertos: {}, f: {},

  async cargar(forzar) {
    if (this.cargado && !forzar) return true;
    $('main').innerHTML = '<div class="vacio">Cargando el árbol…</div>';
    const [ar, tr, en, li, bi] = await Promise.all([
      GETALL('mkr_arbol?select=*'),
      GETALL('mkr_trabajo_estado?select=*'),
      GETALL('mkr_entrega?select=*'),
      GET('mkr_linea?select=*&order=orden'),
      GET('mkr_bases?select=id,nombre,cliente,en_lupe,arbol_nicho,arbol_tipo&activa=is.true&limit=300')
    ]);
    this.bInfo = {}; (Array.isArray(bi) ? bi : []).forEach(b => { this.bInfo[b.id] = b; });
    if (!Array.isArray(ar) || !Array.isArray(li)) {
      $('main').innerHTML = '<div class="aviso"><b>Falta la fase 2 en la base.</b><br>Correr _PLAYBOOK/lupe_arbol/fase2.sql</div>'; return false;
    }
    this.arbol = ar.map(r => ({ ...r, empresas: +r.empresas || 0, disponibles: +r.disponibles || 0 }));
    this.trabajos = Array.isArray(tr) ? tr : []; this.entregas = Array.isArray(en) ? en : []; this.lineas = li;
    if (!this.emp) this.emp = (li[0] || {}).cliente || 'ced';
    this.cargado = true; return true;
  },

  /* 📚 biblioteca: la base existe pero no se trabaja (no sale en Lupe ni se entrega) */
  enLupe(id) { return ((this.bInfo || {})[id] || {}).en_lupe !== false; },
  linea(c) { return this.lineas.find(l => l.cliente === c) || { linea: String(c || '').toUpperCase(), emoji: '🏢' }; },
  persona(id) { return (M.agentes || []).find(a => a.id === id) || {}; },
  /* ¿la ruta a contiene a b o b contiene a a? (para no entregar dos veces lo mismo) */
  sePisan(a, b) {
    for (const k of ['geo_depto', 'geo_municipio', 'geo_localidad']) {
      if (a[k] && b[k] && a[k] !== b[k]) return false;
    }
    return true;
  },
  /* entregas activas que caen en este nodo (mismo nivel o más arriba, o más abajo) */
  entregasEn(nodo, baseId) {
    return this.entregas.filter(e => e.activa).map(e => ({ e, t: this.trabajos.find(t => t.trabajo_id === e.trabajo_id) }))
      .filter(x => x.t && x.t.cliente === nodo.cliente && (!baseId || x.t.base_id === baseId) && x.t.activa !== false && this.sePisan(x.t, nodo));
  },
  /* quién tiene entregado EXACTAMENTE este punto del árbol (no lo de arriba ni lo de abajo) */
  quienes(nodo, baseId) {
    const igual = (a, b) => (a || null) === (b || null);
    const ex = this.entregas.filter(e => e.activa).map(e => ({ e, t: this.trabajos.find(t => t.trabajo_id === e.trabajo_id) }))
      .filter(x => x.t && x.t.cliente === nodo.cliente && (!baseId || x.t.base_id === baseId) && igual(x.t.geo_depto, nodo.geo_depto)
        && igual(x.t.geo_municipio, nodo.geo_municipio) && igual(x.t.geo_localidad, nodo.geo_localidad));
    return [...new Set(ex.map(x => this.persona(x.e.agente_id).nombre).filter(Boolean))];
  },
  /* los botones guardan su zona aquí y pasan solo el número: más seguro que meter JSON en el HTML */
  _nodos: [],
  nodo(n) { this._nodos.push(n); return this._nodos.length - 1; },

  async pintar() {
    if (!(await this.cargar())) return;
    if (this.paso > 0) return this.asistente();
    return this.mapaEntrega();
  },

  /* ================= MAPA DE ENTREGA ================= */
  mapaEntrega() {
    const emps = this.lineas.filter(l => this.arbol.some(r => r.empresa === l.cliente));
    const R0 = this.arbol.filter(r => r.empresa === this.emp && this.enLupe(r.base_id));
    const RB = this.arbol.filter(r => r.empresa === this.emp && !this.enLupe(r.base_id));
    /* PRIMERO LA BASE (José): se escoge qué base, y el árbol cuenta solo esa. */
    const BS = {}; R0.forEach(r => { const b = BS[r.base_id] = BS[r.base_id] || { id: r.base_id, tipo: r.tipo, n: 0 }; b.n += r.empresas; });
    const listaB = Object.values(BS).sort((a, b) => b.n - a.n);
    if (this.baseSel && !BS[this.baseSel]) this.baseSel = '';
    const R = this.baseSel ? R0.filter(r => r.base_id === this.baseSel) : R0;
    const suma = (rs) => rs.reduce((s, r) => s + r.empresas, 0);
    const grupos = (rs, k) => { const g = {}; rs.forEach(r => { const v = r[k] || ''; (g[v] = g[v] || []).push(r); }); return g; };
    const chip = (n) => n.length ? `<span style="color:#7FE3BE">🟢 ${esc(n.join(', '))}</span>` : '<span style="color:var(--faint)">⚪ libre</span>';
    this._nodos = [];
    const btn = (nodo) => `<button class="eb" onclick="event.stopPropagation();E.nuevo(E._nodos[${this.nodo({ ...nodo, base: this.baseSel })}])">🤝 Entregar</button>`;
    const fila = (nivel, txt, n, nodo, clave, abierto, hijos) => `
      <div class="en n${nivel}" ${hijos ? `onclick="E.toggle('${js(clave)}')"` : ''}>
        <span class="fl">${hijos ? (abierto ? '▾' : '▸') : '·'}</span>
        <span class="tx">${txt}<small>${chip(this.quienes(nodo, this.baseSel))}</small></span>
        <b class="mono">${num(n)}</b>${btn(nodo)}
      </div>`;
    /* Primera fila: la empresa entera. Para arrancar se entrega la base completa
       (todas las ciudades); cuando toque barrer y tamizar, se quita y se entrega por zonas. */
    let html = fila(0, '🇨🇴 Todo el país', suma(R), { cliente: this.emp }, this.emp + '|*', false, false);
    const D = grupos(R, 'departamento');
    Object.keys(D).sort((a, b) => suma(D[b]) - suma(D[a])).forEach(dep => {
      const kd = this.emp + '|' + dep, ad = !!this.abiertos[kd];
      const nd = { cliente: this.emp, geo_depto: dep || null };
      html += fila(1, '🗺️ ' + esc(dep || '(sin departamento)'), suma(D[dep]), nd, kd, ad, true);
      if (!ad) return;
      const Mu = grupos(D[dep], 'municipio');
      Object.keys(Mu).sort((a, b) => suma(Mu[b]) - suma(Mu[a])).forEach(mun => {
        const km = kd + '|' + mun, am = !!this.abiertos[km];
        const locs = grupos(Mu[mun], 'localidad'); const hayLoc = Object.keys(locs).some(x => x);
        const nm = { cliente: this.emp, geo_depto: dep || null, geo_municipio: mun || null };
        html += fila(2, '🏙️ ' + esc(mun || '(sin municipio)'), suma(Mu[mun]), nm, km, am, hayLoc);
        if (!am || !hayLoc) return;
        Object.keys(locs).filter(x => x).sort((a, b) => suma(locs[b]) - suma(locs[a])).forEach(loc => {
          html += fila(3, '📍 ' + esc(loc), suma(locs[loc]), { ...nm, geo_localidad: loc }, km + '|' + loc, false, false);
        });
        const sinLoc = locs[''] ? suma(locs['']) : 0;
        if (sinLoc) html += `<div class="en n3" style="opacity:.6"><span class="fl">·</span><span class="tx">sin zona ubicada en el mapa</span><b class="mono">${num(sinLoc)}</b></div>`;
      });
    });

    const personas = {};
    this.entregas.forEach(e => { (personas[e.agente_id] = personas[e.agente_id] || []).push(e); });
    const lista = Object.keys(personas).map(id => {
      const p = this.persona(id);
      const items = personas[id].map(e => {
        const t = this.trabajos.find(x => x.trabajo_id === e.trabajo_id) || {};
        return `<div class="ei ${e.activa ? '' : 'off'}"><span>${esc(t.nombre || '—')}</span>
          <span class="acc2">${e.activa
            ? `<button onclick="E.pausar('${e.id}',false)">⏸️ Pausar</button>`
            : `<button onclick="E.pausar('${e.id}',true)">▶️ Activar</button>`}
          <button class="r" onclick="E.quitar('${e.id}')">✖ Quitar</button></span></div>`;
      }).join('');
      return `<div class="ag"><div class="agh"><div class="n">${esc(p.nombre || '¿?')}
        <small>${p.rol === 'aliado' ? '🤝 Aliado · ' + esc(this.linea(p.cliente_aliado).linea) : '📞 Telemercaderista'} · ${esc(p.celular || '')}</small></div></div>${items}</div>`;
    }).join('');

    $('main').innerHTML = `<style>
      .echips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
      .echips button{background:var(--card2);border:1px solid var(--line);color:var(--dim);border-radius:20px;padding:8px 14px;font-weight:800;font-size:12.5px;cursor:pointer;font-family:inherit}
      .echips button.on{background:var(--naranja);border-color:var(--naranja);color:#fff}
      .en{display:flex;align-items:center;gap:9px;padding:10px 12px;border-bottom:1px solid var(--line);cursor:default}
      .en[onclick]{cursor:pointer}.en .fl{width:12px;color:var(--faint)} .en .tx{flex:1;min-width:0;font-weight:700;font-size:13.5px}
      .en .tx small{display:block;font-size:11px;font-weight:500;margin-top:2px} .en b{font-size:13px;color:var(--naranja2)}
      .en.n2{padding-left:30px}.en.n3{padding-left:50px;font-size:12.5px}
      .eb{background:rgba(37,192,138,.15);border:1px solid rgba(37,192,138,.45);color:#7FE3BE;border-radius:9px;padding:6px 9px;font-weight:800;font-size:11px;cursor:pointer;font-family:inherit;white-space:nowrap}
      .ebox{background:var(--card);border:1px solid var(--line);border-radius:15px;overflow:hidden;margin-bottom:14px}
      .ei{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 0;border-top:1px solid var(--line);font-size:12.5px}
      .ei.off{opacity:.45}.acc2{display:flex;gap:5px;flex:none}
      .acc2 button{border:1px solid var(--line);background:var(--card2);color:var(--dim);border-radius:8px;padding:5px 8px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit}
      .acc2 button.r{color:#FF9A8B;border-color:rgba(240,96,77,.42)}
    </style>
    <section><h2>🤝 Entregas · mapa</h2>
      <div class="echips">${emps.map(l => `<button class="${l.cliente === this.emp ? 'on' : ''}" onclick="E.emp='${js(l.cliente)}';E.pintar()">${l.emoji || ''} ${esc(l.linea)}</button>`).join('')}
        <button onclick="E.nuevo({cliente:E.emp, base:E.baseSel})" style="margin-left:auto;background:var(--naranja);border-color:var(--naranja);color:#fff">＋ Nueva entrega</button></div>
      <div style="font-size:11px;color:var(--faint);font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin:4px 0 6px">1 · Escoge la base</div>
      <div class="echips">${['', ...listaB.map(b => b.id)].map(id => { const b = BS[id];
        return `<button class="${id === this.baseSel ? 'on' : ''}" onclick="E.baseSel='${js(id)}';E.abiertos={};E.mapaEntrega()">${b ? esc(b.tipo) + ' · ' + num(b.n) : 'Todas las bases'}</button>`; }).join('')}</div>
      <div style="font-size:11px;color:var(--faint);font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin:10px 0 6px">2 · Escoge dónde</div>
      <div class="ebox">${html || '<div class="vacio">Esta empresa no tiene datos en Lupe.</div>'}</div>
      <div class="nota">${this.baseSel ? 'Contando solo <b>' + esc((BS[this.baseSel] || {}).tipo || '') + '</b>.' : 'Contando todas las bases.'} El número es cuántas empresas hay en esa rama (solo lo ves tú). 🟢 = ya entregada a alguien
        en ese mismo punto. Abre un departamento para ver sus municipios y zonas.</div>
    </section>
    <section><h2>📚 Biblioteca de bases</h2>
      <div class="nota" style="margin-bottom:10px">Están guardadas y las ves aquí, pero <b>no salen en la app de Lupe</b> ni se pueden entregar.
        Cuando decidas trabajar una, súbela a Lupe.</div>
      <div class="ebox">${(() => { const g = {}; RB.forEach(r => { const b = g[r.base_id] = g[r.base_id] || { id: r.base_id, tipo: r.tipo, nicho: r.nicho, n: 0, d: 0 }; b.n += r.empresas; b.d += r.disponibles; });
        const xs = Object.values(g).sort((a, b) => b.n - a.n);
        return xs.length ? xs.map(b => `<div class="en"><span class="fl">📚</span><span class="tx">${esc(b.tipo)}<small style="color:var(--faint)">${esc(b.nicho)} · ${num(b.d)} disponibles de ${num(b.n)}</small></span>
          <button class="eb" onclick="E.moverBase('${js(b.id)}',true)">⬆️ Subir a Lupe</button></div>`).join('')
          : '<div class="vacio" style="padding:16px">No hay bases en la biblioteca de esta empresa.</div>'; })()}</div>
      ${listaB.length ? `<div class="nota" style="margin-top:6px">En Lupe ahora: ${listaB.map(b => `${esc(b.tipo)} <a href="#" onclick="E.moverBase('${js(b.id)}',false);return false" style="color:var(--faint)">(⬇️ a biblioteca)</a>`).join(' · ')}</div>` : ''}
    </section>
    <section><h2>Quién tiene qué</h2>${lista || '<div class="vacio">Todavía no hay entregas.</div>'}</section>`;
  },
  toggle(k) { this.abiertos[k] = !this.abiertos[k]; this.mapaEntrega(); },

  /* ================= ASISTENTE (5 pasos) ================= */
  nuevo(nodo) {
    nodo = nodo || {};
    this.f = { nueva: true, rol: 'aliado', nombre: '', celular: '', cedula: '', agente: '', cliente: nodo.cliente || this.emp,
      geo_depto: nodo.geo_depto || null, geo_municipio: nodo.geo_municipio || null, geo_localidad: nodo.geo_localidad || null,
      bases: nodo.base ? { [nodo.base]: true } : {}, puede_agregar: false, zonaFija: !!nodo.geo_depto };
    this.paso = 1; this.pintar();
  },
  cancelar() { this.paso = 0; this.pintar(); },
  ir(p) { this.paso = p; this.pintar(); },

  asistente() {
    const f = this.f, L = this.linea(f.cliente);
    const ruta = [L.linea, f.geo_depto, f.geo_municipio, f.geo_localidad].filter(Boolean).join(' / ');
    const cab = (n, t) => `<div style="display:flex;gap:6px;margin-bottom:12px">${[1, 2, 3, 4, 5].map(i =>
      `<span style="flex:1;height:5px;border-radius:3px;background:${i <= n ? 'var(--naranja)' : 'var(--line)'}"></span>`).join('')}</div>
      <h2>Paso ${n} · ${t}</h2>`;
    const pie = (atras, sig, txtSig) => `<div class="acc" style="margin-top:14px">
      <button onclick="E.cancelar()">Cancelar</button>${atras ? `<button onclick="E.ir(${atras})">← Atrás</button>` : ''}
      ${sig ? `<button class="g" onclick="${sig}">${txtSig || 'Siguiente →'}</button>` : ''}</div>`;
    const css = `<style>.ef label{display:block;font-size:11px;color:var(--faint);font-weight:700;letter-spacing:.05em;text-transform:uppercase;margin:10px 0 4px}
      .ef input,.ef select{width:100%;background:var(--card2);border:1px solid var(--line);color:var(--tx);border-radius:10px;padding:11px;font-size:14px;font-family:inherit}
      .eopt{display:flex;gap:8px;flex-wrap:wrap}.eopt button{flex:1;min-width:120px;background:var(--card2);border:1px solid var(--line);color:var(--tx);border-radius:12px;padding:14px;font-weight:800;font-size:13.5px;cursor:pointer;font-family:inherit}
      .eopt button.on{background:var(--naranja);border-color:var(--naranja);color:#fff}
      .ez{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line);font-size:13.5px}
      .ez .tx{flex:1;font-weight:700;cursor:pointer}.ez b{color:var(--naranja2);font-size:12.5px}
      .ez button{background:rgba(37,192,138,.15);border:1px solid rgba(37,192,138,.45);color:#7FE3BE;border-radius:9px;padding:6px 9px;font-weight:800;font-size:11px;cursor:pointer;font-family:inherit}
      .ebx{background:var(--card);border:1px solid var(--line);border-radius:15px;overflow:hidden}
      .ech{display:flex;align-items:center;gap:10px;padding:12px;border-bottom:1px solid var(--line);font-size:13.5px}
      .ech input{width:20px;height:20px;accent-color:var(--naranja)}.ech .tx{flex:1}.ech small{display:block;color:var(--faint);font-size:11px}</style>`;

    let cuerpo = '';
    if (this.paso === 1) {
      const existentes = (M.agentes || []).filter(a => a.activo !== false);
      cuerpo = cab(1, '¿Quién es?') + `<div class="ef">
        <div class="eopt"><button class="${f.rol === 'aliado' ? 'on' : ''}" onclick="E.f.rol='aliado';E.pintar()">🤝 Aliado<br><small style="font-weight:500">una sola empresa</small></button>
          <button class="${f.rol === 'telemercaderista' ? 'on' : ''}" onclick="E.f.rol='telemercaderista';E.pintar()">📞 Telemercaderista<br><small style="font-weight:500">puede tener varias</small></button></div>
        <div class="eopt" style="margin-top:10px"><button class="${f.nueva ? 'on' : ''}" onclick="E.f.nueva=true;E.pintar()">Persona nueva</button>
          <button class="${!f.nueva ? 'on' : ''}" onclick="E.f.nueva=false;E.pintar()">Ya está en Lupe</button></div>
        ${f.nueva ? `<label>Nombre</label><input id="ef_n" value="${esc(f.nombre)}" placeholder="Nombre y apellido">
          <label>Celular · será su clave</label><input id="ef_c" value="${esc(f.celular)}" inputmode="numeric" placeholder="3xx xxx xxxx">
          <label>Cédula</label><input id="ef_d" value="${esc(f.cedula)}" inputmode="numeric">`
        : `<label>Persona</label><select id="ef_a"><option value="">— escoger —</option>${existentes.map(a =>
            `<option value="${a.id}" ${a.id === f.agente ? 'selected' : ''}>${esc(a.nombre)} · ${esc(a.rol === 'aliado' ? 'aliado ' + this.linea(a.cliente_aliado).linea : 'telemercaderista')}</option>`).join('')}</select>`}
      </div>` + pie(0, 'E.paso1()');
    }
    else if (this.paso === 2) {
      const ag = f.agente ? this.persona(f.agente) : null;
      const fijo = ag && ag.rol === 'aliado' && ag.cliente_aliado;
      const emps = this.lineas.filter(l => this.arbol.some(r => r.empresa === l.cliente));
      cuerpo = cab(2, '¿Para qué empresa?') + (fijo ? `<div class="nota">Es aliado de <b>${esc(this.linea(fijo).linea)}</b>: un aliado trabaja para una sola empresa.</div>` : '') +
        `<div class="eopt">${emps.map(l => `<button class="${l.cliente === f.cliente ? 'on' : ''}" ${fijo && fijo !== l.cliente ? 'disabled style="opacity:.3"' : ''}
           onclick="E.f.cliente='${js(l.cliente)}';E.f.bases={};${f.zonaFija ? '' : "E.f.geo_depto=null;E.f.geo_municipio=null;E.f.geo_localidad=null;"}E.pintar()">${l.emoji || ''} ${esc(l.linea)}</button>`).join('')}</div>` +
        pie(1, 'E.ir(3)');
    }
    else if (this.paso === 3) {
      /* PASO 3 · LA BASE PRIMERO (José): qué tipo de base se le pasa. Después se escoge dónde. */
      const rs = this.arbol.filter(r => r.empresa === f.cliente && this.enLupe(r.base_id));
      const B = {}; rs.forEach(r => { const b = B[r.base_id] = B[r.base_id] || { base_id: r.base_id, tipo: r.tipo, nicho: r.nicho, empresas: 0, disponibles: 0 }; b.empresas += r.empresas; b.disponibles += r.disponibles; });
      const lista = Object.values(B).sort((a, b) => a.nicho.localeCompare(b.nicho) || b.disponibles - a.disponibles).map(b =>
        `<label class="ech"><input type="checkbox" ${f.bases[b.base_id] ? 'checked' : ''} onchange="E.f.bases['${b.base_id}']=this.checked">
          <span class="tx"><b>${esc(b.tipo)}</b><small>${esc(b.nicho)} · ${num(b.disponibles)} disponibles de ${num(b.empresas)} en todo el país</small></span></label>`).join('');
      cuerpo = cab(3, '¿Qué base le das?') + `<div class="nota" style="margin-bottom:10px">Escoge una o varias. En el paso siguiente escoges dónde.</div>
        <div class="ebx">${lista || '<div class="vacio">Esta empresa no tiene bases con datos.</div>'}</div>` + pie(2, 'E.paso3()');
    }
    else if (this.paso === 4) {
      /* PASO 4 · DÓNDE: el árbol cuenta SOLO las bases escogidas. */
      const sel = Object.keys(f.bases).filter(k => f.bases[k]);
      const R = this.arbol.filter(r => r.empresa === f.cliente && sel.includes(r.base_id));
      const suma = rs => rs.reduce((s, r) => s + r.empresas, 0);
      const g = (rs, k) => { const o = {}; rs.forEach(r => { (o[r[k] || ''] = o[r[k] || ''] || []).push(r); }); return o; };
      const ocupado = nodo => sel.some(b => this.entregasEn(nodo, b).some(x => x.e.agente_id !== f.agente
        && (f.rol === 'aliado' || this.persona(x.e.agente_id).rol === 'aliado')));
      const quien = nodo => [...new Set(sel.flatMap(b => this.quienes(nodo, b)))];
      let lst = '', nivel = 'departamento', rs = R;
      if (f.geo_depto) { rs = rs.filter(r => r.departamento === f.geo_depto); nivel = 'municipio'; }
      if (f.geo_municipio) { rs = rs.filter(r => r.municipio === f.geo_municipio); nivel = 'localidad'; }
      const G = g(rs, nivel);
      const kNivel = { departamento: 'geo_depto', municipio: 'geo_municipio', localidad: 'geo_localidad' }[nivel];
      Object.keys(G).filter(x => x).sort((a, b) => suma(G[b]) - suma(G[a])).forEach(v => {
        const nodo = { cliente: f.cliente, geo_depto: f.geo_depto, geo_municipio: f.geo_municipio, geo_localidad: f.geo_localidad, [kNivel]: v };
        const q = quien(nodo), bloq = ocupado(nodo);
        const puedeBajar = nivel !== 'localidad' && (nivel === 'departamento' || G[v].some(r => r.localidad));
        lst += `<div class="ez"><span class="tx" ${puedeBajar ? `onclick="E.f.${kNivel}='${js(v)}';E.pintar()"` : ''}>${{ departamento: '🗺️', municipio: '🏙️', localidad: '📍' }[nivel]} ${esc(v)} ${puedeBajar ? '<span style="color:var(--faint)">›</span>' : ''}
          <small style="display:block;font-weight:500;font-size:11px;color:${q.length ? '#7FE3BE' : 'var(--faint)'}">${q.length ? '🟢 ' + esc(q.join(', ')) : '⚪ libre'}</small></span>
          <b class="mono">${num(suma(G[v]))}</b>${bloq ? '<span style="font-size:11px;color:#FF9A8B">ocupada</span>' : `<button onclick="E.f.${kNivel}='${js(v)}';E.ir(5)">✅ Entregar esta</button>`}</div>`;
      });
      const aqui = { cliente: f.cliente, geo_depto: f.geo_depto, geo_municipio: f.geo_municipio, geo_localidad: null };
      const tipos = sel.map(id => (this.arbol.find(r => r.base_id === id) || {}).tipo).filter(Boolean);
      const migas = [L.linea, f.geo_depto, f.geo_municipio].filter(Boolean);
      cuerpo = cab(4, '¿Dónde?') + `<div class="nota" style="margin-bottom:10px">🧭 ${esc(tipos.join(' + '))}<br>📍 ${esc(migas.join(' / '))}
          ${f.geo_depto ? ` · <a href="#" onclick="E.subir();return false" style="color:var(--naranja2)">subir un nivel</a>` : ''}</div>
        <div class="ez" style="background:rgba(232,98,26,.10);border:1px solid var(--naranja);border-radius:12px;margin-bottom:10px">
          <span class="tx">${f.geo_municipio ? '🏙️ Todo ' + esc(f.geo_municipio) : f.geo_depto ? '🗺️ Todo ' + esc(f.geo_depto) : '🇨🇴 Todo el país'}
            <small style="display:block;font-weight:500;font-size:11px;color:var(--faint)">${f.geo_depto ? 'este nivel completo' : 'la base completa, con todas sus ciudades · después se puede partir por zonas'}</small></span>
          <b class="mono">${num(suma(rs))}</b>${ocupado(aqui) ? '<span style="font-size:11px;color:#FF9A8B">ocupada</span>' : '<button onclick="E.f.geo_localidad=null;E.ir(5)">✅ Entregar todo</button>'}</div>
        <div class="ebx">${lst || '<div class="vacio">No hay más divisiones aquí.</div>'}</div>` + pie(3, null);
    }
    else if (this.paso === 5) {
      const nombre = f.nueva ? f.nombre : this.persona(f.agente).nombre;
      const bs = Object.keys(f.bases).filter(k => f.bases[k]);
      const tipos = bs.map(id => (this.arbol.find(r => r.base_id === id) || {}).tipo).filter(Boolean);
      cuerpo = cab(5, 'Confirmar') + `<div class="ag"><div style="font-size:15px;font-weight:800">${esc(nombre)}</div>
          <div style="color:var(--dim);font-size:12.5px;margin-top:4px">${f.rol === 'aliado' ? '🤝 Aliado' : '📞 Telemercaderista'} · ${L.emoji || ''} ${esc(L.linea)}</div>
          <div style="margin-top:10px;font-size:12.5px">Va a ver estas bases:</div>
          ${tipos.map(t => `<div class="mono" style="font-size:12px;color:var(--tx);margin-top:4px">• ${esc([ruta, t.toUpperCase()].join(' / '))}</div>`).join('')}
          ${f.rol === 'aliado' ? `<label class="ech" style="border:none;padding:12px 0 0"><input type="checkbox" ${f.puede_agregar ? 'checked' : ''} onchange="E.f.puede_agregar=this.checked">
            <span class="tx">Puede agregar negocios nuevos de su zona</span></label>` : ''}
        </div>
        <div class="nota">⚠️ Mientras no esté la fase 4 (seguridad), esto es para PROBAR con personas de confianza:
          Lupe todavía no impide técnicamente que alguien vea lo ajeno.</div>` + pie(4, 'E.guardar()', '🤝 Entregar y avisar por WhatsApp');
    }
    $('main').innerHTML = css + '<section>' + cuerpo + '</section>';
  },
  subir() { const f = this.f; if (f.geo_localidad) f.geo_localidad = null; else if (f.geo_municipio) f.geo_municipio = null; else f.geo_depto = null; this.pintar(); },

  paso1() {
    const f = this.f;
    if (f.nueva) {
      f.nombre = ($('ef_n').value || '').trim(); f.celular = ($('ef_c').value || '').replace(/\D/g, ''); f.cedula = ($('ef_d').value || '').replace(/\D/g, '');
      if (f.nombre.length < 3) return alert('Escribe el nombre');
      if (f.celular.length !== 10) return alert('El celular debe tener 10 dígitos');
      const ya = (M.agentes || []).find(a => String(a.celular || '').replace(/\D/g, '') === f.celular);
      if (ya) { if (!confirm(ya.nombre + ' ya está en Lupe con ese celular. ¿Usar esa persona?')) return; f.nueva = false; f.agente = ya.id; }
    } else {
      f.agente = $('ef_a').value; if (!f.agente) return alert('Escoge la persona');
      const a = this.persona(f.agente);
      if (a.rol === 'aliado') { f.rol = 'aliado'; if (a.cliente_aliado) f.cliente = a.cliente_aliado; }
    }
    this.ir(2);
  },
  paso3() { if (!Object.values(this.f.bases).some(Boolean)) return alert('Escoge al menos una base'); this.ir(4); },

  async rpc(fn, args) {
    const r = await fetch(SB + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
    const t = await r.text(); if (!r.ok) throw new Error((JSON.parse(t || '{}').message) || t); return JSON.parse(t || 'null');
  },

  async guardar() {
    const f = this.f;
    try {
      let id = f.agente;
      if (f.nueva || f.rol === 'aliado') {
        const p = f.nueva ? { n: f.nombre, c: f.celular, d: f.cedula } : (() => { const a = this.persona(f.agente); return { n: a.nombre, c: a.celular, d: a.cedula_aliado || '' }; })();
        id = await this.rpc('mkr_crear_persona', { p_nombre: p.n, p_celular: p.c, p_cedula: p.d, p_rol: f.rol, p_cliente: f.cliente });
      }
      const bs = Object.keys(f.bases).filter(k => f.bases[k]);
      const geo = { geo_depto: f.geo_depto || null, geo_municipio: f.geo_municipio || null, geo_localidad: f.geo_localidad || null };
      const enc = v => v ? 'eq.' + encodeURIComponent(v) : 'is.null';
      const nombres = [];
      for (const b of bs) {
        let t = await GET(`mkr_trabajo?select=id,nombre&base_id=eq.${b}&geo_depto=${enc(geo.geo_depto)}&geo_municipio=${enc(geo.geo_municipio)}&geo_localidad=${enc(geo.geo_localidad)}&limit=1`);
        t = Array.isArray(t) && t[0];
        if (!t) { const r = await POST('mkr_trabajo', { cliente: f.cliente, base_id: b, ...geo }); t = Array.isArray(r) && r[0]; }
        if (!t) throw new Error('No se pudo crear la base de trabajo');
        nombres.push(t.nombre);
        const r = await fetch(SB + '/rest/v1/mkr_entrega?on_conflict=agente_id,trabajo_id', { method: 'POST',
          headers: { ...H, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ agente_id: id, trabajo_id: t.id, activa: true, puede_agregar: !!f.puede_agregar }) });
        if (!r.ok) throw new Error('No se pudo guardar la entrega');
      }
      const a = (await GET('mkr_agentes?select=*&id=eq.' + id)) || []; if (a[0]) { M.agentes = M.agentes.filter(x => x.id !== id).concat(a[0]); }
      const p = a[0] || {};
      const msg = `Hola ${p.nombre || ''} 👋\nYa tienes acceso a Lupe para trabajar ${this.linea(f.cliente).linea}.\n\n` +
        `Entra aquí: https://negocioscuanticoscol-create.github.io/plataforma-nc/callprospector/lupe.html\n` +
        `Usuario: tu celular (${p.celular || ''})\nClave: tu celular\n\nTus bases:\n` + nombres.map(n => '• ' + n).join('\n');
      if (p.celular) window.open('https://wa.me/57' + String(p.celular).replace(/\D/g, '').slice(-10) + '?text=' + encodeURIComponent(msg), '_blank');
      this.paso = 0; await this.cargar(true); this.pintar();
    } catch (e) { alert('No se pudo entregar: ' + e.message); }
  },

  async moverBase(id, aLupe) {
    const b = (this.bInfo || {})[id] || {};
    const nom = b.arbol_tipo || b.nombre || 'esta base';
    if (!aLupe) {
      const usan = this.entregas.filter(e => e.activa && (this.trabajos.find(t => t.trabajo_id === e.trabajo_id) || {}).base_id === id);
      if (!confirm(`¿Pasar "${nom}" a la biblioteca?

Deja de salir en la app de Lupe para TODOS${usan.length ? ` (hoy la tienen entregada ${usan.length} persona(s))` : ''}. No se borra nada.`)) return;
    } else if (!confirm(`¿Subir "${nom}" a Lupe? Ya se podrá entregar y llamar.`)) return;
    const ok = await PATCH('mkr_bases?id=eq.' + id, { en_lupe: !!aLupe }); if (!ok) return alert('No se pudo');
    await this.cargar(true); this.pintar();
  },
  async pausar(id, activa) {
    const ok = await PATCH('mkr_entrega?id=eq.' + id, { activa }); if (!ok) return alert('No se pudo');
    await this.cargar(true); this.pintar();
  },
  async quitar(id) {
    if (!confirm('¿Quitarle esta base? Lo que ya llamó se queda guardado.')) return;
    const r = await fetch(SB + '/rest/v1/mkr_entrega?id=eq.' + id, { method: 'DELETE', headers: H });
    if (!r.ok) return alert('No se pudo'); await this.cargar(true); this.pintar();
  }
};
