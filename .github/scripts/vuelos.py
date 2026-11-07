# -*- coding: utf-8 -*-
"""Vuelos de fin de año (José, 6 nov 2026): todos los días pregunta en Google Flights (vía SerpApi) el precio de cada
combinación de fechas, lo guarda en nc_vuelos y manda por Telegram, en dólares y millones de pesos a la TRM del día,
el precio de cada combinación, la más barata de cada persona y el día en que los dos de Bogotá vuelven juntos más barato.

Personas y fechas (todas adultas, económica, ida y vuelta) — segunda versión, 6 nov 2026:
  Natalia Rojas  Chicago → Madrid  sale 12 dic 2026, vuelve 3 o 4 ene 2027                 (2 combinaciones)
  José Rojas     Bogotá  → Madrid  sale 19, 20 o 21 dic, vuelve 4, 5, 6 o 7 ene            (12)
  María Zarrate  Bogotá  → Madrid  sale 9, 10 u 11 dic, vuelve 6, 7 u 8 ene                (9)
Son 23 consultas por día. El plan gratis de SerpApi da 250 al mes: alcanza para los ~7 días en que José decide la compra;
después hay que recortar fechas o pasar al plan de 25 USD (1.000/mes).

Variables: SERPAPI_KEY, TELEGRAM_TOKEN, TELEGRAM_CHAT_ID.
  SOLO_IMPRIMIR=1  no guarda ni manda.
  DEMO=1           precios de mentira para probar el resumen (no gasta consultas ni guarda).
  DESDE_BASE=1     no consulta: arma el resumen con lo último guardado hoy en nc_vuelos y lo manda (no gasta consultas).
"""
import os, json, urllib.request, urllib.parse, datetime as dt

SB = 'https://fnayedgvamxktxfvywwl.supabase.co/rest/v1/'
SBK = 'sb_publishable_NVTYNkJ0V6obLwgwjXza1g_3Ihp-xMv'          # llave pública: solo lee y llama nc_vuelos_guardar
KEY = os.environ.get('SERPAPI_KEY', '')
TG_TOKEN = os.environ.get('TELEGRAM_TOKEN', '')
TG_CHAT = os.environ.get('TELEGRAM_CHAT_ID', '')
SOLO = os.environ.get('SOLO_IMPRIMIR', '0') == '1'
DEMO = os.environ.get('DEMO', '0') == '1'
DESDE_BASE = os.environ.get('DESDE_BASE', '0') == '1'

# persona, origen, destino, país de compra (Google cobra distinto según desde dónde se compra), salidas posibles, regresos posibles
PERSONAS = [
    ('Natalia Rojas', 'ORD', 'MAD', 'us', ['2026-12-12'], ['2027-01-03', '2027-01-04']),
    ('José Rojas',    'BOG', 'MAD', 'co', ['2026-12-19', '2026-12-20', '2026-12-21'], ['2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07']),
    ('María Zarrate', 'BOG', 'MAD', 'co', ['2026-12-09', '2026-12-10', '2026-12-11'], ['2027-01-06', '2027-01-07', '2027-01-08']),
]
JUNTOS = ('José Rojas', 'María Zarrate')   # los dos de Bogotá: se busca el día de regreso en que volver juntos sale más barato
# nombres con los que se guardaron las primeras corridas (6 nov), para leerlas desde la base
ALIAS = {'Chicago': 'Natalia Rojas', 'Bogotá 1': 'José Rojas', 'Bogotá 2': 'María Zarrate'}

TRM_FUENTE = 'https://www.datos.gov.co/resource/32sa-8pi3.json?$order=vigenciadesde%20DESC&$limit=1'
TRM = None
MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']


def hoy_bogota():
    return (dt.datetime.utcnow() - dt.timedelta(hours=5)).date()


def serpapi(origen, destino, gl, salida, regreso):
    if DEMO:
        import random
        p = random.randint(900, 1600)
        return {'best_flights': [{'price': p, 'total_duration': 700, 'layovers': [{}], 'flights': [{'airline': 'Avianca (demo)'}]}],
                'price_insights': {'lowest_price': p, 'price_level': 'typical', 'typical_price_range': [p - 100, p + 300]}}
    qs = urllib.parse.urlencode({'engine': 'google_flights', 'departure_id': origen, 'arrival_id': destino, 'outbound_date': salida,
                                 'return_date': regreso, 'type': 1, 'adults': 1, 'travel_class': 1, 'currency': 'USD', 'hl': 'es',
                                 'gl': gl, 'api_key': KEY})
    with urllib.request.urlopen('https://serpapi.com/search.json?' + qs, timeout=90) as r:
        return json.loads(r.read())


def mejor(resp):
    """El más barato entre lo que Google llama 'best' y el resto. El precio es ida y vuelta (así lo muestra Google Flights)."""
    opciones = (resp.get('best_flights') or []) + (resp.get('other_flights') or [])
    opciones = [o for o in opciones if o.get('price')]
    if not opciones:
        return None
    o = min(opciones, key=lambda x: x['price'])
    vuelos = o.get('flights') or []
    aer = ' + '.join(dict.fromkeys(v.get('airline', '') for v in vuelos if v.get('airline'))) or None
    return dict(precio=o['price'], aerolinea=aer, escalas=len(o.get('layovers') or []), duracion_min=o.get('total_duration'), token=o.get('booking_token'))


def vendedor(origen, destino, gl, salida, regreso, token):
    """Segunda consulta con el booking_token: Google dice quién vende ese vuelo y a cuánto (aerolínea o agencia)."""
    if DEMO or not token:
        return 'LATAM (demo)' if DEMO else None
    qs = urllib.parse.urlencode({'engine': 'google_flights', 'departure_id': origen, 'arrival_id': destino, 'outbound_date': salida,
                                 'return_date': regreso, 'type': 1, 'adults': 1, 'travel_class': 1, 'currency': 'USD', 'hl': 'es',
                                 'gl': gl, 'booking_token': token, 'api_key': KEY})
    try:
        with urllib.request.urlopen('https://serpapi.com/search.json?' + qs, timeout=90) as r:
            j = json.loads(r.read())
    except Exception as e:
        print('vendedor:', e); return None
    ops = []
    for b in j.get('booking_options') or []:
        t = b.get('together') or {}
        if t.get('book_with'):
            ops.append((t.get('price') or 10**9, t['book_with']))
    if not ops:
        return None
    ops.sort()
    return ', '.join(dict.fromkeys(n for _, n in ops[:2]))   # el más barato y el siguiente


def link_google(origen, destino, salida, regreso):
    """Enlace a Google Flights con esa búsqueda ya hecha: ahí se escoge el vuelo y Google lleva a la página de compra."""
    return 'https://www.google.com/travel/flights?q=' + urllib.parse.quote(f'vuelos de {origen} a {destino} el {salida} regreso {regreso}')


def leer(params):
    u = SB + 'nc_vuelos?' + urllib.parse.urlencode(params)
    with urllib.request.urlopen(urllib.request.Request(u, headers={'apikey': SBK, 'Authorization': 'Bearer ' + SBK}), timeout=30) as r:
        return json.loads(r.read())


def ayer(persona, salida, regreso):
    """Último precio guardado para esa combinación antes de hoy, para decir si subió o bajó."""
    nombres = [persona] + [k for k, v in ALIAS.items() if v == persona]
    try:
        j = leer({'select': 'precio,dia', 'persona': 'in.(' + ','.join('"' + n + '"' for n in nombres) + ')', 'salida': 'eq.' + salida,
                  'regreso': 'eq.' + regreso, 'dia': 'lt.' + hoy_bogota().isoformat(), 'order': 'consultado_en.desc', 'limit': 1})
        return (float(j[0]['precio']), j[0]['dia']) if j else (None, None)
    except Exception as e:
        print('ayer:', e); return (None, None)


def desde_base():
    """Lo último guardado HOY por combinación (sin consultar SerpApi)."""
    gl_de = {p[0]: p[3] for p in PERSONAS}
    j = leer({'select': 'persona,origen,destino,salida,regreso,precio,aerolinea,escalas,nivel,consultado_en,detalle', 'dia': 'eq.' + hoy_bogota().isoformat(),
              'order': 'consultado_en.desc', 'limit': 500})
    out, vistos = {}, set()
    for r in j:
        persona = ALIAS.get(r['persona'], r['persona'])
        k = (persona, r['salida'], r['regreso'])
        if k in vistos: continue
        vistos.add(k)
        out.setdefault(persona, []).append(dict(p=float(r['precio']), salida=r['salida'], regreso=r['regreso'], aer=r['aerolinea'],
                                                esc=r['escalas'] or 0, ayer=None, nivel=r['nivel'], url=(r.get('detalle') or {}).get('url') or link_google(r['origen'], r['destino'], r['salida'], r['regreso']),
                                                vende=(r.get('detalle') or {}).get('vende'), o=r['origen'], d=r['destino'], gl=gl_de.get(persona, 'co'),
                                                token=next((b.get('booking_token') for b in (r.get('detalle') or {}).get('best', []) if b.get('price') == float(r['precio'])), None)))
    # quién vende la más barata de cada persona (si no se averiguó cuando se guardó): una consulta por persona
    if KEY and not SOLO:
        for persona, ops in out.items():
            pm = min(ops, key=lambda x: x['p'])
            if not pm['vende']:
                pm['vende'] = vendedor(pm['o'], pm['d'], pm['gl'], pm['salida'], pm['regreso'], pm['token']); print(persona, 'lo vende:', pm['vende'])
    return out


def guardar(filas):
    data = json.dumps({'p_filas': filas}).encode()
    req = urllib.request.Request(SB + 'rpc/nc_vuelos_guardar', data=data,
                                 headers={'apikey': SBK, 'Authorization': 'Bearer ' + SBK, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r:
        print('guardadas:', r.read().decode())


def telegram(texto):
    data = json.dumps({'chat_id': TG_CHAT, 'text': texto, 'parse_mode': 'HTML', 'disable_web_page_preview': True}).encode()
    req = urllib.request.Request(f'https://api.telegram.org/bot{TG_TOKEN}/sendMessage', data=data, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r:
        print('telegram:', r.status)


def trm():
    """TRM oficial vigente (Banco de la República vía datos.gov.co, la misma fuente del job del dólar). Si falla, solo dólares."""
    global TRM
    try:
        with urllib.request.urlopen(TRM_FUENTE, timeout=30) as r:
            TRM = float(json.loads(r.read())[0]['valor'])
    except Exception as e:
        print('trm:', e)
    return TRM


def cop(usd):
    """'$1.365 (4,42 M)' = dólares y millones de pesos a la TRM del día, con puntos y comas a la colombiana."""
    d = f'{usd:,.0f}'.replace(',', '.')
    if not TRM:
        return '$' + d
    m = f'{usd * TRM / 1e6:.2f}'.replace('.', ',')
    return f'${d} ({m} M)'


def fmt(d):
    f = dt.date.fromisoformat(d)
    return f'{f.day} {MESES[f.month - 1]}'


def dia(d):
    return str(dt.date.fromisoformat(d).day)


def flecha(p, pa):
    if pa is None: return ''
    if p < pa: return f' ⬇️ (ayer ${pa:,.0f})'.replace(',', '.')
    if p > pa: return f' ⬆️ (ayer ${pa:,.0f})'.replace(',', '.')
    return ' = ayer'


def resumen_texto(resumen, errores):
    hoy = hoy_bogota().strftime('%d/%m')
    trm()
    L = [f'✈️ <b>Vuelos a Madrid · {hoy}</b> (dólares y millones de pesos' + (f' a TRM {TRM:,.0f}'.replace(',', '.') if TRM else '') + ', ida y vuelta, económica)']
    niveles = {'low': 'barato', 'typical': 'normal', 'high': 'caro'}
    for persona, o, d, gl, salidas, regresos in PERSONAS:
        ops = resumen.get(persona)
        if not ops:
            L.append(f'\n<b>{persona}</b> ({o}→{d}): sin datos hoy'); continue
        L.append(f'\n<b>{persona}</b> ({o}→{d}) · vuelve el …')
        for salida in sorted(set(x['salida'] for x in ops)):
            fila = sorted((x for x in ops if x['salida'] == salida), key=lambda x: x['regreso'])
            L.append(f'  sale {fmt(salida)} → ' + ' · '.join(f'{dia(x["regreso"])} ene {cop(x["p"])}{flecha(x["p"], x["ayer"])}' for x in fila))
        pm = min(ops, key=lambda x: x['p'])
        L.append(f'  ⭐ más barato: sale {fmt(pm["salida"])}, vuelve {fmt(pm["regreso"])}: <b>{cop(pm["p"])}</b> · {pm["aer"] or "?"} · {pm["esc"]} escala{"s" if pm["esc"] != 1 else ""} · {niveles.get(pm["nivel"], pm["nivel"] or "")}')
        L.append(f'     🛒 lo vende: {pm.get("vende") or "ver en Google Flights"} · <a href="{pm["url"]}">abrir en Google Flights</a>')
    a, b = resumen.get(JUNTOS[0], []), resumen.get(JUNTOS[1], [])
    comunes = sorted(set(x['regreso'] for x in a) & set(x['regreso'] for x in b))
    if comunes:
        L.append(f'\n👫 {JUNTOS[0]} y {JUNTOS[1]} volviendo juntos el mismo día:')
        mejor_j = None
        for reg in comunes:
            pa_ = min((x for x in a if x['regreso'] == reg), key=lambda x: x['p'])
            pb_ = min((x for x in b if x['regreso'] == reg), key=lambda x: x['p'])
            tot = pa_['p'] + pb_['p']
            L.append(f'  {fmt(reg)}: <b>{cop(tot)}</b> entre los dos (<a href="{pa_["url"]}">él sale {fmt(pa_["salida"])}</a>, <a href="{pb_["url"]}">ella sale {fmt(pb_["salida"])}</a>)')
            if not mejor_j or tot < mejor_j[0]: mejor_j = (tot, reg)
        L.append(f'  ⭐ lo más barato juntos: el {fmt(mejor_j[1])}, {cop(mejor_j[0])}')
    if errores:
        L.append('\n⚠️ ' + ' · '.join(errores))
    return '\n'.join(L)


def main():
    filas, resumen, errores = [], {}, []
    if DESDE_BASE:
        resumen = desde_base()
    else:
        if not KEY and not DEMO:
            raise SystemExit('falta SERPAPI_KEY')
        for persona, o, d, gl, salidas, regresos in PERSONAS:
            for salida in salidas:
                for regreso in regresos:
                    try:
                        resp = serpapi(o, d, gl, salida, regreso)
                    except Exception as e:
                        errores.append(f'{persona} {salida}→{regreso}: {e}'); continue
                    m = mejor(resp)
                    if not m:
                        errores.append(f'{persona} {salida}→{regreso}: sin vuelos'); continue
                    pi = resp.get('price_insights') or {}
                    filas.append(dict(persona=persona, origen=o, destino=d, salida=salida, regreso=regreso, moneda='USD', **m,
                                      mas_bajo=pi.get('lowest_price'), nivel=pi.get('price_level'),
                                      rango_tipico='-'.join(str(x) for x in (pi.get('typical_price_range') or [])) or None,
                                      detalle={'best': (resp.get('best_flights') or [])[:3], 'url': link_google(o, d, salida, regreso)}))
                    pa, _ = ayer(persona, salida, regreso)
                    resumen.setdefault(persona, []).append(dict(p=m['precio'], salida=salida, regreso=regreso, aer=m['aerolinea'],
                                                               esc=m['escalas'], ayer=pa, nivel=pi.get('price_level'), token=m['token'],
                                                               o=o, d=d, gl=gl, url=link_google(o, d, salida, regreso), vende=None))
                    print(persona, salida, regreso, m['precio'], m['aerolinea'], m['escalas'], 'escalas · ayer', pa)
        for persona, ops in resumen.items():
            pm = min(ops, key=lambda x: x['p'])
            pm['vende'] = vendedor(pm['o'], pm['d'], pm['gl'], pm['salida'], pm['regreso'], pm['token'])
            for f in filas:
                if f['persona'] == persona and f['salida'] == pm['salida'] and f['regreso'] == pm['regreso']:
                    f['detalle']['vende'] = pm['vende']
            print(persona, 'lo vende:', pm['vende'])
    texto = resumen_texto(resumen, errores)
    print('\n' + texto)
    if SOLO:
        return
    if filas and not DEMO:      # los precios de mentira no se guardan
        guardar(filas)
    if TG_TOKEN and TG_CHAT:
        telegram(texto)


if __name__ == '__main__':
    main()
