/* ═══════════════════════════════════════════════════════════════
   Lógica compartida entre la app pública y /actualizar.
   GENERADO POR build.py — no lo edites a mano: edita el HTML
   original y vuelve a ejecutar  python3 build.py
   ═══════════════════════════════════════════════════════════════ */

// Coordenadas aproximadas de tiendas conocidas (editables desde la tabla)
const CONOCIDAS=[
 ['LA COMER COYOACAN',19.3492,-99.1625],
 ['CITY MARKET PILARES',19.3689,-99.1663],
 ['CITY MARKET SAN JERONIMO',19.3252,-99.2115],
 ['CITY SAN JERONIMO',19.3252,-99.2115],
 ['FRESKO TECAMACHALCO',19.4162,-99.2270],
 ['LA COMER BOSQUE REAL',19.4046,-99.2843],
 ['LA COMER LOMAS ANAHUAC',19.4098,-99.2666],
 ['LA COMER MANZANILLO',19.1090,-104.3190],
 ['LA COMER INSURGENTES',19.3745,-99.1780],
 ['FRESKO VALLARTA',20.6739,-103.4370],
 ['LA COMER DEL VALLE',19.3868,-99.1717],
 ['LA COMER LAGO ALBERTO',19.4396,-99.1815],
 ['FRESKO CUMBRES',25.7198,-100.3789],
 ['LA COMER VILLA COAPA',19.2946,-99.1266],
 ['LA COMER OLIVAR',19.3457,-99.2237],
 ['LA COMER INSURGENTES',19.3745,-99.1780],
 ['FRESKO PABELLON',19.3980,-99.2610],
 ['FRESKO MITDOWN GDL',20.6997,-103.3740],
 ['FRESKO MIDTOWN GDL',20.6997,-103.3740],
 ['CITY PLAZA PATRIA GDL',20.7060,-103.3910],
 ['AMAZON ATLAMPA',19.4571,-99.1662],
 ['LA COMER PUEBLA (ANGELOPOLIS)',19.0300,-98.2340],
 ['LA COMER PUEBLA ANGELOPOLIS',19.0300,-98.2340],
 ['LIVERPOOL ANDARES GUADALAJARA',20.7086,-103.4118],
 ['LIVERPOOL CENTRO DE GUADALAJARA',20.6767,-103.3475],
 // ── Sucursales agregadas del directorio (coordenadas aproximadas, ajustables con "Corregir") ──
 ['LA COMER TLALPAN',19.2892,-99.1679],
 ['LA COMER LOS CABOS',23.0545,-109.7010],
 ['LA COMER CABO SAN LUCAS',22.8983,-109.9180],
 ['LA COMER SAN MIGUEL DE ALLENDE',20.9066,-100.7460],
 ['LA COMER PUEBLA',19.0300,-98.2340],
 ['LA COMER SANTA MARIA LA RIBERA',19.4419,-99.1558],
 ['LA COMER GUADALUPE INN',19.3564,-99.1873],
 ['FRESKO JESUS DEL MONTE',19.3745,-99.2865],
 ['FRESKO JESUS MONTE',19.3745,-99.2865],
 ['FRESKO LA RIOJA',19.2989,-99.1252],
 ['FRESKO BUGAMBILIA',20.6070,-103.4160],
 ['FRESKO BUGAMBILIAS',20.6070,-103.4160],
 ['FRESKO PALMILLA',23.0100,-109.7150],
 ['FRESKO PABELLON BOSQUES',19.3965,-99.2620],
 ['FRESKO MIDTOWN',20.6997,-103.3740],
 ['CITY MARKET LOMAS',19.4300,-99.2070],
 ['CITY MARKET SANTA FE',19.3660,-99.2740],
 ['CITY MARKET PLAZA CARSO',19.4400,-99.2035],
 ['CITY MARKET PATRIA',20.7060,-103.3910],
];
const ESQUEMAS=['Alta','Baja','Fijo $700','Extra $600','Swat $800','OnDemand','PxP','No aplica'];

function norm(s){return (s||'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();}
function coordConocida(nombre){
  const n=norm(nombre);
  let best=null,bestLen=0;
  for(const [k,la,lo] of CONOCIDAS){
    const nk=norm(k);
    if(n===nk) return [la,lo];
    if((n.includes(nk)||nk.includes(n)) && nk.length>bestLen){best=[la,lo];bestLen=nk.length;}
  }
  if(best) return best;
  // coincidencia por palabras clave (ej. "COYOACAN" + "COMER")
  for(const [k,la,lo] of CONOCIDAS){
    const palabras=norm(k).split(' ').filter(w=>w.length>3);
    if(palabras.length&&palabras.every(w=>n.includes(w))) return [la,lo];
  }
  return null;
}
function normEsquema(e){
  const n=norm(e);
  if(!n) return '';
  if(n.startsWith('ALTA')) return 'Alta';
  if(n.startsWith('BAJA')) return 'Baja';
  if(n.includes('SWAT')) return 'Swat $800';
  if(n.includes('EXTRA')) return 'Extra $600';
  if(n.includes('FIJO')||n.includes('SUMESA')||n.includes('700')) return 'Fijo $700';
  if(n.includes('DEMAND')) return 'OnDemand';
  if(n.includes('PXP')||n.includes('P X P')||n.includes('PAQUETE')) return 'PxP';
  if(n.includes('NO APLICA')) return 'No aplica';
  return e;
}
function esquemaDefault(nombre){
  const n=norm(nombre);
  if(n.includes('AMAZON')||n.includes('LIVERPOOL')) return 'No aplica';
  return 'Alta';
}
const LUGARES=[
 // ── Alcaldías CDMX ──
 ['ALVARO OBREGON, CDMX',19.3587,-99.2036],['AZCAPOTZALCO, CDMX',19.4869,-99.1866],
 ['BENITO JUAREZ, CDMX',19.3819,-99.1671],['COYOACAN, CDMX',19.3467,-99.1617],
 ['CUAJIMALPA, CDMX',19.3573,-99.2917],['CUAUHTEMOC, CDMX',19.4326,-99.1531],
 ['GUSTAVO A MADERO, CDMX',19.4933,-99.1183],['IZTACALCO, CDMX',19.3953,-99.0973],
 ['IZTAPALAPA, CDMX',19.3574,-99.0671],['MAGDALENA CONTRERAS, CDMX',19.3120,-99.2419],
 ['MIGUEL HIDALGO, CDMX',19.4340,-99.2007],['MILPA ALTA, CDMX',19.1924,-99.0231],
 ['TLAHUAC, CDMX',19.2869,-99.0046],['TLALPAN, CDMX',19.2879,-99.1679],
 ['VENUSTIANO CARRANZA, CDMX',19.4283,-99.0977],['XOCHIMILCO, CDMX',19.2543,-99.1035],
 // ── Municipios Edomex ──
 ['NAUCALPAN, EDOMEX',19.4785,-99.2396],['HUIXQUILUCAN, EDOMEX',19.3611,-99.3508],
 ['TLALNEPANTLA, EDOMEX',19.5398,-99.1954],['ECATEPEC, EDOMEX',19.6097,-99.0600],
 ['NEZAHUALCOYOTL, EDOMEX',19.4006,-99.0148],['ATIZAPAN, EDOMEX',19.5560,-99.2647],
 ['CUAUTITLAN IZCALLI, EDOMEX',19.6467,-99.2126],['COACALCO, EDOMEX',19.6333,-99.0931],
 ['CHIMALHUACAN, EDOMEX',19.4216,-98.9536],['IXTAPALUCA, EDOMEX',19.3184,-98.8823],
 ['CHALCO, EDOMEX',19.2647,-98.8977],['VALLE DE CHALCO, EDOMEX',19.2937,-98.9448],
 ['TULTITLAN, EDOMEX',19.6450,-99.1690],['TECAMAC, EDOMEX',19.7128,-98.9686],
 ['LA PAZ, EDOMEX',19.3596,-98.9861],['NICOLAS ROMERO, EDOMEX',19.6217,-99.3131],
 ['TOLUCA, EDOMEX',19.2926,-99.6568],['METEPEC, EDOMEX',19.2528,-99.6067],
 // ── Colonias / zonas CDMX ──
 ['POLANCO',19.4326,-99.1934],['CONDESA',19.4122,-99.1735],['ROMA NORTE',19.4180,-99.1626],
 ['ROMA SUR',19.4066,-99.1616],['DEL VALLE',19.3856,-99.1667],['NARVARTE',19.3963,-99.1517],
 ['NAPOLES',19.3931,-99.1758],['SANTA FE',19.3597,-99.2740],['SAN ANGEL',19.3454,-99.1898],
 ['PEDREGAL',19.3143,-99.2043],['COAPA',19.2965,-99.1258],['VILLA COAPA',19.2946,-99.1266],
 ['TEPEPAN',19.2696,-99.1275],['CENTRO HISTORICO',19.4326,-99.1332],['DOCTORES',19.4204,-99.1441],
 ['LINDAVISTA',19.4884,-99.1290],['ARAGON',19.4667,-99.0770],['TACUBAYA',19.4023,-99.1874],
 ['TACUBA',19.4592,-99.1875],['OBSERVATORIO',19.3984,-99.2004],['MIXCOAC',19.3757,-99.1874],
 ['PORTALES',19.3714,-99.1500],['CULHUACAN',19.3312,-99.1092],['TAXQUEÑA',19.3437,-99.1409],
 ['UNIVERSIDAD, CU',19.3322,-99.1870],['SAN JERONIMO',19.3252,-99.2115],
 ['TECAMACHALCO',19.4162,-99.2270],['INTERLOMAS',19.3939,-99.2812],['SATELITE',19.5092,-99.2337],
 ['LOMAS DE CHAPULTEPEC',19.4260,-99.2098],['LOMAS VERDES',19.4972,-99.2555],
 ['BOSQUES DE LAS LOMAS',19.3965,-99.2620],['XICO',19.2699,-98.9364],
 ['IZTAPALAPA CENTRO',19.3556,-99.0910],['SANTA MARTHA ACATITLA',19.3672,-99.0116],
 ['PANTITLAN',19.4157,-99.0721],['AGRICOLA ORIENTAL',19.3968,-99.0754],
 ['TEPITO',19.4436,-99.1276],['ATLAMPA',19.4571,-99.1662],['VALLEJO',19.4855,-99.1553],
 ['AZCAPOTZALCO CENTRO',19.4838,-99.1844],['CLAVERIA',19.4653,-99.1786],
 // ── Guadalajara metro ──
 ['GUADALAJARA, JAL',20.6767,-103.3475],['ZAPOPAN, JAL',20.7214,-103.3918],
 ['TLAQUEPAQUE, JAL',20.6409,-103.2938],['TONALA, JAL',20.6244,-103.2333],
 ['TLAJOMULCO, JAL',20.4736,-103.4430],['ANDARES, ZAPOPAN',20.7086,-103.4118],
 ['PROVIDENCIA, GDL',20.7009,-103.3780],['CHAPALITA, GDL',20.6660,-103.4045],
 // ── Puebla / otros ──
 ['PUEBLA, PUE',19.0414,-98.2063],['ANGELOPOLIS, PUEBLA',19.0300,-98.2340],
 ['CHOLULA, PUE',19.0633,-98.3064],['MANZANILLO, COL',19.1138,-104.3430],
 ['CUERNAVACA, MOR',18.9242,-99.2216],['QUERETARO, QRO',20.5888,-100.3899],
];
function buscarLocal(q){
  const n=norm(q).replace(/^(ALCALDIA|MUNICIPIO|DELEGACION|COL|COLONIA)\s+/,'');
  if(!n) return null;
  let best=null,bestScore=0;
  for(const [nombre,la,lo] of LUGARES){
    const nn=norm(nombre);
    let s=0;
    if(nn===n) s=100;
    else if(nn.startsWith(n)||n.startsWith(nn.split(',')[0])) s=80;
    else if(nn.includes(n)) s=60;
    else{
      const palabras=n.split(' ').filter(w=>w.length>2);
      if(palabras.length&&palabras.every(w=>nn.includes(w))) s=50+palabras.length;
    }
    if(s>bestScore){bestScore=s;best={nombre,lat:la,lng:lo};}
  }
  return bestScore>=50?best:null;
}

/* Ciudades que el Reporte de urgencias nombra en la columna "Ubicación"
   y que no venían en la tabla de arriba. Así no hace falta consultar un
   servicio externo para ubicarlas. */
LUGARES.push(
 ['CIUDAD DE MEXICO',19.4326,-99.1332],
 ['MONTERREY, NL',25.6866,-100.3161],
 ['CHIHUAHUA, CHIH',28.6353,-106.0889],
 ['SALTILLO, COAH',25.4232,-101.0053],
 ['TAMPICO, TAMPS',22.2331,-97.8611],
 ['IRAPUATO, GTO',20.6767,-101.3563],
 ['LEON, GTO',21.1219,-101.6833],
 ['MERIDA, YUC',20.9674,-89.5926],
 ['VERACRUZ, VER',19.1738,-96.1342],
 ['CANCUN, QROO',21.1619,-86.8515],
 ['TOLUCA, MEX',19.2926,-99.6568],
 ['AGUASCALIENTES, AGS',21.8853,-102.2916],
 ['SAN LUIS POTOSI, SLP',22.1565,-100.9855],
 ['MORELIA, MICH',19.7060,-101.1950],
 ['VILLAHERMOSA, TAB',17.9895,-92.9475],
 ['TIJUANA, BC',32.5149,-117.0382]
);
const UBICACION_CIUDAD={'ZONA METROPOLITANA':'Ciudad de México','GUADALAJARA':'Guadalajara, Jalisco','QUERETARO':'Querétaro, Querétaro','PUEBLA':'Puebla, Puebla','MONTERREY':'Monterrey, Nuevo León','COAHUILA':'Saltillo, Coahuila','TAMAULIPAS':'Tampico, Tamaulipas','CHIHUAHUA':'Chihuahua, Chihuahua','COLIMA':'Manzanillo, Colima','CDMX':'Ciudad de México','EDOMEX':'Estado de México'};
function nombreDesdeReporte(nombre,cliente){
  let n=nombre.replace(/^\d+\s*-\s*/,'').trim();          // quitar prefijo numérico "112 - "
  n=n.replace(/^L\.\s*/i,'LIVERPOOL ');                    // "L. ZAPOPAN" → "LIVERPOOL ZAPOPAN"
  const nn=norm(n), c=norm(cliente||'');
  if(c.includes('CEDIS')&&!nn.includes('CEDIS')) n='CEDIS '+n;
  else if(c.includes('LIVERPOOL')&&!nn.includes('LIVERPOOL')&&!nn.includes('CEDIS')) n='LIVERPOOL '+n;
  // expandir abreviaturas de CEDIS
  n=n.replace(/\bCHH\b/i,'CHIHUAHUA').replace(/\bQRO\b/i,'QUERETARO');
  return n.toUpperCase();
}
function esquemaDesdeReporte(nombre,cliente){
  const n=norm(nombre), c=norm(cliente||'');
  if(c.includes('AMAZON')||n.includes('AMAZON')) return 'No aplica';
  if(c.includes('LIVERPOOL')||n.includes('LIVERPOOL')||n.includes('CEDIS')) return 'No aplica';
  if(n.includes('EXTRAS')) return 'Extra $600';
  // La Comer: fijos y bajas conocidas, el resto Alta
  if(n.includes('SUMESA OAXACA')||n.includes('SANTA MARIA')||n.includes('STA MARIA')) return 'Baja';
  if(n.includes('SUMESA')||n.includes('IZTAPALAPA')||n.includes('MANZANILLO')||n.includes('FRESKO CUMBRES')||n.includes('LAS TORRES')) return 'Fijo $700';
  return 'Alta';
}
function urgDesdePrioridad(v,esReporte){
  const p=norm(v);
  if(p.startsWith('URGENTE')||p.startsWith('ALTA')) return 'Alta';
  if(p.startsWith('MEDIA')) return 'Media';
  if(p.startsWith('BAJA')) return 'Baja';
  return esReporte?'Baja':'Media'; // en el reporte, sin prioridad = sin urgencia
}

/* ── Lee el Excel del día y devuelve la lista de tiendas ──────── */
function parsearExcel(buffer){
  let _id=1;
  const wb=XLSX.read(new Uint8Array(buffer),{type:'array'});
      const ws=wb.Sheets[wb.SheetNames[0]];
      // Leemos como matriz para encontrar la fila de encabezados (puede no ser la primera)
      const matriz=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
      const iHead=matriz.findIndex(fila=>fila.some(c=>norm(c).startsWith('VACANTE')||norm(c).startsWith('SUCURSAL')||norm(c).startsWith('TIENDA')));
      if(iHead<0) throw new Error('sin encabezados');
      const heads=matriz[iHead].map(h=>norm(h));
      const col=(...claves)=>heads.findIndex(h=>claves.some(k=>h.includes(k)));
      const iSuc=col('SUCURSAL','TIENDA','NOMBRE');
      const iVac=col('VACANTE'), iUrg=col('URGENCIA','PRIORIDAD'), iEsq=col('ESQUEMA');
      const iCad=col('CADENA'), iCli=col('CLIENTE'), iEst=col('ESTATUS');
      const iUbic=col('UBICACION');
      const iDir=col('DIRECCION'), iMun=col('ALCALDIA','MUNICIPIO');
      const iEdo=col('ESTADO'), iCP=col('CODIGO POSTAL','C.P','CP');
      const iLat=col('LATITUD'), iLng=col('LONGITUD');
      // ¿Es el formato "Reporte de urgencias"? (tiene PRIORIDAD y CLIENTE)
      const esReporte = iUrg>=0 && heads[iUrg].includes('PRIORIDAD') && iCli>=0;
      const vistas=new Map();
      let omitidasInactivas=0;
      for(let i=iHead+1;i<matriz.length;i++){
        const r=matriz[i];
        if(!r||!r.some(c=>(c??'').toString().trim())) continue;
        const cel=idx=>idx>=0?(r[idx]??'').toString().trim():'';
        // Filtrar tiendas inactivas/cerradas del reporte
        const est=norm(cel(iEst));
        if(est&&(est.includes('INACTIV')||est.includes('CERRAD'))){ omitidasInactivas++; continue; }
        const cadena=cel(iCad), cliente=cel(iCli);
        const dirCompleta=cel(iDir);
        // Nombre: columna Sucursal si existe; si no, Cadena + colonia (último tramo de la dirección)
        let nombre=cel(iSuc);
        if(!nombre){
          const colonia=dirCompleta.includes(',')?dirCompleta.split(',').pop().trim().replace(/^COL\.?\s*/i,''):cel(iMun);
          nombre=((cadena||'Tienda')+' '+(colonia||cel(iMun))).toUpperCase().trim();
        }
        if(!nombre) continue;
        if(esReporte) nombre=nombreDesdeReporte(nombre,cliente);
        const vac=parseInt(cel(iVac))||0;
        const urg=urgDesdePrioridad(cel(iUrg),esReporte);
        let esq=normEsquema(cel(iEsq));
        if(!ESQUEMAS.includes(esq)) esq=esReporte?esquemaDesdeReporte(nombre,cliente):esquemaDefault(nombre);
        // Dirección para mostrar/geocodificar
        const ciudadUbic=UBICACION_CIUDAD[norm(cel(iUbic))]||cel(iUbic);
        const direccion=[dirCompleta,cel(iMun),cel(iEdo),cel(iCP)].filter(Boolean).join(', ')||ciudadUbic;
        const la=parseFloat(cel(iLat)), lo=parseFloat(cel(iLng));
        const key=norm(nombre+'|'+dirCompleta);
        if(vistas.has(key)){ // misma tienda repetida: conservar mayor vacantes y la urgencia más alta
          const p=vistas.get(key);
          p.vacantes=Math.max(p.vacantes,vac);
          const rango={Alta:3,Media:2,Baja:1};
          if((rango[urg]||0)>(rango[p.urgencia]||0)) p.urgencia=urg;
        }else{
          const c=(isFinite(la)&&isFinite(lo))?[la,lo]:coordConocida(nombre);
          vistas.set(key,{id:_id++,nombre,vacantes:vac,urgencia:urg,esquema:esq,direccion,lat:c?c[0]:null,lng:c?c[1]:null});
        }
      }
      if(!vistas.size) throw new Error('sin filas');
  return {tiendas:[...vistas.values()], esReporte, omitidasInactivas};
}

/* ── Busca coordenadas de las tiendas que quedaron sin ubicar ─── */
async function ubicarPendientes(tiendas, avisar){
  const pend=tiendas.filter(t=>t.lat==null&&(t.direccion||'').trim());
  let hechas=0, ok=0;
  for(const t of pend){
    hechas++;
    if(avisar) avisar(hechas, pend.length, t.nombre);
    let r=buscarLocal(t.direccion)||buscarLocal(t.direccion.split(',').slice(-3).join(' '));
    if(!r){
      try{
        const q=encodeURIComponent(t.direccion+', México');
        const resp=await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=mx&q='+q);
        const d=await resp.json();
        if(d&&d.length) r={lat:+d[0].lat,lng:+d[0].lon};
        await new Promise(s=>setTimeout(s,1100)); // límite de uso de Nominatim
      }catch(e){}
    }
    if(r){
      t.lat=+r.lat.toFixed(5); t.lng=+r.lng.toFixed(5); ok++;
      // Sin número en la dirección = solo tenemos la ciudad, no la calle:
      // la tienda queda en el centro de su ciudad, no en su ubicación exacta.
      if(!/\d/.test(t.direccion)) t.aprox=true;
    }
  }
  return {
    intentadas:pend.length, ubicadas:ok,
    aproximadas:tiendas.filter(t=>t.aprox).length,
    sinUbicar:tiendas.filter(t=>t.lat==null).length
  };
}
