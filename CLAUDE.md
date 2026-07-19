# plataforma-nc — Negocios Cuánticos

## Qué es esto
Plataforma madre de la agencia Negocios Cuánticos (Bogotá, Colombia).
NO es el proyecto de un solo cliente: aloja varios negocios que
comparten UNA sola base de datos Supabase.
Se publica por GitHub Pages. Interfaz y datos en español.

## Base de datos — LA ÚNICA
URL: https://fnayedgvamxktxfvywwl.supabase.co
Ref ID: fnayedgvamxktxfvywwl
Vive en la organización de Supabase llamada "FEROZ"
(el nombre de la organización NO corresponde a su contenido — ignorar el nombre).

REGLA: esta es la única base que usa este proyecto.
Existe otra base llamada "De Codabas a tu Casa" que está VACÍA y PAUSADA.
NUNCA apuntar código a esa otra base. NUNCA crear proyectos nuevos de Supabase.
Si algo no cuadra, PREGUNTAR antes de cambiar cualquier URL o llave.

Llave usada en el navegador: sb_publishable_... (clave pública, va en el cliente).
NO hay backups automáticos (plan Free). Cuidado extremo con DELETE y UPDATE masivos.

## Tablas existentes (12) — no inventar otras
clientes, cobertura_loc, config, cotizaciones, feroz_comisiones,
garantias, historial, inv_movimientos, inventario, pedidos,
pedidos_planta, perfiles

Aclaración importante:
- `cliente_id` = el COMPRADOR (persona/empresa que hace el pedido).
  NO identifica la marca ni el negocio.
- Hoy NO existe una columna que separe una marca de otra.
  `feroz_comisiones` es la única tabla con nombre de marca.
- Antes de escribir cualquier query, confirmar a qué negocio pertenece.

## Carpetas
- assets/          recursos compartidos
- catalogo/        catálogo
- cotizador-smart/ Smart Packaging Colombia
- fesfueling/      combustible de aviación
- kruh/            (por documentar)
- zarrat/          (por documentar)

## Archivos raíz
app.js (lógica principal), config.js (config Supabase),
index.html, centro.html, autopedido.html, barrido.html,
barrido_lista.html, marcador_empresas.html, pauta.html, geo-co.js

Nota: la URL y la llave de Supabase están repetidas a mano en cada
HTML, no centralizadas en config.js. Si alguna vez cambian, hay que
tocar TODOS los archivos.

## Cómo trabajar acá
- Un cambio a la vez, y explicarlo antes de hacerlo.
- Entregar archivos completos de reemplazo, no parches parciales.
- Español informal, directo.
- No crear archivos de notas, README ni TODOs por iniciativa propia.
- No tocar nada fuera de C:\NC\plataforma-nc