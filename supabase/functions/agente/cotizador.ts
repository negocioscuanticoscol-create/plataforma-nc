/* ============================================================================
   COTIZADOR — la misma matemática que cotizador-smart/index.html

   OJO: esto NO es una versión simplificada. Si acá y el cotizador dan números
   distintos, el cliente recibe una cotización y la app le muestra otra. Cada
   regla de acá está copiada del cotizador, con la línea de origen anotada.

   Al cambiar una tarifa hay que cambiarla EN LOS DOS LADOS. Unificarlas en una
   tabla de Supabase queda pendiente.
   ============================================================================ */

export const IVA = 0.19;

/* cotizador-smart/index.html:586-588 */
export const FLETE_PACA_LEGACY    =  65000;   // Flexipack, clientes de antes del 23/07
export const FLETE_PACA_NUEVA     = 101000;   // Flexipack, todos los demás
export const FLETE_PACA_PM_LEGACY = 140000;   // PetMulti, antes
export const FLETE_PACA_PM_NUEVA  = 176000;   // PetMulti, ahora
export const FLETE_CAJA           =  36500;   // residuo fuera de paca y mínimo por cotización
export const RESIDUO_POR_CAJA     =    200;   // uds por caja de residuo

/* Mínimo comercial: nunca cotizar menos de esto por referencia y color */
export const MIN_UDS_POR_REF = 100;

export const KIT_PRECIO = 39000;   // promoción vigente, envío incluido

export type Prod = {
  sku: string; nombre: string; pack: number; colores: string[];
  l1: number; l2: number; l3: number; l4: number; l5: number;
};
export type Linea = { sku: string; nombre: string; color: string; qty: number; precio: number; subtotal: number };

/* Lista de precios. l5 es el COSTO/convenio: jamás se le muestra al cliente
   ni se usa para cotizar — es la base de la comisión. */
export const LISTAS = { muestras: 'l1', pyme: 'l2', mayorista: 'l3', distribuidor: 'l4' } as const;
export type Lista = keyof typeof LISTAS;

export function precioDe(p: Prod, lista: Lista = 'mayorista'): number {
  return Number((p as unknown as Record<string, number>)[LISTAS[lista]] || 0);
}

/* cotizador-smart/index.html:597-615
   - pm1000 lleva el transporte incluido en el precio → no suma flete
   - por cada paca completa se cobra la tarifa de paca
   - el residuo se junta entre referencias y se cobra $36.500 por cada 200 uds o fracción
   - si no hay nada seleccionado, el mínimo es una caja */
export function calcFlete(lineas: Linea[], prods: Map<string, Prod>, legacy = false): number {
  const paca   = legacy ? FLETE_PACA_LEGACY    : FLETE_PACA_NUEVA;
  const pacaPM = legacy ? FLETE_PACA_PM_LEGACY : FLETE_PACA_PM_NUEVA;
  if (!lineas.length) return FLETE_CAJA;

  const items = lineas.filter(l => l.sku !== 'pm1000');
  if (!items.length) return 0;             // solo pm1000 → todo incluido

  let total = 0, residuoUds = 0;
  for (const l of items) {
    const p = prods.get(l.sku);
    const pk = p?.pack || 0;
    if (pk > 0) {
      total += Math.floor(l.qty / pk) * (l.sku.startsWith('pm') ? pacaPM : paca);
      residuoUds += l.qty % pk;
    } else {
      residuoUds += l.qty;                 // sin pack conocido: todo va como residuo
    }
  }
  total += Math.ceil(residuoUds / RESIDUO_POR_CAJA) * FLETE_CAJA;
  return total || FLETE_CAJA;              // nunca menos del mínimo
}

export type Cotizacion = {
  lineas: Linea[]; uds: number; subtotal: number; iva: number; flete: number; total: number;
  lista: Lista; avisos: string[];
};

export function cotizar(
  pedido: { sku: string; color?: string; qty: number }[],
  prods: Map<string, Prod>,
  opts: { lista?: Lista; legacy?: boolean } = {},
): Cotizacion {
  const lista = opts.lista || 'mayorista';
  const avisos: string[] = [];
  const lineas: Linea[] = [];

  for (const it of pedido) {
    const p = prods.get(it.sku);
    if (!p) { avisos.push(`No encontré la referencia ${it.sku}.`); continue; }
    let qty = Math.max(0, Math.floor(it.qty || 0));
    if (qty < MIN_UDS_POR_REF) {
      avisos.push(`${p.nombre}: el mínimo son ${MIN_UDS_POR_REF} unidades por referencia y color, se ajustó.`);
      qty = MIN_UDS_POR_REF;
    }
    const precio = precioDe(p, lista);
    lineas.push({ sku: p.sku, nombre: p.nombre, color: it.color || p.colores[0] || '', qty, precio, subtotal: qty * precio });
  }

  const subtotal = lineas.reduce((a, l) => a + l.subtotal, 0);
  const iva   = Math.round(subtotal * IVA);
  const flete = calcFlete(lineas, prods, !!opts.legacy);
  const uds   = lineas.reduce((a, l) => a + l.qty, 0);
  return { lineas, uds, subtotal, iva, flete, total: subtotal + iva + flete, lista, avisos };
}

/* Folio con el mismo formato del cotizador: SP-AAAAMMDD-HHMM (hora de Bogotá) */
export function nuevoFolio(d = new Date()): string {
  const b = new Date(d.getTime() - 5 * 3600 * 1000);   // UTC-5
  const p = (n: number) => String(n).padStart(2, '0');
  return `SP-${b.getUTCFullYear()}${p(b.getUTCMonth() + 1)}${p(b.getUTCDate())}-${p(b.getUTCHours())}${p(b.getUTCMinutes())}`;
}
