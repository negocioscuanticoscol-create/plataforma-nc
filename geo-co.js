// Geografía Colombia para COBERTURA (6 zonas logísticas NC + población DANE aprox.)
// Jerarquía: Zona → Departamento (pob) → Ciudad (pob) → Localidad/Comuna
// Ciudades incluidas: las de > 160.000 hab aprox.
const BOG_LOC=["Usaquén","Chapinero","Santa Fe","San Cristóbal","Usme","Tunjuelito","Bosa","Kennedy","Fontibón","Engativá","Suba","Barrios Unidos","Teusaquillo","Los Mártires","Antonio Nariño","Puente Aranda","La Candelaria","Rafael Uribe Uribe","Ciudad Bolívar","Sumapaz"];
const MED_COM=["Popular","Santa Cruz","Manrique","Aranjuez","Castilla","Doce de Octubre","Robledo","Villa Hermosa","Buenos Aires","La Candelaria","Laureles-Estadio","La América","San Javier","El Poblado","Guayabal","Belén"];
const CALI_COM=Array.from({length:22},(_,i)=>"Comuna "+(i+1));
window.GEO_CO = { zonas: [
  { nombre:"Centro", hub:"Bogotá", deptos:[
    { nombre:"Bogotá D.C.", pob:7968000, ciudades:[{nombre:"Bogotá",pob:7968000,localidades:BOG_LOC}] },
    { nombre:"Cundinamarca", pob:3400000, ciudades:[{nombre:"Soacha",pob:830000}] },
    { nombre:"Santander", pob:2340000, ciudades:[{nombre:"Bucaramanga",pob:580000},{nombre:"Floridablanca",pob:270000},{nombre:"Barrancabermeja",pob:210000},{nombre:"Piedecuesta",pob:175000},{nombre:"Girón",pob:165000}] },
    { nombre:"Norte de Santander", pob:1650000, ciudades:[{nombre:"Cúcuta",pob:780000}] },
    { nombre:"Tolima", pob:1340000, ciudades:[{nombre:"Ibagué",pob:530000}] },
    { nombre:"Boyacá", pob:1240000, ciudades:[{nombre:"Tunja",pob:200000}] },
    { nombre:"Huila", pob:1120000, ciudades:[{nombre:"Neiva",pob:360000}] },
  ]},
  { nombre:"Antioquia-Eje", hub:"Medellín", deptos:[
    { nombre:"Antioquia", pob:6930000, ciudades:[{nombre:"Medellín",pob:2530000,localidades:MED_COM},{nombre:"Bello",pob:530000},{nombre:"Itagüí",pob:280000},{nombre:"Envigado",pob:240000},{nombre:"Apartadó",pob:190000},{nombre:"Turbo",pob:170000}] },
    { nombre:"Caldas", pob:1020000, ciudades:[{nombre:"Manizales",pob:435000}] },
    { nombre:"Risaralda", pob:970000, ciudades:[{nombre:"Pereira",pob:480000},{nombre:"Dosquebradas",pob:200000}] },
    { nombre:"Quindío", pob:555000, ciudades:[{nombre:"Armenia",pob:300000}] },
    { nombre:"Chocó", pob:545000, ciudades:[] },
  ]},
  { nombre:"Caribe", hub:"Barranquilla", deptos:[
    { nombre:"Atlántico", pob:2760000, ciudades:[{nombre:"Barranquilla",pob:1230000},{nombre:"Soledad",pob:670000}] },
    { nombre:"Bolívar", pob:2230000, ciudades:[{nombre:"Cartagena",pob:1030000},{nombre:"Magangué",pob:165000}] },
    { nombre:"Córdoba", pob:1860000, ciudades:[{nombre:"Montería",pob:510000}] },
    { nombre:"Magdalena", pob:1430000, ciudades:[{nombre:"Santa Marta",pob:510000}] },
    { nombre:"Cesar", pob:1300000, ciudades:[{nombre:"Valledupar",pob:500000}] },
    { nombre:"La Guajira", pob:990000, ciudades:[{nombre:"Riohacha",pob:290000},{nombre:"Maicao",pob:170000}] },
    { nombre:"Sucre", pob:960000, ciudades:[{nombre:"Sincelejo",pob:300000}] },
    { nombre:"San Andrés", pob:64000, ciudades:[] },
  ]},
  { nombre:"Occidente", hub:"Cali", deptos:[
    { nombre:"Valle del Cauca", pob:4620000, ciudades:[{nombre:"Cali",pob:2280000,localidades:CALI_COM},{nombre:"Palmira",pob:360000},{nombre:"Buenaventura",pob:340000},{nombre:"Tuluá",pob:230000}] },
    { nombre:"Nariño", pob:1640000, ciudades:[{nombre:"Pasto",pob:395000},{nombre:"Tumaco",pob:210000},{nombre:"Ipiales",pob:165000}] },
    { nombre:"Cauca", pob:1540000, ciudades:[{nombre:"Popayán",pob:320000}] },
  ]},
  { nombre:"Oriente", hub:"Villavicencio", deptos:[
    { nombre:"Meta", pob:1100000, ciudades:[{nombre:"Villavicencio",pob:560000}] },
    { nombre:"Casanare", pob:480000, ciudades:[{nombre:"Yopal",pob:180000}] },
    { nombre:"Arauca", pob:300000, ciudades:[] },
    { nombre:"Guaviare", pob:90000, ciudades:[] },
    { nombre:"Vichada", pob:120000, ciudades:[] },
  ]},
  { nombre:"Sur", hub:"Florencia", deptos:[
    { nombre:"Caquetá", pob:510000, ciudades:[{nombre:"Florencia",pob:170000}] },
    { nombre:"Putumayo", pob:360000, ciudades:[] },
    { nombre:"Amazonas", pob:80000, ciudades:[] },
    { nombre:"Guainía", pob:50000, ciudades:[] },
    { nombre:"Vaupés", pob:46000, ciudades:[] },
  ]},
]};
