# Protocolo · Perfil de data para distribuidores de calzado (Lupe · CED)

*Auditoría del 23 de septiembre de 2026 sobre la base **Calzado · Distribuidores**:
6.369 registros, 2.142 llamadas reales, 3.283 por llamar. Todo número de este
documento sale de la vista `mkr_llamada_ced` y de la función `mkr_analisis_dist(dimensión)`
en Supabase; se pueden volver a correr cualquier día. Donde una conclusión tiene
menos de 30 llamadas se marca **HIPÓTESIS**.*

**Definiciones.** *Contestó* = Interesado, No interesado, Dato negativo o Competencia.
*Acierto* = interesados / contestó. *Basura* = Dato negativo / contestó (la empresa no
es del negocio). *Teléfono malo* = No contesta + Equivocado / llamadas.
*Meta:* 30% de interesados sobre llamadas. *Hoy:* 11,9% sobre llamadas, 20,4% sobre contestó.

---

## 1 · Hallazgos de la auditoría

### 1.1 Qué campos hay y cómo están
| Campo | Llenado | Diagnóstico |
|---|---|---|
| razón social, teléfono a marcar, municipio, departamento, sector, estado, prioridad | 100% | bien |
| sector | 100% | solo 3 valores (ferretería/agro, calzado, dotación): es el sector del **barrido**, no del negocio; "calzado" mezcla distribuidor con zapatería |
| celular / teléfono (columnas aparte) | 57% / 10% | el número real vive en `tel_marcar` |
| **tamaño de empresa** | **0%** | el cruce por tamaño de empresa **no se puede hacer**; se usó tamaño de **municipio** (población) |
| NIT, CIIU, correo, web, `maps_id`, `busqueda_id` | **0%** | sin identidad legal, sin actividad, sin rastro estructurado de qué búsqueda trajo cada fila (solo texto en `notas`) |
| departamento / municipio | 100% | 35 formas de escribir 32 departamentos; mayúsculas mezcladas |
| dirección / coordenadas | 67% | **fuera del análisis por decisión de José** (23-sep) |

**Lo que captura la llamada, sobre 254 interesados:** nombre de contacto **141 (55%)** →
113 interesados sin con quién hablar en el paso 2; WhatsApp distinto del marcado 168 →
**86 sin WhatsApp**; otro celular 1; correo 1; estado de venta más allá de "nuevo" 6;
**respondió el paso 2: 0** (la columna `respondio` se creó el 23-sep; nunca existió).

### 1.2 Porcentaje de cada resultado
**Total (2.142):** Dato negativo **34,0%** · No contesta **30,0%** · Interesado **11,9%** ·
No interesado 11,6% · Equivocado 10,9% · Competencia 0,7% · No contactar 0,7%.

| Por sector | Llamadas | Tel. malo | Basura | Acierto | Int./100 llam. |
|---|---:|---:|---:|---:|---:|
| calzado | 1.364 | 32% | **66%** | 18% | 12,2 |
| dotación | 398 | 54% | 62% | 13% | 6,0 |
| ferretería/agro | 380 | **61%** | 7% | 43% | 16,6 |

| Por tamaño de municipio | Llamadas | Basura | Acierto |
|---|---:|---:|---:|
| **pueblo < 100 mil** | 615 | **17%** | **40%** |
| intermedia 100–300 mil | 879 | 72% | 15% |
| capital 300 mil – 1 M | 565 | 68% | 14% |
| ≥ 1 M | 19 | 33% | 33% **HIPÓTESIS** |

| Por tipo de teléfono | Llamadas | Tel. malo | Acierto |
|---|---:|---:|---:|
| celular | 2.060 | 40% | 21% |
| **fijo** | 82 | 60% | **0%** |

| Por fuente | Llamadas | Tel. malo | Basura | Acierto |
|---|---:|---:|---:|---:|
| carga anterior | 1.364 | 32% | 66% | 18% |
| barrido Google Maps por zonas | 778 | **57%** | 37% | 27% |

**Por departamento (≥30 llamadas):** Boyacá **36%** · Huila 32% · Risaralda 30% · Casanare 29% ·
Caldas 26% · Santander 25% · Nariño 20% · Antioquia 17% · Cundinamarca 16% · Valle **10%** ·
Norte de Santander 8% · Cesar 8% · La Guajira **3%**.

**Por ciudad (≥30):** Pereira 31% · Manizales 26% · Yopal 22% · Tunja 21% · Tuluá 19% ·
Rionegro 18% · Buga 17% · Itagüí 15% · Floridablanca 14% · Madrid 12% · Pasto 11% ·
Apartadó 10% · Soledad 10% · Zipaquirá 7% · Palmira 7% · Bello 6% · Valledupar 6% · Chía 5% ·
Facatativá 5% · Riohacha 4% · Girardot 3% · Buenaventura 3% · **Villa del Rosario 0% · Envigado 0%**.

**Por palabra con que Google trajo el dato (≥20):** insumos agropecuarios 48% (41) · ferretería 45% (317) ·
dotaciones 33% (60) · distribuidora de calzado 18% (178) · calzado de seguridad 14% (32) ·
**seguridad industrial 8% con 76% basura (116)**.

### 1.3 Data basura y lo que cuesta
- **75% de las llamadas se pierden antes del discurso:** 876 a teléfono malo + 728 a empresa que
  no es del negocio = **1.604 de 2.142**, por las que se pagó tarifa (**≈ $197.000**) sin posibilidad de venta.
- **Fijos por llamar: 536 de 3.283 (16%)**, 355 en dotación y 184 en ferretería/agro. Acierto histórico 0%.
- **Duplicados:** 1 fila entre lo que queda; 6 números ya llamados marcados otra vez; 3 inválidos. Limpio.
- **Empresas cerradas: no se puede calcular.** Ningún campo ni resultado lo captura ("Equivocado" mezcla
  número cambiado con negocio cerrado). Señal indirecta: el barrido de Maps da **2,4 veces más "Equivocado"**
  (166 vs 68) y más "No contesta" (36% vs 27%) que la carga anterior.
- **Interesados a ciegas:** 113 de 254 sin nombre de contacto; 86 sin WhatsApp.

---

## 2 · Perfil de data que sí sirve (solo con los números)

### 2.1 La palabra dentro del NOMBRE es la señal más fuerte (≥15 contestadas)
| Palabra en el nombre | Contestó | Interesados | Basura | Acierto | en pueblo | en ciudad |
|---|---:|---:|---:|---:|---:|---:|
| **dotaciones / dotación** | 92 | 70 | 4 | **76%** | 85% | 76% |
| **seguridad industrial** (la frase) | 21 | 14 | 4 | **67%** | 71% | — **HIPÓTESIS** |
| ferretería | 76 | 39 | 10 | 51% | **60%** | **15%** |
| industriales / industrial | 95 | 40 | 37 | 42% | 64% | 37% |
| suministros | 30 | 13 | 14 | 43% | 71% | 35% |
| seguridad (sola) | 58 | 20 | 30 | 34% | 62% | 27% |
| calzado (sin "dotación") | 84 | 19 | 39 | 23% | 47% | 18% |
| uniformes | 59 | 13 | 34 | 22% | 29% | 20% |
| distribuidora / comercializadora | 50 | 10 | 27 | 20% | 43–75% | 13% |

**Perfil ideal, en orden:**
1. **Nombre con "dotación/dotaciones"** en cualquier tamaño de ciudad, con **celular**: 76% de acierto, 4% basura. Es el negocio.
2. **Nombre con "seguridad industrial", "suministros industriales", "industrial(es)"** en **pueblo o intermedia** con celular: 42–67%.
3. **Nombre con "ferretería" en municipio < 100 mil** con celular: 60% en la llamada — **pero 0 de 40 respondieron el paso 2 del 23-sep**. Sirve solo si el paso 2 lo confirma (regla 3.3).
4. Ciudades que sí: Pereira, Manizales, Yopal, Tunja y los corredores de Boyacá, Huila, Casanare, Risaralda, Caldas.

**HIPÓTESIS con 10–14 contestadas que valen probar:** "empresariales" 54%, "agropecuaria" 55%, "eléctricos" 45% (solo cuando también dice ferretería).

### 2.2 Anti-perfil (dejar de cargar)
| Qué | Evidencia |
|---|---|
| **Teléfono fijo** | 82 llamadas, **0 interesados**, 60% no contesta/equivocado |
| **Nombre con "calzado" sin "dotación" en municipio > 100 mil** | 66% basura (zapaterías de moda); acierto 14–17% con 1.175 llamadas |
| Nombre con **sport, mangueras, estampados, ingeniería, servicios** | 0–7% de acierto, ≥10 llamadas cada una |
| **Extintores, confecciones, bordados, soluciones** solas | 13–19%; en ciudad 7–16% |
| **Palabra de búsqueda "seguridad industrial" en Google** | trae grandes empresas e ingenierías: 8% acierto, 76% basura (116). El nombre que la contiene sí sirve; la búsqueda no. |
| **Dotación en ciudad intermedia (100–300 mil)** | 8% acierto, 76% basura (256) |
| Ciudades: Villa del Rosario, Envigado (0%), Buenaventura, Girardot, Riohacha, Facatativá, Chía, Valledupar, Bello (≤6%) | 30–49 llamadas cada una, 74–93% basura |
| Departamentos: La Guajira 3%, Cesar 8%, Norte de Santander 8%, Valle 10% | ≥50 llamadas cada uno |
| Rubros sin relación (ya filtrados): vidrierías, remontadoras, eléctricos puros, pinturas, cerámicas, cerrajerías, agroinsumos/semillas/veterinarias, materiales de construcción, repuestos/motos/llantas | salieron como Dato negativo / No interesado el 22–23 sep |

---

## 3 · Criterio táctico

### 3.1 Campos NUEVOS a capturar en cada llamada
| Campo | Por qué | Cuándo |
|---|---|---|
| **Nombre de contacto obligatorio** para marcar Interesado | 45% de los interesados no lo tienen: el paso 2 sale sin destinatario | en el formulario del interesado |
| **Cargo** (dueño / administrador / vendedor) | el "sí" del vendedor no compra | interesado |
| **A quién le compra hoy** (marca o proveedor) | distingue distribuidor real de tienda; alimenta la base de competencia | interesado |
| **Pares al mes** (rango: <20 / 20–100 / >100) | es el único tamaño de empresa que se puede capturar; hoy `tamano` está en 0% | interesado |
| **Tipo de negocio confirmado** (distribuidor / ferretería / almacén / fábrica / usuario final) | el sector del barrido no es el del negocio | toda llamada contestada |
| **Motivo del "No interesado"** (ya tiene proveedor / no vende bota / precio / no le interesa) | hoy "no" y "basura" no se distinguen; el motivo dice si la palabra falló o el discurso | No interesado |
| **Respondió el paso 2** (`respondio`, creada 23-sep) | es la única medida real; el acierto de la llamada mintió el 23-sep (43% y 0 respuestas) | lo marca quien manda el WhatsApp |
| **Motivo de "Equivocado"** (número de otra empresa / cerrado / no existe) | permite calcular empresas cerradas, que hoy no se puede | Equivocado |

### 3.2 Criterios para el módulo de minería (antes de cargar al marcador)
**Buscar en Google Maps, en este orden y con estas palabras:**
1. `dotaciones` · `dotaciones y seguridad industrial` · `elementos de protección personal` · `suministros industriales` (nueva) — en todo tamaño de ciudad.
2. `distribuidora de calzado` — **solo en municipios < 100 mil** (47% en pueblo, 18% en ciudad).
3. `ferretería` · `insumos agropecuarios` — **solo en municipios < 100 mil y solo si el paso 2 de ferreterías llega a ≥10% de respuesta**; si no, se apagan.
4. **No buscar** `seguridad industrial` como frase de búsqueda (8%); **no buscar** `calzado de seguridad` (14%, trae centros comerciales).

**Filtrar ANTES de cargar (no entra a Lupe si…):**
- el teléfono no es celular (`3xx`, 10 dígitos). Fijo = fuera. Formato E.164 único (`+57…`).
- el nombre contiene: sport, tenis, moda, ropa, boutique, jeans, shoes, fashion, kids, infantil, óptica, gafas, estampados, bordados, sublimación, serigrafía, mangueras, ingeniería, electricista, redes eléctricas, electrónica, iluminación, vidrio, cristalería, vitral, espejos, marquetería, remontadora, reparación de calzado, zapatero, pinturas, cerámica, cerrajería, incubación, avícola, química, seguridad electrónica, sandalias, cacharrería, semillas, fertilizantes, veterinaria, mascotas, bloques, ladrillo, cemento, maderas, tejas, drywall, tubería, plomería, repuestos, motos, llantas, lubricantes, peluquería, restaurante, panadería, droguería, farmacia, papelería, centro comercial, universidad, refinería, alcaldía, colegio, clínica, hospital, médico.
- **salvo** que también diga: dotación, seguridad industrial, EPP, protección personal, calzado de seguridad, calzado industrial, almacén, comercializadora, suministros, distribuidora, ferretería/ferre/ferro-eléctricos, agroveterinaria, depósito.
- el municipio está en la lista quemada (§2.2) con la misma palabra.
- el teléfono ya existe en Lupe (cualquier base, tres columnas, últimos 10 dígitos).
- la palabra ya se buscó en esa ciudad (`mkr_busqueda`).
- **cada fila guarda la palabra que la trajo** (`sector` = palabra de búsqueda, y `notas`) para poder medirla.

**Cuánto probar antes de regar:** una palabra o ciudad nueva sale en máximo 3 ciudades y no se juzga con menos de 20 llamadas; se declara buena con ≥25% de acierto **y ≥10% de respuesta al paso 2**; se apaga con <15% o si ≥20% de lo que trae es competencia.

### 3.3 Tres cambios, por impacto en la tasa de interesados
1. **Cargar solo por "dotación / seguridad industrial / suministros industriales" con celular, y sacar el fijo y el "calzado" de ciudad.** Impacto: esas palabras dan 42–76% de acierto contra 20% de la base; solo el "calzado" de ciudad son 1.175 llamadas al 14–17% con 66% basura. Aplicado en parte el 22–23 sep (2.254 apartados, 604 descartados); falta que el barrido cargue "dotación" en Bogotá y Medellín por localidades, que están sin probar (19 llamadas).
2. **Medir el paso 2, no la llamada.** Marca "respondió" en la lista de interesados (columna ya creada; falta el botón en Lupe) y cada sector se juzga por % de respuesta. Impacto: evita repetir el 23-sep (50 interesados, $125.000 pagados, 0 respuestas) y decide con datos si ferretería de pueblo sigue o sale.
3. **Contacto y tipo de negocio obligatorios al marcar Interesado** (+ cargo, a quién compra, pares/mes). Impacto: hoy 45% de los interesados no tienen nombre y el 100% no tiene tamaño; con eso el paso 2 tiene destinatario y por fin existe un tamaño de empresa para cruzar.

---

## 4 · Cómo se repite este análisis
- `select * from mkr_analisis_dist('sector')` — también `'palabra'`, `'tamano'`, `'tipo_tel'`, `'agente'`, `'dia'`, `'lead_ciudad'`, `'fuente'`, `'hora'`; acepta `desde` y `hasta`.
- `select * from mkr_basura_candidatos` — palabras frecuentes en Dato negativo que aún no están en el filtro.
- `select * from mkr_inventario_ced` — lo que queda por llamar por base, sector y tamaño.
- Palabras del nombre: consulta en `_PLAYBOOK/17-protocolo-busqueda.md` (R7).
- Lo que **no** se puede calcular con la data de hoy: tamaño de empresa, empresas cerradas, respuesta al paso 2 anterior al 23-sep.
