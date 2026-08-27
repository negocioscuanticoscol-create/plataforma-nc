/* ============================================================================
   HORAS · el tiempo que NC le trabaja a cada negocio

   Se incluye en cualquier app con una línea y aparece la pestaña ⏱️ Horas:

       <script src="../assets/horas.js"></script>
       <script>Horas.montar('nido','Colchones Nido', App.rol==='admin')</script>

   Todo va a nc_hora con su negocio_id, la misma tabla para todas las apps, así
   que el Centro de Mando suma el total sin que nadie registre dos veces. Sin
   esto no se sabe qué cliente sale caro ni cuánto cobrarle al siguiente.

   Antes esta pantalla estaba copiada dentro de Kruh y de Zarrat, cada copia con
   sus propias variantes. Acá vive una sola vez: se arregla en un sitio y queda
   arreglado en todas.
   ========================================================================= */
(function () {
  'use strict';
  var SB = 'https://fnayedgvamxktxfvywwl.supabase.co';
  var KEY = 'sb_publishable_NVTYNkJ0V6obLwgwjXza1g_3Ihp-xMv';
  var H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

  var neg = null, negNom = '', us = [], hs = [], mes = '', abierto = false, propTocado = false;

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
  var plata = function (n) { return '$' + Math.round(+n || 0).toLocaleString('es-CO'); };

  /* 95 minutos se lee peor que 1h 35m. */
  function hhmm(m) {
    m = Math.round(+m || 0);
    var h = Math.floor(m / 60);
    return h ? h + 'h ' + (m % 60) + 'm' : (m % 60) + 'm';
  }
  /* Si terminó "antes" de empezar es que pasó de medianoche, no que está mal. */
  function mins(i, f) {
    if (!i || !f) return 0;
    var a = i.split(':').map(Number), b = f.split(':').map(Number);
    var m = (b[0] * 60 + b[1]) - (a[0] * 60 + a[1]);
    if (m < 0) m += 1440;
    return m;
  }
  function mesNom(ym) {
    if (!ym) return '';
    var M = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
      'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    var p = ym.split('-');
    return (M[+p[1] - 1] || ym) + ' ' + p[0];
  }

  /* Programar, ir a una reunión y atender el teléfono no se cobran igual. */
  var TIPOS = ['Programación', 'Presencial', 'Virtual'];
  var AYUDA = {
    'Programación': 'el trabajo dentro de la app',
    'Presencial': 'visita o reunión con el cliente',
    'Virtual': 'atención telefónica o por chat'
  };
  /* El tipo dice CÓMO se trabajó; el propósito dice PARA QUÉ. Son dos preguntas
     distintas y sin la segunda no se ve lo único que importa de verdad: cuánto del
     día se fue en conseguir clientes y cuánto en construir. */
  var PROPS = ['Conseguir clientes', 'Estructurar', 'Atender', 'Administrar'];
  var PAYUDA = {
    'Conseguir clientes': 'prospectar, llamar, visitar, pautar — lo que trae plata nueva',
    'Estructurar': 'construir la app, la base, los agentes — lo que deja capacidad',
    'Atender': 'servirle a un cliente que ya compró',
    'Administrar': 'cuentas, trámites, plata'
  };
  /* Por defecto se propone según la hora, que es el ritmo que se quiere sostener:
     mañana para conseguir, tarde y noche para construir. Se puede cambiar siempre. */
  function propPorHora(hhmm) {
    var h = parseInt(String(hhmm || '').slice(0, 2), 10);
    if (isNaN(h)) h = new Date().getHours();
    return h < 13 ? 'Conseguir clientes' : 'Estructurar';
  }

  var CSS = '' +
    '#hr-btn{position:fixed;right:18px;bottom:80px;z-index:9998;width:52px;height:52px;border-radius:50%;' +
    'border:none;cursor:pointer;background:#2f4858;color:#fff;font-size:21px;box-shadow:0 6px 22px rgba(0,0,0,.28)}' +
    '#hr-cap{position:fixed;inset:0;z-index:9999;background:rgba(15,18,22,.55);display:flex;' +
    'align-items:flex-end;justify-content:flex-end}' +
    '#hr-box{background:#fff;color:#16202b;width:min(520px,100%);height:100%;display:flex;flex-direction:column;' +
    'box-shadow:-8px 0 40px rgba(0,0,0,.3);font:14px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
    '#hr-box h3{margin:0;padding:16px 18px 12px;font-size:16px;display:flex;justify-content:space-between;align-items:center}' +
    '#hr-box h3 span{font-weight:400;font-size:12px;color:#6b7280}' +
    '#hr-x{background:none;border:none;font-size:22px;cursor:pointer;color:#6b7280;line-height:1}' +
    '#hr-body{flex:1;overflow:auto;padding:0 18px 26px}' +
    '.hr-card{border:1px solid #e6eaef;border-radius:11px;padding:13px;margin-bottom:12px}' +
    '.hr-g{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}' +
    '.hr-g2{display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
    '#hr-box label{display:block;font-size:11px;letter-spacing:.05em;text-transform:uppercase;' +
    'color:#8b95a1;font-weight:600;margin:0 0 3px}' +
    '#hr-box input,#hr-box select{width:100%;border:1px solid #d9dee5;border-radius:8px;padding:8px 9px;' +
    'font:inherit;background:#fff;color:#16202b;box-sizing:border-box}' +
    '#hr-box .fila{margin-bottom:8px}' +
    '.hr-ok{width:100%;background:#1f2937;color:#fff;border:none;border-radius:9px;padding:11px;' +
    'cursor:pointer;font-weight:700;font-size:13.5px;margin-top:4px}' +
    '.hr-ok:disabled{opacity:.5;cursor:not-allowed}' +
    '.hr-hint{font-size:11.5px;color:#8b95a1;margin-top:4px;line-height:1.45}' +
    '.hr-tot{display:flex;justify-content:space-between;align-items:flex-end;gap:10px;margin-bottom:8px}' +
    '.hr-tot b{font-size:25px;font-variant-numeric:tabular-nums}' +
    '.hr-fila{display:flex;justify-content:space-between;gap:10px;padding:3px 0;font-size:13px}' +
    '.hr-fila b{font-variant-numeric:tabular-nums}' +
    '.hr-it{display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid #eef1f4}' +
    '.hr-it:last-child{border-bottom:none}' +
    '.hr-it .d{font-size:11.5px;color:#8b95a1;margin-top:2px}' +
    '.hr-del{background:none;border:none;color:#c9ced6;cursor:pointer;font-size:14px;padding:0 2px}' +
    '.hr-del:hover{color:#c0392b}' +
    '.hr-vacio{color:#9aa4b0;text-align:center;padding:26px 10px;font-size:13.5px}' +
    '.hr-tit{font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:#8b95a1;' +
    'font-weight:700;margin:16px 0 7px}' +
    '@media(max-width:560px){#hr-box{width:100%}.hr-g{grid-template-columns:1fr}}';

  function cargar() {
    return Promise.all([
      api('nc_usuario?select=*&activo=is.true&order=nombre.asc'),
      api('nc_hora?select=*&negocio_id=eq.' + encodeURIComponent(neg) + '&order=fecha.desc&limit=1000')
    ]).then(function (r) { us = r[0] || []; hs = r[1] || []; pinta(); });
  }

  function pinta() {
    var body = $('hr-body');
    if (!body) return;
    var meses = [];
    hs.forEach(function (x) {
      var m = String(x.fecha || '').slice(0, 7);
      if (m && meses.indexOf(m) < 0) meses.push(m);
    });
    meses.sort().reverse();
    if (mes && meses.indexOf(mes) < 0) mes = '';
    var vis = mes ? hs.filter(function (x) { return String(x.fecha || '').slice(0, 7) === mes; }) : hs;
    var tot = vis.reduce(function (s, x) { return s + (+x.minutos || 0); }, 0);
    var tarifa = function (id) {
      var u = us.filter(function (y) { return y.id === id; })[0];
      return +(u && u.tarifa_hora) || 0;
    };
    var vale = vis.reduce(function (s, x) { return s + (+x.minutos || 0) / 60 * tarifa(x.usuario_id); }, 0);
    var porU = {}, porT = {}, porP = {};
    vis.forEach(function (x) {
      porU[x.usuario_id] = (porU[x.usuario_id] || 0) + (+x.minutos || 0);
      var t = x.tipo || 'Programación';
      porT[t] = (porT[t] || 0) + (+x.minutos || 0);
      var p = x.proposito || 'Estructurar';
      porP[p] = (porP[p] || 0) + (+x.minutos || 0);
    });
    var conseguir = porP['Conseguir clientes'] || 0;
    var hoy = new Date().toISOString().slice(0, 10);

    body.innerHTML =
      '<div class="hr-card">' +
        '<div class="fila"><label>Quién</label>' +
          (us.length
            ? '<select id="hr_u">' + us.map(function (u) {
                return '<option value="' + u.id + '">' + esc(u.nombre) + '</option>'; }).join('') + '</select>'
            : '<div class="hr-hint">Primero agrega a alguien, abajo.</div>') + '</div>' +
        '<div class="hr-g2">' +
          '<div class="fila"><label>Fecha</label><input type="date" id="hr_f" value="' + hoy + '"></div>' +
          '<div class="fila"><label>Tipo</label><select id="hr_tp" onchange="Horas.tipo()">' +
            TIPOS.map(function (t) { return '<option>' + t + '</option>'; }).join('') + '</select></div>' +
        '</div>' +
        '<div class="fila"><label>¿Para qué fue este rato?</label>' +
          '<select id="hr_pr" onchange="Horas._tocaProp();Horas.tipo()">' +
          PROPS.map(function (t) {
            return '<option' + (t === propPorHora() ? ' selected' : '') + '>' + t + '</option>'; }).join('') +
          '</select></div>' +
        '<div class="hr-hint" id="hr_ayuda">' + AYUDA[TIPOS[0]] + '</div>' +
        '<div class="hr-g" style="margin-top:8px">' +
          '<div class="fila"><label>Empezó</label><input type="time" id="hr_i" onchange="Horas.calc()"></div>' +
          '<div class="fila"><label>Terminó</label><input type="time" id="hr_ff" onchange="Horas.calc()"></div>' +
          '<div class="fila"><label>Minutos</label><input type="number" id="hr_m" placeholder="solo" oninput="Horas.calc(1)"></div>' +
        '</div>' +
        '<div class="fila"><label>Qué se hizo</label><input id="hr_t" placeholder="Ej: liquidación por venta"></div>' +
        '<div class="hr-hint" id="hr_prev"></div>' +
        '<button class="hr-ok" onclick="Horas.agregar()"' + (us.length ? '' : ' disabled') + '>+ Registrar tiempo</button>' +
      '</div>' +

      '<div class="hr-card">' +
        '<div class="hr-tot"><div>' +
          '<select onchange="Horas.mes(this.value)" style="width:auto;min-width:150px">' +
            '<option value=""' + (mes ? '' : ' selected') + '>Todo</option>' +
            meses.map(function (m) {
              return '<option value="' + m + '"' + (mes === m ? ' selected' : '') + '>' + mesNom(m) + '</option>';
            }).join('') + '</select>' +
        '</div><div style="text-align:right"><b>' + hhmm(tot) + '</b>' +
          (vale ? '<div class="hr-hint">' + plata(vale) + ' a las tarifas cargadas</div>' : '') +
        '</div></div>' +
        (tot
          ? '<div class="hr-tit" style="margin-top:12px">Para qué se fue</div>' +
            Object.keys(porP).sort(function (a, b) { return porP[b] - porP[a]; }).map(function (p) {
              var pct = Math.round(porP[p] / tot * 100);
              return '<div class="hr-fila"><span>' + esc(p) + '</span>' +
                '<b>' + hhmm(porP[p]) + ' <span style="color:#8b95a1;font-weight:400">' + pct + '%</span></b></div>';
            }).join('') +
            /* Sin esta linea el tablero solo cuenta horas. Con ella dice si el dia
               se fue construyendo capacidad o consiguiendo con quien usarla. */
            '<div class="hr-hint" style="margin-top:6px">' +
              (conseguir ? Math.round(conseguir / tot * 100) + '% del tiempo fue a conseguir clientes.'
                         : 'Nada de este tiempo fue a conseguir clientes.') + '</div>' +
            '<div class="hr-tit" style="margin-top:14px">Cómo se trabajó</div>' +
            Object.keys(porT).sort(function (a, b) { return porT[b] - porT[a]; }).map(function (t) {
              return '<div class="hr-fila"><span>' + esc(t) + '</span><b>' + hhmm(porT[t]) + '</b></div>';
            }).join('')
          : '') +
        (Object.keys(porU).length > 1
          ? '<div class="hr-tit">Por persona</div>' + Object.keys(porU).sort(function (a, b) { return porU[b] - porU[a]; })
              .map(function (uid) {
                var u = us.filter(function (y) { return y.id === +uid; })[0] || { nombre: '(persona borrada)' };
                return '<div class="hr-fila"><span>' + esc(u.nombre) + '</span><b>' + hhmm(porU[uid]) + '</b></div>';
              }).join('')
          : '') +
      '</div>' +

      '<div class="hr-tit">Registros' + (mes ? ' de ' + mesNom(mes) : '') + '</div>' +
      (vis.length ? vis.map(function (x) {
        var u = us.filter(function (y) { return y.id === x.usuario_id; })[0] || {};
        return '<div class="hr-it"><div style="min-width:0">' +
          '<b>' + esc(x.tarea || 'sin descripción') + '</b>' +
          '<div class="d">' + esc(x.proposito || 'Estructurar') + ' · ' + esc(x.tipo || 'Programación') +
            ' · ' + esc(u.nombre || '—') + ' · ' + esc(x.fecha || '') +
            (x.inicio ? ' · ' + String(x.inicio).slice(0, 5) + '→' + String(x.fin || '').slice(0, 5) : '') + '</div>' +
          '</div><div style="text-align:right;flex:none"><b>' + hhmm(x.minutos) + '</b>' +
          '<div><button class="hr-del" onclick="Horas.borrar(' + x.id + ')">quitar</button></div></div></div>';
      }).join('') : '<div class="hr-vacio">Todavía no hay tiempo registrado acá.</div>') +

      '<div class="hr-tit">Quiénes trabajan</div>' +
      '<div class="hr-card">' +
        us.map(function (u) {
          return '<div class="hr-g" style="margin-bottom:6px">' +
            '<input value="' + esc(u.nombre) + '" onchange="Horas.uSet(' + u.id + ',\'nombre\',this.value)">' +
            '<input value="' + esc(u.rol || '') + '" placeholder="rol" onchange="Horas.uSet(' + u.id + ',\'rol\',this.value)">' +
            '<input type="number" value="' + (+u.tarifa_hora || 0) + '" title="Tarifa por hora" onchange="Horas.uSet(' + u.id + ',\'tarifa_hora\',this.value)">' +
          '</div>';
        }).join('') +
        '<div class="hr-g" style="margin-top:8px">' +
          '<input id="hr_un" placeholder="Nombre"><input id="hr_ur" placeholder="Rol">' +
          '<input id="hr_ut" type="number" placeholder="Tarifa/hora"></div>' +
        '<button class="hr-ok" onclick="Horas.uAdd()">+ Agregar persona</button>' +
        '<div class="hr-hint">La tarifa es opcional: en cero solo se mide el tiempo. Esta lista es de NC y la comparten todas las apps.</div>' +
      '</div>';
  }

  /* La pestaña en la barra de arriba. Casi todas las apps repintan su <nav> al
     cambiar de vista, por eso se vigila y se vuelve a poner sola. */
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
      if (document.getElementById('hr-btn')) return;
      var b = document.createElement('button');
      b.id = 'hr-btn'; b.title = 'Horas que NC le trabaja a este negocio'; b.innerHTML = '⏱️';
      b.onclick = Horas.abrir; document.body.appendChild(b);
    }
    function poner() {
      var nav = document.getElementById('nav');
      if (!nav) return false;
      if (!document.getElementById('hr-tab')) {
        var hermano = nav.querySelector('button, a');
        var t = document.createElement('button');
        t.id = 'hr-tab';
        t.type = 'button';
        if (hermano) t.className = hermano.className.replace(/on/g, '').trim();
        t.innerHTML = '⏱️ Horas';
        t.onclick = function (e) { e.preventDefault(); Horas.abrir(); };
        ncHilera(nav).appendChild(t);
      }
      var f = document.getElementById('hr-btn');
      if (f && f.parentNode) f.parentNode.removeChild(f);   // ya esta en la barra: sobra el circulo
      vigila(nav);
      return true;
    }
    if (!poner()) flotante();   // sin barra todavia: que igual se pueda abrir
    /* El reloj no se apaga a proposito: hay apts que borran y vuelven a pintar el
       #nav entero, y ahi el observador se queda mirando un elemento muerto. */
    setInterval(poner, 2000);
  }

  var Horas = {
    /* Mismo interruptor que el bloc de notas: con ?notas=1 una vez, este
       navegador queda marcado como el de José y le aparecen las dos cosas. */
    soyJose: function () {
      try {
        var p = new URLSearchParams(location.search).get('notas');
        if (p === '1') localStorage.setItem('nc_notas_ok', '1');
        if (p === '0') localStorage.removeItem('nc_notas_ok');
        return localStorage.getItem('nc_notas_ok') === '1';
      } catch (e) { return false; }
    },
    montar: function (negocioId, nombre, permitido) {
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
          if (ok) return self.montar(args[0], args[1], true);
          if (++veces < 45) setTimeout(reintenta, 700);
        })();
        return;
      }
      if (!permitido || !negocioId) return;
      if (window.__hrMontado) return;          // dos <script> por error no montan dos pestañas
      window.__hrMontado = true;
      neg = negocioId; negNom = nombre || negocioId;
      var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
      pestana();
    },
    abrir: function () {
      if (abierto) return;
      abierto = true;
      var c = document.createElement('div');
      c.id = 'hr-cap';
      c.onclick = function (e) { if (e.target === c) Horas.cerrar(); };
      c.innerHTML = '<div id="hr-box"><h3>⏱️ Horas <span>' + esc(negNom) + '</span>' +
        '<button id="hr-x" onclick="Horas.cerrar()">✕</button></h3>' +
        '<div id="hr-body"><div class="hr-vacio">Cargando…</div></div></div>';
      document.body.appendChild(c);
      propTocado = false;
      cargar();
    },
    cerrar: function () {
      var c = $('hr-cap'); if (c) c.remove();
      abierto = false;
    },
    /* En cuanto lo escoge a mano, calc() deja de proponer segun la hora. */
    _tocaProp: function () { propTocado = true; },
    mes: function (m) { mes = m; pinta(); },
    tipo: function () {
      var a = $('hr_ayuda');
      if (a) a.textContent = (AYUDA[val('hr_tp')] || '') + ' · ' + (PAYUDA[val('hr_pr')] || '');
    },
    /* Con las dos horas se calculan los minutos; si los escribe a mano, mandan. */
    calc: function (aMano) {
      var m = aMano ? (+val('hr_m') || 0) : mins(val('hr_i'), val('hr_ff'));
      if (!aMano && m && $('hr_m')) $('hr_m').value = m;
      var pr = $('hr_pr');
      if (!aMano && pr && !propTocado) { pr.value = propPorHora(val('hr_i')); Horas.tipo(); }
      var p = $('hr_prev'); if (p) p.textContent = m ? 'Son ' + hhmm(m) : '';
    },
    agregar: function () {
      var u = val('hr_u');
      if (!u) { alert('Primero agrega a una persona, abajo.'); return; }
      var i = val('hr_i') || null, f = val('hr_ff') || null;
      var m = +val('hr_m') || mins(i, f);
      if (!m) { alert('Pon las horas o los minutos.'); return; }
      var t = (val('hr_t') || '').trim();
      if (!t) { alert('Escribe qué se hizo. Sin eso, dentro de un mes ese registro no dice nada.'); return; }
      api('nc_hora', {
        method: 'POST', body: JSON.stringify({
          usuario_id: +u, negocio_id: neg,
          fecha: val('hr_f') || new Date().toISOString().slice(0, 10),
          inicio: i, fin: f, minutos: m, tipo: val('hr_tp') || 'Programación',
          proposito: val('hr_pr') || propPorHora(i), tarea: t
        })
      }).then(cargar);
    },
    borrar: function (id) {
      if (!confirm('¿Borrar este registro de tiempo?')) return;
      api('nc_hora?id=eq.' + id, { method: 'DELETE' }).then(cargar);
    },
    uAdd: function () {
      var n = (val('hr_un') || '').trim();
      if (!n) { alert('Falta el nombre.'); return; }
      api('nc_usuario', {
        method: 'POST', body: JSON.stringify({
          nombre: n, rol: (val('hr_ur') || '').trim() || null,
          tarifa_hora: +val('hr_ut') || 0, activo: true
        })
      }).then(cargar);
    },
    uSet: function (id, campo, v) {
      var b = {}; b[campo] = campo === 'tarifa_hora' ? (+v || 0) : v;
      api('nc_usuario?id=eq.' + id, { method: 'PATCH', body: JSON.stringify(b) }).then(cargar);
    }
  };
  window.Horas = Horas;
})();
