/* ============================================================================
   ASISTENTE · los chats de WhatsApp que atiende la asistente de cada negocio

   La asistente (Milena en Kruh) contesta sola desde un chip con Baileys
   (_PLAYBOOK/openwa/bot-baileys.mjs). Esta pantalla es donde el negocio la supervisa:
     - ve qué escribe la gente y qué le contestó la asistente
     - ve arriba, en naranja, a los clientes que QUIEREN COMPRAR (con pitido si
       la pestaña está abierta)
     - toma un chat (la asistente se calla) o se lo devuelve
     - contesta como persona: queda "pendiente" y el bot lo manda por el chip
     - edita el guion (solo quien la app deje)

   Se monta en la app de cada negocio con una línea en su go():
       <script src="../assets/asistente.js"></script>
       asistente: function(){ Asistente.vista($('main'), {prefijo:'kruh', nombre:'Milena', marca:'Kruh', guion:true}) }

   Cada cliente vive aparte: SOLO lee y escribe en las tablas de su prefijo
   (<prefijo>_wa_chats, _wa_mensajes, _wa_guion). De NC solo lee nc_wa_latido,
   para avisar si el chip se cayó.
   ========================================================================= */
(function () {
  'use strict';
  var SB = 'https://fnayedgvamxktxfvywwl.supabase.co';
  var KEY = 'sb_publishable_NVTYNkJ0V6obLwgwjXza1g_3Ihp-xMv';
  var H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

  /* La pone el bot cuando la asistente detecta intención de compra. Si se cambia
     aquí, cambiarla también en bot-baileys.mjs (ETIQUETA_COMPRA). */
  var ETQ_COMPRA = 'quiere comprar';

  function api(path, opt) {
    opt = opt || {};
    var h = Object.assign({}, H, opt.prefer ? { Prefer: opt.prefer } : {});
    return fetch(SB + '/rest/v1/' + path, { method: opt.method || 'GET', headers: h, body: opt.body ? JSON.stringify(opt.body) : undefined })
      .then(function (r) {
        return r.text().then(function (t) {
          if (!r.ok) throw new Error(t.slice(0, 160) || ('error ' + r.status));
          return t ? JSON.parse(t) : [];
        });
      });
  }
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var dig = function (s) { return String(s || '').replace(/\D/g, ''); };
  var $ = function (id) { return document.getElementById(id); };

  /* "hace 5 min" dice si el chat está vivo; una fecha suelta no. */
  function cuando(f) {
    if (!f) return '—';
    var m = Math.floor((Date.now() - new Date(f).getTime()) / 60000);
    if (m < 1) return 'ahora';
    if (m < 60) return 'hace ' + m + ' min';
    var h = Math.floor(m / 60);
    if (h < 24) return 'hace ' + h + ' h';
    var d = Math.floor(h / 24);
    return d === 1 ? 'ayer' : d < 31 ? 'hace ' + d + ' días' : 'hace ' + Math.floor(d / 30) + ' meses';
  }
  function hora(f) {
    try { return new Date(f).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return ''; }
  }

  var CSS = [
    '#as-root{max-width:860px}',
    '#as-root .as-salud{border-radius:11px;padding:10px 13px;font-size:13px;margin-bottom:12px;border:1px solid}',
    '#as-root .as-salud.ok{background:#e6f1e2;border-color:#c9dfc2;color:#2f5a2b}',
    '#as-root .as-salud.mal{background:#f7e2dd;border-color:#ecc2b8;color:#8a2c20}',
    '#as-root .as-alerta{background:#fff1dc;border:2px solid #f0a45c;color:#7c2d12;border-radius:12px;padding:12px 14px;margin-bottom:12px}',
    '#as-root .as-alerta b{font-size:15px}',
    '#as-root .as-alerta .as-quien{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}',
    '#as-root .as-alerta button{padding:7px 11px;border-radius:9px;border:1px solid #f0a45c;background:#fff;color:#7c2d12;font-weight:700;font-size:12.5px;cursor:pointer;font-family:inherit}',
    '#as-root .as-filtros{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}',
    '#as-root .as-f{padding:7px 12px;border-radius:20px;border:1px solid var(--line,#e7ddc9);background:#fff;font-size:12.5px;cursor:pointer;font-family:inherit}',
    '#as-root .as-f.on{background:var(--ink,#2a1f16);color:#fff;border-color:var(--ink,#2a1f16)}',
    '#as-root .as-chat{background:var(--card,#fff);border:1px solid var(--line,#e7ddc9);border-radius:12px;margin-bottom:8px;overflow:hidden}',
    '#as-root .as-chat.on{border-color:var(--acc,#b5651d);box-shadow:0 0 0 2px rgba(181,101,29,.12)}',
    '#as-root .as-chat.compra{border-left:4px solid #f0a45c}',
    '#as-root .as-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:11px 13px;cursor:pointer}',
    '#as-root .as-nom{font-weight:700;font-size:14px}',
    '#as-root .as-meta{font-size:11.5px;color:var(--mut,#9a8b78);margin-top:2px}',
    '#as-root .as-ult{font-size:12.5px;color:var(--ink2,#5b4d3f);padding:0 13px 10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#as-root .as-nl{background:#dc2626;color:#fff;border-radius:6px;padding:1px 6px;font-size:10px;vertical-align:2px;margin-left:4px}',
    '#as-root .as-compra{background:#fde7d2;color:#9a3412;border-radius:6px;padding:1px 6px;font-size:10.5px;font-weight:700;vertical-align:1px;margin-left:4px}',
    '#as-root .as-badge{flex:none;font-size:11px;font-weight:700;border-radius:8px;padding:3px 8px}',
    '#as-root .as-badge.agente{background:#e6f1e2;color:#2f5a2b}',
    '#as-root .as-badge.humano{background:#fff1dc;color:#9a4f12}',
    '#as-root .as-hilo{border-top:1px solid var(--line2,#f0e9da);padding:11px 13px;display:grid;gap:6px;max-height:420px;overflow-y:auto;background:#fcfaf5}',
    '#as-root .as-b{max-width:82%;border-radius:11px;padding:7px 10px;font-size:13px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}',
    '#as-root .as-b small{display:block;font-size:10px;color:#8a8f98;margin-top:3px}',
    '#as-root .as-b.user{justify-self:start;background:#fff;border:1px solid var(--line,#e7ddc9);border-radius:11px 11px 11px 2px}',
    '#as-root .as-b.assistant{justify-self:end;background:#e6f1e2;border-radius:11px 11px 2px 11px}',
    '#as-root .as-b.humano{justify-self:end;background:#fff1dc;border-radius:11px 11px 2px 11px}',
    '#as-root .as-resp{padding:10px 13px 13px;border-top:1px solid var(--line2,#f0e9da)}',
    '#as-root .as-resp textarea,#as-root .as-guion textarea{width:100%;box-sizing:border-box;border:1px solid var(--line,#e7ddc9);border-radius:9px;padding:9px;font-family:inherit;font-size:13.5px;resize:vertical}',
    '#as-root .as-botones{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}',
    '#as-root .as-btn{padding:9px 14px;border:none;border-radius:9px;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit}',
    '#as-root .as-btn.pri{background:var(--acc,#b5651d);color:#fff}',
    '#as-root .as-btn.sec{background:transparent;border:1px solid var(--line,#e7ddc9);color:var(--ink2,#5b4d3f)}',
    '#as-root .as-btn:disabled{opacity:.5;cursor:wait}',
    '#as-root .as-nota{font-size:11.5px;color:var(--mut,#9a8b78);margin-top:6px}',
    '#as-root .as-vacio{text-align:center;color:var(--mut,#9a8b78);padding:30px 12px;font-size:14px}',
    '#as-root .as-guion{background:var(--card,#fff);border:1px solid var(--line,#e7ddc9);border-radius:12px;padding:13px;margin-bottom:12px}'
  ].join('\n');

  var el = null, o = {}, chats = [], latidos = [], abierto = null, hilo = [], filtro = 'todos',
      guion = null, verGuion = false, tick = null, borrador = {}, enviando = false,
      vistosCompra = null, tituloOriginal = null, parpadeo = null;
  var T = function (t) { return o.prefijo + '_wa_' + t; };

  function vivo() { return !!$('as-root'); }
  function parar() { if (tick) { clearInterval(tick); tick = null; } }
  function quierenComprar() {
    return (chats || []).filter(function (c) { return c.etiqueta === ETQ_COMPRA && c.no_leido; });
  }

  function cargar() {
    return Promise.all([
      api(T('chats') + '?select=*&order=ultima_fecha.desc&limit=500').catch(function () { return null; }),
      api('nc_wa_latido?empresa=eq.' + encodeURIComponent(o.prefijo) + '&select=etiqueta,estado,nota,visto_en').catch(function () { return []; })
    ]).then(function (r) {
      chats = r[0]; latidos = r[1] || [];
      return abierto ? cargarHilo() : null;
    });
  }
  function cargarHilo() {
    /* Los 300 más nuevos y se voltean: con asc un chat largo mostraría solo el principio. */
    return api(T('mensajes') + '?telefono=eq.' + dig(abierto) + '&select=rol,contenido,estado,creado_en&order=creado_en.desc&limit=300')
      .then(function (f) { hilo = (f || []).reverse(); })
      .catch(function () { hilo = []; });
  }

  /* ---------- alarma de compra ---------- */
  /* Solo suena cuando aparece un cliente NUEVO que quiere comprar mientras la
     pestaña está abierta; al entrar no suena por los que ya estaban. */
  function revisarAlarma() {
    if (chats === null) return;
    var ahora = quierenComprar().map(function (c) { return dig(c.telefono); });
    if (vistosCompra !== null) {
      var nuevos = ahora.filter(function (t) { return vistosCompra.indexOf(t) < 0; });
      if (nuevos.length) { sonar(); parpadear(); }
    }
    vistosCompra = ahora;
  }
  function sonar() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.28].forEach(function (t, i) {
        var osc = ctx.createOscillator(), g = ctx.createGain();
        osc.frequency.value = i ? 1046 : 784;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.25);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(ctx.currentTime + t); osc.stop(ctx.currentTime + t + 0.26);
      });
    } catch (e) {}
  }
  function parpadear() {
    if (parpadeo) return;
    tituloOriginal = document.title;
    var n = 0;
    parpadeo = setInterval(function () {
      document.title = (n++ % 2) ? tituloOriginal : '🛒 Quieren comprar';
      if (n > 20 || document.hasFocus()) {
        clearInterval(parpadeo); parpadeo = null; document.title = tituloOriginal;
      }
    }, 900);
  }

  /* Tres estados, porque "prendida" no es lo mismo que "contestando":
       rojo    → más de 25 min sin latido, o desvinculada: el bot o el PC están apagados
       naranja → el bot late, pero en la última hora NO pudo contestar (sin saldo en
                 Anthropic, Claude caído, sin internet…). El bot manda estado 'error'
                 con el motivo y no deja que el latido normal lo tape.
       verde   → late y contesta. */
  function htmlSalud() {
    if (!latidos.length) return '<div class="as-salud mal">⚠️ <b>El chip de ' + esc(o.nombre) + ' nunca se ha conectado.</b> Mientras no se escanee el QR, nadie contesta la pauta.</div>';
    return latidos.map(function (l) {
      var min = (Date.now() - new Date(l.visto_en).getTime()) / 60000;
      if (min > 25 || l.estado === 'caido') {
        return '<div class="as-salud mal">🔴 <b>' + esc(o.nombre) + ' NO está contestando</b> · último latido ' + cuando(l.visto_en) +
          (l.nota ? ' · ' + esc(l.nota) : '') + '. Revisar que el computador esté prendido y el bot corriendo (estado.ps1).</div>';
      }
      if (l.estado === 'error') {
        var reconecta = /^reconectando/i.test(l.nota || '');
        return '<div class="as-salud" style="background:#fff1dc;border-color:#f0a45c;color:#7c2d12">🟠 <b>' +
          (reconecta ? esc(o.nombre) + ' se está reconectando' : esc(o.nombre) + ' no pudo contestar: ' + esc(l.nota || 'motivo desconocido')) + '</b>' +
          (reconecta ? '' : '<div style="font-size:12px;margin-top:3px">Los clientes afectados quedan marcados "no se pudo contestar": escríbeles tú. Se quita sola cuando vuelva a contestar bien.</div>') + '</div>';
      }
      return '<div class="as-salud ok">🟢 <b>' + esc(o.nombre) + ' está conectada y contestando</b> · ' + esc(l.etiqueta || '') + ' · último latido ' + cuando(l.visto_en) + '</div>';
    }).join('');
  }

  function htmlAlerta() {
    var q = quierenComprar();
    if (!q.length) return '';
    return '<div class="as-alerta">🛒 <b>' + q.length + (q.length === 1 ? ' cliente quiere comprar' : ' clientes quieren comprar') + '</b>' +
      '<div style="font-size:12.5px;margin-top:2px">' + esc(o.nombre) + ' ya le avisó por WhatsApp a la línea de domicilios. Toca el nombre para ver qué pidió; al abrirlo, la alerta se quita.</div>' +
      '<div class="as-quien">' + q.map(function (c) {
        var tel = dig(c.telefono);
        return '<button onclick="Asistente.abrir(\'' + tel + '\')">' + esc(c.nombre || ('+' + tel)) + ' · ' + cuando(c.ultima_fecha) + '</button>';
      }).join('') + '</div></div>';
  }

  function htmlHilo(c) {
    var burbujas = hilo.length ? hilo.map(function (m) {
      var quien = m.rol === 'user' ? (c.nombre || 'Cliente') : m.rol === 'assistant' ? '🤖 ' + o.nombre : '👤 Persona';
      var est = m.estado === 'pendiente' ? ' · ⏳ enviando…' : m.estado === 'error' ? ' · ✗ no salió' : '';
      return '<div class="as-b ' + esc(m.rol) + '">' + esc(m.contenido) + '<small>' + esc(quien) + ' · ' + hora(m.creado_en) + est + '</small></div>';
    }).join('') : '<div class="as-vacio" style="padding:12px">Sin mensajes guardados.</div>';
    var tel = dig(c.telefono);
    var humano = c.modo === 'humano';
    return '<div class="as-hilo" id="as-hilo">' + burbujas + '</div>' +
      '<div class="as-resp">' +
        '<textarea id="as-txt" rows="2" placeholder="Escribe la respuesta como persona de ' + esc(o.marca || '') + '…" oninput="Asistente._borrador(this.value)">' + esc(borrador[tel] || '') + '</textarea>' +
        '<div class="as-botones">' +
          '<button class="as-btn pri" id="as-env" onclick="Asistente.enviar()">Enviar como persona</button>' +
          (humano
            ? '<button class="as-btn sec" onclick="Asistente.modo(\'' + tel + '\',\'agente\')">🤖 Devolver a ' + esc(o.nombre) + '</button>'
            : '<button class="as-btn sec" onclick="Asistente.modo(\'' + tel + '\',\'humano\')">👤 Tomar el chat</button>') +
        '</div>' +
        '<div class="as-nota">' + (humano
          ? esc(o.nombre) + ' está callada en este chat. Lo que escriba el cliente queda aquí hasta que se lo devuelvas.'
          : 'Al enviar, ' + esc(o.nombre) + ' se calla en este chat hasta que se lo devuelvas.') + '</div>' +
      '</div>';
  }

  function htmlGuion() {
    if (!verGuion) return '';
    if (!guion) return '<div class="as-guion">Cargando guion…</div>';
    return '<div class="as-guion"><b>✏️ Guion de ' + esc(o.nombre) + '</b>' +
      '<div class="as-nota" style="margin:2px 0 8px">Lo que ella sabe y cómo habla. El cambio aplica desde el próximo mensaje que llegue. ' +
      'Última edición: ' + hora(guion.actualizado) + '</div>' +
      '<textarea id="as-guion-txt" rows="18">' + esc(guion.prompt) + '</textarea>' +
      '<div class="as-botones"><button class="as-btn pri" onclick="Asistente.guardarGuion()">Guardar guion</button>' +
      '<button class="as-btn sec" onclick="Asistente.guion()">Cerrar</button></div></div>';
  }

  function pinta() {
    if (!el) return;
    if (chats === null) {
      el.innerHTML = '<div id="as-root"><h1>💬 ' + esc(o.nombre) + '</h1><div class="as-salud mal">No se pudieron leer los chats. ' +
        '¿Existen las tablas <b>' + esc(T('chats')) + '</b> y <b>' + esc(T('mensajes')) + '</b>?</div></div>';
      return;
    }
    var nH = chats.filter(function (c) { return c.modo === 'humano'; }).length;
    var nN = chats.filter(function (c) { return c.no_leido; }).length;
    var nC = chats.filter(function (c) { return c.etiqueta === ETQ_COMPRA; }).length;
    var lista = chats.filter(function (c) {
      return filtro === 'humano' ? c.modo === 'humano'
        : filtro === 'nuevos' ? c.no_leido
        : filtro === 'compra' ? c.etiqueta === ETQ_COMPRA
        : true;
    });
    var f = function (k, t) { return '<button class="as-f' + (filtro === k ? ' on' : '') + '" onclick="Asistente.filtro(\'' + k + '\')">' + t + '</button>'; };
    el.innerHTML = '<div id="as-root">' +
      '<h1>💬 ' + esc(o.nombre) + ' · WhatsApp de la pauta</h1>' +
      '<div class="sub">Lo que escribe la gente y lo que ' + esc(o.nombre) + ' le contesta. Toca un chat para leerlo completo o contestar tú.</div>' +
      htmlSalud() + htmlAlerta() + htmlGuion() +
      '<div class="as-filtros">' + f('todos', 'Todos · ' + chats.length) + f('compra', '🛒 Quieren comprar · ' + nC) +
        f('nuevos', '🔴 Sin leer · ' + nN) + f('humano', '👤 Con persona · ' + nH) +
        (o.guion && !verGuion ? '<button class="as-f" style="margin-left:auto" onclick="Asistente.guion()">✏️ Guion</button>' : '') + '</div>' +
      (lista.length ? lista.map(function (c) {
        var tel = dig(c.telefono), on = abierto === tel, compra = c.etiqueta === ETQ_COMPRA;
        return '<div class="as-chat' + (on ? ' on' : '') + (compra ? ' compra' : '') + '">' +
          '<div class="as-top" onclick="Asistente.abrir(\'' + tel + '\')"><div style="min-width:0">' +
            '<div class="as-nom">' + (on ? '▾ ' : '▸ ') + esc(c.nombre || ('+' + tel)) +
              (compra ? '<span class="as-compra">🛒 quiere comprar</span>' : '') +
              (c.no_leido ? '<span class="as-nl">nuevo</span>' : '') + '</div>' +
            '<div class="as-meta">📱 +' + esc(tel) + ' · ' + cuando(c.ultima_fecha) + (c.etiqueta && !compra ? ' · ' + esc(c.etiqueta) : '') + '</div></div>' +
            '<span class="as-badge ' + (c.modo === 'humano' ? 'humano">👤 Persona' : 'agente">🤖 ' + esc(o.nombre)) + '</span></div>' +
          (on ? htmlHilo(c) : (c.ultimo_mensaje ? '<div class="as-ult">' + esc(c.ultimo_mensaje) + '</div>' : '')) +
        '</div>';
      }).join('') : '<div class="as-vacio">' + (chats.length ? 'Nada en este filtro.' : 'Todavía no ha escrito nadie.') + '</div>') +
      '</div>';
    var hl = $('as-hilo'); if (hl) hl.scrollTop = hl.scrollHeight;
  }

  /* Los datos y la alarma se revisan siempre; repintar se salta mientras alguien
     escribe, porque borraría el cursor. */
  function refrescar() {
    if (!vivo()) { parar(); return; }
    cargar().then(function () {
      revisarAlarma();
      var foco = document.activeElement;
      var escribiendo = foco && (foco.id === 'as-txt' || foco.id === 'as-guion-txt');
      if (vivo() && !escribiendo) pinta();
    });
  }

  var Asistente = {
    vista: function (elemento, opciones) {
      el = elemento; o = opciones || {};
      if (!o.prefijo) { el.innerHTML = '<div class="as-vacio">Falta el prefijo del negocio.</div>'; return; }
      o.nombre = o.nombre || 'Asistente';
      if (!$('as-css')) { var st = document.createElement('style'); st.id = 'as-css'; st.textContent = CSS; document.head.appendChild(st); }
      el.className = ''; el.style.cssText = '';
      el.innerHTML = '<div id="as-root"><div class="as-vacio">Cargando chats…</div></div>';
      parar();
      vistosCompra = null;
      cargar().then(function () { revisarAlarma(); pinta(); });
      tick = setInterval(refrescar, 8000);
    },
    filtro: function (k) { filtro = k; pinta(); },
    abrir: function (tel) {
      tel = dig(tel);
      if (abierto === tel) { abierto = null; hilo = []; pinta(); return; }
      abierto = tel; hilo = [];
      var c = (chats || []).find(function (x) { return dig(x.telefono) === tel; });
      if (c && c.no_leido) {
        c.no_leido = false;
        api(T('chats') + '?telefono=eq.' + tel, { method: 'PATCH', prefer: 'return=minimal', body: { no_leido: false } }).catch(function () {});
      }
      cargarHilo().then(pinta);
    },
    _borrador: function (v) { if (abierto) borrador[abierto] = v; },
    enviar: function () {
      var t = $('as-txt'), txt = t ? t.value.trim() : '';
      if (!abierto || !txt || enviando) return;
      enviando = true;
      var b = $('as-env'); if (b) b.disabled = true;
      var tel = abierto;
      api(T('mensajes'), { method: 'POST', prefer: 'return=minimal', body: { telefono: tel, rol: 'humano', contenido: txt, estado: 'pendiente' } })
        .then(function () {
          return api(T('chats') + '?telefono=eq.' + tel, { method: 'PATCH', prefer: 'return=minimal', body: { modo: 'humano', no_leido: false } });
        })
        .then(function () { borrador[tel] = ''; if (t) t.blur(); return cargar(); })
        .then(pinta)
        .catch(function (e) { alert('No se pudo enviar: ' + e.message); if (b) b.disabled = false; })
        .then(function () { enviando = false; });
    },
    modo: function (tel, m) {
      api(T('chats') + '?telefono=eq.' + dig(tel), { method: 'PATCH', prefer: 'return=minimal', body: { modo: m, no_leido: false } })
        .then(cargar).then(pinta)
        .catch(function (e) { alert('No se pudo cambiar: ' + e.message); });
    },
    guion: function () {
      verGuion = !verGuion;
      if (!verGuion) { pinta(); return; }
      guion = null; pinta();
      api(T('guion') + '?id=eq.default&select=prompt,actualizado&limit=1')
        .then(function (f) { guion = (f && f[0]) || { prompt: '', actualizado: null }; pinta(); })
        .catch(function (e) { verGuion = false; alert('No se pudo leer el guion: ' + e.message); pinta(); });
    },
    guardarGuion: function () {
      var t = $('as-guion-txt'), txt = t ? t.value.trim() : '';
      if (txt.length < 50) { alert('El guion quedó casi vacío. Así ' + o.nombre + ' no sabe qué contestar.'); return; }
      api(T('guion') + '?id=eq.default', { method: 'PATCH', prefer: 'return=minimal', body: { prompt: txt, actualizado: new Date().toISOString() } })
        .then(function () { verGuion = false; pinta(); if (window.toast) window.toast('Guion guardado'); })
        .catch(function (e) { alert('No se pudo guardar: ' + e.message); });
    }
  };
  window.Asistente = Asistente;
})();
