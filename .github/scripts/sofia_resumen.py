# -*- coding: utf-8 -*-
"""
Resumen de Sofía (bot de Feroz) a Telegram, tres veces al día.

Corre desde GitHub Actions (.github/workflows/sofia-resumen.yml) a las 11:00,
14:00 y 17:00 de Bogotá. Jose, 24-sep-2026: "no en cada conversación, sino un
resumen tres veces al día con las conversaciones que hayan sido positivas".

Qué es "positiva": la conversación en la que Sofía ya vio avance hacia la compra.
Eso lo decide el guion (nc_agente_guion) dentro de la conversación y queda en
nc_bot_leads_feroz.etiqueta como 'interesado' o 'distribuidor'; 'curioso' es
quien solo preguntó. Además cuenta como positiva la que dejó nombre + ciudad y
habló de cantidad, precio, pago o cotización en la ventana.

Ventanas (hora Bogotá): 11:00 cubre desde las 17:00 del día anterior;
14:00 cubre 11:00–14:00; 17:00 cubre 14:00–17:00. Si el cron llega tarde
(GitHub encola), la ventana se calcula igual por la hora nominal más cercana.

Variables: SUPABASE_URL, SUPABASE_ANON (llave pública), TELEGRAM_TOKEN,
TELEGRAM_CHAT_ID. Para probar sin mandar: SOLO_IMPRIMIR=1. Para mirar las
últimas N horas en vez de la ventana del reloj: PRUEBA_HORAS_ATRAS=N.
"""
import os, json, re, urllib.request, urllib.parse
from datetime import datetime, timedelta, timezone

SB = os.environ.get('SUPABASE_URL', 'https://fnayedgvamxktxfvywwl.supabase.co')
K = os.environ.get('SUPABASE_ANON', 'sb_publishable_NVTYNkJ0V6obLwgwjXza1g_3Ihp-xMv')
TG_TOKEN = os.environ.get('TELEGRAM_TOKEN', '')
TG_CHAT = os.environ.get('TELEGRAM_CHAT_ID', '')
SOLO = os.environ.get('SOLO_IMPRIMIR', '0') == '1'
H = {'apikey': K, 'Authorization': 'Bearer ' + K}
BOG = timezone(timedelta(hours=-5))
CED_URL = 'https://negocioscuanticoscol-create.github.io/plataforma-nc/ced/'
SENALES = re.compile(r'cantidad|cu[aá]nt[oa]s? pares|precio|valor|cotiza|pago|pagar|transferencia|nequi|factura|direcci[oó]n|env[ií]o|domicilio|recoger|cu[aá]ndo', re.I)


def get(path):
    req = urllib.request.Request(SB + '/rest/v1/' + path, headers=H)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def ventana(ahora):
    """Devuelve (desde, hasta, etiqueta) según la hora nominal más cercana."""
    h = ahora.hour + ahora.minute / 60
    if h < 12.5:      # corrida de las 11
        hasta = ahora.replace(hour=11, minute=0, second=0, microsecond=0)
        desde = (hasta - timedelta(days=1)).replace(hour=17)
        return desde, hasta, '11:00 a. m.'
    if h < 15.5:      # corrida de las 14
        hasta = ahora.replace(hour=14, minute=0, second=0, microsecond=0)
        return hasta.replace(hour=11), hasta, '2:00 p. m.'
    hasta = ahora.replace(hour=17, minute=0, second=0, microsecond=0)
    return hasta.replace(hour=14), hasta, '5:00 p. m.'


def fmt_tel(t):
    d = re.sub(r'\D', '', t or '')
    return '+' + d if d else '—'


def main():
    ahora = datetime.now(BOG)
    desde, hasta, etq = ventana(ahora)
    horas_prueba = float(os.environ.get('PRUEBA_HORAS_ATRAS', '0') or 0)
    if horas_prueba:      # para probar a mano: las últimas N horas hasta ahora
        desde, hasta, etq = ahora - timedelta(hours=horas_prueba), ahora, f'prueba (últimas {horas_prueba:g} h)'
    iso = lambda d: urllib.parse.quote(d.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S+00:00'))

    # mensajes de la ventana, para saber quién habló y qué dijo de último
    msgs = get(f"nc_agente_mem?empresa=eq.feroz&creado_en=gte.{iso(desde)}&creado_en=lt.{iso(hasta)}"
               f"&select=telefono,rol,contenido,creado_en&order=creado_en.asc&limit=5000")
    por_tel = {}
    for m in msgs:
        t = re.sub(r'\D', '', m.get('telefono') or '')
        if not t:
            continue
        x = por_tel.setdefault(t, {'n': 0, 'user': [], 'ultimo': ''})
        x['n'] += 1
        if m.get('rol') == 'user':
            x['user'].append(m.get('contenido') or '')
            x['ultimo'] = m.get('contenido') or ''
    if not por_tel:
        texto = (f"🤖 Sofía · resumen de las {etq}\n"
                 f"Sin conversaciones entre {desde.strftime('%d/%m %H:%M')} y {hasta.strftime('%H:%M')}.")
        enviar(texto)
        return

    # fichas de esos leads
    tels = ','.join(por_tel)
    leads = get(f"nc_bot_leads_feroz?telefono=in.({tels})&select=telefono,nombre,ciudad,empresa_lead,etiqueta,fuente_anuncio,fuente_campana,modo,ultima_fecha&limit=2000")
    ficha = {re.sub(r'\D', '', l.get('telefono') or ''): l for l in leads}

    positivas, resto = [], []
    for t, x in por_tel.items():
        f = ficha.get(t, {})
        etiqueta = (f.get('etiqueta') or '').lower()
        habla = ' '.join(x['user'])
        con_datos = bool(f.get('nombre')) and bool(f.get('ciudad'))
        es_pos = etiqueta in ('interesado', 'distribuidor') or (con_datos and SENALES.search(habla) is not None)
        (positivas if es_pos else resto).append((t, x, f))

    lineas = [f"🤖 Sofía · resumen de las {etq}",
              f"{len(por_tel)} conversaciones entre {desde.strftime('%d/%m %H:%M')} y {hasta.strftime('%H:%M')} · "
              f"{len(positivas)} positiva{'s' if len(positivas) != 1 else ''}"]
    if positivas:
        lineas.append('')
        lineas.append('✅ POSITIVAS (avanzaron hacia la compra):')
        for t, x, f in sorted(positivas, key=lambda z: -z[1]['n']):
            quien = f.get('nombre') or 'Sin nombre'
            extra = ' · '.join(v for v in [f.get('empresa_lead'), f.get('ciudad')] if v)
            etiqueta = f.get('etiqueta') or ''
            origen = f.get('fuente_anuncio') or f.get('fuente_campana') or ''
            ult = (x['ultimo'] or '').strip().replace('\n', ' ')
            if len(ult) > 110:
                ult = ult[:107] + '…'
            lineas.append(f"• {quien} ({fmt_tel(t)}){' · ' + extra if extra else ''}"
                          f"{' · ' + etiqueta if etiqueta else ''}{' · anuncio: ' + origen if origen else ''}")
            lineas.append(f"   {x['n']} mensajes · último: “{ult}”")
    else:
        lineas.append('')
        lineas.append('Ninguna llegó a mostrar interés de compra en esta ventana.')
    if resto:
        curiosos = ', '.join((f.get('nombre') or fmt_tel(t)) for t, x, f in resto[:8])
        lineas.append('')
        lineas.append(f"👀 Solo preguntaron ({len(resto)}): {curiosos}{'…' if len(resto) > 8 else ''}")
    lineas.append('')
    lineas.append(f"Ver las conversaciones en CED → Sofía: {CED_URL}")
    enviar('\n'.join(lineas))


def enviar(texto):
    print(texto)
    if SOLO or not TG_TOKEN or not TG_CHAT:
        print('\n(no se envió: SOLO_IMPRIMIR o faltan credenciales)')
        return
    data = json.dumps({'chat_id': TG_CHAT, 'text': texto, 'disable_web_page_preview': True}).encode()
    req = urllib.request.Request(f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage", data=data,
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r:
        print('telegram:', r.status)


if __name__ == '__main__':
    main()
