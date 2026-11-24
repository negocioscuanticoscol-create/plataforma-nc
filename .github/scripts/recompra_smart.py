# -*- coding: utf-8 -*-
r"""Smart · recompra al día, sola. Corre en GitHub Actions (recompra_smart.yml) dos veces al día.
Baja de la base lo que hace falta (rpc sr_fuente), junta pedidos + ventas en UN cliente por persona (cédula/NIT o celular),
calcula ciclo de compra y quién toca, y reemplaza smart_recompra (rpc sr_cargar). Es el mismo análisis de _PLAYBOOK/smart_recompra/analizar.py.

POR QUÉ EXISTE: la tabla era una foto del 9-oct-2026 (HOY fijo en el análisis) y cada compra posterior desaparecía de "última compra".
CLAVE: la variable SR_ADMIN (secreto del repo; local: _PLAYBOOK/_sr_admin.txt). Nada más viaja: la llave pública del navegador y esa clave.
Las marcas "ya escribí" / "perdido" van amarradas al NOMBRE de la empresa: si el cliente ya estaba (mismo celular o nombre parecido) se conserva su nombre."""
import difflib, os, urllib.error, urllib.request
import json, re, os, sys, io, statistics, datetime as dt, collections

URL = 'https://fnayedgvamxktxfvywwl.supabase.co'
KEY = 'sb_publishable_NVTYNkJ0V6obLwgwjXza1g_3Ihp-xMv'
ADMIN = os.environ.get('SR_ADMIN') or open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '_PLAYBOOK', '_sr_admin.txt')).read().strip()
def rpc(fn, args):
    req = urllib.request.Request(URL + '/rest/v1/rpc/' + fn, data=json.dumps(args).encode(), headers={'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json'})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=120).read())
    except urllib.error.HTTPError as e:
        raise SystemExit('rpc %s falló: %s %s' % (fn, e.code, e.read().decode('utf8', 'replace')[:400]))
DATA = rpc('sr_fuente', {'p_admin': ADMIN})
print('fuente:', {k: (len(v) if isinstance(v, list) else v) for k, v in DATA.items()})
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
J = lambda n: DATA[n]
HOY = dt.datetime.now(dt.timezone(dt.timedelta(hours=-5))).date()   # fecha de Bogotá
MES = {'ene': 1, 'feb': 2, 'mar': 3, 'abr': 4, 'may': 5, 'jun': 6, 'jul': 7, 'ago': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dic': 12}
d = lambda x: re.sub(r'\D', '', str(x or ''))
import unicodedata
def nombre_k(t):
    t = unicodedata.normalize('NFKD', str(t or '')).encode('ascii', 'ignore').decode().upper()
    t = re.sub(r'(S\.?A\.?S\.?|S\.?A\.?|LTDA|SAS|SA|Y|DE|LA|EL)', ' ', t)
    return ' '.join(re.sub(r'[^A-Z0-9 ]', ' ', t).split())
def doc_k(x):
    x = d(x)
    if x in ('987654', '0', ''): return ''
    if len(x) == 10 and x[0] == '3': return ''          # es un celular, no un documento
    return x[:9] if len(x) >= 10 else x                 # NIT con dígito de verificación
cel10 = lambda x: d(x)[-10:] if len(d(x)) >= 10 else ''
ventas, cotiz, clientes = J('ventas'), J('cotiz'), J('clientes')

# ---- identidad: unión de cédula/NIT y celular ----
P = {}
def f(x):
    while P.setdefault(x, x) != x: P[x] = P[P[x]]; x = P[x]
    return x
def un(a, b):
    if a and b: P[f(a)] = f(b)
base = J('base')
CEL = {d(c['documento']): cel10(c['celular']) for c in clientes}
CEL.update({d(b['documento']): cel10(b['celular']) for b in base if cel10(b['celular'])})
CEL.update({doc_k(k): v for k, v in list(CEL.items()) if doc_k(k) and v})
NOMCEL = {nombre_k(c['nombre']): cel10(c['celular']) for c in clientes + base if cel10(c['celular'])}
NOM = {d(c['documento']): c['nombre'] for c in clientes}
ev = []   # eventos de compra: (key_tokens, fecha, total, productos, fuente, nombre, contacto, celular, doc)
def kit_cot(dd):
    # igual que _esKitCot de smart/app.js: kit SI y sin productos ni unidades
    if (dd or {}).get('kit_muestras') != 'SI': return False
    pr = dd.get('productos')
    try: pj = json.loads(pr) if isinstance(pr, str) else pr
    except Exception: pj = pr
    n = len(pj) if isinstance(pj, list) else (1 if pr else 0)
    return float(dd.get('total_uds') or 0) <= 0 and n == 0
COT_FOLIO = {c['folio']: c for c in cotiz if c.get('folio')}
VFECHA = {v['folio']: dt.date.fromisoformat(v['creado_en'][:10]) for v in ventas if v.get('folio')}   # la venta registrada manda sobre la hora de la cotización
def fecha_ped(p):
    f = dt.date.fromisoformat(p['creado_en'][:10]); v = VFECHA.get(p['folio'])
    return v if v and 0 < (v - f).days <= 3 else f      # solo corrige el desfase de 1-3 días (cotizó el 30-sep, vendió el 1-oct)
for p in cotiz:
    if p['estado'] != 'pedido': continue
    raw = d(p['datos'].get('cedula_nit')); dd = doc_k(raw); cc = cel10(p['celular']) or CEL.get(raw, '') or CEL.get(dd, '') or NOMCEL.get(nombre_k(p['cliente']), '') or (raw if len(raw) == 10 and raw[0] == '3' else '')
    un('d' + dd if dd else None, 'c' + cc if cc else None); un('n' + nombre_k(p['cliente']), 'd' + dd if dd else ('c' + cc if cc else None))
    prod = p['datos'].get('productos') or ''
    try: it = json.loads(prod); prod = ' · '.join(f"{i['ref']} {i.get('color','')} x{i['qty']}" for i in it); uni = sum(int(i['qty']) for i in it)
    except Exception: uni = sum(int(m) for m in re.findall(r'x(\d+)', prod))
    ev.append(dict(tok=('d' + dd) if dd else (('c' + cc) if cc else 'n' + nombre_k(p['cliente'])), tok2=('c' + cc) if cc else '', fecha=fecha_ped(p), total=float(p['total'] or 0), prod=prod, uni=uni, fuente='pedido',
                   nombre=p['datos'].get('empresa') or p['cliente'], contacto=p['contacto'] or p['cliente'], cel=cc, doc=dd, folio=p['folio'], kit=kit_cot(p['datos'])))
pedmes = {(e['tok'], e['fecha'].strftime('%Y-%m')) for e in ev}
for v in ventas:
    if v['estado_pago'] == 'Cancelada': continue
    raw = d(v['documento']); dd = doc_k(raw); cc = CEL.get(raw, '') or CEL.get(dd, '') or NOMCEL.get(nombre_k(v['cliente']), '') or (raw if len(raw) == 10 and raw[0] == '3' else '')
    un('d' + dd if dd else None, 'c' + cc if cc else None); un('n' + nombre_k(v['cliente']), 'd' + dd if dd else ('c' + cc if cc else None))
    m, y = v['mes'].split('-'); fecha = min(dt.date(int(y), MES[m], 15), HOY)
    ce = dt.date.fromisoformat(v['creado_en'][:10])
    if (ce.year, ce.month) == (int(y), MES[m]): fecha = ce      # el registro se hizo en el mismo mes: esa es la fecha real
    ev.append(dict(tok=('d' + dd) if dd else ('n' + nombre_k(v['cliente'])), tok2='c' + cc if cc else '', fecha=fecha, total=float(v['total_vendido'] or 0), prod=v.get('lista') or '', uni=0, fuente='mes', nombre=v['cliente'], contacto=v['cliente'], cel=cc, doc=dd, folio=v.get('folio'), kit=(bool(v['es_kit']) and (kit_cot(COT_FOLIO[v['folio']]['datos']) if v.get('folio') in COT_FOLIO else float(v['total_vendido'] or 0) <= 100000))))
# un pedido del mismo mes ya cubre la fila mensual del mismo cliente
for e in ev: e['k'] = f(e['tok'])
cub = {(e['k'], e['fecha'].strftime('%Y-%m')) for e in ev if e['fuente'] == 'pedido'}
ev = [e for e in ev if e['fuente'] == 'pedido' or (e['k'], e['fecha'].strftime('%Y-%m')) not in cub]
G = collections.defaultdict(list)
for e in ev: G[e['k']].append(e)

C = []
def metricas(L):
    fechas = sorted({e['fecha'] for e in L})
    comp = [fechas[0]]
    for x in fechas[1:]:
        if (x - comp[-1]).days > 7: comp.append(x)      # dos fechas a menos de 7 días = misma compra
    return comp, [(b - a).days for a, b in zip(comp, comp[1:])]
for k, L in G.items():
    L.sort(key=lambda e: e['fecha'])
    reales = [e for e in L if not e['kit']]; kits = [e for e in L if e['kit']]
    cel = next((e['cel'] for e in reversed(L) if e['cel']), '')
    base = reales or kits                                   # sin pedidos reales: el cliente es de MUESTRAS
    comp, gaps = metricas(base); ult = base[-1]; pedidos = [e for e in base if e['fuente'] == 'pedido']
    c = dict(tipo='pedido' if reales else 'muestra', nombre=(pedidos[-1] if pedidos else ult)['nombre'], contacto=(pedidos[-1] if pedidos else ult)['contacto'], celular=cel,
        doc=next((e['doc'] for e in L if e['doc']), ''), total=sum(e['total'] for e in base), compras=len(comp), primera=str(comp[0]), ultima=str(comp[-1]),
        dias_sin=(HOY - comp[-1]).days, gaps=gaps, ciclo_propio=round(statistics.mean(gaps)) if gaps else None, unidades=sum(e['uni'] for e in base),
        ultimo_pedido=(pedidos[-1]['prod'] if pedidos else ult['prod'])[:200], exacto=bool(pedidos),
        n_muestras=len(kits), fecha_muestra=str(kits[-1]['fecha']) if kits else None, dias_muestra=(HOY - kits[-1]['fecha']).days if kits else None)
    C.append(c)
# ciclo de referencia: mediana de todos los intervalos entre compras
todos = [g for c in C if c['tipo'] == 'pedido' for g in c['gaps']]
CICLO = round(statistics.median(todos)) if todos else 24
print('ciclo mediano entre compras:', CICLO, 'días · intervalos medidos:', len(todos))
for c in C:
    if c['tipo'] == 'muestra':
        c.update(ciclo_usado=None, base_ciclo='', proxima=None, dias_para=None, ya_repuso=False, estado='Muestra'); continue
    ciclo = c['ciclo_propio'] or CICLO
    c['ciclo_usado'] = ciclo; c['base_ciclo'] = 'propio' if c['ciclo_propio'] else 'mediano'
    c['proxima'] = str(dt.date.fromisoformat(c['ultima']) + dt.timedelta(days=ciclo)); c['dias_para'] = ciclo - c['dias_sin']
    c['ya_repuso'] = c['compras'] >= 2
    c['estado'] = ('Tocó hace rato (en riesgo)' if c['dias_sin'] > ciclo * 2.5 else 'TOCA YA' if c['dias_sin'] >= ciclo else 'Toca en 15 días' if c['dias_para'] <= 15 else 'Aún no toca')
C.sort(key=lambda c: (c['tipo'] != 'pedido', -c['total'] if c['tipo'] == 'pedido' else -(c['dias_muestra'] or 0)))
for i, c in enumerate(C): c['rank'] = i + 1

# ---------------- reemplazo de la tabla ----------------
def lit_bonito(n):
    n = ' '.join(str(n or '').split())
    t = n.title() if (n.isupper() or n.islower()) else n
    return re.sub(r'\b(Sas|S\.a\.s|S\.a\.s\.)\b', 'SAS', t)
viejo = DATA['viejo']
por_cel = {}
for o in viejo:
    cel = re.sub(r'\D', '', o.get('celular') or '')[-10:]
    if cel: por_cel.setdefault(cel, o['empresa'])
por_nombre = {nombre_k(o['empresa']): o['empresa'] for o in viejo}
def parecido(nombre):
    k = nombre_k(nombre)
    if k in por_nombre: return por_nombre[k]
    mejor = max(por_nombre, key=lambda x: difflib.SequenceMatcher(None, k, x).ratio(), default=None)
    return por_nombre[mejor] if mejor and difflib.SequenceMatcher(None, k, mejor).ratio() >= 0.8 else None
filas, usados = [], set()
for c in C:
    cel = re.sub(r'\D', '', c.get('celular') or '')[-10:]
    emp = por_cel.get(cel) or parecido(c['nombre']) or lit_bonito(c['nombre'])
    if emp in usados: emp = f"{emp} ({cel[-4:]})" if cel else emp + ' (2)'
    usados.add(emp)
    msg = (f"Hola {emp}, te enviamos tus muestras de envases Smart. \u00bfPudiste probarlas? Cu\u00e9ntanos qu\u00e9 te parecieron y con gusto te ayudamos con tu primer pedido."
           if c['tipo'] == 'muestra' else
           f"Hola {emp}, para nosotros eres muy importante como cliente. Queremos saber qu\u00e9 necesidades tienes y estamos disponibles para cualquier inquietud o pedido que tengas.")
    filas.append(dict(rank=c['rank'], empresa=emp, contacto=c.get('contacto') or emp, celular=cel or None, total=round(c['total']), compras=c['compras'], primera=c['primera'],
                      ultima=c['ultima'], dias_sin=c['dias_sin'], ciclo=c.get('ciclo_usado'), proxima=c.get('proxima'), estado=c['estado'], ultimo_pedido=c.get('ultimo_pedido') or '',
                      mensaje=msg, tipo=c['tipo'], fecha_muestra=c.get('fecha_muestra'), dias_muestra=c.get('dias_muestra'), n_muestras=c.get('n_muestras') or 0))
sin_cliente = sorted(set(DATA['marcadas']) - {f['empresa'] for f in filas})
print('clientes:', len(filas), '| pedidos', sum(f['tipo'] == 'pedido' for f in filas), '| muestras', sum(f['tipo'] == 'muestra' for f in filas), '| hasta', HOY)
if sin_cliente: print('ATENCION marcas sin cliente (se pierden):', sin_cliente)
r = rpc('sr_cargar', {'p_admin': ADMIN, 'p_filas': filas, 'p_pedido_hasta': DATA.get('ultimo_pedido')})
print('cargado:', r)
# verificación: la última compra de la tabla no puede ir atrás del último pedido registrado
ult_ped = (DATA.get('ultimo_pedido') or '')[:10]
if ult_ped and r.get('ultima') and r['ultima'] < ult_ped[:10]:
    # puede ser legítimo si el último pedido es de un kit; se avisa pero no se cae
    print('AVISO: la última compra cargada (%s) es anterior al último pedido (%s): revisar si es un kit de muestras' % (r['ultima'], ult_ped))
