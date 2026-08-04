/* ============================================================================
   AGENTE SMART — Edge Function
   Reemplaza al nodo "Agente" de n8n. Un solo lugar: webhook, memoria, Claude,
   herramientas y respuesta.

   TRES PUERTAS:
     GET  /            → verificación del webhook de Meta (hub.challenge)
     POST /            → mensaje entrante de WhatsApp
     POST /?sim=1      → simulador: {telefono, mensaje} y devuelve la respuesta
                         en JSON, sin mandar nada por WhatsApp. Para probar.

   LO QUE NO SE REPITE DE LA VERSIÓN VIEJA:
   En n8n, el ayudante post() atrapaba TODO error y devolvía null; si Claude
   fallaba, se contestaba "Disculpa, dame un segundo" y el flujo terminaba BIEN.
   Así estuvo 13 días mudo con 0 errores en el tablero. Acá, si Claude falla:
     1. se avisa por Telegram
     2. se le dice al cliente la verdad ("en un momento te contacta un asesor")
     3. la función responde 500 para que quede registrado como fallo
   ============================================================================ */

import { PROMPT, conAprendizajes } from './prompt.ts';
import { TOOLS, ejecutar, BASE_COT } from './herramientas.ts';
import type { Prod, Lista } from './cotizador.ts';

const env = (k: string, d = '') => Deno.env.get(k) ?? d;

/* Supabase inyecta SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY solas en toda Edge
   Function. Se usan esas y no unas propias: la service_role salta el RLS, que es
   lo que hace falta para leer nc_precios (su lectura pública está cerrada a
   propósito, porque l5 es el costo). */
const SB_URL   = env('SUPABASE_URL', env('SB_URL'));
const SB_KEY   = env('SUPABASE_SERVICE_ROLE_KEY', env('SB_KEY'));
const ANTH_KEY = env('ANTHROPIC_KEY');
const WA_TOKEN = env('WA_TOKEN');
const WA_PHONE = env('WA_PHONE_ID');
const TG_TOKEN = env('TELEGRAM_TOKEN');
const TG_CHAT  = env('TELEGRAM_CHAT_ID');
const VERIFY   = env('VERIFY_TOKEN', 'smart-nc');

const MODELO_CHARLA  = 'claude-haiku-4-5';   // saludar, informar — barato
const MODELO_COTIZA  = 'claude-sonnet-5';    // cotizar y negociar — cuando importa
const MAX_PASOS = 6;
const VENTANA_HIST = 12;                     // últimos mensajes que se le mandan

/* ------------------------------------------------------------------ utils */
const sb = (path: string, init: RequestInit = {}) =>
  fetch(SB_URL + path, {
    ...init,
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json', ...(init.headers || {}),
    },
  });

async function telegram(texto: string) {
  if (!TG_TOKEN || !TG_CHAT) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text: texto, parse_mode: 'HTML' }),
    });
  } catch { /* si Telegram falla no podemos hacer más */ }
}

async function enviarWA(to: string, texto: string) {
  const r = await fetch(`https://graph.facebook.com/v21.0/${WA_PHONE}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: texto } }),
  });
  if (!r.ok) {
    const e = await r.text();
    await telegram(`⚠️ <b>No se pudo responder por WhatsApp</b>\nA: ${to}\n${e.slice(0, 250)}`);
  }
}

async function guardar(telefono: string, rol: string, contenido: string) {
  await sb('/rest/v1/nc_agente_mem', {
    method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ empresa: 'smart', telefono, rol, contenido }),
  });
}

/* Catálogo y aprendizajes. El catálogo sale de nc_precios: cambiar un precio en
   la app queda aplicado al instante, sin tocar código. */
async function cargarCatalogo(): Promise<Map<string, Prod>> {
  const m = new Map<string, Prod>();
  const r = await sb('/rest/v1/nc_precios?empresa=eq.smart&activo=eq.true&select=sku,nombre,pack,colores,l1,l2,l3,l4');
  if (!r.ok) {
    /* que el motivo salga en el error, no un "vacío" sin explicación */
    throw new Error(`nc_precios HTTP ${r.status}: ${(await r.text()).slice(0, 160)} · url=${SB_URL.slice(0, 40)} · key=${SB_KEY ? SB_KEY.slice(0, 6) + '…' + SB_KEY.length : 'VACIA'}`);
  }
  for (const p of await r.json()) m.set(p.sku, p as Prod);
  return m;
}

async function cargarAprendizajes(): Promise<string | null> {
  const r = await sb('/rest/v1/nc_agente_aprendizajes?empresa=eq.smart&select=aprendizajes&order=actualizado.desc&limit=1');
  if (!r.ok) return null;
  const a = await r.json();
  return a?.[0]?.aprendizajes || null;
}

async function cargarHistorial(telefono: string) {
  const r = await sb(`/rest/v1/nc_agente_mem?telefono=eq.${telefono}&rol=in.(user,assistant)&select=rol,contenido&order=creado_en.desc&limit=${VENTANA_HIST}`);
  if (!r.ok) return [];
  const filas = await r.json();
  return filas.reverse()
    .filter((x: { contenido?: string }) => x.contenido)
    .map((x: { rol: string; contenido: string }) => ({ role: x.rol as 'user' | 'assistant', content: x.contenido }));
}

/* Sonnet solo cuando hace falta pensar en plata; Haiku para lo demás. */
function eligeModelo(mensaje: string): string {
  const t = mensaje.toLowerCase();
  const hayCantidad = /\b\d{3,}\b/.test(t);
  const pideCotiza = /cotiz|precio|cu[aá]nto|vale|descuento|paca|mayorista|flete/.test(t);
  return (hayCantidad || pideCotiza) ? MODELO_COTIZA : MODELO_CHARLA;
}

/* ------------------------------------------------------------ el cerebro */
async function responder(telefono: string, mensaje: string, nombre?: string) {
  const [prods, aprendizajes, historial] = await Promise.all([
    cargarCatalogo(), cargarAprendizajes(), cargarHistorial(telefono),
  ]);
  if (!prods.size) throw new Error('catálogo vacío: nc_precios no devolvió nada');

  const sistema = conAprendizajes(PROMPT, aprendizajes) +
    (nombre ? `\n\nEl cliente se llama ${nombre}.` : '');

  const messages: { role: 'user' | 'assistant'; content: unknown }[] =
    [...historial, { role: 'user', content: mensaje }];

  const ctx = { sb, prods, telefono, lista: 'mayorista' as Lista, legacy: false };
  let texto = '', handoff = '', folio = '';

  for (let paso = 0; paso < MAX_PASOS; paso++) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTH_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: eligeModelo(mensaje), max_tokens: 700,
        system: [{ type: 'text', text: sistema, cache_control: { type: 'ephemeral' } }],
        tools: TOOLS, tool_choice: paso < MAX_PASOS - 1 ? { type: 'auto' } : { type: 'none' },
        messages,
      }),
    });

    /* Acá NO se atrapa el error en silencio: se sabe qué pasó y se avisa. */
    if (!r.ok) {
      const detalle = (await r.text()).slice(0, 300);
      throw new Error(`Claude ${r.status}: ${detalle}`);
    }

    const resp = await r.json();
    for (const b of resp.content || []) if (b.type === 'text' && b.text?.trim()) texto += (texto ? '\n' : '') + b.text.trim();

    if (resp.stop_reason !== 'tool_use') break;

    const usos = (resp.content || []).filter((b: { type: string }) => b.type === 'tool_use');
    messages.push({ role: 'assistant', content: resp.content });
    const results = [];
    for (const u of usos) {
      const out = await ejecutar(u.name, u.input || {}, ctx);
      if (out.startsWith('HANDOFF:')) handoff = out.slice(8);
      const m = out.match(/folio (SP-[\w-]+)/); if (m) folio = m[1];
      results.push({ type: 'tool_result', tool_use_id: u.id, content: out });
    }
    messages.push({ role: 'user', content: results });
  }

  return { texto: texto.trim(), handoff, folio };
}

/* ------------------------------------------------------------------- HTTP */
Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Verificación del webhook de Meta
  if (req.method === 'GET') {
    if (url.searchParams.get('hub.verify_token') === VERIFY)
      return new Response(url.searchParams.get('hub.challenge') || '', { status: 200 });
    return new Response('forbidden', { status: 403 });
  }

  const esSim = url.searchParams.get('sim') === '1';
  let telefono = '', mensaje = '', nombre: string | undefined;

  try {
    const body = await req.json();

    if (esSim) {
      telefono = String(body.telefono || 'simulador');
      mensaje  = String(body.mensaje || '').trim();
      nombre   = body.nombre;
    } else {
      const v = body?.entry?.[0]?.changes?.[0]?.value;
      const m = v?.messages?.[0];
      if (!m) return new Response('ok', { status: 200 });     // status, no mensaje
      telefono = String(m.from || '');
      nombre   = v?.contacts?.[0]?.profile?.name;
      mensaje  = m.type === 'text' ? String(m.text?.body || '')
               : m.type === 'audio' ? '[audio]'
               : m.type === 'image' ? '[imagen]' : `[${m.type}]`;
    }
    if (!mensaje) return new Response('ok', { status: 200 });

    /* El simulador TAMBIÉN guarda historial: sin memoria el agente no puede
       cotizar (olvida el tamaño que le dijeron dos mensajes atrás) y la prueba
       no se parecería en nada a una conversación real. Se le antepone 'sim-' al
       teléfono para poder borrar los ensayos sin tocar conversaciones de verdad. */
    if (esSim && !telefono.startsWith('sim-')) telefono = 'sim-' + telefono;
    await guardar(telefono, 'user', mensaje);

    const { texto, handoff, folio } = await responder(telefono, mensaje, nombre);
    const salida = texto || 'Cuéntame un poco más y te ayudo.';

    await guardar(telefono, 'assistant', salida);
    if (!esSim) {
      await enviarWA(telefono, salida);
      if (handoff) {
        await guardar(telefono, 'material', 'HANDOFF');
        await telegram(
          `🔥 <b>LEAD LISTO · Smart</b>\n\n` +
          `${nombre ? nombre + '\n' : ''}📱 ${telefono}\n` +
          `📝 ${handoff}\n` +
          (folio ? `🧾 Cotización <b>${folio}</b>\n${BASE_COT}?f=${folio}\n` : '') +
          `\n👉 https://wa.me/${telefono}`,
        );
      }
    }
    return Response.json({ ok: true, respuesta: salida, handoff, folio });

  } catch (e) {
    /* Falla de verdad: se avisa, se le dice la verdad al cliente, y se registra
       como error. Nunca más un fallo disfrazado de éxito. */
    const msg = e instanceof Error ? e.message : String(e);
    await telegram(
      `🔴 <b>AGENTE SMART CAÍDO</b>\n\n${msg.slice(0, 400)}\n\n` +
      (telefono ? `Cliente ${telefono} quedó sin respuesta.\n👉 https://wa.me/${telefono}` : ''),
    );
    if (!esSim && telefono) {
      const honesto = 'Disculpa, se me cayó el sistema. En un momento te contacta un asesor.';
      await enviarWA(telefono, honesto);
      await guardar(telefono, 'assistant', honesto);
    }
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
});
