/* ============================================================================
   PLATA · lo que entra y lo que sale, por negocio

   Se incluye igual que Horas y aparece la pestaña 💰 Plata:

       <script src="../assets/plata.js"></script>
       <script>Plata.montar('nido','Colchones Nido', App.rol==='admin')</script>

   Todo va a nc_finanzas con su negocio_id. La caja es una sola: acá se registra
   lo de este negocio, y el Centro de Mando suma todo — incluidos los gastos de la
   casa, que no son de ningún cliente pero se pagan igual.

   La pregunta que esto tiene que contestar no es «cuánto facturé»: es
   «¿este negocio ya se pagó solo, o lo estoy sosteniendo?».
   ========================================================================= */
(function () {
  'use strict';
  var SB = 'https://fnayedgvamxktxfvywwl.supabase.co';
  var KEY = 'sb_publishable_NVTYNkJ0V6obLwgwjXza1g_3Ihp-xMv';
  var H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

  var neg = null, negNom = '', mov = [], neginfo = null, mes = '', abierto = false;

  function api(path, opt) {
    opt = opt || {};
    return fetch(SB + '/rest/v1/' + path, { method: opt.method || 'GET', headers: H, body: opt.body })
      .then(function (r) { return r.text(); })
      .then(function (t) { try { return t ? JSON.parse(t) : []; } catch (e) { return []; } })
      .catch(function () { return []; });
  }
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  var $ = function (id) { return document.getElementById(id); };
  var val = function (id) { var e = $(id); return e ? e.value : ''; };
  var pl = function (n) { return '$' + Math.round(+n || 0).toLocaleString('es-CO'); };
  function mesHoy() { return new Date().toISOString().slice(0, 7); }
  function mesNom(ym) {
    if (!ym) return '';
    var M = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
      'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    var p = String(ym).split('-');
    return (M[+p[1] - 1] || ym) + ' ' + p[0];
  }
  /* Cuántos meses lleva costando. Es el reloj de la regla de los 4 meses. */
  function mesesDesde(d) {
    if (!d) return null;
    var a = new Date(d), h = new Date();
    return (h.getFullYear() - a.getFullYear()) * 12 + (h.getMonth() - a.getMonth());
  }

  var CATG = ['Herramienta', 'Pauta', 'Operación', 'Nómina', 'Casa', 'Otro'];
  var CATI = ['Cobro', 'Comisión', 'Venta', 'Otro'];

  var CSS = '' +
    '#pt-btn{position:fixed;right:18px;bottom:142px;z-index:9998;width:52px;height:52px;border-radius:50%;' +
    'border:none;cursor:pointer;background:#3d5a45;color:#fff;font-size:21px;box-shadow:0 6px 22px rgba(0,0,0,.28)}' +
    '#pt-cap{position:fixed;inset:0;z-index:9999;background:rgba(15,18,22,.55);display:flex;' +
    'align-items:flex-end;justify-content:flex-end}' +
    '#pt-box{background:#fff;color:#16202b;width:min(520px,100%);height:100%;display:flex;flex-direction:column;' +
    'box-shadow:-8px 0 40px rgba(0,0,0,.3);font:14px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
    '#pt-box h3{margin:0;padding:16px 18px 12px;font-size:16px;display:flex;justify-content:space-between;align-items:center}' +
    '#pt-box h3 span{font-weight:400;font-size:12px;color:#6b7280}' +
    '#pt-x{background:none;border:none;font-size:22px;cursor:pointer;color:#6b7280;line-height:1}' +
    '#pt-body{flex:1;overflow:auto;padding:0 18px 26px}' +
    '.pt-card{border:1px solid #e6eaef;border-radius:11px;padding:13px;margin-bottom:12px}' +
    '.pt-g{display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
    '.pt-g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}' +
    '#pt-box label{display:block;font-size:11px;letter-spacing:.05em;text-transform:uppercase;' +
    'color:#8b95a1;font-weight:600;margin:0 0 3px}' +
    '#pt-box input,#pt-box select{width:100%;border:1px solid #d9dee5;border-radius:8px;padding:8px 9px;' +
    'font:inherit;background:#fff;color:#16202b;box-sizing:border-box}' +
    '#pt-box .fila{margin-bottom:8px}' +
    '.pt-ok{width:100%;background:#1f2937;color:#fff;border:none;border-radius:9px;padding:11px;' +
    'cursor:pointer;font-weight:700;font-size:13.5px;margin-top:4px}' +
    '.pt-hint{font-size:11.5px;color:#8b95a1;margin-top:4px;line-height:1.45}' +
    '.pt-tit{font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:#8b95a1;' +
    'font-weight:700;margin:16px 0 7px}' +
    '.pt-fila{display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid #eef1f4}' +
    '.pt-fila:last-child{border-bottom:none}' +
    '.pt-fila .d{font-size:11.5px;color:#8b95a1;margin-top:2px}' +
    '.pt-fila b{font-variant-numeric:tabular-nums;white-space:nowrap}' +
    '.pt-in b{color:#2c6a4c} .pt-out b{color:#a8412a}' +
    '.pt-del{background:none;border:none;color:#c9ced6;cursor:pointer;font-size:12px;padding:0}' +
    '.pt-del:hover{color:#c0392b}' +
    '.pt-neto{border-radius:11px;padding:16px;text-align:center;margin-bottom:12px}' +
    '.pt-neto b{display:block;font-size:29px;font-variant-numeric:tabular-nums;line-height:1.1}' +
    '.pt-neto span{font-size:11.5px;letter-spacing:.07em;text-transform:uppercase;opacity:.85}' +
    '.pt-bien{background:#e3efe7;color:#2c6a4c} .pt-mal{background:#f8e9e4;color:#a8412a}' +
    '.pt-ver{border-left:3px solid #a8412a;background:#fbfcfb;padding:13px 15px;border-radius:0 9px 9px 0;' +
    'margin-bottom:12px;font-size:13.5px;line-height:1.55}' +
    '.pt-ver.ok{border-left-color:#2c6a4c}' +
    '.pt-ver b{display:block;margin-bottom:3px}' +
    '.pt-vacio{color:#9aa4b0;text-align:center;padding:24px 10px;font-size:13.5px}' +
    '@media(max-width:560px){#pt-box{width:100%}.pt-g3{grid-template-columns:1fr}}';

  function cargar() {
    return Promise.all([
      api('nc_finanzas?select=*&negocio_id=eq.' + encodeURIComponent(neg) + '&order=creado_en.desc&limit=500'),
      api('nc_negocio?select=*&id=eq.' + encodeURIComponent(neg))
    ]).then(function (r) {
      mov = r[0] || []; neginfo = (r[1] || [])[0] || {}; pinta();
    });
  }

  /* Una linea cuenta para un mes si es de ese mes, o si es fija (se repite todos). */
  function delMes(x, m) { return x.activo !== false && (x.mes === m || (!x.mes && x.fijo !== false)); }

  function pinta() {
    var body = $('pt-body');
    if (!body) return;
    if (!mes) mes = mesHoy();
    var meses = [mesHoy()];
    mov.forEach(function (x) { if (x.mes && meses.indexOf(x.mes) < 0) meses.push(x.mes); });
    meses.sort().reverse();

    var vis = mov.filter(function (x) { return delMes(x, mes); });
    var ent = vis.filter(function (x) { return x.tipo === 'ingreso'; });
    var sal = vis.filter(function (x) { return x.tipo === 'gasto'; });
    var tE = ent.reduce(function (s, x) { return s + (+x.monto || 0); }, 0);
    var tS = sal.reduce(function (s, x) { return s + (+x.monto || 0); }, 0);
    var neto = tE - tS;

    /* El veredicto: no mira el mes, mira toda la vida del negocio. */
    var vivos = mov.filter(function (x) { return x.activo !== false; });
    var totE = vivos.filter(function (x) { return x.tipo === 'ingreso'; })
      .reduce(function (s, x) { return s + (+x.monto || 0) * (x.mes ? 1 : Math.max(1, (mesesDesde(neginfo.arranco_en) || 0) + 1)); }, 0);
    var totS = vivos.filter(function (x) { return x.tipo === 'gasto'; })
      .reduce(function (s, x) { return s + (+x.monto || 0) * (x.mes ? 1 : Math.max(1, (mesesDesde(neginfo.arranco_en) || 0) + 1)); }, 0);
    var m = mesesDesde(neginfo.arranco_en);

    var ver = '';
    if (m === null) {
      ver = '<div class="pt-ver"><b>Falta la fecha de arranque</b>Sin ella no se puede medir la regla ' +
        'de los 4 meses. Ponla abajo y el veredicto aparece solo.</div>';
    } else if (totE >= totS && totE > 0) {
      ver = '<div class="pt-ver ok"><b>Ya se paga solo</b>Lleva ' + m + ' mes' + (m === 1 ? '' : 'es') +
        ' y ha traído ' + pl(totE) + ' contra ' + pl(totS) + ' de costo.</div>';
    } else if (m >= 4) {
      ver = '<div class="pt-ver"><b>Pasó los 4 meses sin cubrirse</b>Lleva ' + m + ' meses · ha traído ' +
        pl(totE) + ' contra ' + pl(totS) + ' de costo. Falta ' + pl(totS - totE) +
        '. Según tu regla, este es el que hay que soltar.</div>';
    } else {
      ver = '<div class="pt-ver"><b>Mes ' + (m + 1) + ' de 4</b>Ha traído ' + pl(totE) + ' contra ' +
        pl(totS) + ' de costo. Le quedan ' + (4 - m) + ' mes' + (4 - m === 1 ? '' : 'es') + ' para cubrirse.</div>';
    }

    var fila = function (x) {
      return '<div class="pt-fila ' + (x.tipo === 'ingreso' ? 'pt-in' : 'pt-out') + '">' +
        '<div style="min-width:0"><b style="font-weight:600;color:inherit">' + esc(x.concepto) + '</b>' +
        '<div class="d">' + esc(x.categoria || '') + (x.mes ? ' · solo ' + mesNom(x.mes) : ' · todos los meses') +
          (x.dia_pago ? ' · día ' + x.dia_pago : '') +
          (x.tipo === 'ingreso' ? (x.pagado ? ' · ✅ entró' : ' · ⏳ pendiente') : '') +
          ' · <button class="pt-del" onclick="Plata.borrar(' + x.id + ')">quitar</button></div></div>' +
        '<b>' + (x.tipo === 'ingreso' ? '' : '− ') + pl(x.monto) + '</b></div>';
    };

    body.innerHTML =
      '<div class="pt-neto ' + (neto >= 0 ? 'pt-bien' : 'pt-mal') + '">' +
        '<span>' + mesNom(mes) + '</span><b>' + (neto >= 0 ? '' : '− ') + pl(Math.abs(neto)) + '</b>' +
        '<span>entra ' + pl(tE) + ' · sale ' + pl(tS) + '</span></div>' +
      ver +
      '<div class="fila"><select onchange="Plata.mes(this.value)">' +
        meses.map(function (x) {
          return '<option value="' + x + '"' + (mes === x ? ' selected' : '') + '>' + mesNom(x) + '</option>';
        }).join('') + '</select></div>' +

      '<div class="pt-card">' +
        '<div class="pt-g">' +
          '<div class="fila"><label>Qué es</label><select id="pt_t" onchange="Plata.tipo()">' +
            '<option value="ingreso">Entra plata</option><option value="gasto">Sale plata</option></select></div>' +
          '<div class="fila"><label>Categoría</label><select id="pt_c"></select></div>' +
        '</div>' +
        '<div class="fila"><label>Concepto</label><input id="pt_n" placeholder="Ej: cuenta de cobro de agosto"></div>' +
        '<div class="pt-g3">' +
          '<div class="fila"><label>Valor</label><input id="pt_v" type="number" inputmode="numeric"></div>' +
          '<div class="fila"><label>Día de pago</label><input id="pt_d" type="number" min="1" max="31"></div>' +
          '<div class="fila"><label>¿Se repite?</label><select id="pt_f">' +
            '<option value="1">Todos los meses</option><option value="0">Solo ' + mesNom(mes) + '</option>' +
          '</select></div>' +
        '</div>' +
        '<button class="pt-ok" onclick="Plata.add()">+ Registrar</button>' +
        '<div class="pt-hint">Lo que se repite queda fijo y aparece cada mes sin volver a escribirlo.</div>' +
      '</div>' +

      '<div class="pt-tit">Entra · ' + pl(tE) + '</div>' +
      (ent.length ? ent.map(fila).join('') : '<div class="pt-vacio">Este negocio no tiene ningún ingreso registrado.</div>') +
      '<div class="pt-tit">Sale · ' + pl(tS) + '</div>' +
      (sal.length ? sal.map(fila).join('') : '<div class="pt-vacio">Sin gastos propios cargados.</div>') +

      '<div class="pt-tit">Desde cuándo cuesta</div>' +
      '<div class="pt-card"><div class="pt-g">' +
        '<div class="fila"><label>Arrancó el</label><input type="date" id="pt_ar" value="' +
          esc(neginfo.arranco_en || '') + '" onchange="Plata.arranco(this.value)"></div>' +
        '<div class="fila"><label>Meta al mes</label><input type="number" id="pt_mt" value="' +
          (+neginfo.meta_mes || 0) + '" onchange="Plata.meta(this.value)"></div>' +
      '</div><div class="pt-hint">La fecha de arranque es la que corre el reloj de los 4 meses.</div></div>';
    Plata.tipo();
  }

  /* Donde se cuelga la pestaña. Si el <nav> está en COLUMNA (el CED reparte sus
     botones en hileras completas), colgarse directo de él hace que cada uno se
     vuelva su propia hilera y los tres quedan en vertical, uno debajo del otro.
     Entonces los tres comparten UNA sola hilera, la última. En las apps cuyo nav
     va en fila, se cuelga directo como siempre. */
  function ncHilera(nav) {
    var est = window.getComputedStyle ? window.getComputedStyle(nav) : null;
    if (!est || est.flexDirection !== 'column') return nav;
    var f = document.getElementById('nc-extra');
    if (!f || f.parentNode !== nav) {
      f = document.createElement('div');
      f.id = 'nc-extra';
      f.className = 'nav-row nav-row2';
      f.style.display = 'flex';
      f.style.width = '100%';
      nav.appendChild(f);
    }
    return f;
  }

  /* Donde va el boton. La barra de abajo (#nav) muchas veces NO existe todavia
     cuando corre este script: varias apps la pintan despues del login. Antes se
     miraba UNA sola vez y, si no estaba, quedaba un circulo flotante encima del
     contenido para siempre. Ahora se sigue mirando: apenas aparece la barra el
     boton se pasa alla y el circulo se quita solo. */
  function pestana() {
    var vigilado = false;
    function vigila(nav) {
      if (vigilado) return;
      vigilado = true;
      try { new MutationObserver(function () { poner(); }).observe(nav, { childList: true }); }
      catch (e) {}
    }
    function flotante() {
      if (document.getElementById('pt-btn')) return;
      var b = document.createElement('button');
      b.id = 'pt-btn'; b.title = 'Lo que entra y sale de este negocio'; b.innerHTML = '💰';
      b.onclick = Plata.abrir; document.body.appendChild(b);
    }
    function poner() {
      var nav = document.getElementById('nav');
      if (!nav) return false;
      if (!document.getElementById('pt-tab')) {
        var hermano = nav.querySelector('button, a');
        var t = document.createElement('button');
        t.id = 'pt-tab';
        t.type = 'button';
        if (hermano) t.className = hermano.className.replace(/on/g, '').trim();
        t.innerHTML = '💰 Plata';
        t.onclick = function (e) { e.preventDefault(); Plata.abrir(); };
        ncHilera(nav).appendChild(t);
      }
      var f = document.getElementById('pt-btn');
      if (f && f.parentNode) f.parentNode.removeChild(f);   // ya esta en la barra: sobra el circulo
      vigila(nav);
      return true;
    }
    if (!poner()) flotante();   // sin barra todavia: que igual se pueda abrir
    /* El reloj no se apaga a proposito: hay apts que borran y vuelven a pintar el
       #nav entero, y ahi el observador se queda mirando un elemento muerto. */
    setInterval(poner, 2000);
  }

  var Plata = {
    soyJose: function () {
      try { return localStorage.getItem('nc_notas_ok') === '1'; } catch (e) { return false; }
    },
    montar: function (negocioId, nombre, permitido) {
      if (typeof permitido === 'function') {
        var veces = 0, self = this, args = arguments;
        (function reintenta() {
          var ok = false;
          try { ok = !!permitido(); } catch (e) { ok = false; }
          if (ok) return self.montar(args[0], args[1], true);
          if (++veces < 45) setTimeout(reintenta, 700);
        })();
        return;
      }
      if (!permitido || !negocioId) return;
      if (window.__ptMontado) return;
      window.__ptMontado = true;
      neg = negocioId; negNom = nombre || negocioId;
      var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
      pestana();
    },
    abrir: function () {
      if (abierto) return;
      abierto = true;
      var c = document.createElement('div');
      c.id = 'pt-cap';
      c.onclick = function (e) { if (e.target === c) Plata.cerrar(); };
      c.innerHTML = '<div id="pt-box"><h3>💰 Plata <span>' + esc(negNom) + '</span>' +
        '<button id="pt-x" onclick="Plata.cerrar()">✕</button></h3>' +
        '<div id="pt-body"><div class="pt-vacio">Cargando…</div></div></div>';
      document.body.appendChild(c);
      cargar();
    },
    cerrar: function () { var c = $('pt-cap'); if (c) c.remove(); abierto = false; },
    mes: function (m) { mes = m; pinta(); },
    tipo: function () {
      var s = $('pt_c'); if (!s) return;
      var L = val('pt_t') === 'ingreso' ? CATI : CATG;
      s.innerHTML = L.map(function (x) { return '<option>' + x + '</option>'; }).join('');
    },
    add: function () {
      var nom = (val('pt_n') || '').trim(), v = +val('pt_v') || 0;
      if (!nom) { alert('Escribe qué es.'); return; }
      if (!v) { alert('Pon el valor.'); return; }
      var fijo = val('pt_f') === '1';
      api('nc_finanzas', {
        method: 'POST', body: JSON.stringify({
          negocio_id: neg, empresa: neg, tipo: val('pt_t'), categoria: val('pt_c'),
          concepto: nom, monto: v, dia_pago: +val('pt_d') || null,
          fijo: fijo, mes: fijo ? null : mes, activo: true, pagado: false
        })
      }).then(cargar);
    },
    borrar: function (id) {
      if (!confirm('¿Quitar este movimiento?')) return;
      api('nc_finanzas?id=eq.' + id, { method: 'DELETE' }).then(cargar);
    },
    arranco: function (v) {
      api('nc_negocio?id=eq.' + neg, { method: 'PATCH', body: JSON.stringify({ arranco_en: v || null }) })
        .then(cargar);
    },
    meta: function (v) {
      api('nc_negocio?id=eq.' + neg, { method: 'PATCH', body: JSON.stringify({ meta_mes: +v || 0 }) })
        .then(cargar);
    }
  };
  window.Plata = Plata;
})();
