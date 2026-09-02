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

  var app = null, notas = [], tab = 'pendiente', abierto = false, editando = 0, filtro = '';

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
  /* Cuanto lleva esperando una nota que sigue abierta. */
  function llevan(desde) {
    var n = Math.round((Date.now() - new Date(desde)) / 86400000);
    if (n <= 0) return 'abierta hoy';
    return n === 1 ? 'lleva 1 día' : 'lleva ' + n + ' días';
  }
  function dias(a, b) {
    if (!a || !b) return '';
    var n = Math.round((new Date(b) - new Date(a)) / 86400000);
    return n <= 0 ? 'el mismo día' : (n === 1 ? 'en 1 día' : 'en ' + n + ' días');
  }
  /* La entrega llega como '2026-09-10' pelado. Se le pega el mediodia para que el
     navegador no la corra un dia hacia atras por la zona horaria. */
  function soloDia(f) {
    if (!f) return null;
    var t = String(f).slice(0, 10).split('-');
    return t.length === 3 ? new Date(+t[0], +t[1] - 1, +t[2]) : null;
  }
  function fCorta(f) {
    var d = soloDia(f);
    return d ? d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) : '';
  }
  /* La fecha completa, dd/mm/aa. En el pie de la nota van fechas de verdad y no
     "hoy" o "ayer": son un compromiso con dia, y hay que poder compararlas
     contra la de entrega de un vistazo. */
  function fDia(f) {
    if (!f) return '';
    var d = String(f).length <= 10 ? soloDia(f) : new Date(f);
    if (!d || isNaN(d)) return '';
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + String(d.getFullYear()).slice(2);
  }
  /* Cuanto falta para la entrega. Negativo = ya se vencio. */
  function faltan(f) {
    var d = soloDia(f);
    if (!d) return null;
    var h = new Date();
    return Math.round((d - new Date(h.getFullYear(), h.getMonth(), h.getDate())) / 86400000);
  }
  /* Lo que se lee al lado de la fecha de entrega. En rojo si ya paso. */
  function plazo(f) {
    var n = faltan(f);
    if (n === null) return '';
    if (n < 0) return '<b class="nt-vence">vencida hace ' + (-n) + (n === -1 ? ' día' : ' días') + '</b>';
    if (n === 0) return '<b class="nt-vence">es hoy</b>';
    return n === 1 ? 'falta 1 día' : 'faltan ' + n + ' días';
  }
  /* El equipo. Sale siempre aunque todavia no tengan ninguna nota, que es lo que
     pasa el primer dia. El campo igual deja escribir otro nombre. */
  var EQUIPO = ['Sandra', 'Boso', 'Laura', 'Jose'];
  /* Para sugerir: el equipo mas cualquier otro nombre ya usado en esta app. */
  function responsables() {
    var v = EQUIPO.slice(), i;
    for (i = 0; i < notas.length; i++) {
      var r = (notas[i].responsable || '').trim();
      if (r && v.indexOf(r) < 0) v.push(r);
    }
    return v.sort(function (a, b) { return a.localeCompare(b, 'es'); });
  }
  /* Para FILTRAR: solo los que de verdad tienen notas. Filtrar por alguien sin
     una sola nota deja la lista en blanco y parece que se daño. */
  function respConNotas() {
    var v = [], i;
    for (i = 0; i < notas.length; i++) {
      var r = (notas[i].responsable || '').trim();
      if (r && v.indexOf(r) < 0) v.push(r);
    }
    return v.sort(function (a, b) { return a.localeCompare(b, 'es'); });
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
    '#nt-add{padding:0 18px 12px;display:flex;flex-direction:column;gap:7px}' +
    '.nt-fila{display:flex;gap:7px}' +
    '.nt-fila input{flex:1;min-width:0;border:1px solid #d9dee5;border-radius:9px;padding:8px 10px;font:inherit;color:#16202b}' +
    '.nt-lb{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;font-size:10px;' +
    'font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.04em}' +
    '.nt-lb input{width:100%;flex:none}' +
    '#nt-filtro{padding:0 18px 11px}' +
    '#nt-filtro select{width:100%;border:1px solid #d9dee5;border-radius:9px;padding:8px 10px;font:inherit;background:#fff;color:#16202b}' +
    '.nt-resp{display:inline-block;background:#eef2ff;color:#3a48b3;border-radius:20px;padding:1px 8px;' +
    'font-size:11px;font-weight:700;margin-right:5px}' +
    '.nt-vence{color:#c0392b;font-weight:700}' +
    '.nt-sinf{color:#b45309}' +
    '.nt-fin{display:inline-block;background:#eaf6f0;color:#1c7a3e;border:1px solid #bfe3ce;border-radius:7px;' +
    'padding:4px 10px;cursor:pointer;font-weight:700;font-size:11.5px;margin-top:6px;text-decoration:none}' +
    '.nt-it.ok .nt-t .nt-fin,.nt-it.ok .nt-t .nt-resp{text-decoration:none}' +
    '.nt-fin.re{background:#f1f3f6;color:#4b5563;border-color:#dde2e8}' +
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
    '.nt-t{cursor:text}' +
    '.nt-ed textarea{width:100%;border:1px solid #1f2937;border-radius:8px;padding:8px 10px;' +
    'font:inherit;resize:vertical;min-height:64px}' +
    '.nt-bts{display:flex;gap:7px;margin-top:7px}' +
    '.nt-ok{background:#1f2937;color:#fff;border:none;border-radius:7px;padding:6px 13px;' +
    'cursor:pointer;font-weight:700;font-size:12.5px}' +
    '.nt-can{background:#f1f3f6;color:#4b5563;border:none;border-radius:7px;padding:6px 13px;' +
    'cursor:pointer;font-weight:700;font-size:12.5px}' +
    '@media(max-width:560px){#nt-box{width:100%}}';

  function pinta() {
    /* De la mas vieja a la mas nueva: lo que lleva mas tiempo abierto es lo que
       hay que mirar primero. Antes salia al reves, por numero descendente. */
    var L = notas.filter(function (n) {
      return n.estado === tab && (!filtro || (n.responsable || '') === filtro);
    }).sort(function (a, b) {
      return String(a.creado_en || '').localeCompare(String(b.creado_en || ''));
    });
    var pend = notas.filter(function (n) { return n.estado === 'pendiente'; }).length;
    var b = document.getElementById('nt-btn');
    if (b) b.innerHTML = '📝' + (pend ? '<b>' + pend + '</b>' : '');
    var t = document.getElementById('nt-tab');
    if (t) t.innerHTML = '📝 Notas' + (pend ? ' (' + pend + ')' : '');
    var cont = document.getElementById('nt-list');
    if (!cont) return;
    document.getElementById('nt-tp').className = tab === 'pendiente' ? 'on' : '';
    document.getElementById('nt-tr').className = tab === 'resuelto' ? 'on' : '';
    document.getElementById('nt-add').style.display = tab === 'pendiente' ? 'flex' : 'none';
    var fr = document.getElementById('nt-filtro');
    if (fr) {
      var rs = respConNotas();
      /* El filtro solo aparece cuando hay a quien filtrar: con un responsable
         -o ninguno- es un desplegable que estorba. */
      fr.style.display = rs.length > 1 ? 'block' : 'none';
      fr.innerHTML = '<select onchange="Notas.filtrar(this.value)">' +
        '<option value="">Todos los responsables</option>' +
        rs.map(function (r) {
          return '<option value="' + esc(r) + '"' + (filtro === r ? ' selected' : '') + '>👤 ' + esc(r) + '</option>';
        }).join('') + '</select>';
    }
    var dl = document.getElementById('nt-resps');
    if (dl) dl.innerHTML = responsables().map(function (r) { return '<option value="' + esc(r) + '">'; }).join('');
    if (!L.length) {
      cont.innerHTML = '<div class="nt-vacio">' + (tab === 'pendiente'
        ? 'Nada pendiente por acá.' : 'Todavía no has cerrado ninguna.') + '</div>';
      return;
    }
    cont.innerHTML = L.map(function (n) {
      var ok = n.estado === 'resuelto';
      /* Quien responde, cuando se puso y para cuando quedo. Si ya se cerro, se
         cambia el plazo por la fecha de cierre y lo que tomo: eso es lo que
         despues deja ver que se quedo estancado. */
      var pie =
        (n.responsable ? '<span class="nt-resp">👤 ' + esc(n.responsable) + '</span>' : '') +
        'creada ' + fDia(n.creado_en) +
        (n.entrega ? ' · entrega ' + fDia(n.entrega) + (ok ? '' : ' · ' + plazo(n.entrega))
                   : ' · <span class="nt-sinf">sin fecha de entrega</span>') +
        (ok ? ' · concluida ' + fDia(n.resuelto_en) + ' · ' + dias(n.creado_en, n.resuelto_en)
            : ' · ' + llevan(n.creado_en));
      if (editando === n.id) {
        return '<div class="nt-it nt-ed">' +
          '<span class="nt-n">' + n.num + '</span>' +
          '<div class="nt-t"><textarea id="nt-e' + n.id + '">' + esc(n.texto) + '</textarea>' +
          '<div class="nt-fila" style="margin-top:7px">' +
            '<input id="nt-r' + n.id + '" list="nt-resps" placeholder="👤 Responsable" value="' + esc(n.responsable || '') + '">' +
          '</div>' +
          '<div class="nt-fila" style="margin-top:6px">' +
            '<label class="nt-lb">Fecha de entrega<input id="nt-f' + n.id + '" type="date" value="' + esc(String(n.entrega || '').slice(0, 10)) + '"></label>' +
          '</div>' +
          '<div class="nt-bts"><button class="nt-ok" onclick="Notas.guardar(' + n.id + ')">Guardar</button>' +
          '<button class="nt-can" onclick="Notas.editar(0)">Cancelar</button></div></div></div>';
      }
      /* El boton dice lo que hace. La casilla sola no se leia como "concluir",
         y en el celular era un blanco muy chiquito para el dedo. */
      var fin = '<button class="nt-fin' + (ok ? ' re' : '') + '" onclick="event.stopPropagation();Notas.marcar(' +
        n.id + ',' + (ok ? 'false' : 'true') + ')">' + (ok ? '↩ Reabrir' : '✓ Concluido') + '</button>';
      return '<div class="nt-it' + (ok ? ' ok' : '') + '">' +
        '<input type="checkbox"' + (ok ? ' checked' : '') + ' onchange="Notas.marcar(' + n.id + ',this.checked)">' +
        '<span class="nt-n">' + n.num + '</span>' +
        '<span class="nt-t" title="Clic para editar" onclick="Notas.editar(' + n.id + ')">' +
          esc(n.texto) + '<i>' + pie + '</i>' + fin + '</span>' +
        '<button class="nt-del" title="Editar" onclick="Notas.editar(' + n.id + ')">✏️</button>' +
        '<button class="nt-del" title="Borrar" onclick="Notas.borrar(' + n.id + ')">✕</button></div>';
    }).join('');
    if (editando) {
      var e = document.getElementById('nt-e' + editando);
      if (e) { e.focus(); e.setSelectionRange(e.value.length, e.value.length); }
    }
  }

  function cargar() {
    return api('nc_notas?app=eq.' + encodeURIComponent(app) +
      '&select=*&order=creado_en.asc&limit=500').then(function (d) {
        notas = d || []; pinta();
      });
  }

  /* La pestaña en la barra de arriba. Todas las apps tienen un <nav id="nav">, y
     casi todas lo repintan al cambiar de vista: por eso se vigila y se vuelve a
     poner sola en vez de ponerla una sola vez. */
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
      if (document.getElementById('nt-btn')) return;
      var b = document.createElement('button');
      b.id = 'nt-btn'; b.title = 'Mis pendientes de esta app'; b.innerHTML = '📝';
      b.onclick = Notas.abrir; document.body.appendChild(b);
    }
    function poner() {
      var nav = document.getElementById('nav');
      if (!nav) return false;
      if (!document.getElementById('nt-tab')) {
        var hermano = nav.querySelector('button, a');
        var t = document.createElement('button');
        t.id = 'nt-tab';
        t.type = 'button';
        if (hermano) t.className = hermano.className.replace(/on/g, '').trim();
        t.innerHTML = '📝 Notas';
        t.onclick = function (e) { e.preventDefault(); Notas.abrir(); };
        ncHilera(nav).appendChild(t);
      }
      var f = document.getElementById('nt-btn');
      if (f && f.parentNode) f.parentNode.removeChild(f);   // ya esta en la barra: sobra el circulo
      vigila(nav);
      return true;
    }
    if (!poner()) flotante();   // sin barra todavia: que igual se pueda abrir
    /* El reloj no se apaga a proposito: hay apts que borran y vuelven a pintar el
       #nav entero, y ahi el observador se queda mirando un elemento muerto. */
    setInterval(poner, 2000);
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
      /* Embebida en otra pagina, no. La plataforma abre el cotizador de Smart
         dentro de un iframe: ahi esta pagina no tiene barra de abajo, asi que el
         boton se volvia un circulo flotante ENCIMA de la cotizacion, y encima
         repetido, porque la pagina de afuera ya lo tiene en su barra. Manda la
         de afuera, que es la que tiene barra y sesion.
         El try es porque leer window.top de otro dominio revienta; y si revienta
         es justamente porque estamos embebidos. */
      try { if (window.top !== window.self) return; } catch (e) { return; }
      /* El permiso puede llegar despues: varias apps piden clave y solo ahi se sabe
         quien entro. Si viene una funcion, se le vuelve a preguntar hasta 30 segundos
         en vez de decidir una sola vez al cargar y dejar la pestana sin aparecer. */
      if (typeof permitido === 'function') {
        var veces = 0, self = this, args = arguments;
        (function reintenta() {
          var ok = false;
          try { ok = !!permitido(); } catch (e) { ok = false; }
          if (ok) return self.montar(args[0], true);
          if (++veces < 45) setTimeout(reintenta, 700);
        })();
        return;
      }
      if (!permitido) return;
      app = nombreApp;
      var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
      pestana();   // el circulo flotante ya NO se crea aca: lo decide pestana(), y solo si no hay barra
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
        '<div class="nt-fila"><input id="nt-resp" list="nt-resps" placeholder="👤 Responsable"></div>' +
        '<div class="nt-fila" style="align-items:flex-end">' +
        '<label class="nt-lb">Fecha de entrega<input id="nt-ent" type="date"></label>' +
        '<button onclick="Notas.agregar()">Guardar</button></div>' +
        '<datalist id="nt-resps"></datalist></div>' +
        '<div id="nt-filtro"></div>' +
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
      editando = 0;
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
      var r = document.getElementById('nt-resp'), f = document.getElementById('nt-ent');
      var cuerpo = { app: app, num: num, texto: v,
        responsable: (r && r.value || '').trim() || null,
        entrega: (f && f.value) || null };
      /* El responsable NO se borra al guardar: casi siempre se escriben varias
         seguidas para la misma persona. La fecha si, que cambia en cada una. */
      t.value = ''; if (f) f.value = ''; t.focus();
      api('nc_notas', { method: 'POST', body: JSON.stringify(cuerpo) }).then(cargar);
    },
    marcar: function (id, listo) {
      var b = { estado: listo ? 'resuelto' : 'pendiente', resuelto_en: listo ? new Date().toISOString() : null };
      api('nc_notas?id=eq.' + id, { method: 'PATCH', body: JSON.stringify(b) }).then(cargar);
    },
    editar: function (id) { editando = +id || 0; pinta(); },
    guardar: function (id) {
      var e = document.getElementById('nt-e' + id), v = (e && e.value || '').trim();
      if (!v) { alert('La nota no puede quedar vacía.'); return; }
      var r = document.getElementById('nt-r' + id), f = document.getElementById('nt-f' + id);
      var resp = (r && r.value || '').trim() || null, ent = (f && f.value) || null;
      var n = notas.filter(function (x) { return x.id === id; })[0];
      editando = 0;
      var igual = n && n.texto === v && (n.responsable || null) === resp &&
        (String(n.entrega || '').slice(0, 10) || null) === ent;
      if (igual) { pinta(); return; }   // no toco nada
      if (n) { n.texto = v; n.responsable = resp; n.entrega = ent; }
      pinta();
      api('nc_notas?id=eq.' + id, { method: 'PATCH',
        body: JSON.stringify({ texto: v, responsable: resp, entrega: ent }) }).then(cargar);
    },
    filtrar: function (v) { filtro = v || ''; pinta(); },
    borrar: function (id) {
      if (!confirm('¿Borrar esta nota?')) return;
      api('nc_notas?id=eq.' + id, { method: 'DELETE' }).then(cargar);
    }
  };
  window.Notas = Notas;
})();
