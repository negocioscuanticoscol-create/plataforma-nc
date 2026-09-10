# -*- coding: utf-8 -*-
"""
Agente de vacantes — perfil Maria Clemencia Marin Penaloza
(Jefe de Compras / Logistica / Abastecimiento / Comercio Exterior)

Corre solo, una vez al dia, desde GitHub Actions (.github/workflows/empleos.yml).
Revisa cinco fuentes, se queda con lo que encaja con el perfil, descarta lo que
ya aviso antes y manda a Telegram SOLO lo nuevo.

La memoria vive en Supabase, tabla nc_empleos: sin ella el agente repetiria las
mismas vacantes todos los dias y en tres dias nadie le vuelve a parar bolas.

Secretos por variable de entorno (en Actions van como secrets del repo):
  TELEGRAM_TOKEN, TELEGRAM_CHAT_ID
La llave de Supabase es la publishable, la misma que ya esta en todos los HTML.

Para probarlo a mano sin mandar nada a Telegram:
  python empleos_agente.py --seco
"""
import json, os, re, sys, time, unicodedata, urllib.parse, urllib.request

sys.stdout.reconfigure(encoding='utf-8')

SECO = '--seco' in sys.argv

SB  = 'https://fnayedgvamxktxfvywwl.supabase.co'
KEY = 'sb_publishable_NVTYNkJ0V6obLwgwjXza1g_3Ihp-xMv'
H   = {'apikey': KEY, 'Authorization': 'Bearer ' + KEY}
UA  = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
       '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')

TG_TOKEN = os.environ.get('TELEGRAM_TOKEN', '')
TG_CHAT  = os.environ.get('TELEGRAM_CHAT_ID', '')

# ── Que cuenta como buena vacante ─────────────────────────────────────────────
# Suma: el cargo del perfil. Sin al menos uno de estos, la vacante no se mira.
CARGO = {
    'jefe de compras': 10, 'gerente de compras': 10, 'director de compras': 10,
    'directora de compras': 10, 'jefe de abastecimiento': 10,
    'director de abastecimiento': 10, 'directora de abastecimiento': 10,
    'gerente de abastecimiento': 10, 'lider de compras': 8, 'jefe de suministros': 8,
    'coordinador de compras': 6, 'gestor de compras': 8, 'jefe de logistica': 7,
    'gerente de logistica': 8, 'procurement manager': 10, 'sourcing manager': 10,
    'procurement specialist': 8, 'strategic sourcing': 9, 'category manager': 8,
    'procurement': 8, 'sourcing': 8, 'supply chain manager': 7,
    'comercio exterior': 7, 'abastecimiento': 5,
}
# Suma extra: lo que la hace competitiva de verdad.
PLUS = {'sap': 3, 'ariba': 4, 'bilingue': 3, 'ingles': 2, 'comex': 3,
        'importacion': 2, 'negociacion': 2, 'indirect': 3, 'remoto': 3,
        'remote': 3, 'latam': 3, 'bogota': 2, 'hibrido': 1}
# Resta: nivel por debajo del perfil. -20 saca la vacante del listado.
FUERA = {'auxiliar': -20, 'asistente': -20, 'practicante': -20, 'aprendiz': -20,
         'estudiante': -20, 'junior': -12, 'analista': -8, 'operario': -20,
         'mensajero': -20, 'conductor': -20, 'vendedor': -10, 'cajero': -20,
         'bodeguero': -20, 'auxiliar de bodega': -20,
         'analyst': -8, 'assistant': -20, 'intern': -20, 'coordinator': -4}
UMBRAL = 8


def limpio(s):
    """minusculas sin tildes ni html, para poder comparar de verdad"""
    s = re.sub(r'&#(\d+);', lambda m: chr(int(m.group(1))), str(s or ''))
    s = re.sub(r'&[a-z]+;', ' ', s)
    s = ''.join(c for c in unicodedata.normalize('NFD', s.lower())
                if unicodedata.category(c) != 'Mn')
    return re.sub(r'\s+', ' ', s).strip()


def texto_plano(s):
    """lo que se le muestra a la persona: sin html y con las tildes de verdad"""
    s = re.sub(r'<[^>]+>', '', str(s or ''))
    s = re.sub(r'&#(\d+);', lambda m: chr(int(m.group(1))), s)
    s = re.sub(r'&#x([0-9a-fA-F]+);', lambda m: chr(int(m.group(1), 16)), s)
    for a, b in (('&amp;', '&'), ('&quot;', '"'), ('&aacute;', 'á'), ('&eacute;', 'é'),
                 ('&iacute;', 'í'), ('&oacute;', 'ó'), ('&uacute;', 'ú'), ('&ntilde;', 'ñ'),
                 ('&nbsp;', ' '), ('&#039;', "'")):
        s = s.replace(a, b)
    return re.sub(r'\s+', ' ', s).strip()


def puntuar(texto):
    t = limpio(texto)
    cargo = max((v for k, v in CARGO.items() if k in t), default=0)
    if not cargo:
        return 0
    return cargo + sum(v for k, v in PLUS.items() if k in t) \
                 + sum(v for k, v in FUERA.items() if k in t)


def bajar(url, timeout=30):
    req = urllib.request.Request(url, headers={'User-Agent': UA,
                                               'Accept-Language': 'es-CO,es;q=0.9'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode('utf-8', 'ignore')


# ── Fuentes ───────────────────────────────────────────────────────────────────
def elempleo():
    """El portal mas grande de Colombia. Los avisos son /co/ofertas-trabajo/<slug>-<id>."""
    out = []
    for b in ('trabajo-jefe-de-compras', 'trabajo-gerente-de-compras',
              'trabajo-director-de-compras', 'trabajo-abastecimiento',
              'trabajo-comercio-exterior', 'trabajo-jefe-de-logistica'):
        try:
            h = bajar('https://www.elempleo.com/co/ofertas-empleo/' + b)
        except Exception as e:
            print('   elempleo %s: %s' % (b, str(e)[:60])); continue
        for url, tit in re.findall(r'href="(/co/ofertas-trabajo/[^"]+)"[^>]*>\s*([^<]{6,140})', h):
            out.append({'fuente': 'elempleo', 'titulo': tit.strip(),
                        'url': 'https://www.elempleo.com' + url,
                        'empresa': '', 'ubicacion': 'Colombia'})
        time.sleep(1.5)          # sin esto el portal empieza a cortar
    return out


def computrabajo():
    out = []
    for b in ('trabajo-de-jefe-de-compras', 'trabajo-de-gerente-de-compras',
              'trabajo-de-jefe-de-abastecimiento', 'trabajo-de-comercio-exterior'):
        try:
            h = bajar('https://co.computrabajo.com/' + b)
        except Exception as e:
            print('   computrabajo %s: %s' % (b, str(e)[:60])); continue
        for url, tit in re.findall(r'href="(/ofertas-de-trabajo/[^"]+)"[^>]*>([^<]{6,140})<', h):
            out.append({'fuente': 'computrabajo', 'titulo': tit.strip(),
                        'url': 'https://co.computrabajo.com' + url,
                        'empresa': '', 'ubicacion': 'Colombia'})
        time.sleep(1.5)
    return out


def api_json(url, camino, mapa, fuente):
    """Las tres APIs de remoto son publicas y documentadas; se les pide poco y despacio."""
    try:
        d = json.loads(bajar(url))
    except Exception as e:
        print('   %s: %s' % (fuente, str(e)[:60])); return []
    for k in camino:
        d = (d or {}).get(k) or []
    out = []
    for x in d if isinstance(d, list) else []:
        try:
            out.append({'fuente': fuente,
                        'titulo':    str(x.get(mapa['t']) or ''),
                        'empresa':   str(x.get(mapa['e']) or ''),
                        'ubicacion': str(x.get(mapa['u']) or 'Remoto'),
                        'url':       str(x.get(mapa['l']) or '')})
        except Exception:
            pass
    return out


FUENTES = [
    ('elempleo',     elempleo),
    ('computrabajo', computrabajo),
    ('remotive',  lambda: api_json('https://remotive.com/api/remote-jobs?limit=200',
                     ['jobs'], {'t': 'title', 'e': 'company_name', 'u': 'candidate_required_location', 'l': 'url'}, 'remotive')),
    ('jobicy',    lambda: api_json('https://jobicy.com/api/v2/remote-jobs?count=50&tag=procurement',
                     ['jobs'], {'t': 'jobTitle', 'e': 'companyName', 'u': 'jobGeo', 'l': 'url'}, 'jobicy')),
    ('himalayas', lambda: api_json('https://himalayas.app/jobs/api?limit=100',
                     ['jobs'], {'t': 'title', 'e': 'companyName', 'u': 'locationRestrictions', 'l': 'applicationLink'}, 'himalayas')),
]


def idpropio(v):
    """La llave es la URL sin parametros: el mismo aviso reaparece con otro texto."""
    # Fuera el ? y TAMBIEN el #: computrabajo mete la posicion en la lista
    # (#lc=ListOffers-Score4-10) y la misma vacante cambiaba de identidad al
    # moverse de puesto, asi que se avisaba dos veces.
    u = v['url'].split('?')[0].split('#')[0].rstrip('/')
    return (v['fuente'] + ':' + u)[:200]


def recolectar():
    todo, vistos = [], set()
    for nombre, fn in FUENTES:
        try:
            r = fn()
        except Exception as e:
            print('   %s FALLO: %s' % (nombre, str(e)[:80])); continue
        n = 0
        for v in r:
            if not v.get('url') or not v.get('titulo'):
                continue
            v['id'] = idpropio(v)
            if v['id'] in vistos:
                continue
            vistos.add(v['id'])
            v['puntaje'] = puntuar(v['titulo'] + ' ' + v.get('empresa', '') + ' ' + v.get('ubicacion', ''))
            if v['puntaje'] >= UMBRAL:
                todo.append(v); n += 1
        print('   %-13s %3d encajan (de %d)' % (nombre, n, len(r)))
    return todo


def ya_avisadas(ids):
    """Se pregunta por bloques: PostgREST corta la URL si se le mandan 200 ids de una."""
    conocidos = set()
    for i in range(0, len(ids), 40):
        lote = ids[i:i + 40]
        lista = '(' + ','.join('"%s"' % x.replace('"', '') for x in lote) + ')'
        q = 'id=in.' + urllib.parse.quote(lista, safe='')
        try:
            req = urllib.request.Request(SB + '/rest/v1/nc_empleos?select=id&' + q, headers=H)
            conocidos |= {x['id'] for x in json.load(urllib.request.urlopen(req, timeout=30))}
        except Exception as e:
            print('   aviso: no pude leer la memoria (%s)' % str(e)[:50])
    return conocidos


def guardar(vs):
    body = json.dumps([{'id': v['id'], 'fuente': v['fuente'], 'titulo': v['titulo'][:300],
                        'empresa': v.get('empresa', '')[:200], 'ubicacion': v.get('ubicacion', '')[:200],
                        'url': v['url'][:600], 'puntaje': v['puntaje'],
                        'avisado_en': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
                       for v in vs]).encode()
    req = urllib.request.Request(SB + '/rest/v1/nc_empleos?on_conflict=id', data=body, method='POST',
                                 headers={**H, 'Content-Type': 'application/json',
                                          'Prefer': 'resolution=merge-duplicates,return=minimal'})
    urllib.request.urlopen(req, timeout=40)


def esc(s):
    """Telegram rechaza el mensaje entero si un & o un < van sueltos en modo HTML."""
    return str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def partir(texto, tope=3800):
    """Telegram corta en 4096 caracteres: se manda por bloques, sin romper una linea."""
    trozos, actual = [], ''
    for linea in texto.split('\n'):
        if len(actual) + len(linea) + 1 > tope:
            trozos.append(actual.rstrip()); actual = ''
        actual += linea + '\n'
    if actual.strip():
        trozos.append(actual.rstrip())
    return trozos


def telegram(texto):
    if SECO:
        print('\n--- SECO, no se manda. Esto habria salido: ---\n' + texto); return
    if not TG_TOKEN or not TG_CHAT:
        print('::error::faltan TELEGRAM_TOKEN o TELEGRAM_CHAT_ID'); sys.exit(1)
    for i, trozo in enumerate(partir(texto)):
        body = urllib.parse.urlencode({'chat_id': TG_CHAT, 'text': trozo,
                                       'parse_mode': 'HTML',
                                       'disable_web_page_preview': 'true'}).encode()
        try:
            urllib.request.urlopen(
                urllib.request.Request('https://api.telegram.org/bot%s/sendMessage' % TG_TOKEN,
                                       data=body, method='POST'), timeout=30)
        except urllib.error.HTTPError as e:
            print('::error::Telegram rechazo el bloque %d: %s' % (i + 1, e.read().decode()[:300]))
            raise
        time.sleep(0.4)


def main():
    print('Buscando vacantes...')
    v = recolectar()
    print('\ncandidatas que pasan el umbral: %d' % len(v))
    if not v:
        print('nada que avisar'); return
    conocidas = ya_avisadas([x['id'] for x in v])
    nuevas = [x for x in v if x['id'] not in conocidas]
    nuevas.sort(key=lambda x: -x['puntaje'])
    print('nuevas (no avisadas antes): %d' % len(nuevas))
    if not nuevas:
        print('todo lo de hoy ya se habia avisado'); return

    hoy = time.strftime('%d/%m/%Y')
    L = ['<b>%d vacantes nuevas</b> · %s' % (len(nuevas), hoy),
         '<i>Compras · Abastecimiento · Comex</i>', '']
    for x in nuevas[:25]:
        donde = x.get('ubicacion', '') or ''
        emp   = x.get('empresa', '') or ''
        sub   = texto_plano(' · '.join(p for p in (emp, donde) if p))[:70]
        L.append('<b>%s</b>' % esc(texto_plano(x['titulo'])[:90]))
        L.append('%s%s' % (esc(sub) + ' · ' if sub else '', x['fuente']))
        L.append(x['url'])
        L.append('')
    if len(nuevas) > 25:
        L.append('… y %d más en la base.' % (len(nuevas) - 25))
    telegram('\n'.join(L))
    if not SECO:
        guardar(nuevas)
    print('listo: %d avisadas' % len(nuevas))


if __name__ == '__main__':
    main()
