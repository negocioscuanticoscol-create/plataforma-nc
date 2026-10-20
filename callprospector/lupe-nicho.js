/* Lupe · VISTA POR NICHO Y ZONA  (por defecto; la de antes: lupe.html?vista=bases)   José, 20-oct-2026
   Flujo:  Cliente  →  NICHO  →  ZONA (todo el país, o departamento → municipio → localidad)  →  llamar.
   Meta: tamizar con llamadas a todos los clientes y dejar cada zona limpia, y ver dónde falta traer más empresas (scraping).
   No cambia nada de lo que ya hace Lupe: las asignaciones, el pago y el reparto siguen siendo por base. Aquí solo se reorganiza la
   NAVEGACIÓN: al llamar se abre la base de siempre, con un filtro de zona (el mismo mecanismo de `_trabajo` del modo entrega).
   Los números salen de la vista mkr_cobertura_geo (_PLAYBOOK/lupe_vista_nicho/cobertura_geo.sql), que cuadra con mkr_mapa_bases. */
(function(){
'use strict';
let COB=[], COB_CLI='', POB=null;
let ZONA={nicho:'', depto:'', muni:'', loc:''};
const SIN='(sin ubicar)', SINLOC='Sin localidad';
const sup=()=>!!(YO&&YO.nivel==='asesor');
const k=s=>String(s||'').trim().toLowerCase();

async function cargarCob(cli){
  if(COB_CLI===cli && COB.length) return;
  const r=await GET('mkr_cobertura_geo?select=base_id,nicho,geo_depto,geo_municipio,geo_localidad,total,con_telefono,por_llamar,llamadas&cliente=eq.'+encodeURIComponent(cli)+'&limit=5000');
  COB=(Array.isArray(r)?r:[]).map(x=>({base_id:String(x.base_id), nicho:x.nicho, depto:x.geo_depto||SIN, muni:x.geo_municipio||SIN, loc:x.geo_localidad||'', total:+x.total||0, tel:+x.con_telefono||0, por_llamar:+x.por_llamar||0, llamadas:+x.llamadas||0}));
  COB_CLI=cli;
}
async function cargarPob(){
  if(POB) return;
  const r=await GET('mkr_geo_municipio?select=municipio,depto,poblacion&limit=2000');
  POB={}; (Array.isArray(r)?r:[]).forEach(x=>{ POB[k(x.municipio)+'|'+k(x.depto)]={muni:x.municipio, depto:x.depto, hab:+x.poblacion||0}; });
}
/* ¿esta fila de cobertura es de algo que ESTA persona puede trabajar? Misma regla de abrirBase: sus bases y, si le dieron ciudades/localidades, solo esas. */
function permitida(x){
  if(sup()) return true;
  if(!misBases.some(b=>String(b.id)===x.base_id)) return false;
  const mis=MIS_CIUDADES[x.base_id]; if(!mis||!mis.length) return true;
  const set=new Set(mis.map(k)); const c=k(x.muni==SIN?'':x.muni);
  return set.has(c) || (x.loc && set.has(c+' / '+k(x.loc)));
}
const misFilas=()=>COB.filter(permitida);
function suma(rows){ return rows.reduce((a,x)=>{ a.total+=x.total; a.tel+=x.tel; a.por_llamar+=x.por_llamar; a.llamadas+=x.llamadas; return a; },{total:0,tel:0,por_llamar:0,llamadas:0}); }
function agrupa(rows,f){ const m=new Map(); rows.forEach(x=>{ const key=f(x); let a=m.get(key); if(!a){ a={k:key,total:0,tel:0,por_llamar:0,llamadas:0,filas:[]}; m.set(key,a); } a.total+=x.total; a.tel+=x.tel; a.por_llamar+=x.por_llamar; a.llamadas+=x.llamadas; a.filas.push(x); }); return [...m.values()]; }
const pct=(a,b)=>b?Math.round(100*a/b):0;
const barra=(a,b)=>`<div style="height:5px;border-radius:3px;background:var(--line);margin-top:7px;overflow:hidden"><div style="height:100%;width:${pct(a,b)}%;background:var(--ok,#2ecc71)"></div></div>`;

/* ---------------------------------------------------------- pantalla 2: NICHOS */
async function pintarNichos(){
  $('bases').innerHTML='<div class="vacio">Contando por nicho…</div>';
  await cargarCob(CLIENTE_ABIERTO);
  ZONA={nicho:'',depto:'',muni:'',loc:''};
  const nichos=agrupa(misFilas().filter(x=>x.nicho),x=>x.nicho)
    .filter(n=>sup()||n.por_llamar>0).sort((a,b)=>b.por_llamar-a.por_llamar||String(a.k).localeCompare(String(b.k),'es'));
  const varios=[...new Set(misBases.map(b=>b.cliente||'otro'))].length>1;
  $('bases').innerHTML=`<h4>Hola, ${esc(YO.nombre)}</h4>
    <div class="s">${varios?`<a href="#" style="color:inherit" onclick="CLIENTE_ABIERTO='';pintarListaBases();return false">‹ Todos los clientes</a> · `:''}<b>${esc(nombreCliente(CLIENTE_ABIERTO))}</b> · escoge el nicho</div>
    ${sup()?`<div class="bcard" style="border-color:var(--naranja2)" onclick="LupeNicho.scraping()"><div class="n">📈 Dónde falta traer más empresas</div><div class="d">Zonas sin cubrir, con pocas empresas para su población o casi agotadas</div><div class="q"><span></span><b>Ver ›</b></div></div>`:''}
    ${nichos.map(n=>`<div class="bcard" onclick="LupeNicho.nicho(this.dataset.n)" data-n="${esc(n.k)}">
        <div class="n">🧭 ${esc(n.k)}</div>
        ${sup()?`<div class="d">${num(n.total)} empresas · ${num(n.llamadas)} ya llamadas (${pct(n.llamadas,n.total)} %)</div>`:''}
        ${barra(n.llamadas,n.total)}
        <div class="q"><span>${n.por_llamar?'':'✅ ya se llamó todo'}</span><b>${num(n.por_llamar)} por llamar ›</b></div>
      </div>`).join('')||'<div class="vacio">No tienes nichos con prospectos por llamar.</div>'}`;
}

/* ---------------------------------------------------------- pantalla 3: ZONA (departamento → municipio → localidad) */
function zonaFilas(){
  let r=misFilas().filter(x=>x.nicho===ZONA.nicho);
  if(ZONA.depto) r=r.filter(x=>x.depto===ZONA.depto);
  if(ZONA.muni)  r=r.filter(x=>x.muni===ZONA.muni);
  if(ZONA.loc)   r=r.filter(x=>(x.loc||SINLOC)===ZONA.loc);
  return r;
}
function pintarZonas(){
  const rows=zonaFilas(), tot=suma(rows);
  let nivel='depto', f=x=>x.depto;
  if(ZONA.depto){ nivel='muni'; f=x=>x.muni; }
  if(ZONA.muni){ nivel='loc'; f=x=>x.loc||SINLOC; }
  let grupos=agrupa(rows,f).sort((a,b)=>b.por_llamar-a.por_llamar||String(a.k).localeCompare(String(b.k),'es'));
  /* si no hay más niveles (un solo grupo "sin localidad", o ya se escogió la localidad) se llama directo */
  const hojas = ZONA.loc || (nivel==='loc' && grupos.length===1 && grupos[0].k===SINLOC);
  if(hojas) grupos=[];
  const migas=[`<a href="#" style="color:inherit" onclick="LupeNicho.subir('nichos');return false">‹ Nichos</a>`,
    `<a href="#" style="color:inherit" onclick="LupeNicho.subir('pais');return false">${esc(ZONA.nicho)}</a>`];
  if(ZONA.depto) migas.push(`<a href="#" style="color:inherit" onclick="LupeNicho.subir('depto');return false">${esc(ZONA.depto)}</a>`);
  if(ZONA.muni)  migas.push(`<a href="#" style="color:inherit" onclick="LupeNicho.subir('muni');return false">${esc(ZONA.muni)}</a>`);
  if(ZONA.loc)   migas.push(`<b>${esc(ZONA.loc)}</b>`);
  const donde=ZONA.loc?('en '+ZONA.loc):ZONA.muni?('en toda '+ZONA.muni):ZONA.depto?('en todo '+ZONA.depto):'en todo el país';
  const titulo={depto:'Escoge el departamento',muni:'Escoge el municipio',loc:'Escoge la localidad'}[nivel];
  $('bases').innerHTML=`<h4>Hola, ${esc(YO.nombre)}</h4>
    <div class="s">${migas.join(' › ')}</div>
    <div class="bcard" style="border-color:var(--naranja2);${tot.por_llamar?'':'opacity:.55;'}" ${tot.por_llamar?`onclick="LupeNicho.llamar()"`:''}>
      <div class="cli">${esc(ZONA.nicho)}</div>
      <div class="n">📞 Llamar ${esc(donde)}</div>
      ${sup()?`<div class="d">${num(tot.total)} empresas · ${num(tot.llamadas)} ya llamadas (${pct(tot.llamadas,tot.total)} %)</div>`:''}
      ${barra(tot.llamadas,tot.total)}
      <div class="q"><span>${tot.por_llamar?'':'✅ zona limpia'}</span><b>${num(tot.por_llamar)} por llamar ›</b></div></div>
    ${grupos.length?`<div class="s" style="margin-top:14px">${titulo} · o llama todo lo de arriba</div>`:''}
    ${grupos.filter(g=>sup()||g.por_llamar>0||true).map(g=>`<div class="bcard" ${g.por_llamar?'':'style="opacity:.5"'} data-k="${esc(g.k)}" onclick="LupeNicho.bajar(this.dataset.k)">
        <div class="n">${nivel==='loc'?'📍':nivel==='muni'?'🏙️':'🗺️'} ${esc(g.k)}</div>
        ${sup()?`<div class="d">${num(g.total)} empresas · ${num(g.llamadas)} ya llamadas (${pct(g.llamadas,g.total)} %)</div>`:''}
        ${barra(g.llamadas,g.total)}
        <div class="q"><span>${g.por_llamar?'':'✅ limpia'}</span><b>${num(g.por_llamar)} por llamar ›</b></div></div>`).join('')}`;
  window.scrollTo(0,0);
}
function nicho(n){ ZONA={nicho:n,depto:'',muni:'',loc:''}; pintarZonas(); }
function bajar(key){
  if(!ZONA.depto) ZONA.depto=key; else if(!ZONA.muni) ZONA.muni=key; else ZONA.loc=key;
  /* si el municipio no tiene localidades, no se pregunta: queda en el municipio */
  pintarZonas();
}
function subir(donde){
  if(donde==='nichos'){ pintarNichos(); return; }
  if(donde==='pais'){ ZONA.depto=ZONA.muni=ZONA.loc=''; }
  if(donde==='depto'){ ZONA.muni=ZONA.loc=''; }
  if(donde==='muni'){ ZONA.loc=''; }
  pintarZonas();
}

/* ---------------------------------------------------------- llamar: se abre la base de siempre, con la zona como filtro */
function entrar(baseId){
  const b=misBases.find(x=>String(x.id)===String(baseId))||TODAS_BASES[String(baseId)];
  if(!b) return;
  const t={};
  if(ZONA.depto && ZONA.depto!==SIN) t.geo_depto=ZONA.depto;
  if(ZONA.muni  && ZONA.muni!==SIN)  t.geo_municipio=ZONA.muni;
  if(ZONA.loc){ if(ZONA.loc===SINLOC) t._sinLoc=true; else t.geo_localidad=ZONA.loc; }
  abrirBase(Object.assign({},b,{_trabajo:t}));
}
function llamar(){
  const porBase=agrupa(zonaFilas(),x=>x.base_id).filter(a=>a.por_llamar>0).sort((a,b)=>b.por_llamar-a.por_llamar);
  if(!porBase.length) return;
  if(porBase.length===1){ entrar(porBase[0].k); return; }
  /* varias bases del mismo nicho en esta zona: cada una conserva su asignación, su pago y su reparto, así que se escoge cuál */
  const nom=id=>(misBases.find(x=>String(x.id)===id)||TODAS_BASES[id]||{}).nombre||id;
  const donde=ZONA.loc||ZONA.muni||ZONA.depto||'todo el país';
  $('bases').innerHTML=`<h4>Hola, ${esc(YO.nombre)}</h4>
    <div class="s"><a href="#" style="color:inherit" onclick="LupeNicho.subir('${ZONA.loc?'muni':ZONA.muni?'depto':ZONA.depto?'pais':'pais'}');return false">‹ Volver</a> · <b>${esc(ZONA.nicho)}</b> · ${esc(donde)}</div>
    <div class="s">Este nicho está en ${porBase.length} bases en esa zona. Escoge con cuál sigues (cada una paga y se reparte por separado):</div>
    ${porBase.map(a=>`<div class="bcard" data-b="${esc(a.k)}" onclick="LupeNicho.entrar(this.dataset.b)"><div class="n">${esc(nom(a.k))}</div><div class="q"><span></span><b>${num(a.por_llamar)} por llamar ›</b></div></div>`).join('')}`;
}

/* ---------------------------------------------------------- 📈 dónde falta scraping (solo supervisor) */
async function scraping(nichoSel){
  if(!sup()) return;
  $('bases').innerHTML='<div class="vacio">Calculando cobertura…</div>';
  await Promise.all([cargarCob(CLIENTE_ABIERTO), cargarPob()]);
  const nichos=[...new Set(COB.map(x=>x.nicho).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'es'));
  const sel=nichoSel===undefined?(ZONA.nicho||''):nichoSel;
  const rows=COB.filter(x=>!sel||x.nicho===sel);
  const porMuni=agrupa(rows.filter(x=>x.muni!==SIN),x=>x.muni+'|'+x.depto);
  const L=[];                                    // municipios con población: lo que hay y lo que debería haber
  const visto=new Set();
  /* Se cuenta lo que SE PUEDE LLAMAR (empresas con teléfono): una empresa sin teléfono no cubre la zona. */
  porMuni.forEach(a=>{ const [m,d]=a.k.split('|'); const p=POB[k(m)+'|'+k(d)]; visto.add(k(m)+'|'+k(d)); L.push({m,d,hab:p?p.hab:0,total:a.total,tel:a.tel,llam:a.llamadas,por:a.por_llamar}); });
  Object.keys(POB).forEach(key=>{ if(!visto.has(key)){ const p=POB[key]; L.push({m:p.muni,d:p.depto,hab:p.hab,total:0,tel:0,llam:0,por:0}); } });
  const dens=x=>x.hab?x.tel/x.hab*10000:0;
  const conEmp=L.filter(x=>x.hab>=50000&&x.tel>0).map(dens).sort((a,b)=>a-b);
  const mediana=conEmp.length?conEmp[Math.floor(conEmp.length/2)]:0;
  const vacias=L.filter(x=>x.hab>=100000&&x.tel===0).sort((a,b)=>b.hab-a.hab).slice(0,25);
  const pocas =L.filter(x=>x.hab>=50000&&x.tel>0&&dens(x)<mediana*0.5).sort((a,b)=>b.hab-a.hab).slice(0,25);
  /* agotada = de lo que tenía teléfono ya se llamó casi todo (no basta con que no quede nada: puede ser que nunca se llamó y estén descartadas) */
  const agot  =L.filter(x=>x.tel>=10&&x.llam>=x.tel*0.3&&x.por<=x.tel*0.1).sort((a,b)=>b.tel-a.tel).slice(0,25);
  const tabla=(l,extra)=>l.length?`<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px">
      <tr style="color:var(--faint);text-align:left"><th>Municipio</th><th style="text-align:right">Habitantes</th><th style="text-align:right">Con teléfono</th><th style="text-align:right">Por 10.000 hab.</th><th style="text-align:right">Llamadas</th><th style="text-align:right">Por llamar</th></tr>
      ${l.map(x=>`<tr style="border-top:1px solid var(--line)"><td>${esc(x.m)} <span style="color:var(--faint)">· ${esc(x.d)}</span></td><td style="text-align:right">${num(x.hab)}</td><td style="text-align:right"><b>${num(x.tel)}</b></td><td style="text-align:right">${x.hab?dens(x).toFixed(1).replace('.',','):'—'}</td><td style="text-align:right">${num(x.llam)}</td><td style="text-align:right">${num(x.por)}</td></tr>`).join('')}
    </table></div>`:'<div class="vacio" style="padding:14px">Nada por aquí.</div>';
  $('bases').innerHTML=`<h4>Hola, ${esc(YO.nombre)}</h4>
    <div class="s"><a href="#" style="color:inherit" onclick="LupeNicho.subir('nichos');return false">‹ Nichos</a> · <b>📈 Dónde falta traer más empresas</b></div>
    <div class="bcard"><div class="d" style="margin:0 0 6px">Nicho</div>
      <select style="width:100%;padding:10px;border-radius:10px;background:var(--card);color:inherit;border:1px solid var(--line);font-size:14px" onchange="LupeNicho.scraping(this.value)">
        <option value="">Todos los nichos (todas las empresas del cliente)</option>
        ${nichos.map(n=>`<option value="${esc(n)}" ${n===sel?'selected':''}>${esc(n)}</option>`).join('')}</select>
      <div class="d" style="margin-top:8px">Mediana nacional: ${mediana.toFixed(1).replace('.',',')} empresas por cada 10.000 habitantes (municipios de más de 50.000). Se señala lo que está por debajo de la mitad.</div></div>
    <div class="s" style="margin-top:14px">🕳️ <b>Ciudades de más de 100.000 habitantes sin una sola empresa</b></div>${tabla(vacias)}
    <div class="s" style="margin-top:14px">🔎 <b>Pocas empresas para su población</b></div>${tabla(pocas)}
    <div class="s" style="margin-top:14px">⛏️ <b>Casi agotadas</b> (ya se llamó el 90 % o más: toca traer más)</div>${tabla(agot)}`;
  window.scrollTo(0,0);
}

window.LupeNicho={nicho,bajar,subir,llamar,entrar,scraping};

/* ---------------------------------------------------------- se engancha a Lupe sin tocar su código */
const _lista=window.pintarListaBases;
window.pintarListaBases=function(){
  const cs=[...new Set(misBases.map(b=>b.cliente||'otro'))];
  if(cs.length===1) CLIENTE_ABIERTO=cs[0];
  if(!CLIENTE_ABIERTO || cs.indexOf(CLIENTE_ABIERTO)<0){ ZONA={nicho:'',depto:'',muni:'',loc:''}; return _lista(); }
  pintarNichos();
};
const _volver=window.volverBases;
window.volverBases=function(){
  if(typeof MODO_ENTREGA!=='undefined' && MODO_ENTREGA) return _volver();
  if(misBases.length>1){ $('bases').style.display='block'; if(ZONA.nicho) pintarZonas(); else window.pintarListaBases(); window.scrollTo(0,0); }
};
console.log('Lupe · vista por nicho y zona activada');
})();
