/* ============================================================================
 * COLCHONES NIDO · Etapa 2: subir el histórico de los 3 almacenes a la base.
 *
 * Requisito: haber pegado antes _PLAYBOOK/superior_nido-crear.sql en el
 * SQL Editor de Supabase. Si las tablas no existen, este script no hace nada
 * y lo dice.
 *
 * Uso:
 *     node colchones/migrar_a_base.js            <- prueba, no escribe nada
 *     node colchones/migrar_a_base.js --escribir <- sube de verdad
 *     node colchones/migrar_a_base.js --borrar   <- deja las 3 tablas vacías
 *
 * Es idempotente: borra lo que haya subido antes (origen 'excel-2026-08') y
 * vuelve a subir. Correrlo dos veces no duplica nada.
 * ========================================================================== */

const fs = require('fs');
const path = require('path');

const SB = 'https://fnayedgvamxktxfvywwl.supabase.co';
const KEY = 'sb_publishable_NVTYNkJ0V6obLwgwjXza1g_3Ihp-xMv';
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
const ORIGEN = 'excel-2026-08';

const ESCRIBIR = process.argv.includes('--escribir');
const BORRAR = process.argv.includes('--borrar');

// Las 8 líneas de la fábrica. Una referencia pertenece a una línea si su
// nombre empieza por ella. La mitad no pertenece a ninguna, y así debe ser.
const LINEAS = ['PILLOWTOP CASSATA', 'PILLOWTOP RESORTADO', 'RESORTADO IMITACION',
  'CASSATA CLASICA', 'TAPA TAPA', 'ANATOMICO', 'LIBRO', 'CAMION'];

// Lo que se registró como venta pero es un movimiento contable, no un producto.
const AJUSTES = ['SALDO PRODUCTO ANTERIOR', 'PAGO MES ANTERIOR', 'AJUSTE DE ITEMS'];

// Formas de pago que NO son plata que entró: quedaron por cobrar o por cruzar.
const NO_CAJA = /PENDIENTE|CRUCE DE CUENTAS|DEUDOR/i;

const $ = n => Math.round(n).toLocaleString('es-CO');

async function api(ruta, opts = {}) {
  const r = await fetch(SB + '/rest/v1/' + ruta, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
  return r;
}

async function existe(tabla) {
  const r = await api(tabla + '?select=*&limit=1');
  return r.ok;
}

async function contar(tabla) {
  const r = await api(tabla + '?select=id&limit=1', { headers: { Prefer: 'count=exact' } });
  if (!r.ok) return null;
  return +(r.headers.get('content-range') || '').split('/')[1] || 0;
}

// PostgREST aguanta lotes grandes, pero de a 500 el error es más fácil de ubicar.
async function subir(tabla, filas, lote = 500) {
  let hechas = 0;
  for (let i = 0; i < filas.length; i += lote) {
    const trozo = filas.slice(i, i + lote);
    const r = await api(tabla, {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(trozo),
    });
    if (!r.ok) throw new Error(`${tabla} lote ${i}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    hechas += trozo.length;
    process.stdout.write(`\r   ${tabla}: ${hechas}/${filas.length}`);
  }
  process.stdout.write('\n');
  return hechas;
}

(async () => {
  // ---- 1. leer los datos que ya generó generar_datos.py -------------------
  const dj = path.join(__dirname, 'datos.js');
  if (!fs.existsSync(dj)) { console.log('Falta colchones/datos.js. Corre antes generar_datos.py'); process.exit(1); }
  global.window = global;
  eval(fs.readFileSync(dj, 'utf8'));
  const D = window.DATOS;
  const A = D.almacenes;

  const V = D.filas.map(r => ({
    sucursal: A[r[0]], fecha: r[1], referencia: D.productos[r[2]],
    categoria: D.categorias[r[3]] || null, cantidad: r[4],
    valor_unitario: r[5], total: r[6],
    forma_pago: D.pagos[r[7]] || null, cliente: D.clientes[r[8]] || null,
  }));
  V.forEach(v => {
    v.es_ajuste = AJUSTES.includes(v.referencia);
    v.es_caja = !NO_CAJA.test(v.forma_pago || '');
    v.sin_valor = v.total === 0;
    v.origen = ORIGEN;
  });

  console.log(`Leídas ${$(V.length)} ventas de datos.js (generado el ${D.generado})`);

  // ---- 2. ¿existen las tablas? -------------------------------------------
  const faltan = [];
  for (const t of ['superior_sucursales', 'superior_referencias', 'superior_ventas', 'superior_precios']) {
    if (!(await existe(t))) faltan.push(t);
  }
  if (faltan.length) {
    console.log('\nFaltan estas tablas: ' + faltan.join(', '));
    console.log('Pega primero _PLAYBOOK/superior_nido-crear.sql en el SQL Editor:');
    console.log('  https://supabase.com/dashboard/project/fnayedgvamxktxfvywwl/sql/new');
    process.exit(1);
  }

  if (BORRAR) {
    for (const t of ['superior_ventas', 'superior_referencias', 'superior_precios']) {
      const r = await api(t + '?origen=eq.' + ORIGEN, { method: 'DELETE' });
      console.log(`borrado de ${t}: ${r.status}`);
    }
    // superior_referencias y precios no tienen 'origen': se limpian por completo
    await api('superior_referencias?id=not.is.null', { method: 'DELETE' });
    console.log('tablas limpias');
    process.exit(0);
  }

  // ---- 3. armar el catálogo de referencias -------------------------------
  const ref = new Map();
  V.forEach(v => {
    let o = ref.get(v.referencia);
    if (!o) {
      o = { nombre: v.referencia, linea: LINEAS.find(L => v.referencia.toUpperCase().startsWith(L)) || null,
            tamano: (v.referencia.match(/\b(100|120|140|160|200)\b/) || [])[1] || null,
            categoria: v.categoria || null, es_ajuste: AJUSTES.includes(v.referencia),
            unidades: 0, vendido: 0, _min: Infinity, _max: 0 };
      ref.set(v.referencia, o);
    }
    o.unidades += v.cantidad; o.vendido += v.total;
    const p = v.valor_unitario > 0 ? v.valor_unitario : (v.cantidad > 0 ? v.total / v.cantidad : 0);
    if (p > 0) { if (p < o._min) o._min = p; if (p > o._max) o._max = p; }
  });
  const REF = [...ref.values()].map(o => ({
    nombre: o.nombre, linea: o.linea, tamano: o.tamano, categoria: o.categoria,
    es_ajuste: o.es_ajuste,
    precio_prom: o.unidades > 0 ? Math.round(o.vendido / o.unidades) : 0,
    precio_min: o._min === Infinity ? 0 : Math.round(o._min),
    precio_max: Math.round(o._max),
    unidades: Math.round(o.unidades), vendido: Math.round(o.vendido),
  }));

  // ---- 4. resumen antes de tocar nada ------------------------------------
  const conLinea = REF.filter(r => r.linea).length;
  const ajustes = V.filter(v => v.es_ajuste);
  const noCaja = V.filter(v => !v.es_caja);
  const tot = V.reduce((s, v) => s + v.total, 0);
  console.log('\n--- lo que se va a subir ---');
  console.log(`  ventas          ${String($(V.length)).padStart(9)}   $${$(tot)}`);
  console.log(`  referencias     ${String($(REF.length)).padStart(9)}   ${conLinea} con línea, ${REF.length - conLinea} sin línea`);
  A.forEach(a => {
    const f = V.filter(v => v.sucursal === a);
    console.log(`    ${a.padEnd(16)}${String($(f.length)).padStart(7)}   $${$(f.reduce((s, v) => s + v.total, 0))}`);
  });
  console.log(`\n  marcadas como AJUSTE (no son venta):  ${$(ajustes.length)} líneas · $${$(ajustes.reduce((s, v) => s + v.total, 0))}`);
  console.log(`  marcadas como NO-CAJA (por cobrar):   ${$(noCaja.length)} líneas · $${$(noCaja.reduce((s, v) => s + v.total, 0))}`);
  console.log(`  marcadas SIN VALOR (Excel en blanco): ${$(V.filter(v => v.sin_valor).length)} líneas`);

  if (!ESCRIBIR) {
    console.log('\nEsto fue una PRUEBA: no se escribió nada.');
    console.log('Para subir de verdad:  node colchones/migrar_a_base.js --escribir');
    process.exit(0);
  }

  // ---- 5. subir ----------------------------------------------------------
  console.log('\n--- subiendo ---');
  const ya = await contar('superior_ventas');
  if (ya > 0) {
    console.log(`   había ${$(ya)} ventas de una corrida anterior, se borran primero`);
    await api('superior_ventas?origen=eq.' + ORIGEN, { method: 'DELETE' });
    await api('superior_referencias?id=not.is.null', { method: 'DELETE' });
  }
  await subir('superior_referencias', REF);
  await subir('superior_ventas', V);

  // ---- 6. verificar contra los Excel -------------------------------------
  console.log('\n--- verificando contra los Excel ---');
  let fallas = 0;
  const ok = (b, t) => { if (!b) fallas++; console.log(`   ${b ? 'OK  ' : 'MAL '} ${t}`); };

  ok((await contar('superior_ventas')) === V.length, `hay ${$(V.length)} ventas en la base`);
  ok((await contar('superior_referencias')) === REF.length, `hay ${$(REF.length)} referencias en la base`);

  for (const a of A) {
    const esperado = Math.round(V.filter(v => v.sucursal === a).reduce((s, v) => s + v.total, 0));
    const r = await api(`superior_ventas?sucursal=eq.${encodeURIComponent(a)}&select=total&limit=20000`);
    const suma = Math.round((await r.json()).reduce((s, x) => s + (+x.total || 0), 0));
    ok(suma === esperado, `${a}: $${$(suma)} en la base = $${$(esperado)} del Excel`);
  }

  console.log('\n' + (fallas ? `### ${fallas} FALLAS — revisa antes de seguir ###`
    : '### TODO CUADRA · el histórico ya vive en la base ###'));
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error('\nERROR:', e.message); process.exit(1); });
