/* ============================================================================
   BLOC DE NOTAS · los pendientes de José, uno por app

   Se incluye en cualquier app con una línea y aparece un botón flotante. Las
   notas se guardan en la nube (nc_notas) separadas por app, así que se ven
   igual desde el computador y desde el celular.

   Es privado: el botón solo aparece si la app dice que quien entró es José.
   Cada app lo sabe a su manera -por rol, por clave, por usuario- así que se le
   pasa esa decisión ya resuelta:

       <script src="../assets/notas.js"></script>
       <script>Notas.montar('nido', App.rol==='admin')</script>

   Una nota nace pendiente y numerada. Al marcarla como lista pasa a Resueltos
   con la fecha en que se escribió y la fecha en que se cerró, para poder mirar
   después cuánto se demoró cada cosa.
   ========================================================================= */
(function () {
  'use strict';
  var SB = 'https://fnayedgvamxktxfvywwl.supabase.co';
  var KEY = 'sb_publishable_NVTYNkJ0V6obLwgwjXza1g_3Ihp-xMv';
  var H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

  var app = null, notas = [], tab = 'pendiente', abierto = false;

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
  /* "hoy", "ayer" o la fecha corta: leer "hace 3 días" cansa más que ver la fecha */
  function fecha(f) {
    if (!f) return '';
    var d = new Date(f), h = new Date();
    var dd = Math.floor((new Date(h.getFullYear(), h.getMonth(), h.getDate()) -
      new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
    if (dd === 0) return 'hoy';
    if (dd === 1) return 'ayer';
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  }
  function dias(a, b) {
    if (!a || !b) return '';
    var n = Math.round((new Date(b) - new Date(a)) / 86400000);
    return n <= 0 ? 'el mismo día' : (n === 1 ? 'en 1 día' : 'en ' + n + ' días');
  }

  var CSS = '' +
    '#nt-btn{position:fixed;right:18px;bottom:18px;z-index:9998;width:52px;height:52px;border-radius:50%;' +
    'border:none;cursor:pointer;background:#1f2937;color:#fff;font-size:21px;box-shadow:0 6px 22px rgba(0,0,0,.28)}' +
    '#nt-btn:hover{background:#111827}' +
    '#nt-btn b{position:absolute;top:-3px;right:-3px;background:#e0533f;color:#fff;font-size:11px;' +
    'min-width:19px;height:19px;border-radius:10px;display:flex;align-items:center;justify-content:center;padding:0 4px}' +
    '#nt-cap{position:fixed;inset:0;z-index:9999;background:rgba(15,18,22,.55);display:flex;' +
    'align-items:flex-end;justify-content:flex-end;padding:0}' +
    '#nt-box{background:#fff;color:#16202b;width:min(430px,100%);height:100%;display:flex;flex-direction:column;' +
    'box-shadow:-8px 0 40px rgba(0,0,0,.3);font:14px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
    '#nt-box h3{margin:0;padding:16px 18px 12px;font-size:16px;display:flex;justify-content:space-between;align-items:center}' +
    '#nt-box h3 span{font-weight:400;font-size:12px;color:#6b7280}' +
    '#nt-x{background:none;border:none;font-size:22px;cursor:pointer;color:#6b7280;line-height:1}' +
    '#nt-tabs{display:flex;gap:6px;padding:0 18px 12px}' +
    '#nt-tabs button{flex:1;background:#f1f3f6;border:none;padding:8px;border-radius:8px;cursor:pointer;' +
    'font-size:13px;font-weight:700;color:#4b5563}' +
    '#nt-tabs button.on{background:#1f2937;color:#fff}' +
    '#nt-add{padding:0 18px 12px;display:flex;gap:8px}' +
    '#nt-add textarea{flex:1;border:1px solid #d9dee5;border-radius:9px;padding:9px 11px;font:inherit;' +
    'resize:vertical;min-height:44px;max-height:150px}' +
    '#nt-add button{background:#1f2937;color:#fff;border:none;border-radius:9px;padding:0 15px;' +
    'cursor:pointer;font-weight:700;font-size:13px}' +
    '#nt-list{flex:1;overflow:auto;padding:0 18px 22px}' +
    '.nt-it{display:flex;gap:11px;padding:11px 0;border-bottom:1px solid #eef1f4;align-items:flex-start}' +
    '.nt-it:last-child{border-bottom:none}' +
    '.nt-it input{width:19px;height:19px;margin-top:2px;flex:none;cursor:pointer;accent-color:#2f9e6e}' +
    '.nt-n{font-variant-numeric:tabular-nums;color:#9aa4b0;font-weight:700;font-size:12.5px;' +
    'min-width:26px;padding-top:2px;flex:none}' +
    '.nt-t{flex:1;white-space:pre-wrap;word-break:break-word}' +
    '.nt-t i{display:block;font-style:normal;color:#8b95a1;font-size:11.5px;margin-top:3px}' +
    '.nt-it.ok .nt-t{color:#8b95a1;text-decoration:line-through}' +
    '.nt-it.ok .nt-t i{text-decoration:none}' +
    '.nt-del{background:none;border:none;color:#c9ced6;cursor:pointer;font-size:15px;padding:0 2px;flex:none}' +
    '.nt-del:hover{color:#c0392b}' +
    '.nt-vacio{color:#9aa4b0;text-align:center;padding:34px 10px;font-size:13.5px}' +
    '@media(max-width:560px){#nt-box{width:100%}}';

  function pinta() {
    var L = notas.filter(function (n) { return n.estado === tab; });
    var pend = notas.filter(function (n) { return n.estado === 'pendiente'; }).length;
    var b = document.getElementById('nt-btn');
    if (b) b.innerHTML = '📝' + (pend ? '<b>' + pend + '</b>' : '');
    var cont = document.getElementById('nt-list');
    if (!cont) return;
    document.getElementById('nt-tp').className = tab === 'pendiente' ? 'on' : '';
    document.getElementById('nt-tr').className = tab === 'resuelto' ? 'on' : '';
    document.getElementById('nt-add').style.display = tab === 'pendiente' ? 'flex' : 'none';
    if (!L.length) {
      cont.innerHTML = '<div class="nt-vacio">' + (tab === 'pendiente'
        ? 'Nada pendiente por acá.' : 'Todavía no has cerrado ninguna.') + '</div>';
      return;
    }
    cont.innerHTML = L.map(function (n) {
      var ok = n.estado === 'resuelto';
      var pie = ok
        ? 'escrita ' + fecha(n.creado_en) + ' · cerrada ' + fecha(n.resuelto_en) + ' · ' + dias(n.creado_en, n.resuelto_en)
        : 'escrita ' + fecha(n.creado_en);
      return '<div class="nt-it' + (ok ? ' ok' : '') + '">' +
        '<input type="checkbox"' + (ok ? ' checked' : '') + ' onchange="Notas.marcar(' + n.id + ',this.checked)">' +
        '<span class="nt-n">' + n.num + '</span>' +
        '<span class="nt-t">' + esc(n.texto) + '<i>' + pie + '</i></span>' +
        '<button class="nt-del" title="Borrar" onclick="Notas.borrar(' + n.id + ')">✕</button></div>';
    }).join('');
  }

  function cargar() {
    return api('nc_notas?app=eq.' + encodeURIComponent(app) +
      '&select=*&order=estado,num.desc&limit=500').then(function (d) {
        notas = d || []; pinta();
      });
  }

  var Notas = {
    /* Las apps sin login no tienen cómo saber quién entró. Para esas, el bloc se
       desbloquea una sola vez entrando con ?notas=1 y queda guardado en ese
       navegador. No es una contraseña: es para que no le aparezca a nadie más
       que use la app en su propio equipo. */
    soyJose: function () {
      try {
        var p = new URLSearchParams(location.search).get('notas');
        if (p === '1') localStorage.setItem('nc_notas_ok', '1');
        if (p === '0') localStorage.removeItem('nc_notas_ok');
        return localStorage.getItem('nc_notas_ok') === '1';
      } catch (e) { return false; }
    },
    montar: function (nombreApp, permitido) {
      if (!permitido) return;
      app = nombreApp;
      var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
      var b = document.createElement('button');
      b.id = 'nt-btn'; b.title = 'Mis pendientes de esta app'; b.innerHTML = '📝';
      b.onclick = Notas.abrir; document.body.appendChild(b);
      cargar();
    },
    abrir: function () {
      if (abierto) return;
      abierto = true;
      var c = document.createElement('div');
      c.id = 'nt-cap';
      c.onclick = function (e) { if (e.target === c) Notas.cerrar(); };
      c.innerHTML = '<div id="nt-box">' +
        '<h3>📝 Mis pendientes <span>' + esc(app) + '</span>' +
        '<button id="nt-x" onclick="Notas.cerrar()">✕</button></h3>' +
        '<div id="nt-tabs"><button id="nt-tp" onclick="Notas.ver(\'pendiente\')">Pendientes</button>' +
        '<button id="nt-tr" onclick="Notas.ver(\'resuelto\')">Resueltos</button></div>' +
        '<div id="nt-add"><textarea id="nt-txt" placeholder="Qué falta por hacer acá…"></textarea>' +
        '<button onclick="Notas.agregar()">Guardar</button></div>' +
        '<div id="nt-list"></div></div>';
      document.body.appendChild(c);
      pinta();
      var t = document.getElementById('nt-txt');
      /* Ctrl+Enter guarda: escribir varias seguidas sin soltar el teclado */
      t.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); Notas.agregar(); }
      });
      t.focus();
    },
    cerrar: function () {
      var c = document.getElementById('nt-cap');
      if (c) c.remove();
      abierto = false;
    },
    ver: function (t) { tab = t; pinta(); },
    agregar: function () {
      var t = document.getElementById('nt-txt'), v = (t.value || '').trim();
      if (!v) return;
      /* El número es por app y no se reusa: si se borra la 7, la siguiente es la 8 */
      var num = notas.reduce(function (a, n) { return Math.max(a, +n.num || 0); }, 0) + 1;
      t.value = ''; t.focus();
      api('nc_notas', { method: 'POST', body: JSON.stringify({ app: app, num: num, texto: v }) })
        .then(cargar);
    },
    marcar: function (id, listo) {
      var b = { estado: listo ? 'resuelto' : 'pendiente', resuelto_en: listo ? new Date().toISOString() : null };
      api('nc_notas?id=eq.' + id, { method: 'PATCH', body: JSON.stringify(b) }).then(cargar);
    },
    borrar: function (id) {
      if (!confirm('¿Borrar esta nota?')) return;
      api('nc_notas?id=eq.' + id, { method: 'DELETE' }).then(cargar);
    }
  };
  window.Notas = Notas;
})();
