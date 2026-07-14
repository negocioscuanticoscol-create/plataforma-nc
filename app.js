/* ============ PLATAFORMA FEROZ — app.js ============ */
const C = window.FEROZ_CONFIG;
const money = n => '$' + Math.round(+n||0).toLocaleString('es-CO');
const $ = id => document.getElementById(id);
const esc = s => (s==null?'':String(s)).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

const ESTADOS = {
  pendiente_pago:'Pendiente de pago', consignado:'Consignado', autorizado:'Autorizado',
  despachado:'Despachado', entregado:'Entregado', anulado:'Anulado'
};
const ROL_NOMBRE = {admin:'Admin', vendedor:'Vendedor', facturacion:'Facturación', bodega:'Bodega', planta:'Jefe de Planta'};

const App = {
  sb:null, user:null, perfil:null, view:'dashboard', signupMode:false,

  async init(){
    this.sb = supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY);
    const { data:{ session } } = await this.sb.auth.getSession();
    if(session){ this.user = session.user; await this.afterLogin(); }
    else { $('view-login').classList.remove('hide'); $('app').classList.add('hide'); }
  },

  /* ---------- AUTH ---------- */
  modoSignup(on){
    this.signupMode = on;
    $('lbl_nombre').classList.toggle('hide', !on);
    $('lg_nombre').classList.toggle('hide', !on);
    $('btn_login').classList.toggle('hide', on);
    $('btn_signup').classList.toggle('hide', !on);
    $('sw_signup').classList.toggle('hide', on);
    $('sw_login').classList.toggle('hide', !on);
    this.msg('');
  },
  msg(t, ok){ const m=$('lg_msg'); m.className='msg'+(t?(ok?' ok':' err'):''); m.textContent=t; },

  async login(){
    const email=$('lg_email').value.trim(), pass=$('lg_pass').value;
    if(!email||!pass){ this.msg('Escribe correo y contraseña.'); return; }
    this.msg('Entrando…', true);
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password:pass });
    if(error){ this.msg(error.message.includes('Invalid')?'Correo o contraseña incorrectos.':error.message); return; }
    this.user = data.user; await this.afterLogin();
  },

  async signup(){
    const email=$('lg_email').value.trim(), pass=$('lg_pass').value, nombre=$('lg_nombre').value.trim();
    if(!email||!pass||!nombre){ this.msg('Completa nombre, correo y contraseña.'); return; }
    if(pass.length<6){ this.msg('La contraseña debe tener al menos 6 caracteres.'); return; }
    this.msg('Creando cuenta…', true);
    const { data, error } = await this.sb.auth.signUp({ email, password:pass, options:{ data:{ nombre } } });
    if(error){ this.msg(error.message); return; }
    if(data.session){ this.user=data.user; await this.afterLogin(); }
    else { this.msg('✅ Cuenta creada. Ahora entra con tu correo y contraseña.', true); this.modoSignup(false); }
  },

  async logout(){ await this.sb.auth.signOut(); location.reload(); },

  async afterLogin(){
    // cargar / asegurar perfil
    let { data:perf } = await this.sb.from('perfiles').select('*').eq('id', this.user.id).maybeSingle();
    if(!perf){
      await this.sb.from('perfiles').insert({ id:this.user.id, nombre:this.user.email, rol:'vendedor' });
      ({ data:perf } = await this.sb.from('perfiles').select('*').eq('id', this.user.id).maybeSingle());
    }
    this.perfil = perf || { rol:'vendedor', nombre:this.user.email };
    if(this.perfil.activo===false){ await this.sb.auth.signOut(); alert('🔒 Este acceso fue bloqueado por el administrador.'); location.reload(); return; }
    $('view-login').classList.add('hide'); $('app').classList.remove('hide');
    $('me_nombre').textContent = this.perfil.nombre || this.user.email;
    $('me_rol').textContent = ROL_NOMBRE[this.perfil.rol] || this.perfil.rol;
    try{ const { data:cfg } = await this.sb.from('config').select('value').eq('key','nav_permisos').maybeSingle(); this._permisos = cfg?cfg.value:null; }catch(e){ this._permisos=null; }
    this.pintarNav();
    const inicio = {facturacion:'pedidos', bodega:'despachos', planta:'planta'}[this.perfil.rol] || 'dashboard';
    this.go(inicio);
  },

  rol(){ return this.perfil?.rol; },
  puede(...roles){ const r=this.rol(); if(r==='gerente'&&roles.some(x=>['vendedor','facturacion','bodega','planta'].includes(x))) return true; return roles.includes(r); },

  /* ---------- NAV ---------- */
  pintarNav(){
    const r=this.rol();
    // Hilera 1 (arriba) y Hilera 2 (abajo) — layout pedido por José
    const ROW1=[
      {v:'panel', ic:'📈', t:'Panel'},
      {v:'crm', ic:'📇', t:'CRM'},
      {v:'cotizaciones', ic:'📝', t:'Cotizar'},
      {v:'pedidos', ic:'📦', t:'Pedidos'},
      {v:'despachos', ic:'🚚', t:'Despachos'},
      {v:'cartera', ic:'💳', t:'Cartera'},
      {v:'planta', ic:'🏭', t:'Planta'},
      {v:'clientes', ic:'👥', t:'Clientes'},
    ];
    // hilera 2 = base de plataforma (solo admin la tiene en permitidos → solo a él le aparece)
    const ROW2=[
      {v:'datos', ic:'🗄️', t:'Datos'},
      {v:'admin', ic:'⚙️', t:'Equipo'},
      {v:'permisos', ic:'🔐', t:'Permisos'},
    ];
    const TODOS=['dashboard','cotizaciones','pedidos','cartera','despachos','clientes','ventas','panel','crm','cobertura','planta','autopedido','datos','admin','permisos'];
    const DEF={admin:TODOS, gerente:['dashboard','cotizaciones','pedidos','cartera','despachos','clientes','ventas','panel','crm','cobertura','planta','autopedido'],
      vendedor:['dashboard','cotizaciones','pedidos','cartera','clientes','crm','ventas','cobertura','panel','autopedido'],
      facturacion:['dashboard','pedidos','cartera'], bodega:['dashboard','despachos'], planta:['dashboard','pedidos','planta']};
    let permitidos=(this._permisos && this._permisos[r]) || DEF[r] || ['dashboard'];
    if(r==='admin') permitidos=TODOS;
    this._permitidos=permitidos;
    const btn=i=>`<button data-v="${i.v}" onclick="App.go('${i.v}')"><span class="ic">${i.ic}</span>${i.t}</button>`;
    const f1=ROW1.filter(i=>permitidos.includes(i.v)).map(btn).join('');
    const f2=ROW2.filter(i=>permitidos.includes(i.v)).map(btn).join('');
    $('nav').innerHTML = `<div class="nav-row">${f1}</div>${f2?`<div class="nav-row nav-row2">${f2}</div>`:''}`;
  },
  // sub-barra (pastillas) de la pestaña actual → integra los secundarios DENTRO de su pestaña
  _subnav(){
    const g=this._grupoDe(this.view); if(!g) return '';
    const items=(this._GRUPOS[g]||[]).filter(i=>(this._permitidos||[]).includes(i[0]));
    if(items.length<2) return '';
    return `<div style="display:flex;gap:6px;overflow-x:auto;margin:0 0 12px;padding-bottom:2px;-webkit-overflow-scrolling:touch">${items.map(([v,ic,t])=>`<button onclick="App.go('${v}')" style="flex:0 0 auto;padding:7px 13px;border-radius:18px;border:none;font-weight:700;font-size:12.5px;cursor:pointer;background:${v===this.view?'var(--naranja);color:#fff':'#eef1f5;color:#555'}">${ic} ${t}</button>`).join('')}</div>`;
  },
  _GRUPOS:{
    panel:[['panel','📈','Panel'],['ventas','💰','Ventas'],['dashboard','📊','Resultados']],
    clientes:[['clientes','👥','Clientes'],['cobertura','🗺️','Cobertura'],['ventas','💰','Ventas'],['autopedido','🛒','Autopedido']],
  },
  _grupoDe(view){ for(const g in this._GRUPOS){ if(this._GRUPOS[g].some(i=>i[0]===view)) return g; } return null; },

  go(view){
    this.view=view;
    clearTimeout(this._apTimer);   // detiene el auto-refresco de Autopedidos al cambiar de vista
    const _pad=this._grupoDe(view)||view;
    document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active', b.dataset.v===_pad));
    window.scrollTo(0,0);
    // Multi-empresa: módulos de Feroz que aún no tienen versión propia para otra empresa
    if(view==='cotizaciones' && window.NC_EMPRESA==='smart') return this.vCotLanding();   // Smart: landing nc_cotizaciones · Feroz cae a vCotizaciones (tabla 'cotizaciones')
    if(view==='datos') return this.vDatos();   // visor de la superdata (leer Supabase como el Sheet)
    if(window.NC_EMPRESA==='smart' && view==='crm') return this.vCrmSmart();
    if(window.NC_EMPRESA==='smart' && view==='planta') return this.vPlantaSmart();
    if(window.NC_EMPRESA==='smart' && view==='clientes') return this.vClientesSmart();
    if(window.NC_EMPRESA==='smart' && view==='cartera') return this.vCarteraSmart();
    if(window.NC_EMPRESA==='smart' && view==='cobertura') return this.vCoberturaSmart();
    if(window.NC_EMPRESA==='smart' && view==='ventas') return this.vVentasSmart();
    if(window.NC_EMPRESA==='smart' && view==='panel') return this.vDashboardSmart();        // Panel = vista general
    if(window.NC_EMPRESA==='smart' && view==='dashboard') return this.vPanelFinanzas();      // Resultados = panel financiero
    if(window.NC_EMPRESA==='feroz' && view==='dashboard') return this.vPanelFinanzasFeroz(); // Resultados = panel financiero
    if(window.NC_EMPRESA==='smart' && view==='pedidos') return this.vPedidosSmart();
    if(window.NC_EMPRESA==='smart' && view==='despachos') return this.vDespachosSmart();
    if(window.NC_EMPRESA==='smart' && view==='autopedido') return this.vAutoPedidosSmart();
    const FEROZ_ONLY=['cotizaciones','cotizacionNueva','pedidos','cartera','despachos','ventas','clientes','crm','cobertura','planta','autopedido'];
    if(window.NC_EMPRESA && window.NC_EMPRESA!=='feroz' && FEROZ_ONLY.includes(view)) return this.enConstruccion(view);
    ({dashboard:this.vDashboard, cotizaciones:this.vCotizaciones, cotizacionNueva:this.vCotizacionNueva,
      pedidos:this.vPedidos, cartera:this.vCartera, despachos:this.vDespachos, ventas:this.vVentas, clientes:this.vClientes, crm:this.vCrm, cobertura:this.vCobertura, planta:this.vPlanta, autopedido:this.vAutoPedidos, admin:this.vAdmin, permisos:this.vPermisos}[view] || this.vDashboard).call(this);
  },
  set(html){ $('main').innerHTML = this._subnav() + html; },
  enConstruccion(view){
    const N={cotizaciones:'Cotizador',cotizacionNueva:'Cotizador',pedidos:'Validación de pedidos',despachos:'Despachos',ventas:'Ventas',clientes:'Clientes',crm:'CRM',cobertura:'Cobertura',planta:'Planta'}[view]||view;
    this.set(`<h1>${N}</h1>
      <div class="card" style="text-align:center;padding:34px 18px">
        <div style="font-size:40px">🔧</div>
        <div style="font-weight:700;margin-top:10px;font-size:16px">${N} de ${window.NC_BRAND||''} — en construcción</div>
        <div class="sub" style="margin-top:8px">Aquí va la operación de <b>${window.NC_BRAND||'esta empresa'}</b> con SUS datos (del Sheet), no la de Feroz. La montamos en los próximos pasos.</div>
      </div>`);
  },

  /* ---------- CRM SMART (módulo dentro de la plataforma: B2B·B2C·Kit·Cotización·Remarketing) ---------- */
  async vCrmSmart(){
    this.loading();
    const H={apikey:this._SBK(),Authorization:'Bearer '+this._SBK()};
    let cots=[], ventas=[];
    try{ const r=await fetch(this._SBU()+'/rest/v1/nc_cotizaciones?empresa=eq.smart&estado=in.(cotizacion,pedido)&order=creado_en.desc&limit=2000',{headers:H}); const j=await r.json(); cots=Array.isArray(j)?j:[]; }catch(e){}
    try{ const r=await fetch(this._SBU()+'/rest/v1/nc_ventas?empresa=eq.smart&limit=3000',{headers:H}); const j=await r.json(); ventas=Array.isArray(j)?j:[]; }catch(e){}
    try{ const r=await fetch(this._SBU()+'/rest/v1/nc_bot_leads?empresa=eq.smart&order=ultima_fecha.desc&limit=2000',{headers:H}); const j=await r.json(); this._crmBot=Array.isArray(j)?j:[]; }catch(e){ this._crmBot=[]; }
    try{ const r=await fetch(this._SBU()+'/rest/v1/smart_marcador_leads?select=nombre,ciudad,depto,cel,fijo,estado,prioridad,esp,aplica,nota,web&limit=5000',{headers:H}); const j=await r.json(); window.LEADS=(Array.isArray(j)?j:[]).map(l=>({empresa:l.nombre,ciudad:l.ciudad,depto:l.depto,cel:l.cel,fijo:l.fijo,estado:l.estado,prioridad:l.prioridad,esp:l.esp,aplica:l.aplica,nota:l.nota,web:l.web})); }catch(e){}
    try{ const r=await fetch(this._SBU()+'/rest/v1/nc_crm_embudo?empresa=eq.smart&limit=5000',{headers:H}); const j=await r.json(); this._crmEmbRows=Array.isArray(j)?j:[]; this._crmEmb={}; this._crmEmbRows.forEach(x=>this._crmEmb[x.lead_key]=x.etapa); }catch(e){ this._crmEmbRows=[]; this._crmEmb={}; }
    const norm=s=>(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\b(sas|ltda|sa|eu)\b/g,'').replace(/\s+/g,' ').trim();
    const esTest=s=>{ const n=norm(s); return !n||n.includes('prueba')||n==='smart'||n==='test'; };
    const compradores=new Set();   // ya compraron (venta NO-kit no cancelada, o un pedido) → salen del Kit
    ventas.forEach(v=>{ if(!v.es_kit && !/cancel|anula/i.test(v.estado_pago||'') && v.cliente) compradores.add(norm(v.cliente)); });
    cots.forEach(c=>{ if(c.estado==='pedido' && c.cliente) compradores.add(norm(c.cliente)); });
    const kits=ventas.filter(v=>v.es_kit && !/cancel|anula/i.test(v.estado_pago||'') && !esTest(v.cliente) && !compradores.has(norm(v.cliente)));   // kit = tiene kit, no es prueba y aún NO compra
    this._crmCots=cots.filter(c=>!esTest(c.cliente)); this._crmKits=kits; this._crmNorm=norm;
    const PUERTAS=[['prospectos','🎯 Prospectos'],['marcador','☎️ Marcador'],['digital','💬 Digital'],['organico','🌱 Orgánico']];
    const bot=this._crmBot||[];
    // 🔗 EMBUDO REAL: el lead pasa a Kit cuando llegó a COTIZACIÓN, y SALE del lead cuando ya hay PEDIDO (cruce por celular o nombre)
    const _dig=t=>(t||'').toString().replace(/\D/g,'').slice(-10);
    const telPed=new Set(), nomPed=new Set(), telCot=new Set(), nomCot=new Set();
    (this._crmCots||[]).forEach(c=>{ const t=_dig(c.celular||((c.datos||{}).celular)), n=norm(c.cliente);
      if(c.estado==='pedido'){ if(t)telPed.add(t); if(n)nomPed.add(n); }
      else if(c.estado==='cotizacion'){ if(t)telCot.add(t); if(n)nomCot.add(n); } });
    this._crmCajonDe=l=>{
      const t=_dig(l.telefono), n=norm(l.nombre);
      if((t&&telPed.has(t))||(n&&nomPed.has(n))) return null;      // ya tiene PEDIDO → sale del lead (es cliente)
      if((t&&telCot.has(t))||(n&&nomCot.has(n))) return 'kit';     // llegó a COTIZACIÓN → Kit (prospecto)
      const e=(l.etiqueta||'').toLowerCase();
      return (e==='kit'||e==='interesado'||e==='curioso')?e:null;  // el resto (comprador/baja) queda fuera
    };
    const bc=t=>bot.filter(l=>this._crmCajonDe(l)===t).length;
    const cotD=this._crmCots.filter(c=>c.estado==='cotizacion'&&c.origen==='digital').length;
    const rmkD=this._crmCots.filter(c=>/remark/i.test(c.accion||'')&&c.origen==='digital').length;
    const kitBuyers=new Set(kits.map(k=>norm(k.cliente))).size;
    const mesISO=new Date().toISOString().slice(0,7);   // leads que LLEGARON este mes (por creado_en)
    const bcM=t=>bot.filter(l=>this._crmCajonDe(l)===t && (l.creado_en||'').slice(0,7)===mesISO).length;
    const cotDM=this._crmCots.filter(c=>c.estado==='cotizacion'&&c.origen==='digital'&&(c.creado_en||'').slice(0,7)===mesISO).length;
    const DCAJ1=[['todos','Todos',bc('curioso')+bc('interesado')+bc('kit'),bcM('curioso')+bcM('interesado')+bcM('kit')],['curioso','🤔 Curioso',bc('curioso'),bcM('curioso')],['interesado','💡 Interesado',bc('interesado'),bcM('interesado')],['kit','📦 Kit',bc('kit'),bcM('kit')],['cotiz','📝 Cotización',cotD,cotDM]];
    const DCAJ2=[['remarketing','📣 Remarketing',bc('interesado')],['plantilla','📨 Plantilla Meta',bc('curioso')+bc('plantilla_meta')],['mantenimiento','🔧 Mantenimiento',bc('kit')+bc('comprador')]];
    const DCAJ=[...DCAJ1,...DCAJ2];
    const canal=this._crmCanal||'prospectos'; this._crmCanal=canal;
    let cajon=this._crmCajon||'todos'; if(canal==='digital' && !DCAJ.find(c=>c[0]===cajon)) cajon='todos'; this._crmCajon=cajon;
    this.set(`<h1>CRM · Smart</h1><div class="sub">Conversión: 👋 Contactado → 💡 Interesado → 📦 Kit (prospecto) → 🛒 1ª Compra (cliente)</div>
      <div class="card" style="border-left:4px solid var(--naranja);padding:10px 14px"><div style="font-size:12.5px;color:#445">☎️ <b>${(window.LEADS||[]).length}</b> empresas en marcador · 💬 <b>${bot.length}</b> digital · 🎯 <b>${kitBuyers}</b> prospectos (kit) · 📝 <b>${cotD}</b> en cotización</div>
        <div style="font-size:11px;color:#8a93a6;margin-top:4px">Toca un círculo del embudo para mover un lead de etapa.</div></div>
      <div style="display:flex;gap:6px;margin:10px 0">${PUERTAS.map(([v,n])=>`<button class="btn-sm" style="flex:1;padding:11px;font-weight:700;background:${v===canal?'var(--naranja);color:#fff':'#e5e7eb'}" onclick="App.crmCanal('${v}')">${n}</button>`).join('')}</div>
      ${canal==='digital'?(()=>{ const btn=([v,n,c,m])=>`<button class="btn-sm" style="background:${v===cajon?'#0b1f2a;color:#fff':'#eef2ff;color:#3a48b3'}" onclick="App.crmCajon('${v}')">${n} (${c}${m!==undefined?' · <b>'+m+'</b> mes':''})</button>`;
        return `<div style="font-size:10px;color:#8a93a6;font-weight:800;margin:6px 0 3px">RESUMEN POR CALIFICACIÓN <span style="font-weight:400">(acumulado · este mes)</span></div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">${DCAJ1.map(btn).join('')}</div>
        <div style="font-size:10px;color:#8a93a6;font-weight:800;margin:8px 0 3px">QUÉ HACER · CAMPAÑAS</div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">${DCAJ2.map(btn).join('')}</div>`; })():''}
      ${this._crmItems(canal,cajon)}`);
  },
  crmCanal(c){ this._crmCanal=c; this._crmCajon=null; this.vCrmSmart(); },
  crmCajon(s){ this._crmCajon=s; this.vCrmSmart(); },
  _embStages(canal){
    if(canal==='marcador') return ['👋 Contactado','💡 Interesado','✅ Calificado'];
    if(canal==='digital')  return (window.NC_EMPRESA==='feroz')?['💡 Interesado','🎁 Muestra','✅ Calificado']:['💡 Interesado','📦 Kit','✅ Calificado'];
    if(canal==='organico') return ['🤔 Curioso','💡 Interesado','📦 Kit'];
    return ['👋 Contactado','💡 Interesado','📦 Kit','🛒 1ª Compra'];
  },
  _baseEtapa(canal,tag){
    if(canal==='digital')  { const m={interesado:0,kit:1,comprador:1}; return m[tag]!=null?m[tag]:-1; }
    if(canal==='organico') { const m={curioso:0,interesado:1,kit:2}; return m[tag]!=null?m[tag]:-1; }
    return -1;   // marcador y demás: círculos vacíos hasta que haya acción
  },
  _emb(key,base,canal,nombre,telefono,mode){
    mode=mode||'full';
    if(mode==='none') return '';   // tarjeta liviana, sin círculos
    (this._crmLeadInfo=this._crmLeadInfo||{})[key]={nombre,telefono,canal};
    const dot=on=>`<span style="display:inline-block;width:13px;height:13px;border-radius:50%;vertical-align:middle;background:${on?'#16a34a':'#fff'};border:2px solid ${on?'#0f7a33':'#b9c2cf'}"></span>`;
    if(mode==='seg'){   // Interesado: 1 círculo para marcar seguimiento
      const on=!!(this._crmEmb&&this._crmEmb[key]!=null&&this._crmEmb[key]>=0);
      return `<div style="margin-top:7px;border-top:1px dashed var(--linea);padding-top:7px" onclick="event.stopPropagation()"><span onclick="App.crmSeg('${key}')" title="Marca si le estás haciendo seguimiento" style="cursor:pointer;font-size:11px;font-weight:${on?700:500};color:${on?'#0f7a33':'#6b7686'};white-space:nowrap">${dot(on)} ${on?'🔔 En seguimiento':'Marcar seguimiento'}</span></div>`;
    }
    const st=(this._crmEmb&&this._crmEmb[key]!=null)?this._crmEmb[key]:(base!=null?base:-1);
    const S=this._embStages(canal);
    return `<div style="margin-top:7px;border-top:1px dashed var(--linea);padding-top:7px;display:flex;gap:8px;flex-wrap:wrap" onclick="event.stopPropagation()">${S.map((s,i)=>`<span onclick="App.crmAvanzar('${key}',${i})" title="Marcar: ${s}" style="cursor:pointer;font-size:10px;font-weight:${i<=st?700:500};color:${i<=st?'#0f7a33':'#6b7686'};white-space:nowrap">${dot(i<=st)} ${s}</span>`).join('')}</div>`;
  },
  async crmSeg(key){
    const info=(this._crmLeadInfo||{})[key]||{};
    const cur=(this._crmEmb&&this._crmEmb[key]!=null)?this._crmEmb[key]:-1;
    const nv=cur>=0?-1:0;   // toggle seguimiento on/off
    (this._crmEmb=this._crmEmb||{})[key]=nv;
    try{ await fetch(this._SBU()+'/rest/v1/nc_crm_embudo?on_conflict=empresa,lead_key',{method:'POST',headers:{apikey:this._SBK(),Authorization:'Bearer '+this._SBK(),'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({empresa:window.NC_EMPRESA||'smart',lead_key:key,nombre:info.nombre||'',telefono:info.telefono||'',canal:info.canal||'',etapa:nv})}); }catch(e){}
    (window.NC_EMPRESA==='feroz' && this.vCrm)?this.vCrm():this.vCrmSmart();
  },
  _crmCard(o){
    const tel=(o.telefono||'').replace(/\D/g,'');
    const acc=(!o.noWa&&tel)?`${o.call?`<a class="btn-sm" href="tel:${esc(o.telefono)}" style="background:#2f6fed;color:#fff">📞</a>`:''}<a class="btn-sm" href="https://wa.me/57${tel}" target="_blank" style="background:#25d366;color:#fff">📱</a>`:'';
    const desc=o.descartar?`<button class="btn-sm" style="background:#fde8e8;color:#b3261e;padding:5px 9px" title="Descartar prospecto" onclick="App.crmDescartar('${o.key}')">✕ Descartar</button>`:'';
    return `<div class="item" style="display:block"><div class="top"><div><div class="nom">${esc(o.nombre||'—')}${o.telefono?` <span style="font-weight:600;color:var(--azul);font-size:13px">📱 ${esc(o.telefono)}</span>`:''}</div><div class="meta">${o.ciudad?esc(o.ciudad):''}${o.sub?(o.ciudad?'<br>':'')+esc(o.sub):''}</div></div><div style="display:flex;gap:5px;align-items:center">${o.badge||''}${acc}${desc}</div></div>${this._emb(o.key,o.base,o.canal,o.nombre,o.telefono,o.dots)}</div>`;
  },
  async crmDescartar(key){
    if(!confirm('¿Descartar este prospecto? Sale de la lista (no se borra de las bases).')) return;
    const info=(this._crmLeadInfo||{})[key]||{};
    (this._crmEmb=this._crmEmb||{})[key]=-2;
    try{ await fetch(this._SBU()+'/rest/v1/nc_crm_embudo?on_conflict=empresa,lead_key',{method:'POST',headers:{apikey:this._SBK(),Authorization:'Bearer '+this._SBK(),'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({empresa:window.NC_EMPRESA||'smart',lead_key:key,nombre:info.nombre||'',telefono:info.telefono||'',canal:info.canal||'',etapa:-2})}); }catch(e){}
    (window.NC_EMPRESA==='feroz'&&this.vCrm)?this.vCrm():this.vCrmSmart();
  },
  async crmAvanzar(key,etapa){
    const info=(this._crmLeadInfo||{})[key]||{};
    (this._crmEmb=this._crmEmb||{})[key]=etapa;
    try{ await fetch(this._SBU()+'/rest/v1/nc_crm_embudo?on_conflict=empresa,lead_key',{method:'POST',headers:{apikey:this._SBK(),Authorization:'Bearer '+this._SBK(),'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({empresa:window.NC_EMPRESA||'smart',lead_key:key,nombre:info.nombre||'',telefono:info.telefono||'',canal:info.canal||'',etapa})}); }catch(e){}
    (window.NC_EMPRESA==='feroz' && this.vCrm)?this.vCrm():this.vCrmSmart();
  },
  _crmDigitalLeads(cajon){
    // CAJONES DE ACCIÓN (qué hacer + campañas + resultado)
    const ACCION={remarketing:{tags:['interesado'],t:'Interesados → campaña de REMARKETING'},
                  plantilla:{tags:['curioso','plantilla_meta'],t:'Curiosos → PLANTILLAS de Meta'},
                  mantenimiento:{tags:['kit','comprador'],t:'Clientes (kit/compra) → MANTENIMIENTO'}};
    if(ACCION[cajon]){
      const a=ACCION[cajon]; const bot=(this._crmBot||[]).filter(l=>a.tags.includes(l.etiqueta));
      const head=`<div class="card" style="border-left:4px solid var(--naranja);padding:10px 13px"><div style="font-size:12.5px;color:#445">📋 ${a.t} · <b>${bot.length}</b> personas</div>
        <div style="font-size:10.5px;color:#8a93a6;margin-top:3px">Línea de resultado de la campaña: 📨 plantilla → 💬 conectó → 💡 interés <i>(la llena el agente tras enviar la plantilla)</i></div></div>`;
      if(!bot.length) return head+'<div class="empty">Sin personas en este grupo todavía.</div>';
      return head+bot.map(l=>this._crmCampCard(l)).join('');
    }
    // usa el EMBUDO REAL: kit = llegó a cotización · con pedido = ya salió del lead
    const cd=this._crmCajonDe||(l=>l.etiqueta);
    const bot=(this._crmBot||[]).filter(l=>{ const c=cd(l); return cajon==='todos'?!!c:(c===cajon); });
    if(!bot.length) return '<div class="empty">Sin leads en este cajón.</div>';
    const dots=cajon==='interesado'?'seg':'none';   // interesado: círculo de seguimiento · resto: liviano
    return bot.map(l=>this._crmCard({key:'d'+((l.telefono||l.id)+'').replace(/\D/g,'').slice(0,18),nombre:l.nombre||l.telefono,telefono:l.telefono,ciudad:l.ciudad,sub:(l.ultimo_mensaje||'').slice(0,46),canal:'digital',base:this._baseEtapa('digital',l.etiqueta),noWa:true,dots})).join('');
  },
  _crmCampCard(l){
    const tel=(l.telefono||'').replace(/\D/g,'');
    const dot=on=>`<span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:${on?'#16a34a':'#fff'};border:2px solid ${on?'#0f7a33':'#b9c2cf'};vertical-align:middle"></span>`;
    const st=(lbl,on)=>`<span style="font-size:10px;font-weight:${on?700:500};color:${on?'#0f7a33':'#6b7686'};white-space:nowrap">${dot(on)} ${lbl}</span>`;
    const plant=!!l.camp_plantilla;                                  // se marca cuando Meta ENVÍA la plantilla
    const conecto=!!l.camp_conecto;                                  // respondió al agente tras la plantilla
    const interes=['interesado','kit','comprador'].includes(l.etiqueta); // se volvió esa clase de lead
    return `<div class="item" style="display:block"><div class="top"><div><div class="nom">${esc(l.nombre||l.telefono||'—')}</div><div class="meta">${l.telefono?'📱 '+esc(l.telefono):''}${l.ciudad?' · '+esc(l.ciudad):''}</div></div>${tel?`<a class="btn-sm" href="https://wa.me/57${tel}" target="_blank" style="background:#25d366;color:#fff">📱</a>`:''}</div>
      <div style="margin-top:7px;border-top:1px dashed var(--linea);padding-top:7px;display:flex;gap:13px">${st('📨 Plantilla',plant)}${st('💬 Conectó',conecto)}${st('💡 Interés',interes)}</div></div>`;
  },
  _crmMarcador(){
    const L=(window.LEADS||[]).filter(l=>(l.aplica||'aplica')!=='no aplica');
    const fil=this._crmFil||'todos', ciu=this._crmCiudad||'';
    let arr=L;
    if(fil==='pendiente') arr=arr.filter(l=>/pend/i.test(l.estado||''));
    else if(fil==='especial') arr=arr.filter(l=>/especial/i.test(l.esp||''));
    else if(fil==='alta') arr=arr.filter(l=>/alta/i.test(l.prioridad||''));
    if(ciu) arr=arr.filter(l=>l.ciudad===ciu);
    const ciudades=[...new Set(L.map(l=>l.ciudad).filter(Boolean))].sort();
    const chip=(v,n)=>`<button class="btn-sm" style="background:${fil===v?'var(--naranja);color:#fff':'#eef2ff;color:#3a48b3'}" onclick="App.crmFil('${v}')">${n}</button>`;
    return `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;align-items:center">${chip('todos','Todos')}${chip('pendiente','Pendientes')}${chip('especial','⭐ Especiales')}${chip('alta','🔴 Alta')}<select onchange="App.crmCiudad(this.value)" style="padding:7px;border:1px solid var(--linea);border-radius:8px"><option value="">Toda ciudad</option>${ciudades.map(c=>`<option ${c===ciu?'selected':''}>${esc(c)}</option>`).join('')}</select><span style="font-size:12px;color:#667;font-weight:700">${arr.length} empresas</span></div>${arr.length?arr.slice(0,400).map(l=>this._crmCard({key:'m'+((l.cel||l.empresa)+'').replace(/[^a-z0-9]/gi,'').slice(0,26),nombre:l.empresa,telefono:l.cel,ciudad:[l.ciudad,l.depto].filter(Boolean).join(', '),sub:/especial/i.test(l.esp||'')?'⭐ Especial':'',canal:'marcador',base:-1,call:true})).join(''):'<div class="empty">Sin empresas con ese filtro.</div>'}`;
  },
  _crmProspectos(){
    const norm=this._crmNorm||(s=>(s||'').toLowerCase()); const kits=this._crmKits||[];
    const map={}; kits.forEach(k=>{ const key=norm(k.cliente); (map[key]=map[key]||{nombre:k.cliente,n:0,o:k.origen||'digital'}); map[key].n++; });
    const buyers=Object.values(map).map(b=>({...b,key:'k'+norm(b.nombre).replace(/[^a-z0-9]/gi,'').slice(0,26)})).filter(b=>(this._crmEmb||{})[b.key]!==-2);
    const adv=(this._crmEmbRows||[]).filter(r=>(r.etapa||0)>=2);
    const inp='padding:10px;border:1.5px solid #e3e7ee;border-radius:9px;font-size:14px;width:100%';
    const form=this._crmReg?`<div class="card"><h2 style="font-size:14px">➕ Registrar prospecto</h2>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px"><input id="rp_nom" style="${inp}" placeholder="Nombre"><input id="rp_tel" style="${inp}" inputmode="numeric" placeholder="Teléfono"><input id="rp_ciu" style="${inp}" placeholder="Ciudad"></div>
        <div style="display:flex;gap:6px;margin-top:8px"><button class="btn-sm" style="background:#16a34a;color:#fff;padding:9px 16px" onclick="App.crmRegSave()">💾 Guardar</button><button class="btn-sm" style="background:#e5e7eb;padding:9px 16px" onclick="App.crmRegProspecto()">Cancelar</button></div></div>`
      :`<button class="btn-sm" style="background:#16a34a;color:#fff;margin-bottom:10px;width:100%;padding:12px" onclick="App.crmRegProspecto()">🔎 Registrar / Editar contacto · valida en tus bases</button>`;
    const resumen=`<div style="font-size:11.5px;color:#667;margin-bottom:8px">📦 <b>${buyers.length}</b> compraron kit (prospectos) · al lograr 🛒 1ª compra pasan a Clientes</div>`;
    const cards=buyers.map(b=>this._crmCard({key:b.key,nombre:b.nombre,sub:b.n+' kit comprado · '+b.o,canal:(b.o==='organico'?'organico':b.o==='marcador'?'marcador':'digital'),base:-1,noWa:true,descartar:true})).join('')
      + adv.filter(r=>!/^k/.test(r.lead_key||'')).map(r=>this._crmCard({key:r.lead_key,nombre:r.nombre,telefono:r.telefono,sub:'calificado',canal:r.canal||'digital',base:r.etapa,noWa:true,descartar:true})).join('');
    return form+resumen+(buyers.length||adv.length?cards:'<div class="empty">Aún nadie compró kit. Avanza un lead a 📦 Kit y aparece aquí.</div>');
  },
  crmRegProspecto(){ this._crmReg=!this._crmReg; this.vCrmSmart(); },
  async crmRegSave(){
    const g=id=>(document.getElementById(id)||{}).value||'';
    const nombre=g('rp_nom'), tel=g('rp_tel').replace(/\D/g,'');
    if(!nombre && !tel){ alert('Pon al menos nombre o teléfono.'); return; }
    if(tel){   // valida en TODAS las bases de Smart para no duplicar
      const H={apikey:this._SBK(),Authorization:'Bearer '+this._SBK()}, found=[];
      try{ const a=await (await fetch(this._SBU()+'/rest/v1/nc_clientes?empresa=eq.smart&celular=ilike.*'+tel+'*&select=nombre&limit=1',{headers:H})).json(); if(a&&a.length) found.push('Clientes'); }catch(e){}
      try{ const a=await (await fetch(this._SBU()+'/rest/v1/nc_bot_leads?empresa=eq.smart&telefono=ilike.*'+tel+'*&select=nombre&limit=1',{headers:H})).json(); if(a&&a.length) found.push('Bot/Digital'); }catch(e){}
      try{ const a=await (await fetch(this._SBU()+'/rest/v1/smart_marcador_leads?cel=ilike.*'+tel+'*&select=nombre&limit=1',{headers:H})).json(); if(a&&a.length) found.push('Marcador'); }catch(e){}
      if(found.length && !confirm('⚠️ Ese teléfono ya existe en: '+found.join(', ')+'. ¿Registrarlo igual como prospecto?')) return;
    }
    const key='r'+(tel||nombre.replace(/[^a-z0-9]/gi,'')).slice(0,26);
    try{ await fetch(this._SBU()+'/rest/v1/nc_crm_embudo?on_conflict=empresa,lead_key',{method:'POST',headers:{apikey:this._SBK(),Authorization:'Bearer '+this._SBK(),'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({empresa:'smart',lead_key:key,nombre,telefono:tel,canal:'registrado',etapa:2})}); }catch(e){}
    this._crmReg=false; this._crmCanal='prospectos'; this.vCrmSmart();
  },
  crmFil(f){ this._crmFil=f; this.vCrmSmart(); },
  crmCiudad(c){ this._crmCiudad=c; this.vCrmSmart(); },
  cobZona(z){ this._cobZona=this._cobZona===z?null:z; this.vCoberturaSmart(); },
  async vCoberturaSmart(){
    this.loading();
    const H={apikey:this._SBK(),Authorization:'Bearer '+this._SBK()};
    let cli=[], ventas=[], peds=[];
    try{ const r=await fetch(this._SBU()+'/rest/v1/nc_clientes?empresa=eq.smart&limit=2000',{headers:H}); const j=await r.json(); cli=Array.isArray(j)?j:[]; }catch(e){}
    try{ const r=await fetch(this._SBU()+'/rest/v1/nc_ventas?empresa=eq.smart&select=documento,cliente,total_vendido,mes,estado_pago&limit=3000',{headers:H}); const j=await r.json(); ventas=Array.isArray(j)?j:[]; }catch(e){}
    try{ const r=await fetch(this._SBU()+'/rest/v1/nc_cotizaciones?empresa=eq.smart&estado=eq.pedido&select=cliente,total,creado_en,datos&limit=2000',{headers:H}); const j=await r.json(); peds=Array.isArray(j)?j:[]; }catch(e){}
    const cl=n=>'$'+Math.round(n||0).toLocaleString('es-CO');
    const norm=s=>(s||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Z0-9 ]/g,' ').replace(/\b(SAS|LTDA|SA|EU)\b/g,' ').replace(/\s+/g,' ').trim();
    const gm=this._geoMap(), dz=this._geoDeptoZona(), extra=this._cityDeptoExtra(), na=s=>this._na(s);
    const zonaHub={}; (window.GEO_CO?window.GEO_CO.zonas:[]).forEach(z=>{ zonaHub[z.nombre]=z.hub; });
    // mapas ciudad + departamento por cliente (doc y nombre)
    const zonaSet=new Set((window.GEO_CO?window.GEO_CO.zonas:[]).map(z=>na(z.nombre)));
    const zonaNombre={}; (window.GEO_CO?window.GEO_CO.zonas:[]).forEach(z=>zonaNombre[na(z.nombre)]=z.nombre);
    const cityByDoc={}, cityByName={}, depByDoc={}, depByName={}, zonByDoc={}, zonByName={};
    cli.forEach(c=>{ const d=c.datos||{}; const ciu=((d.ciu||d.ciudad||d.ciuj||'')+'').trim(); const dep=((d.dep||d.depj||d.dep_factura||'')+'').trim(); const zona=((d.zona||'')+'').trim();
      if(c.documento){ cityByDoc[c.documento]=ciu; depByDoc[c.documento]=dep; zonByDoc[c.documento]=zona; } if(c.nombre){ cityByName[norm(c.nombre)]=ciu; depByName[norm(c.nombre)]=dep; zonByName[norm(c.nombre)]=zona; } });
    const geoOf=(doc,nombre)=>{ const k=norm(nombre||''); let ciu=((cityByDoc[doc]||cityByName[k]||'')+'').trim();
      if(ciu && na(ciu)!=='no aplica'){ const g=gm[na(ciu)]; if(g) return {ciu, zona:g.zona, depto:g.depto};
        const ex=extra[na(ciu)]; if(ex){ const ze=dz[na(ex)]; if(ze) return {ciu, zona:ze, depto:ex}; } }
      const dep=((depByDoc[doc]||depByName[k]||'')+'').trim(); const zn=dep?dz[na(dep)]:null; if(zn) return {ciu:ciu||dep, zona:zn, depto:dep};
      const zg=((zonByDoc[doc]||zonByName[k]||'')+'').trim(); if(zg && zonaSet.has(na(zg))) return {ciu:ciu||zg, zona:zonaNombre[na(zg)], depto:dep||null};
      return {ciu, zona:'(sin ubicar)', depto:null}; };
    // fechas: lunes de esta semana + hoy
    const now=new Date(); const dow=(now.getDay()+6)%7; const monday=new Date(now); monday.setHours(0,0,0,0); monday.setDate(now.getDate()-dow);
    const hoyStr=now.toISOString().slice(0,10);
    const MM=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']; const mesActual=MM[now.getMonth()]+'-'+now.getFullYear();
    const byZona={}; let ubicados=0, sinUbicar=0; const ciudadesCub=new Set();
    const Z=zn=>(byZona[zn]=byZona[zn]||{cli:0,anio:0,mes:0,sem:0,hoy:0,aC:new Set(),mC:new Set(),sC:new Set(),hC:new Set(),deptos:{}});
    cli.forEach(c=>{ const g=geoOf(c.documento,c.nombre); if(g.zona!=='(sin ubicar)'){ubicados++; ciudadesCub.add(g.ciu.toLowerCase());} else sinUbicar++; Z(g.zona).cli++; });
    ventas.forEach(v=>{ if(/cancel|anula/i.test(v.estado_pago||''))return; const g=geoOf(v.documento,v.cliente); const tv=+v.total_vendido||0; const ck=norm(v.cliente); const z=Z(g.zona); z.anio+=tv; z.aC.add(ck); if(v.mes===mesActual){ z.mes+=tv; z.mC.add(ck); }
      if(g.depto){ const dp=(z.deptos[g.depto]=z.deptos[g.depto]||{anio:0,ciudades:{}}); dp.anio+=tv; if(g.ciu) dp.ciudades[g.ciu]=(dp.ciudades[g.ciu]||0)+tv; } });
    peds.forEach(p=>{ const d=p.datos||{}; const g=geoOf(d.cedula_nit,p.cliente); const t=+p.total||0; const ck=norm(p.cliente); const dStr=(p.creado_en||'').slice(0,10); const z=Z(g.zona); if(new Date(p.creado_en)>=monday){ z.sem+=t; z.sC.add(ck); } if(dStr===hoyStr){ z.hoy+=t; z.hC.add(ck); } });
    const totalZonas=Object.keys(zonaHub).length;
    const conPresencia=Object.keys(byZona).filter(z=>z!=='(sin ubicar)').length;
    const gaps=Object.keys(zonaHub).filter(z=>!byZona[z]);
    const zonas=Object.entries(byZona).sort((a,b)=>b[1].anio-a[1].anio);
    const maxZ=Math.max(1,...zonas.map(z=>z[1].anio));
    const totA=zonas.reduce((a,z)=>a+z[1].anio,0), totH=zonas.reduce((a,z)=>a+z[1].hoy,0);
    const fuerte=(zonas.find(z=>z[0]!=='(sin ubicar)')||[null])[0];
    const exp=this._cobZona;
    this.set(`<h1>Cobertura · Smart</h1><div class="sub">Fortaleza por zona · Año · Mes · Semana · Hoy</div>
      <div class="kpis">
        <div class="kpi naranja"><b>${conPresencia}/${totalZonas}</b><span>Zonas con presencia</span></div>
        <div class="kpi"><b>${ciudadesCub.size}</b><span>Ciudades cubiertas</span></div>
        <div class="kpi verde"><b>${cl(totA)}</b><span>Ventas año (acum.)</span></div>
        <div class="kpi"><b>${cl(totH)}</b><span>Ventas hoy</span></div>
      </div>
      ${fuerte?`<div class="card" style="border-left:4px solid var(--verde)"><b>🏆 Zona más fuerte: ${esc(fuerte)}</b> — ${cl((byZona[fuerte]||{}).anio)} (${((byZona[fuerte].anio/(totA||1))*100).toFixed(0)}% del año)${sinUbicar?` · <span style="color:#8a93a6">${sinUbicar} sin ubicar</span>`:''}</div>`:''}
      ${gaps.length?`<div class="card" style="border-left:4px solid var(--rojo)"><b style="color:var(--rojo)">🎯 Zonas sin presencia (oportunidad):</b> ${gaps.map(g=>esc(g)+(zonaHub[g]?' · '+esc(zonaHub[g]):'')).join('  ·  ')}</div>`:''}
      <div class="card"><h2 style="font-size:15px;margin-bottom:6px">🗺️ Ventas por zona</h2>
        <div style="display:flex;font-size:10.5px;color:#8a93a6;font-weight:700;padding:0 6px 4px"><span style="flex:1">ZONA</span><span style="width:23%;text-align:right">AÑO</span><span style="width:23%;text-align:right">MES</span><span style="width:18%;text-align:right">SEM</span><span style="width:16%;text-align:right">HOY</span></div>
        ${zonas.map(([zn,z])=>{ const isExp=exp===zn; return `<div style="margin-bottom:6px;border-bottom:1px solid var(--linea);padding-bottom:5px">
          <div onclick="App.cobZona('${esc(zn).replace(/'/g,'')}')" style="cursor:pointer;display:flex;align-items:center;padding:4px 6px;border-radius:6px;font-size:12.5px;background:${isExp?'#f4f6fb':''}">
            <span style="flex:1"><b>${isExp?'▼':'▸'} ${esc(zn)}</b>${zn===fuerte?' 🏆':''} <small style="color:#8a93a6">(${z.cli})</small></span>
            <span style="width:23%;text-align:right;font-weight:700">${cl(z.anio)} <small style="color:#8a93a6;font-weight:400">(${z.aC.size})</small></span>
            <span style="width:23%;text-align:right">${cl(z.mes)} <small style="color:#8a93a6">(${z.mC.size})</small></span>
            <span style="width:18%;text-align:right">${cl(z.sem)} <small style="color:#8a93a6">(${z.sC.size})</small></span>
            <span style="width:16%;text-align:right;color:${z.hoy>0?'var(--verde)':'#bbb'}">${cl(z.hoy)} <small style="color:#8a93a6">(${z.hC.size})</small></span>
          </div>
          <div style="height:5px;background:var(--gris);border-radius:3px;overflow:hidden;margin:1px 6px"><div style="height:100%;width:${(z.anio/maxZ*100).toFixed(0)}%;background:var(--naranja)"></div></div>
          ${isExp?`<div style="padding:4px 16px;font-size:11.5px">${Object.entries(z.deptos).sort((a,b)=>b[1].anio-a[1].anio).map(([dn,dp])=>`<div style="padding:3px 0"><b>${esc(dn)}</b> · ${cl(dp.anio)} <span style="color:#8a93a6">— ${Object.entries(dp.ciudades).sort((a,b)=>b[1]-a[1]).map(([cn,vv])=>esc(cn)+' '+cl(vv)).join(' · ')}</span></div>`).join('')||'<div style="color:#8a93a6">Sin detalle</div>'}</div>`:''}
        </div>`;}).join('')||'<div class="empty">Sin datos.</div>'}
      </div>`);
  },
  async vClientesSmart(){
    this.loading();
    let cli=[], ventas=[];
    const H={apikey:this._SBK(),Authorization:'Bearer '+this._SBK()};
    try{ const r=await fetch(this._SBU()+'/rest/v1/nc_clientes?empresa=eq.smart&order=nombre.asc&limit=2000',{headers:H}); const j=await r.json(); cli=Array.isArray(j)?j:[]; }catch(e){}
    try{ const r=await fetch(this._SBU()+'/rest/v1/nc_ventas?empresa=eq.smart&select=documento,cliente,total_vendido,comision_bruta,mes,pedidos_mes,estado_pago&limit=3000',{headers:H}); const j=await r.json(); ventas=Array.isArray(j)?j:[]; }catch(e){}
    const cl=n=>'$'+Math.round(n||0).toLocaleString('es-CO');
    const norm=s=>(s||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Z0-9 ]/g,' ').replace(/\b(SAS|LTDA|SA|EU)\b/g,' ').replace(/\s+/g,' ').trim();
    const titt=s=>(s||'').toLowerCase().replace(/(^|\s)\S/g,c=>c.toUpperCase());
    const MESES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']; const mesActual=MESES[new Date().getMonth()]+'-'+new Date().getFullYear();
    this._mesActual=mesActual;
    try{ const rc=await fetch(this._SBU()+'/rest/v1/nc_recompra_contacto?empresa=eq.smart&mes=eq.'+encodeURIComponent(mesActual)+'&select=ref',{headers:H}); const jc=await rc.json(); this._contactadoMes=new Set((Array.isArray(jc)?jc:[]).map(x=>x.ref)); }catch(e){ this._contactadoMes=new Set(); }
    const hoy=new Date().toISOString().slice(0,10);
    const vReal=ventas.filter(v=>!/cancel|anula/i.test(v.estado_pago||''));
    // recurrentes: compran TODOS los meses con actividad
    const meses=[...new Set(vReal.map(v=>v.mes).filter(Boolean))];
    const cliMeses={}; vReal.forEach(v=>{ const k=norm(v.cliente); if(!k)return; (cliMeses[k]=cliMeses[k]||new Set()).add(v.mes); });
    const recurrentes=Object.values(cliMeses).filter(s=>s.size>=2).length;   // repiten en 2+ meses (recurrencia real)
    const nuevosHoy=cli.filter(c=>(c.updated_at||c.creado_en||'').slice(0,10)===hoy).length;
    const ventasMes=vReal.filter(v=>v.mes===mesActual).reduce((a,v)=>a+(+v.total_vendido||0),0);
    // META = clientes con UNA compra > $300k (el perfil que buscamos)
    const perfilSet=new Set(); vReal.filter(v=>(+v.total_vendido||0)>300000).forEach(v=>perfilSet.add(norm(v.cliente)));
    const perfil=perfilSet.size, METcli=1000, avP=Math.min(100,perfil/METcli*100);
    const porCli={};
    vReal.forEach(x=>{ const k=norm(x.cliente)||'s/c'; const g=(porCli[k]=porCli[k]||{v:0,c:0,n:0,best:x.cliente,bv:-1,esteMes:false,doc:''}); const tv=+x.total_vendido||0; g.v+=tv; g.c+=+x.comision_bruta||0; g.n++; if(tv>g.bv){g.bv=tv;g.best=x.cliente;} if(x.documento && !g.doc) g.doc=x.documento; if(x.mes===mesActual) g.esteMes=true; });
    // ── Inteligencia de recompra por cliente ──
    this._cliByDoc={}; cli.forEach(c=>{ this._cliByDoc[c.documento]=c; });
    this._celByName={}; cli.forEach(c=>{ if(!c.celular) return; const kk=norm(c.nombre); if(kk) this._celByName[kk]=c.celular; const core=norm(String(c.nombre).replace(/\(.*?\)/g,'')); if(core && !this._celByName[core]) this._celByName[core]=c.celular; });
    const mNum=m=>{const M={ene:0,feb:1,mar:2,abr:3,may:4,jun:5,jul:6,ago:7,sep:8,oct:9,nov:10,dic:11};const[a,b]=String(m||'').split('-');return b?(+b)*12+(M[(a||'').toLowerCase()]||0):0;};
    const MM=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']; const numM=n=>n?MM[n%12]+'-'+Math.floor(n/12):'—';
    const nowM=mNum(mesActual);
    const byCli={};
    vReal.forEach(v=>{ const k=norm(v.cliente); if(!k)return; const o=(byCli[k]=byCli[k]||{rows:[],best:v.cliente,bv:-1,doc:v.documento||''}); o.rows.push(v); const tv=+v.total_vendido||0; if(tv>o.bv){o.bv=tv;o.best=v.cliente;o.doc=v.documento||o.doc;} });
    this._cliAnalitico=Object.values(byCli).map(o=>{
      const months=[...new Set(o.rows.map(r=>mNum(r.mes)).filter(Boolean))].sort((a,b)=>a-b);
      const veces=o.rows.reduce((a,r)=>a+(+r.pedidos_mes||1),0);
      const ultima=months.length?months[months.length-1]:0;
      let frec=null,prox=null;
      if(months.length>=2){ frec=Math.max(1,Math.round((months[months.length-1]-months[0])/(months.length-1))); prox=ultima+frec; }
      return {best:titt(o.best), doc:o.doc, cel:(((this._cliByDoc||{})[o.doc]||{}).celular)||(this._celByName||{})[norm(o.best)]||'', veces, ultimaTxt:numM(ultima), frecTxt: months.length<2?'1ª compra':(frec<=1?'mensual':'cada ~'+frec+' meses'), proxTxt: prox?numM(prox):'—', atrasado: !!(prox && prox<nowM)};
    }).sort((a,b)=> a.atrasado!==b.atrasado ? (a.atrasado?-1:1) : b.veces-a.veces);
    const atrasados=this._cliAnalitico.filter(c=>c.atrasado).length;
    this.set(`<h1>Clientes · Smart</h1><div class="sub">Dashboard de clientes · perfil meta y recurrencia</div>
      <div class="kpis">
        <div class="kpi naranja"><b>${cli.length}</b><span>Clientes</span></div>
        <div class="kpi verde"><b>${recurrentes}</b><span>Recurrentes (repiten 2+ meses)</span></div>
        <div class="kpi"><b>${nuevosHoy}</b><span>Clientes hoy</span></div>
        <div class="kpi"><b>${cl(ventasMes)}</b><span>Ventas del mes (acum.)</span></div>
      </div>
      <div class="card" style="border-left:4px solid var(--naranja)"><h2 style="font-size:15px;margin-bottom:6px">🎯 Meta: clientes perfil "+$300k en una compra"</h2>
        <div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font-size:24px;font-weight:800;color:var(--naranja)">${perfil} / ${METcli}</span><span style="font-size:12px;color:#667">${avP.toFixed(1)}%</span></div>
        <div style="height:14px;background:var(--gris);border-radius:8px;overflow:hidden;margin-top:8px"><div style="height:100%;width:${avP.toFixed(1)}%;background:var(--naranja)"></div></div>
        <div style="font-size:11.5px;color:#667;margin-top:6px">Buscamos <b>1.000 clientes</b> que en una sola compra superen <b>$300k</b> y compren <b>cada mes</b> → <b>$300.000.000/mes</b>. Vas en ${perfil}, faltan ${Math.max(0,METcli-perfil)}.</div>
      </div>
      <div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><h2 style="font-size:15px;margin-bottom:4px">🏆 Top clientes · barrido de llamadas</h2><button class="btn-sm" style="background:#eef2ff;color:#3a48b3" onclick="window.print()">🖨️ Imprimir</button></div>
        <div style="font-size:11.5px;color:#667;margin-bottom:8px">🟢 ya pidió en ${mesActual} · ⚪ no este mes　|　🟢 bolita = <b>ya lo contacté</b> (clic) · ⚪ por contactar</div>
        ${Object.entries(porCli).sort((a,b)=>b[1].v-a[1].v).slice(0,30).map(([k,o])=>{ const ref=o.doc||k; const cli2=(this._cliByDoc||{})[o.doc]||{}; const cel=((cli2.celular||(this._celByName||{})[k]||'')+''); const tel=cel.replace(/\D/g,''); const on=o.esteMes||(this._contactadoMes||new Set()).has(ref); return `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 9px;border-bottom:1px solid var(--linea);font-size:13px;border-radius:6px;${o.esteMes?'background:#e7f7ee':''}">
          <span>${o.esteMes?'🟢':'⚪'} ${esc(titt(o.best))} <small style="color:var(--gristxt)">(${o.n})</small>${cel?` · <span style="color:#445;font-weight:600">📱 ${esc(cel)}</span>`:` · <button onclick="App.cliSmartTel('${esc(o.doc||'')}')" style="background:#fff3e0;color:#b45309;border:1px solid #fed7aa;border-radius:7px;padding:2px 8px;font-size:11px;cursor:pointer">➕ Tel</button>`}</span>
          <span style="display:flex;align-items:center;gap:9px"><b>${cl(o.v)}</b> · <span style="color:var(--verde)">${cl(o.c)}</span><span ${o.esteMes?'':`onclick="App.recompraToggle('${esc(ref)}')"`} id="bola-${esc(ref).replace(/[^a-zA-Z0-9]/g,'')}" title="${o.esteMes?'Compró este mes → contactado ✓':'Marca que ya lo contacté este mes (clic)'}" style="display:inline-block;width:16px;height:16px;border-radius:50%;border:2px solid #16a34a;background:${on?'#16a34a':'#fff'};flex:none;${o.esteMes?'':'cursor:pointer'}"></span></span>
        </div>`;}).join('')||'<div class="empty">Sin datos</div>'}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin:8px 0 4px"><h2 style="font-size:15px">📋 Clientes · frecuencia y pronóstico</h2>${atrasados?`<span class="badge" style="background:#fde8e8;color:#b3261e">⚠️ ${atrasados} atrasados</span>`:''}</div>
      <input id="cq" placeholder="🔍 Buscar cliente…" style="margin:0 0 10px;padding:10px;border:1px solid var(--linea);border-radius:8px;width:100%;box-sizing:border-box" oninput="App._filtrarCli()">
      <div id="cliList">${this._cliAnaRows(this._cliAnalitico)}</div>`);
  },
  _cliAnaRows(arr){
    if(!arr||!arr.length) return '<div class="empty">Sin clientes con compras.</div>';
    return arr.map(c=>{ const cel=(c.cel||''); const tel=(cel+'').replace(/\D/g,'');
      return `<div class="item" style="${c.atrasado?'border-left:3px solid var(--rojo)':''}"><div class="top"><div><div class="nom">${esc(c.best)}${cel?` · <span style="font-size:12px;color:#445;font-weight:600">📱 ${esc(cel)}</span>`:''}</div>
        <div class="meta">🛒 ${c.veces} compra(s) · última ${c.ultimaTxt} · 🔁 ${c.frecTxt}${c.proxTxt!=='—'?' · 🔮 próx '+c.proxTxt:''}${c.atrasado?' · <b style="color:var(--rojo)">⚠️ atrasado</b>':''}</div></div></div>
        <div class="acciones-item">
          <button class="btn-sm" style="background:var(--naranja);color:#fff" onclick="App.cotAbrir('${esc(c.doc)}')">🧮 Cotizar</button>
          ${tel?`<a class="btn-sm" href="https://wa.me/57${tel}" target="_blank" style="background:#25d366;color:#fff">📱 WhatsApp</a><a class="btn-sm" href="tel:${esc(cel)}" style="background:#2f6fed;color:#fff">📞 Llamar</a>`:''}
        </div></div>`;}).join('');
  },
  _filtrarCli(){ const i=$('cq'); const q=(i&&i.value||'').toLowerCase(); const f=(this._cliAnalitico||[]).filter(c=>(c.best+' '+c.doc).toLowerCase().includes(q)); const w=$('cliList'); if(w) w.innerHTML=this._cliAnaRows(f); },
  async recompraToggle(ref){
    const mes=this._mesActual||''; const set=this._contactadoMes||(this._contactadoMes=new Set());
    const H={apikey:this._SBK(),Authorization:'Bearer '+this._SBK()};
    try{
      if(set.has(ref)){ await fetch(this._SBU()+'/rest/v1/nc_recompra_contacto?empresa=eq.smart&ref=eq.'+encodeURIComponent(ref),{method:'DELETE',headers:H}); set.delete(ref); }
      else { await fetch(this._SBU()+'/rest/v1/nc_recompra_contacto?on_conflict=empresa,ref',{method:'POST',headers:{...H,'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({empresa:'smart',ref,mes})}); set.add(ref); }
      const el=document.getElementById('bola-'+ref.replace(/[^a-zA-Z0-9]/g,'')); if(el) el.style.background=set.has(ref)?'#16a34a':'#fff';
    }catch(e){}
  },
  async cliSmartTel(doc){
    if(!doc){ alert('Este cliente no tiene documento en la base para guardar el teléfono.'); return; }
    const v=prompt('📱 Teléfono / celular del cliente (para contactarlo por WhatsApp):'); if(v===null) return;
    const t=(v||'').replace(/\D/g,''); if(t.length<7){ alert('Número inválido.'); return; }
    const H={apikey:this._SBK(),Authorization:'Bearer '+this._SBK(),'Content-Type':'application/json','Prefer':'return=minimal'};
    try{
      await fetch(this._SBU()+'/rest/v1/nc_clientes?empresa=eq.smart&documento=eq.'+encodeURIComponent(doc),{method:'PATCH',headers:H,body:JSON.stringify({celular:t})});
      this._toast('📱 Teléfono guardado'); this.vClientesSmart();
    }catch(e){ alert('No se pudo guardar: '+e); }
  },
  _crmItems(canal,cajon){
    if(canal==='prospectos') return this._crmProspectos();
    if(canal==='marcador') return this._crmMarcador();
    if(canal==='organico') return '<div class="empty">Sin leads orgánicos aún. Llegan por contenido/recomendación, o regístralos como prospecto.</div>';
    if(canal==='digital' && ['todos','curioso','interesado','kit','plantilla','remarketing','mantenimiento'].includes(cajon)) return this._crmDigitalLeads(cajon);
    const cl=n=>'$'+Math.round(n||0).toLocaleString('es-CO');
    const cots=this._crmCots||[];
    const badge=`<span class="badge" style="background:#eef2ff;color:#3a48b3">💬 digital</span>`;
    if(cajon==='cotiz'){
      const arr=cots.filter(c=>c.estado==='cotizacion' && c.origen==='digital');
      if(!arr.length) return '<div class="empty">Sin cotizaciones en Digital.</div>';
      return arr.map(c=>`<div class="item"><div class="top"><div><div class="nom">${esc(c.cliente||c.folio||'—')}</div><div class="meta">${c.folio?esc(c.folio)+' · ':''}${cl(c.total)} · 📅 ${(c.creado_en||'').slice(0,10)}</div></div>${badge}</div></div>`).join('');
    }
    if(cajon==='rmk'){
      const arr=cots.filter(c=>/remark/i.test(c.accion||'') && c.origen==='digital');
      if(!arr.length) return '<div class="empty">Sin remarketing en Digital todavía.</div>';
      return arr.map(c=>`<div class="item"><div class="top"><div><div class="nom">${esc(c.cliente||'—')}</div><div class="meta">${cl(c.total)} · 📅 ${(c.creado_en||'').slice(0,10)}</div></div>${badge}</div></div>`).join('');
    }
    return '<div class="empty">—</div>';
  },

  /* ---------- PLANTA · INVENTARIOS SMART (disponible + cobertura + alerta <1000) ---------- */
  _invCat(){ return [
    {sku:'F115',ref:'115 ml',ml:115,cols:['transparente']},{sku:'F155',ref:'155 ml',ml:155,cols:['transparente','blanco']},
    {sku:'F180',ref:'180 ml',ml:180,cols:['transparente','blanco']},{sku:'F235',ref:'235 ml',ml:235,cols:['transparente']},
    {sku:'F240',ref:'240 ml',ml:240,cols:['transparente','blanco']},{sku:'F275',ref:'275 ml',ml:275,cols:['transparente','blanco']},
    {sku:'F285',ref:'285 ml',ml:285,cols:['transparente','blanco']},{sku:'PM330',ref:'330 ml PET',ml:330,cols:['transparente']},
    {sku:'F365',ref:'365 ml',ml:365,cols:['transparente','blanco']},{sku:'F400',ref:'400 ml',ml:400,cols:['transparente']},
    {sku:'F520',ref:'520 ml',ml:520,cols:['transparente','blanco']},{sku:'F565',ref:'565 ml',ml:565,cols:['transparente','blanco']},
    {sku:'F801',ref:'801 ml',ml:801,cols:['transparente']},{sku:'PM1000',ref:'1.000 ml PET',ml:1000,cols:['transparente']},
    {sku:'F1001',ref:'1.000 ml',ml:1001,cols:['transparente','blanco']},{sku:'F1180',ref:'1.180 ml',ml:1180,cols:['transparente','blanco']},
    {sku:'F1500C',ref:'1.500 ml',ml:1500,cols:['transparente']},{sku:'F192',ref:'ITF 193×127',ml:9999,cols:['transparente']} ]; },
  _invSort(a,b){ if(!this._mlBy){ this._mlBy={}; this._invCat().forEach(c=>this._mlBy[c.sku]=c.ml); } const ka=(this._mlBy[a.sku]||9999)*10+(/blanc/i.test(a.color)?1:0), kb=(this._mlBy[b.sku]||9999)*10+(/blanc/i.test(b.color)?1:0); return ka-kb; },
  async vPlantaSmart(){
    this.loading();
    const H={apikey:this._SBK(),Authorization:'Bearer '+this._SBK()};
    let inv=[], peds=[];
    try{ const r=await fetch(this._SBU()+'/rest/v1/nc_inventario?empresa=eq.smart&order=fecha.desc,creado_en.desc&limit=3000',{headers:H}); const j=await r.json(); inv=Array.isArray(j)?j:[]; }catch(e){}
    try{ const r=await fetch(this._SBU()+'/rest/v1/nc_cotizaciones?empresa=eq.smart&estado=eq.pedido&select=datos,creado_en&limit=2000',{headers:H}); const j=await r.json(); peds=Array.isArray(j)?j:[]; }catch(e){}
    let vref=[];
    try{ const r=await fetch(this._SBU()+'/rest/v1/nc_ventas_ref?empresa=eq.smart&select=mes,ref,unidades&limit=5000',{headers:H}); const j=await r.json(); vref=Array.isArray(j)?j:[]; }catch(e){}
    let metas=[], resumen=[], pend=[];
    try{ metas=await (await fetch(this._SBU()+'/rest/v1/nc_metas?empresa=eq.smart&order=mes_num',{headers:H})).json(); }catch(e){}
    try{ resumen=await (await fetch(this._SBU()+'/rest/v1/nc_resumen_mensual?empresa=eq.smart',{headers:H})).json(); }catch(e){}
    try{ pend=await (await fetch(this._SBU()+'/rest/v1/nc_pendientes?empresa=eq.smart&order=fecha.desc,creado_en.desc',{headers:H})).json(); }catch(e){}
    this._inv=inv; this._peds=peds; this._vref=vref;
    this._metas=Array.isArray(metas)?metas:[]; this._resumen=Array.isArray(resumen)?resumen:[]; this._pend=Array.isArray(pend)?pend:[];
    const seen={}, vigente=[], archivo=[];
    inv.forEach(x=>{ const k=x.sku+'|'+x.color; if(!seen[k]){ seen[k]=x; vigente.push(x); } else archivo.push(x); });
    this._plVigente=vigente; this._plArchivo=archivo;
    // referencias (catálogo base + las creadas/en inventario)
    const refMap={}; this._invCat().forEach(c=>refMap[c.sku]={sku:c.sku,ref:c.ref,cols:[...c.cols]});
    vigente.forEach(x=>{ const r=(refMap[x.sku]=refMap[x.sku]||{sku:x.sku,ref:x.referencia||'',cols:[]}); if(!r.cols.includes(x.color)) r.cols.push(x.color); if(x.referencia&&!r.ref) r.ref=x.referencia; });
    this._plRefs=Object.values(refMap).sort((a,b)=>a.sku.localeCompare(b.sku));
    const agotados=vigente.filter(x=>x.activo && (+x.cantidad||0)<=0);                              // 🔴 en CERO
    const bajos=vigente.filter(x=>x.activo && (+x.cantidad||0)>0 && (+x.cantidad||0)<1000);        // ⚠️ bajo 1.000
    const tab=this._plTab||'ver'; this._plTab=tab;
    const INV2=[['ver','📦 Inventario'],['nuevaref','🆕 Nueva ref'],['registrar','➕ Registrar'],['informes','📊 Informes']];
    const inGroup=INV2.some(([v])=>v===tab);
    const L1=[['ver','📦 Inventario',inGroup],['metas','🎯 Meta Ventas',tab==='metas'],['pendientes','📌 Pendientes',tab==='pendientes']];
    const body = tab==='nuevaref'?this._plNuevaRef() : tab==='registrar'?this._plRegistrar() : tab==='informes'?this._plInformes() : tab==='metas'?this._plMetas() : tab==='pendientes'?this._plPendientes() : this._plVer();
    this.set(`<h1>Planta · Inventario</h1><div class="sub">Referencias · montajes · informes</div>
      <div class="card" style="border-left:4px solid ${(agotados.length||bajos.length)?'var(--rojo)':'var(--verde)'};padding:10px 14px">
        ${agotados.length?`<b style="color:var(--rojo)">🔴 ${agotados.length} referencia(s) AGOTADA(S) — en cero</b><div style="font-size:12px;margin-top:4px;font-weight:700;color:var(--rojo)">${agotados.map(b=>esc(b.sku)+' '+esc(b.color)).join(' · ')}</div>`:''}
        ${(agotados.length&&bajos.length)?'<div style="border-top:1px solid var(--linea);margin:8px 0"></div>':''}
        ${bajos.length?`<b style="color:#b45309">⚠️ ${bajos.length} referencia(s) con menos de 1.000 envases</b><div style="font-size:12px;margin-top:4px">${bajos.map(b=>esc(b.sku)+' '+esc(b.color)+' ('+Math.round(b.cantidad)+')').join(' · ')}</div>`:''}
        ${(!agotados.length&&!bajos.length)?'<b style="color:var(--verde)">✅ Ninguna referencia agotada ni bajo 1.000</b>':''}
      </div>
      <div style="display:flex;gap:6px;margin:10px 0 8px;overflow-x:auto">${L1.map(([v,n,a])=>`<button class="btn-sm" style="flex:0 0 auto;padding:10px 16px;font-weight:700;font-size:12.5px;background:${a?'var(--naranja);color:#fff':'#e5e7eb;color:#555'}" onclick="App.plTab('${v}')">${n}</button>`).join('')}</div>
      ${inGroup?`<div style="display:flex;gap:5px;margin:0 0 12px;overflow-x:auto;padding-left:8px;border-left:3px solid var(--naranja)">${INV2.map(([v,n])=>`<button class="btn-sm" style="flex:0 0 auto;padding:8px 12px;font-weight:600;font-size:12px;background:${v===tab?'#334155;color:#fff':'#f1f5f9;color:#555'}" onclick="App.plTab('${v}')">${n}</button>`).join('')}</div>`:''}
      ${body}`);
  },
  plTab(t){ this._plTab=t; this.vPlantaSmart(); },
  _plMetas(){
    const cl=n=>'$'+Math.round(n||0).toLocaleString('es-CO');
    const metas=(this._metas||[]).slice().sort((a,b)=>(a.mes_num||0)-(b.mes_num||0));
    if(!metas.length) return '<div class="empty">No hay metas cargadas (tabla nc_metas).</div>';
    const ORD={ene:1,feb:2,mar:3,abr:4,may:5,jun:6,jul:7,ago:8,sep:9,oct:10,nov:11,dic:12};
    const ejec={}; (this._resumen||[]).forEach(x=>{ const n=ORD[(x.mes||'').slice(0,3).toLowerCase()]; if(n) ejec[n]=(ejec[n]||0)+(+x.ventas_libro||0); });
    const totM=metas.reduce((a,m)=>a+(+m.meta||0),0), totE=Object.values(ejec).reduce((a,v)=>a+v,0);
    const curN=new Date().getMonth()+1, anio=new Date().getFullYear();
    return `<div class="card"><h2 style="font-size:15px">🎯 Presupuesto de metas ${anio} · OFICIAL</h2>
      <div class="sub" style="margin-bottom:10px">Meta en dinero por mes vs ventas ejecutado (mismo dato de Resultados) · meta año ${cl(totM)} · ejecutado ${cl(totE)}</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr><th style="text-align:left">Mes</th><th style="text-align:right">Meta $</th><th style="text-align:right">Ejecutado</th><th style="text-align:right">%</th></tr></thead><tbody>
        ${metas.map(m=>{ const meta=+m.meta||0, e=ejec[m.mes_num]||0, pct=meta?e/meta*100:0, ok=pct>=100, fut=m.mes_num>curN;
          return `<tr style="${fut?'opacity:.45':''}"><td><b>${esc(m.mes)}</b></td><td style="text-align:right">${cl(meta)}</td><td style="text-align:right">${e?cl(e):'—'}</td><td style="text-align:right;font-weight:800;color:${fut?'#8a93a6':ok?'#16a34a':'#dc2626'}">${e?pct.toFixed(0)+'%':'—'}</td></tr>
            <tr><td colspan="4" style="padding:0 0 7px"><div style="height:7px;background:#eef1f5;border-radius:5px;overflow:hidden"><div style="height:100%;width:${Math.min(100,pct).toFixed(0)}%;background:${ok?'#16a34a':'#dc2626'}"></div></div></td></tr>`; }).join('')}
        <tr style="font-weight:800;border-top:2px solid #ddd"><td>TOTAL año</td><td style="text-align:right">${cl(totM)}</td><td style="text-align:right">${cl(totE)}</td><td style="text-align:right;color:${totE>=totM?'#16a34a':'#dc2626'}">${totM?(totE/totM*100).toFixed(0):0}%</td></tr>
      </tbody></table>
      <div style="margin-top:12px;padding:14px;background:#eff6ff;border:2px solid #1d4ed8;border-radius:10px;text-align:center"><b style="font-size:17px;color:#1d4ed8">📈 CRECIMIENTO DE 30% POR MES</b><div style="font-size:12px;color:#556;margin-top:3px">Metas automáticas desde mayo (ancla $20.000.000) · cada mes crece 30% sobre el anterior</div></div>
      </div>`;
  },
  _plPendientes(){ return this._pendBody(this._pend); },
  _pendBody(pend){
    pend=pend||[];
    const abiertos=pend.filter(p=>p.estado!=='hecho'), hechos=pend.filter(p=>p.estado==='hecho');
    const inp='padding:10px;border:1.5px solid #e3e7ee;border-radius:9px;font-size:14px;width:100%';
    const card=p=>{
      if(p.id===this._pendEdit) return `<div class="item" style="display:block">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px">
          <input id="ed_fecha" type="date" style="${inp}" value="${esc((p.fecha||'').slice(0,10))}">
          <input id="ed_area" style="${inp}" value="${esc(p.area||'')}" placeholder="Área">
          <input id="ed_resp" style="${inp}" value="${esc(p.responsable||'')}" placeholder="Responsable">
          <input id="ed_pend" style="${inp}" value="${esc(p.pendiente||'')}" placeholder="Pendiente">
        </div>
        <textarea id="ed_notas" style="${inp};margin-top:7px;min-height:54px" placeholder="Notas…">${esc(p.notas||'')}</textarea>
        <div style="display:flex;gap:6px;margin-top:8px"><button class="btn-sm" style="background:#16a34a;color:#fff;padding:8px 14px" onclick="App.pendSave(${p.id})">💾 Guardar</button><button class="btn-sm" style="background:#e5e7eb;padding:8px 14px" onclick="App.pendCancel()">Cancelar</button></div></div>`;
      return `<div class="item" style="display:block">
        <div class="top"><div><div class="nom">${esc(p.area||'—')} <span style="color:#8a93a6;font-weight:400">· ${esc(p.responsable||'—')}</span></div><div class="meta">📅 ${esc((p.fecha||'').slice(0,10))}</div></div>
          <div style="display:flex;gap:5px">${p.estado==='hecho'?'<span style="color:#16a34a;font-weight:700;font-size:12px">✓ hecho</span>':`<button class="btn-sm" style="background:#eef1f5;padding:5px 9px" onclick="App.pendEditOpen(${p.id})">✏️</button><button class="btn-sm" style="background:#16a34a;color:#fff;padding:5px 9px" onclick="App.pendDone(${p.id})">✓ Listo</button>`}</div></div>
        <div style="font-size:13.5px;margin-top:3px">${esc(p.pendiente||'')}</div>
        ${p.notas?`<div style="font-size:12px;color:#667;margin-top:4px;background:#f8fafc;border-radius:7px;padding:6px 8px">📝 ${esc(p.notas)}</div>`:''}</div>`;
    };
    return `<div class="card"><h2 style="font-size:15px">📌 Agregar pendiente</h2>
      <div style="font-size:12px;color:#667;margin-bottom:8px">Lo que pides a un cliente o área y queda en espera.</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <input id="pe_fecha" type="date" style="${inp}" value="${new Date().toISOString().slice(0,10)}">
        <input id="pe_area" style="${inp}" placeholder="Área (Diseño, Bodega, Cliente…)">
        <input id="pe_resp" style="${inp}" placeholder="Responsable">
        <input id="pe_pend" style="${inp}" placeholder="¿Qué quedó pendiente?">
      </div>
      <textarea id="pe_notas" style="${inp};margin-top:8px;min-height:46px" placeholder="Notas (opcional)…"></textarea>
      <button class="btn-sm" style="background:var(--naranja);color:#fff;margin-top:10px;padding:11px 18px" onclick="App.pendAdd()">+ Agregar</button></div>
      <div class="card"><h2 style="font-size:15px">📋 Abiertos (${abiertos.length})</h2>${abiertos.length?abiertos.map(card).join(''):'<div class="empty">Nada pendiente 🎉</div>'}</div>
      ${hechos.length?`<div class="card"><h2 style="font-size:15px;color:#8a93a6">✓ Hechos (${hechos.length})</h2><div style="opacity:.7">${hechos.slice(0,30).map(card).join('')}</div></div>`:''}`;
  },
  _rePlanta(){ if(window.NC_EMPRESA==='feroz'){ this.ptab='pend'; this.vPlanta(); } else { this._plTab='pendientes'; this.vPlantaSmart(); } },
  async pendAdd(){
    const g=id=>(document.getElementById(id)||{}).value||'';
    const body={empresa:window.NC_EMPRESA||'smart',fecha:g('pe_fecha')||null,area:g('pe_area'),responsable:g('pe_resp'),pendiente:g('pe_pend'),notas:g('pe_notas'),estado:'pendiente'};
    if(!body.pendiente){ alert('Escribe el pendiente.'); return; }
    try{ await fetch(this._SBU()+'/rest/v1/nc_pendientes',{method:'POST',headers:{apikey:this._SBK(),Authorization:'Bearer '+this._SBK(),'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify(body)}); }catch(e){}
    this._pendEdit=null; this._rePlanta();
  },
  pendEditOpen(id){ this._pendEdit=id; this._rePlanta(); },
  pendCancel(){ this._pendEdit=null; this._rePlanta(); },
  async pendSave(id){
    const g=i=>(document.getElementById(i)||{}).value||'';
    const body={fecha:g('ed_fecha')||null,area:g('ed_area'),responsable:g('ed_resp'),pendiente:g('ed_pend'),notas:g('ed_notas')};
    try{ await fetch(this._SBU()+'/rest/v1/nc_pendientes?id=eq.'+id,{method:'PATCH',headers:{apikey:this._SBK(),Authorization:'Bearer '+this._SBK(),'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify(body)}); }catch(e){}
    this._pendEdit=null; this._rePlanta();
  },
  async pendDone(id){
    try{ await fetch(this._SBU()+'/rest/v1/nc_pendientes?id=eq.'+id,{method:'PATCH',headers:{apikey:this._SBK(),Authorization:'Bearer '+this._SBK(),'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify({estado:'hecho'})}); }catch(e){}
    this._pendEdit=null; this._rePlanta();
  },
  _plNuevaRef(){
    const fs='padding:9px;border:1px solid var(--linea);border-radius:8px;width:100%;box-sizing:border-box';
    return `<div class="card"><h2 style="font-size:15px;margin-bottom:8px">🆕 Crear nueva referencia</h2>
      <div style="display:grid;grid-template-columns:1fr 1.6fr;gap:8px;margin-bottom:8px">
        <input id="nr_sku" placeholder="SKU (ej: F700)" style="${fs}"><input id="nr_ref" placeholder="Referencia (ej: 700 ml)" style="${fs}">
      </div>
      <div style="font-size:13px;margin-bottom:10px">Colores: &nbsp;<label><input type="checkbox" id="nr_t" checked> Transparente</label> &nbsp;&nbsp;<label><input type="checkbox" id="nr_b"> Blanco</label></div>
      <button class="btn btn-main" onclick="App.invCrearRef()">+ Crear referencia</button>
      <div style="font-size:11.5px;color:#8a93a6;margin-top:6px">Se crea en 0 uds; luego la alimentas en "Registrar inventario".</div>
    </div>
    <div class="card"><h2 style="font-size:15px;margin-bottom:8px">Referencias actuales (${this._plRefs.length})</h2>
      ${this._plRefs.map(r=>`<div style="padding:6px 0;border-bottom:1px solid var(--linea);font-size:13px"><b>${esc(r.sku)}</b> · ${esc(r.ref||'')} · <span style="color:#8a93a6">${r.cols.map(esc).join(', ')}</span></div>`).join('')}
    </div>`;
  },
  _plRegistrar(){
    const vig={}; (this._plVigente||[]).forEach(x=>{ vig[x.sku+'|'+x.color]=+x.cantidad||0; });
    let rows='';
    this._invCat().forEach(c=>c.cols.forEach(color=>{ const cur=vig[c.sku+'|'+color]||0;
      rows+=`<tr><td style="padding:5px 8px;border-bottom:1px solid var(--linea);font-size:12.5px"><b>${c.sku}</b> · ${c.ref}</td><td style="padding:5px 8px;border-bottom:1px solid var(--linea);font-size:12.5px">${color}</td><td style="padding:4px 8px;border-bottom:1px solid var(--linea)"><input id="mont-${c.sku}-${color}" type="number" value="${cur}" style="width:110px;padding:5px;border:1px solid var(--linea);border-radius:6px;text-align:right"></td></tr>`;
    }));
    return `<div class="card"><h2 style="font-size:15px;margin-bottom:4px">➕ Registrar inventario · montaje de hoy</h2>
        <div style="font-size:11.5px;color:#8a93a6;margin-bottom:10px">Solo llena la <b>cantidad</b> de cada referencia (del más pequeño al más grande · transparente primero). Pre-cargado con el vigente.</div>
        <div style="overflow:auto"><table style="width:100%;border-collapse:collapse"><thead><tr style="background:#f4f6fb;font-size:10.5px;color:#8a93a6"><th style="text-align:left;padding:6px 8px">SKU · REFERENCIA</th><th style="text-align:left;padding:6px 8px">COLOR</th><th style="text-align:right;padding:6px 8px">CANTIDAD</th></tr></thead><tbody>${rows}</tbody></table></div>
        <button class="btn btn-main" style="margin-top:12px" onclick="App.invGuardarMontaje()">💾 Guardar montaje de hoy</button>
      </div>`;
  },
  _plVer(){
    const vigente=this._plVigente||[];
    const cl=n=>Math.round(n||0).toLocaleString('es-CO');
    const montajes={}; (this._inv||[]).forEach(x=>{ const f=(x.fecha||'').slice(0,10); (montajes[f]=montajes[f]||{refs:0,total:0}); montajes[f].refs++; montajes[f].total+=(+x.cantidad||0); });
    const fechas=Object.entries(montajes).sort((a,b)=>b[0].localeCompare(a[0]));
    return `<div class="card"><h2 style="font-size:15px;margin-bottom:8px">🗓️ Inventarios montados (por fecha)</h2>
        ${fechas.map(([f,m],i)=>`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--linea);font-size:13px"><span>📅 ${esc(f)} ${i===0?'<b style="color:var(--verde)">· VIGENTE</b>':'<small style="color:#8a93a6">· archivado</small>'}</span><span>${m.refs} refs · <b>${cl(m.total)} uds</b></span></div>`).join('')||'<div class="empty">Sin montajes aún.</div>'}
      </div>
      <div class="card"><h2 style="font-size:15px;margin-bottom:8px">📦 Inventario vigente <small style="color:#8a93a6">(lo que ve catálogo y cotizador)</small></h2>
        ${vigente.length? vigente.slice().sort((a,b)=>this._invSort(a,b)).map(x=>{ const on=x.activo, st=(+x.cantidad||0); return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--linea)">
          <div><b>${on?'🟢':'🔴'} ${esc(x.sku)} · ${esc(x.referencia||'')}</b> · ${esc(x.color)}<div style="font-size:11px;color:#8a93a6">📅 ${(x.fecha||'').slice(0,10)}</div></div>
          <div style="display:flex;align-items:center;gap:8px"><b style="color:${st>0&&on?'var(--verde)':'#bbb'}">${st.toLocaleString('es-CO')} uds</b><button class="btn-sm" style="background:${on?'#e7f7ee;color:#16734a':'#fde8e8;color:#b3261e'};font-weight:700" onclick="App.invToggle('${x.sku}','${x.color}')">${on?'ON':'OFF'}</button></div></div>`;}).join('') : '<div class="empty">Sin inventario aún.</div>'}
      </div>`;
  },
  _plInformes(){
    const cl=n=>Math.round(n||0).toLocaleString('es-CO');
    const mesAct=new Date().toISOString().slice(0,7);
    const refSize=s=>{ const m=(s||'').match(/([\d.]+)\s*ml/i); return m?m[1].replace(/\.$/,'')+' ml':((s||'?').trim()||'?'); };
    const refTot={}, refMes={};
    // 1) histórico REAL del año (recuperado de tu Sheet de liquidación → nc_ventas_ref)
    const mesesHist=new Set();
    (this._vref||[]).forEach(v=>{ const k=refSize(v.ref), q=+v.unidades||0, mes=v.mes||''; mesesHist.add(mes);
      refTot[k]=(refTot[k]||0)+q; if(mes===mesAct) refMes[k]=(refMes[k]||0)+q; });
    // 2) pedidos NUEVOS de la plataforma (solo meses que el histórico no cubre → evita doble conteo)
    let conDet=0;
    (this._peds||[]).forEach(p=>{ let pr=p.datos&&p.datos.productos; if(typeof pr==='string'){try{pr=JSON.parse(pr);}catch(e){pr=null;}}
      const mes=(p.creado_en||'').slice(0,7);
      if(Array.isArray(pr)&&pr.length) conDet++;
      if(mesesHist.has(mes)) return;
      if(Array.isArray(pr)&&pr.length){ const esMes=mes===mesAct;
        pr.forEach(x=>{ const k=refSize(x.ref); const q=+x.qty||0; refTot[k]=(refTot[k]||0)+q; if(esMes) refMes[k]=(refMes[k]||0)+q; }); } });
    const topTot=Object.entries(refTot).sort((a,b)=>b[1]-a[1]);
    const topMes=Object.entries(refMes).sort((a,b)=>b[1]-a[1]);
    const lista=(arr)=> arr.length? arr.slice(0,25).map(([k,q],i)=>`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--linea);font-size:13px"><span>${i+1}. ${esc(k)}</span><b>${cl(q)} uds</b></div>`).join('') : '<div class="empty" style="font-size:12px">Sin datos en este corte.</div>';
    const sumMes=Object.values(refMes).reduce((a,b)=>a+b,0), sumTot=Object.values(refTot).reduce((a,b)=>a+b,0);
    const porc=(this._peds||[]).length? Math.round(conDet/this._peds.length*100):0;
    // rotación: consumo entre los 2 últimos montajes de inventario (faltaba definirla → rompía Informes)
    const porFechaR={}; (this._inv||[]).forEach(x=>{ const f=(x.fecha||'').slice(0,10); (porFechaR[f]=porFechaR[f]||[]).push(x); });
    const fechasR=Object.keys(porFechaR).sort((a,b)=>b.localeCompare(a));
    let rot=[];
    if(fechasR.length>=2){
      const nueva={}, vieja={};
      porFechaR[fechasR[0]].forEach(x=>{ nueva[x.sku+'|'+x.color]=+x.cantidad||0; });
      porFechaR[fechasR[1]].forEach(x=>{ vieja[x.sku+'|'+x.color]=+x.cantidad||0; });
      new Set([...Object.keys(nueva),...Object.keys(vieja)]).forEach(k=>{ const p=k.split('|'); rot.push({sku:p[0],color:p[1],consumo:(vieja[k]||0)-(nueva[k]||0)}); });
      rot.sort((a,b)=>b.consumo-a.consumo);
    }
    return `<div class="card"><h2 style="font-size:15px;margin-bottom:2px">📅 Más vendidas — DEL MES (${mesAct})</h2><div style="font-size:11.5px;color:#667;margin-bottom:6px">Total del mes: <b>${cl(sumMes)} uds</b></div>
        ${lista(topMes)}
      </div>
      <div class="card"><h2 style="font-size:15px;margin-bottom:2px">🏆 Más vendidas — DESDE EL INICIO</h2><div style="font-size:11.5px;color:#667;margin-bottom:6px">Total histórico: <b>${cl(sumTot)} uds</b></div>
        ${lista(topTot)}
      </div>
      <div class="card" style="border-left:4px solid var(--verde)"><div style="font-size:12px;color:#667">✅ Año <b>real</b> reconstruido desde tu liquidación (<b>${cl(sumTot)} uds</b>). Los pedidos nuevos de la plataforma se suman automáticamente.</div></div>
      <div class="card"><h2 style="font-size:15px;margin-bottom:8px">🔄 Rotación · inventario vs inventario</h2>
        ${rot.length? `<div style="font-size:11.5px;color:#667;margin-bottom:6px">Consumo entre los 2 últimos montajes — lo que MÁS rota arriba, lo que MENOS rota abajo</div>`+rot.slice(0,25).map((r,i)=>`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--linea);font-size:13px"><span>${i+1}. ${esc(r.sku)} · ${esc(r.color)}</span><b style="color:${r.consumo>=0?'var(--naranja)':'#16a34a'}">${r.consumo>=0?'-'+cl(r.consumo):'+'+cl(-r.consumo)} uds</b></div>`).join('') : '<div class="empty">Necesito <b>2+ montajes</b> de inventario para la rotación. Registra otro inventario en otra fecha y aquí verás qué más/menos rota (inventario vs inventario y las diferencias).</div>'}
      </div>
      <div class="card" style="border-left:4px solid var(--naranja)"><div style="font-size:12px;color:#667">📌 Próximo: rotación por <b>zona/división</b> (qué más rota en tu división vs otras) — lo vamos puliendo con más montajes y pedidos.</div></div>`;
  },
  async invGuardarMontaje(){
    const today=new Date().toISOString().slice(0,10);
    const act={}; (this._plVigente||[]).forEach(x=>{ act[x.sku+'|'+x.color]=x.activo; });
    const rows=[];
    this._invCat().forEach(c=>c.cols.forEach(color=>{ const el=$('mont-'+c.sku+'-'+color); const cant=+((el&&el.value)||0); const k=c.sku+'|'+color; rows.push({empresa:'smart',sku:c.sku,referencia:c.ref,color,cantidad:cant,activo:act[k]!==false,fecha:today}); }));
    const H={apikey:this._SBK(),Authorization:'Bearer '+this._SBK(),'Content-Type':'application/json','Prefer':'return=minimal'};
    try{
      await fetch(this._SBU()+'/rest/v1/nc_inventario?empresa=eq.smart&fecha=eq.'+today,{method:'DELETE',headers:H});  // un montaje por día (reemplaza el de hoy)
      await fetch(this._SBU()+'/rest/v1/nc_inventario',{method:'POST',headers:H,body:JSON.stringify(rows)});
      this._toast('💾 Montaje de hoy guardado ('+rows.length+' referencias)');
      this._plTab='ver'; this.vPlantaSmart();
    }catch(e){ this._toast('Error al guardar el montaje'); }
  },
  async invCrearRef(){
    const sku=(($('nr_sku')||{}).value||'').trim().toUpperCase(), ref=(($('nr_ref')||{}).value||'').trim();
    const cols=[]; if(($('nr_t')||{}).checked)cols.push('transparente'); if(($('nr_b')||{}).checked)cols.push('blanco');
    if(!sku||!cols.length){ alert('Pon el SKU y al menos un color.'); return; }
    for(const color of cols){ await fetch(this._SBU()+'/rest/v1/nc_inventario',{method:'POST',headers:{apikey:this._SBK(),Authorization:'Bearer '+this._SBK(),'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify({empresa:'smart',sku,referencia:ref,color,cantidad:0,activo:true,fecha:new Date().toISOString().slice(0,10)})}); }
    this._toast('✅ Referencia creada: '+sku+' ('+cols.join(', ')+')');
    this.vPlantaSmart();
  },
  async invIngresar(){
    const sku=$('inv_sku').value, color=$('inv_color').value, cant=+($('inv_cant').value||0);
    if(!sku||!color){ alert('Elige SKU y color.'); return; }
    const r=(this._plRefs||[]).find(c=>c.sku===sku)||{};
    await fetch(this._SBU()+'/rest/v1/nc_inventario',{method:'POST',headers:{apikey:this._SBK(),Authorization:'Bearer '+this._SBK(),'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify({empresa:'smart',sku,referencia:r.ref||'',color,cantidad:cant,activo:true,fecha:new Date().toISOString().slice(0,10)})});
    this._toast('✅ Ingresado: '+sku+' '+color+' = '+cant.toLocaleString('es-CO')+' uds');
    this.vPlantaSmart();
  },
  async invToggle(sku,color){
    const latest=(this._inv||[]).find(x=>x.sku===sku && x.color===color); if(!latest) return;
    await fetch(this._SBU()+'/rest/v1/nc_inventario?id=eq.'+latest.id,{method:'PATCH',headers:{apikey:this._SBK(),Authorization:'Bearer '+this._SBK(),'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify({activo:!latest.activo})});
    this.vPlantaSmart();
  },

  /* ---------- COTIZACIONES (landing IGUAL para todas las empresas) ---------- */
  _SBU(){ return 'https://fnayedgvamxktxfvywwl.supabase.co'; }, _SBK(){ return 'sb_publishable_NVTYNkJ0V6obLwgwjXza1g_3Ihp-xMv'; },
  async vCotLanding(){
    this.loading();
    const e=window.NC_EMPRESA||'feroz';
    const H={apikey:this._SBK(),Authorization:'Bearer '+this._SBK()};
    let cots=[];
    try{ const r=await fetch(this._SBU()+'/rest/v1/nc_cotizaciones?empresa=eq.'+e+'&estado=eq.cotizacion&order=creado_en.desc',{headers:H}); const j=await r.json(); cots=Array.isArray(j)?j:[]; }catch(e2){}
    // ocultar de la cola SOLO las que ya tienen su venta por FOLIO exacto (no por nombre, para no esconder pedidos nuevos de clientes que ya compraron)
    let vFol=new Set();
    try{ const r=await fetch(this._SBU()+'/rest/v1/nc_ventas?empresa=eq.'+e+'&select=folio&limit=5000',{headers:H}); const vv=await r.json();
      (Array.isArray(vv)?vv:[]).forEach(v=>{ if(v.folio) vFol.add(v.folio); }); }catch(e2){}
    const total=cots.length;
    const pend=cots.filter(c=> !(c.folio && vFol.has(c.folio)) );
    // TODAS las cotizaciones (para el resumen: acumuladas, del mes, anuladas, kit)
    try{ const r=await fetch(this._SBU()+'/rest/v1/nc_cotizaciones?empresa=eq.'+e+'&select=estado,total,creado_en,datos&limit=8000',{headers:H}); const j=await r.json(); this._cotAll=Array.isArray(j)?j:[]; }catch(e2){ this._cotAll=[]; }
    this._cotsCola=pend; this._cotsOcultas=total-pend.length;
    this.renderCotLanding();
  },
  renderCotLanding(){
    const cots=this._cotsCola||[];
    const totVal=cots.reduce((a,c)=>a+(+c.total||0),0);
    const all=this._cotAll||[]; const cl=n=>'$'+Math.round(n||0).toLocaleString('es-CO');
    const mesAct=new Date().toISOString().slice(0,7); const val=arr=>arr.reduce((a,c)=>a+(+c.total||0),0);
    const esKit=c=>this._esKitCot(c.datos);
    const cotsPed=cots.filter(c=>!esKit(c)), muestras=cots.filter(esKit);   // sub-cajones: pedidos (siempre) · muestras (colapsable)
    const delMes=all.filter(c=>(c.creado_en||'').slice(0,7)===mesAct);
    const anul=all.filter(c=>/anul/i.test(c.estado||''));   // cubre 'anulado' y 'anulada'
    const anulMot={}; anul.forEach(c=>{ const m=((c.datos||{}).motivo_anulacion)||'(sin motivo)'; anulMot[m]=(anulMot[m]||0)+1; });
    const kitAll=all.filter(esKit); const kitMes=kitAll.filter(c=>(c.creado_en||'').slice(0,7)===mesAct);
    this.set(`
      <h1>Cotizaciones</h1><div class="sub">Registra clientes · cotiza · sigue la cola</div>
      <div class="kpis" style="margin-bottom:12px">
        <div class="kpi"><b>${cots.length}</b><span>Cotizaciones en cola</span></div>
        <div class="kpi"><b style="color:var(--naranja)">$${totVal.toLocaleString('es-CO')}</b><span>Valorización en juego</span></div>
      </div>
      <div class="card" style="margin-bottom:12px">
        <div style="font-weight:700;font-size:13px;margin-bottom:8px">📊 Resumen de cotizaciones</div>
        <div class="kpis" style="margin-bottom:0">
          <div class="kpi"><b>${all.length}</b><span>Acumuladas · ${cl(val(all))}</span></div>
          <div class="kpi"><b>${delMes.length}</b><span>Del mes · ${cl(val(delMes))}</span></div>
          <div class="kpi rojo"><b>${anul.length}</b><span>Anuladas · ${cl(val(anul))}</span></div>
          <div class="kpi"><b>${kitAll.length}</b><span>Kit acum · ${kitMes.length} del mes</span></div>
        </div>
        ${anul.length?`<div style="font-size:11.5px;color:#667;margin-top:8px;border-top:1px solid var(--linea);padding-top:6px">🗂️ Motivos de anulación: ${Object.entries(anulMot).sort((a,b)=>b[1]-a[1]).map(([m,n])=>esc(m)+': <b>'+n+'</b>').join(' · ')}</div>`:''}
      </div>
      <div class="row2" style="margin-bottom:10px">
        <button class="btn btn-ghost" onclick="App.cotRegistro()" style="padding:18px;line-height:1.5">📋<br>Registro (resumen)</button>
        <button class="btn btn-main" onclick="App.cotAbrir()" style="padding:18px;line-height:1.5">🧮<br>Hacer cotización</button>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:8px"><input id="cotq" placeholder="🔍 Nombre o celular (clientes · distribuidores · empresas)" style="flex:1;padding:11px;border:1px solid var(--linea);border-radius:10px" onkeydown="if(event.key==='Enter')App.cotBuscarBases()"><button class="btn-sm" style="background:var(--negro);color:#fff;white-space:nowrap" onclick="App.cotBuscarBases()">Buscar</button></div>
      <div id="cotbusres" style="margin-bottom:10px"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px">
        <h2 style="font-size:15px;margin:0">📝 Cotizaciones de pedidos · ${cotsPed.length}${this._cotsOcultas?` <span style="font-size:11px;color:#8a93a6;font-weight:400">· ${this._cotsOcultas} ya en ventas (ocultas)</span>`:''}</h2>
        ${cots.filter(c=>c.contactado).length?`<button class="btn-sm" style="background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;white-space:nowrap" onclick="App.cotResetContactados()" title="Apaga todos los círculos de contactado para empezar la semana">🔄 Reiniciar contactados (${cots.filter(c=>c.contactado).length})</button>`:''}
      </div>
      ${cotsPed.length? cotsPed.map(c=>this._cotItemHTML(c)).join('') : '<div class="empty">No hay cotizaciones de pedidos en cola.</div>'}
      ${muestras.length?`<div style="margin-top:14px">
        <div onclick="App.cotToggleMuestras()" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:12px 14px">
          <span style="font-weight:700;color:#c2410c">🧪 Muestras (kits) · ${muestras.length}</span><span id="cotMuestrasArrow" style="color:#c2410c;font-size:16px">▸</span></div>
        <div id="cotMuestrasBox" style="display:none;margin-top:8px">${muestras.map(c=>this._cotItemHTML(c)).join('')}</div>
      </div>`:''}
    `);
  },
  _cotItemHTML(c){
    const f=(c.creado_en||'').slice(0,10),cel=c.celular||'';
    const ac=c.accion?`<span class="badge" style="background:#eef2ff;color:#3a48b3">${c.accion==='llamar'?'📞 en seguimiento':c.accion==='remarketing'?'📣 remarketing':esc(c.accion)}</span>`:'<span class="badge b-cotizada">en cola</span>';
    return `<div class="item"><div class="top"><div><div class="nom">${esc(c.cliente||c.folio||'—')}</div><div class="meta">${c.folio?esc(c.folio)+' · ':''}$${(+c.total||0).toLocaleString('es-CO')} · 📅 ${f}${cel?' · 📱 '+esc(cel):''}</div></div>${ac}</div>
      <div class="acciones-item" style="align-items:center;gap:8px;flex-wrap:wrap">
        <label style="font-size:12px;color:#b45309;display:flex;align-items:center;gap:4px;cursor:pointer;font-weight:700" title="Si lo prendes, el pedido queda a crédito en Cartera (por cobrar)"><input type="checkbox" id="cotcred-${c.id}" style="accent-color:#d97706;width:15px;height:15px">💳 Crédito</label>
        <button class="btn-sm" style="background:#16a34a;color:#fff;font-weight:700" onclick="App.cotAutorizar('${c.id}')">✅ Autorizar → pedido</button>
        <button class="btn-sm" style="background:#6b7280;color:#fff" onclick="App.cotEditar('${c.id}')">✏️ Modificar</button>
        <button class="btn-sm" style="background:#fde8e8;color:#b3261e" onclick="App.cotAnular('${c.id}')">❌ Anular</button>
        <span style="font-size:12.5px;color:#667;margin-left:auto">¿Contactado?</span>
        <span onclick="App.cotContactoToggle('${c.id}')" id="ctc-${c.id}" title="Marca que ya lo contacté" style="cursor:pointer;display:inline-block;width:18px;height:18px;border-radius:50%;border:2px solid #16a34a;background:${c.contactado?'#16a34a':'#fff'}"></span>
      </div></div>`;
  },
  /* 🧪 Es KIT de muestras SOLO si NO lleva productos. Un pedido grande que ADEMÁS
     lleva un kit adjunto es un PEDIDO, no un kit. (Juan Dennis $8.3M salía en kits.) */
  _esKitCot(d){ d=d||{}; if(d.kit_muestras!=='SI') return false;
    const uds=+(d.total_uds||0);
    let p=d.productos;                                    // puede venir como texto JSON
    if(typeof p==='string'){ try{ p=JSON.parse(p||'[]'); }catch(e){ p=[]; } }
    const prods=Array.isArray(p)?p.length:0;
    return uds<=0 && prods===0; },
  cotToggleMuestras(){ const b=document.getElementById('cotMuestrasBox'),a=document.getElementById('cotMuestrasArrow'); if(!b)return; const abrir=b.style.display==='none'; b.style.display=abrir?'block':'none'; if(a)a.textContent=abrir?'▾':'▸'; },
  _findCot(id){ return (this._cotsCola||[]).find(x=>x.id===id)||{}; },
  async cotBuscarBases(){
    const e=window.NC_EMPRESA||'feroz'; const isSmart=(e==='smart');
    const q=($('cotq')?$('cotq').value:'').trim(); const cont=$('cotbusres'); if(!cont) return;
    if(q.length<3){ cont.innerHTML='<div class="hint">Escribe al menos 3 letras o dígitos.</div>'; return; }
    cont.innerHTML='<div class="hint">Buscando en clientes, distribuidores y empresas…</div>';
    const H={apikey:this._SBK(),Authorization:'Bearer '+this._SBK()}; const enc=encodeURIComponent('*'+q+'*'); const out=[];
    const cliTbl=isSmart?'nc_clientes':'clientes', docCol=isSmart?'documento':'nit', celCol=isSmart?'celular':'tel', empF=isSmart?'empresa=eq.smart&':'';
    try{ const r=await fetch(this._SBU()+'/rest/v1/'+cliTbl+'?'+empF+'or=(nombre.ilike.'+enc+','+celCol+'.ilike.'+enc+')&select=nombre,'+docCol+','+celCol+'&limit=20',{headers:H}); const a=await r.json(); (Array.isArray(a)?a:[]).forEach(x=>out.push({nombre:x.nombre,doc:x[docCol],cel:x[celCol],src:'cliente'})); }catch(e2){}
    try{ const r=await fetch(this._SBU()+'/rest/v1/'+e+'_marcador_leads?or=(nombre.ilike.'+enc+',cel.ilike.'+enc+')&select=nombre,cel,mundo&limit=30',{headers:H}); const a=await r.json(); (Array.isArray(a)?a:[]).forEach(x=>out.push({nombre:x.nombre,cel:x.cel,src:x.mundo==='distribuidor'?'distribuidor':'empresa'})); }catch(e2){}
    this._cotBusRes=out;
    if(!out.length){ cont.innerHTML='<div class="hint" style="color:#8a93a6">No encontré ese nombre/celular en ninguna base.</div>'; return; }
    const col={cliente:'#16a34a',distribuidor:'#b8860b',empresa:'#3a48b3'};
    cont.innerHTML=out.map((x,i)=>`<div class="item"><div class="top"><div><div class="nom">${esc(x.nombre||'—')} <span style="font-size:10px;padding:1px 7px;border-radius:8px;background:${col[x.src]}22;color:${col[x.src]}">${x.src}</span></div><div class="meta">📱 ${esc(x.cel||'')}${x.doc?(' · NIT '+esc(x.doc)):''}</div></div>
      <button class="btn-sm" style="background:var(--naranja);color:#fff" onclick="App.cotDesdeBusqueda(${i})">🧮 Cotizar</button></div></div>`).join('');
  },
  cotDesdeBusqueda(i){ const x=(this._cotBusRes||[])[i]; if(!x) return; this.cotAbrir(x.doc||''); },
  async cotUpd(id,body){ try{ await fetch(this._SBU()+'/rest/v1/nc_cotizaciones?id=eq.'+id,{method:'PATCH',headers:{apikey:this._SBK(),Authorization:'Bearer '+this._SBK(),'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify(body)}); }catch(e){console.log('upd',e);} },
  cotWA(id){ const c=this._findCot(id); const m=`Hola ${c.cliente||''} 👋 Te recuerdo tu cotización ${c.folio||''} de Smart Packaging por $${(+c.total||0).toLocaleString('es-CO')}. ¿Te ayudo a cerrarla?`; window.open('https://wa.me/57'+(c.celular||'')+'?text='+encodeURIComponent(m),'_blank'); },
  async cotRemarket(id){ const c=this._findCot(id); const m=`Hola ${c.cliente||''} 👋 ¿Activamos tu cotización ${c.folio||''} ($${(+c.total||0).toLocaleString('es-CO')})? Te dejo lista la producción de tus envases.`; window.open('https://wa.me/57'+(c.celular||'')+'?text='+encodeURIComponent(m),'_blank'); await this.cotUpd(id,{accion:'remarketing'}); this.vCotLanding(); },
  async cotLlamar(id){ await this.cotUpd(id,{accion:'llamar'}); this.vCotLanding(); },
  cotAnular(id){ this._anulId=id; this._anulMotivo=''; this._anulModal('cotización'); },
  _anulModal(que){
    this.modal(`<h3>❌ Anular ${que}</h3>
      <div class="hint" style="margin-bottom:8px">¿Por qué se anula? Elige un motivo y/o escribe el detalle.</div>
      <div id="anulMotivos" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
        ${['Precio','Falta de dinero','No le interesa','Otro'].map(m=>`<button class="btn-sm" style="background:#eef2ff;color:#3a48b3" onclick="App.anulMotivo(this,'${m}')">${m}</button>`).join('')}
      </div>
      <textarea id="anulNota" placeholder="Detalle (opcional)" style="width:100%;padding:10px;border:1.5px solid var(--linea);border-radius:10px;min-height:62px;box-sizing:border-box"></textarea>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn" style="flex:1;background:var(--rojo);color:#fff" onclick="App.anulConfirmar()">❌ Anular</button>
        <button class="btn" style="flex:1;background:#eef2ff;color:#3a48b3" onclick="App.cerrarModal()">Cancelar</button>
      </div>`);
  },
  anulMotivo(btn,m){ this._anulMotivo=m; const box=document.getElementById('anulMotivos'); if(box) Array.from(box.children).forEach(b=>{b.style.background='#eef2ff';b.style.color='#3a48b3';}); btn.style.background='#3a48b3'; btn.style.color='#fff'; },
  async anulConfirmar(){
    const motivo=this._anulMotivo||''; const nota=((document.getElementById('anulNota')||{}).value||'').trim();
    if(!motivo && !nota){ alert('Elige un motivo o escribe el detalle.'); return; }
    const c=this._findCot(this._anulId)||{}; const d=Object.assign({}, c.datos||{}, {motivo_anulacion:motivo, nota_anulacion:nota});
    await this.cotUpd(this._anulId,{estado:'anulado', datos:d});
    this.cerrarModal(); this._toast('Cotización anulada · motivo guardado'); this.vCotLanding();
  },
  _toast(msg){ const t=document.createElement('div'); t.textContent=msg; t.style.cssText='position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#0c3a26;color:#9ff0c8;padding:12px 18px;border-radius:10px;font-size:13px;z-index:99999;box-shadow:0 4px 20px rgba(0,0,0,.25);max-width:90%'; document.body.appendChild(t); setTimeout(()=>t.remove(),5000); },
  async cotContactoToggle(id){
    const c=this._findCot(id); const nv=!(c&&c.contactado);
    try{ await this.cotUpd(id,{contactado:nv}); if(c) c.contactado=nv; const el=document.getElementById('ctc-'+id); if(el) el.style.background=nv?'#16a34a':'#fff'; }catch(e){}
  },
  async cotResetContactados(){
    const n=(this._cotsCola||[]).filter(c=>c.contactado).length;
    if(!n){ this._toast('No hay contactados que reiniciar.'); return; }
    if(!confirm('¿Apagar los '+n+' círculos de "contactado"?\nÚsalo al cerrar la semana para empezar el seguimiento de cero. (No borra las cotizaciones, solo apaga los círculos.)')) return;
    const e=window.NC_EMPRESA||'feroz'; const H={apikey:this._SBK(),Authorization:'Bearer '+this._SBK(),'Content-Type':'application/json','Prefer':'return=minimal'};
    try{
      await fetch(this._SBU()+'/rest/v1/nc_cotizaciones?empresa=eq.'+e+'&estado=eq.cotizacion&contactado=eq.true',{method:'PATCH',headers:H,body:JSON.stringify({contactado:false})});
      (this._cotsCola||[]).forEach(c=>c.contactado=false);
      this.renderCotLanding();
      this._toast('✅ '+n+' contactados reiniciados. ¡Semana nueva! 🚀');
    }catch(e2){ this._toast('No se pudo reiniciar, intenta de nuevo.'); }
  },
  async cotAutorizar(id){
    const c=this._findCot(id); if(!c||!c.datos){ alert('No encuentro los datos de la cotización.'); return; }
    const _cred=!!(document.getElementById('cotcred-'+id)&&document.getElementById('cotcred-'+id).checked);
    if(_cred){ if(!confirm(`¿Autorizar "${c.cliente||c.folio}" a CRÉDITO?\n\nPasa a PEDIDO y queda en 💳 Cartera (por cobrar). Cuando el cliente pague, marcas "pagado".`)) return; }
    else if(!confirm(`¿Confirmas el PAGO de "${c.cliente||c.folio}"?\n\nPasa a PEDIDO: escribe en el Sheet + Supabase e inicia el flujo de pedido.`)) return;
    const _exp=+(c.total||0);
    let _cons=_exp;
    if(!_cred){ const _r=prompt('¿Cuánto CONSIGNÓ el cliente?\n(déjalo igual si pagó exacto · si consignó de más, el excedente se suma a tu comisión)', String(_exp||'')); if(_r===null) return; _cons=+String(_r).replace(/[^\d]/g,'')||_exp; }
    // 1) Sheet — best-effort, NO bloquea (la fuente de verdad es Supabase). Antes se colgaba aquí y dejaba "pensando".
    try{
      const d=Object.assign({}, c.datos);
      d.estado='Pedido';
      d.folio = d.folio || c.folio || '';
      d.fecha = d.fecha || (c.creado_en||'').slice(0,10) || '';
      d.empresa = d.empresa || c.cliente || '';
      d.contacto = d.contacto || c.contacto || c.cliente || '';
      d.celular = d.celular || c.celular || '';
      d.total = d.total || c.total || 0;
      const qs=new URLSearchParams(d).toString();
      const ctrl=new AbortController(); setTimeout(()=>ctrl.abort(), 6000);   // si Apps Script no responde en 6s, se aborta y seguimos
      fetch('https://script.google.com/macros/s/AKfycbyZHB89LCwnzLd0-ttzff5ZjocjfHq7k6GOBEG7QbbTIzSn7i13iCNvr8bJMM8vJn8V/exec?'+qs,{method:'GET',mode:'no-cors',signal:ctrl.signal}).catch(()=>{});   // fire-and-forget
    }catch(e){ console.log('Sheet pedido',e); }
    // 2) Supabase — marca pedido (y deja datos.estado coherente con la columna)
    await this.cotUpd(id,{estado:'pedido', datos:Object.assign({}, c.datos||{}, {estado:'Pedido', tipo_pago:_cred?'credito':'contado'})});
    // 3) Supabase nc_ventas — ALIMENTA el libro de comisión desde la app (ya no es foto del Sheet).
    //    Check-then-insert por folio para no duplicar lo ya importado.
    try{
      const d=c.datos||{}; const folio=c.folio||'';
      let ya=[]; if(folio){ const rx=await fetch(this._SBU()+'/rest/v1/nc_ventas?empresa=eq.smart&folio=eq.'+encodeURIComponent(folio)+'&select=id&limit=1',{headers:{apikey:this._SBK(),Authorization:'Bearer '+this._SBK()}}); ya=await rx.json(); }
      if(!(Array.isArray(ya)&&ya.length)){
        const M=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
        const _dtv=new Date(); const mes=M[_dtv.getMonth()]+'-'+_dtv.getFullYear();   // mes de la venta = AHORA (cuándo se autoriza), no la creación → cierre a fin de mes cae en el mes correcto
        const esKit=this._esKitCot(d);
        const tv=esKit ? +(c.total||d.total||0) : +(d.subtotal_sin_iva||d.total||c.total||0);   // el kit ES venta: vale su precio, no 0
        const exceso=Math.max(0, (_cons||0) - (+(c.total||0)));   // lo que consignó de más → a comisión
        const cb=(+(d.comision||0))+exceso;
        await fetch(this._SBU()+'/rest/v1/nc_ventas',{method:'POST',headers:{apikey:this._SBK(),Authorization:'Bearer '+this._SBK(),'Content-Type':'application/json','Prefer':'return=minimal'},
          body:JSON.stringify({empresa:'smart',mes,cliente:c.cliente||d.empresa||'',documento:d.cedula_nit||'',pedidos_mes:1,total_vendido:tv,total_convenio:0,comision_bruta:cb,pct_comision:tv?+(cb/tv*100).toFixed(1):0,estado_pago:'Pendiente',lista:d.lista_nombre||'',es_kit:(d.kit_muestras==='SI'),folio:folio,notas:(exceso>0?('Consignó $'+(_cons).toLocaleString('es-CO')+' · excedente $'+exceso.toLocaleString('es-CO')+' a comisión'):'Generado en plataforma')})});
      }
    }catch(e){ console.log('nc_ventas insert',e); }
    // 🔒 VERIFICACIÓN: confirmar que la venta SÍ quedó (si no, avisar — nunca perder comisión en silencio)
    try{
      const folioV=c.folio||'';
      if(folioV){ const rc=await fetch(this._SBU()+'/rest/v1/nc_ventas?empresa=eq.smart&folio=eq.'+encodeURIComponent(folioV)+'&select=id&limit=1',{headers:{apikey:this._SBK(),Authorization:'Bearer '+this._SBK()}}); const chk=await rc.json();
        if(!(Array.isArray(chk)&&chk.length)) alert('⚠️ OJO: el pedido de '+(c.cliente||folioV)+' quedó autorizado pero la VENTA no se registró. Ve a Ventas · Smart → botón rojo "Reparar" para sumarla a tu comisión.'); }
    }catch(e){}
    // (Quitado) Antes se anulaban las otras cotizaciones del mismo NIT al autorizar una.
    // Un cliente PUEDE tener varios pedidos/cotizaciones a la vez — ya NO se tocan entre sí.
    this._toast('✅ '+(c.cliente||c.folio)+' autorizado → PEDIDO (Sheet + Supabase + comisión). Flujo iniciado.');
    this.vCotLanding();
  },
  cotEditar(id){
    const e=window.NC_EMPRESA||'feroz';
    if(e==='smart'){ this.set(`<button class="btn-sm" onclick="App.go('cotizaciones')" style="margin-bottom:10px;background:var(--gris)">← Volver a cotizaciones</button>
      <iframe src="cotizador-smart/index.html?t=${Date.now()}&cot=${encodeURIComponent(id)}" style="width:100%;height:78vh;border:1px solid var(--linea);border-radius:12px;background:#fff"></iframe>`); }
    else { this.vCotizacionNueva(); }
  },
  async vVentasSmart(){
    this.loading();
    let all=[];
    try{ const r=await fetch(this._SBU()+'/rest/v1/nc_ventas?empresa=eq.smart&limit=3000',{headers:{apikey:this._SBK(),Authorization:'Bearer '+this._SBK()}}); const j=await r.json(); all=Array.isArray(j)?j:[]; }catch(e){}
    this._ventas=all;   // guardado para el detalle por mes (auditoría)
    // 🔒 CANDADO anti-comisión-perdida: pedidos autorizados que NO quedaron como venta (folio sin fila en nc_ventas)
    let _peds=[]; try{ const rp=await fetch(this._SBU()+'/rest/v1/nc_cotizaciones?empresa=eq.smart&estado=eq.pedido&select=folio,cliente,total,datos&limit=3000',{headers:{apikey:this._SBK(),Authorization:'Bearer '+this._SBK()}}); const jp=await rp.json(); _peds=Array.isArray(jp)?jp:[]; }catch(e){}
    const _vFol=new Set(all.map(x=>x.folio).filter(Boolean));
    this._ventasFaltantes=_peds.filter(p=>p.folio && !_vFol.has(p.folio));
    let metas=[]; try{ const rm=await fetch(this._SBU()+'/rest/v1/nc_metas?empresa=eq.smart&order=mes_num.asc',{headers:{apikey:this._SBK(),Authorization:'Bearer '+this._SBK()}}); const jm=await rm.json(); metas=Array.isArray(jm)?jm:[]; }catch(e){}
    // 📦 envases vendidos (unidades) — del HISTÓRICO REAL (nc_ventas_ref), el dato alineado en todo lado
    let vref=[]; try{ const rp=await fetch(this._SBU()+'/rest/v1/nc_ventas_ref?empresa=eq.smart&select=mes,unidades&limit=5000',{headers:{apikey:this._SBK(),Authorization:'Bearer '+this._SBK()}}); const jp=await rp.json(); vref=Array.isArray(jp)?jp:[]; }catch(e){}
    const mesISO=new Date().toISOString().slice(0,7);
    const envTot=vref.reduce((a,x)=>a+(+x.unidades||0),0);
    const envMes=vref.filter(x=>(x.mes||'')===mesISO).reduce((a,x)=>a+(+x.unidades||0),0);
    const esCancel=x=>/cancel|anula/i.test(x.estado_pago||'');
    const v=all.filter(x=>!esCancel(x));          // informe = solo ventas reales (no canceladas)
    const canc=all.length-v.length;
    const cl=n=>'$'+Math.round(n||0).toLocaleString('es-CO');
    const totV=v.reduce((a,x)=>a+(+x.total_vendido||0),0);
    const totC=v.reduce((a,x)=>a+(+x.comision_bruta||0),0);
    const comPag=v.filter(x=>/pag/i.test(x.estado_pago||'')).reduce((a,x)=>a+(+x.comision_bruta||0),0);
    const kits=v.filter(x=>x.es_kit); const kitsVend=kits.filter(x=>(+x.total_vendido||0)>0).length; const kitsGratis=kits.length-kitsVend;
    const MESES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    const hoy=new Date(); const mesActual=MESES[hoy.getMonth()]+'-'+hoy.getFullYear();
    const porMes={};
    v.forEach(x=>{ const m=x.mes||'s/f'; (porMes[m]=porMes[m]||{v:0,c:0,n:0}); porMes[m].v+=+x.total_vendido||0; porMes[m].c+=+x.comision_bruta||0; porMes[m].n++; });
    const curN=hoy.getMonth()+1;   // logrado = ventas reales en vivo (nc_ventas); meta = nc_metas
    const metaActual=metas.find(m=>m.mes===mesActual)||{meta:0};
    const metaMes=+metaActual.meta||0, logMes=(porMes[mesActual]&&porMes[mesActual].v)||0, avMes=metaMes?logMes/metaMes*100:0, okMes=avMes>=100;
    this.set(`<h1>Ventas · Smart</h1><div class="sub">Libro de comisión (Sheet) · solo ventas reales · ${canc} canceladas no cuentan</div>
      ${this._ventasFaltantes.length?`<div class="card" style="border:2px solid #dc2626;background:#fef2f2">
        <div style="font-weight:800;color:#b91c1c">⚠️ ${this._ventasFaltantes.length} pedido(s) SIN venta registrada — tu comisión NO los está sumando</div>
        <div style="font-size:12px;color:#7f1d1d;margin:6px 0">${this._ventasFaltantes.map(p=>esc(p.cliente||p.folio)+' · '+esc(p.folio)+' · $'+(+p.total||0).toLocaleString('es-CO')).join('<br>')}</div>
        <button class="btn" style="background:#dc2626;color:#fff" onclick="App.repararVentasFaltantes()">🔧 Reparar y sumar a mi comisión</button>
      </div>`:''}
      <div class="kpis">
        <div class="kpi naranja"><b>${cl(totV)}</b><span>Ventas 2026 (acum. s/IVA)</span></div>
        <div class="kpi verde"><b>${cl(totC)}</b><span>Comisión bruta</span></div>
        <div class="kpi"><b>${v.length}</b><span>Ventas</span></div>
        <div class="kpi"><b style="color:#2563eb">${envTot.toLocaleString('es-CO')}</b><span>📦 Envases vendidos</span></div>
      </div>
      <div class="card" style="border-left:4px solid #2563eb;padding:9px 13px"><div style="font-size:12.5px;color:#445">📦 Envases vendidos este mes (${mesISO}): <b style="color:#2563eb">${envMes.toLocaleString('es-CO')}</b> · histórico <b>${envTot.toLocaleString('es-CO')}</b> envases</div></div>
      <div class="card" style="border-left:4px solid #16a34a;padding:10px 13px"><div style="font-size:12.5px;color:#445">🎟️ Kits: <b>${kitsVend}</b> vendidos · <b>${kitsGratis}</b> entregados gratis <span style="color:#8a93a6">(${kits.length} en total · el kit es la prueba del producto, no se valoriza)</span></div></div>
      <div class="card" style="border-left:4px solid ${okMes?'#2563eb':'#dc2626'}">
        <div style="display:flex;justify-content:space-between;align-items:baseline"><h2 style="font-size:15px">🎯 Meta de ${mesActual}</h2><span style="font-size:12px">logrado <b>${cl(logMes)}</b> de ${cl(metaMes)}</span></div>
        <div style="height:16px;background:var(--gris);border-radius:8px;overflow:hidden;margin-top:8px"><div style="height:100%;width:${Math.min(100,avMes).toFixed(1)}%;background:${okMes?'#2563eb':'#dc2626'};display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:800">${avMes.toFixed(0)}%</div></div>
        <div style="font-size:11.5px;color:#667;margin-top:6px">${okMes?'✅ ¡Meta cumplida!':'Faltan <b>'+cl(Math.max(0,metaMes-logMes))+'</b>'} para la meta de ${cl(metaMes)} de ${mesActual}.</div>
      </div>
      <div class="card"><h2 style="font-size:15px;margin-bottom:2px">🎯 Meta vs logrado por mes</h2>
        <div style="font-size:11.5px;color:#667;margin-bottom:10px">🔵 cumplió la meta · 🔴 no cumplió · (metas en Supabase)</div>
        ${(()=>{ const MO={ene:1,feb:2,mar:3,abr:4,may:5,jun:6,jul:7,ago:8,sep:9,oct:10,nov:11,dic:12}; const key=ms=>{const p=String(ms||'').split('-');return (+(p[1]||0))*100+(MO[(p[0]||'').toLowerCase()]||0);}; const curKey=hoy.getFullYear()*100+(hoy.getMonth()+1); const metaBy={}; metas.forEach(m=>{metaBy[m.mes]=+m.meta||0;}); const S=new Set(); Object.keys(porMes).forEach(m=>{if(m&&m!=='s/f')S.add(m);}); metas.forEach(m=>{if((+m.meta||0)>0)S.add(m.mes);}); S.add(mesActual); const arr=Array.from(S).filter(m=>key(m)>0&&key(m)<=curKey).sort((a,b)=>key(b)-key(a)); return arr.map(ms=>{ const meta=metaBy[ms]||0, info=porMes[ms]||{v:0,c:0}, log=info.v||0, com=info.c||0, pct=meta?log/meta*100:0, ok=meta&&pct>=100; const der=meta?`logrado <b>${cl(log)}</b> / meta ${cl(meta)} · <b style="color:${ok?'#2563eb':'#dc2626'}">${pct.toFixed(0)}%</b>`:`logrado <b>${cl(log)}</b> · <span style="color:#8a93a6">sin meta cargada</span>`; return `<div onclick="App.ventasMes('${ms}')" style="margin-bottom:11px;cursor:pointer;padding:5px;border-radius:7px" onmouseover="this.style.background='#f4f6fb'" onmouseout="this.style.background=''" title="Clic para ver el detalle"><div style="display:flex;justify-content:space-between;font-size:13px"><span><b>${ms}</b>${ms===mesActual?' <span style="color:#2563eb;font-weight:800">• actual</span>':''} <span style="color:#8a93a6">▸ ver</span></span><span>${der}</span></div><div style="height:11px;background:var(--gris);border-radius:6px;margin-top:3px;overflow:hidden"><div style="height:100%;width:${Math.min(100,pct).toFixed(0)}%;background:${ok?'#2563eb':'#dc2626'}"></div></div>${com?`<div style="font-size:10.5px;color:var(--verde);margin-top:2px">Comisión ${cl(com)}</div>`:''}</div>`;}).join('')||'<div class="empty">Sin datos</div>'; })()}
      </div>`);
  },
  async repararVentasFaltantes(){
    const faltan=this._ventasFaltantes||[]; if(!faltan.length) return;
    if(!confirm(`¿Registrar ${faltan.length} venta(s) faltante(s) y sumarlas a tu comisión?`)) return;
    const M=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    let ok=0;
    for(const p of faltan){
      const d=p.datos||{}; const folio=p.folio||''; if(!folio) continue;
      try{ const rx=await fetch(this._SBU()+'/rest/v1/nc_ventas?empresa=eq.smart&folio=eq.'+encodeURIComponent(folio)+'&select=id&limit=1',{headers:{apikey:this._SBK(),Authorization:'Bearer '+this._SBK()}}); const ya=await rx.json(); if(Array.isArray(ya)&&ya.length) continue; }catch(e){}
      const dt=new Date(); const mes=M[dt.getMonth()]+'-'+dt.getFullYear();
      const esKit=this._esKitCot(d);
      const tv=esKit?+(p.total||d.total||0):+(d.subtotal_sin_iva||d.total||p.total||0);
      const cb=+(d.comision||0);
      try{ const r=await fetch(this._SBU()+'/rest/v1/nc_ventas',{method:'POST',headers:{apikey:this._SBK(),Authorization:'Bearer '+this._SBK(),'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify({empresa:'smart',mes,cliente:p.cliente||d.empresa||'',documento:d.cedula_nit||'',pedidos_mes:1,total_vendido:tv,total_convenio:0,comision_bruta:cb,pct_comision:tv?+(cb/tv*100).toFixed(1):0,estado_pago:'Pendiente',lista:d.lista_nombre||'',es_kit:esKit,folio:folio,notas:'Reparada por candado (pedido sin venta)'})}); if(r.ok) ok++; }catch(e){}
    }
    this._toast('✅ '+ok+' venta(s) reparada(s) y sumada(s) a comisión');
    this.vVentasSmart();
  },
  async vPanelFinanzas(){   // SMART · Resultados — lee la tabla pre-agregada
    this.loading();
    let rows=[];
    try{ const r=await fetch(this._SBU()+'/rest/v1/nc_resumen_mensual?empresa=eq.smart',{headers:{apikey:this._SBK(),Authorization:'Bearer '+this._SBK()}}); const j=await r.json(); rows=Array.isArray(j)?j:[]; }catch(e){}
    // Mes actual EN VIVO: si no está en la tabla pre-agregada, lo calcula desde nc_ventas → así julio y cada mes nuevo aparecen solos
    const _MA=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'], _hoy=new Date(), _mesAct=_MA[_hoy.getMonth()]+'-'+_hoy.getFullYear();
    if(!rows.some(r=>(r.mes||'')===_mesAct)){
      try{
        const rv=await fetch(this._SBU()+'/rest/v1/nc_ventas?empresa=eq.smart&mes=eq.'+encodeURIComponent(_mesAct)+'&select=total_vendido,comision_bruta',{headers:{apikey:this._SBK(),Authorization:'Bearer '+this._SBK()}});
        const vs=await rv.json();
        if(Array.isArray(vs)&&vs.length){
          const total=vs.reduce((a,x)=>a+(+x.total_vendido||0),0), comision=vs.reduce((a,x)=>a+(+x.comision_bruta||0),0), herr=2000000;   // herramientas $2M/mes desde julio-2026
          const u_bruta=total*0.20, bodega=total*0.03, logistica=total*0.02, operaciones=total*0.01;
          rows.push({mes:_mesAct,ventas:vs.length,total,ventas_libro:total,comision,u_bruta,herramientas:herr,bodega,logistica,operaciones,utilidad_neta:u_bruta-comision-herr-bodega-logistica-operaciones,unidades:0,clientes_registrados:0,clientes_nuevos:0,clientes_recurrentes:0,origen:'en-vivo'});
        }
      }catch(e){}
    }
    const ORD={ene:1,feb:2,mar:3,abr:4,may:5,jun:6,jul:7,ago:8,sep:9,oct:10,nov:11,dic:12};
    rows.sort((a,b)=>(ORD[(a.mes||'').slice(0,3)]||99)-(ORD[(b.mes||'').slice(0,3)]||99));
    this._renderPanelFin(rows, {titulo:'Smart', unidLabel:'Unidades', pBod:'3%', pLog:'2%', pOpe:'1%',
      sub:'EN VIVO desde nc_resumen_mensual · bodega 3% · logística 2% · operaciones 1% · U.bruta 20%',
      vacio:'La tabla nc_resumen_mensual está vacía.'});
  },
  async vPanelFinanzasFeroz(){   // FEROZ · Resultados — calculado en vivo desde pedidos reales
    this.loading();
    let peds=[], clis=[];
    try{ const r=await this.sb.from('pedidos').select('total,pares,comision_nc,comision_gpjr,es_muestra,cliente_id,creado_en,estado'); peds=r.data||[]; }catch(e){}
    try{ const r=await this.sb.from('clientes').select('id,creado_en'); clis=r.data||[]; }catch(e){}
    const pedsRaw=Array.isArray(peds)?peds:[];
    const PAGADO=['consignado','autorizado','despachado','entregado'];   // cuenta como venta SOLO si ya pagó
    const muestras=pedsRaw.filter(p=>p.es_muestra); const muVend=muestras.filter(p=>(+p.total||0)>0).length, muGratis=muestras.length-muVend;
    peds=pedsRaw.filter(p=>!p.es_muestra && (+p.total||0)>0 && PAGADO.includes(p.estado));
    clis=Array.isArray(clis)?clis:[];
    const MES=['','ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    const HERR=4000000, BOD=.01, LOG=.01, OPE=.01, BRUTA=.20;
    const HERR_DESDE=7;   // el gasto de herramientas ($4M/mes) empezó en JULIO (antes no hubo)
    const M={}, firstMes={};
    peds.forEach(p=>{ const m=new Date(p.creado_en).getMonth()+1; (M[m]=M[m]||{ventas:0,pares:0,cNC:0,cG:0,cli:new Set()});
      M[m].ventas+=+p.total||0; M[m].pares+=+p.pares||0; M[m].cNC+=+p.comision_nc||0; M[m].cG+=+p.comision_gpjr||0; M[m].cli.add(p.cliente_id);
      if(!firstMes[p.cliente_id]||m<firstMes[p.cliente_id]) firstMes[p.cliente_id]=m; });
    const curM=new Date().getMonth()+1; if(!M[curM]) M[curM]={ventas:0,pares:0,cNC:0,cG:0,cli:new Set()};   // el mes actual siempre se exhibe (aunque no haya ventas)
    const nuevosMes={}; clis.forEach(c=>{ const m=c.creado_en?new Date(c.creado_en).getMonth()+1:0; if(m) nuevosMes[m]=(nuevosMes[m]||0)+1; });
    let acum=0; const acumMes={}; for(let m=1;m<=12;m++){ acum+=nuevosMes[m]||0; acumMes[m]=acum; }
    let hasGPJR=false;
    const rows=Object.keys(M).map(Number).sort((a,b)=>a-b).map(m=>{ const d=M[m], v=d.ventas, rec=[...d.cli].filter(id=>firstMes[id]<m).length;
      const com=d.cNC+d.cG, herr=(m>=HERR_DESDE?HERR:0); if(d.cG>0) hasGPJR=true;
      return { mes:MES[m], ventas_libro:v, u_bruta:v*BRUTA, comision:com, comision_nc:d.cNC, comision_gpjr:d.cG, herramientas:herr, bodega:v*BOD, logistica:v*LOG, operaciones:v*OPE,
        utilidad_neta:v*BRUTA-com-herr-v*BOD-v*LOG-v*OPE, unidades:d.pares,
        clientes_registrados:acumMes[m], clientes_nuevos:nuevosMes[m]||0, clientes_recurrentes:rec }; });
    this._renderPanelFin(rows, {titulo:'Feroz', unidLabel:'Pares', pBod:'1%', pLog:'1%', pOpe:'1%', splitComision:true, hasGPJR,
      nVentas:peds.length, muestras:{vend:muVend, gratis:muGratis},
      sub:'EN VIVO desde pedidos reales · herramientas $4.000.000/mes (desde julio) · bodega 1% · logística 1% · operaciones 1% · U.bruta 20%',
      vacio:'Aún no hay pedidos con valor en Feroz. A medida que se vendan, aparecen aquí.'});
  },
  _renderPanelFin(rows, cfg){   // renderizador COMPARTIDO (Smart y Feroz)
    const cl=n=>'$'+Math.round(n||0).toLocaleString('es-CO'), nm=n=>Math.round(n||0).toLocaleString('es-CO');
    if(!rows.length) return this.set(`<h1>📊 Resultados · ${cfg.titulo}</h1><div class="empty">${cfg.vacio||'Sin datos todavía.'}</div>`);
    const C={}; ['ventas_libro','u_bruta','comision','comision_nc','comision_gpjr','herramientas','bodega','logistica','operaciones','utilidad_neta','unidades','clientes_nuevos','clientes_recurrentes'].forEach(k=>C[k]=rows.reduce((a,x)=>a+(+x[k]||0),0));
    const costos=C.comision+C.herramientas+C.bodega+C.logistica+C.operaciones;
    const th=rows.map(x=>`<th style="text-align:right">${(x.mes||'').slice(0,3)}</th>`).join('');
    const fila=(l,k,p)=>`<tr><td>${l}${p?` <span style="color:#8a93a6;font-size:11px">${p}</span>`:''}</td>${rows.map(x=>{const v=+x[k]||0;return `<td style="text-align:right${v<0?';color:#dc2626':''}">${cl(v)}</td>`}).join('')}<td style="text-align:right;font-weight:800">${cl(C[k])}</td></tr>`;
    const filaN=(l,k)=>`<tr><td>${l}</td>${rows.map(x=>`<td style="text-align:right">${nm(+x[k]||0)}</td>`).join('')}<td style="text-align:right;font-weight:800">${nm(C[k])}</td></tr>`;
    this.set(`<h1>📊 Resultados · ${cfg.titulo}</h1><div class="sub">${cfg.sub}</div>
      <div class="kpis">
        <div class="kpi naranja"><b>${cl(C.ventas_libro)}</b><span>Ventas (libro)</span></div>
        <div class="kpi"><b>${cl(C.u_bruta)}</b><span>U.Bruta 20%</span></div>
        <div class="kpi"><b>${cl(costos)}</b><span>Costos</span></div>
        <div class="kpi verde"><b>${cl(C.utilidad_neta)}</b><span>💰 Utilidad neta</span></div>
        <div class="kpi"><b style="color:#2563eb">${nm(C.unidades)}</b><span>📦 ${cfg.unidLabel} vendidos</span></div>
        ${cfg.nVentas!=null?`<div class="kpi"><b>${cfg.nVentas}</b><span>🧾 Ventas realizadas</span></div>`:''}
      </div>
      ${cfg.muestras?`<div class="card" style="border-left:4px solid #16a34a;padding:9px 13px"><div style="font-size:12.5px;color:#445">🎟️ Muestras: <b>${cfg.muestras.vend}</b> vendidas · <b>${cfg.muestras.gratis}</b> entregadas gratis <span style="color:#8a93a6">(no se valorizan)</span></div></div>`:''}
      <div class="card" style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <thead><tr><th style="text-align:left">Concepto</th>${th}<th style="text-align:right">TOTAL</th></tr></thead><tbody>
        ${fila('<b>Ventas</b>','ventas_libro')}
        ${fila('U. Bruta','u_bruta','20%')}
        ${cfg.splitComision ? `${fila('Comisiones NC','comision_nc','var')}${fila('Comisiones GPJR','comision_gpjr','⭐')}` : fila('Comisiones','comision','var')}
        ${fila('Herramientas','herramientas','fijo')}
        ${fila('Bodega','bodega',cfg.pBod||'')}
        ${fila('Logística','logistica',cfg.pLog||'')}
        ${fila('Operaciones','operaciones',cfg.pOpe||'')}
        <tr style="background:#eafaf0;font-weight:800;color:#16a34a"><td>UTILIDAD NETA</td>${rows.map(x=>`<td style="text-align:right${(+x.utilidad_neta||0)<0?';color:#dc2626':''}">${cl(+x.utilidad_neta||0)}</td>`).join('')}<td style="text-align:right">${cl(C.utilidad_neta)}</td></tr>
        <tr><td colspan="${rows.length+2}" style="background:#fafafa;padding:3px"></td></tr>
        ${filaN('📦 '+cfg.unidLabel,'unidades')}
        <tr><td>👥 Registrados (acum.)</td>${rows.map(x=>`<td style="text-align:right">${nm(+x.clientes_registrados||0)}</td>`).join('')}<td style="text-align:right;font-weight:800">${nm(Math.max(0,...rows.map(x=>+x.clientes_registrados||0)))}</td></tr>
        ${filaN('🆕 Nuevos','clientes_nuevos')}
        ${filaN('🔁 Recurrentes','clientes_recurrentes')}
      </tbody></table></div>`);
  },
  ventasMes(mes){
    const cl=n=>'$'+Math.round(n||0).toLocaleString('es-CO');
    const esCancel=x=>/cancel|anula/i.test(x.estado_pago||'');
    const all=(this._ventas||[]).filter(x=>x.mes===mes);          // TODO el mes (incluye canceladas para que se vean, como en el Sheet)
    const v=all.filter(x=>!esCancel(x));                          // solo estas suman
    const nCanc=all.length-v.length;
    const totV=v.reduce((a,x)=>a+(+x.total_vendido||0),0), totC=v.reduce((a,x)=>a+(+x.comision_bruta||0),0);
    const nKits=v.filter(x=>x.es_kit).length, nFact=v.length;   // TODAS las facturas del mes + cuántas fueron kit
    const byCli={};
    all.forEach(x=>{ const k=x.cliente||'s/cliente'; (byCli[k]=byCli[k]||[]).push(x); });   // agrupa TODOS (así aparece Mateo aunque esté cancelado)
    const clientes=Object.entries(byCli).sort((a,b)=>b[1].reduce((s,x)=>s+(esCancel(x)?0:(+x.total_vendido||0)),0)-a[1].reduce((s,x)=>s+(esCancel(x)?0:(+x.total_vendido||0)),0));
    this.set(`<button class="btn-sm" onclick="App.vVentasSmart()" style="margin-bottom:10px;background:var(--gris)">← Volver a Ventas</button>
      <h1>Ventas · ${esc(mes)}</h1><div class="sub">Detalle por cliente (auditoría) · ${v.length} ventas${nCanc?` · ${nCanc} canceladas (no suman)`:''}</div>
      <div class="kpis"><div class="kpi naranja"><b>${cl(totV)}</b><span>Ventas del mes (s/IVA)</span></div><div class="kpi verde"><b>${cl(totC)}</b><span>Comisión del mes</span></div><div class="kpi"><b style="color:#2563eb">${nFact}</b><span>🧾 Pedidos (facturas)</span></div><div class="kpi"><b style="color:#b45309">${nKits}</b><span>🧪 Kits totales</span></div></div>
      ${clientes.map(([cliente,arr])=>{ const sv=arr.reduce((s,x)=>s+(esCancel(x)?0:(+x.total_vendido||0)),0), sc=arr.reduce((s,x)=>s+(esCancel(x)?0:(+x.comision_bruta||0)),0);
        return `<div class="card" style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;align-items:baseline"><h2 style="font-size:15px">${esc(cliente)}</h2><span style="font-size:12px"><b>${cl(sv)}</b> · <span style="color:var(--verde)">com ${cl(sc)}</span></span></div>
          ${arr.map(x=>{ const c=esCancel(x); return `<div style="border-top:1px solid var(--linea);padding:7px 0;font-size:12.5px;${c?'opacity:.5':''}">
            <div style="display:flex;justify-content:space-between"><span><b>${esc(x.folio||'s/folio')}</b> ${x.es_kit?'· 🧪 Kit':''} ${x.lista?'· '+esc(x.lista):''}</span><span class="badge" style="background:${c?'#fde8e8;color:#b3261e':'#e7f7ee;color:#16734a'}">${c?'❌ '+esc(x.estado_pago||'cancelada'):'✅ Aprobado'}</span></div>
            <div style="color:#556">Venta: <b>${cl(x.total_vendido)}</b> (s/IVA) · Comisión: <b style="color:var(--verde)">${cl(x.comision_bruta)}</b> (${x.pct_comision||0}%) · ${c?'<i>no cuenta</i>':(/pag/i.test(x.estado_pago||'')?'comisión pagada':'comisión por cobrar')}${x.fecha_pago?' · pago '+esc(x.fecha_pago):''}</div>
            ${x.notas?`<div style="color:#8a93a6;font-size:11px;margin-top:2px">${esc(String(x.notas).slice(0,160))}</div>`:''}
          </div>`;}).join('')}
        </div>`;}).join('')||'<div class="empty">Sin ventas este mes.</div>'}`);
  },
  async vDatos(tabla){
    this.loading();
    const e=window.NC_EMPRESA||'feroz';
    const isSmart=(e==='smart');
    // CADA empresa ve SOLO sus tablas (Feroz: tablas propias · Smart: nc_*). Nunca se cruzan.
    const TABLAS = isSmart
      ? [['nc_ventas','💰 Ventas / Comisión'],['nc_clientes','👥 Clientes'],['nc_cotizaciones','📋 Cotizaciones / Pedidos'],['nc_inventario','📦 Inventario'],['nc_metas','🎯 Metas']]
      : [['clientes','👥 Clientes'],['cotizaciones','📋 Cotizaciones'],['pedidos','📦 Pedidos'],['crm','🎯 CRM'],['feroz_comisiones','💰 Comisiones'],['inventario','🏭 Inventario'],['feroz_marcador_resultados','📞 Marcador'],['marcador_acceso','🔐 Usuarios marcador'],['nc_gastos','💸 Gastos NC']];
    const def = isSmart?'nc_ventas':'clientes';
    tabla=tabla||this._tablaSel||def;
    if(!TABLAS.some(t=>t[0]===tabla)) tabla=def;   // al cambiar de empresa no quedar parado en una tabla ajena
    this._tablaSel=tabla;
    const ORD={nc_cotizaciones:'&order=creado_en.desc',nc_clientes:'&order=nombre.asc',nc_inventario:'&order=fecha.desc',cotizaciones:'&order=creado_en.desc',pedidos:'&order=creado_en.desc',clientes:'&order=nombre.asc',crm:'&order=creado_en.desc'}[tabla]||'';
    let rows=[];
    const url=this._SBU()+'/rest/v1/'+tabla+'?limit=1500'+ORD+(isSmart?'&empresa=eq.'+e:'');   // Smart filtra por empresa; tablas Feroz no tienen columna empresa
    try{ const r=await fetch(url,{headers:{apikey:this._SBK(),Authorization:'Bearer '+this._SBK()}}); const j=await r.json(); rows=Array.isArray(j)?j:[]; }catch(err){}
    if(tabla==='nc_ventas'){ const MO={ene:1,feb:2,mar:3,abr:4,may:5,jun:6,jul:7,ago:8,sep:9,oct:10,nov:11,dic:12}; const key=m=>{const p=String(m||'').split('-');return (p[1]||'0000')+String(MO[(p[0]||'').toLowerCase()]||0).padStart(2,'0');}; rows.sort((a,b)=>key(b.mes).localeCompare(key(a.mes))); }
    const cols = rows.length? Object.keys(rows[0]).filter(k=>k!=='id') : [];
    this._datosRows=rows; this._datosCols=cols; this._datosTabla=tabla;
    const fmtv=v=>{ if(v==null) return ''; if(typeof v==='object') return JSON.stringify(v).slice(0,70)+'…'; const s=String(v); return s.length>44?s.slice(0,44)+'…':s; };
    const full=v=>v==null?'':(typeof v==='object'?JSON.stringify(v):String(v));
    this.set(`<h1>🗄️ Base de datos (superdata)</h1><div class="sub">Vive en Supabase · <b>editable</b>: toca ✏️, cambia y 💾 guarda · ${rows.length} filas</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">${TABLAS.map(([t,n])=>`<button class="btn-sm" style="background:${t===tabla?'var(--naranja);color:#fff':'#e5e7eb'}" onclick="App.vDatos('${t}')">${n}</button>`).join('')}</div>
      <input id="dq" placeholder="🔍 Buscar en la tabla…" style="margin-bottom:8px;padding:9px;border:1px solid var(--linea);border-radius:8px;width:100%;box-sizing:border-box" oninput="App._filtrarDatos()">
      <div style="overflow:auto;border:1px solid var(--linea);border-radius:10px;max-height:70vh">
        <table id="dtab" style="border-collapse:collapse;font-size:11.5px;width:100%">
          <thead><tr style="background:#f4f6fb;position:sticky;top:0"><th style="padding:7px 9px;border-bottom:2px solid var(--linea)">✏️</th>${cols.map(c=>`<th style="padding:7px 9px;text-align:left;border-bottom:2px solid var(--linea);white-space:nowrap">${esc(c)}</th>`).join('')}</tr></thead>
          <tbody>${rows.map(row=>`<tr class="drow" id="drow-${row.id}"><td style="padding:3px 6px;border-bottom:1px solid #eee"><button class="btn-sm" style="background:#eef2ff;color:#3a48b3;padding:2px 7px" onclick="App.editFila('${row.id}')">✏️</button></td>${cols.map(c=>`<td style="padding:5px 9px;border-bottom:1px solid #eee;white-space:nowrap" title="${esc(full(row[c]))}">${esc(fmtv(row[c]))}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>
      <div style="font-size:11px;color:#8a93a6;margin-top:6px">💡 Tocas <b>✏️</b> en una fila → cambias el valor → <b>💾</b> guarda en Supabase. Tienes <b>dos lugares para verificar</b>: aquí (crudo) y en las pestañas (Ventas, Clientes…).</div>`);
  },
  _filtrarDatos(){ const i=$('dq'); const q=(i&&i.value||'').toLowerCase(); document.querySelectorAll('#dtab .drow').forEach(tr=>{ tr.style.display = tr.textContent.toLowerCase().includes(q)?'':'none'; }); },
  editFila(id){
    const row=(this._datosRows||[]).find(r=>r.id===id); const tr=document.getElementById('drow-'+id); if(!row||!tr) return;
    const cols=this._datosCols||[];
    tr.innerHTML=`<td style="padding:3px"><button class="btn-sm" style="background:#16a34a;color:#fff;padding:2px 7px" onclick="App.guardarFila('${id}')">💾</button></td>`+cols.map(c=>{ const v=row[c]; const val=(v==null?'':(typeof v==='object'?JSON.stringify(v):String(v))); return `<td style="padding:3px"><input id="edt-${id}-${c}" value="${esc(val).replace(/"/g,'&quot;')}" style="min-width:90px;font-size:11px;padding:3px;border:1px solid var(--naranja);border-radius:4px"></td>`; }).join('');
  },
  async guardarFila(id){
    const row=(this._datosRows||[]).find(r=>r.id===id); if(!row) return;
    const cols=this._datosCols||[], body={};
    cols.forEach(c=>{ const el=$('edt-'+id+'-'+c); if(!el) return; let val=el.value;
      if(typeof row[c]==='object' && row[c]!==null){ try{ val=JSON.parse(val); }catch(e){} }
      else if(typeof row[c]==='number'){ val = val===''?null:(isNaN(+val)?val:+val); }
      else if(typeof row[c]==='boolean'){ val = /^(true|1|si|sí)$/i.test(val); }
      body[c]=val; });
    try{ await fetch(this._SBU()+'/rest/v1/'+this._datosTabla+'?id=eq.'+id,{method:'PATCH',headers:{apikey:this._SBK(),Authorization:'Bearer '+this._SBK(),'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify(body)}); this._toast('💾 Guardado en Supabase'); this.vDatos(this._datosTabla); }
    catch(e){ this._toast('Error al guardar: '+e.message); }
  },
  _findPed(id){ return (this._peds||[]).find(x=>x.id===id)||{}; },
  _prodResumen(d){ let p=d&&d.productos; if(typeof p==='string'){ try{p=JSON.parse(p);}catch(e){ return d&&typeof d.productos==='string'?d.productos:''; } } if(Array.isArray(p)) return p.map(x=>`${x.ref||''} ${x.color||''} ×${x.qty||0}`).join(' · '); return (d&&d.productos)||''; },
  _dirDespacho(d){ d=d||{}; return [d.envio_dir||d.dir_factura, d.envio_barrio||d.barrio_factura, d.envio_ciudad||d.ciudad_factura].map(x=>(x||'').toString().trim()).filter(Boolean).join(', '); },
  pedPicking(id){
    const p=(this._peds||[]).find(x=>x.id===id)||{}; const d=p.datos||{};
    let pr=d.productos; if(typeof pr==='string'){ try{pr=JSON.parse(pr);}catch(e){pr=[];} } if(!Array.isArray(pr)) pr=[];
    const dir=this._dirDespacho(d); const dest=d.envio_nombre||p.cliente; const tel=d.envio_tel||d.celular||p.celular;
    const totUds=pr.reduce((s,x)=>s+(+x.qty||0),0);
    const filas=pr.length?pr.map(x=>`<tr><td style="padding:8px;border-bottom:1px solid var(--linea)"><b>${esc(x.ref||x.n||'—')}</b></td><td style="padding:8px;border-bottom:1px solid var(--linea)">${esc(x.color||'')}</td><td style="padding:8px;border-bottom:1px solid var(--linea);text-align:right;font-weight:800;font-size:16px">${(+x.qty||0)}</td></tr>`).join(''):'<tr><td colspan="3" style="padding:10px;color:#999">Sin detalle de productos en este pedido.</td></tr>';
    this.modal(`<h3>📋 Picking · ${esc(p.cliente||p.folio||'')}</h3>
      <div style="font-size:12px;color:#667;margin-bottom:8px">${p.folio?esc(p.folio)+' · ':''}<b>${totUds}</b> unidades a empacar</div>
      <div class="card" style="border-left:4px solid #2563eb;padding:10px 12px;margin-bottom:12px">
        <div style="font-size:13px"><b>📍 Despachar a:</b> ${esc(dest||'—')}</div>
        <div style="font-size:13px;margin-top:2px">${esc(dir||'(sin dirección registrada)')}</div>
        ${tel?`<div style="font-size:13px;margin-top:2px">📱 ${esc(tel)}</div>`:''}
        ${d.tipo_transporte?`<div style="font-size:12px;color:#667;margin-top:3px">🚚 Transporte: ${esc(d.tipo_transporte)}</div>`:''}
      </div>
      <div style="font-weight:800;margin-bottom:4px">📦 A empacar (picking / packing)</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="text-align:left;color:#667;font-size:11px;text-transform:uppercase"><th style="padding:4px 8px">Referencia</th><th style="padding:4px 8px">Color</th><th style="padding:4px 8px;text-align:right">Cant.</th></tr></thead><tbody>${filas}</tbody></table>
      ${(d.alimento||d.notas)?`<div style="font-size:12px;color:#667;margin-top:10px;background:#f6f8fa;padding:7px 9px;border-radius:8px">${d.alimento?'🍯 '+esc(d.alimento):''}${d.notas?' · 📝 '+esc(d.notas):''}</div>`:''}
      <button class="btn" style="width:100%;margin-top:12px;background:#eef0f2;color:#555" onclick="App.cerrarModal()">Cerrar</button>`);
  },
  async _loadPeds(){ try{ const r=await fetch(this._SBU()+'/rest/v1/nc_cotizaciones?empresa=eq.smart&estado=eq.pedido&order=creado_en.desc&limit=500',{headers:{apikey:this._SBK(),Authorization:'Bearer '+this._SBK()}}); const j=await r.json(); this._peds=Array.isArray(j)?j:[]; }catch(e){ this._peds=[]; } return this._peds; },
  async vPedidosSmart(){
    this.loading();
    const peds=await this._loadPeds();
    const pend=peds.filter(p=>(p.estado_envio||'por_despachar')==='por_despachar');
    const hoy=new Date().toISOString().slice(0,10); const cl=n=>'$'+Math.round(n||0).toLocaleString('es-CO');
    const nHoy=pend.filter(p=>(p.creado_en||'').slice(0,10)===hoy).length;
    const valorPend=pend.reduce((s,p)=>s+(+p.total||0),0);
    const TR=['Interrapidísimo','Servientrega','Envía','Coordinadora','TCC','Otra'];
    this.set(`<h1>Pedidos · Validación</h1><div class="sub">Autorizados esperando despacho · pon transportadora + guía (o foto)</div>
      <div class="kpis"><div class="kpi naranja"><b>${pend.length}</b><span>Por despachar</span></div><div class="kpi"><b>${nHoy}</b><span>Autorizados hoy</span></div><div class="kpi"><b style="color:#16a34a">${cl(valorPend)}</b><span>💰 Valorización</span></div></div>
      ${pend.length?pend.map(p=>{const d=p.datos||{};const f=(p.creado_en||'').slice(0,10);return `<div class="item">
        <div class="top"><div><div class="nom">${esc(p.cliente||p.folio||'—')}</div><div class="meta">${p.folio?esc(p.folio)+' · ':''}${cl(p.total)} · 📅 ${f}${f===hoy?' · 🆕 hoy':''}${(d.celular||p.celular)?' · 📱 '+esc(d.celular||p.celular):''}</div></div><span class="badge b-cotizada">por despachar</span></div>
        <div style="font-size:11.5px;color:#667;margin:4px 0">${esc(this._prodResumen(d)).slice(0,90)}</div>
        ${(()=>{const dir=this._dirDespacho(d);return dir?`<div style="font-size:12px;color:#2563eb;margin:2px 0;font-weight:600">📍 ${esc(dir)}</div>`:'';})()}
        <button class="btn-sm" type="button" style="background:#0b1f2a;color:#fff;width:100%;margin:4px 0" onclick="App.pedPicking('${p.id}')">📋 Abrir pedido — picking / packing</button>
        <div style="margin:8px 0">
          <select id="transp-${p.id}" class="field" style="padding:9px;border:1px solid var(--linea);border-radius:8px;width:100%;margin-bottom:6px">${TR.map(t=>`<option ${p.transportadora===t?'selected':''}>${t}</option>`).join('')}</select>
          <div id="guias-${p.id}">${(()=>{const gg=(p.guia||'').split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean);return (gg.length?gg:['']).map(g=>`<input class="gguia field" style="padding:9px;border:1px solid var(--linea);border-radius:8px;width:100%;margin-bottom:4px" placeholder="N° de guía" value="${esc(g)}">`).join('');})()}</div>
          <button class="btn-sm" type="button" style="background:#eef2ff;color:#3a48b3;margin-top:2px" onclick="App.addGuia('${p.id}')">➕ Agregar otra guía</button>
        </div>
        <div class="acciones-item">
          <label class="btn-sm" style="background:#eef2ff;color:#3a48b3;cursor:pointer">📎 Adjuntar guía<input type="file" accept="image/*" style="display:none" onchange="App.pedSubirFoto('${p.id}',this)"></label>
          ${p.guia_url?`<a class="btn-sm" href="${p.guia_url}" target="_blank" style="background:#e5e7eb">🖼️ Ver foto</a>`:''}
          <button class="btn-sm" style="background:#16a34a;color:#fff;font-weight:700" onclick="App.pedDespachar('${p.id}')">📦 Despachar →</button>
          <button class="btn-sm" style="background:#3a48b3;color:#fff;font-weight:700" onclick="App.pedDespacharPropio('${p.id}')">🚚 Transporte propio</button>
          <button class="btn-sm" style="background:#fff7ed;color:#c2410c;border:1px solid #fed7aa" onclick="App.pedACotizacionSmart('${p.id}')">↩️ A cotización</button>
        </div></div>`;}).join(''):'<div class="empty">No hay pedidos por despachar.</div>'}`);
  },
  async vDespachosSmart(){
    this.loading();
    const peds=await this._loadPeds();
    const desp=peds.filter(p=>['despachado','entregado'].includes(p.estado_envio||''));
    const cl=n=>'$'+Math.round(n||0).toLocaleString('es-CO');
    const ruta=desp.filter(p=>p.estado_envio==='despachado'), entreg=desp.filter(p=>p.estado_envio==='entregado');
    const tab=(this._despTabSmart==='entregado')?'entregado':'ruta';
    const lista=tab==='entregado'?entreg:ruta;
    const item=p=>{const ent=p.estado_envio==='entregado';const tel=(p.celular||(p.datos&&p.datos.celular)||'').toString();const gs=(p.guia||'').split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean);const guiaLbl=gs.length>1?gs.length+' guías':(gs[0]||'—');return `<div class="item">
        <div class="top"><div><div class="nom">${esc(p.cliente||p.folio||'—')}</div><div class="meta">${p.folio?esc(p.folio)+' · ':''}${cl(p.total)} · 🚚 ${esc(p.transportadora||'—')} · guía ${esc(guiaLbl)}${tel?` · 📱 <a href="https://wa.me/57${esc(tel.replace(/\D/g,''))}" target="_blank" style="color:#16734a;font-weight:700;text-decoration:none">${esc(tel)}</a>`:''}</div></div><span class="badge" style="${ent?'background:#e7f7ee;color:#16734a':'background:#fff3e0;color:#b45309'}">${ent?'✅ entregado':'🚚 en ruta'}</span></div>
        ${gs.length>1?`<div style="display:flex;flex-wrap:wrap;gap:4px;margin:6px 0">${gs.map((g,i)=>`<span onclick="App.copiarGuia('${esc(g)}')" title="copiar guía" style="font-size:11px;background:#eef4ff;border:1px solid #cfe0ff;border-radius:6px;padding:3px 7px;cursor:pointer">${i+1}. ${esc(g)} 📋</span>`).join('')}</div>`:''}
        <div class="acciones-item">
          ${p.guia_url?`<a class="btn-sm" href="${p.guia_url}" target="_blank" style="background:#e5e7eb">🖼️ Ver guía</a>`:''}
          ${ent?`<span class="btn-sm" style="background:#e7f7ee;color:#16734a">Entregado ${(p.entregado_at||'').slice(0,10)}</span>`:`<button class="btn-sm" style="background:#16a34a;color:#fff" onclick="App.pedEntregado('${p.id}')">✅ Marcar entregado</button>`}
        </div></div>`;};
    this.set(`<h1>Despachos</h1><div class="sub">Recibidos por transportadora / entregados · (luego: API Interrapidísimo)</div>
      <div style="display:flex;gap:6px;margin-bottom:12px;overflow-x:auto;padding-bottom:2px">
        <button class="btn-sm" style="flex:0 0 auto;font-weight:700;background:${tab==='ruta'?'var(--naranja);color:#fff':'#eef1f5;color:#555'}" onclick="App.despTabSmart('ruta')">🚚 En ruta (${ruta.length})</button>
        <button class="btn-sm" style="flex:0 0 auto;font-weight:700;background:${tab==='entregado'?'var(--naranja);color:#fff':'#eef1f5;color:#555'}" onclick="App.despTabSmart('entregado')">✅ Entregados (${entreg.length})</button>
      </div>
      ${lista.length?lista.map(item).join(''):`<div class="empty">${tab==='entregado'?'Aún no hay entregados.':'No hay envíos en ruta. Despacha pedidos desde 📦 Pedidos.'}</div>`}`);
  },
  despTabSmart(t){ this._despTabSmart=t; this.vDespachosSmart(); },
  async pedACotizacionSmart(id){
    const p=(this._peds||[]).find(x=>x.id===id)||{};
    if(!confirm('¿Devolver este pedido a COTIZACIÓN? (ej: aún no han pagado)\n\nSale de Pedidos, vuelve a la cola de Cotizaciones y su venta se descuenta de comisiones.')) return;
    const d=Object.assign({}, p.datos||{}, {estado:'Cotizacion'});
    await this.cotUpd(id,{estado:'cotizacion', datos:d});
    if(p.folio){ try{ await fetch(this._SBU()+'/rest/v1/nc_ventas?empresa=eq.smart&folio=eq.'+encodeURIComponent(p.folio),{method:'PATCH',headers:{apikey:this._SBK(),Authorization:'Bearer '+this._SBK(),'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify({estado_pago:'Cancelada'})}); }catch(e){} }
    this._toast('Devuelto a cotización · venta descontada'); this.vPedidosSmart();
  },
  async vCarteraSmart(){   // SMART · Cartera — ventas a crédito pendientes de cobro (datos de Smart, nunca Feroz)
    this.loading();
    const peds=await this._loadPeds();
    const cl=n=>'$'+Math.round(n||0).toLocaleString('es-CO');
    const esCredito=p=>{const d=p.datos||{};return /cred/i.test(d.tipo_pago||d.forma_pago||d.pago||'')||d.credito===true;};
    const noPagado=p=>!(p.datos&&p.datos.cartera_pagada===true);
    const cartera=peds.filter(p=>esCredito(p)&&noPagado(p));
    const total=cartera.reduce((a,p)=>a+(+p.total||0),0);
    this.set(`<h1>💳 Cartera · Smart</h1><div class="sub">Ventas a crédito pendientes de cobro · marca "pagado" cuando el cliente consigne</div>
      <div class="card" style="background:linear-gradient(135deg,#1e40af,#2563eb);color:#fff;border:none"><div style="font-size:12px;opacity:.85">💰 Total por cobrar</div><div style="font-size:25px;font-weight:800;margin-top:2px">${cl(total)}</div><div style="font-size:11px;opacity:.8">${cartera.length} pedido(s) a crédito sin pagar</div></div>
      ${cartera.length?cartera.map(p=>{const d=p.datos||{};const dias=Math.round((Date.now()-new Date(p.creado_en))/86400000);return `<div class="item"><div class="top"><div><div class="nom">${esc(p.cliente||p.folio||'—')}</div><div class="meta">${p.folio?esc(p.folio)+' · ':''}📅 ${dias} días${d.celular?' · 📱 '+esc(d.celular):''}</div></div><div style="text-align:right"><div style="color:#1d4ed8;font-weight:800">${cl(p.total)}</div><button class="btn-sm" style="background:#16a34a;color:#fff;margin-top:4px" onclick="App.carteraPagarSmart('${p.id}')">💰 Marcar pagado</button></div></div></div>`;}).join(''):`<div class="empty" style="text-align:center;padding:30px">✅ Aún no hay ventas a crédito en Smart.<br><span style="font-size:12px;color:#889">Cuando un pedido se venda a crédito, aparecerá aquí para cobrarlo.</span></div>`}`);
  },
  async carteraPagarSmart(id){
    if(!confirm('¿Confirmas que este cliente YA PAGÓ su crédito? Sale de Cartera (la venta se mantiene).')) return;
    try{ const H={apikey:this._SBK(),Authorization:'Bearer '+this._SBK()};
      const rr=await fetch(this._SBU()+'/rest/v1/nc_cotizaciones?id=eq.'+id+'&select=datos&limit=1',{headers:H});
      const d=((await rr.json())[0]||{}).datos||{}; d.cartera_pagada=true;
      await this.cotUpd(id,{datos:d});
    }catch(e){ console.log('carteraPagarSmart',e); }
    this.vCarteraSmart();
  },
  async _regVentaSiFalta(id){   // candado: si el pedido no está en Ventas, lo registra (idempotente por folio)
    try{
      const H={apikey:this._SBK(),Authorization:'Bearer '+this._SBK()};
      const rr=await fetch(this._SBU()+'/rest/v1/nc_cotizaciones?id=eq.'+id+'&select=folio,cliente,total,creado_en,datos&limit=1',{headers:H});
      const cot=(await rr.json())[0]; if(!cot||!cot.folio) return;
      const rx=await fetch(this._SBU()+'/rest/v1/nc_ventas?empresa=eq.smart&folio=eq.'+encodeURIComponent(cot.folio)+'&select=id&limit=1',{headers:H});
      const ya=await rx.json(); if(Array.isArray(ya)&&ya.length) return;   // ya está, no duplica
      const d=cot.datos||{}; const M=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
      const _dtv=new Date(); const mes=M[_dtv.getMonth()]+'-'+_dtv.getFullYear();   // mes = AHORA (cuándo se despacha/registra la venta)
      const esKit=this._esKitCot(d);
      const tv=esKit?+(cot.total||d.total||0):+(d.subtotal_sin_iva||d.total||cot.total||0); const cb=+(d.comision||0);
      await fetch(this._SBU()+'/rest/v1/nc_ventas',{method:'POST',headers:{...H,'Content-Type':'application/json','Prefer':'return=minimal'},
        body:JSON.stringify({empresa:'smart',mes,cliente:cot.cliente||d.empresa||'',documento:d.cedula_nit||'',pedidos_mes:1,total_vendido:tv,total_convenio:0,comision_bruta:cb,pct_comision:tv?+(cb/tv*100).toFixed(1):0,estado_pago:'Pendiente',lista:d.lista_nombre||'',es_kit:esKit,folio:cot.folio,notas:'Registrado al despachar'})});
    }catch(e){ console.log('_regVentaSiFalta',e); }
  },
  addGuia(id){ const box=document.getElementById('guias-'+id); if(!box) return; const i=document.createElement('input'); i.className='gguia field'; i.placeholder='N° de guía'; i.style.cssText='padding:9px;border:1px solid var(--linea);border-radius:8px;width:100%;margin-bottom:4px'; box.appendChild(i); i.focus(); },
  async pedDespachar(id){
    const transp=($('transp-'+id)||{}).value||'';
    const box=document.getElementById('guias-'+id);
    const guias=box?Array.from(box.querySelectorAll('.gguia')).map(i=>i.value.trim()).filter(Boolean):[];
    if(!guias.length){ alert('Pon al menos un número de guía antes de despachar.'); return; }
    const guia=guias.join('\n');   // varias guías = una por línea
    await this.cotUpd(id,{transportadora:transp,guia:guia,estado_envio:'despachado',despachado_at:new Date().toISOString()});
    await this._regVentaSiFalta(id);   // candado: asegura que la venta quede en Ventas
    this._toast('📦 '+guias.length+' guía'+(guias.length>1?'s':'')+' despachada'+(guias.length>1?'s':'')+' por '+transp+' → pasó a Despachos.');
    this.vPedidosSmart();
  },
  async pedDespacharPropio(id){
    if(!confirm('¿Despachar por TRANSPORTE PROPIO (sin guía de transportadora)?')) return;
    await this.cotUpd(id,{transportadora:'Propio',guia:'',estado_envio:'despachado',despachado_at:new Date().toISOString()});
    await this._regVentaSiFalta(id);   // candado: asegura que la venta quede en Ventas
    this._toast('🚚 Despachado por transporte propio → pasó a Despachos.');
    this.vPedidosSmart();
  },
  async pedEntregado(id){
    if(!confirm('¿Marcar este pedido como ENTREGADO?')) return;
    await this.cotUpd(id,{estado_envio:'entregado',entregado_at:new Date().toISOString()});
    this._toast('✅ Pedido marcado entregado.');
    this.vDespachosSmart();
  },
  async pedSubirFoto(id,input){
    const f=input.files&&input.files[0]; if(!f) return;
    const ped=this._findPed(id); const folio=((ped.folio||id)+'').replace(/[^a-zA-Z0-9]/g,'');
    const ext=((f.name.split('.').pop())||'jpg').toLowerCase();
    const path='guias/'+folio+'-'+Date.now()+'.'+ext;
    this._toast('Subiendo foto de guía…');
    try{
      const up=await fetch(this._SBU()+'/storage/v1/object/documentos/'+path,{method:'POST',headers:{apikey:this._SBK(),Authorization:'Bearer '+this._SBK()},body:f});
      if(!up.ok) throw new Error('HTTP '+up.status);
      await this.cotUpd(id,{guia_url:this._SBU()+'/storage/v1/object/public/documentos/'+path});
      this._toast('📎 Foto de guía adjuntada.'); this.vPedidosSmart();
    }catch(e){ this._toast('No subió la foto ('+e.message+'). Usa el número de guía.'); }
  },
  cotAbrir(doc){
    const e=window.NC_EMPRESA||'feroz';
    if(e==='smart'){ const src='cotizador-smart/index.html?t='+Date.now()+(doc?('&cliente='+encodeURIComponent(doc)):'');
      this.set(`<button class="btn-sm" onclick="App.go('cotizaciones')" style="margin-bottom:10px;background:var(--gris)">← Volver a cotizaciones</button>
      <iframe src="${src}" style="width:100%;height:78vh;border:1px solid var(--linea);border-radius:12px;background:#fff"></iframe>`); }
    else { this.vCotizacionNueva(); }   // Feroz y demás: su cotizador propio de la plataforma
  },
  async cotRegistro(){
    const e=window.NC_EMPRESA||'feroz';
    if(e!=='smart') return this.vClientes();   // Feroz tiene su propia vista de clientes; este resumen lee tablas nc_* (Smart)
    this.loading();
    let cli=[], cots=[];
    try{ const r=await fetch(this._SBU()+'/rest/v1/nc_clientes?empresa=eq.'+e+'&select=documento',{headers:{apikey:this._SBK(),Authorization:'Bearer '+this._SBK()}}); const j=await r.json(); cli=Array.isArray(j)?j:[]; }catch(e2){}
    try{ const r=await fetch(this._SBU()+'/rest/v1/nc_cotizaciones?empresa=eq.'+e+'&select=estado,datos',{headers:{apikey:this._SBK(),Authorization:'Bearer '+this._SBK()}}); const j=await r.json(); cots=Array.isArray(j)?j:[]; }catch(e2){}
    const nCot=cots.filter(c=>c.estado==='cotizacion').length;
    const nPed=cots.filter(c=>c.estado==='pedido').length;
    const nKit=cots.filter(c=>this._esKitCot(c.datos)).length;
    this.set(`<button class="btn-sm" onclick="App.go('cotizaciones')" style="margin-bottom:10px;background:var(--gris)">← Volver</button>
      <h1>Clientes · Resumen</h1><div class="sub">Estado de tu base de clientes</div>
      <div class="card" style="text-align:center;border-left:4px solid var(--naranja)"><div style="font-size:34px;font-weight:800;color:var(--naranja);line-height:1">${cli.length}</div><div style="font-size:13px;margin-top:4px">Clientes totales en base</div></div>
      <div class="kpis">
        <div class="kpi verde"><b>${nPed}</b><span>👥 Clientes (compraron)</span></div>
        <div class="kpi"><b>${nCot}</b><span>📝 Cotizaciones</span></div>
        <div class="kpi"><b>${nKit}</b><span>📦 Kits</span></div>
      </div>
      <button class="btn btn-main" style="margin-top:14px" onclick="App.vRegistroForm()">+ Nuevo cliente</button>
    `);
  },
  _listasPrecios(){ const e=window.NC_EMPRESA||'feroz'; return ({
      smart:[['0','L1 Muestras'],['1','L2 Pyme'],['2','L3 Mayorista'],['3','L4 Distribuidor'],['4','L5 Convenio']],
      feroz:[['0','Distribuidor']],
      epheta:[['0','General']]
    })[e]||[['0','General']]; },
  _listasOptions(){ return this._listasPrecios().map(l=>`<option value="${l[0]}">${l[1]}</option>`).join(''); },
  _na(s){ return (s||'').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim(); },
  _autoDeptoCliente(){ const ci=$('cl_ciudad'),de=$('cl_depto'); if(!ci||!de) return; const na=this._na(ci.value); if(!na) return;
    const gm=this._geoMap(), extra=this._cityDeptoExtra(); const hit=gm[na]||(extra[na]?{depto:extra[na]}:null);
    if(hit&&hit.depto) de.value=hit.depto; },
  _geoMap(){ if(this.__geo) return this.__geo; const m={}; (window.GEO_CO?window.GEO_CO.zonas:[]).forEach(z=>(z.deptos||[]).forEach(d=>(d.ciudades||[]).forEach(c=>{ m[this._na(c.nombre)]={depto:d.nombre,zona:z.nombre}; }))); this.__geo=m; return m; },
  _geoDeptoZona(){ if(this.__gdz) return this.__gdz; const m={}; (window.GEO_CO?window.GEO_CO.zonas:[]).forEach(z=>(z.deptos||[]).forEach(d=>{ m[this._na(d.nombre)]=z.nombre; })); this.__gdz=m; return m; },
  _cityDeptoExtra(){ return {'cajica':'Cundinamarca','choconta':'Cundinamarca','madrid':'Cundinamarca','tenjo':'Cundinamarca','ubate':'Cundinamarca','zipaquira':'Cundinamarca','sopo':'Cundinamarca','chia':'Cundinamarca','funza':'Cundinamarca','mosquera':'Cundinamarca','caucasia':'Antioquia','girardota':'Antioquia','la estrella':'Antioquia','apartado':'Antioquia','rionegro':'Antioquia','chinacota':'Norte de Santander','los patios':'Norte de Santander','ocana':'Norte de Santander','pamplona':'Norte de Santander','cumaral':'Meta','acacias':'Meta','el espino':'Boyaca','sogamoso':'Boyaca','duitama':'Boyaca','la cumbre':'Valle del Cauca','la cruz':'Narino','pitalito':'Huila','san gil':'Santander','velez':'Santander','barrancas':'La Guajira'}; },
  _geoCiudadesOptions(){ const s=new Set(); (window.GEO_CO?window.GEO_CO.zonas:[]).forEach(z=>(z.deptos||[]).forEach(d=>(d.ciudades||[]).forEach(c=>s.add(c.nombre)))); return [...s].sort().map(c=>`<option value="${c}">`).join(''); },
  autoGeoRegistro(){ const ci=$('rc_ciudad')?this._na($('rc_ciudad').value):''; let g=this._geoMap()[ci]; if(!g){ const ex=this._cityDeptoExtra()[ci]; if(ex){ const zn=this._geoDeptoZona()[this._na(ex)]; if(zn) g={depto:ex,zona:zn}; } } const hub={}; (window.GEO_CO?window.GEO_CO.zonas:[]).forEach(z=>hub[z.nombre]=z.hub); if(g){ if($('rc_depto'))$('rc_depto').value=g.depto; if($('rc_zona'))$('rc_zona').value=g.zona; const n=$('rc_geo_note'); if(n) n.textContent='📍 '+($('rc_ciudad').value)+' → '+g.depto+' → Zona '+g.zona+(hub[g.zona]?' (hub '+hub[g.zona]+')':''); } else { const n=$('rc_geo_note'); if(n) n.textContent=''; } },
  async _telemercsOpts(){ try{ const r=await fetch(this._SBU()+'/rest/v1/nc_marcador_operadoras?activo=eq.true&select=nombre&order=nombre.asc',{headers:{apikey:this._SBK(),Authorization:'Bearer '+this._SBK()}}); const j=await r.json(); return (Array.isArray(j)?j:[]).map(t=>`<option value="${t.nombre}">${t.nombre}</option>`).join(''); }catch(e){ return ''; } },
  async vRegistroForm(){
    const teleOpts=await this._telemercsOpts();
    this.set(`<button class="btn-sm" onclick="App.cotRegistro()" style="margin-bottom:10px;background:var(--gris)">← Volver</button>
      <h1>Nuevo cliente</h1><div class="sub">Se guarda en la nube y se reutiliza en cotizador, CRM y despachos</div>
      <div class="card">
        <label>Tipo</label><select id="rc_tipo" class="field"><option value="natural">Persona natural</option><option value="juridica">Empresa (NIT)</option></select>
        <div class="row2"><div><label>Cédula / NIT *</label><input id="rc_doc" class="field"></div><div><label>Nombre / Razón social *</label><input id="rc_nombre" class="field"></div></div>
        <div class="row2"><div><label>Contacto</label><input id="rc_contacto" class="field"></div><div><label>WhatsApp *</label><input id="rc_wa" class="field" inputmode="tel"></div></div>
        <label>Email</label><input id="rc_email" class="field" inputmode="email">
      </div>
      <div class="card"><h2 style="font-size:15px;margin-bottom:8px">Segmentación</h2>
        <div class="row2"><div><label>Tipo de cliente</label><select id="rc_seg" class="field"><option value="cliente final">Cliente final</option><option value="distribuidor">Distribuidor</option><option value="mayorista">Mayorista</option><option value="empresa">Empresa</option></select></div>
          <div><label>Lista de precios habitual</label><select id="rc_lista" class="field">${this._listasOptions()}</select></div></div>
        <div class="row2"><div><label>Canal</label><select id="rc_canal" class="field"><option value="digital">Digital</option><option value="marcador">Marcador</option><option value="organico">Orgánico</option><option value="recomendado">Recomendado</option></select></div><div><label>Sector / nicho</label><input id="rc_sector" class="field"></div></div>
        <label>📞 Telemercaderista (quién lo consiguió)</label><select id="rc_telemerc" class="field"><option value="">Sin telemercaderista</option>${teleOpts}</select>
      </div>
      <div class="card"><h2 style="font-size:15px;margin-bottom:8px">Datos de envío</h2>
        <label>Dirección</label><input id="rc_dir" class="field">
        <div class="row2"><div><label>Barrio</label><input id="rc_barrio" class="field"></div>
          <div><label>Ciudad</label><input id="rc_ciudad" class="field" list="rc_ciudadesDL" oninput="App.autoGeoRegistro()" placeholder="Escribe y elige"><datalist id="rc_ciudadesDL">${this._geoCiudadesOptions()}</datalist></div></div>
        <div class="row2"><div><label>Departamento (auto)</label><input id="rc_depto" class="field"></div><div><label>Zona (auto)</label><input id="rc_zona" class="field"></div></div>
        <div id="rc_geo_note" style="font-size:11.5px;color:var(--naranja);font-weight:600;margin:2px 0 6px"></div>
      </div>
      <label>Notas / condiciones especiales</label><textarea class="field" id="rc_notas"></textarea>
      <button class="btn btn-main" style="margin-top:12px" onclick="App.guardarRegistro()">💾 Guardar cliente</button>
    `);
  },
  // 🔒 Homologación: busca un cliente Feroz ya existente con el mismo celular o NIT real (para no duplicar)
  async _clienteDuplicado(tel, nit, excludeId){
    const dTel=(tel||'').replace(/\D/g,''), dNit=(nit||'').replace(/\D/g,'');
    const { data } = await this.sb.from('clientes').select('id,nombre,tel,cel2,nit');
    if(!data) return null;
    return data.find(c=>{
      if(excludeId && c.id===excludeId) return false;
      const ct=(c.tel||'').replace(/\D/g,''), cc=(c.cel2||'').replace(/\D/g,''), cn=(c.nit||'').replace(/\D/g,'');
      if(dTel.length>=7 && (ct===dTel||cc===dTel)) return true;
      if(dNit.length>=6 && new Set(dNit).size>1 && cn===dNit) return true;
      return false;
    }) || null;
  },
  // 🔗 Cadena CRM: la gestión hace que el cliente aparezca/avance en Prospectos. No retrocede ni baja a un cliente ya hecho.
  async _avanzarEmbudo(clienteId, nuevo){
    if(!clienteId) return;
    const rank={null:0,'':0,contactado:1,interesado:2,muestra:3,cliente:4};
    try{
      const { data:c } = await this.sb.from('clientes').select('embudo').eq('id',clienteId).single();
      const actual = c ? c.embudo : null;
      if((rank[nuevo]||0) > (rank[actual]||0)) await this.sb.from('clientes').update({embudo:nuevo}).eq('id',clienteId);
    }catch(e){}
  },
  async guardarRegistro(){
    const v=id=>($(id)?$(id).value.trim():'');
    const tipo=v('rc_tipo'), doc=v('rc_doc'), nombre=v('rc_nombre'), wa=v('rc_wa');
    if(!doc||!nombre){ alert('Cédula/NIT y nombre son obligatorios'); return; }
    const e=window.NC_EMPRESA||'feroz';
    if(e!=='smart'){
      // FEROZ → su propia tabla 'clientes' (queda como PROSPECTO: embudo=contactado)
      const base={nombre, nit:doc, tel:wa, correo:v('rc_email'), direccion:v('rc_dir'), barrio:v('rc_barrio'),
        ciudad:v('rc_ciudad'), depto:v('rc_depto'), clase:(v('rc_seg')==='distribuidor'?'distribuidor':'empresa'),
        contacto1:v('rc_contacto'), embudo:null, lista_precio:'Distribuidor', referencia:'701',
        recomendado:(v('rc_canal')==='recomendado'), telemercaderista:v('rc_telemerc')||null, creado_por:this.user.id};
      const dup=await this._clienteDuplicado(wa, doc);
      if(dup && confirm(`⚠️ Ya existe "${dup.nombre}" con ese mismo teléfono/NIT.\n\nAceptar = NO crear duplicado (ir al CRM).\nCancelar = crear de todos modos.`)){ this.go('crm'); return; }
      const { error } = await this.sb.from('clientes').insert(base);
      if(error){ alert('Error: '+error.message); return; }
      alert('✅ Prospecto guardado (lo ves en CRM → 🎯 Prospectos)'); this.go('crm'); return;
    }
    // SMART → nc_clientes
    const datos={tipo, seg:v('rc_seg'), canal:v('rc_canal'), sector:v('rc_sector'), zona:v('rc_zona'), notas:v('rc_notas'), telemerc:v('rc_telemerc')||null, last_lista:Number(v('rc_lista'))||0};
    if(tipo==='natural'){ Object.assign(datos,{nom:nombre,neg:nombre,ced:doc,tel:wa,eml:v('rc_email'),dir:v('rc_dir'),bar:v('rc_barrio'),ciu:v('rc_ciudad'),dep:v('rc_depto')}); }
    else { Object.assign(datos,{rsoc:nombre,rut:doc,rec:v('rc_contacto'),telj:wa,emlj:v('rc_email'),dirj:v('rc_dir'),barj:v('rc_barrio'),ciuj:v('rc_ciudad'),depj:v('rc_depto')}); }
    try{ const r=await fetch(this._SBU()+'/rest/v1/nc_clientes?on_conflict=empresa,documento',{method:'POST',headers:{apikey:this._SBK(),Authorization:'Bearer '+this._SBK(),'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({empresa:'smart',documento:doc,nombre:nombre,celular:wa,last_lista:Number(v('rc_lista'))||0,datos:datos})});
      if(!r.ok){ alert('Error guardando: '+(await r.text()).slice(0,160)); return; }
      alert('✅ Cliente guardado'); this.cotRegistro(); }catch(err){ alert('Error: '+err.message); }
  },
  loading(){ this.set('<div class="spin">Cargando…</div>'); },

  /* ---------- DASHBOARD ---------- */
  async vDashboard(){
    if(window.NC_EMPRESA==='smart') return this.vDashboardSmart();
    this.loading();
    const { data:peds=[] } = await this.sb.from('pedidos').select('estado,total,tipo_pago,creado_en,curva');
    const cont = e => peds.filter(p=>p.estado===e).length;
    // pares a producir (déficit de inventario)
    let totProd=0;
    if(this.puede('admin','planta')){
      const { data:inv=[] } = await this.sb.from('inventario').select('talla,stock').eq('referencia','701');
      const stock={}; inv.forEach(r=>stock[r.talla]=r.stock);
      const comp={};
      peds.filter(p=>['pendiente_pago','consignado','autorizado'].includes(p.estado))
        .forEach(p=>{const c=p.curva||{};Object.entries(c).forEach(([t,q])=>comp[t]=(comp[t]||0)+(+q||0));});
      C.TALLAS.forEach(t=>{const d=(stock[t]||0)-(comp[t]||0); if(d<0) totProd+=-d;});
    }
    const ahora=new Date(), mes=peds.filter(p=>{const d=new Date(p.creado_en);return d.getMonth()===ahora.getMonth()&&d.getFullYear()===ahora.getFullYear();});
    const ventasMes = mes.filter(p=>p.estado!=='anulado').reduce((a,p)=>a+(+p.total||0),0);
    const porCobrar = peds.filter(p=>p.tipo_pago==='credito'&&!['entregado','anulado'].includes(p.estado)).reduce((a,p)=>a+(+p.total||0),0);
    const { count:nCot } = await this.sb.from('cotizaciones').select('*',{count:'exact',head:true});
    const nPend=cont('pendiente_pago'), nFact=cont('consignado'), nDesp=cont('autorizado'), nLista=cont('despachado')+cont('entregado');
    const maxN=Math.max(nPend,nFact,nDesp,nLista,1), mesN=mes.filter(p=>p.estado!=='anulado').length;
    const etapas=[
      {l:'Esperando pago', n:nPend, ic:'⏳', c:'#f59e0b'},
      {l:'Por facturar',   n:nFact, ic:'💳', c:'#2f6fed'},
      {l:'Por despachar',  n:nDesp, ic:'📦', c:'#E8620C'},
      {l:'Despachados',    n:nLista,ic:'🚚', c:'#2e9e4f'},
    ];
    const urgente = nDesp>0?`Lo más urgente: <b>${nDesp}</b> por despachar — sácalos hoy.`
      : nFact>0?`Tienes <b>${nFact}</b> pedido(s) por facturar.`
      : nPend>0?`<b>${nPend}</b> esperando confirmación de pago.`
      : 'Todo al día — sin pedidos atascados. 🎉';
    const enuncVentas = ventasMes>0?`Has facturado <b>${money(ventasMes)}</b> en <b>${mesN}</b> pedido(s) este mes.`:'Aún sin ventas este mes — ¡momento de cerrar! 💪';
    const bar = e => `<div style="margin-bottom:11px">
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px"><span>${e.ic} ${e.l}</span><b>${e.n}</b></div>
        <div style="height:11px;background:#eef0f2;border-radius:6px;overflow:hidden"><div style="height:100%;width:${Math.round(e.n/maxN*100)}%;background:${e.c};border-radius:6px"></div></div></div>`;
    this.set(`
      <h1>Tablero</h1><div class="sub">Cómo vamos hoy</div>
      <div class="card" style="border-left:4px solid var(--naranja)">
        <div style="font-size:30px;font-weight:800;color:var(--naranja);line-height:1">${money(ventasMes)}</div>
        <div style="font-size:13px;margin-top:5px">${enuncVentas}</div>
      </div>
      <div class="kpis">
        <div class="kpi"><b>${nCot||0}</b><span>Cotizaciones en juego</span></div>
        <div class="kpi verde"><b>${nLista}</b><span>🚚 Despachados</span></div>
      </div>
      <div class="card">
        <h2 style="font-size:15px;margin-bottom:12px">📦 Embudo de pedidos</h2>
        ${etapas.map(bar).join('')}
        <div style="font-size:13px;color:var(--suave);margin-top:6px;border-top:1px solid var(--linea);padding-top:8px">${urgente}</div>
      </div>
      ${porCobrar>0?`<div class="card" style="border-left:4px solid var(--rojo)"><div style="font-size:22px;font-weight:800;color:var(--rojo)">${money(porCobrar)}</div><div style="font-size:13px">Por cobrar de créditos — hazles seguimiento para no frenar el flujo de caja.</div></div>`:''}
      ${this.puede('admin','planta')&&totProd>0?`<div class="card" style="border-left:4px solid var(--rojo)"><div style="font-size:22px;font-weight:800;color:var(--rojo)">${totProd} pares</div><div style="font-size:13px">⚠️ Faltan para cubrir los pedidos — revisa 🏭 Planta.</div></div>`:''}
    `);
  },

  // Dashboard de Smart: lee SUS datos reales (leads del bot Valentina)
  async vDashboardSmart(){
    this.loading();
    const GAS='https://script.google.com/macros/s/AKfycbwUqUU_53BwfTTKW1levIpgGEZowfOmW-UltufLD6ZAPgQl7w1VdiaTMNUILqRp0Syf/exec';
    const TOK='2d6356b7e12ad3314b5c85ce087864a3fd6d8e5015fbb105acc77cf44a3221b3';
    let convs=[];
    try{ const r=await fetch(GAS+'?action=list&client=SMART&token='+TOK); const d=await r.json(); convs=d.conversations||[]; }catch(e){}
    const total=convs.length, ahora=Date.now();
    const d30=convs.filter(c=>{const t=new Date(c.lastTime).getTime(); return (ahora-t)<30*864e5;}).length;
    const conNombre=convs.filter(c=>c.name && !/^\d+$/.test(c.name)).length;
    this.set(`
      <h1>Tablero · Smart Envases</h1><div class="sub">Cómo vamos hoy</div>
      <div class="card" style="border-left:4px solid var(--naranja)">
        <div style="font-size:30px;font-weight:800;color:var(--naranja);line-height:1">${total}</div>
        <div style="font-size:13px;margin-top:5px">Tienes <b>${total}</b> leads del bot Valentina · <b>${d30}</b> activos en 30 días · <b>${conNombre}</b> con nombre.</div>
      </div>
      <div class="kpis">
        <div class="kpi"><b>${d30}</b><span>Leads últimos 30 días</span></div>
        <div class="kpi"><b>297</b><span>Empresas B2B (envases)</span></div>
      </div>
      <div class="card" style="border-left:4px solid var(--rojo)">
        <div style="font-size:14px;font-weight:700">💰 Ventas por mes — por conectar</div>
        <div style="font-size:13px;margin-top:4px">Dime en qué Sheet/pestaña están las ventas de Smart y las traigo aquí (igual que Feroz).</div>
      </div>
      <div class="sub" style="margin-top:10px">El detalle de contactos está en 👥 CRM (B2B + B2C).</div>
    `);
  },

  /* ---------- CLIENTES ---------- */
  async vClientes(){
    this.loading();
    const { data:cli=[] } = await this.sb.from('clientes').select('*').order('creado_en',{ascending:false});
    this._cliCache = cli;
    // pedidos por cliente (para la línea de embudo + bolitas por mes)
    let peds=[]; try{ const r=await this.sb.from('pedidos').select('cliente_id,creado_en,estado,es_muestra'); peds=r.data||[]; }catch(e){}
    const byCli={}; peds.forEach(p=>{ if(!p.cliente_id||p.estado==='anulado'||p.es_muestra) return; const mes=(p.creado_en||'').slice(0,7); (byCli[p.cliente_id]=byCli[p.cliente_id]||{m:new Set(),n:0}); byCli[p.cliente_id].m.add(mes); byCli[p.cliente_id].n++; });
    this._pedsByCliFeroz=byCli;
    const fmt=n=>n!=null?('$'+(+n).toLocaleString('es-CO')):'';
    const tab=this._cliTab||'nc'; this._cliTab=tab;
    const reales=cli.filter(c=>c.embudo==='cliente');   // CLIENTES = ya compraron (1er pedido). Los demás son PROSPECTOS (en CRM).
    const nNC=reales.filter(c=>!c.recomendado&&!c.especial).length, nG=reales.filter(c=>!!c.recomendado&&!c.especial).length, nEsp=reales.filter(c=>!!c.especial).length;
    const grupo=reales.filter(c=> tab==='gpjr' ? (!!c.recomendado&&!c.especial) : tab==='esp' ? !!c.especial : (!c.recomendado&&!c.especial));
    this.set(`
      <h1>Clientes</h1><div class="sub"><b>${reales.length}</b> clientes (ya compraron) · los <b>prospectos</b> están en CRM → 🎯 Prospectos</div>
      <button class="btn-sm" style="background:#fff;border:1.5px solid var(--naranja);color:var(--naranja);margin-bottom:10px;width:100%;padding:10px" onclick="App.modalComisiones()">💰 Tabla de comisiones (referencia × lista)</button>
      <div style="display:flex;gap:6px;margin-bottom:10px">
        <button class="btn-sm" style="flex:1;padding:11px;font-weight:700;background:${tab==='nc'?'var(--naranja);color:#fff':'#e5e7eb'}" onclick="App.cliTab('nc')">👤 NC (${nNC})</button>
        <button class="btn-sm" style="flex:1;padding:11px;font-weight:700;background:${tab==='gpjr'?'#b8860b;color:#fff':'#e5e7eb'}" onclick="App.cliTab('gpjr')">⭐ GPJR (${nG})</button>
        <button class="btn-sm" style="flex:1;padding:11px;font-weight:700;background:${tab==='esp'?'#b8860b;color:#fff':'#e5e7eb'}" onclick="App.cliTab('esp')">⭐⭐ Especiales (${nEsp})</button>
      </div>
      <input id="cliq" placeholder="🔍 Buscar por nombre o celular…" style="width:100%;padding:12px;border:1.5px solid var(--linea);border-radius:10px;margin-bottom:6px;box-sizing:border-box" oninput="App._filtrarCliFeroz()">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span id="clicount" style="font-size:12px;color:var(--suave)">${grupo.length} coinciden (clientes creados)</span>
        <button class="btn-sm" style="background:var(--naranja);color:#fff" onclick="App.modalCliente()">+ Nuevo cliente</button>
      </div>
      <button class="btn-sm" style="width:100%;background:#fff;border:1.5px solid #b8860b;color:#b8860b;margin-bottom:10px;padding:11px" onclick="App.buscarEnDistribuidores()">🔎 ¿No aparece? Buscar en la base de DISTRIBUIDORES (3.638) y crearlo</button>
      <div id="distres"></div>
      <div id="clilist">
      ${grupo.length?grupo.map(c=>`
        <div class="item cli-row" style="cursor:pointer" onclick="App.editarCliente(${c.id})"><div class="top"><div>
          <div class="nom">${esc(c.nombre)} ${c.especial?'<span style="color:#b8860b;font-weight:700">⭐⭐</span>':c.recomendado?'<span style="color:#b8860b">⭐</span>':''} <span style="font-size:12px;color:var(--suave)">✏️</span></div>
          <div class="meta">NIT ${esc(c.nit||'—')} · 📱 ${esc(c.tel||'')}<br>${esc([c.barrio,c.ciudad,c.depto].filter(Boolean).join(', '))}${(c.referencia||c.valor_par_nc!=null)?`<br>💰 ${esc(c.referencia||'')}${c.lista_precio?' · '+esc(c.lista_precio):''}${c.valor_par_nc!=null?' · NC '+fmt(c.valor_par_nc):''}${(c.recomendado&&c.valor_par_gpjr!=null)?' · GPJR '+fmt(c.valor_par_gpjr):''}`:''}</div>
        </div><span class="badge ${c.recomendado?'b-cotizada':(c.tipo_pago==='credito'?'b-autorizado':'b-aceptada')}">${c.recomendado?'⭐ Recomendado':(c.tipo_pago||'contado')}</span></div>${this._cliEmbudo(c)}</div>
      `).join(''):`<div class="empty">${tab==='gpjr'?'Aún no hay clientes recomendados por GPJR. Marca "Recomendado" al crear/editar un cliente.':'Aún no hay clientes NC. Crea el primero.'}</div>`}
      </div>
    `);
  },
  cliTab(t){ this._cliTab=t; this.vClientes(); },
  _cliEmbudo(c){
    const info=(this._pedsByCliFeroz||{})[c.id]||{m:new Set(),n:0};
    const n=info.n, set=info.m;
    const MESES=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const now=new Date(), y=now.getFullYear(), mi=now.getMonth();
    const dot=on=>`<span style="display:inline-block;width:14px;height:14px;border-radius:50%;vertical-align:middle;background:${on?'#16a34a':'#dde2e8'};border:2px solid ${on?'#0f7a33':'#8b97a6'}${on?';box-shadow:0 0 0 2px #16a34a33':''}"></span>`;
    const etapa=(lbl,on)=>`<span style="font-size:10.5px;font-weight:${on?700:500};color:${on?'#0f7a33':'#6b7686'};white-space:nowrap">${dot(on)} ${lbl}</span>`;
    let meses='';
    for(let m=0;m<12;m++){ const key=y+'-'+String(m+1).padStart(2,'0'); const on=set.has(key), cur=m===mi;
      meses+=`<div style="text-align:center;flex:0 0 auto"><div style="width:18px;height:18px;border-radius:50%;margin:0 auto;background:${on?'#16a34a':'#dde2e8'};border:2px solid ${on?'#0f7a33':'#8b97a6'}${on?';box-shadow:0 1px 3px #16a34a66':''}"></div><div style="font-size:9px;margin-top:2px;color:${cur?'var(--naranja)':'#5b6472'};font-weight:${cur||on?700:500}">${MESES[m]}</div></div>`; }
    return `<div style="margin-top:9px;border-top:1px dashed var(--linea);padding-top:8px" onclick="event.stopPropagation()">
      <div style="display:flex;gap:13px;margin-bottom:7px">${etapa('🎁 Muestras',true)}${etapa('🛒 1er pedido',n>=1)}${etapa('🔁 Recurrente',n>=2)}</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">${meses}</div>
      <div style="font-size:9px;color:#9aa3b0;margin-top:3px">● mes con pedido · ${n} pedido${n===1?'':'s'} en total</div>
    </div>`;
  },
  async buscarEnDistribuidores(){
    const q=($('cliq')?$('cliq').value:'').trim(); const cont=$('distres'); if(!cont) return;
    if(q.length<3){ cont.innerHTML='<div class="hint" style="color:#b8860b">Escribe al menos 3 letras o dígitos en el buscador de arriba.</div>'; return; }
    cont.innerHTML='<div class="hint">Buscando en los 3.638 distribuidores…</div>';
    const H={apikey:this._SBK(),Authorization:'Bearer '+this._SBK()};
    const enc=encodeURIComponent('*'+q+'*');
    try{
      const r=await fetch(this._SBU()+'/rest/v1/feroz_marcador_leads?mundo=eq.distribuidor&or=(nombre.ilike.'+enc+',cel.ilike.'+enc+')&select=fila,nombre,ciudad,depto,contacto,cel&limit=40',{headers:H});
      const arr=await r.json();
      const yaMap={}; (this._cliCache||[]).forEach(c=>{ const k=(c.tel||'').replace(/\D/g,''); if(k) yaMap[k]=c; });
      const matches=(Array.isArray(arr)?arr:[]).map(x=>({...x, _cli: yaMap[(x.cel||'').replace(/\D/g,'')]||null}));
      this._distRes=matches;
      if(!matches.length){ cont.innerHTML='<div class="hint" style="color:#b8860b">No hay coincidencias en la base de distribuidores.</div>'; return; }
      cont.innerHTML='<div style="font-size:12px;font-weight:700;color:#b8860b;margin:10px 0 6px">📞 En base de DISTRIBUIDORES:</div>'+matches.map((x,i)=>{
        const c=x._cli;
        const accion = c
          ? `<button class="btn-sm" style="background:#16a34a;color:#fff" onclick="App.editarCliente(${c.id})">${c.recomendado?'⭐ Ya recomendado · abrir':'✅ Ya es cliente · marcar ⭐'}</button>`
          : `<button class="btn-sm" style="background:#b8860b;color:#fff" onclick="App.crearDesdeDistribuidor(${i})">+ Crear cliente</button>`;
        return `<div class="item"><div class="top"><div><div class="nom">${esc(x.nombre||'—')} ${c?'<span style="color:#16a34a;font-size:11px">(ya cliente)</span>':'<span style="color:#b8860b;font-size:11px">(nuevo)</span>'}</div>
          <div class="meta">📱 ${esc(x.cel||'')}${x.ciudad?' · '+esc(x.ciudad):''}${x.contacto?' · '+esc(x.contacto):''}</div></div>${accion}</div></div>`;
      }).join('');
    }catch(e){ cont.innerHTML='<div class="hint">Error buscando en distribuidores.</div>'; }
  },
  crearDesdeDistribuidor(i){
    const x=(this._distRes||[])[i]; if(!x) return;
    this.modalCliente(null, {nombre:x.nombre, tel:x.cel, ciudad:x.ciudad, depto:x.depto, clase:'distribuidor', contacto1:x.contacto||''});
  },
  async buscarEnBasesCliente(){
    const q=($('cl_busca')?$('cl_busca').value:'').trim(); const cont=$('cl_busres'); if(!cont) return;
    if(q.length<3){ cont.innerHTML='<div class="hint">Escribe 3+ letras o dígitos.</div>'; return; }
    cont.innerHTML='<div class="hint">Buscando en sistema, empresas y distribuidores…</div>';
    const H={apikey:this._SBK(),Authorization:'Bearer '+this._SBK()};
    const enc=encodeURIComponent('*'+q+'*'); const res=[];
    try{ const r=await fetch(this._SBU()+'/rest/v1/clientes?or=(nombre.ilike.'+enc+',tel.ilike.'+enc+')&select=id,nombre,nit,tel,ciudad,depto,contacto1&limit=15',{headers:H}); const a=await r.json(); (Array.isArray(a)?a:[]).forEach(x=>res.push({id:x.id,nombre:x.nombre,cel:x.tel,ciudad:x.ciudad,depto:x.depto,contacto:x.contacto1,mundo:'sistema'})); }catch(e){}
    try{ const r=await fetch(this._SBU()+'/rest/v1/feroz_marcador_leads?or=(nombre.ilike.'+enc+',cel.ilike.'+enc+')&select=nombre,ciudad,depto,contacto,cel,mundo&limit=30',{headers:H}); const a=await r.json(); (Array.isArray(a)?a:[]).forEach(x=>res.push({nombre:x.nombre,cel:x.cel,ciudad:x.ciudad,depto:x.depto,contacto:x.contacto,mundo:x.mundo})); }catch(e){}
    this._clBusRes=res;
    if(!res.length){ cont.innerHTML='<div class="hint" style="color:#8a93a6">No está en sistema, empresas ni distribuidores — llénalo manual abajo.</div>'; return; }
    const lab=m=> m==='sistema'?['✅ ya en sistema','#16a34a'] : m==='distribuidor'?['distribuidor','#b8860b'] : ['empresa','#3a48b3'];
    cont.innerHTML=res.map((x,i)=>{ const L=lab(x.mundo);
      const accion = x.mundo==='sistema'
        ? `<button class="btn-sm" style="background:#16a34a;color:#fff" onclick="App.editarDesdeBusq(${x.id})">✏️ Editar</button>`
        : `<button class="btn-sm" style="background:var(--naranja);color:#fff" onclick="App.usarLeadCliente(${i})">Usar</button>`;
      return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--linea)">
      <div style="font-size:12.5px"><b>${esc(x.nombre||'—')}</b> <span style="font-size:10px;padding:1px 6px;border-radius:8px;background:${L[1]}22;color:${L[1]}">${L[0]}</span><br><span style="color:#667">📱 ${esc(x.cel||'')}${x.ciudad?' · '+esc(x.ciudad):''}</span></div>
      ${accion}</div>`; }).join('');
  },
  async editarDesdeBusq(id){
    const { data:c } = await this.sb.from('clientes').select('*').eq('id',id).single();
    if(!c){ this._toast('No encontré ese contacto'); return; }
    this.cerrarModal();
    this.modalCliente(()=>this.vCrm(), c);
  },
  usarLeadCliente(i){
    const x=(this._clBusRes||[])[i]; if(!x) return;
    const set=(id,val)=>{ const el=$(id); if(el&&val) el.value=val; };
    set('cl_nombre',x.nombre); set('cl_tel',x.cel); set('cl_ciudad',x.ciudad); set('cl_depto',x.depto); set('cl_cont1',x.contacto);
    if($('cl_clase')&&x.mundo==='distribuidor') $('cl_clase').value='distribuidor';
    const cont=$('cl_busres'); if(cont) cont.innerHTML='<div class="hint" style="color:'+(x.mundo==='sistema'?'#b3261e':'var(--verde)')+'">'+(x.mundo==='sistema'?'⚠️ Ese cliente YA existe en el sistema — mejor edítalo desde Clientes/CRM, no lo dupliques. (Datos cargados de referencia.)':'✅ Datos cargados de '+esc(x.nombre)+'. Revisa y guarda.')+'</div>';
  },
  async modalComisiones(){
    const { data:rows=[] } = await this.sb.from('feroz_comisiones').select('*').order('referencia');
    this._comRows=rows; const LISTAS=['Distribuidor','Empresa pequeña','Empresa mediana','Empresa grande'];
    const m=n=>'$'+(+n||0).toLocaleString('es-CO');
    this.modal(`
      <h3>💰 Tabla de comisiones</h3>
      <div class="hint">Comisión por par según referencia + lista. Si el cliente es ⭐ recomendado por GPJR se usan <b>NC rec</b> + <b>GPJR</b>.</div>
      <div style="overflow:auto;margin:8px 0"><table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:#f4f6fb"><th style="text-align:left;padding:5px">Ref</th><th style="text-align:left;padding:5px">Lista</th><th style="text-align:right;padding:5px">NC</th><th style="text-align:right;padding:5px">NC rec</th><th style="text-align:right;padding:5px">GPJR</th><th></th></tr></thead>
        <tbody>${rows.length?rows.map(r=>`<tr><td style="padding:5px">${esc(r.referencia)}</td><td style="padding:5px">${esc(r.lista)}</td><td style="padding:5px;text-align:right">${m(r.valor_par_nc)}</td><td style="padding:5px;text-align:right">${m(r.valor_par_nc_rec)}</td><td style="padding:5px;text-align:right">${m(r.valor_par_gpjr)}</td><td style="padding:5px"><button class="btn-sm" style="background:#eef2ff;color:#3a48b3;padding:2px 7px" onclick="App.editCom('${r.id}')">✏️</button></td></tr>`).join(''):'<tr><td colspan="6" style="padding:8px;color:#8a93a6">Sin filas aún</td></tr>'}</tbody>
      </table></div>
      <div style="font-weight:700;font-size:13px;margin-top:10px">➕ Agregar / editar fila</div>
      <input type="hidden" id="com_id" value="">
      <div class="row2"><div><label>Referencia</label><input class="field" id="com_ref" value="701"></div>
        <div><label>Lista</label><select class="field" id="com_lista">${LISTAS.map(L=>`<option>${L}</option>`).join('')}</select></div></div>
      <div class="row2"><div><label>NC $/par</label><input class="field" id="com_nc" inputmode="numeric" value="1900"></div>
        <div><label>NC rec $/par</label><input class="field" id="com_ncr" inputmode="numeric" value="900"></div></div>
      <label>GPJR $/par (recomendado)</label><input class="field" id="com_gpjr" inputmode="numeric" value="1000">
      <button class="btn btn-main" onclick="App.guardarCom()">💾 Guardar fila</button>
      <button class="btn btn-ghost" onclick="App.cerrarModal()">Cerrar</button>
    `);
  },
  editCom(id){
    const r=(this._comRows||[]).find(x=>x.id===id); if(!r) return;
    const set=(i,vv)=>{ const el=$(i); if(el) el.value=vv; };
    set('com_id',r.id); set('com_ref',r.referencia); set('com_lista',r.lista); set('com_nc',r.valor_par_nc); set('com_ncr',r.valor_par_nc_rec); set('com_gpjr',r.valor_par_gpjr);
  },
  async guardarCom(){
    const num=i=>{ const el=$(i); return el?(+String(el.value).replace(/[^\d]/g,'')||0):0; };
    const body={referencia:($('com_ref').value.trim()||'701'),lista:$('com_lista').value,valor_par_nc:num('com_nc'),valor_par_nc_rec:num('com_ncr'),valor_par_gpjr:num('com_gpjr')};
    try{
      await fetch(this._SBU()+'/rest/v1/feroz_comisiones?on_conflict=referencia,lista',{method:'POST',headers:{apikey:this._SBK(),Authorization:'Bearer '+this._SBK(),'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(body)});
      this.toast('💰 Comisión guardada'); this.modalComisiones();
    }catch(e){ alert('Error: '+e.message); }
  },
  _filtrarCliFeroz(){
    const norm=s=>(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
    const i=$('cliq'); const q=norm(i&&i.value); const qd=q.replace(/\D/g,''); let n=0;
    document.querySelectorAll('#clilist .cli-row').forEach(row=>{
      const t=norm(row.textContent);
      const ok=(!q)||t.includes(q)||(qd.length>=3 && t.replace(/\D/g,'').includes(qd));
      row.style.display=ok?'':'none'; if(ok)n++;
    });
    const c=$('clicount'); if(c)c.textContent=n+' coinciden';
  },

  modalCliente(onSave, e){
    e = e || {};
    this._editClienteId = e.id || null;
    const v = s => esc(s||'');
    this.modal(`
      <h3>${e.id?'Editar cliente':'Nuevo cliente'}</h3><div class="hint">${e.id?'Modifica y guarda.':'Se guarda y queda disponible para cotizar.'}</div>
      ${e.id?'':`<div style="background:#f4f6fb;border-radius:10px;padding:10px;margin-bottom:12px">
        <label style="margin-top:0">🔎 ¿Ya está en tus bases? (empresas o distribuidores)</label>
        <div style="display:flex;gap:6px"><input class="field" id="cl_busca" placeholder="Nombre o celular…" style="flex:1" onkeydown="if(event.key==='Enter'){event.preventDefault();App.buscarEnBasesCliente();}"><button class="btn-sm" style="background:var(--negro);color:#fff;white-space:nowrap" onclick="App.buscarEnBasesCliente()">Buscar</button></div>
        <div id="cl_busres"></div>
      </div>`}
      <label>Nombre / Empresa *</label><input class="field" id="cl_nombre" value="${v(e.nombre)}">
      <div class="row2"><div><label>NIT / Cédula <span style="color:#9aa3b0;font-weight:400">(opcional · después)</span></label><input class="field" id="cl_nit" value="${v(e.nit)}"></div>
        <div><label>Celular 1 *</label><input class="field" id="cl_tel" inputmode="tel" value="${v(e.tel)}"></div></div>
      <div class="row2">
        <div><label>Tipo de pago</label><select class="field" id="cl_tipo"><option value="contado" ${e.tipo_pago!=='credito'?'selected':''}>Contado</option><option value="credito" ${e.tipo_pago==='credito'?'selected':''}>Crédito</option></select></div>
        <div><label>Clase</label><select class="field" id="cl_clase"><option value="empresa" ${e.clase!=='distribuidor'?'selected':''}>Empresa</option><option value="distribuidor" ${e.clase==='distribuidor'?'selected':''}>Distribuidor</option></select></div>
      </div>
      <div class="row2">
        <div><label>🎯 Calificación de lead (referido)</label><select class="field" id="cl_recom"><option value="no" ${(!e.recomendado&&!e.especial&&!e.no_contactar)?'selected':''}>👤 NC — yo le veo potencial</option><option value="si" ${(e.recomendado&&!e.especial&&!e.no_contactar)?'selected':''}>⭐ GPJR — me lo consiguió GPJR (paga comisión)</option><option value="especial" ${(e.especial&&!e.no_contactar)?'selected':''}>⭐⭐ Especial — me lo recomendaron (referido)</option><option value="grupo_perez" ${e.no_contactar?'selected':''}>🚫 Grupo Pérez — NO tocar</option></select></div>
        <div></div>
      </div>
      <div style="font-size:12px;font-weight:700;color:var(--naranja);margin-top:12px">📦 ENVÍO Y COBERTURA</div>
      <div class="row2"><div><label>Ciudad</label><input class="field" id="cl_ciudad" value="${v(e.ciudad)}" list="cl_ciu_dl" oninput="App._autoDeptoCliente()" placeholder="Escribe la ciudad"></div>
        <div><label>Departamento <small style="color:var(--suave)">(auto)</small></label><input class="field" id="cl_depto" value="${v(e.depto)}" placeholder="Se llena solo"></div></div>
      <datalist id="cl_ciu_dl">${this._geoCiudadesOptions()}</datalist>
      <div class="row2"><div><label>Barrio</label><input class="field" id="cl_barrio" value="${v(e.barrio)}"></div>
        <div><label>Dirección</label><input class="field" id="cl_dir" value="${v(e.direccion)}"></div></div>
      <label>Localidad / Comuna (para cobertura)</label><input class="field" id="cl_localidad" value="${v(e.localidad)}">
      <label>Correo</label><input class="field" id="cl_correo" inputmode="email" value="${v(e.correo)}">
      <div style="font-size:12px;font-weight:700;color:var(--naranja);margin-top:12px">👥 CONTACTOS DE OFICINA (hasta 2)</div>
      <div class="row2">
        <div><label>Contacto 1 (nombre)</label><input class="field" id="cl_cont1" value="${v(e.contacto1)}" placeholder="Quién contesta el Celular 1"></div>
        <div><label>Contacto 2 (nombre)</label><input class="field" id="cl_cont2" value="${v(e.contacto2)}"></div>
      </div>
      <label>Celular 2 (del contacto 2)</label><input class="field" id="cl_cel2" inputmode="tel" value="${v(e.cel2)}">
      <div style="font-size:12px;font-weight:700;color:var(--naranja);margin-top:12px">📦 QUIÉN RECIBE LOS PAQUETES <span style="font-weight:400;color:var(--suave)">(bodega/almacén, no oficina)</span></div>
      <div class="row2">
        <div><label>Nombre de quien recibe</label><input class="field" id="cl_cont_recibe" value="${v(e.contacto_recibe)}" placeholder="Encargado de bodega"></div>
        <div><label>Celular de quien recibe</label><input class="field" id="cl_cel_recibe" inputmode="tel" value="${v(e.cel_recibe)}"></div>
      </div>
      <label>📝 Notas / instrucciones de despacho</label><textarea class="field" id="cl_notas" style="min-height:54px" placeholder="Ej: recibe solo mañanas · dejar en portería · llamar antes">${v(e.notas)}</textarea>
      <div style="font-size:12px;font-weight:700;color:var(--naranja);margin-top:12px">💰 CONDICIONES DE COMISIONES</div>
      <div class="row2">
        <div><label>Referencia</label><input class="field" id="cl_ref" value="${v(e.referencia)||'701'}"></div>
        <div><label>Lista de precios</label><select class="field" id="cl_lista">${['Distribuidor','Empresa pequeña','Empresa mediana','Empresa grande'].map(L=>`<option ${e.lista_precio===L?'selected':''}>${L}</option>`).join('')}</select></div>
      </div>
      <div class="hint">La comisión por par sale de la 💰 <b>Tabla de comisiones</b> (referencia + lista). Default: NC $1.900 · si ⭐ Recomendado → NC $900 + GPJR $1.000.</div>
      <button class="btn btn-main" onclick="App.guardarCliente()">${e.id?'Guardar cambios':'Guardar cliente'}</button>
      <button class="btn btn-ghost" onclick="App.cerrarModal()">Cancelar</button>
    `);
    this._onSaveCliente = onSave;
  },
  async guardarCliente(){
    const nombre=$('cl_nombre').value.trim(), nit=$('cl_nit').value.trim(), tel=$('cl_tel').value.trim();
    const falta=[]; if(!nombre)falta.push('Nombre / Empresa'); if(!tel)falta.push('Celular 1 (el de arriba)');
    if(falta.length){ const el=$(!nombre?'cl_nombre':'cl_tel'); if(el){el.style.borderColor='var(--rojo)';el.scrollIntoView({block:'center'});el.focus();}
      alert('⚠️ Falta llenar: '+falta.join(' y ')+'.\n(El NIT es opcional — lo agregas después.)'); return; }
    const numOr=(id)=>{ const el=$(id); if(!el||!el.value) return null; const n=+String(el.value).replace(/[^\d]/g,''); return isNaN(n)?null:n; };
    const base={nombre,nit,tel,tipo_pago:$('cl_tipo').value,clase:($('cl_clase')?$('cl_clase').value:'empresa'),
      depto:$('cl_depto').value.trim(),ciudad:$('cl_ciudad').value.trim(),barrio:$('cl_barrio').value.trim(),
      direccion:$('cl_dir').value.trim(),localidad:($('cl_localidad')?$('cl_localidad').value.trim():''),
      correo:$('cl_correo').value.trim(),
      contacto1:($('cl_cont1')?$('cl_cont1').value.trim():''),
      contacto2:($('cl_cont2')?$('cl_cont2').value.trim():''),
      cel2:($('cl_cel2')?$('cl_cel2').value.trim():''),
      contacto_recibe:($('cl_cont_recibe')?$('cl_cont_recibe').value.trim():''),
      cel_recibe:($('cl_cel_recibe')?$('cl_cel_recibe').value.trim():''),
      notas:($('cl_notas')?$('cl_notas').value.trim():''),
      referencia:($('cl_ref')?$('cl_ref').value.trim():'701'),
      lista_precio:($('cl_lista')?$('cl_lista').value:'Distribuidor'),
      recomendado:($('cl_recom')?($('cl_recom').value==='si'||$('cl_recom').value==='especial'):false),
      especial:($('cl_recom')?$('cl_recom').value==='especial':false),
      no_contactar:($('cl_recom')?$('cl_recom').value==='grupo_perez':false)};
    if(this._editClienteId){
      const id=this._editClienteId;
      const { error } = await this.sb.from('clientes').update(base).eq('id', id);
      if(error){ alert('Error: '+error.message); return; }
      // PROPAGAR el cambio a TODO lo que tenga la "foto" de este cliente (cotizaciones y pedidos)
      try{
        const { data:cliFull } = await this.sb.from('clientes').select('*').eq('id',id).single();
        const snap = cliFull || Object.assign({id}, base);
        await this.sb.from('cotizaciones').update({cliente_snap:snap}).eq('cliente_id',id);
        await this.sb.from('pedidos').update({cliente_snap:snap}).eq('cliente_id',id);
      }catch(err){ console.log('propagar cliente_snap',err); }
      this._editClienteId=null; this.cerrarModal(); this.toast('Cliente actualizado en todo (clientes, cotizaciones y pedidos) ✅');
      if(this._onSaveCliente){ const f=this._onSaveCliente; this._onSaveCliente=null; f(); } else this.go('clientes');
      return;
    }
    const dup=await this._clienteDuplicado(tel, nit);
    if(dup && confirm(`⚠️ Ya existe "${dup.nombre}" con ese mismo teléfono/NIT.\n\nAceptar = usar el existente (no duplicar).\nCancelar = crear de todos modos.`)){
      this.cerrarModal();
      if(this._onSaveCliente){ this._onSaveCliente(dup); this._onSaveCliente=null; } else this.go('clientes');
      return;
    }
    const { data, error } = await this.sb.from('clientes').insert({...base, creado_por:this.user.id}).select().single();
    if(error){ alert('Error: '+error.message); return; }
    this.cerrarModal();
    if(this._onSaveCliente){ this._onSaveCliente(data); this._onSaveCliente=null; }
    else this.go('clientes');
  },
  editarCliente(id){
    const c=(this._cliCache||[]).find(x=>x.id===id);
    if(c) this.modalCliente(null, c);
  },

  /* ---------- COTIZACIONES ---------- */
  async vCotizaciones(){
    this.loading();
    const { data:cots=[] } = await this.sb.from('cotizaciones').select('*').order('creado_en',{ascending:false}).limit(200);
    const enCot=cots.filter(c=>c.estado==='cotizada');
    const sumCot=enCot.reduce((a,c)=>a+(+c.total||0),0);
    const nContact=enCot.filter(c=>c.contactado).length;
    this.set(`
      <h1>Cotizaciones</h1><div class="sub">${cots.length} guardadas</div>
      <div class="kpis">
        <div class="kpi naranja"><b>${enCot.length}</b><span>📋 En cotización</span></div>
        <div class="kpi"><b>${money(sumCot)}</b><span>💰 Valor en cotización</span></div>
        <div class="kpi verde"><b>${nContact}/${enCot.length||0}</b><span>🟢 Contactados</span></div>
      </div>
      <button class="btn btn-main" style="margin-bottom:14px" onclick="App.go('cotizacionNueva')">+ Nueva cotización</button>
      ${cots.length?cots.map(c=>{const cl=c.cliente_snap||{};return `
        <div class="item"><div class="top"><div>
          <div class="nom">${esc(cl.nombre||'Cliente')} ${c.es_muestra?'<span class="badge b-cotizada">MUESTRA</span>':''}</div>
          <div class="meta">${esc(c.numero||'')}${(cl.tel||cl.cel2)?' · 📱 '+esc(cl.tel||cl.cel2):''} · ${c.es_muestra?esc(c.detalle||'muestra'):(c.pares+' pares ('+c.cajas+' cajas)')} · ${new Date(c.creado_en).toLocaleDateString('es-CO')}</div>
        </div><div style="text-align:right"><div class="tot">${money(c.total)}</div>
          <span class="badge b-${c.estado}">${c.estado}</span></div></div>
        <div class="acciones-item" style="align-items:center;gap:8px;flex-wrap:wrap">
          <button class="btn-sm" style="background:var(--naranja);color:#fff" onclick="App.proforma(${c.id})">🧾 Proforma</button>
          <button class="btn-sm" style="background:#6b7280;color:#fff" onclick="App.vCotizacionNueva(${c.id})">✏️ Editar</button>
          ${c.estado==='cotizada'&&this.puede('admin','vendedor')?`<button class="btn-sm" style="background:var(--verde);color:#fff" onclick="App.cotizarAPedido(${c.id})">✓ Convertir en pedido</button>
          <button class="btn-sm" style="background:#fde8e8;color:#b3261e" onclick="App.cotFAnular(${c.id})">❌ Anular</button>`:''}
          <span style="font-size:12.5px;color:#667;margin-left:auto">¿Contactado?</span>
          <span onclick="App.cotFContacto(${c.id})" title="Marca que ya lo contacté" style="cursor:pointer;display:inline-block;width:18px;height:18px;border-radius:50%;border:2px solid #16a34a;background:${c.contactado?'#16a34a':'#fff'}"></span>
        </div></div>`}).join(''):'<div class="empty">Aún no hay cotizaciones.</div>'}
    `);
  },
  async cotFContacto(id){
    const { data:c } = await this.sb.from('cotizaciones').select('contactado').eq('id',id).single();
    await this.sb.from('cotizaciones').update({contactado:!(c&&c.contactado)}).eq('id',id);
    this.vCotizaciones();
  },
  async cotFAnular(id){
    if(!confirm('¿Anular esta cotización? No se podrá convertir en pedido.')) return;
    const { error } = await this.sb.from('cotizaciones').update({estado:'anulada'}).eq('id',id);
    if(error){ alert('Error: '+error.message); return; }
    this._toast('Cotización anulada'); this.vCotizaciones();
  },
  _proformaFlete(c){
    const pares=+c.pares||0;
    if(c.es_muestra && (c.muestra_tipo==='pie'||c.muestra_tipo==='parsv')) return {lbl:'Envío gratis',val:0};
    if(c.es_muestra && c.muestra_tipo==='par'){ const v=(+c.flete)||Math.ceil(pares/(C.MUESTRA_FLETE_PARES||3))*(C.MUESTRA_FLETE||22000); return {lbl:money(v),val:v}; }
    const cajas=(+c.cajas)||(pares/C.PARES_CAJA);
    return cajas>=C.MIN_CAJAS_SIN_FLETE ? {lbl:'Incluido (gratis)',val:0} : {lbl:'Al cobro (transportadora que elija)',val:0};
  },
  async proforma(id){
    const { data:c } = await this.sb.from('cotizaciones').select('*').eq('id',id).single();
    if(!c){ alert('No se encontró la cotización.'); return; }
    const w=window.open('','_blank','width=860,height=920');
    if(!w){ alert('Permite las ventanas emergentes para ver/imprimir la proforma.'); return; }
    w.document.write(this._proformaHTML(c)); w.document.close();
  },
  _proformaHTML(c){
    const cl=c.cliente_snap||{};
    const pares=+c.pares||0, sub=+c.subtotal||0, iva=+c.iva||0, tot=+c.total||0;
    const fl=this._proformaFlete(c);
    const concepto = c.es_muestra ? (c.muestra_tipo==='pie'?'Muestra de pie (sin valor comercial)':(c.muestra_tipo==='parsv'?'Muestra de par completo (sin valor comercial)':'Muestra de par completo')) : ('Bota dotación Ref. '+(c.referencia||'701'));
    const ppar = c.muestra_tipo==='parsv'?0:((+c.precio_par) || (c.es_muestra?(c.muestra_tipo==='par'?C.MUESTRA_PAR:0):C.PRECIO_PAR));
    const curva=c.curva||{}; const tallas=Object.keys(curva).sort((a,b)=>a-b);
    const tallasRows = tallas.length ? tallas.map(t=>`<tr><td>Talla ${t}</td><td style="text-align:right">${curva[t]} par(es)</td></tr>`).join('') : '';
    const fecha=new Date(c.creado_en||Date.now()).toLocaleDateString('es-CO');
    const dir=[cl.direccion,cl.barrio,cl.ciudad,cl.depto].filter(Boolean).join(', ');
    const txt=[`*PROFORMA ${c.numero||''}* - INDUSTRIAS FEROZ SAS`,`Cliente: ${cl.nombre||''}${cl.nit?' NIT '+cl.nit:''}`,`${concepto} - ${pares} par(es)`];
    if(sub) txt.push(`Subtotal: ${money(sub)}`); if(iva) txt.push(`IVA: ${money(iva)}`);
    txt.push(`Transporte: ${fl.lbl}`,`TOTAL: ${money(tot)}`,'',`Para confirmar consigna en:`,C.CUENTA);
    const wa=(cl.tel?('https://wa.me/57'+String(cl.tel).replace(/\D/g,'')):'https://wa.me/')+'?text='+encodeURIComponent(txt.join('\n'));
    return `<!doctype html><html><head><meta charset="utf-8"><title>Proforma ${esc(c.numero||'')}</title>
    <style>*{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif}body{margin:0;padding:24px;color:#1a1a1a;background:#f3f4f6}
    .pf{max-width:720px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)}
    .hd{background:#E8620C;color:#fff;padding:20px 26px;display:flex;justify-content:space-between;align-items:flex-start}
    .hd h1{margin:0;font-size:26px;letter-spacing:1px}.hd .sub{font-size:12px;opacity:.95;margin-top:3px}
    .pf-body{padding:22px 26px}.box{font-size:13px;line-height:1.5;margin-bottom:14px}.box b{color:#E8620C}
    table{width:100%;border-collapse:collapse;font-size:13px;margin:10px 0}th,td{padding:8px 10px;border-bottom:1px solid #eee;text-align:left}th{background:#faf7f4;font-size:12px}
    .tot{margin-top:8px}.tot table td{border:none;padding:4px 10px}.tot .big{font-size:20px;font-weight:800;color:#E8620C}
    .cuenta{margin-top:16px;background:#f0fff6;border:1.5px solid #16a34a;border-radius:8px;padding:12px 14px;font-size:13px}
    .acts{padding:0 26px 24px;display:flex;gap:10px}.acts a,.acts button{flex:1;text-align:center;padding:12px;border-radius:8px;border:none;font-weight:700;font-size:14px;cursor:pointer;text-decoration:none}
    .b1{background:#111;color:#fff}.b2{background:#25D366;color:#fff}@media print{body{background:#fff;padding:0}.acts{display:none}.pf{box-shadow:none}}</style></head><body>
      <div class="pf">
        <div class="hd"><div><h1>FEROZ</h1><div class="sub">INDUSTRIAS FEROZ SAS · NIT 902.072.014</div></div>
          <div style="text-align:right"><div style="font-size:18px;font-weight:800">PROFORMA</div><div class="sub">${esc(c.numero||'')}</div><div class="sub">${fecha}</div></div></div>
        <div class="pf-body">
          <div class="box"><b>Cliente:</b> ${esc(cl.nombre||'—')}${cl.nit?` · NIT/CC ${esc(cl.nit)}`:''}${cl.tel?`<br><b>Tel:</b> ${esc(cl.tel)}`:''}${dir?`<br><b>Entrega:</b> ${esc(dir)}`:''}</div>
          <table><thead><tr><th>Concepto</th><th style="text-align:right">Pares</th><th style="text-align:right">Precio/par</th><th style="text-align:right">Subtotal</th></tr></thead>
            <tbody><tr><td>${esc(concepto)}</td><td style="text-align:right">${pares}</td><td style="text-align:right">${ppar?money(ppar):'—'}</td><td style="text-align:right">${money(sub)}</td></tr></tbody></table>
          ${tallasRows?`<table><thead><tr><th>Distribución por talla</th><th style="text-align:right">Cantidad</th></tr></thead><tbody>${tallasRows}</tbody></table>`:''}
          <div class="tot"><table>
            <tr><td>Subtotal</td><td style="text-align:right">${money(sub)}</td></tr>
            <tr><td>IVA (19%)</td><td style="text-align:right">${money(iva)}</td></tr>
            <tr><td>🚚 Transporte</td><td style="text-align:right">${fl.val?money(fl.val):esc(fl.lbl)}</td></tr>
            <tr><td class="big">TOTAL</td><td style="text-align:right" class="big">${money(tot)}</td></tr></table></div>
          <div class="cuenta"><b>💳 Para confirmar tu pedido, consigna en:</b><br>${esc(C.CUENTA)}<br><span style="color:#16a34a">Envía el comprobante por WhatsApp y lo despachamos.</span></div>
        </div>
        <div class="acts"><button class="b1" onclick="window.print()">🖨️ Imprimir / PDF</button><a class="b2" href="${wa}" target="_blank">📱 Enviar por WhatsApp</a></div>
      </div>
    </body></html>`;
  },

  async vCotizacionNueva(editId){
    this.loading();
    this._editCotId = editId||null;
    const { data:cli=[] } = await this.sb.from('clientes').select('id,nombre,nit,tel,depto,ciudad,barrio,direccion,correo,tipo_pago,clase,referencia,lista_precio,valor_par_nc,valor_par_gpjr,recomendado').order('nombre');
    this.set(`
      <h1>${editId?'✏️ Editar':'Nueva'} cotización</h1><div class="sub">Bota Ref. 701 · ${money(C.PRECIO_PAR)}/par + IVA</div>
      <div class="card">
        <label>Cliente *</label>
        <select class="field" id="co_cliente">
          <option value="">— Selecciona —</option>
          ${cli.map(c=>`<option value="${c.id}">${esc(c.nombre)} (${esc(c.nit||'')})</option>`).join('')}
        </select>
        <button class="btn-sm" style="background:var(--negro);color:#fff;margin-top:8px" onclick="App.nuevoClienteDesdeCot()">+ Cliente nuevo</button>
      </div>
      <div class="card" style="border:1.5px dashed var(--naranja)">
        <label style="margin:0"><b>🎁 ¿Cotizar una muestra?</b></label>
        <select class="field" id="co_muestra_tipo" onchange="App.toggleCotMuestra()" style="margin-top:6px">
          <option value="">No — cotización normal (curva)</option>
          <option value="par">Muestra PAR — ${money(C.MUESTRA_PAR)}/par + IVA + transporte ${money(C.MUESTRA_FLETE||22000)}</option>
          <option value="parsv">Muestra PAR — SIN valor comercial (regalo, no se cobra)</option>
          <option value="pie">Muestra DE PIE — sin valor comercial · envío gratis</option>
          <option value="svc">Muestras SIN valor comercial (varias tallas) — sin precio</option>
          <option value="vendedor">👔 Muestra de VENDEDOR (equipo) — sin valor · se procesa como pedido</option>
        </select>
        <div class="hint" style="margin-top:6px" id="co_muestra_hint">La muestra usa las tallas de abajo (sin la regla de 16 pares por caja).</div>
        <div id="co_asesor_wrap" style="display:none;margin-top:8px"><label style="font-size:12px;color:#667">Nombre del vendedor/asesor *</label><input class="field" id="co_asesor" placeholder="Ej: Juan Pérez — equipo comercial"></div>
      </div>
      <div class="card" id="co_curva_card">
        <label>Arma la curva — pares por talla</label>
        <div class="hint">Cada caja se completa con ${C.PARES_CAJA} pares.</div>
        <label style="display:flex;align-items:center;gap:8px;font-weight:700;margin:9px 0;cursor:pointer;color:var(--naranja);background:#fff4ec;border:1px solid var(--naranja);border-radius:9px;padding:9px 11px">
          <input type="checkbox" id="co_libre" onchange="App.curva()" style="width:18px;height:18px;accent-color:var(--naranja)">
          📦 Fuera de patrón de cajas (pares sueltos, sin completar cajas)
        </label>
        <div class="grid-tallas" id="co_grid"></div>
        <div class="estado" id="co_estado">
          <div class="ec-nums">
            <div class="ec-item"><b id="ec_cajas">0</b><span>cajas completas</span></div>
            <div class="ec-item"><b id="ec_pares">0</b><span>pares en total</span></div>
          </div>
          <div class="ec-falta" id="ec_falta">👆 Empieza a sumar pares</div>
        </div>
      </div>
      <div class="card" id="co_pie_box" style="display:none">
        <label>🎁 Muestra de pie (nono) — sin valor comercial</label>
        <div class="hint">Es un zapato suelto de muestra. No necesita curva de tallas.</div>
        <div style="display:flex;gap:10px;margin-top:8px">
          <div style="flex:1"><label style="font-size:12px;color:#667">Talla (opcional)</label><select class="field" id="co_pie_talla"><option value="">—</option>${C.TALLAS.map(t=>`<option value="${t}">Talla ${t}</option>`).join('')}</select></div>
          <div style="flex:1"><label style="font-size:12px;color:#667">Cantidad de nonos</label><input class="field" type="number" id="co_pie_cant" value="1" min="1" inputmode="numeric"></div>
        </div>
      </div>
      <div class="card" style="border:1.5px solid var(--naranja)"><label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin:0"><input type="checkbox" id="co_iva" checked style="width:18px;height:18px;accent-color:var(--naranja)"> <b>Incluir IVA (19%)</b> en la cotización</label>
        <div class="hint">Si lo desmarcas, la cotización queda SIN IVA (solo el valor de los pares + flete).</div></div>
      <button class="btn btn-main" onclick="App.guardarCotizacion()">${editId?'💾 Guardar cambios':'Guardar cotización'}</button>
    `);
    this._clientes = cli;
    $('co_grid').innerHTML = C.TALLAS.map(t=>`<div class="t"><span>Talla ${t}</span><input type="number" min="0" inputmode="numeric" data-talla="${t}" oninput="App.curva()"></div>`).join('');
    this.curva();
    if(editId){
      const { data:ec } = await this.sb.from('cotizaciones').select('*').eq('id',editId).single();
      if(ec){ this._editCot=ec;
        const s=$('co_cliente'); if(s) s.value=ec.cliente_id;
        const mt=$('co_muestra_tipo'); if(mt) mt.value=ec.es_muestra?(ec.muestra_tipo==='pie'?'pie':(ec.muestra_tipo==='nono'?'svc':'par')):'';
        const ci=$('co_iva'); if(ci) ci.checked=(+ec.iva>0);
        const cv=ec.curva||{}; document.querySelectorAll('#co_grid input').forEach(i=>{ const t=i.dataset.talla; if(cv[t]!=null) i.value=cv[t]; });
        if(ec.muestra_tipo==='pie'){ const ks=Object.keys(cv); const pc=$('co_pie_cant'); if(pc) pc.value=ec.pares||1; const pt=$('co_pie_talla'); if(pt&&ks[0]) pt.value=ks[0]; }
        this.toggleCotMuestra(); this.curva();
      }
    }
  },
  async _saveCot(reg){
    if(this._editCotId){ const { error } = await this.sb.from('cotizaciones').update(reg).eq('id',this._editCotId); return error; }
    const { error } = await this.sb.from('cotizaciones').insert(reg); return error;
  },
  nuevoClienteDesdeCot(){
    this.modalCliente(c=>{ this._clientes.push(c); const s=$('co_cliente');
      const o=document.createElement('option'); o.value=c.id; o.textContent=`${c.nombre} (${c.nit||''})`; o.selected=true; s.appendChild(o); });
  },
  curva(){
    let pares=0; const t={};
    document.querySelectorAll('#co_grid input').forEach(i=>{const q=+i.value||0; if(q>0){pares+=q; t[i.dataset.talla]=q;}});
    const libre = !!($('co_libre') && $('co_libre').checked);
    const cajas=Math.floor(pares/C.PARES_CAJA), resto=pares%C.PARES_CAJA, faltan=resto?C.PARES_CAJA-resto:0;
    $('ec_cajas').textContent=cajas; $('ec_pares').textContent=pares;
    const f=$('ec_falta'); f.className='ec-falta';
    if(pares===0) f.textContent='👆 Empieza a sumar pares';
    else if(libre){ f.classList.add('ok'); f.innerHTML=`📦 Fuera de patrón: <b>${pares}</b> par(es) sueltos${cajas?` (${cajas} caja${cajas===1?'':'s'} + ${resto} suelto${resto===1?'':'s'})`:''}`; }
    else if(faltan===0){ f.classList.add('ok'); f.innerHTML=`✔️ Curva exacta: ${cajas} caja(s) · ${pares} pares`; }
    else { f.classList.add('falta'); f.innerHTML=`Faltan <b>${faltan}</b> par(es) para la caja N° ${cajas+1}`; }
    this._curva={pares,cajas,resto,faltan,tallas:t,libre};
    return this._curva;
  },
  toggleCotMuestra(){ const v=$('co_muestra_tipo')&&$('co_muestra_tipo').value; const esPie=(v==='pie');
    const grid=$('co_curva_card'), pie=$('co_pie_box');
    if(grid) grid.style.display = esPie ? 'none' : 'block';   // DE PIE no usa grilla
    if(pie)  pie.style.display  = esPie ? 'block' : 'none';
    const aw=$('co_asesor_wrap'); if(aw) aw.style.display=(v==='vendedor')?'block':'none';
    const lbl=document.querySelector('#co_curva_card label'); if(lbl) lbl.textContent = v ? 'Tallas de la muestra — pares por talla' : 'Arma la curva — pares por talla';
    const h=$('co_muestra_hint'); if(h){ h.style.display = (v && !esPie) ? 'block' : 'none'; } },
  async guardarCotizacion(){
    const cid=$('co_cliente').value;
    const tipoMv=$('co_muestra_tipo')?$('co_muestra_tipo').value:'';
    const asesorV=(($('co_asesor')||{}).value||'').trim();
    if(tipoMv==='vendedor'){ if(!asesorV){ alert('Escribe el nombre del vendedor/asesor.'); return; } }
    else if(!cid){ alert('Selecciona un cliente.'); return; }
    const cl=this._clientes.find(c=>c.id==cid) || (tipoMv==='vendedor'?{nombre:'👔 '+asesorV+' (vendedor)',tipo_pago:'contado'}:null);
    const dM=new Date(), editing=!!this._editCotId;
    const num = (editing&&this._editCot&&this._editCot.numero) ? this._editCot.numero : ('COT-'+dM.getFullYear()+('0'+(dM.getMonth()+1)).slice(-2)+('0'+dM.getDate()).slice(-2)+'-'+('0'+dM.getHours()).slice(-2)+('0'+dM.getMinutes()).slice(-2)+('0'+dM.getSeconds()).slice(-2));
    // MUESTRA: PAR ($40.900 + IVA + transporte $22.000, se cobra) o DE PIE (sin valor comercial, envío gratis).
    const tipoM=$('co_muestra_tipo')?$('co_muestra_tipo').value:'';
    if(tipoM){
      const esPie=(tipoM==='pie'), esSVC=(tipoM==='svc'), esVend=(tipoM==='vendedor'), esParSV=(tipoM==='parsv'), sinValor=(esPie||esSVC||esVend||esParSV);
      let cu;
      if(esPie){   // muestra de pie (nono): no grilla; talla opcional + cantidad de nonos
        const talla=$('co_pie_talla')?$('co_pie_talla').value:''; const cant=Math.max(1,Math.floor(+(($('co_pie_cant')||{}).value)||1));
        cu={pares:cant, tallas: talla?{[talla]:cant}:{}, cajas:0,resto:0,faltan:0};
      } else {
        cu=this.curva();
        if(cu.pares<1){ alert('Pon las tallas/pares de la muestra en la grilla.'); return; }
      }
      const conIvaM=(($('co_iva')||{checked:true}).checked);
      const sub=sinValor?0:C.MUESTRA_PAR*cu.pares, iva=(sinValor?0:(conIvaM?Math.round(sub*C.IVA):0)), flete=sinValor?0:Math.ceil(cu.pares/(C.MUESTRA_FLETE_PARES||3))*(C.MUESTRA_FLETE||22000), total=sub+iva+flete;
      const partes=Object.keys(cu.tallas).length ? Object.keys(cu.tallas).sort((a,b)=>a-b).map(t=>`T${t}×${cu.tallas[t]}`).join(', ') : `${cu.pares} nono(s)`;
      const reg={numero:num,cliente_id:cid||null,cliente_snap:cl,es_muestra:true,muestra_tipo:esPie?'pie':(esParSV?'parsv':((esSVC||esVend)?'nono':'par')),flete,
        detalle:esPie?`Muestra de pie · sin valor comercial · ${partes}`:(esParSV?`Muestra PAR · SIN valor comercial (regalo) · ${cu.pares} par(es) · ${partes}`:(esVend?`Muestra de VENDEDOR (${asesorV}) · sin valor comercial · ${cu.pares} par(es) · ${partes}`:(esSVC?`Muestras SIN valor comercial · ${cu.pares} par(es) · ${partes}`:`Muestra par · ${cu.pares} × ${money(C.MUESTRA_PAR)} = ${money(sub)} + IVA ${money(iva)} + 🚚 transporte ${money(flete)} (aparte) · ${partes}`))),
        pares:cu.pares,cajas:0,resto:0,curva:cu.tallas,precio_par:sinValor?0:C.MUESTRA_PAR,subtotal:sub,iva,total,flete_al_cobro:false,estado:'cotizada',
        interno:esVend,asesor:esVend?asesorV:null,
        vendedor_id:this.user.id,referencia:(cl&&cl.referencia)||'701',recomendado:!!(cl&&cl.recomendado),comision_nc:0,comision_gpjr:0};
      const error=await this._saveCot(reg);
      if(error){ alert('Error: '+error.message); return; }
      await this._avanzarEmbudo(cid,'muestra');   // aparece en CRM → Prospectos con la gestión
      const we=editing; this._editCotId=null; this._editCot=null;
      alert('✅ Cotización de MUESTRA '+(sinValor?'SIN VALOR COMERCIAL':`PAR (${money(total)})`)+' · '+cu.pares+` par(es): ${num}`+(we?' (actualizada)':''));
      this.go('cotizaciones'); return;
    }
    const cu=this.curva();
    if(cu.pares<1){ alert('Arma la curva (pares por talla) o marca 🎁 Cotizar MUESTRA.'); return; }
    if(!cu.libre && cu.faltan!==0 && !confirm(`Falta(n) ${cu.faltan} par(es) para completar la última caja. ¿Guardar igual?`)) return;
    const conIva=(($('co_iva')||{checked:true}).checked);
    const subtotal=cu.pares*C.PRECIO_PAR, iva=conIva?Math.round(subtotal*C.IVA):0, total=subtotal+iva;
    // comisión por par desde la TABLA feroz_comisiones (ref+lista). Default global: NC $1.900 · si recomendado NC $900 + GPJR $1.000
    let rate=null;
    try{ const {data}=await this.sb.from('feroz_comisiones').select('*').eq('referencia',(cl.referencia||'701')).eq('lista',(cl.lista_precio||'Distribuidor')).maybeSingle(); rate=data; }catch(e){}
    const vNC  = cl.recomendado ? (rate?+rate.valor_par_nc_rec:900)  : (rate?+rate.valor_par_nc:1900);
    const vGPJR= cl.recomendado ? (rate?+rate.valor_par_gpjr:1000) : 0;
    const comNC=vNC*cu.pares, comGPJR=vGPJR*cu.pares;
    const reg={numero:num,cliente_id:cid,cliente_snap:cl,curva:cu.tallas,pares:cu.pares,cajas:cu.cajas,resto:cu.resto,
      precio_par:C.PRECIO_PAR,subtotal,iva,total,flete_al_cobro:cu.cajas<C.MIN_CAJAS_SIN_FLETE,estado:'cotizada',vendedor_id:this.user.id,
      referencia:cl.referencia||'701',valor_par_nc:vNC,valor_par_gpjr:vGPJR,recomendado:!!cl.recomendado,comision_nc:comNC,comision_gpjr:comGPJR};
    const error=await this._saveCot(reg);
    if(error){ alert('Error: '+error.message); return; }
    await this._avanzarEmbudo(cid,'interesado');   // aparece en CRM → Prospectos con la gestión
    const we=editing; this._editCotId=null; this._editCot=null;
    alert('✅ Cotización '+(we?'actualizada':'guardada')+': '+num+'\nTotal '+money(total));
    this.go('cotizaciones');
  },

  async cotizarAPedido(cotId){
    if(!confirm('¿Convertir esta cotización en un PEDIDO? Quedará pendiente de pago.')) return;
    const { data:c } = await this.sb.from('cotizaciones').select('*').eq('id',cotId).single();
    const cl=c.cliente_snap||{};
    const d=new Date(), num='PED-'+d.getFullYear()+('0'+(d.getMonth()+1)).slice(-2)+('0'+d.getDate()).slice(-2)+'-'+('0'+d.getHours()).slice(-2)+('0'+d.getMinutes()).slice(-2)+('0'+d.getSeconds()).slice(-2);
    const { data:ped, error } = await this.sb.from('pedidos').insert({
      numero:num, cotizacion_id:c.id, cliente_id:c.cliente_id, cliente_snap:cl, curva:c.curva,
      pares:c.pares, total:c.total, tipo_pago:cl.tipo_pago||'contado', estado:(+c.total||0)>0?'pendiente_pago':'autorizado',
      referencia:c.referencia||null, valor_par_nc:c.valor_par_nc||null, valor_par_gpjr:c.valor_par_gpjr||null,
      recomendado:!!c.recomendado, comision_nc:c.comision_nc||0, comision_gpjr:c.comision_gpjr||0,
      es_muestra:c.es_muestra||false, detalle:c.detalle||null, interno:c.interno||false, asesor:c.asesor||null
    }).select().single();
    if(error){ alert('Error: '+error.message); return; }
    await this.sb.from('cotizaciones').update({estado:'aceptada'}).eq('id',c.id);
    await this._avanzarEmbudo(c.cliente_id, c.es_muestra?'muestra':'cliente');   // muestra NO vuelve cliente (sigue en CRM); solo un pedido REAL lo convierte
    await this.hist(ped.id,'pendiente_pago','Pedido creado desde cotización '+c.numero);
    alert('✅ Pedido creado: '+num);
    this.go(this.view);
  },

  /* ---------- AUTOPEDIDO: los que el cliente arma solo en el portal ---------- */
  async vAutoPedidos(){
    clearTimeout(this._apTimer);
    const { data:cots=[] } = await this.sb.from('cotizaciones').select('*').eq('origen','autopedido').eq('estado','cotizada').order('creado_en',{ascending:false}).limit(100);
    this.set(`
      <h1>🛒 Autopedidos <span style="font-size:11px;color:var(--verde);font-weight:400">● en vivo</span></h1><div class="sub">${cots.length} pedido(s) que los clientes armaron solos · se actualiza solo cada 20s</div>
      <div class="card" style="border-left:4px solid var(--naranja)"><div style="font-size:12px;color:#667">El cliente entra a <b>mv.ferozsafetywear.com</b> con su NIT + nombre, ve el inventario real, arma su pedido y firma la proforma → cae aquí. Tú lo revisas, hablas con el cliente y <b>"Aprobar → Pedido"</b> lo manda al flujo normal (Pedidos → Despachos).</div></div>
      ${cots.length?cots.map(c=>{ const cl=c.cliente_snap||{}; const f=new Date(c.creado_en).toLocaleString('es-CO');
        const tallas=c.curva&&typeof c.curva==='object'?Object.keys(c.curva).sort((a,b)=>a-b).map(t=>`T${t}×${c.curva[t]}`).join(' · '):'';
        return `<div class="item"><div class="top"><div><div class="nom">${esc(cl.nombre||'Cliente')}</div>
            <div class="meta">${esc(c.numero||'')} · <b>${c.pares||0} pares</b> · 📅 ${esc(f)}${cl.tel?' · 📱 '+esc(cl.tel):''}${cl.ciudad?' · '+esc(cl.ciudad):''}</div>
            ${tallas?`<div class="meta">👟 ${esc(tallas)}</div>`:''}</div>
          <div class="tot">${money(+c.total||0)}</div></div>
          <div class="acciones-item">
            <button class="btn-sm" style="background:var(--verde);color:#fff" onclick="App.cotizarAPedido(${c.id})">✓ Aprobar → Pedido</button>
            <button class="btn-sm btn-ghost" style="border:1px solid var(--linea)" onclick="App.vCotizacionNueva(${c.id})">✏️ Ver / ajustar</button>
            <button class="btn-sm" style="background:#fff;color:var(--rojo);border:1px solid #f2c2c2" onclick="App.cotFAnular(${c.id})">❌ Descartar</button>
          </div></div>`; }).join('') : '<div class="empty">Aún no hay autopedidos. Cuando un cliente arme su pedido en el portal, aparece aquí.</div>'}
    `);
    this._apTimer=setTimeout(()=>{ if(this.view==='autopedido') this.vAutoPedidos(); }, 20000);
  },
  async vAutoPedidosSmart(){
    clearTimeout(this._apTimer);
    const H={apikey:this._SBK(),Authorization:'Bearer '+this._SBK()};
    let cots=[]; try{ const r=await fetch(this._SBU()+'/rest/v1/nc_cotizaciones?empresa=eq.smart&origen=eq.autopedido&order=creado_en.desc&limit=100',{headers:H}); const j=await r.json(); cots=Array.isArray(j)?j:[]; }catch(e){}
    this.set(`
      <h1>🛒 Autopedidos <span style="font-size:11px;color:var(--verde);font-weight:400">● en vivo</span></h1><div class="sub">${cots.length} pedido(s) que los clientes armaron solos en el portal de Smart · se actualiza cada 20s</div>
      <div class="card" style="border-left:4px solid var(--naranja)"><div style="font-size:12px;color:#667">El cliente entra al portal de Smart con su NIT + nombre, ve los envases con foto y disponibilidad, arma su pedido y aquí caen. Contáctalo y confírmalo.</div></div>
      ${cots.length?cots.map(c=>{ const d=c.datos||{}; const f=new Date(c.creado_en).toLocaleString('es-CO'); const tel=(c.celular||'').replace(/\D/g,'');
        const prods=(d.productos||[]).map(p=>esc(p.n)+'×'+(p.qty||0)).join(' · ');
        return `<div class="item"><div class="top"><div><div class="nom">${esc(c.cliente||'Cliente')}</div>
            <div class="meta">${esc(c.folio||'')} · <b>${(d.unidades||0).toLocaleString('es-CO')} und</b> · 📅 ${esc(f)}${c.celular?' · 📱 '+esc(c.celular):''}</div>
            ${prods?`<div class="meta">📦 ${prods}</div>`:''}</div><div class="tot">${money(+c.total||0)}</div></div>
          <div class="acciones-item">${tel?`<button class="btn-sm" style="background:#25D366;color:#fff" onclick="window.open('https://wa.me/57${tel}','_blank')">📲 Contactar</button>`:''}</div></div>`; }).join('') : '<div class="empty">Aún no hay autopedidos de Smart. Cuando un cliente arme su pedido en el portal, aparece aquí.</div>'}
    `);
    this._apTimer=setTimeout(()=>{ if(this.view==='autopedido') this.vAutoPedidosSmart(); }, 20000);
  },

  /* ---------- PEDIDOS (el ciclo) ---------- */
  async vPedidos(){
    this.loading();
    const { data:peds=[] } = await this.sb.from('pedidos').select('*').in('estado',['pendiente_pago','consignado']).order('creado_en',{ascending:false}).limit(150);
    const valorPed=peds.reduce((s,p)=>s+(+p.total||0),0);
    this.set(`
      <h1>📦 Pedidos</h1><div class="sub">${peds.length} por consignar/autorizar · toca uno para abrir</div>
      <div class="card" style="background:linear-gradient(135deg,#0b3d91,#1558d6);color:#fff;border:none"><div style="font-size:12px;opacity:.85">💰 Valorización en pedidos</div><div style="font-size:25px;font-weight:800;margin-top:2px">${money(valorPed)}</div><div style="font-size:11px;opacity:.8">${peds.length} pedido(s) por consignar/autorizar</div></div>
      ${this.puede('admin','vendedor')?`<button class="btn btn-main" style="margin-bottom:14px" onclick="App.modalCrear()">🛒 Hacer pedido / Muestra</button>`:''}
      ${this.puede('admin')?`<button class="btn-sm" style="width:100%;background:#0b1f2a;color:#fff;padding:11px;margin-bottom:12px;font-weight:700" onclick="App.resumenTiempos()">⏱ Resumen de tiempos · picking &amp; packing</button>`:''}
      ${peds.length?peds.map(p=>this.cardPedido(p)).join(''):'<div class="empty">No hay pedidos por autorizar.</div>'}
    `);
  },
  async vDespachos(){
    this.loading();
    const { data:peds=[] } = await this.sb.from('pedidos').select('*').neq('estado','anulado').order('actualizado_en',{ascending:true}).limit(500);
    const G={
      despachar: peds.filter(p=>['autorizado','despachado'].includes(p.estado)),   // activo: por despachar + en tránsito
      autorizar: peds.filter(p=>['pendiente_pago','consignado'].includes(p.estado)), // esperando validar pago
      entregado: peds.filter(p=>p.estado==='entregado'),                              // ya recibidos
    };
    const tab=G[this._despTab]?this._despTab:'despachar'; this._despTab=tab;
    const TABS=[['despachar',`🚚 Por despachar (${G.despachar.length})`],['autorizar',`⏳ Por autorizar (${G.autorizar.length})`],['entregado',`✅ Entregado (${G.entregado.length})`]];
    const lista=G[tab]||[];
    this.set(`
      <h1>🚚 Despachos</h1><div class="sub">Toca un pedido para abrir y gestionarlo</div>
      <div style="display:flex;gap:6px;margin-bottom:12px;overflow-x:auto;padding-bottom:2px">${TABS.map(([v,n])=>`<button class="btn-sm" style="flex:0 0 auto;font-weight:700;background:${v===tab?'var(--naranja);color:#fff':'#eef1f5;color:#555'}" onclick="App.despTab('${v}')">${n}</button>`).join('')}</div>
      ${lista.length?lista.map(p=>this.cardPedido(p)).join(''):'<div class="empty">Nada en esta pestaña.</div>'}
    `);
  },
  despTab(t){ this._despTab=t; this.vDespachos(); },
  async vCartera(){   // FEROZ · Cartera — ventas a crédito pendientes de cobro
    this.loading();
    const { data:peds=[] } = await this.sb.from('pedidos').select('*').order('creado_en',{ascending:false});
    const cartera=(peds||[]).filter(p=>!p.es_muestra && p.tipo_pago==='credito' && !p.consignacion_validada_por && ['autorizado','despachado','entregado'].includes(p.estado));
    const money=n=>'$'+Math.round(n||0).toLocaleString('es-CO');
    const totalCobrar=cartera.reduce((a,p)=>a+(+p.total||0),0);
    const dias=p=>{ const d=p.autorizado_en||p.despachado_en||p.creado_en; if(!d) return ''; const n=Math.floor((Date.now()-new Date(d).getTime())/86400000); return n+' día'+(n===1?'':'s'); };
    this.set(`<h1>💳 Cartera · Feroz</h1><div class="sub">Ventas a crédito pendientes de cobro · marca "pagado" cuando el cliente consigne</div>
      <div class="card" style="background:linear-gradient(135deg,#b45309,#d97706);color:#fff;border:none"><div style="font-size:12px;opacity:.85">💰 Total por cobrar</div><div style="font-size:25px;font-weight:800;margin-top:2px">${money(totalCobrar)}</div><div style="font-size:11px;opacity:.8">${cartera.length} pedido(s) a crédito sin pagar</div></div>
      ${cartera.length?cartera.map(p=>{const nom=(p.cliente_snap||{}).nombre||'—';return `<div class="item" style="display:block"><div class="top"><div><div class="nom">${esc(nom)}</div><div class="meta">${esc(p.numero||'')} · ${p.pares||0} pares · ${dias(p)}${p.factura_num?' · Fact '+esc(p.factura_num):''}</div></div><div style="text-align:right"><div style="font-weight:800;color:#b45309">${money(p.total)}</div><div style="font-size:10px;color:#8a93a6">${ESTADOS[p.estado]||p.estado}</div></div></div><div style="margin-top:8px;text-align:right"><button class="btn-sm" style="background:#16a34a;color:#fff" onclick="App.cartMarcarPagado('${p.id}')">💰 Marcar pagado</button></div></div>`}).join(''):'<div class="empty">Sin cartera pendiente. Las ventas a <b>crédito</b> aparecen aquí (con su total por cobrar) hasta que el cliente consigne.</div>'}`);
  },
  async cartMarcarPagado(id){
    if(!confirm('¿Confirmas que este cliente YA PAGÓ su crédito? Sale de Cartera (la venta se mantiene).')) return;
    await this.sb.from('pedidos').update({consignacion_validada_por:this.user.id, consignacion_fecha:new Date().toISOString(), actualizado_en:new Date().toISOString()}).eq('id',id);
    this.vCartera();
  },
  async vVentas(){   // FEROZ · Ventas — espejo de Ventas·Smart con datos de Feroz
    this.loading();
    const H={apikey:this._SBK(),Authorization:'Bearer '+this._SBK()};
    let peds=[], metas=[];
    try{ const r=await this.sb.from('pedidos').select('numero,total,pares,es_muestra,comision_nc,comision_gpjr,cliente_snap,estado,creado_en,guia,detalle'); peds=r.data||[]; }catch(e){}
    try{ metas=await (await fetch(this._SBU()+'/rest/v1/nc_metas?empresa=eq.feroz&order=mes_num',{headers:H})).json(); }catch(e){}
    peds=Array.isArray(peds)?peds:[]; metas=Array.isArray(metas)?metas:[];
    const muestras=peds.filter(p=>p.es_muestra), muVend=muestras.filter(p=>(+p.total||0)>0).length, muGratis=muestras.length-muVend;
    const v=peds.filter(p=>!p.es_muestra && (+p.total||0)>0 && ['consignado','autorizado','despachado','entregado'].includes(p.estado));
    const totV=v.reduce((a,p)=>a+(+p.total||0),0), totNC=v.reduce((a,p)=>a+(+p.comision_nc||0),0);
    const totG=v.reduce((a,p)=>a+(+p.comision_gpjr||0),0), totPares=v.reduce((a,p)=>a+(+p.pares||0),0);
    const MESES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    const hoy=new Date(), mesActual=MESES[hoy.getMonth()]+'-'+hoy.getFullYear(), curN=hoy.getMonth()+1;
    const porMes={};
    v.forEach(p=>{ const d=new Date(p.creado_en), m=MESES[d.getMonth()]+'-'+d.getFullYear(); (porMes[m]=porMes[m]||{v:0,c:0,n:0,p:0}); porMes[m].v+=+p.total||0; porMes[m].c+=+p.comision_nc||0; porMes[m].n++; porMes[m].p+=+p.pares||0; });
    const metaMes=+((metas.find(m=>m.mes===mesActual)||{}).meta||0), logMes=(porMes[mesActual]&&porMes[mesActual].v)||0, avMes=metaMes?logMes/metaMes*100:0, okMes=avMes>=100;
    this.set(`<h1>Ventas · Feroz</h1><div class="sub">Pedidos reales (con valor) · comisión por par NC ${totG>0?'+ GPJR':''}</div>
      <div class="kpis">
        <div class="kpi naranja"><b>${money(totV)}</b><span>Ventas 2026 (acum.)</span></div>
        <div class="kpi verde"><b>${money(totNC)}</b><span>Comisión NC</span></div>
        <div class="kpi"><b>${v.length}</b><span>Ventas</span></div>
        <div class="kpi"><b style="color:#2563eb">${totPares.toLocaleString('es-CO')}</b><span>📦 Pares vendidos</span></div>
      </div>
      ${totG>0?`<div class="kpis"><div class="kpi" style="border-color:#b8860b"><b style="color:#b8860b">${money(totG)}</b><span>⭐ Comisión GPJR</span></div><div class="kpi"><b>${money(totNC+totG)}</b><span>Comisión total</span></div></div>`:''}
      <div class="card" style="border-left:4px solid #16a34a;padding:9px 13px"><div style="font-size:12.5px;color:#445">🎟️ Muestras: <b>${muVend}</b> vendidas · <b>${muGratis}</b> entregadas gratis <span style="color:#8a93a6">(no se valorizan)</span></div></div>
      ${metas.length?`<div class="card" style="border-left:4px solid ${okMes?'#2563eb':'#dc2626'}">
        <div style="display:flex;justify-content:space-between;align-items:baseline"><h2 style="font-size:15px">🎯 Meta de ${mesActual}</h2><span style="font-size:12px">logrado <b>${money(logMes)}</b> de ${money(metaMes)}</span></div>
        <div style="height:16px;background:var(--gris);border-radius:8px;overflow:hidden;margin-top:8px"><div style="height:100%;width:${Math.min(100,avMes).toFixed(1)}%;background:${okMes?'#2563eb':'#dc2626'};display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:800">${avMes.toFixed(0)}%</div></div></div>
      <div class="card"><h2 style="font-size:15px;margin-bottom:2px">🎯 Meta vs logrado por mes</h2><div style="font-size:11.5px;color:#667;margin-bottom:10px">🔵 cumplió · 🔴 no cumplió</div>
        ${metas.filter(m=>m.mes_num<=curN && (+m.meta||0)>0).sort((a,b)=>b.mes_num-a.mes_num).map(m=>{ const meta=+m.meta||0, log=(porMes[m.mes]&&porMes[m.mes].v)||0, pct=meta?log/meta*100:0, ok=pct>=100; return `<div style="margin-bottom:11px"><div style="display:flex;justify-content:space-between;font-size:13px"><span><b>${m.mes}</b></span><span>logrado <b>${money(log)}</b> / meta ${money(meta)} · <b style="color:${ok?'#2563eb':'#dc2626'}">${pct.toFixed(0)}%</b></span></div><div style="height:11px;background:var(--gris);border-radius:6px;margin-top:3px;overflow:hidden"><div style="height:100%;width:${Math.min(100,pct).toFixed(0)}%;background:${ok?'#2563eb':'#dc2626'}"></div></div></div>`;}).join('')||'<div class="empty">Sin datos</div>'}
      </div>`:`<div class="card" style="border-left:4px solid #f0a500"><div style="font-size:12.5px;color:#7a5800">🎯 Aún no has cargado las <b>metas de Feroz</b>. Dime la meta en $ por mes y las activo igual que en Smart.</div></div>`}
      <div class="card"><h2 style="font-size:15px;margin-bottom:6px">🧾 Ventas reales (${v.length})</h2>
        ${v.length?v.slice().sort((a,b)=>new Date(b.creado_en)-new Date(a.creado_en)).map(p=>{const cl=p.cliente_snap||{}; return `<div class="item"><div class="top"><div><div class="nom">${esc(cl.nombre||'Cliente')} ${(+p.comision_gpjr||0)>0?'<span style="color:#b8860b">⭐</span>':''}</div><div class="meta">${esc(p.numero||'')} · ${p.pares} pares · 📅 ${new Date(p.creado_en).toLocaleDateString('es-CO')}${p.guia?(' · guía '+esc(p.guia)):''}</div></div><div style="text-align:right"><div class="tot">${money(p.total)}</div><div class="meta" style="color:var(--verde)">NC ${money(p.comision_nc||0)}</div>${(+p.comision_gpjr||0)>0?`<div class="meta" style="color:#b8860b">⭐ GPJR ${money(p.comision_gpjr)}</div>`:''}</div></div></div>`;}).join(''):'<div class="empty">Aún no hay ventas reales.</div>'}
      </div>`);
  },
  toggleBox(id){ const el=document.getElementById(id); if(el) el.style.display=(!el.style.display||el.style.display==='none')?'block':'none'; },
  cardPedido(p){
    const cl=p.cliente_snap||{};
    const env=[cl.direccion,cl.barrio,cl.ciudad,cl.depto].filter(Boolean).join(', ');
    const tot=+p.total||0, pares=+p.pares||0;
    const _cv=p.curva||{}; const _tk=Object.keys(_cv).filter(t=>+_cv[t]>0).sort((a,b)=>a-b);
    const tallasTxt=_tk.length?_tk.map(t=>`<b>${esc(t)}</b>×${esc(_cv[t])}`).join(' &nbsp; '):'';
    const detalle = p.es_muestra ? `🎁 ${esc(p.detalle||'Muestra')}` : `${pares} pares · ${esc(p.tipo_pago)}`;
    const totLbl = (p.es_muestra && tot===0) ? 'Sin costo' : money(tot);
    // liquidación discriminada (proforma): producto + IVA + transporte según la regla
    let liq;
    if(!p.es_muestra){
      const sub=C.PRECIO_PAR*pares, iva=Math.round(sub*C.IVA), cajas=pares/C.PARES_CAJA;
      const ftxt = cajas>=C.MIN_CAJAS_SIN_FLETE ? '🚚 flete incluido (gratis)' : `🚚 flete al cobro${p.transporte?' · '+esc(p.transporte):' (transportadora que elija)'}`;
      liq = `💵 ${pares} × ${money(C.PRECIO_PAR)} = ${money(sub)} &nbsp;+ IVA ${money(iva)} &nbsp;· ${ftxt} &nbsp;= <b>${money(tot||sub+iva)}</b>`;
    } else if(p.muestra_tipo==='par'){
      const sub=C.MUESTRA_PAR*pares, iva=Math.round(sub*C.IVA), fl=(+p.flete||0)||Math.ceil(pares/(C.MUESTRA_FLETE_PARES||3))*(C.MUESTRA_FLETE||22000);
      liq = `💵 ${pares} × ${money(C.MUESTRA_PAR)} = ${money(sub)} &nbsp;+ IVA ${money(iva)} &nbsp;+ 🚚 transporte ${money(fl)} (aparte) &nbsp;= <b>${money(tot||sub+iva+fl)}</b>`;
    } else {
      liq = '💵 Sin valor comercial · 🚚 envío gratis';
    }
    return `<div class="item">
      <div class="top" style="cursor:pointer" onclick="App.toggleBox('ped_${p.id}')"><div>
        <div class="nom">${esc(cl.nombre||'Cliente')} ${p.es_muestra?'<span class="badge b-cotizada">MUESTRA</span>':''} <span style="font-size:12px;color:var(--suave)">▾</span></div>
        <div class="meta">${esc(p.numero||'')}${(cl.tel||cl.cel2)?` · 📱 <a href="https://wa.me/57${esc((cl.tel||cl.cel2).replace(/\D/g,''))}" target="_blank" onclick="event.stopPropagation()" style="color:#16734a;font-weight:700;text-decoration:none">${esc(cl.tel||cl.cel2)}</a>`:''} · ${detalle}</div>
      </div><div style="text-align:right"><div class="tot">${totLbl}</div>
        <span class="badge b-${p.estado}">${ESTADOS[p.estado]}</span></div></div>
      <div id="ped_${p.id}" style="display:none;margin-top:8px">
        <div class="meta" style="margin-bottom:4px">${liq}</div>
        <div class="card" style="background:#f4f7fb;border:1px dashed var(--naranja);margin:6px 0;padding:10px 12px">
          <div style="font-size:11px;font-weight:700;color:var(--naranja);margin-bottom:5px">📦 DATOS DE ENVÍO · picking & packing</div>
          <div style="font-size:13px;line-height:1.8">📍 <b>${esc(env||'— sin dirección registrada —')}</b>${cl.contacto1?`<br>👤 Oficina: <b>${esc(cl.contacto1)}</b>`:''}${(cl.tel||cl.cel2)?`<br>📱 Celular: <b>${esc(cl.tel||cl.cel2)}</b>${(cl.tel&&cl.cel2)?' · '+esc(cl.cel2):''}`:''}${(cl.contacto_recibe||cl.cel_recibe)?`<br>📦 <b>Recibe:</b> ${esc(cl.contacto_recibe||'')}${cl.cel_recibe?' · 📱 '+esc(cl.cel_recibe):''}`:''}${cl.notas?`<br>📝 <b>Notas:</b> ${esc(cl.notas)}`:''}</div>
          ${tallasTxt?`<div style="margin-top:8px;font-size:14px;background:#fff;border:1px solid var(--linea);border-radius:8px;padding:9px 11px"><span style="font-size:11px;font-weight:800;color:var(--naranja)">👟 TALLAS A EMPACAR · ${pares} pares</span><br><div style="margin-top:3px;line-height:2">${tallasTxt}</div></div>`:''}
        </div>
        ${this.puede('admin')?this._tiemposPedido(p):''}
        ${p.consignacion_validada_por?`<div class="meta" style="color:#16a34a;margin-bottom:4px">💳 Pago validado por <b>${esc(p.consignacion_validada_por)}</b></div>`:''}
        ${(!p.es_muestra && p.guia && p.estado==='pendiente_pago')?`<div style="font-size:11.5px;color:#b3261e;background:#fde8e8;border-radius:7px;padding:6px 9px;margin-bottom:6px">⚠️ CARTERA: enviado SIN validar el pago — falta oprimir 💳 Marcar consignación</div>`:''}
        <div class="acciones-item">${this.accionesPedido(p)}</div>
        ${p.guia?`<div style="display:flex;align-items:center;gap:6px;margin-top:8px;background:#eef4ff;border:1px solid #cfe0ff;border-radius:9px;padding:8px 10px">
          <span style="font-size:11px;color:#3a48b3;white-space:nowrap">🚚 ${esc(p.transporte||'Guía')}</span>
          <b style="font-size:14.5px;flex:1;word-break:break-all;letter-spacing:.3px">${esc(p.guia)}</b>
          <button class="btn-sm" style="background:#3a48b3;color:#fff;padding:6px 10px" onclick="App.copiarGuia('${esc(p.guia)}')">📋 Copiar</button>
          <button class="btn-sm" style="background:#fff;color:#3a48b3;border:1px solid #3a48b3;padding:6px 10px" onclick="window.open('https://www.google.com/search?q='+encodeURIComponent('rastrear guia ${esc(p.transporte||'')} ${esc(p.guia)}'),'_blank')">🔎 Rastrear</button>
        </div>`:''}
      </div></div>`;
  },
  accionesPedido(p){
    const r=this.rol(), btns=[];
    if(p.estado==='pendiente_pago' && this.puede('admin','vendedor'))
      btns.push(`<button class="btn-sm" style="background:var(--azul);color:#fff" onclick="App.accConsignar(${p.id})">💳 Marcar consignación</button>`);
    if(p.estado==='pendiente_pago' && this.puede('admin','facturacion','vendedor'))
      btns.push(`<button class="btn-sm" style="background:#b45309;color:#fff" onclick="App.accAutorizarCredito(${p.id})">📝 Autorizar a crédito</button>`);
    // poner/editar la guía en cualquier etapa de envío (incluye despachado/entregado)
    if(['pendiente_pago','consignado','autorizado','despachado','entregado'].includes(p.estado) && this.puede('admin','bodega','vendedor'))
      btns.push(`<button class="btn-sm btn-ghost" style="border:1px solid var(--linea)" onclick="App.accPonerGuia(${p.id})">🚚 ${p.guia?'Editar guía':'Poner guía'}</button>`);
    // Guía recibida: el cliente ya recibió el paquete (disponible cuando hay guía y aún no se marca entregado)
    if(p.guia && ['pendiente_pago','consignado','autorizado'].includes(p.estado) && this.puede('admin','bodega','vendedor'))
      btns.push(`<button class="btn-sm" style="background:var(--verde);color:#fff" onclick="App.accEntregar(${p.id})">✅ Guía recibida</button>`);
    if(p.estado==='consignado' && this.puede('admin','facturacion'))
      btns.push(`<button class="btn-sm" style="background:var(--azul);color:#fff" onclick="App.accAutorizar(${p.id})">✓ Validar y autorizar</button>`);
    // ⏱ BODEGA: el bodeguero marca que RECIBIÓ el pedido (arranca el cronómetro de picking & packing)
    if(p.estado==='autorizado' && !p.recibido_en && this.puede('admin','bodega'))
      btns.push(`<button class="btn-sm" style="background:#0b1f2a;color:#fff;font-weight:700" onclick="App.accRecibir(${p.id})">📥 Recibí (bodega)</button>`);
    if(p.estado==='autorizado' && this.puede('admin','bodega'))
      btns.push(`<button class="btn-sm" style="background:var(--verde);color:#fff" onclick="App.accDespachar(${p.id})">🚚 Despachar</button>`);
    if(p.estado==='despachado'){
      const cl=p.cliente_snap||{}; const tel=(cl.tel||'').replace(/\D/g,'');
      if(tel) btns.push(`<button class="btn-sm" style="background:#25D366;color:#fff" onclick="App.waCliente(${p.id})">📲 Avisar al cliente</button>`);
      if(p.guia) btns.push(`<button class="btn-sm btn-ghost" style="border:1px solid var(--linea)" onclick="window.open('https://www.google.com/search?q='+encodeURIComponent('rastrear guia ${esc(p.transporte||'')} ${esc(p.guia)}'),'_blank')">🔎 Rastrear</button>`);
      if(this.puede('admin','bodega')) btns.push(`<button class="btn-sm" style="background:var(--verde);color:#fff" onclick="App.accEntregar(${p.id})">✅ Guía recibida</button>`);
    }
    if(this.puede('admin') && !['entregado','anulado'].includes(p.estado))
      btns.push(`<button class="btn-sm" style="background:#fff;color:var(--rojo);border:1px solid #f2c2c2" onclick="App.accAnular(${p.id})">Anular</button>`);
    return btns.join('') || '<span class="hint">Esperando la etapa anterior…</span>';
  },
  copiarGuia(g){ g=String(g||'');
    const ok=()=>this._toast('📋 Guía '+g+' copiada — pégala en la transportadora');
    if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(g).then(ok).catch(()=>this._toast('Guía: '+g)); }
    else { const ta=document.createElement('textarea'); ta.value=g; document.body.appendChild(ta); ta.select(); try{document.execCommand('copy'); ok();}catch(e){this._toast('Guía: '+g);} ta.remove(); }
  },

  async accAutorizarCredito(id){
    if(!confirm('¿Autorizar este pedido A CRÉDITO?\n\nPasa a 💳 Cartera (por cobrar) y ya puedes despacharlo. La venta queda registrada. Cuando el cliente pague, oprimes "Marcar pagado" en Cartera.')) return;
    await this.sb.from('pedidos').update({estado:'autorizado', tipo_pago:'credito', autorizado_por:this.user.id, autorizado_en:new Date().toISOString(), actualizado_en:new Date().toISOString()}).eq('id',id);
    this.go(this.view);
  },
  accConsignar(id){
    this._consignId=id;
    this.modal(`<h3>💳 Marcar consignación · validar pago</h3>
      <div class="hint">Solo quien puede <b>dar fe de que el dinero entró</b> valida. (Las muestras sin valor comercial NO requieren esto.)</div>
      <label>¿Quién valida que el dinero entró? *</label>
      <select class="field" id="cons_val"><option value="">— Selecciona —</option><option>Alejandra</option><option>José Calderón</option></select>
      <label>Referencia / N° de consignación (opcional)</label>
      <input class="field" id="cons_ref" placeholder="N° o referencia de la consignación">
      <button class="btn btn-main" onclick="App.guardarConsignacion()">✓ Doy fe: el dinero entró</button>
      <button class="btn btn-ghost" onclick="App.cerrarModal()">Cancelar</button>`);
  },
  async guardarConsignacion(){
    const val=($('cons_val')||{}).value||'', ref=(($('cons_ref')||{}).value||'').trim();
    if(!val){ alert('Selecciona quién valida el pago (Alejandra o José Calderón).'); return; }
    await this.sb.from('pedidos').update({estado:'consignado',consignacion_ref:ref,consignacion_validada_por:val,consignacion_fecha:new Date().toISOString(),marcada_por:this.user.id,actualizado_en:new Date().toISOString()}).eq('id',this._consignId);
    await this.hist(this._consignId,'consignado','Consignación validada por '+val+(ref?(' · ref '+ref):''));
    this.cerrarModal(); this.toastNotif('Facturación','Tiene un pedido para validar y autorizar.'); this.go(this.view);
  },
  async accAutorizar(id){
    const fac=prompt('N° de factura (o deja vacío):','');
    if(fac===null) return;
    if(!confirm('¿Confirmas que la plata SÍ entró y autorizas el pedido?')) return;
    await this.sb.from('pedidos').update({estado:'autorizado',factura_num:fac,autorizado_por:this.user.id,autorizado_en:new Date().toISOString(),actualizado_en:new Date().toISOString()}).eq('id',id);
    await this.hist(id,'autorizado','Pago validado y autorizado'+(fac?(' · factura '+fac):''));
    this.toastNotif('Bodega','Tiene un pedido autorizado para alistar y despachar.');
    this.go(this.view);
  },
  async accDespachar(id){ this._modalGuia(id,'despachar'); },
  TRANSPORTADORAS:['Interrapidísimo','Coordinadora','Propio'],
  async _modalGuia(id, modo){
    const { data:p } = await this.sb.from('pedidos').select('transporte,guia').eq('id',id).single();
    const tSel=(p&&p.transporte)||'Interrapidísimo', gVal=(p&&p.guia)||'';
    this.modal(`
      <h3>🚚 ${modo==='despachar'?'Despachar pedido':'Registrar guía'}</h3>
      <div class="hint">${modo==='despachar'?'Marca el pedido como despachado.':'Registra la guía aunque el pedido aún espere el pago.'}</div>
      <label>Transportadora</label>
      <select class="field" id="g_transp">${this.TRANSPORTADORAS.map(t=>`<option ${t===tSel?'selected':''}>${t}</option>`).join('')}</select>
      <label>N° de guía <span style="color:var(--suave);font-weight:400">(vacío si es Propio)</span></label>
      <input class="field" id="g_guia" inputmode="numeric" value="${esc(gVal)}" placeholder="N° de guía">
      <button class="btn btn-main" onclick="App.guardarGuia(${id},'${modo}')">${modo==='despachar'?'🚚 Despachar':'💾 Guardar guía'}</button>
      <button class="btn btn-ghost" onclick="App.cerrarModal()">Cancelar</button>
    `);
  },
  /* ---------- ⏱ TIEMPOS DE BODEGA (picking & packing) ---------- */
  async resumenTiempos(){
    const { data:peds=[] } = await this.sb.from('pedidos').select('numero,cliente_snap,pares,autorizado_en,recibido_en,recibido_por,despachado_en,guia_en,estado')
      .not('recibido_en','is',null).order('recibido_en',{ascending:false}).limit(200);
    if(!peds.length){ this.modal('<h3>⏱ Resumen de tiempos</h3><div class="empty">Aún no hay pedidos con tiempos registrados.<br><br>Cuando bodega oprima <b>📥 Recibí</b> en un pedido, empieza a medirse el picking & packing.</div><button class="btn" style="width:100%;background:#eef0f2;color:#555" onclick="App.cerrarModal()">Cerrar</button>'); return; }
    const mins=(a,b)=>{ if(!a||!b) return null; const m=Math.round((new Date(b)-new Date(a))/60000); return m>=0?m:null; };
    const prom=arr=>{ const v=arr.filter(x=>x!=null); return v.length?Math.round(v.reduce((s,x)=>s+x,0)/v.length):null; };
    const fmt=m=>m==null?'—':(m<60?m+' min':Math.floor(m/60)+'h'+(m%60?' '+(m%60)+'m':''));
    const rows=peds.map(p=>({n:p.numero||'—', cli:((p.cliente_snap||{}).nombre)||'—', pares:+p.pares||0, quien:p.recibido_por||'—',
      resp:mins(p.autorizado_en,p.recibido_en), pick:mins(p.recibido_en,p.despachado_en), gui:mins(p.despachado_en,p.guia_en), tot:mins(p.autorizado_en,p.guia_en)}));
    const pResp=prom(rows.map(r=>r.resp)), pPick=prom(rows.map(r=>r.pick)), pGui=prom(rows.map(r=>r.gui)), pTot=prom(rows.map(r=>r.tot));
    // picking por par (productividad)
    const conPares=rows.filter(r=>r.pick!=null && r.pares>0);
    const minPorPar=conPares.length?(conPares.reduce((s,r)=>s+r.pick/r.pares,0)/conPares.length).toFixed(1):null;
    this.modal(`<h3>⏱ Resumen de tiempos · bodega</h3>
      <div class="hint" style="margin-bottom:8px">${rows.length} pedido(s) con cronómetro. Promedios de la operación.</div>
      <div class="kpis" style="grid-template-columns:1fr 1fr">
        <div class="kpi"><b style="font-size:20px">${fmt(pResp)}</b><span>📥 Tardan en recibirlo</span></div>
        <div class="kpi naranja"><b style="font-size:20px">${fmt(pPick)}</b><span>📦 Picking &amp; packing</span></div>
        <div class="kpi"><b style="font-size:20px">${fmt(pGui)}</b><span>🚚 Hasta poner la guía</span></div>
        <div class="kpi verde"><b style="font-size:20px">${fmt(pTot)}</b><span>⏱ Total del ciclo</span></div>
      </div>
      ${minPorPar?`<div class="card" style="border-left:4px solid var(--naranja);padding:9px 12px;font-size:13px">⚡ Productividad: <b>${minPorPar} min por par</b> en promedio (picking).</div>`:''}
      <div style="overflow-x:auto;margin-top:8px">
      <table style="width:100%;border-collapse:collapse;font-size:12.5px;white-space:nowrap">
        <thead><tr style="text-align:left;color:#667;font-size:10.5px;text-transform:uppercase">
          <th style="padding:5px 7px">Pedido</th><th style="padding:5px 7px">Bodeguero</th><th style="padding:5px 7px;text-align:right">Pares</th>
          <th style="padding:5px 7px;text-align:right">Recibir</th><th style="padding:5px 7px;text-align:right">Picking</th><th style="padding:5px 7px;text-align:right">Guía</th><th style="padding:5px 7px;text-align:right">Total</th></tr></thead>
        <tbody>${rows.map(r=>`<tr style="border-top:1px solid var(--linea)">
          <td style="padding:6px 7px"><b>${esc(r.n)}</b><div style="color:#8a93a6;font-size:11px">${esc(r.cli).slice(0,22)}</div></td>
          <td style="padding:6px 7px">${esc(r.quien)}</td>
          <td style="padding:6px 7px;text-align:right">${r.pares}</td>
          <td style="padding:6px 7px;text-align:right">${fmt(r.resp)}</td>
          <td style="padding:6px 7px;text-align:right;font-weight:800;color:var(--naranja)">${fmt(r.pick)}</td>
          <td style="padding:6px 7px;text-align:right">${fmt(r.gui)}</td>
          <td style="padding:6px 7px;text-align:right;font-weight:700">${fmt(r.tot)}</td></tr>`).join('')}</tbody>
      </table></div>
      <button class="btn" style="width:100%;margin-top:12px;background:#eef0f2;color:#555" onclick="App.cerrarModal()">Cerrar</button>`);
  },
  async accRecibir(id){
    const quien=(this.perfil&&this.perfil.nombre)||this.user.email||'bodega';
    if(!confirm('¿Confirmas que RECIBISTE este pedido en bodega para alistarlo?')) return;
    await this.sb.from('pedidos').update({recibido_en:new Date().toISOString(), recibido_por:quien, actualizado_en:new Date().toISOString()}).eq('id',id);
    try{ await this.hist(id,'recibido','Recibido en bodega por '+quien); }catch(e){}
    this.toast('📥 Recibido en bodega'); this.go(this.view);
  },
  _hm(t){ return t?new Date(t).toLocaleString('es-CO',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):''; },
  _dur(a,b){ if(!a||!b) return ''; const ms=new Date(b)-new Date(a); if(ms<0) return ''; const m=Math.round(ms/60000);
    if(m<60) return m+' min'; const h=Math.floor(m/60), r=m%60; if(h<24) return h+'h'+(r?' '+r+'m':''); const d=Math.floor(h/24); return d+'d '+(h%24)+'h'; },
  _tiemposPedido(p){
    const pub=p.autorizado_en, rec=p.recibido_en, des=p.despachado_en, gui=p.guia_en;
    if(!pub && !rec && !des) return '';
    const row=(ic,lbl,t,dur,extra)=>t?`<div style="display:flex;justify-content:space-between;gap:10px;font-size:12.5px;padding:2px 0"><span>${ic} ${lbl} <b>${this._hm(t)}</b>${extra?` <span style="color:var(--suave)">${esc(extra)}</span>`:''}</span>${dur?`<span style="color:var(--naranja);font-weight:800;white-space:nowrap">${dur}</span>`:''}</div>`:'';
    const pick=this._dur(rec,des);
    return `<div class="card" style="background:#fff;border:1px solid var(--linea);margin:6px 0;padding:9px 11px">
      <div style="font-size:11px;font-weight:800;color:var(--naranja);margin-bottom:4px">⏱ TIEMPOS DE BODEGA</div>
      ${row('📢','Publicado',pub,'')}
      ${row('📥','Recibido',rec,this._dur(pub,rec),p.recibido_por?('· '+p.recibido_por):'')}
      ${row('📦','Despachado',des,pick?pick+' picking':'')}
      ${row('🚚','Guía puesta',gui,this._dur(des,gui))}
      ${(pub&&gui)?`<div style="border-top:1px dashed var(--linea);margin-top:5px;padding-top:5px;font-size:12.5px;display:flex;justify-content:space-between"><b>Total (publicado → guía)</b><b style="color:var(--verde)">${this._dur(pub,gui)}</b></div>`:''}
    </div>`;
  },
  async guardarGuia(id, modo){
    const transporte=$('g_transp').value, guia=$('g_guia').value.trim();
    if(modo==='despachar'){
      await this.sb.from('pedidos').update({estado:'despachado',transporte,guia,despachado_por:this.user.id,despachado_en:new Date().toISOString(),guia_en:(guia?new Date().toISOString():null),actualizado_en:new Date().toISOString()}).eq('id',id);
      await this.hist(id,'despachado','Despachado por '+transporte+(guia?(' · guía '+guia):''));
      const { data:pp } = await this.sb.from('pedidos').select('curva,numero').eq('id',id).single();
      if(pp) await this.descontarInventario(id, pp.curva, 'Despacho '+(pp.numero||''));
      this.cerrarModal(); this.go(this.view);
      setTimeout(()=>{ if(confirm('Pedido despachado ✅\n¿Avisar al cliente por WhatsApp ahora?')) this.waCliente(id); },300);
    } else {
      const { data:p } = await this.sb.from('pedidos').select('estado,guia_en').eq('id',id).single();
      const _upd={transporte,guia,actualizado_en:new Date().toISOString()};
      if(guia && !(p&&p.guia_en)) _upd.guia_en=new Date().toISOString();   // ⏱ hora en que se puso la guía (solo la 1ra vez)
      await this.sb.from('pedidos').update(_upd).eq('id',id);
      await this.hist(id,(p&&p.estado)||'pendiente_pago','Guía registrada (enviado antes del pago): '+transporte+(guia?(' · guía '+guia):''));
      this.cerrarModal(); this.toast('🚚 Guía registrada ✅ — ya aparece en Despachos'); this.go(this.view);
    }
  },
  async accPonerGuia(id){ this._modalGuia(id,'poner'); },
  async accEntregar(id){
    await this.sb.from('pedidos').update({estado:'entregado',entregado_en:new Date().toISOString(),actualizado_en:new Date().toISOString()}).eq('id',id);
    await this.hist(id,'entregado','Entregado. Ciclo cerrado.');
    this.go(this.view);
  },
  async accAnular(id){
    const motivo=prompt('Motivo de anulación:',''); if(!motivo) return;
    await this.sb.from('pedidos').update({estado:'anulado',actualizado_en:new Date().toISOString()}).eq('id',id);
    await this.hist(id,'anulado','Anulado: '+motivo);
    this.go(this.view);
  },

  async waCliente(id){
    const { data:p } = await this.sb.from('pedidos').select('*').eq('id',id).single();
    const cl=p.cliente_snap||{}; const tel=(cl.tel||'').replace(/\D/g,'');
    let t=`Hola ${cl.nombre||''} 👋\nTu pedido Feroz (${p.numero}) fue *despachado* 🚚\n`;
    if(p.guia) t+=`Transportadora: ${p.transporte||''}\nGuía: *${p.guia}*\n`;
    else if(p.transporte) t+=`Envío: ${p.transporte}\n`;
    t+=`\n¡Gracias por tu compra! — Industrias Feroz`;
    window.open(`https://wa.me/57${tel}?text=${encodeURIComponent(t)}`,'_blank');
  },

  /* ---------- MUESTRAS ---------- */
  async modalCrear(){
    const { data:cli=[] } = await this.sb.from('clientes').select('id,nombre,nit,tel,depto,ciudad,barrio,direccion,correo,tipo_pago,clase,referencia,lista_precio,valor_par_nc,valor_par_gpjr,recomendado').order('nombre');
    this._clientesM = cli;
    this.modal(`
      <h3>🛒 Hacer pedido / Muestra</h3>
      <label>Cliente *</label>
      <select class="field" id="mu_cliente"><option value="">— Selecciona —</option>
        ${cli.map(c=>`<option value="${c.id}">${esc(c.nombre)} (${esc(c.nit||'')})</option>`).join('')}</select>
      <button class="btn-sm" style="background:var(--negro);color:#fff;margin-top:8px" onclick="App.cerrarModal();App.modalCliente(c=>{App.modalCrear()})">+ Cliente nuevo</button>
      <label>¿Qué vas a crear? *</label>
      <select class="field" id="cr_tipo" onchange="App.crearToggle()">
        <option value="nono">🎁 Muestra nono — sin valor comercial</option>
        <option value="pie">👟 Pie completo — ${money(C.MUESTRA_PAR)}/par + IVA (sin mínimo)</option>
        <option value="pedido">📦 Pedido formal — curva, mínimo ${C.PARES_CAJA} pares</option>
        <option value="equipo">👔 Equipo comercial — sin valor comercial (curva)</option>
      </select>
      <div id="cr_asesor_wrap" style="display:none;margin-top:8px"><label>Nombre del asesor *</label><input class="field" id="cr_asesor" placeholder="Ej: Juan Pérez — equipo comercial">
        <label style="margin-top:8px">📦 Recoge en</label><select class="field" id="cr_recoge">${(C.BODEGAS||['Bodega']).map(b=>`<option value="${b}">${b}</option>`).join('')}</select></div>
      <div class="hint" id="cr_hint" style="margin-top:8px"></div>
      <label style="margin-top:10px">Cantidades por talla</label>
      <div class="grid-tallas" id="cr_grid"></div>
      <div class="estado" style="position:static;margin-top:8px"><div class="ec-falta ok" id="cr_total">Total: $0</div></div>
      <button class="btn btn-main" onclick="App.guardarCrear()">Crear</button>
      <button class="btn btn-ghost" onclick="App.cerrarModal()">Cancelar</button>
    `);
    document.getElementById('cr_grid').innerHTML = C.TALLAS.map(t=>`<div class="t"><span>T${t}</span><input type="number" min="0" inputmode="numeric" data-talla="${t}" oninput="App.crearPreview()"></div>`).join('');
    this.crearToggle();
  },
  crearToggle(){
    const t=$('cr_tipo').value, h=$('cr_hint');
    const aw=$('cr_asesor_wrap'); if(aw) aw.style.display=(t==='equipo')?'block':'none';
    if(h) h.textContent = t==='nono'
      ? 'Zapato suelto, sin valor comercial. Pon las cantidades por talla para la orden de producción y envío.'
      : t==='pie'
      ? `Pie/par completo a ${money(C.MUESTRA_PAR)}/par + IVA · 🚚 transporte ${money(C.MUESTRA_FLETE||22000)} por cada ${C.MUESTRA_FLETE_PARES||3} pares. Sin mínimo.`
      : t==='equipo'
      ? 'Pedido interno para el EQUIPO COMERCIAL: sin valor comercial, con el nombre del asesor. Sigue el proceso normal (queda autorizado y pasa a Despachos). El cliente es opcional.'
      : `Curva formal: mínimo ${C.PARES_CAJA} pares, múltiplos de ${C.PARES_CAJA}, a ${money(C.PRECIO_PAR)}/par + IVA · 🚚 menos de ${C.MIN_CAJAS_SIN_FLETE} cajas = flete al cobro · ${C.MIN_CAJAS_SIN_FLETE} cajas o más = flete incluido.`;
    this.crearPreview();
  },
  _crearTallas(){ let pares=0; const tallas={}; document.querySelectorAll('#cr_grid input').forEach(i=>{const q=+i.value||0; if(q>0){pares+=q; tallas[i.dataset.talla]=q;}}); return {pares,tallas}; },
  crearPreview(){
    const tipo=$('cr_tipo').value, {pares}=this._crearTallas(); let html='Total: $0';
    if(pares){
      if(tipo==='nono'){ html=`${pares} und · Sin valor comercial`; }
      else if(tipo==='equipo'){ html=`${pares} par(es) · 👔 Sin valor comercial (equipo)`; }
      else if(tipo==='pie'){ const sub=C.MUESTRA_PAR*pares, iva=Math.round(sub*C.IVA), flete=Math.ceil(pares/(C.MUESTRA_FLETE_PARES||3))*(C.MUESTRA_FLETE||22000); html=`${pares} par(es) · ${money(sub)} + IVA ${money(iva)} + 🚚 ${money(flete)} = <b>${money(sub+iva+flete)}</b>`; }
      else { const sub=C.PRECIO_PAR*pares, iva=Math.round(sub*C.IVA), ok=pares>=C.PARES_CAJA&&pares%C.PARES_CAJA===0, cajas=pares/C.PARES_CAJA, ftxt=cajas>=C.MIN_CAJAS_SIN_FLETE?'flete incluido':'flete al cobro'; html=`${pares} pares (${cajas.toFixed(pares%C.PARES_CAJA?2:0)} caja) · <b>${money(sub+iva)}</b> (IVA incl.) · 🚚 ${ftxt}`+(ok?'':` · ⚠ múltiplo de ${C.PARES_CAJA}`); }
    }
    $('cr_total').innerHTML=html;
  },
  async guardarCrear(){
    const tipo=$('cr_tipo').value, cid=$('mu_cliente').value;
    const asesor=(($('cr_asesor')||{}).value||'').trim();
    const recoge=(($('cr_recoge')||{}).value||'').trim();
    if(tipo==='equipo'){ if(!asesor){ alert('Escribe el nombre del asesor.'); return; } }
    else if(!cid){ alert('Selecciona un cliente.'); return; }
    const {pares,tallas}=this._crearTallas();
    if(pares<1){ alert('Pon las cantidades por talla en la tabla.'); return; }
    if(tipo==='pedido' && (pares<C.PARES_CAJA || pares%C.PARES_CAJA!==0)){ alert('Pedido formal: mínimo '+C.PARES_CAJA+' pares y en múltiplos de '+C.PARES_CAJA+' (cajas completas).'); return; }
    const cl=this._clientesM.find(c=>c.id==cid) || (tipo==='equipo'?{nombre:'👔 '+asesor+' (equipo comercial)',tipo_pago:'contado'}:null);
    const partes=Object.keys(tallas).sort((a,b)=>a-b).map(t=>`T${t}×${tallas[t]}`).join(', ');
    let sub=0,iva=0,flete=0,esMuestra=false,muestraTipo=null,estado='pendiente_pago',detalle='',pref='PED';
    if(tipo==='nono'){ esMuestra=true; muestraTipo='nono'; estado='autorizado'; pref='MUE'; detalle=`${pares} nono(s) — zapato suelto, sin valor comercial · ${partes}`; }
    else if(tipo==='equipo'){ estado='autorizado'; pref='EQ'; detalle=`Equipo comercial — ${asesor} · ${pares} pares SIN valor comercial · ${partes}${recoge?' · 📦 Recoge en '+recoge:''}`; }
    else if(tipo==='pie'){ sub=C.MUESTRA_PAR*pares; iva=Math.round(sub*C.IVA); flete=Math.ceil(pares/(C.MUESTRA_FLETE_PARES||3))*(C.MUESTRA_FLETE||22000); esMuestra=true; muestraTipo='par'; pref='MUE'; detalle=`${pares} pie(s) completo(s) de muestra · ${partes} · 🚚 transporte ${money(flete)}`; }
    else { sub=C.PRECIO_PAR*pares; iva=Math.round(sub*C.IVA); const cajas=pares/C.PARES_CAJA, ftxt=cajas>=C.MIN_CAJAS_SIN_FLETE?'flete incluido (gratis)':'flete al cobro (transportadora)'; detalle=`Pedido ${pares} pares (${cajas} caja(s)) · ${partes} · 🚚 ${ftxt}`; }
    const total=sub+iva+flete;
    // comisión por par (solo pedidos reales, no muestras) — desde feroz_comisiones (ref+lista) o el default
    let vNC=0,vGPJR=0;
    if(!esMuestra && tipo!=='equipo'){
      let rate=null;
      try{ const {data}=await this.sb.from('feroz_comisiones').select('*').eq('referencia',(cl.referencia||'701')).eq('lista',(cl.lista_precio||'Distribuidor')).maybeSingle(); rate=data; }catch(e){}
      vNC  = cl.recomendado ? (rate?+rate.valor_par_nc_rec:900) : (rate?+rate.valor_par_nc:1900);
      vGPJR= cl.recomendado ? (rate?+rate.valor_par_gpjr:1000) : 0;
    }
    const d=new Date(), num=pref+'-'+d.getFullYear()+('0'+(d.getMonth()+1)).slice(-2)+('0'+d.getDate()).slice(-2)+'-'+('0'+d.getHours()).slice(-2)+('0'+d.getMinutes()).slice(-2)+('0'+d.getSeconds()).slice(-2);
    const reg={numero:num,cliente_id:cid||null,cliente_snap:cl,curva:tallas,pares,total,flete,tipo_pago:(cl&&cl.tipo_pago)||'contado',estado,detalle,
      referencia:(cl&&cl.referencia)||'701',recomendado:!!(cl&&cl.recomendado),valor_par_nc:vNC,valor_par_gpjr:vGPJR,comision_nc:vNC*pares,comision_gpjr:vGPJR*pares};
    if(esMuestra){ reg.es_muestra=true; reg.muestra_tipo=muestraTipo; }
    if(tipo==='equipo'){ reg.interno=true; reg.asesor=asesor; if(recoge) reg.transporte='Recoge: '+recoge; }
    const { data:ped, error } = await this.sb.from('pedidos').insert(reg).select().single();
    if(error){ alert('Error: '+error.message); return; }
    await this.hist(ped.id, estado, detalle+(total>0?(' · '+money(total)):' · sin valor comercial'));
    this.cerrarModal();
    alert('✅ '+(tipo==='equipo'?'Pedido de equipo':(esMuestra?'Muestra':'Pedido'))+' creado: '+num+(total>0?('\nTotal '+money(total)+(estado==='pendiente_pago'?' (pasa por pago)':'')):'\nSin valor comercial — pasa a Despachos'));
    this.go(esMuestra?this.view:(tipo==='equipo'?'despachos':'pedidos'));
  },

  async hist(pedido_id,etapa,nota){ try{ await this.sb.from('historial').insert({pedido_id,etapa,nota,usuario:this.user.id}); }catch(e){} },
  toastNotif(rol,msg){ console.log('[Notif Fase2 →',rol,']',msg); },

  /* ---------- CRM: Interesados (checklist) + Clientes (compras) ---------- */
  async vCrm(){
    this.loading();
    const H={apikey:this._SBK(),Authorization:'Bearer '+this._SBK()};
    let cli=[]; try{ const r=await this.sb.from('clientes').select('*').order('creado_en',{ascending:false}); cli=r.data||[]; }catch(e){}
    let res=[]; try{ const r=await fetch(this._SBU()+'/rest/v1/feroz_marcador_resultados?select=fila,nombre,cel,ciudad,resultado,mundo,fecha&order=fecha.desc&limit=5000',{headers:H}); const j=await r.json(); res=Array.isArray(j)?j:[]; }catch(e){}
    try{ const r=await fetch(this._SBU()+'/rest/v1/nc_crm_embudo?empresa=eq.feroz&limit=5000',{headers:H}); const j=await r.json(); this._crmEmbRows=Array.isArray(j)?j:[]; this._crmEmb={}; this._crmEmbRows.forEach(x=>this._crmEmb[x.lead_key]=x.etapa); }catch(e){ this._crmEmbRows=[]; this._crmEmb={}; }
    this._crmFRes=res; const inter=res.filter(r=>/interes/i.test(r.resultado||''));
    let bot=[]; try{ const r=await fetch(this._SBU()+'/rest/v1/nc_bot_leads_feroz?select=*&order=ultima_fecha.desc&limit=1000',{headers:H}); const j=await r.json(); bot=Array.isArray(j)?j:[]; }catch(e){}
    let cots=[]; try{ const r=await this.sb.from('cotizaciones').select('id,cliente_id,numero,total,estado,es_muestra,creado_en').order('creado_en',{ascending:false}); cots=r.data||[]; }catch(e){}
    const cotByCli={}; cots.forEach(q=>{ if(q.cliente_id && !cotByCli[q.cliente_id]) cotByCli[q.cliente_id]=q; }); this._crmFCots=cotByCli;
    const cnt=async(mundo)=>{ try{ const r=await fetch(this._SBU()+'/rest/v1/feroz_marcador_leads?mundo=eq.'+mundo+'&select=fila&limit=1',{headers:{...H,'Prefer':'count=exact'}}); return +((r.headers.get('content-range')||'').split('/')[1])||0; }catch(e){ return 0; } };
    const nEmp=await cnt('empresa'), nDist=await cnt('distribuidor');
    const prosp=cli.filter(c=>c.embudo!=='cliente');   // prospectos = aún no compran
    this._crmFCli=prosp; this._crmFInter=inter; this._crmFBot=bot; this._crmFCnt={emp:nEmp,dist:nDist};
    const nc=prosp.filter(c=>!c.recomendado&&!c.especial), gpjr=prosp.filter(c=>!!c.recomendado&&!c.especial), esp=prosp.filter(c=>!!c.especial);
    // 🔥 Interesados CRUDOS: los de Marcador/Digital que AÚN no son prospectos (por teléfono) — para clasificarlos
    const yaTel=new Set(cli.map(c=>(c.tel||'').replace(/\D/g,'')).filter(Boolean));
    const intRaw=inter.filter(x=>{ const t=(x.cel||'').replace(/\D/g,''); return !t||!yaTel.has(t); });
    this._crmFIntRaw=intRaw;
    const etOf=b=>{ const v=(b.etiqueta||'').toLowerCase(); return /distribu/.test(v)?'distribuidor':/interes/.test(v)?'interesado':'curioso'; };
    const dCnt={curioso:0,interesado:0,distribuidor:0}; bot.forEach(b=>dCnt[etOf(b)]++);
    const estOf=b=>{ const v=(b.etiqueta||'').toLowerCase(); return /cotiz/.test(v)?'cotiz':/interes/.test(v)?'interesado':'curioso'; };
    const orgLeads=bot.filter(b=>/organic|seo|red/i.test(b.origen||b.canal||''));
    const oCnt={curioso:0,interesado:0,cotiz:0}; orgLeads.forEach(b=>oCnt[estOf(b)]++);
    const PUERTAS=[['prospectos','🎯 Prospectos'],['marcador','☎️ Marcador'],['digital','💬 Digital'],['organico','🌱 Orgánico']];
    const CAJ={prospectos:[['inter',`🔥 Interesados ${intRaw.length}`],['nc',`👤 NC ${nc.length}`],['gpjr',`⭐ GPJR ${gpjr.length}`],['esp',`⭐⭐ Especiales ${esp.length}`]],
      marcador:[['emp',`🏭 Empresas ${nEmp.toLocaleString('es-CO')}`],['dist',`🏪 Distribuidores ${nDist.toLocaleString('es-CO')}`]],
      digital:[['curioso',`👀 Curiosos ${dCnt.curioso}`],['interesado',`🔥 Interesados ${dCnt.interesado}`],['distribuidor',`🏪 Distribuidores ${dCnt.distribuidor}`]],
      organico:[['curioso',`👀 Curiosos ${oCnt.curioso}`],['interesado',`🔥 Interesados ${oCnt.interesado}`],['cotiz',`📝 Cotización ${oCnt.cotiz}`]]};
    const canal=this._crmFCanal||'prospectos'; this._crmFCanal=canal;
    const cajones=CAJ[canal]; let cajon=this._crmFCajon; if(!cajones.find(c=>c[0]===cajon)) cajon=cajones[0][0]; this._crmFCajon=cajon;
    this.set(`<h1>📇 CRM · Feroz</h1><div class="sub">4 puertas → cajones (bases de Feroz)</div>
      <div style="display:flex;gap:6px;margin:10px 0;flex-wrap:wrap">${PUERTAS.map(([v,n])=>`<button class="btn-sm" style="flex:1;min-width:88px;padding:11px;font-weight:700;background:${v===canal?'var(--naranja);color:#fff':'#e5e7eb'}" onclick="App.crmFCanal('${v}')">${n}</button>`).join('')}</div>
      <button class="btn-sm" style="width:100%;background:var(--verde);color:#fff;padding:12px;margin-bottom:10px;font-size:14px;font-weight:700" onclick="App.modalCliente(()=>App.vCrm())">🔎 Registrar / Editar contacto · valida en tus bases</button>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;align-items:center">${cajones.map(([v,n])=>`<button class="btn-sm" style="background:${v===cajon?'#0b1f2a;color:#fff':'#eef2ff;color:#3a48b3'}" onclick="App.crmFCajon('${v}')">${n}</button>`).join('')}</div>
      ${canal==='prospectos'&&cajon!=='inter'?`<button class="btn-sm" style="width:100%;background:#0b1f2a;color:#fff;padding:11px;margin-bottom:10px;font-weight:700" onclick="App.crmInforme('${cajon}')">📄 Generar informe de ${String(cajon).toUpperCase()} (para WhatsApp)</button>`:''}
      ${canal==='digital'?this._ciudBar(cajon):''}
      ${this._crmFItems(canal,cajon)}`);
  },
  crmFCanal(c){ this._crmFCanal=c; this._crmFCajon=null; this._crmMarcCat=null; this.vCrm(); },
  crmEditarProsp(id){ const c=(this._crmFCli||[]).find(x=>x.id===id); if(c) this.modalCliente(()=>this.vCrm(), c); },
  async crmNota(id){ const c=(this._crmFCli||[]).find(x=>x.id===id)||{}; const v=prompt('📝 Nota para '+(c.nombre||'el cliente')+':', c.notas||''); if(v===null) return; await this.sb.from('clientes').update({notas:v}).eq('id',id); this._toast('Nota guardada'); this.vCrm(); },
  crmFCajon(s){ this._crmFCajon=s; this._crmMarcCat=null; this.vCrm(); },
  crmMarcCat(c){ this._crmMarcCat=(this._crmMarcCat===c?null:c); this.vCrm(); },   // toggle: muestra los contactos de esa categoría; re-toca para ocultar
  crmInforme(cajon){
    const cli=this._crmFCli||[];
    const arr=cli.filter(c=> cajon==='esp'?!!c.especial : cajon==='gpjr'?(!!c.recomendado&&!c.especial) : (!c.recomendado&&!c.especial));
    const lbl={esp:'ESPECIALES',gpjr:'GPJR',nc:'NC'}[cajon]||String(cajon).toUpperCase();
    const clean=n=>{ if(!n) return ''; let t=String(n).replace(/wt?a?ha?s?s? ?app/ig,'WhatsApp').replace(/\s+/g,' ').trim().replace(/^[ ,.]+|[ ,.]+$/g,''); return t?t.charAt(0).toUpperCase()+t.slice(1):''; };
    const tel=c=>{ const ns=[c.tel,c.cel2].map(x=>String(x||'').trim()).filter(x=>x && x.replace(/\s/g,'')!=='0000000'); return ns.join(' / ')||'—'; };
    const by={}; arr.forEach(c=>{ const e=c.embudo||'sin'; (by[e]=by[e]||[]).push(c); });
    const ET=[['interesado','🔥 INTERESADOS'],['muestra','📦 CON MUESTRA'],['contactado','📞 CONTACTADOS'],['sin','🆕 SIN GESTIÓN']];
    const hoy=new Date().toLocaleDateString('es-CO');
    let L=[`🥾 *INFORME FEROZ — ${lbl}*`, `_${arr.length} clientes · ${hoy}_`, '', '*Por etapa:*'];
    ET.forEach(([k,t])=>{ L.push(`• ${t}: ${(by[k]||[]).length}`); });
    L.push('');
    ET.forEach(([k,tit])=>{ const g=(by[k]||[]).slice().sort((a,b)=>String(a.nombre||'').localeCompare(String(b.nombre||''))); if(!g.length) return; L.push('━━━━━━━━━━'); L.push(`${tit} (${g.length})`); L.push(''); g.forEach(c=>{ L.push(`*${c.nombre||'—'}*${c.ciudad?' · '+String(c.ciudad).trim():''}`); L.push(`📱 ${tel(c)}`); L.push(`📝 ${clean(c.notas)||'_sin nota_'}`); L.push(''); }); });
    this._informeTxt=L.join('\n').trim();
    this.modal(`<h3>📄 Informe ${lbl} · ${arr.length}</h3>
      <div class="hint" style="margin-bottom:6px">Listo para WhatsApp (los *asteriscos* salen en negrita). Cópialo y pégalo en el chat.</div>
      <textarea id="infTxt" readonly style="width:100%;height:46vh;font-size:12px;line-height:1.4;border:1px solid var(--linea);border-radius:8px;padding:8px;white-space:pre-wrap;box-sizing:border-box">${esc(this._informeTxt)}</textarea>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-main" style="flex:1" onclick="App.copiarInforme()">📋 Copiar</button>
        <button class="btn" style="flex:1;background:#eef2ff;color:#3a48b3" onclick="App.cerrarModal()">Cerrar</button>
      </div>`);
  },
  copiarInforme(){ const t=document.getElementById('infTxt'); const v=(t&&t.value)||this._informeTxt||''; try{ if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(v); } else { t.select(); document.execCommand('copy'); } }catch(e){ try{ t.select(); document.execCommand('copy'); }catch(e2){} } this._toast('📋 Informe copiado — pégalo en WhatsApp'); },
  copiarTxt(id){ const t=document.getElementById(id); const v=(t&&t.value)||''; try{ if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(v); } else { t.select(); document.execCommand('copy'); } }catch(e){ try{ t.select(); document.execCommand('copy'); }catch(e2){} } this._toast('📋 Copiado'); },
  crmInteresadosLista(){
    const arr=(this._crmFInter||[]).slice().sort((a,b)=>String(b.fecha||'').localeCompare(String(a.fecha||'')));
    if(!arr.length){ this._toast('No hay interesados aún'); return; }
    const clean=n=>String(n||'').replace(/\s+/g,' ').trim();
    const hoy=new Date().toLocaleDateString('es-CO');
    const L=[`🔥 *INTERESADOS FEROZ* — ${arr.length}`,`_${hoy} · para volver a llamar o remarketing_`,''];
    arr.forEach(x=>{ L.push(`*${clean(x.nombre)||'—'}*${x.ciudad?' · '+clean(x.ciudad):''}`); L.push(`📱 ${clean(x.cel)||'—'}${x.fecha?' · '+String(x.fecha).slice(0,10):''}`); if(clean(x.nota)) L.push(`📝 ${clean(x.nota)}`); L.push(''); });
    const nums=[...new Set(arr.map(x=>(x.cel||'').replace(/\D/g,'')).filter(t=>t.length>=10))];
    this._interLista=L.join('\n').trim(); this._interNums=nums.join(', ');
    this.modal(`<h3>📋 Interesados Feroz · ${arr.length}</h3>
      <div class="hint" style="margin-bottom:6px">Para volver a llamar o hacer remarketing. Copia y úsalo.</div>
      <textarea id="intTxt" readonly style="width:100%;height:36vh;font-size:12px;line-height:1.4;border:1px solid var(--linea);border-radius:8px;padding:8px;white-space:pre-wrap;box-sizing:border-box">${esc(this._interLista)}</textarea>
      <div class="hint" style="margin:8px 0 4px">Solo números (${nums.length}) — para difusión de WhatsApp:</div>
      <textarea id="intNums" readonly style="width:100%;height:64px;font-size:12px;border:1px solid var(--linea);border-radius:8px;padding:8px;box-sizing:border-box">${esc(this._interNums)}</textarea>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-main" style="flex:1" onclick="App.copiarTxt('intTxt')">📋 Copiar listado</button>
        <button class="btn" style="flex:1;background:#eef2ff;color:#3a48b3" onclick="App.copiarTxt('intNums')">Copiar números</button>
      </div>
      <button class="btn" style="width:100%;margin-top:8px;background:#eef0f2;color:#555" onclick="App.cerrarModal()">Cerrar</button>`);
  },
  async crmFEmbudo(id,etapa){
    if(etapa==='cliente' && !confirm('¿Marcar PRIMER PEDIDO? Pasa a Clientes y sale de Prospectos.')){ this.vCrm(); return; }
    await this.sb.from('clientes').update({embudo:etapa}).eq('id',id);
    this.toast(etapa==='cliente'?'✅ ¡Convertido a Cliente!':'Embudo actualizado'); this.vCrm();
  },
  crmInteresadoAProspecto(i){
    const x=(this._crmFIntRaw||[])[i]; if(!x) return;
    // abre el registro pre-llenado para CLASIFICARLO (NC/GPJR/Especial) y completar datos; al guardar queda en etapa 'interesado'
    this.modalCliente(async(c)=>{ if(c&&c.id) await this._avanzarEmbudo(c.id,'interesado'); this._toast('🔥 Pasó a Prospectos en su cajón, etapa interesado'); this._crmFCanal='prospectos'; this.vCrm(); },
      {nombre:x.nombre, tel:x.cel, clase:x.mundo==='distribuidor'?'distribuidor':'empresa'});
  },
  _crmFItems(canal,cajon){
    const cli=this._crmFCli||[], inter=this._crmFInter||[], bot=this._crmFBot||[];
    const ETAPAS=[['contactado','📞 Contactado'],['interesado','🔥 Interesado'],['muestra','🎁 Muestra'],['cliente','✅ Primer pedido → Cliente']];
    const wa=tel=>{ const t=(tel||'').replace(/\D/g,''); return t?`<a class="btn-sm" style="background:var(--azul);color:#fff;text-decoration:none" href="tel:+57${t}">📞</a><button class="btn-sm" style="background:#25D366;color:#fff" onclick="window.open('https://wa.me/57${t}','_blank')">📲</button>`:''; };
    if(canal==='prospectos'){
      if(cajon==='inter'){   // 🔥 interesados CRUDOS de canales → a clasificar (no son prospectos aún)
        const raw=this._crmFIntRaw||[];
        const nInt=(this._crmFInter||[]).length;
        const btnLista=nInt?`<button class="btn-sm" style="width:100%;background:#0b1f2a;color:#fff;padding:11px;margin-bottom:10px;font-weight:700" onclick="App.crmInteresadosLista()">📋 Sacar listado de interesados (${nInt}) — llamar / remarketing</button>`:'';
        if(!raw.length) return btnLista+'<div class="empty">Sin interesados nuevos por clasificar. Aquí caen los que marques 🔥 Interesado en Marcador/Digital/Orgánico.</div>';
        return btnLista+raw.map((x,i)=>{ const key='i'+((x.cel||x.nombre)+'').replace(/[^a-z0-9]/gi,'').slice(0,26); return `<div class="item" style="display:block"><div class="top"><div><div class="nom">${esc(x.nombre||'—')}${x.cel?` <span style="font-weight:600;color:var(--naranja);font-size:13px">📱 ${esc(x.cel)}</span>`:''}</div><div class="meta">${x.ciudad?'📍 '+esc(x.ciudad)+' · ':''}${x.mundo==='distribuidor'?'🏪 distribuidor':'🏭 empresa'} · 🔥 interesado</div></div></div>${this._emb(key,-1,'marcador',x.nombre,x.cel)}</div>`; }).join('');
      }
      const arr=cli.filter(c=> cajon==='esp'?!!c.especial : cajon==='gpjr'?(!!c.recomendado&&!c.especial) : (!c.recomendado&&!c.especial));
      if(!arr.length) return `<div class="empty">Sin prospectos ${cajon==='esp'?'Especiales':cajon==='gpjr'?'GPJR':'NC'}.</div>`;
      const LBL=['Contactado','Interesado','Muestra','1er pedido'];
      return arr.map(c=>{
        const t=(c.tel||'').replace(/\D/g,'');
        const q=(this._crmFCots||{})[c.id];
        const seg=c.especial?'<span style="background:#fef3c7;color:#b8860b;font-weight:700;font-size:10.5px;padding:1px 7px;border-radius:9px">⭐⭐ Especial</span>':c.recomendado?'<span style="background:#fff7e6;color:#b8860b;font-size:10.5px;padding:1px 7px;border-radius:9px">⭐ GPJR</span>':'<span style="background:#eef2ff;color:#3a48b3;font-size:10.5px;padding:1px 7px;border-radius:9px">👤 NC</span>';
        const eIdx=ETAPAS.findIndex(e=>e[0]===c.embudo);   // sin marcar (null/'nuevo') => -1 => todas las bolitas vacías hasta que José marque
        let dots='';
        ETAPAS.forEach((e,i)=>{ if(i>0) dots+=`<div style="flex:1;height:3px;background:${i<=eIdx?'#16a34a':'#dfe3e8'};margin-top:9px"></div>`;
          const done=i<=eIdx,cur=i===eIdx;
          dots+=`<div onclick="App.crmFEmbudo(${c.id},'${e[0]}')" style="cursor:pointer;text-align:center;flex:0 0 auto"><div style="width:20px;height:20px;border-radius:50%;margin:0 auto;border:2px solid ${done?'#16a34a':'#cbd5e1'};background:${done?'#16a34a':'#fff'};color:#fff;font-size:11px;line-height:18px">${done?'✓':''}</div><div style="font-size:9px;margin-top:2px;color:${cur?'#16a34a':'#9aa3b0'};font-weight:${cur?'700':'400'}">${LBL[i]}</div></div>`; });
        return `<div class="item">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
            <div><div class="nom" style="cursor:pointer" onclick="App.crmEditarProsp(${c.id})">${esc(c.nombre||'—')}</div>
              <div class="meta">${c.tel?'📱 '+esc(c.tel):''}${c.ciudad?' · '+esc(c.ciudad):''}${c.contacto1?' · 👤 '+esc(c.contacto1):''} &nbsp;${seg}</div></div>
            <div style="display:flex;gap:5px"><button class="btn-sm" style="background:#6b7280;color:#fff" onclick="App.crmNota(${c.id})" title="Guardar nota del cliente">✏️ Nota</button></div>
          </div>
          <div style="display:flex;align-items:flex-start;margin-top:10px">${dots}</div>
          ${q?`<div style="font-size:11px;margin-top:8px;background:#fff7ed;border:1px solid #fed7aa;border-radius:7px;padding:6px 9px;display:flex;justify-content:space-between;align-items:center"><span style="color:#9a3412">📝 ${q.es_muestra?'Muestra':'Cotización'} <b>${money(+q.total||0)}</b> · ${esc(q.estado||'')}</span><button class="btn-sm" style="background:var(--naranja);color:#fff;padding:3px 11px" onclick="App.vCotizacionNueva('${q.id}')">ver</button></div>`:''}
          ${c.notas?`<div style="font-size:11px;color:#556;margin-top:7px;background:#f6f8fa;padding:5px 8px;border-radius:6px">📝 ${esc(c.notas)}</div>`:''}
        </div>`; }).join('');
    }
    if(canal==='marcador'){
      const mundo=cajon==='dist'?'distribuidor':'empresa';
      const total=cajon==='dist'?this._crmFCnt.dist:this._crmFCnt.emp;
      const res=(this._crmFRes||[]).filter(r=>(r.mundo||'empresa')===mundo);
      const trab=res.length, cubrir=Math.max(0,total-trab);
      const byCal={}; res.forEach(r=>{ const k=r.resultado||'—'; byCal[k]=(byCal[k]||0)+1; });
      const calBadge=r=>{ const v=(r.resultado||'').toLowerCase(); const c=/interes/.test(v)?'b-aceptada':/venta|muestra/.test(v)?'b-despachado':/no contesta|equiv|buz/.test(v)?'b-cotizada':'b-entregado'; return `<span class="badge ${c}">${esc(r.resultado||'—')}</span>`; };
      const cat=this._crmMarcCat||null;
      const cats=Object.entries(byCal).sort((a,b)=>b[1]-a[1]);
      const botones=cats.length?`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">${cats.map(([k,v])=>`<button class="btn-sm" style="font-weight:800;padding:9px 13px;background:${k===cat?'#0b1f2a':'#eef2ff'};color:${k===cat?'#fff':'#3a48b3'}" onclick="App.crmMarcCat('${(k||'').replace(/'/g,'')}')">${esc(k)} <b>${v}</b></button>`).join('')}</div>`:'';
      const resumen=`<div class="card" style="border-left:4px solid var(--naranja)">
        <div style="font-size:12px;color:#667;margin-bottom:8px">👤 Asesor: <b>NC</b> <span style="color:#9aa3b0">(por ahora trabaja todo · filtro por asesor/ciudad/base: próximamente)</span></div>
        <div class="kpis"><div class="kpi"><b>${total.toLocaleString('es-CO')}</b><span>Total ${mundo==='distribuidor'?'distribuidores':'empresas'}</span></div>
          <div class="kpi verde"><b>${trab.toLocaleString('es-CO')}</b><span>Trabajados</span></div>
          <div class="kpi naranja"><b>${cubrir.toLocaleString('es-CO')}</b><span>Por cubrir</span></div></div>
        ${botones}
        ${cats.length?`<div style="font-size:11px;color:#9aa3b0;margin-top:8px">👆 Toca una categoría para ver esos contactos</div>`:''}
      </div>`;
      let lista='';
      if(!cats.length){ lista='<div class="empty">Aún sin trabajados. Se llenan desde el <b>Marcador</b> (power-dialer). Los 🔥 Interesado caen a Prospectos → Interesados.</div>'; }
      else if(cat){ const sel=res.filter(r=>(r.resultado||'—')===cat);
        lista=sel.length? sel.map(r=>{ const key='m'+((r.cel||r.nombre)+'').replace(/[^a-z0-9]/gi,'').slice(0,26); const base=-1; return `<div class="item" style="display:block"><div class="top"><div><div class="nom">${esc(r.nombre||'—')}</div><div class="meta">📱 ${esc(r.cel||'')}${r.fecha?' · 📅 '+esc((r.fecha||'').slice(0,10)):''}</div></div>${calBadge(r)}</div>${this._emb(key,base,'marcador',r.nombre,r.cel)}</div>`; }).join('')
          : '<div class="empty">Sin contactos en esta categoría.</div>'; }
      return resumen+lista;
    }
    if(canal==='digital'){
      const etOf=b=>{ const v=(b.etiqueta||'').toLowerCase(); return /distribu/.test(v)?'distribuidor':/interes/.test(v)?'interesado':'curioso'; };
      const arr=(bot||[]).filter(b=>etOf(b)===cajon); this._crmFLeadShown=arr;
      const nom={curioso:'Curiosos',interesado:'Interesados',distribuidor:'Distribuidores'}[cajon]||'Digital';
      const cur=(bot||[]).filter(b=>/curios/i.test(b.etiqueta||'')).length, intr=(bot||[]).filter(b=>/interes|distribu/i.test(b.etiqueta||'')).length;
      const head=`<div class="card" style="border-left:4px solid var(--naranja)"><div style="font-size:12px;color:#667">💬 WhatsApp Feroz (Sofía) · <b>${nom}</b></div><div class="kpis" style="margin-top:6px"><div class="kpi"><b>${(bot||[]).length}</b><span>Leads totales</span></div><div class="kpi"><b>${cur}</b><span>👀 Curiosos</span></div><div class="kpi naranja"><b>${intr}</b><span>🔥 Calientes</span></div></div></div>`;
      if(!arr.length) return head+'<div class="empty">Aún sin leads en este estado. Los llena Sofía (el bot de Feroz) en tiempo real.</div>';
      return head+arr.map((b,i)=>this._cardLead(b,i,'digital',cajon)).join('');
    }
    if(canal==='organico'){
      const estOf=b=>{ const v=(b.etiqueta||'').toLowerCase(); return /cotiz/.test(v)?'cotiz':/interes/.test(v)?'interesado':'curioso'; };
      const arr=(bot||[]).filter(b=>/organic|seo|red/i.test(b.origen||b.canal||'')).filter(b=>estOf(b)===cajon); this._crmFLeadShown=arr;
      const nom={curioso:'Curiosos',interesado:'Interesados',cotiz:'Cotización'}[cajon]||'Orgánico';
      if(!arr.length) return `<div class="empty">🌱 ${nom} — orgánico (SEO/redes) aún sin conectar. Aquí caerán los leads que lleguen por buscadores/redes en estado ${esc(nom.toLowerCase())}, con su botón "→ Pasar a Prospecto".</div>`;
      return arr.map((b,i)=>this._cardLead(b,i,'organico')).join('');
    }
    return '';
  },
  _cardLead(b,i,canal,cajon){
    canal=canal||'digital';
    const v=(b.etiqueta||'').toLowerCase();
    const tag=/interes/.test(v)?'interesado':/kit/.test(v)?'kit':/curios/.test(v)?'curioso':'';
    const key=canal[0]+((b.telefono||b.nombre)+'').replace(/[^a-z0-9]/gi,'').slice(0,26);
    const base=canal==='digital'?this._baseEtapa('digital',tag):-1;   // digital auto interesado/kit · orgánico vacío
    const c=/interes/.test(v)?'b-aceptada':/cotiz/.test(v)?'b-cotizada':'b-entregado';
    const mode=cajon==='distribuidor'?'full':cajon==='interesado'?'seg':'none';   // distribuidor: 3 círculos · interesado: seguimiento · resto: liviano
    const anular=(cajon&&cajon!=='curioso')?`<div style="text-align:right;margin-top:6px"><button class="btn-sm" style="background:#fde8e8;color:#b3261e;padding:4px 11px;font-size:12px" onclick="App.crmLeadAnular('${(b.telefono||'').toString().replace(/\D/g,'')}')">↩️ Anular → Curioso</button></div>`:'';
    const ciu=String(b.ciudad||'').trim();
    const ciuHTML = ciu ? `<span style="font-weight:700;color:#0b6b4f">📍 ${esc(ciu)}</span>`
                        : `<span style="color:#b45309">📍 sin ciudad</span>`;
    return `<div class="item" style="display:block"><div class="top"><div><div class="nom">${esc(b.nombre||b.telefono||'—')}${b.telefono?` <span style="font-weight:600;color:var(--naranja);font-size:13px">📱 ${esc(b.telefono)}</span>`:''}</div><div class="meta">${ciuHTML}${b.producto?' · '+esc(b.producto):''}</div></div><span class="badge ${c}">${esc(b.etiqueta||'lead')}</span></div>${this._emb(key,base,canal,b.nombre,b.telefono,mode)}${anular}</div>`;
  },
  /* 📍 DE DÓNDE NOS ESCRIBEN — ciudades del cajón (curiosos / interesados / distribuidores) */
  _ciudBar(cajon){
    const bot=this._crmFBot||[];
    const etOf=b=>{ const v=(b.etiqueta||'').toLowerCase(); return /distribu/.test(v)?'distribuidor':/interes/.test(v)?'interesado':'curioso'; };
    const arr=bot.filter(b=>etOf(b)===cajon);
    if(!arr.length) return '';
    // normaliza: quita el depto ("Sogamoso, Boyacá"→"Sogamoso") y agrupa sin tildes ("Bogota"="Bogotá")
    const label=s=>{ let t=String(s||'').split(',')[0].trim().replace(/\s+/g,' ').replace(/\s+d\.?\s*c\.?$/i,''); if(!t) return '';
      return t.split(' ').map(w=>w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()).join(' '); };
    const clave=s=>label(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
    const m={}; let sin=0;
    arr.forEach(b=>{ const k=clave(b.ciudad); if(!k){ sin++; return; } if(!m[k]) m[k]={l:label(b.ciudad),n:0}; m[k].n++; });
    const top=Object.values(m).sort((a,b)=>b.n-a.n).map(x=>[x.l,x.n]);
    const chip=(txt,n,bg,col)=>`<span style="background:${bg};color:${col};border-radius:20px;padding:5px 11px;font-size:12.5px;font-weight:600;white-space:nowrap">${txt} <b>${n}</b></span>`;
    const chips=top.map(([c,n])=>chip('📍 '+esc(c),n,'#e7f6f0','#0b6b4f')).join('');
    const sinChip=sin?chip('❓ sin ciudad',sin,'#fff3e0','#b45309'):'';
    const pct=Math.round(((arr.length-sin)/arr.length)*100);
    return `<div style="border:1px solid var(--linea);border-radius:12px;padding:11px 13px;margin-bottom:10px;background:#fafbfc">
      <div style="font-size:10.5px;font-weight:700;letter-spacing:.06em;color:var(--suave);text-transform:uppercase;margin-bottom:7px">📍 De dónde nos escriben · ${arr.length} leads · ${pct}% con ciudad</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${chips}${sinChip}</div></div>`;
  },
  async crmLeadAnular(tel){
    tel=(tel||'').toString().replace(/\D/g,''); if(!tel) return;
    if(!confirm('¿Anular este lead y devolverlo a Curioso?')) return;
    try{ await fetch(this._SBU()+'/rest/v1/nc_bot_leads_feroz?telefono=eq.'+encodeURIComponent(tel),{method:'PATCH',headers:{apikey:this._SBK(),Authorization:'Bearer '+this._SBK(),'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify({etiqueta:'curioso'})}); }catch(e){}
    this._toast('↩️ Devuelto a Curioso'); this.vCrm();
  },
  crmLeadAProspecto(i){
    const b=(this._crmFLeadShown||[])[i]; if(!b) return;
    const clase=/empresa/.test((b.etiqueta||'').toLowerCase())?'empresa':'distribuidor';
    const et=(b.etiqueta||'').toLowerCase();
    this.modalCliente(async(c)=>{ if(c&&c.id) await this._avanzarEmbudo(c.id, /interes|cotiz/.test(et)?'interesado':'contactado'); this._crmFCanal='prospectos'; this.vCrm(); },
      {nombre:b.nombre, tel:b.telefono, ciudad:b.ciudad, clase});
  },

  /* ---------- COBERTURA: drill-down geográfico ---------- */
  async vCobertura(){
    if(!window.GEO_CO){ this.set('<div class="empty">No cargó la data geográfica.</div>'); return; }
    this.cob = this.cob || {nivel:'zonas'};
    const G=window.GEO_CO, c=this.cob;
    const fmt=n=>(n||0).toLocaleString('es-CO')+' hab';
    const { data:cli=[] } = await this.sb.from('clientes').select('depto,ciudad,localidad,clase');
    const cuenta=(pred)=>{let d=0,e=0;(cli||[]).forEach(x=>{if(pred(x)){if(x.clase==='distribuidor')d++;else e++;}});return {d,e};};
    const cc=o=>`🏪 ${o.d} dist · 🏢 ${o.e} emp`;
    const ruta=[]; if(c.zona)ruta.push(c.zona); if(c.depto)ruta.push(c.depto); if(c.ciudad)ruta.push(c.ciudad);
    const back = c.nivel!=='zonas' ? `<button class="btn-sm btn-ghost" style="border:1px solid var(--linea);margin-bottom:10px" onclick="App.cobBack()">← Volver</button>` : '';
    const bc = ruta.length ? `<div class="hint" style="margin-bottom:8px">${ruta.map(esc).join(' › ')}</div>` : '';
    let titulo, items=[];
    const fila=(nom,sub,onclick,flecha)=>`<div class="item" ${onclick?`style="cursor:pointer" onclick="${onclick}"`:''}><div class="top"><div>
        <div class="nom">${esc(nom)} ${flecha&&onclick?'<span style="font-size:12px;color:var(--suave)">›</span>':''}</div>
        ${sub?`<div class="meta">${sub}</div>`:''}</div></div></div>`;

    if(c.nivel==='zonas'){
      titulo='Áreas logísticas (6)';
      items=G.zonas.map(z=>{const pob=z.deptos.reduce((a,d)=>a+(d.pob||0),0);
        const deps=new Set(z.deptos.map(d=>d.nombre)); const o=cuenta(x=>deps.has(x.depto));
        return fila(z.nombre, `hub ${z.hub} · ${fmt(pob)} · ${cc(o)}`, `App.cobDrill('deptos','${z.nombre.replace(/'/g,"")}')`, true);});
    } else if(c.nivel==='deptos'){
      const z=G.zonas.find(x=>x.nombre===c.zona)||{deptos:[]};
      const deps=z.deptos.filter(d=>(d.pob||0)>500000).sort((a,b)=>b.pob-a.pob);
      titulo=`${c.zona} — departamentos > 500.000 hab (${deps.length})`;
      items=deps.map(d=>{const o=cuenta(x=>x.depto===d.nombre); return fila(d.nombre, `${fmt(d.pob)} · ${cc(o)}`, `App.cobDrill('ciudades','${d.nombre.replace(/'/g,"")}')`, true);});
    } else if(c.nivel==='ciudades'){
      const z=G.zonas.find(x=>x.nombre===c.zona)||{deptos:[]};
      const d=z.deptos.find(x=>x.nombre===c.depto)||{ciudades:[]};
      const cds=(d.ciudades||[]).filter(x=>(x.pob||0)>=160000).sort((a,b)=>b.pob-a.pob);
      titulo=`${c.depto} — municipios > 160.000 hab (${cds.length})`;
      items=cds.map(x=>{const o=cuenta(y=>y.ciudad===x.nombre); return fila(x.nombre, `${fmt(x.pob)} · ${cc(o)}`, x.localidades?`App.cobDrill('localidades','${x.nombre.replace(/'/g,"")}')`:'', !!x.localidades);});
      if(!cds.length) items=[`<div class="empty">Sin municipios > 160.000 hab en ${esc(c.depto)}.</div>`];
    } else if(c.nivel==='localidades'){
      const z=G.zonas.find(x=>x.nombre===c.zona)||{deptos:[]};
      const d=z.deptos.find(x=>x.nombre===c.depto)||{ciudades:[]};
      const cd=(d.ciudades||[]).find(x=>x.nombre===c.ciudad)||{};
      const locs=cd.localidades||[];
      const { data:rows=[] } = await this.sb.from('cobertura_loc').select('localidad,aplica').eq('ciudad', c.ciudad);
      const ap={}; (rows||[]).forEach(r=>ap[r.localidad]=r.aplica);
      const cj=esc(c.ciudad).replace(/'/g,'');
      const sorted=locs.slice().sort((a,b)=>((ap[b]!==false)?1:0)-((ap[a]!==false)?1:0)); // aplican arriba, apagadas abajo
      titulo=`${c.ciudad} — localidades/comunas (${locs.length})`;
      items = locs.length ? sorted.map(l=>{
        const aplica=(ap[l]!==false); const o=cuenta(x=>x.ciudad===c.ciudad && x.localidad===l); const lj=esc(l).replace(/'/g,'');
        return `<div class="item" style="${aplica?'':'opacity:.5'}"><div class="top" style="align-items:center"><div>
            <div class="nom">${esc(l)}</div>
            <div class="meta">${aplica?`🏪 Distribuidores: <b>${o.d}</b> · 🏢 Empresas: <b>${o.e}</b>`:'🚫 No aplica (zona descartada)'}</div>
          </div>
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;white-space:nowrap"><input type="checkbox" ${aplica?'checked':''} onchange="App.cobToggle('${cj}','${lj}',this.checked)" style="width:18px;height:18px;accent-color:var(--naranja)">Aplica</label>
        </div></div>`;
      }) : ['<div class="empty">Sin localidades cargadas.</div>'];
    }
    this.set(`<h1>🗺️ Cobertura</h1><div class="sub">${esc(titulo)}</div>${bc}${back}${items.join('')}`);
  },
  cobDrill(nivel,valor){
    const c=this.cob||{nivel:'zonas'};
    if(nivel==='deptos') this.cob={nivel:'deptos', zona:valor};
    else if(nivel==='ciudades') this.cob={nivel:'ciudades', zona:c.zona, depto:valor};
    else if(nivel==='localidades') this.cob={nivel:'localidades', zona:c.zona, depto:c.depto, ciudad:valor};
    this.vCobertura();
  },
  cobBack(){
    const c=this.cob||{nivel:'zonas'};
    const orden=['zonas','deptos','ciudades','localidades'];
    const i=Math.max(0, orden.indexOf(c.nivel)-1);
    const nivel=orden[i];
    this.cob = nivel==='zonas'?{nivel:'zonas'}: nivel==='deptos'?{nivel:'deptos',zona:c.zona}: {nivel:'ciudades',zona:c.zona,depto:c.depto};
    this.vCobertura();
  },
  async cobToggle(ciudad,localidad,aplica){
    const { error } = await this.sb.from('cobertura_loc').upsert({ciudad,localidad,aplica},{onConflict:'ciudad,localidad'});
    if(error){ alert('Error: '+error.message); return; }
    this.vCobertura();
  },

  /* ---------- PLANTA: inventario real (movimientos) + cobertura ---------- */
  async vPlanta(){
    this.ptab = this.ptab || 'inv';
    this.loading();
    const [inv, movs, peds, pp, cfg, pedF, gar] = await Promise.all([
      this.sb.from('inventario').select('*').eq('referencia','701').order('talla'),
      this.sb.from('inv_movimientos').select('*').eq('referencia','701').order('creado_en',{ascending:false}).limit(400),
      this.sb.from('pedidos').select('cliente_snap,creado_en,curva,estado,total,pares,es_muestra').neq('estado','anulado'),
      this.sb.from('pedidos_planta').select('*').neq('estado','anulado').order('creado_en',{ascending:false}),
      this.sb.from('config').select('value').eq('key','planta_whatsapp').maybeSingle(),
      this.sb.from('pedidos').select('id,numero,cliente_id,cliente_snap,curva,pares,total,estado,creado_en').neq('estado','anulado').order('creado_en',{ascending:false}),
      this.sb.from('garantias').select('*').order('creado_en',{ascending:false})
    ]);
    this._pedFull = pedF.data||[]; this._garantias = gar.data||[];
    this._inv={}; (inv.data||[]).forEach(r=>this._inv[r.talla]=r.stock);
    this._movs = movs.data||[];
    this._peds = peds.data||[];
    this._pedplanta = pp.data||[];
    this._cfgPlantaWa = (cfg.data && cfg.data.value) ? cfg.data.value : null;
    const _H={apikey:this._SBK(),Authorization:'Bearer '+this._SBK()};
    let _metas=[], _pend=[];
    try{ _metas=await (await fetch(this._SBU()+'/rest/v1/nc_metas?empresa=eq.feroz&order=mes_num',{headers:_H})).json(); }catch(e){}
    try{ _pend=await (await fetch(this._SBU()+'/rest/v1/nc_pendientes?empresa=eq.feroz&order=fecha.desc,creado_en.desc',{headers:_H})).json(); }catch(e){}
    this._metas=Array.isArray(_metas)?_metas:[]; this._pend=Array.isArray(_pend)?_pend:[];
    this._ventasP=(this._peds||[]).filter(p=>!p.es_muestra&&(+p.total||0)>0);   // ejecutado real (sesión autenticada)
    this._comp={};
    this._peds.filter(p=>['pendiente_pago','consignado','autorizado'].includes(p.estado))
      .forEach(p=>{const c=p.curva||{};Object.entries(c).forEach(([t,q])=>this._comp[t]=(this._comp[t]||0)+(+q||0));});
    const INV2=[{k:'inv',t:'📦 Inventario'},{k:'ped',t:'Pedido Feroz'},{k:'ing',t:'Ingreso Bodega'},{k:'cont',t:'Conteo Auditoría'},{k:'mov',t:'Movimientos'},{k:'cob',t:'Cobertura'}];
    const inGroup=INV2.some(x=>x.k===this.ptab);
    const L1=[{k:'inv',t:'📦 Inventario',a:inGroup},{k:'garant',t:'🛡️ Garantías',a:this.ptab==='garant'},{k:'metas',t:'🎯 Meta Ventas',a:this.ptab==='metas'},{k:'pend',t:'📌 Pendientes',a:this.ptab==='pend'}];
    const btn=(k,t,a,sub)=>`<button class="btn-sm" style="white-space:nowrap;${a?(sub?'background:#334155;color:#fff':'background:var(--naranja);color:#fff'):'background:#fff;border:1px solid var(--linea);color:var(--suave)'}" onclick="App.ptab='${k}';App.vPlanta()">${t}</button>`;
    const bar1=`<div style="display:flex;gap:6px;overflow:auto;margin-bottom:8px;padding-bottom:2px">`+L1.map(x=>btn(x.k,x.t,x.a,false)).join('')+`</div>`;
    const bar2=inGroup?`<div style="display:flex;gap:6px;overflow:auto;margin-bottom:12px;padding-bottom:2px;padding-left:8px;border-left:3px solid var(--naranja)">`+INV2.map(x=>btn(x.k,x.t,this.ptab===x.k,true)).join('')+`</div>`:'';
    const body={inv:this.subInv,ped:this.subPed,ing:this.subIng,cont:this.subCont,mov:this.subMov,cob:this.subCob,metas:this.subMetas,pend:this.subPend,garant:this.subGarant}[this.ptab].call(this);
    this.set(`<h1>🏭 Planta</h1><div class="sub">Inventario en tiempo real · Ref. 701</div>${bar1}${bar2}${body}`);
  },
  subMetas(){
    const cl=n=>'$'+Math.round(n||0).toLocaleString('es-CO');
    const MESES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    const ejec={}; (this._ventasP||[]).forEach(p=>{ const k=new Date(p.creado_en).getMonth()+1; ejec[k]=(ejec[k]||0)+(+p.total||0); });
    const metas=(this._metas||[]).slice().sort((a,b)=>(a.mes_num||0)-(b.mes_num||0));
    if(!metas.length) return `<div class="card" style="border-left:4px solid #f0a500"><b style="color:#7a5800">🎯 Metas de Feroz sin cargar</b><div style="font-size:12.5px;color:#445;margin-top:5px">Dime la meta en $ por mes (ene…dic) y las activo igual que en Smart. Mientras, esto es lo <b>ejecutado real</b> por mes:</div>${Object.keys(ejec).length?'<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px"><tbody>'+Object.entries(ejec).sort((a,b)=>a[0]-b[0]).map(([m,vv])=>`<tr><td>${MESES[m-1]}-2026</td><td style="text-align:right"><b>${cl(vv)}</b></td></tr>`).join('')+'</tbody></table>':'<div class="empty" style="margin-top:6px">Sin ventas todavía.</div>'}</div>`;
    const totM=metas.reduce((a,m)=>a+(+m.meta||0),0), totE=Object.values(ejec).reduce((a,v)=>a+v,0), curN=new Date().getMonth()+1;
    return `<div class="card"><h2 style="font-size:15px">🎯 Presupuesto de metas · OFICIAL</h2>
      <div class="sub" style="margin-bottom:10px">Meta $ por mes vs ejecutado real · meta año ${cl(totM)} · ejecutado ${cl(totE)}</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr><th style="text-align:left">Mes</th><th style="text-align:right">Meta $</th><th style="text-align:right">Ejecutado</th><th style="text-align:right">%</th></tr></thead><tbody>
        ${metas.map(m=>{ const meta=+m.meta||0, e=ejec[m.mes_num]||0, pct=meta?e/meta*100:0, ok=pct>=100, fut=m.mes_num>curN;
          return `<tr style="${fut?'opacity:.45':''}"><td><b>${esc(m.mes)}</b></td><td style="text-align:right">${cl(meta)}</td><td style="text-align:right">${e?cl(e):'—'}</td><td style="text-align:right;font-weight:800;color:${fut?'#8a93a6':ok?'#16a34a':'#dc2626'}">${e?pct.toFixed(0)+'%':'—'}</td></tr>
            <tr><td colspan="4" style="padding:0 0 7px"><div style="height:7px;background:#eef1f5;border-radius:5px;overflow:hidden"><div style="height:100%;width:${Math.min(100,pct).toFixed(0)}%;background:${ok?'#16a34a':'#dc2626'}"></div></div></td></tr>`; }).join('')}
        <tr style="font-weight:800;border-top:2px solid #ddd"><td>TOTAL</td><td style="text-align:right">${cl(totM)}</td><td style="text-align:right">${cl(totE)}</td><td style="text-align:right;color:${totE>=totM?'#16a34a':'#dc2626'}">${totM?(totE/totM*100).toFixed(0):0}%</td></tr>
      </tbody></table></div>`;
  },
  subPend(){ return this._pendBody(this._pend); },

  /* ---------- GARANTÍAS / DEVOLUCIONES (entrega en bodega + foto + WhatsApp) ---------- */
  subGarant(){
    const peds=this._pedFull||[], gars=this._garantias||[];
    const sel=this._garSelId||'';
    const pedSel=peds.find(p=>String(p.id)===String(sel));
    const opts=peds.map(p=>{const c=p.cliente_snap||{};return `<option value="${p.id}" ${String(p.id)===String(sel)?'selected':''}>${esc(p.numero||('#'+p.id))} — ${esc(c.nombre||'cliente')} — ${p.pares||0} pares</option>`;}).join('');
    let grid='';
    if(pedSel){const cu=pedSel.curva||{};const ts=Object.keys(cu).sort((a,b)=>a-b);
      grid=ts.length?`<label>Pares a devolver por talla</label><div class="grid-tallas" id="gar_grid">`+ts.map(t=>`<div class="t"><span>Talla ${t} (${cu[t]})</span><input type="number" min="0" max="${cu[t]}" inputmode="numeric" data-talla="${t}" placeholder="0"></div>`).join('')+`</div>`:`<div class="hint">Este pedido no tiene curva de tallas registrada.</div><div id="gar_grid"></div>`;}
    const bc={abierta:'#f59e0b',enviada_planta:'#3b82f6',resuelta:'#16a34a',anulada:'#94a3b8'};
    const lista=gars.length?gars.map(g=>{const c=g.cliente_snap||{},cu=g.curva||{};
      return `<div class="item" style="display:block"><div class="top"><div>
        <div class="nom">${esc(c.nombre||'cliente')} <span class="badge" style="background:${bc[g.estado]||'#999'};color:#fff">${(g.estado||'').replace('_',' ')}</span></div>
        <div class="meta">${esc(g.tipo)} · ${g.pares||0} pares · ${new Date(g.creado_en).toLocaleDateString('es-CO')}${g.motivo?'<br>📝 '+esc(g.motivo):''}<br>${Object.entries(cu).map(([t,q])=>'T'+t+':'+q).join(' · ')}</div></div>
        ${g.foto_url?`<a href="${g.foto_url}" target="_blank"><img src="${g.foto_url}" style="width:52px;height:52px;object-fit:cover;border-radius:8px"></a>`:''}</div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:6px">
          <button class="btn-sm" style="background:#111;color:#fff" onclick="App.garDoc(${g.id})">🖨️ Documento</button>
          <button class="btn-sm" style="background:#25d366;color:#fff" onclick="App.garWa(${g.id},'dest')">📲 Bodega 316</button>
          <button class="btn-sm" style="background:#0e8a4f;color:#fff" onclick="App.garWa(${g.id},'copia')">📋 Copia 323</button>
          ${g.estado==='abierta'?`<button class="btn-sm" style="background:#3b82f6;color:#fff" onclick="App.garEstado(${g.id},'enviada_planta')">📤 Enviada</button>`:''}
          ${(g.estado!=='resuelta'&&g.estado!=='anulada')?`<button class="btn-sm" style="background:#16a34a;color:#fff" onclick="App.garEstado(${g.id},'resuelta')">✅ Resuelta</button>`:''}
        </div></div>`;}).join(''):'<div class="empty">Aún no hay garantías ni devoluciones.</div>';
    // análisis de recurrencia (para ver los errores más comunes)
    const cFalla={},cTalla={},cCli={}; let nG=0,totPares=0;
    gars.forEach(g=>{ if(g.estado==='anulada')return; nG++; totPares+=(+g.pares||0);
      const f=g.falla||'Sin clasificar'; (cFalla[f]=cFalla[f]||{n:0,p:0}); cFalla[f].n++; cFalla[f].p+=(+g.pares||0);
      const nm=(g.cliente_snap||{}).nombre||'—'; cCli[nm]=(cCli[nm]||0)+1;
      Object.entries(g.curva||{}).forEach(([t,q])=>{cTalla[t]=(cTalla[t]||0)+(+q||0);}); });
    const topF=Object.entries(cFalla).sort((a,b)=>b[1].n-a[1].n).slice(0,6);
    const topT=Object.entries(cTalla).sort((a,b)=>b[1]-a[1]).slice(0,6);
    const topC=Object.entries(cCli).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const mF=topF.reduce((a,x)=>Math.max(a,x[1].n),0),mT=topT.reduce((a,x)=>Math.max(a,x[1]),0),mC=topC.reduce((a,x)=>Math.max(a,x[1]),0);
    const bar=(l,v,mx,ex)=>`<div style="margin-bottom:5px"><div style="display:flex;justify-content:space-between;font-size:12px"><span>${esc(l)}</span><b>${v}${ex||''}</b></div><div style="height:6px;background:#eef1f5;border-radius:4px;overflow:hidden"><div style="height:100%;width:${mx?Math.round(v/mx*100):0}%;background:var(--naranja)"></div></div></div>`;
    const analisis=nG?`<div class="card"><label>📊 Análisis de recurrencia</label>
      <div class="kpis"><div class="kpi"><b>${nG}</b><span>Casos</span></div><div class="kpi naranja"><b>${totPares}</b><span>Pares devueltos</span></div></div>
      <div style="font-size:13px;font-weight:700;margin:6px 0 4px">🔍 Fallas más frecuentes</div>${topF.map(([f,v])=>bar(f,v.n,mF,' · '+v.p+' pares')).join('')||'<div class="hint">—</div>'}
      <div style="font-size:13px;font-weight:700;margin:10px 0 4px">👟 Tallas que más fallan</div>${topT.map(([t,v])=>bar('Talla '+t,v,mT)).join('')||'<div class="hint">—</div>'}
      <div style="font-size:13px;font-weight:700;margin:10px 0 4px">🧑 Clientes con más casos</div>${topC.map(([c,v])=>bar(c,v,mC)).join('')||'<div class="hint">—</div>'}</div>`:'';
    return `${analisis}<div class="card"><label>🛡️ Nueva garantía / devolución</label>
      <div class="hint">Elige el pedido, marca los pares por talla que se devuelven, adjunta la foto y genera el documento. Se ENTREGA EN BODEGA (no en planta).</div>
      <label>Pedido del cliente</label>
      <select class="field" id="gar_ped" onchange="App._garSelId=this.value;App.vPlanta()"><option value="">— elige un pedido —</option>${opts}</select>
      ${pedSel?`<div style="font-size:12.5px;color:#556;margin:4px 0 8px">Cliente: <b>${esc((pedSel.cliente_snap||{}).nombre||'')}</b> · NIT ${esc((pedSel.cliente_snap||{}).nit||'—')} · ${esc((pedSel.cliente_snap||{}).tel||(pedSel.cliente_snap||{}).celular||'—')}</div>
      ${grid}
      <label>Tipo</label>
      <select class="field" id="gar_tipo"><option value="garantia">Garantía (defecto de fábrica)</option><option value="devolucion">Devolución</option><option value="cambio">Cambio de talla</option></select>
      <label>🔍 Tipo de falla (para el análisis)</label>
      <select class="field" id="gar_falla">${(C.FALLAS||['Otro']).map(f=>`<option value="${f}">${f}</option>`).join('')}</select>
      <label>📦 Bodega de entrega</label>
      <select class="field" id="gar_bodega">${(C.BODEGAS||['Bodega']).map(b=>`<option value="${b}">${b}</option>`).join('')}</select>
      <label>Motivo / observación</label>
      <textarea class="field" id="gar_motivo" rows="2" placeholder="Ej: costura abierta en 3 pares talla 40"></textarea>
      <label>📷 Foto de la mercancía / entrega</label>
      <input class="field" id="gar_foto" type="file" accept="image/*" capture="environment">
      <button class="btn btn-main" id="gar_btn" onclick="App.garSave()">Registrar y generar documento</button>`:''}
    </div>
    <div class="card"><label>📋 Garantías y devoluciones</label>${lista}</div>`;
  },
  async garSave(){
    const pid=this._garSelId; if(!pid){alert('Elige un pedido');return;}
    const ped=(this._pedFull||[]).find(p=>String(p.id)===String(pid)); if(!ped)return;
    const curva={};let pares=0;
    document.querySelectorAll('#gar_grid input').forEach(i=>{const q=+i.value||0;if(q>0){curva[i.dataset.talla]=q;pares+=q;}});
    if(pares<=0){alert('Indica cuántos pares se devuelven');return;}
    const tipo=(document.getElementById('gar_tipo')||{}).value||'garantia';
    const falla=(document.getElementById('gar_falla')||{}).value||null;
    const bodega=((document.getElementById('gar_bodega')||{}).value||'Bodega').trim();
    const motivo=((document.getElementById('gar_motivo')||{}).value||'').trim();
    const btn=document.getElementById('gar_btn'); if(btn){btn.disabled=true;btn.textContent='Guardando…';}
    let foto_url=null;
    const fi=document.getElementById('gar_foto');
    if(fi&&fi.files&&fi.files[0]){
      try{const f=fi.files[0];const ext=(f.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
        const path='g_'+pid+'_'+Math.floor(performance.now())+'.'+ext;
        const up=await this.sb.storage.from('garantias').upload(path,f,{contentType:f.type||'image/jpeg',upsert:true});
        if(!up.error) foto_url=this.sb.storage.from('garantias').getPublicUrl(path).data.publicUrl;
      }catch(e){}
    }
    const reg={pedido_id:ped.id,cliente_id:ped.cliente_id,cliente_snap:ped.cliente_snap,tipo,falla,curva,pares,motivo,estado:'abierta',entregar_en:bodega,foto_url};
    try{if(this.user&&this.user.id) reg.creado_por=this.user.id;}catch(e){}
    const {data,error}=await this.sb.from('garantias').insert(reg).select().single();
    if(error){alert('Error: '+error.message);if(btn){btn.disabled=false;btn.textContent='Registrar y generar documento';}return;}
    this._garSelId='';
    await this.vPlanta();
    this.garDoc(data.id);
  },
  async garEstado(id,estado){
    if(estado==='anulada'&&!confirm('¿Anular esta garantía?'))return;
    await this.sb.from('garantias').update({estado,actualizado_en:new Date().toISOString()}).eq('id',id);
    this.vPlanta();
  },
  _garTxt(g){
    const c=g.cliente_snap||{},cu=g.curva||{};
    const ped=(this._pedFull||[]).find(p=>String(p.id)===String(g.pedido_id))||{};
    const tallas=Object.entries(cu).sort((a,b)=>a[0]-b[0]).map(([t,q])=>'T'+t+':'+q).join(', ');
    return `🥾 DEVOLUCIÓN A BODEGA — Feroz\nNº ${String(g.id).padStart(5,'0')} · ${new Date(g.creado_en).toLocaleDateString('es-CO')}\n`+
      `Cliente: ${c.nombre||''} (NIT ${c.nit||'—'})\nPedido: ${ped.numero||('#'+g.pedido_id)}\nTipo: ${g.tipo}${g.falla?' — '+g.falla:''}\n`+
      `Ref 701 — ${tallas} (${g.pares} pares)\nMotivo: ${g.motivo||'—'}\nEntregar en: ${g.entregar_en||'Bodega'}`+
      (g.foto_url?`\n📷 Foto: ${g.foto_url}`:'');
  },
  garWa(id,quien){
    const g=(this._garantias||[]).find(x=>String(x.id)===String(id)); if(!g)return;
    const num=quien==='copia'?'573236375088':'573164824615';
    window.open('https://wa.me/'+num+'?text='+encodeURIComponent(this._garTxt(g)),'_blank');
  },
  garDoc(id){
    const g=(this._garantias||[]).find(x=>String(x.id)===String(id)); if(!g)return;
    const c=g.cliente_snap||{},cu=g.curva||{};
    const ped=(this._pedFull||[]).find(p=>String(p.id)===String(g.pedido_id))||{};
    const fecha=new Date(g.creado_en).toLocaleDateString('es-CO');
    const filas=Object.entries(cu).sort((a,b)=>a[0]-b[0]).map(([t,q])=>`<tr><td>Ref. 701 — Talla ${t}</td><td style="text-align:center">${q}</td></tr>`).join('');
    const tipoTxt={garantia:'GARANTÍA (defecto de fábrica)',devolucion:'DEVOLUCIÓN',cambio:'CAMBIO DE TALLA'}[g.tipo]||g.tipo;
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>Devolucion ${g.id}</title>
      <style>body{font-family:Arial,sans-serif;color:#111;max-width:720px;margin:22px auto;padding:0 18px}
      h1{font-size:20px;margin:0}.muted{color:#666;font-size:12px}table{width:100%;border-collapse:collapse;margin:12px 0}
      th,td{border:1px solid #ccc;padding:7px;font-size:13px}th{background:#f3f4f6;text-align:left}
      .box{border:1px solid #ddd;border-radius:8px;padding:12px;margin:10px 0}.firmas{display:flex;gap:40px;margin-top:46px}
      .firma{flex:1;border-top:1px solid #111;padding-top:6px;font-size:12px;text-align:center}
      .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #e8551f;padding-bottom:10px}
      .destaca{background:#fff4ed;border:1px solid #e8551f;color:#b23c10;font-weight:800;padding:8px;border-radius:8px;text-align:center;margin:10px 0}
      img.ev{max-width:260px;border:1px solid #ccc;border-radius:8px;margin-top:8px}</style></head><body>
      <div class="head"><div><h1>FEROZ SAFETY WEAR</h1><div class="muted">FUELING EQUIPMENT &amp; SUPPLIES SAS · NIT 902025524</div></div>
        <div style="text-align:right"><div style="font-weight:800;color:#e8551f">DEVOLUCIÓN / GARANTÍA</div><div class="muted">Nº ${String(g.id).padStart(5,'0')} · ${fecha}</div></div></div>
      <div class="destaca">📦 ENTREGAR EN BODEGA: ${esc(g.entregar_en||'Bodega')} — NO en planta</div>
      <div class="box"><b>Tipo:</b> ${tipoTxt}${g.falla?' — <b>Falla:</b> '+esc(g.falla):''}<br><b>Cliente:</b> ${esc(c.nombre||'')} · NIT ${esc(c.nit||'—')} · Tel ${esc(c.tel||c.celular||'—')}<br><b>Pedido original:</b> ${esc(ped.numero||('#'+g.pedido_id))}</div>
      <table><thead><tr><th>Ítem devuelto</th><th style="text-align:center">Pares</th></tr></thead><tbody>${filas}<tr style="font-weight:800"><td>TOTAL</td><td style="text-align:center">${g.pares}</td></tr></tbody></table>
      <div class="box"><b>Motivo:</b><br>${esc(g.motivo||'—')}${g.foto_url?`<br><b>Evidencia:</b><br><img class="ev" src="${g.foto_url}">`:''}</div>
      <div class="firmas"><div class="firma">Entrega (Feroz)</div><div class="firma">Recibe (Bodega)</div></div>
      <script>window.onload=function(){setTimeout(function(){window.print();},450);}<\/script></body></html>`;
    const w=window.open('','_blank'); if(w){w.document.write(html);w.document.close();}
  },

  subInv(){
    let totS=0,totC=0,totP=0;
    const filas=C.TALLAS.map(t=>{const s=this._inv[t]||0,c=this._comp[t]||0,d=s-c,p=d<0?-d:0;totS+=s;totC+=c;totP+=p;
      const cls=p>0?'color:var(--rojo);font-weight:800':(d===0?'color:#8a5300':'color:var(--verde)');
      return `<tr><td><b>${t}</b></td><td style="text-align:center">${s}</td><td style="text-align:center">${c}</td><td style="text-align:center;${cls}">${d}</td></tr>`;}).join('');
    return `
      <div class="kpis"><div class="kpi"><b>${totS}</b><span>Pares en inventario</span></div>
        <div class="kpi naranja"><b>${totC}</b><span>Comprometido</span></div></div>
      ${totP>0?`<div class="kpi rojo" style="margin-bottom:8px"><b>${totP}</b><span>⚠️ Déficit vs pedidos (ver Cobertura)</span></div>`:''}
      <div class="card"><label>📦 Stock actual por talla</label>
        <div class="hint">El stock NO se edita a mano: solo cambia con ingresos de planta y despachos.</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px">
          <thead><tr style="background:var(--negro);color:#fff"><th style="padding:7px">Talla</th><th>Stock</th><th>Compr.</th><th>Disp.</th></tr></thead>
          <tbody>${filas}</tbody></table></div>
      ${this.puede('admin')?`<div class="card"><label>🔧 Solo Admin</label>
        <button class="btn-sm" style="background:var(--negro);color:#fff;margin-right:6px" onclick="App.modalInicial()">Cargar inventario inicial</button>
        <button class="btn-sm" style="background:#fff;border:1px solid var(--linea)" onclick="App.modalAjuste()">Ajuste manual</button></div>`:''}`;
  },
  subIng(){
    if(!this.puede('admin','planta')) return '<div class="empty">Solo Planta/Admin registran ingresos.</div>';
    // resumen de ingresos por día
    const ing=this._movs.filter(m=>m.tipo==='entrada'||m.tipo==='inicial');
    const byDay={};
    ing.forEach(m=>{const d=new Date(m.creado_en).toLocaleDateString('es-CO');const o=(byDay[d]=byDay[d]||{total:0,tallas:{},tipo:m.tipo});o.total+=m.cantidad;o.tallas[m.talla]=(o.tallas[m.talla]||0)+m.cantidad;});
    const resumen=Object.entries(byDay).map(([d,v])=>`<div class="item" style="padding:9px"><div class="top"><div>
      <div class="nom" style="font-size:14px">📅 ${d} ${v.tipo==='inicial'?'<span class="badge b-cotizada">inicial</span>':''}</div>
      <div class="meta">${Object.entries(v.tallas).sort((a,b)=>a[0]-b[0]).map(([t,q])=>`T${t}:${q}`).join(' · ')}</div></div>
      <div class="tot">${v.total} pares</div></div></div>`).join('');
    return `<div class="card"><label>🏭 Registrar ingreso de planta (producción)</label>
      <div class="hint">Suma al inventario lo que produjo planta. Queda como ENTRADA con su fecha.</div>
      <label>Fecha del ingreso</label><input class="field" id="ing_fecha" type="date" value="${this.hoyISO()}">
      <div class="grid-tallas" id="ing_grid">${C.TALLAS.map(t=>`<div class="t"><span>Talla ${t}</span><input type="number" min="0" inputmode="numeric" data-talla="${t}" placeholder="0"></div>`).join('')}</div>
      <button class="btn btn-main" onclick="App.regIngreso()">Registrar ingreso</button></div>
      <div class="card"><label>📋 Resumen de ingresos</label>
        ${resumen||'<div class="empty">Aún no hay ingresos registrados.</div>'}</div>`;
  },
  subCont(){
    if(!this.puede('admin')) return '<div class="empty">Solo Admin hace la toma de inventario.</div>';
    return `<div class="card"><label>🔎 Toma de inventario (conteo físico)</label>
      <div class="hint">Elige la fecha del conteo y escribe lo que CONTASTE físicamente. El sistema saca las diferencias contra el inventario y ajusta.</div>
      <label>Fecha del conteo físico</label><input class="field" id="cont_fecha" type="date" value="${this.hoyISO()}">
      <div class="grid-tallas" id="cont_grid">${C.TALLAS.map(t=>`<div class="t"><span>T${t} · sist ${this._inv[t]||0}</span><input type="number" min="0" inputmode="numeric" data-talla="${t}" placeholder="—"></div>`).join('')}</div>
      <button class="btn btn-main" onclick="App.aplicarConteo()">Calcular diferencias y aplicar</button></div>`;
  },
  subMov(){
    const ic={inicial:'🟦',entrada:'🟢',salida:'🔴',ajuste:'🟠',conteo:'🟣'};
    return `<div class="card"><label>📜 Movimientos (tiempo real)</label>
      <div class="hint">Todo lo que entra y sale del inventario, lo más reciente arriba.</div></div>
      ${this._movs.length?this._movs.slice(0,150).map(m=>`<div class="item" style="padding:10px"><div class="top"><div>
        <div class="nom" style="font-size:14px">${ic[m.tipo]||''} ${esc(m.tipo).toUpperCase()} · Talla ${m.talla}</div>
        <div class="meta">${esc(m.motivo||'')} · ${new Date(m.creado_en).toLocaleString('es-CO')}</div></div>
        <div class="tot" style="color:${m.tipo==='salida'?'var(--rojo)':'var(--verde)'}">${m.tipo==='salida'?'−':'+'}${m.cantidad}</div></div></div>`).join(''):'<div class="empty">Sin movimientos aún.</div>'}`;
  },
  subCob(){
    const salidas=this._movs.filter(m=>m.tipo==='salida');
    const vt={}; let minF=null,maxF=null;
    salidas.forEach(m=>{vt[m.talla]=(vt[m.talla]||0)+m.cantidad;const d=new Date(m.creado_en);if(!minF||d<minF)minF=d;if(!maxF||d>maxF)maxF=d;});
    const dias=(minF&&maxF)?Math.max(1,(maxF-minF)/86400000):1, semanas=Math.max(1,dias/7), OBJ=4;
    const filas=C.TALLAS.map(t=>{const vendido=vt[t]||0,velSem=vendido/semanas,stock=this._inv[t]||0;
      const cob=velSem>0?(stock/velSem):null, sug=velSem>0?Math.max(0,Math.round(OBJ*velSem-stock)):0;
      return `<tr><td><b>${t}</b></td><td style="text-align:center">${stock}</td><td style="text-align:center">${vendido}</td>
        <td style="text-align:center">${velSem?velSem.toFixed(1):'0'}</td>
        <td style="text-align:center">${cob!=null?cob.toFixed(1):'—'}</td>
        <td style="text-align:center">${sug>0?`<b style="color:var(--rojo)">${sug}</b>`:'—'}</td></tr>`;}).join('');
    const byCli={}, now=Date.now();
    this._peds.forEach(p=>{const cl=p.cliente_snap||{};const k=cl.nit||cl.nombre;if(!k)return;(byCli[k]=byCli[k]||{nombre:cl.nombre,f:[]}).f.push(new Date(p.creado_en));});
    const cliRows=Object.values(byCli).map(c=>{c.f.sort((a,b)=>a-b);const n=c.f.length;let cada='—',prox='—';
      if(n>=2){const span=(c.f[n-1]-c.f[0])/86400000,avg=span/(n-1);cada=Math.round(avg)+' días';
        const desde=(now-c.f[n-1])/86400000;prox='en '+Math.max(0,Math.round(avg-desde))+' días';}
      return {nombre:c.nombre,n,cada,prox};}).sort((a,b)=>b.n-a.n).slice(0,15);
    return `
      <div class="card"><label>📈 Sugerencia de producción</label>
        <div class="hint">Según lo vendido (salidas reales), velocidad por semana y stock. Meta: cubrir ${OBJ} semanas. <b>Se afina con más historial.</b></div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px">
          <thead><tr style="background:var(--negro);color:#fff"><th style="padding:6px">T</th><th>Stock</th><th>Vend.</th><th>/sem</th><th>Cob(sem)</th><th>Producir</th></tr></thead>
          <tbody>${filas}</tbody></table></div>
      <div class="card"><label>🔁 Regularidad de compra por cliente</label>
        <div class="hint">Cada cuánto compra y cuándo se espera el próximo pedido.</div>
        ${cliRows.length?cliRows.map(c=>`<div class="item" style="padding:9px"><div class="top"><div>
          <div class="nom" style="font-size:14px">${esc(c.nombre||'')}</div>
          <div class="meta">${c.n} pedido(s) · compra cada ${c.cada}</div></div>
          <div class="tot" style="font-size:13px;color:var(--azul)">${c.prox}</div></div></div>`).join(''):'<div class="empty">Aún sin historial de pedidos.</div>'}</div>`;
  },

  subPed(){
    if(!this.puede('admin','planta')) return '<div class="empty">Solo Planta/Admin.</div>';
    const peds=this._pedplanta||[];
    const lista = peds.map(p=>{
      const cur=p.curva||{}, ent=p.entregado||{};
      let tp=0,te=0; Object.keys(cur).forEach(t=>tp+=cur[t]||0); Object.values(ent).forEach(v=>te+=v||0);
      const det=Object.entries(cur).sort((a,b)=>(+a[0])-(+b[0])).map(([t,q])=>`T${t}:${(ent[t]||0)}/${q}`).join(' · ');
      const estLbl=p.estado==='pendiente'?'pendiente por entregar':(p.estado==='parcial'?'parcial':'entregado');
      const badge=p.estado==='entregado'?'b-despachado':(p.estado==='parcial'?'b-consignado':'b-pendiente_pago');
      return `<div class="item"><div class="top" ${this.puede('admin')?`style="cursor:pointer" onclick="App.editPedPlanta(${p.id})"`:''}><div>
          <div class="nom">${esc(p.numero||'Pedido')} <span class="badge ${badge}">${estLbl}</span>${this.puede('admin')?' <span style="font-size:12px;color:var(--suave)">✏️</span>':''}</div>
          <div class="meta">📅 ${esc(p.fecha||'')} · ${det}</div>
        </div><div class="tot">${te}/${tp}</div></div>
        <div class="acciones-item">
          ${this._cfgPlantaWa?`<button class="btn-sm" style="background:#25D366;color:#fff" onclick="App.sendPedidoPlanta(${p.id})">📲 Enviar a planta</button>`:''}
          ${this.puede('admin')?`<button class="btn-sm" style="background:#fff;color:var(--rojo);border:1px solid #f2c2c2" onclick="App.anularPedPlanta(${p.id})">Anular</button>`:''}
        </div></div>`;
    }).join('');
    return `<div class="card"><label>🥾 Nuevo Pedido Feroz (a producir)</label>
        <label>Fecha</label><input class="field" id="ped_fecha" type="date" value="${this.hoyISO()}">
        <label>Curva — pares por talla</label>
        <div class="grid-tallas" id="ped_grid">${C.TALLAS.map(t=>`<div class="t"><span>Talla ${t}</span><input type="number" min="0" inputmode="numeric" data-talla="${t}" oninput="App.pedPlantaPreview()"></div>`).join('')}</div>
        <div class="estado" id="ped_estado" style="position:static">
          <div class="ec-nums">
            <div class="ec-item"><b id="pp_pares">0</b><span>pares (llevo)</span></div>
            <div class="ec-item"><b id="pp_cajas">0</b><span>cajas de 16</span></div>
          </div>
          <div class="ec-falta" id="pp_falta">Empieza a sumar pares</div>
        </div>
        <button class="btn btn-main" onclick="App.genPedidoPlanta()">Generar pedido</button>
        ${!this._cfgPlantaWa?`<button class="btn-sm btn-ghost" style="border:1px solid var(--linea);margin-top:8px" onclick="App.cfgPlantaWaSet()">⚙️ Configurar WhatsApp de planta</button>`:''}
      </div>
      <div class="card"><label>📋 Pendientes por entregar</label>
        ${peds.length?lista:'<div class="empty">Sin pedidos. Genera el primero.</div>'}</div>`;
  },
  pedPlantaPreview(){
    let pares=0; document.querySelectorAll('#ped_grid input').forEach(i=>pares+=+i.value||0);
    const cajas=Math.floor(pares/C.PARES_CAJA), resto=pares%C.PARES_CAJA, faltan=resto?C.PARES_CAJA-resto:0;
    $('pp_pares').textContent=pares; $('pp_cajas').textContent=cajas;
    const f=$('pp_falta'); f.className='ec-falta';
    if(pares===0) f.textContent='Empieza a sumar pares';
    else if(faltan===0){ f.classList.add('ok'); f.innerHTML=`✔️ ${cajas} caja(s) exactas · ${pares} pares`; }
    else { f.classList.add('falta'); f.innerHTML=`Faltan <b>${faltan}</b> par(es) para completar la caja N° ${cajas+1}`; }
  },
  async genPedidoPlanta(){
    let pares=0; const curva={};
    document.querySelectorAll('#ped_grid input').forEach(i=>{const q=+i.value||0;if(q>0){pares+=q;curva[i.dataset.talla]=q;}});
    if(pares<1){ alert('Arma la curva (pares por talla).'); return; }
    const fecha=($('ped_fecha')&&$('ped_fecha').value)||this.hoyISO();
    const d=new Date(), num='PF-'+d.getFullYear()+('0'+(d.getMonth()+1)).slice(-2)+('0'+d.getDate()).slice(-2)+'-'+('0'+d.getHours()).slice(-2)+('0'+d.getMinutes()).slice(-2);
    const { data:pp, error } = await this.sb.from('pedidos_planta').insert({numero:num,fecha,curva,pares,entregado:{},estado:'pendiente'}).select().single();
    if(error){ alert('Error: '+error.message); return; }
    this.toast('Pedido Feroz creado ✅'); this.ptab='ped'; await this.vPlanta();
    if(this._cfgPlantaWa) this.sendPedidoPlanta(pp.id);
  },
  async sendPedidoPlanta(id){
    let p=(this._pedplanta||[]).find(x=>x.id===id);
    if(!p){ const r=await this.sb.from('pedidos_planta').select('*').eq('id',id).single(); p=r.data; }
    if(!p) return;
    const cur=p.curva||{};
    const det=Object.entries(cur).sort((a,b)=>(+a[0])-(+b[0])).map(([t,q])=>`Talla ${t}: ${q}`).join('\n');
    const txt=`🥾 PEDIDO FEROZ ${p.numero}\nFecha: ${p.fecha}\nRef. ${p.referencia||'701'} · ${p.pares} pares\n\nCurva a producir:\n${det}`;
    const tel=(this._cfgPlantaWa||'').replace(/\D/g,'');
    window.open(`https://wa.me/57${tel}?text=${encodeURIComponent(txt)}`,'_blank');
  },
  async cfgPlantaWaSet(){
    const n=prompt('WhatsApp de la persona de planta (solo números):',''); if(!n) return;
    const num=n.replace(/\D/g,'');
    await this.sb.from('config').upsert({key:'planta_whatsapp', value:num},{onConflict:'key'});
    this._cfgPlantaWa=num; this.toast('WhatsApp de planta guardado'); this.vPlanta();
  },
  async anularPedPlanta(id){
    if(!confirm('¿Anular este pedido de producción?')) return;
    await this.sb.from('pedidos_planta').update({estado:'anulado'}).eq('id',id);
    this.vPlanta();
  },
  editPedPlanta(id){
    if(!this.puede('admin')) return;
    const p=(this._pedplanta||[]).find(x=>x.id===id); if(!p) return;
    const cur=p.curva||{};
    this.modal(`<h3>Editar ${esc(p.numero||'pedido')}</h3><div class="hint">Cambia la fecha o la curva y guarda.</div>
      <label>Fecha</label><input class="field" id="epp_fecha" type="date" value="${esc(p.fecha||this.hoyISO())}">
      <label>Curva — pares por talla</label>
      <div class="grid-tallas" id="epp_grid">${C.TALLAS.map(t=>`<div class="t"><span>Talla ${t}</span><input type="number" min="0" inputmode="numeric" data-talla="${t}" value="${cur[t]||''}"></div>`).join('')}</div>
      <button class="btn btn-main" onclick="App.guardarPedPlantaEdit(${p.id})">Guardar cambios</button>
      <button class="btn btn-ghost" onclick="App.cerrarModal()">Cancelar</button>`);
  },
  async guardarPedPlantaEdit(id){
    let pares=0; const curva={};
    document.querySelectorAll('#epp_grid input').forEach(i=>{const q=+i.value||0;if(q>0){pares+=q;curva[i.dataset.talla]=q;}});
    if(pares<1){ alert('Arma la curva (pares por talla).'); return; }
    const fecha=($('epp_fecha')&&$('epp_fecha').value)||this.hoyISO();
    const { error } = await this.sb.from('pedidos_planta').update({curva,pares,fecha}).eq('id',id);
    if(error){ alert('Error: '+error.message); return; }
    this.cerrarModal(); this.toast('Pedido actualizado ✅'); this.vPlanta();
  },
  // el ingreso de produccion descuenta de la cola de pedidos Feroz (FIFO)
  async applyIngresoACola(produced){
    const { data:peds=[] } = await this.sb.from('pedidos_planta').select('*').in('estado',['pendiente','parcial']).order('creado_en',{ascending:true});
    const rem={...produced};
    for(const p of (peds||[])){
      const cur=p.curva||{}, ent={...(p.entregado||{})}; let changed=false;
      for(const t of Object.keys(cur)){
        const pend=(cur[t]||0)-(ent[t]||0);
        if(pend>0 && (rem[t]||0)>0){ const take=Math.min(pend, rem[t]); ent[t]=(ent[t]||0)+take; rem[t]-=take; changed=true; }
      }
      if(changed){
        const fully=Object.keys(cur).every(t=>(ent[t]||0)>=(cur[t]||0));
        await this.sb.from('pedidos_planta').update({entregado:ent, estado:fully?'entregado':'parcial'}).eq('id',p.id);
      }
    }
  },

  // ---- aplicar movimientos (actualiza stock + registra kardex) ----
  async aplicarMovs(items, motivoDef, fechaISO){
    const tallas=[...new Set(items.map(i=>i.talla))];
    const { data:rows=[] } = await this.sb.from('inventario').select('talla,stock').eq('referencia','701').in('talla',tallas);
    const map={}; rows.forEach(r=>map[r.talla]=r.stock);
    const ups=items.map(i=>({referencia:'701',talla:i.talla,stock:(map[i.talla]||0)+i.delta,actualizado_en:new Date().toISOString()}));
    const mov=items.map(i=>{const o={referencia:'701',talla:i.talla,tipo:i.tipo,cantidad:i.cantidad,motivo:i.motivo||motivoDef,usuario:this.user.id};if(fechaISO)o.creado_en=fechaISO;return o;});
    if(ups.length) await this.sb.from('inventario').upsert(ups,{onConflict:'referencia,talla'});
    if(mov.length) await this.sb.from('inv_movimientos').insert(mov);
  },
  fechaISO(inputId){ const v=$(inputId)&&$(inputId).value; return v?(v+'T12:00:00'):null; },
  hoyISO(){ const d=new Date(); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); },
  async regIngreso(){
    const items=[]; const produced={};
    document.querySelectorAll('#ing_grid input').forEach(i=>{const c=+i.value||0;if(c>0){items.push({talla:+i.dataset.talla,delta:c,cantidad:c,tipo:'entrada',motivo:'Ingreso de planta'}); produced[i.dataset.talla]=c;}});
    if(!items.length){ alert('Escribe las cantidades producidas.'); return; }
    await this.aplicarMovs(items,'Ingreso de planta', this.fechaISO('ing_fecha'));
    await this.applyIngresoACola(produced);
    this.toast('Ingreso registrado ✅ (descontado de la cola)'); this.ptab='ing'; this.vPlanta();
  },
  modalInicial(){ this.modal(`<h3>Inventario inicial</h3><div class="hint">Cantidad real de pares por talla al arrancar. Reemplaza el stock actual.</div>
    <div class="grid-tallas" id="ini_grid">${C.TALLAS.map(t=>`<div class="t"><span>Talla ${t}</span><input type="number" min="0" data-talla="${t}" value="${this._inv[t]||0}"></div>`).join('')}</div>
    <button class="btn btn-main" onclick="App.guardarInicial()">Fijar inventario inicial</button>
    <button class="btn btn-ghost" onclick="App.cerrarModal()">Cancelar</button>`); },
  async guardarInicial(){
    if(!confirm('Esto FIJA el inventario inicial de cada talla (reemplaza el stock actual). ¿Continuar?')) return;
    const items=[]; document.querySelectorAll('#ini_grid input').forEach(i=>{const t=+i.dataset.talla,target=+i.value||0,cur=this._inv[t]||0,delta=target-cur;if(delta!==0)items.push({talla:t,delta,cantidad:target,tipo:'inicial',motivo:'Inventario inicial'});});
    if(!items.length){ alert('Sin cambios.'); this.cerrarModal(); return; }
    await this.aplicarMovs(items,'Inventario inicial'); this.cerrarModal(); this.toast('Inventario inicial cargado ✅'); this.ptab='inv'; this.vPlanta();
  },
  modalAjuste(){ this.modal(`<h3>Ajuste manual (solo Admin)</h3><div class="hint">Corrige el stock de una talla con su motivo.</div>
    <label>Talla</label><select class="field" id="aj_talla">${C.TALLAS.map(t=>`<option value="${t}">Talla ${t} · actual ${this._inv[t]||0}</option>`).join('')}</select>
    <label>Nueva cantidad real</label><input class="field" id="aj_val" type="number" min="0">
    <label>Motivo</label><input class="field" id="aj_motivo" placeholder="Ej: daño, error de conteo…">
    <button class="btn btn-main" onclick="App.guardarAjuste()">Aplicar ajuste</button>
    <button class="btn btn-ghost" onclick="App.cerrarModal()">Cancelar</button>`); },
  async guardarAjuste(){
    const t=+$('aj_talla').value, motivo=$('aj_motivo').value.trim();
    if($('aj_val').value===''){ alert('Escribe la nueva cantidad.'); return; }
    if(!motivo){ alert('Escribe el motivo.'); return; }
    const val=+$('aj_val').value, cur=this._inv[t]||0, delta=val-cur;
    if(delta===0){ alert('No hay cambio.'); return; }
    await this.aplicarMovs([{talla:t,delta,cantidad:Math.abs(delta),tipo:'ajuste',motivo:`Ajuste (${cur}→${val}): ${motivo}`}],'Ajuste');
    this.cerrarModal(); this.toast('Ajuste aplicado ✅'); this.ptab='inv'; this.vPlanta();
  },
  async aplicarConteo(){
    const items=[], difs=[];
    const fechaTxt = ($('cont_fecha')&&$('cont_fecha').value) || this.hoyISO();
    document.querySelectorAll('#cont_grid input').forEach(i=>{
      if(i.value==='') return;
      const t=+i.dataset.talla, contado=+i.value||0, sist=this._inv[t]||0, delta=contado-sist;
      if(delta!==0){ items.push({talla:t,delta,cantidad:Math.abs(delta),tipo:'conteo',motivo:`Conteo ${fechaTxt} (${sist}→${contado}) ${delta<0?'FALTANTE':'sobrante'} ${Math.abs(delta)}`});
        difs.push(`T${t}: sistema ${sist} → contado ${contado}  (${delta>0?'+':''}${delta})`); }
    });
    if(!items.length){ alert('No hay diferencias (o no contaste ninguna talla).'); return; }
    if(!confirm(`TOMA DE INVENTARIO ${fechaTxt}\nDIFERENCIAS ENCONTRADAS:\n\n`+difs.join('\n')+'\n\n¿Aplicar el ajuste por conteo?')) return;
    await this.aplicarMovs(items,'Toma de inventario', this.fechaISO('cont_fecha')); this.toast('Toma de inventario aplicada ✅'); this.ptab='mov'; this.vPlanta();
  },
  async descontarInventario(pedido_id, curva, motivo){
    if(!curva) return;
    const tallas=Object.keys(curva).map(Number).filter(n=>!isNaN(n));
    if(!tallas.length) return;
    const { data:rows=[] } = await this.sb.from('inventario').select('talla,stock').eq('referencia','701').in('talla',tallas);
    const map={}; rows.forEach(r=>map[r.talla]=r.stock);
    const ups=[], movs=[];
    for(const [t,q] of Object.entries(curva)){
      const cant=+q||0; if(!cant) continue;
      ups.push({referencia:'701',talla:+t,stock:(map[+t]||0)-cant,actualizado_en:new Date().toISOString()});
      movs.push({referencia:'701',talla:+t,tipo:'salida',cantidad:cant,motivo,pedido_id,usuario:this.user.id});
    }
    if(ups.length) await this.sb.from('inventario').upsert(ups,{onConflict:'referencia,talla'});
    if(movs.length) await this.sb.from('inv_movimientos').insert(movs);
  },

  /* ---------- PERMISOS (qué ve cada rol) ---------- */
  async vPermisos(){
    this.loading();
    const { data:cfg } = await this.sb.from('config').select('value').eq('key','nav_permisos').maybeSingle();
    this._permisos = cfg?cfg.value:{};
    const MODS=[['dashboard','📊 Tablero'],['cotizaciones','📝 Cotizar'],['pedidos','📦 Pedidos'],['despachos','🚚 Despachos'],['ventas','💰 Ventas'],['crm','📇 CRM'],['clientes','👥 Clientes'],['cobertura','🗺️ Cobertura'],['planta','🏭 Planta'],['admin','⚙️ Equipo']];
    const ROLES=[['vendedor','Vendedor'],['facturacion','Facturación'],['bodega','Bodega'],['planta','Jefe de Planta']];
    let html=`<h1>🔐 Permisos</h1><div class="sub">Marca qué módulos ve cada rol</div>
      <div class="hint" style="margin-bottom:10px">El Admin (tú) siempre ve todo. Cada persona ve según su rol (lo asignas en ⚙️ Equipo).</div>`;
    ROLES.forEach(([rk,rn])=>{
      const allowed=(this._permisos[rk]||[]);
      html+=`<div class="card"><label>${rn}</label>`+
        MODS.map(([mk,mn])=>`<label style="display:flex;align-items:center;gap:9px;padding:5px 0;font-size:14px;cursor:pointer"><input type="checkbox" data-rol="${rk}" data-mod="${mk}" ${allowed.includes(mk)?'checked':''} style="width:18px;height:18px;accent-color:var(--naranja)">${mn}</label>`).join('')+
        `</div>`;
    });
    html+=`<button class="btn btn-main" onclick="App.guardarPermisos()">Guardar permisos</button>`;
    this.set(html);
  },
  async guardarPermisos(){
    const nuevo={admin:["dashboard","cotizaciones","pedidos","despachos","ventas","clientes","crm","cobertura","planta","admin","permisos"]};
    ['vendedor','facturacion','bodega','planta'].forEach(rk=>nuevo[rk]=[]);
    document.querySelectorAll('#main input[data-rol]').forEach(i=>{ if(i.checked) nuevo[i.dataset.rol].push(i.dataset.mod); });
    const { error } = await this.sb.from('config').update({value:nuevo, updated_at:new Date().toISOString()}).eq('key','nav_permisos');
    if(error){ alert('Error: '+error.message); return; }
    this._permisos=nuevo; this.pintarNav(); this.toast('Permisos guardados ✅');
  },

  /* ---------- ADMIN (equipo) ---------- */
  async vAdmin(){
    this.loading();
    const { data:perf=[] } = await this.sb.from('perfiles').select('*').order('creado_en');
    this.set(`
      <h1>Equipo</h1><div class="sub">Asigna el rol de cada persona</div>
      ${perf.map(u=>`<div class="item"><div class="top"><div>
        <div class="nom">${esc(u.nombre||'')} ${u.activo===false?'<span style="color:#dc2626;font-size:11px;font-weight:800">🔒 BLOQUEADO</span>':'<span style="color:#16a34a;font-size:11px;font-weight:700">● activo</span>'}</div><div class="meta">${esc(u.id.slice(0,8))}…</div>
      </div></div>
      <label style="margin-top:8px">Rol</label>
      <select class="field" onchange="App.cambiarRol('${u.id}', this.value)">
        ${Object.keys(ROL_NOMBRE).map(r=>`<option value="${r}" ${u.rol===r?'selected':''}>${ROL_NOMBRE[r]}</option>`).join('')}
      </select>
      <button class="btn-sm" style="width:100%;margin-top:8px;background:${u.activo===false?'#16a34a':'#dc2626'};color:#fff;font-weight:700" onclick="App.toggleActivo('${u.id}', ${u.activo===false})">${u.activo===false?'✅ Activar acceso':'🔒 Bloquear acceso'}</button>
      </div>`).join('')}
      <div class="hint" style="margin-top:10px">Cada persona se registra sola (botón "Crear cuenta" en el login) y luego tú le asignas el rol aquí. Con 🔒 Bloquear le quitas el acceso al instante.</div>
    `);
  },
  async cambiarRol(id,rol){
    const { error } = await this.sb.from('perfiles').update({rol}).eq('id',id);
    if(error) alert('Error: '+error.message); else this.toast('Rol actualizado');
  },
  async toggleActivo(id, activar){
    if(!confirm(activar?'¿Activar el acceso de esta persona?':'¿Bloquear el acceso? No podrá entrar hasta que la actives de nuevo.')) return;
    const { error } = await this.sb.from('perfiles').update({activo:activar}).eq('id',id);
    if(error) alert('Error: '+error.message); else { this.toast(activar?'✅ Acceso activado':'🔒 Acceso bloqueado'); this.vAdmin(); }
  },
  toast(t){ const d=document.createElement('div'); d.textContent=t;
    d.style.cssText='position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:#15171c;color:#fff;padding:10px 18px;border-radius:20px;z-index:80;font-size:13px';
    document.body.appendChild(d); setTimeout(()=>d.remove(),1800); },

  /* ---------- modal ---------- */
  modal(html){ $('modal-host').innerHTML=`<div class="modal"><div class="box">${html}</div></div>`; },
  cerrarModal(){ $('modal-host').innerHTML=''; },
};

window.addEventListener('DOMContentLoaded',()=>App.init());
