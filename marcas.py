# -*- coding: utf-8 -*-
"""Cruza las marcas de la competencia contra las bases que se estan llamando.

No marca nada: solo muestra. Nombres como 'Saga' o 'Bata' pegan dentro de
cualquier palabra -Sagastume, Batalla- asi que se busca por PALABRA COMPLETA y
se reporta para que Jose apruebe antes de esconder a nadie.
"""
import json, urllib.request, io, re, sys, unicodedata
sys.path.insert(0, sys.path[0] or '.')
from leer_xlsx import leer

XLS = r'C:\Users\JOSE CALDERON\Downloads\Marcas_Botas_Trabajo_Colombia.xlsx'
BASES = {
    'Calzado · Distribuidores':   'e53a4625-f678-4c95-b104-2976d703d2f9',
    'Distribuidores potenciales': '4d1b64ca-9afb-43a3-b919-c63593a8a438',
    'Empresas':                   'eed90638-9049-40d9-b22c-2588c1420a5c',
}

tok = re.search(r'sbp_[A-Za-z0-9]+', io.open('_PLAYBOOK/_token.txt', encoding='utf-8').read()).group(0)
def q(s):
    r = urllib.request.Request('https://api.supabase.com/v1/projects/fnayedgvamxktxfvywwl/database/query',
        data=json.dumps({'query': s}).encode(),
        headers={'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json'})
    return json.loads(urllib.request.urlopen(r).read())

def sinacento(s):
    return unicodedata.normalize('NFD', str(s or '')).encode('ascii', 'ignore').decode().lower()

# --- las marcas del Excel ---
filas = leer(XLS, 'Marcas')['Marcas']
ix = {c.strip(): i for i, c in enumerate(filas[0])}
g = lambda f, c: (f[ix[c]].strip() if ix.get(c) is not None and ix[c] < len(f) else '')

marcas = []
for f in filas[1:]:
    nom = g(f, 'Marca')
    if not nom: continue
    # "Croydon (Workman, La Macha...)" -> la marca principal y las de adentro
    base = re.split(r'[(]', nom)[0].strip()
    dentro = re.findall(r'\(([^)]*)\)', nom)
    alias = [base] + [a.strip() for d in dentro for a in d.split(',') if a.strip()]
    for a in alias:
        a = a.strip(' .')
        if len(a) >= 4:                      # 'SAS', 'JR' pegan en todo
            marcas.append({'marca': a, 'principal': base,
                           'comp': g(f, 'Competencia'), 'fab': g(f, 'Fabricante / Empresa')})

vistas, limpias = set(), []
for m in marcas:
    k = sinacento(m['marca'])
    if k not in vistas: vistas.add(k); limpias.append(m)
print('MARCAS Y SUBMARCAS DEL ARCHIVO:', len(limpias))
print('  ', ', '.join(m['marca'] for m in limpias[:28]), '...')
print()

# --- el cruce, por palabra completa ---
todo = {}
for nom, bid in BASES.items():
    todo[nom] = q("""select id, razon_social, municipio, estado
                     from mkr_empresas where base_id='""" + bid + """'
                       and coalesce(estado,'') not in ('descartado','competencia','reservado')""")
    print('{:<30} {:>5} vivas'.format(nom, len(todo[nom])))
print()

hits = {}
for m in limpias:
    pat = re.compile(r'(?<![a-z0-9])' + re.escape(sinacento(m['marca'])) + r'(?![a-z0-9])')
    for base, filas_b in todo.items():
        for e in filas_b:
            if pat.search(sinacento(e['razon_social'])):
                hits.setdefault(m['marca'], []).append((base, e))

print('=== COINCIDENCIAS (nada marcado todavía) ===')
tot = 0
for marca in sorted(hits, key=lambda k: -len(hits[k])):
    l = hits[marca]; tot += len(l)
    comp = next(m['comp'] for m in limpias if m['marca'] == marca)
    print('\n{} · {} · {} coincidencia(s)'.format(marca.upper(), comp, len(l)))
    for base, e in l[:6]:
        print('   {:<44} {:<14} [{}]'.format(e['razon_social'][:44], str(e['municipio'])[:14], base[:12]))
    if len(l) > 6: print('   ... y {} más'.format(len(l) - 6))
print()
print('TOTAL de empresas que coinciden con alguna marca:', tot)
io.open('marcas_hits.json', 'w', encoding='utf-8').write(json.dumps(
    {k: [[b, e['id'], e['razon_social']] for b, e in v] for k, v in hits.items()}, ensure_ascii=False))
