# Portafolio · trae el precio de cierre de cada acción y la TRM del día.
# Corre en GitHub Actions (ver .github/workflows/portafolio-precios.yml).
#
# Los tickers NO están escritos acá: salen de port_operacion. Cuando José
# compre algo nuevo, aparece solo.

import json, re, sys, time, urllib.request, urllib.parse
from datetime import datetime, timedelta, timezone

sys.stdout.reconfigure(encoding='utf-8')

SB  = 'https://fnayedgvamxktxfvywwl.supabase.co/rest/v1/'
KEY = 'sb_publishable_NVTYNkJ0V6obLwgwjXza1g_3Ihp-xMv'
UA  = 'Mozilla/5.0 (compatible; NegociosCuanticos/1.0)'

# Bogotá es UTC-5 todo el año: no hay horario de verano.
HOY = (datetime.now(timezone.utc) - timedelta(hours=5)).strftime('%Y-%m-%d')


def sb(ruta, metodo='GET', cuerpo=None, prefer=None):
    h = {'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json'}
    if prefer:
        h['Prefer'] = prefer
    req = urllib.request.Request(SB + ruta, method=metodo, headers=h,
                                 data=json.dumps(cuerpo).encode() if cuerpo is not None else None)
    with urllib.request.urlopen(req, timeout=60) as r:
        t = r.read().decode()
        return json.loads(t) if t.strip() else []


def pedir(url, cabeceras=None):
    req = urllib.request.Request(url, headers=cabeceras or {'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=45) as r:
        return json.load(r)


def trm_del_dia():
    """TRM oficial de la Superfinanciera, vía datos.gov.co. Gratis y sin llave.
    Devuelve (fecha_vigencia, valor). La TRM del viernes rige hasta el lunes,
    así que se guarda con la fecha de HOY, no con la de vigencia."""
    url = ('https://www.datos.gov.co/resource/32sa-8pi3.json'
           '?$limit=1&$order=vigenciadesde%20DESC')
    d = pedir(url)
    if not d:
        return None
    return d[0].get('vigenciadesde', '')[:10], float(d[0]['valor'])


def precio_de(ticker):
    """Último precio de Yahoo. Devuelve None si el ticker no existe."""
    url = ('https://query1.finance.yahoo.com/v8/finance/chart/'
           + urllib.parse.quote(ticker) + '?range=5d&interval=1d')
    try:
        d = pedir(url)
        meta = d['chart']['result'][0]['meta']
        v = meta.get('regularMarketPrice')
        return float(v) if v is not None else None
    except Exception as e:
        print(f'   {ticker}: no se pudo leer ({e})')
        return None


def correr():
    # --- 1) la TRM
    try:
        vig, valor = trm_del_dia()
        sb('port_trm', 'POST', {'fecha': HOY, 'valor': valor},
           'resolution=merge-duplicates,return=minimal')
        print(f'TRM {HOY}: ${valor:,.2f} (vigente desde {vig})')
    except Exception as e:
        print(f'::warning::No se pudo traer la TRM: {e}')

    # --- 2) los tickers que José realmente tiene
    ops = sb('port_operacion?select=ticker')
    tickers = sorted({str(o['ticker']).upper().strip() for o in ops if o.get('ticker')})
    if not tickers:
        print('Todavía no hay operaciones cargadas: no hay precios que traer.')
        return
    print(f'Acciones en el portafolio: {", ".join(tickers)}')

    # --- 3) los precios
    filas, fallaron = [], []
    for t in tickers:
        p = precio_de(t)
        if p is None:
            fallaron.append(t)
            continue
        filas.append({'ticker': t, 'fecha': HOY, 'cierre_usd': p})
        print(f'   {t:8} US${p:,.2f}')
        time.sleep(0.4)   # sin apurar a Yahoo, que bloquea al que raspa duro

    if filas:
        sb('port_precio', 'POST', filas, 'resolution=merge-duplicates,return=minimal')
        print(f'Guardados {len(filas)} precios del {HOY}.')
    if fallaron:
        print(f'::warning::Sin precio: {", ".join(fallaron)}. '
              'Revisar que el nemotécnico esté bien escrito.')


if __name__ == '__main__':
    correr()
