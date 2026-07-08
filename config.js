// Conexión a Supabase (Plataforma Feroz)
// La publishable key es segura para el navegador: la seguridad la pone el RLS.
window.FEROZ_CONFIG = {
  SUPABASE_URL: 'https://fnayedgvamxktxfvywwl.supabase.co',
  SUPABASE_KEY: 'sb_publishable_NVTYNkJ0V6obLwgwjXza1g_3Ihp-xMv',
  PRECIO_PAR: 40900,
  MUESTRA_PAR: 40900,
  MUESTRA_FLETE: 22000,        // transporte de muestra par
  MUESTRA_FLETE_PARES: 3,      // ... por cada cuántos pares
  PARES_CAJA: 16,
  IVA: 0.19,
  MIN_CAJAS_SIN_FLETE: 10,
  TALLAS: [34,35,36,37,38,39,40,41,42,43,44,45],
  BODEGAS: ['Bodega Superior','Bodega Feroz Bogotá','Feroz Oficina'],
  CUENTA: 'Bancolombia Ahorros 5970-000825-3 · INDUSTRIAS FEROZ SAS · NIT 902072014'
};
