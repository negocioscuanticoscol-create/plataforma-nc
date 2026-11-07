# -*- coding: utf-8 -*-
"""Vuelos de fin de año (José, 6 nov 2026): todos los días pregunta en Google Flights (vía SerpApi) el precio de cada
combinación de fechas, lo guarda en nc_vuelos y manda por Telegram el más barato de cada persona, si subió o bajó frente
a ayer, y la mejor combinación para que las dos de Bogotá vuelvan juntas el 7 de enero.

Personas y fechas (todas adultas, económica, ida y vuelta):
  Chicago  → Madrid  sale 12 dic 2026, vuelve 3 o 4 ene 2027
  Bogotá 1 → Madrid  sale 20 dic 2026, vuelve 4, 5, 6 o 7 ene 2027 (mejor el 7)
  Bogotá 2 → Madrid  sale 10 dic 2026, vuelve 7 u 8 ene 2027
Son 8 consultas por día = 240 al mes: cabe en el plan gratis de SerpApi (250). Si se agregan fechas, toca plan de pago.

Variables: SERPAPI_KEY, TELEGRAM_TOKEN, TELEGRAM_CHAT_ID. SOLO_IMPRIMIR=1 no guarda ni manda. DEMO=1 usa una respuesta
de mentira para probar el resumen sin gastar consultas.
"""
import os, json, urllib.request, urllib.parse, datetime as dt

SB = 'https://fnayedgvamxktxfvywwl.supabase.co/rest/v1/'
SBK = 'sb_publishable_NVTYNkJ0V6obLwgwjXza1g_3Ihp-xMv'          # llave pública: solo lee y llama nc_vuelos_guardar
KEY = os.environ.get('SERPAPI_KEY', '')
TG_TOKEN = os.environ.get('TELEGRAM_TOKEN', '')
TG_CHAT = os.environ.get('TELEGRAM_CHAT_ID', '')
SOLO = os.environ.get('SOLO_IMPRIMIR', '0') == '1'
DEMO = os.environ.get('DEMO', '0') == '1'

# persona, origen, destino, país de compra (Google cobra distinto según desde dónde se compra), salida, regresos posibles
PERSONAS = [
    ('Chicago',  'ORD', 'MAD', 'us', '2026-12-12', ['2027-01-03', '2027-01-04']),
    ('Bogotá 1', 'BOG', 'MAD', 'co', '2026-12-20', ['2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07']),
    ('Bogotá 2', 'BOG', 'MAD', 'co', '2026-12-10', ['2027-01-07', '2027-01-08']),
]
JUNTAS = '2027-01-07'   # el día en que las dos de Bogotá querrían volver juntas


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
    return dict(precio=o['price'], aerolinea=aer, escalas=len(o.get('layovers') or []), duracion_min=o.get('total_duration'))


def ayer(persona, salida, regreso):
    """Último precio guardado para esa combinación antes de hoy, para decir si subió o bajó."""
    hoy = (dt.datetime.utcnow() - dt.timedelta(hours=5)).date().isoformat()
    u = SB + 'nc_vuelos?select=precio,dia&' + urllib.parse.urlencode({'persona': 'eq.' + persona, 'salida': 'eq.' + salida, 'regreso': 'eq.' + regreso,
                                                                    'dia': 'lt.' + hoy, 'order': 'consultado_en.desc', 'limit': 1})
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers={'apikey': SBK, 'Authorization': 'Bearer ' + SBK}), timeout=30) as r:
            j = json.loads(r.read())
            return (float(j[0]['precio']), j[0]['dia']) if j else (None, None)
    except Exception as e:
        print('ayer:', e); return (None, None)


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


TRM_FUENTE = 'https://www.datos.gov.co/resource/32sa-8pi3.json?$order=vigenciadesde%20DESC&$limit=1'
TRM = None


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


MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']


def fmt(d):
    f = dt.date.fromisoformat(d)
    return f'{f.day} {MESES[f.month - 1]}'


def flecha(p, pa):
    if pa is None: return ''
    if p < pa: return f' ⬇️ (ayer ${pa:,.0f})'.replace(',', '.')
    if p > pa: return f' ⬆️ (ayer ${pa:,.0f})'.replace(',', '.')
    return ' = ayer'


def main():
    if not KEY and not DEMO:
        raise SystemExit('falta SERPAPI_KEY')
    filas, resumen, errores = [], {}, []
    for persona, o, d, gl, salida, regresos in PERSONAS:
        for regreso in regresos:
            try:
                resp = serpapi(o, d, gl, salida, regreso)
            except Exception as e:
                errores.append(f'{persona} {salida}→{regreso}: {e}'); continue
            m = mejor(resp)
            if not m:
                errores.append(f'{persona} {salida}→{regreso}: sin vuelos'); continue
            pi = resp.get('price_insights') or {}
            fila = dict(persona=persona, origen=o, destino=d, salida=salida, regreso=regreso, moneda='USD', **m,
                        mas_bajo=pi.get('lowest_price'), nivel=pi.get('price_level'),
                        rango_tipico='-'.join(str(x) for x in (pi.get('typical_price_range') or [])) or None,
                        detalle={'best': (resp.get('best_flights') or [])[:3]})
            filas.append(fila)
            pa, dia_pa = ayer(persona, salida, regreso)
            resumen.setdefault(persona, []).append((m['precio'], regreso, m['aerolinea'], m['escalas'], pa, pi.get('price_level')))
            print(persona, salida, regreso, m['precio'], m['aerolinea'], m['escalas'], 'escalas · ayer', pa)

    # ---------- resumen
    hoy = (dt.datetime.utcnow() - dt.timedelta(hours=5)).strftime('%d/%m')
    trm()
    L = [f'✈️ <b>Vuelos a Madrid · {hoy}</b> (dólares y millones de pesos' + (f' a TRM {TRM:,.0f}'.replace(',', '.') if TRM else '') + ', ida y vuelta, económica)']
    niveles = {'low': 'barato', 'typical': 'normal', 'high': 'caro'}
    for persona, o, d, gl, salida, regresos in PERSONAS:
        ops = resumen.get(persona)
        if not ops:
            L.append(f'\n<b>{persona}</b> ({o}→{d}, sale {fmt(salida)}): sin datos hoy'); continue
        L.append(f'\n<b>{persona}</b> ({o}→{d}, sale {fmt(salida)})')
        for p, reg, aer, esc, pa, niv in sorted(ops, key=lambda x: x[1]):
            L.append(f'  vuelve {fmt(reg)}: <b>{cop(p)}</b>{flecha(p, pa)} · {aer or "?"} · {esc} escala{"s" if esc != 1 else ""} · {niveles.get(niv, niv or "")}')
        pmin = min(ops, key=lambda x: x[0])
        L.append(f'  → el más barato: <b>{cop(pmin[0])}</b> volviendo el {fmt(pmin[1])}')
    b1 = next((x for x in resumen.get('Bogotá 1', []) if x[1] == JUNTAS), None)
    b2 = next((x for x in resumen.get('Bogotá 2', []) if x[1] == JUNTAS), None)
    if b1 and b2:
        L.append(f'\n👭 Las dos de Bogotá volviendo juntas el {fmt(JUNTAS)}: <b>{cop(b1[0] + b2[0])}</b> entre las dos')
    if errores:
        L.append('\n⚠️ ' + ' · '.join(errores))
    texto = '\n'.join(L)
    print('\n' + texto)
    if SOLO:
        return
    if filas and not DEMO:      # los precios de mentira no se guardan
        guardar(filas)
    if TG_TOKEN and TG_CHAT:
        telegram(texto)


if __name__ == '__main__':
    main()
