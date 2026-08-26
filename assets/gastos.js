/* ============================================================================
   GASTOS · el libro propio de cada negocio

   Se incluye igual que Plata y aparece la pestaña 💸 Gastos:

       <script src="../assets/gastos.js"></script>
       <script>Gastos.montar('smart_gastos','Smart Envases', App.rol==='admin')</script>

   NO es lo mismo que Plata, y la diferencia importa:
     · Gastos  = lo que ESTE negocio gasta y reporta. Con factura, IVA y forma
                 de pago. Es contabilidad.
     · Plata   = la vista de Negocios Cuánticos: «¿este negocio ya se paga solo
                 o lo estoy sosteniendo?». Es semáforo, no contabilidad.
   Por eso van en tablas distintas y no se suman entre sí.

   Cada negocio tiene su tabla: smart_gastos, soleparis_gastos, ff_gastos,
   lupe_gastos — todas con la misma forma que ced_gastos, para que este mismo
   archivo sirva en todas y se arregle en un solo lugar.
   ========================================================================= */
(function () {
  'use strict';
  var SB = 'https://fnayedgvamxktxfvywwl.supabase.co';
  var KEY = 'sb_publishable_NVTYNkJ0V6obLwgwjXza1g_3Ihp-xMv';
  var H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

  var TABLA = null, NEG = '', filas = [], mes = '', abierto = false, editando = null;

  /* Las mismas categorías de CED: si cada negocio inventa las suyas, después no
     se pueden comparar entre negocios. */
  var CATS = ['Arriendo', 'Nómina y aportes', 'Servicios públicos', 'Transporte y fletes',
    'Mercadeo y pauta', 'Papelería y oficina', 'Aseo y cafetería', 'Mantenimiento',
    'Impuestos y tasas', 'Tecnología', 'Comisiones bancarias', 'Herramientas y datos', 'Otros'];
  var FORMAS = ['Transferencia', 'Efectivo', 'Tarjeta', 'Cheque', 'Crédito'];

  function $(i) { return document.getElementById(i); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function nm(n) { return (Math.round(+n || 0)).toLocaleString('es-CO'); }
  function pl(n) { return '$' + nm(n); }
  function hoyISO() { return new Date().toISOString().slice(0, 10); }

  function api(path, opt) {
    opt = opt || {};
    return fetch(SB + '/rest/v1/' + path, { method: opt.method || 'GET', headers: H, body: opt.body })
      .then(function (r) { return r.text(); })
      .then(function (t) { try { return t ? JSON.parse(t) : []; } catch (e) { return []; } })
      .catch(function () { return []; });
  }

  var CSS = '' +
    '#gs-btn{position:fixed;right:18px;bottom:198px;z-index:9998;width:52px;height:52px;border-radius:50%;' +
    'border:none;cursor:pointer;background:#8a3d3d;color:#fff;font-size:21px;box-shadow:0 6px 22px rgba(0,0,0,.28)}' +
    '#gs-cap{position:fixed;inset:0;z-index:9999;background:rgba(15,18,22,.55);display:flex;' +
    'align-items:flex-end;justify-content:flex-end}' +
    '#gs-box{background:#fff;color:#16202b;width:min(540px,100%);height:100%;display:flex;flex-direction:column;' +
    'box-shadow:-8px 0 40px rgba(0,0,0,.3);font:14px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
    '#gs-box h3{margin:0;padding:16px 18px 12px;font-size:16px;display:flex;justify-content:space-between;align-items:center}' +
    '#gs-box h3 span{font-weight:400;font-size:12px;color:#6b7280}' +
    '#gs-x{background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280}' +
    '#gs-body{flex:1;overflow:auto;padding:0 18px 26px}' +
    '.gs-tot{background:#fdf2f2;border:1px solid #f3d6d6;border-radius:12px;padding:14px;text-align:center;margin-bottom:12px}' +
    '.gs-tot b{display:block;font-size:26px;color:#8a3d3d}' +
    '.gs-tot small{color:#6b7280}' +
    '.gs-f{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:10px 0}' +
    '.gs-f .full{grid-column:1/-1}' +
    '.gs-f label{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;margin-bottom:3px}' +
    '.gs-f input,.gs-f select,.gs-f textarea{width:100%;padding:9px 10px;border:1px solid #d7dce2;border-radius:9px;' +
    'font:inherit;background:#fff;box-sizing:border-box}' +
    '.gs-ok{width:100%;padding:12px;border:none;border-radius:10px;background:#8a3d3d;color:#fff;font:600 15px/1 inherit;cursor:pointer}' +
    '.gs-hint{font-size:11.5px;color:#6b7280;margin-top:6px}' +
    '.gs-row{display:flex;gap:10px;align-items:flex-start;padding:11px 0;border-top:1px solid #eef1f4}' +
    '.gs-row .c{flex:1;min-width:0}' +
    '.gs-row .c b{display:block;font-weight:600}' +
    '.gs-row .c small{color:#6b7280;display:block}' +
    '.gs-row .v{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}' +
    '.gs-row .v em{display:block;font-style:normal;font-size:11px}' +
    '.gs-row .x{background:none;border:none;color:#b9c0c8;cursor:pointer;font-size:15px}' +
    '.gs-deb{color:#b45309}.gs-pag{color:#15803d}' +
    '.gs-cat{display:flex;justify-content:space-between;font-size:12.5px;padding:4px 0;color:#4b5563}' +
    '.gs-vacio{padding:24px;text-align:center;color:#6b7280}' +
    '#gs-tab{}';

  /* Igual que en Plata: si el #nav está en columna, los botones extra van en su
     propia hilera para que no queden uno debajo del otro. */
  function ncHilera(nav) {
    var est = window.getComputedStyle ? window.getComputedStyle(nav) : null;
    if (!est || est.flexDirection !== 'column') return nav;
    var f = document.getElementById('nc-extra');
    if (!f || f.parentNode !== nav) {
      f = document.createElement('div'); f.id = 'nc-extra';
      f.className = 'nav-row nav-row2';
      f.style.display = 'flex'; f.style.width = '100%';
      nav.appendChild(f);
    }
    return f;
  }

  function pestana() {
    var vigilado = false;
    function vigila(nav) {
      if (vigilado) return;
      vigilado = true;
      try { new MutationObserver(function () { poner(); }).observe(nav, { childList: true }); } catch (e) {}
    }
    function flotante() {
      if (document.getElementById('gs-btn')) return;
      var b = document.createElement('button');
      b.id = 'gs-btn'; b.title = 'Lo que gasta este negocio'; b.innerHTML = '💸';
      b.onclick = Gastos.abrir; document.body.appendChild(b);
    }
    function poner() {
      var nav = document.getElementById('nav');
      if (!nav) return false;
      if (!document.getElementById('gs-tab')) {
        var hermano = nav.querySelector('button, a');
        var t = document.createElement('button');
        t.id = 'gs-tab'; t.type = 'button';
        if (hermano) t.className = hermano.className.replace(/on/g, '').trim();
        t.innerHTML = '💸 Gastos';
        t.onclick = function (e) { e.preventDefault(); Gastos.abrir(); };
        ncHilera(nav).appendChild(t);
      }
      var f = document.getElementById('gs-btn');
      if (f && f.parentNode) f.parentNode.removeChild(f);
      vigila(nav);
      return true;
    }
    if (!poner()) flotante();
    setInterval(poner, 2000);
  }

  function cargar() {
    api(TABLA + '?select=*&order=fecha.desc&limit=1000').then(function (d) {
      filas = Array.isArray(d) ? d : [];
      if (!mes) mes = hoyISO().slice(0, 7);
      pinta();
    });
  }

  function meses() {
    var s = {}; s[hoyISO().slice(0, 7)] = 1;
    filas.forEach(function (f) { if (f.fecha) s[String(f.fecha).slice(0, 7)] = 1; });
    return Object.keys(s).sort().reverse();
  }
  function nombreMes(m) {
    var M = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
             'septiembre','octubre','noviembre','diciembre'];
    var p = m.split('-'); return M[+p[1] - 1] + ' ' + p[0];
  }

  function pinta() {
    var b = $('gs-body'); if (!b) return;
    var delMes = filas.filter(function (f) { return String(f.fecha || '').slice(0, 7) === mes; });
    var total = delMes.reduce(function (s, f) { return s + (+f.monto || 0); }, 0);
    var debe  = delMes.filter(function (f) { return !f.pagado; })
                      .reduce(function (s, f) { return s + (+f.monto || 0); }, 0);
    var iva   = delMes.reduce(function (s, f) { return s + (+f.iva || 0); }, 0);

    var porCat = {};
    delMes.forEach(function (f) {
      var k = f.categoria || 'Sin categoría';
      porCat[k] = (porCat[k] || 0) + (+f.monto || 0);
    });
    var cats = Object.keys(porCat).sort(function (a, c) { return porCat[c] - porCat[a]; });

    b.innerHTML =
      '<div class="gs-tot"><small>' + esc(nombreMes(mes).toUpperCase()) + '</small>' +
        '<b>' + pl(total) + '</b>' +
        '<small>' + (debe ? 'Sin pagar ' + pl(debe) + ' · ' : '') +
        (iva ? 'IVA ' + pl(iva) : 'sin IVA registrado') + '</small></div>' +

      '<select id="gs-mes" style="width:100%;padding:9px 10px;border:1px solid #d7dce2;border-radius:9px;font:inherit;margin-bottom:12px">' +
        meses().map(function (m) {
          return '<option value="' + m + '"' + (m === mes ? ' selected' : '') + '>' + esc(nombreMes(m)) + '</option>';
        }).join('') + '</select>' +

      formulario() +

      (cats.length ? '<div style="margin:16px 0 6px;font-size:11px;letter-spacing:.05em;color:#6b7280">EN QUÉ SE FUE</div>' +
        cats.map(function (c) {
          return '<div class="gs-cat"><span>' + esc(c) + '</span><b>' + pl(porCat[c]) + '</b></div>';
        }).join('') : '') +

      '<div style="margin:16px 0 2px;font-size:11px;letter-spacing:.05em;color:#6b7280">GASTOS DEL MES</div>' +
      (delMes.length ? delMes.map(fila).join('')
        : '<div class="gs-vacio">Este mes no tiene gastos cargados.</div>');

    var s = $('gs-mes');
    if (s) s.onchange = function () { mes = this.value; editando = null; pinta(); };
    var iv = $('gs_iva');
    if (iv) iv.onchange = pintaIva;
    pintaIva();
  }

  function fila(f) {
    return '<div class="gs-row">' +
      '<div class="c"><b>' + esc(f.concepto || '(sin concepto)') + '</b>' +
        '<small>' + esc(String(f.fecha || '').slice(0, 10)) +
        (f.categoria ? ' · ' + esc(f.categoria) : '') +
        (f.proveedor ? ' · ' + esc(f.proveedor) : '') +
        (f.factura ? ' · fac ' + esc(f.factura) : '') + '</small></div>' +
      '<div class="v"><b>' + pl(f.monto) + '</b>' +
        '<em class="' + (f.pagado ? 'gs-pag' : 'gs-deb') + '">' + (f.pagado ? 'pagado' : 'sin pagar') + '</em></div>' +
      '<button class="x" title="Borrar" onclick="Gastos.borrar(\'' + esc(f.id) + '\')">✕</button>' +
      '</div>';
  }

  function formulario() {
    return '<div class="gs-f">' +
      '<div class="full"><label>Qué se gastó</label>' +
        '<input id="gs_con" placeholder="Ej: recarga de Google Maps"></div>' +
      '<div><label>Valor total</label><input id="gs_mon" inputmode="numeric" placeholder="0"></div>' +
      '<div><label>Fecha</label><input id="gs_fec" type="date" value="' + hoyISO() + '"></div>' +
      '<div><label>Categoría</label><select id="gs_cat">' +
        CATS.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</select></div>' +
      '<div><label>Proveedor</label><input id="gs_prov" placeholder="A quién se le pagó"></div>' +
      '<div><label>¿Tiene IVA?</label><select id="gs_iva"><option value="no">No</option><option value="si">Sí, 19%</option></select></div>' +
      '<div><label>Número de factura</label><input id="gs_fac" placeholder="opcional"></div>' +
      '<div><label>Forma de pago</label><select id="gs_fp">' +
        FORMAS.map(function (f) { return '<option>' + esc(f) + '</option>'; }).join('') + '</select></div>' +
      '<div><label>¿Ya se pagó?</label><select id="gs_pag"><option value="si">Sí</option><option value="no">No, queda debiendo</option></select></div>' +
      '<div class="full"><label>Nota</label><input id="gs_not" placeholder="opcional"></div>' +
      '<div class="full"><label>¿Se repite?</label><select id="gs_per">' +
        '<option value="unico">Una sola vez</option><option value="mensual">Todos los meses</option></select></div>' +
      '<div class="full"><button class="gs-ok" onclick="Gastos.guardar()">＋ Registrar gasto</button>' +
        '<div class="gs-hint" id="gs_hint">El valor se escribe completo. Si marcas IVA, se separa solo.</div></div>' +
      '</div>';
  }

  /* El IVA se separa del total, no se suma: quien carga el gasto tiene el recibo
     con el valor final, no la base. */
  function pintaIva() {
    var h = $('gs_hint'), iv = $('gs_iva'), mo = $('gs_mon');
    if (!h || !iv) return;
    var tot = +String((mo && mo.value) || '').replace(/\D/g, '') || 0;
    if (iv.value === 'si' && tot > 0) {
      var base = Math.round(tot / 1.19);
      h.textContent = 'De ' + pl(tot) + ': base ' + pl(base) + ' + IVA ' + pl(tot - base);
    } else {
      h.textContent = 'El valor se escribe completo. Si marcas IVA, se separa solo.';
    }
  }

  var Gastos = {
    soyJose: function () {
      try { return localStorage.getItem('nc_notas_ok') === '1'; } catch (e) { return false; }
    },
    montar: function (tabla, nombre, permitido) {
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
      if (!permitido || !tabla) return;
      if (window.__gsMontado) return;
      window.__gsMontado = true;
      TABLA = tabla; NEG = nombre || tabla;
      var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
      pestana();
    },
    abrir: function () {
      if (abierto) return;
      abierto = true;
      var c = document.createElement('div');
      c.id = 'gs-cap';
      c.onclick = function (e) { if (e.target === c) Gastos.cerrar(); };
      c.innerHTML = '<div id="gs-box"><h3>💸 Gastos <span>' + esc(NEG) + '</span>' +
        '<button id="gs-x" onclick="Gastos.cerrar()">✕</button></h3>' +
        '<div id="gs-body"><div class="gs-vacio">Cargando…</div></div></div>';
      document.body.appendChild(c);
      cargar();
    },
    cerrar: function () { var c = $('gs-cap'); if (c) c.remove(); abierto = false; },
    guardar: function () {
      var con = ($('gs_con') || {}).value || '';
      var tot = +String(($('gs_mon') || {}).value || '').replace(/\D/g, '') || 0;
      if (!con.trim()) { alert('Escribe qué se gastó.'); return; }
      if (tot <= 0) { alert('Ponle el valor.'); return; }
      var conIva = ($('gs_iva') || {}).value === 'si';
      var base = conIva ? Math.round(tot / 1.19) : tot;
      var pagado = ($('gs_pag') || {}).value === 'si';
      var fecha = ($('gs_fec') || {}).value || hoyISO();
      var b = {
        fecha: fecha, concepto: con.trim(),
        categoria: ($('gs_cat') || {}).value || null,
        proveedor: (($('gs_prov') || {}).value || '').trim() || null,
        factura: (($('gs_fac') || {}).value || '').trim() || null,
        monto: tot, base: base, iva: tot - base, tiene_iva: conIva,
        forma_pago: ($('gs_fp') || {}).value || null,
        pagado: pagado, fecha_pago: pagado ? fecha : null,
        periodicidad: ($('gs_per') || {}).value || 'unico',
        notas: (($('gs_not') || {}).value || '').trim() || null
      };
      api(TABLA, { method: 'POST', body: JSON.stringify(b) }).then(function () { cargar(); });
    },
    borrar: function (id) {
      if (!confirm('¿Borrar este gasto?')) return;
      api(TABLA + '?id=eq.' + encodeURIComponent(id), { method: 'DELETE' }).then(cargar);
    }
  };
  window.Gastos = Gastos;
})();
