/* ============================================================================
   HERRAMIENTAS del agente — las que Claude puede usar.

   Diferencia con Valentina vieja: las 8 de ella solo INFORMABAN. Estas
   transaccionan: cotizar guarda la cotización con folio, y el cliente recibe un
   enlace que puede reenviarle a su jefe.
   ============================================================================ */

import { cotizar, nuevoFolio, KIT_PRECIO, MIN_UDS_POR_REF, type Prod, type Lista } from './cotizador.ts';

export const BASE_COT = 'https://negocioscuanticoscol-create.github.io/plataforma-nc/cotizacion.html';

export const TOOLS = [
  {
    name: 'consultar_precio',
    description: 'Precio de una referencia por tamaño en ml. Úsala antes de decir cualquier precio. Nunca inventes.',
    input_schema: {
      type: 'object',
      properties: {
        volumen_ml: { type: 'number', description: 'Tamaño en mililitros, ej 500' },
        cantidad:   { type: 'number', description: 'Unidades que quiere, si las dijo' },
      },
      required: ['volumen_ml'],
    },
  },
  {
    name: 'cotizar',
    description: 'Arma la cotización formal, la GUARDA con folio y devuelve el enlace para mandarle al cliente. Úsala apenas sepas producto y cantidad. Mínimo 100 unidades por referencia y color.',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'Lo que quiere el cliente',
          items: {
            type: 'object',
            properties: {
              volumen_ml: { type: 'number' },
              color:      { type: 'string', description: 'transparente o blanco' },
              cantidad:   { type: 'number' },
            },
            required: ['volumen_ml', 'cantidad'],
          },
        },
        nombre_cliente: { type: 'string', description: 'Nombre o empresa del cliente' },
        ciudad:         { type: 'string' },
      },
      required: ['items'],
    },
  },
  {
    name: 'consultar_kit',
    description: 'Información y precio del kit de muestras. Úsala cuando el cliente dude o quiera probar antes de comprar.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'datos_de_pago',
    description: 'Datos de consignación. Úsala solo cuando ya decidió comprar.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'guardar_datos',
    description: 'Guarda lo que sepas del cliente: nombre, ciudad, qué producto envasa. Úsala apenas te lo digan.',
    input_schema: {
      type: 'object',
      properties: {
        nombre:  { type: 'string' },
        ciudad:  { type: 'string' },
        empresa: { type: 'string' },
        producto_que_envasa: { type: 'string' },
      },
    },
  },
  {
    name: 'escalar_a_asesor',
    description: 'Pasa la conversación a una persona. SOLO si no puedes resolver, el cliente está molesto, pide expresamente hablar con alguien, o es un caso raro. NO la uses solo porque pidió cotización.',
    input_schema: {
      type: 'object',
      properties: { motivo: { type: 'string', description: 'Por qué no lo pudiste resolver tú' } },
      required: ['motivo'],
    },
  },
] as const;

/* ---------------------------------------------------------------------- */

type Ctx = {
  sb: (path: string, init?: RequestInit) => Promise<Response>;
  prods: Map<string, Prod>;
  telefono: string;
  lista: Lista;
  legacy: boolean;
};

/** Busca la referencia más cercana al volumen pedido. */
function porVolumen(prods: Map<string, Prod>, ml: number): Prod | null {
  let mejor: Prod | null = null, dif = Infinity;
  for (const p of prods.values()) {
    const v = parseFloat(String(p.nombre).replace(/[^\d.]/g, '').replace(/\.(?=\d{3})/g, ''));
    if (!v) continue;
    const d = Math.abs(v - ml);
    if (d < dif) { dif = d; mejor = p; }
  }
  return dif <= Math.max(120, ml * 0.25) ? mejor : null;
}

export async function ejecutar(nombre: string, input: Record<string, unknown>, ctx: Ctx): Promise<string> {
  switch (nombre) {

    case 'consultar_precio': {
      const ml = Number(input.volumen_ml || 0);
      const p = porVolumen(ctx.prods, ml);
      if (!p) return `No manejamos un envase de ${ml} ml. Los que hay: ${[...ctx.prods.values()].map(x => x.nombre).join(', ')}.`;
      const precio = p.l3;   // mayorista, la que siempre se ofrece
      const cant = Number(input.cantidad || 0);
      let out = `${p.nombre} · ${p.colores.join(' o ')} · $${precio.toLocaleString('es-CO')} por unidad (mayorista, sin IVA). Paca de ${p.pack} uds. Mínimo ${MIN_UDS_POR_REF} uds por referencia y color.`;
      if (cant >= MIN_UDS_POR_REF) out += ` Para ${cant} uds usa cotizar y mándale el enlace.`;
      return out;
    }

    case 'consultar_kit':
      return `Kit de muestras: $${KIT_PRECIO.toLocaleString('es-CO')} con envío incluido a todo Colombia. Trae 10 envases vacíos, 2 de cada tamaño, para que pruebe con su producto antes de una compra grande.`;

    case 'datos_de_pago':
      return `Bancolombia · Cuenta de Ahorros 860 663 50101 · MARTÍN GUEVARA MEJÍA · CC 1.126.604.274. Que mande el comprobante por acá y despachamos. Envíos a todo Colombia en 2-3 días hábiles.`;

    case 'guardar_datos': {
      const b: Record<string, unknown> = {};
      if (input.nombre)  b.nombre = String(input.nombre).slice(0, 80);
      if (input.ciudad)  b.ciudad = String(input.ciudad).slice(0, 60);
      if (input.producto_que_envasa) b.interes = String(input.producto_que_envasa).slice(0, 120);
      if (!Object.keys(b).length) return 'Nada que guardar.';
      await ctx.sb(`/rest/v1/nc_bot_leads?telefono=eq.${ctx.telefono}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(b),
      });
      return 'Datos guardados.';
    }

    case 'escalar_a_asesor':
      return `HANDOFF:${String(input.motivo || '').slice(0, 200)}`;

    case 'cotizar': {
      const items = (input.items as { volumen_ml: number; color?: string; cantidad: number }[]) || [];
      if (!items.length) return 'Necesito saber qué tamaño y cuántas unidades quiere.';

      const pedido: { sku: string; color?: string; qty: number }[] = [];
      const noHay: number[] = [];
      for (const it of items) {
        const p = porVolumen(ctx.prods, Number(it.volumen_ml));
        if (!p) { noHay.push(Number(it.volumen_ml)); continue; }
        pedido.push({ sku: p.sku, color: it.color, qty: Number(it.cantidad || 0) });
      }
      if (!pedido.length) return `No manejamos ${noHay.join(' ni ')} ml. Ofrécele los tamaños que sí hay.`;

      const c = cotizar(pedido, ctx.prods, { lista: ctx.lista, legacy: ctx.legacy });
      const folio = nuevoFolio();

      const datos = {
        folio, fecha: new Date().toISOString().slice(0, 10),
        empresa: input.nombre_cliente || '', contacto: input.nombre_cliente || '',
        celular: ctx.telefono, lista_nombre: 'L3 Mayorista',
        subtotal_sin_iva: c.subtotal, iva: c.iva, flete: c.flete, total: c.total,
        total_uds: c.uds, envio_ciudad: input.ciudad || '',
        productos: JSON.stringify(c.lineas.map(l => ({
          ref: l.nombre, color: l.color, qty: l.qty, precio: l.precio, subtotal: l.subtotal,
        }))),
        origen: 'agente',
      };

      const r = await ctx.sb('/rest/v1/nc_cotizaciones', {
        method: 'POST', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          empresa: 'smart', folio, cliente: input.nombre_cliente || null,
          contacto: input.nombre_cliente || null, celular: ctx.telefono,
          total: c.total, estado: 'cotizacion', origen: 'agente', contactado: false, datos,
        }),
      });
      if (!r.ok) return 'No pude guardar la cotización. Dile que en un momento se la enviamos y usa escalar_a_asesor.';

      const det = c.lineas.map(l => `${l.nombre} ${l.color}: ${l.qty.toLocaleString('es-CO')} uds × $${l.precio.toLocaleString('es-CO')}`).join(' | ');
      return [
        `COTIZACIÓN GUARDADA · folio ${folio}`,
        det,
        `Subtotal $${c.subtotal.toLocaleString('es-CO')} + IVA $${c.iva.toLocaleString('es-CO')} + flete $${c.flete.toLocaleString('es-CO')}`,
        `TOTAL $${c.total.toLocaleString('es-CO')}`,
        `Enlace para el cliente: ${BASE_COT}?f=${folio}`,
        c.avisos.length ? `Avisos: ${c.avisos.join(' ')}` : '',
        `Mándale el total y el enlace en un mensaje corto, y ofrécele el kit en el mismo mensaje.`,
      ].filter(Boolean).join('\n');
    }
  }
  return `Herramienta desconocida: ${nombre}`;
}
