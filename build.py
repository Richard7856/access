#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Genera la carpeta web/ que se sube a Vercel, a partir del HTML original
que produce Claude (despacho_choferes_con_cierre_6.html) y de src/.

    python3 build.py

Si algún día vuelves a exportar el HTML desde Claude, reemplaza el archivo
original y vuelve a ejecutar esto. Si el HTML cambió tanto que ya no
encuentro alguna parte, el script se detiene y te dice cuál, en lugar de
generar algo roto.
"""
import json
import re
import shutil
import sys
from pathlib import Path

RAIZ = Path(__file__).parent
ORIGEN = RAIZ / "despacho_choferes_con_cierre_6.html"
SRC = RAIZ / "src"
WEB = RAIZ / "web"

# Las infografías y los videos ya no viajan dentro del HTML: viven en el
# bucket público de Supabase (ver recursos/ y el README). Eso baja la
# primera carga de 3.1 MB a ~110 KB y hace que el sitio quepa en un deploy.
RECURSOS = "https://yilqentsmibgnzphztxc.supabase.co/storage/v1/object/public/despacho"


def morir(msg):
    print("✖ " + msg)
    sys.exit(1)


def cortar(texto, desde, hasta, incluir_fin=False, etiqueta=""):
    """Devuelve el trozo entre dos marcas exactas. Falla si no son únicas."""
    if texto.count(desde) != 1:
        morir(f"La marca inicial de «{etiqueta}» aparece {texto.count(desde)} veces: {desde[:60]!r}")
    i = texto.index(desde)
    j = texto.find(hasta, i)
    if j < 0:
        morir(f"No encontré el final de «{etiqueta}»: {hasta[:60]!r}")
    return texto[i:j + (len(hasta) if incluir_fin else 0)]


def sustituir(texto, viejo, nuevo, etiqueta, veces=1):
    n = texto.count(viejo)
    if n != veces:
        morir(f"«{etiqueta}»: esperaba {veces} coincidencia(s) y encontré {n}.\n   Buscaba: {viejo[:90]!r}")
    return texto.replace(viejo, nuevo)


# ══════════════════════════════════════════════════════════════════
if not ORIGEN.exists():
    morir(f"No encuentro {ORIGEN.name} junto a build.py")

html = ORIGEN.read_text(encoding="utf-8")
if WEB.exists():
    shutil.rmtree(WEB)
(WEB / "actualizar").mkdir(parents=True)

# ══════════════════════════════════════════════════════════════════
# 1 · despacho-datos.js — lógica compartida con /actualizar
#     (se extrae del HTML para que no haya dos copias que se desfasen)
# ══════════════════════════════════════════════════════════════════
bloque_coords = cortar(html, "// Coordenadas aproximadas de tiendas conocidas", "function fmt(n){",
                       etiqueta="tabla de coordenadas + norm/coordConocida/normEsquema")
bloque_esq_def = cortar(html, "function esquemaDefault(nombre){", "function pagoHoy(esq){",
                        etiqueta="esquemaDefault")
bloque_lugares = cortar(html, "const LUGARES=[", "/* ═══════════ CONTADOR DE BÚSQUEDAS",
                        etiqueta="gazetteer LUGARES + buscarLocal")
bloque_reporte = cortar(html, "const UBICACION_CIUDAD=", "document.getElementById('fileXlsx').addEventListener",
                        etiqueta="helpers del Reporte de urgencias")
bloque_parser = cortar(html, "      const ws=wb.Sheets[wb.SheetNames[0]];",
                       "      if(!vistas.size) throw new Error('sin filas');",
                       incluir_fin=True, etiqueta="parser del Excel")
bloque_parser = sustituir(bloque_parser, "id:nextId++", "id:_id++", "contador de id del parser")

datos_js = f"""/* ═══════════════════════════════════════════════════════════════
   Lógica compartida entre la app pública y /actualizar.
   GENERADO POR build.py — no lo edites a mano: edita el HTML
   original y vuelve a ejecutar  python3 build.py
   ═══════════════════════════════════════════════════════════════ */

{bloque_coords}{bloque_esq_def}{bloque_lugares}
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
{bloque_reporte}
/* ── Lee el Excel del día y devuelve la lista de tiendas ──────── */
function parsearExcel(buffer){{
  let _id=1;
  const wb=XLSX.read(new Uint8Array(buffer),{{type:'array'}});
{bloque_parser}
  return {{tiendas:[...vistas.values()], esReporte, omitidasInactivas}};
}}

/* ── Busca coordenadas de las tiendas que quedaron sin ubicar ─── */
async function ubicarPendientes(tiendas, avisar){{
  const pend=tiendas.filter(t=>t.lat==null&&(t.direccion||'').trim());
  let hechas=0, ok=0;
  for(const t of pend){{
    hechas++;
    if(avisar) avisar(hechas, pend.length, t.nombre);
    let r=buscarLocal(t.direccion)||buscarLocal(t.direccion.split(',').slice(-3).join(' '));
    if(!r){{
      try{{
        const q=encodeURIComponent(t.direccion+', México');
        const resp=await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=mx&q='+q);
        const d=await resp.json();
        if(d&&d.length) r={{lat:+d[0].lat,lng:+d[0].lon}};
        await new Promise(s=>setTimeout(s,1100)); // límite de uso de Nominatim
      }}catch(e){{}}
    }}
    if(r){{
      t.lat=+r.lat.toFixed(5); t.lng=+r.lng.toFixed(5); ok++;
      // Sin número en la dirección = solo tenemos la ciudad, no la calle:
      // la tienda queda en el centro de su ciudad, no en su ubicación exacta.
      if(!/\\d/.test(t.direccion)) t.aprox=true;
    }}
  }}
  return {{
    intentadas:pend.length, ubicadas:ok,
    aproximadas:tiendas.filter(t=>t.aprox).length,
    sinUbicar:tiendas.filter(t=>t.lat==null).length
  }};
}}
"""
(WEB / "despacho-datos.js").write_text(datos_js, encoding="utf-8")

# ══════════════════════════════════════════════════════════════════
# 2 · index.html — la app que ve el equipo
# ══════════════════════════════════════════════════════════════════
CSS_EXTRA = """
/* ── El diseño es claro: que el navegador no lo invierta solo ── */
:root{color-scheme:light}

/* ── Modo solo lectura para quien no publica ── */
body:not(.es-admin) .solo-admin{display:none!important}
body:not(.es-admin) #tbody input,
body:not(.es-admin) #tbody select,
body:not(.es-admin) .cfg-grid input,
body:not(.es-admin) #cuerpoLvp input{pointer-events:none;background:#F2F4F7;border-color:#E4E8EE;color:var(--ink-2)}
body:not(.es-admin) #tbody button,
body:not(.es-admin) #modoUbicar{display:none}
#linkActualizar{color:#AEB9C9;text-decoration:underline;cursor:pointer}
#linkActualizar:hover{color:#fff}
</style>

<script id="infografiasData">"""

html = sustituir(html, '</style>\n\n<script id="infografiasData">', CSS_EXTRA,
                 "hueco para el CSS de solo lectura")

html = sustituir(html,
                 "<script>\n/* ═══════════ DATOS BASE ═══════════ */",
                 '<script src="conexion.js"></script>\n<script>\n/* ═══════════ DATOS BASE ═══════════ */',
                 "carga de conexion.js")

html = sustituir(html,
                 '<span class="hd-date" id="hoyTxt"></span>',
                 '<span class="hd-date" id="hoyTxt"></span>\n'
                 '      <span class="hd-date" id="actTxt"></span>\n'
                 '      <a class="hd-date" id="linkActualizar" href="actualizar/">🔒 Actualizar datos</a>',
                 "fecha de última actualización en el encabezado")

# El Excel se sube en /actualizar (con vista previa e historial). El <input>
# se queda oculto porque el script le pone un manejador al arrancar.
html = sustituir(html,
                 '<label class="btn" for="fileXlsx">⬆ Subir Excel del día</label>',
                 '<a class="btn solo-admin" href="actualizar/">⬆ Publicar la lista del día</a>',
                 "botón Subir Excel → enlace a /actualizar")

# Leer la lista desde una foto necesitaba una llamada a la API de Anthropic
# con credencial. En un sitio estático no hay dónde esconderla, así que el
# botón se retira (el <input> se queda por el manejador).
html = sustituir(html,
                 '<label class="btn" for="fileFoto">📷 Subir foto del día</label>',
                 '<!-- "Subir foto del día" retirado: necesita una credencial de IA del lado del servidor -->',
                 "botón Subir foto")

html = sustituir(html,
                 "  const hay=await cargarGuardado();\n  if(hay) render(); else await cargarDemo();",
                 "  const hay=await cargarGuardado();\n"
                 "  render();\n"
                 "  if(!hay) document.getElementById('msgCarga').innerHTML="
                 "'⚠ <b>Todavía no se ha publicado la lista de hoy.</b> "
                 'Se sube en <a href="actualizar/">/actualizar</a>.\';',
                 "arranque sin datos de ejemplo")

# Al corregir una ubicación a mano deja de ser "aproximada": así /actualizar
# sabe que debe respetarla en las siguientes cargas del Excel.
html = sustituir(
    html,
    "    if(t){ t.lat=+e.latlng.lat.toFixed(5); t.lng=+e.latlng.lng.toFixed(5); await guardar(); render(); }",
    "    if(t){ t.lat=+e.latlng.lat.toFixed(5); t.lng=+e.latlng.lng.toFixed(5); t.aprox=false; await guardar(); render(); }",
    "ubicación marcada en el mapa")
html = sustituir(
    html,
    "      t.lat=+c[0].toFixed(5); t.lng=+c[1].toFixed(5);\n      quitarPreview();",
    "      t.lat=+c[0].toFixed(5); t.lng=+c[1].toFixed(5); t.aprox=false;\n      quitarPreview();",
    "ubicación corregida a mano")

for viejo, nuevo, etq in [
    ('<button class="btn" id="btnAgregar">',
     '<button class="btn solo-admin" id="btnAgregar">', "botón Agregar tienda"),
    ('<button class="btn sec" id="btnDemo">',
     '<button class="btn sec solo-admin" id="btnDemo">', "botón Cargar ejemplo"),
    ('<button class="btn rojo mini" id="btnLimpiar">',
     '<button class="btn rojo mini solo-admin" id="btnLimpiar">', "botón Vaciar lista"),
    ('<button class="btn sec mini" id="btnAddZona"',
     '<button class="btn sec mini solo-admin" id="btnAddZona"', "botón Agregar zona"),
    ('<button class="btn" id="btnGuardarConfig">',
     '<button class="btn solo-admin" id="btnGuardarConfig">', "botón Guardar config"),
    ('<button class="btn sec" id="btnResetConfig">',
     '<button class="btn sec solo-admin" id="btnResetConfig">', "botón Restaurar config"),
]:
    html = sustituir(html, viejo, nuevo, etq)

# ── Sacar las infografías y los videos del HTML ──────────────────
m = re.search(r"const INFOGRAFIAS=(\{.*?\});\n", html, re.S)
if not m:
    morir("No encontré el diccionario INFOGRAFIAS")
claves = list(json.loads(m.group(1)).keys())
faltan = [k for k in claves if not (RAIZ / "recursos" / f"{k}.png").exists()]
if faltan:
    morir("Faltan recursos por extraer/subir: " + ", ".join(faltan))
nuevo = "const INFOGRAFIAS=" + json.dumps(
    {k: f"{RECURSOS}/{k}.png" for k in claves}, ensure_ascii=False) + ";\n"
html = html[:m.start()] + nuevo + html[m.end():]

m = re.search(r"const VIDEOS_CONSULTA=\[.*?\];\n", html, re.S)
if not m:
    morir("No encontré el arreglo VIDEOS_CONSULTA")
html = html[:m.start()] + (
    "const VIDEOS_CONSULTA=[\n"
    f"  '{RECURSOS}/unicornio1.mp4',\n"
    f"  '{RECURSOS}/unicornio2.mp4',\n"
    "];\n"
) + html[m.end():]

# El atributo download no funciona entre dominios distintos: el navegador
# abriría la imagen en vez de bajarla. Se descarga vía blob.
html = sustituir(
    html,
    "  img.src=inf.data;\n  dl.href=inf.data;\n  dl.download='Infografia_'+inf.key+'.png';",
    "  img.src=inf.data;\n  dl.href=inf.data;\n  dl.download='Infografia_'+inf.key+'.png';\n"
    "  dl.onclick=bajarInfografia;",
    "descarga de la infografía")

html = sustituir(
    html,
    "function mostrarInfografia(t,prefix){",
    "async function bajarInfografia(e){\n"
    "  e.preventDefault();\n"
    "  const a=e.currentTarget;\n"
    "  try{\n"
    "    const blob=await (await fetch(a.href)).blob();\n"
    "    const url=URL.createObjectURL(blob);\n"
    "    const tmp=document.createElement('a');\n"
    "    tmp.href=url; tmp.download=a.download; tmp.click();\n"
    "    setTimeout(()=>URL.revokeObjectURL(url),4000);\n"
    "  }catch(err){ window.open(a.href,'_blank'); }\n"
    "}\n"
    "function mostrarInfografia(t,prefix){",
    "función para bajar la infografía")

# Texto de ayuda de la sección 5
i = html.find('<p class="hint" style="margin-top:8px">Puedes subir el <b>Excel</b>')
if i < 0:
    morir("No encontré el texto de ayuda de la sección 5")
j = html.find("</p>", i) + 4
html = html[:i] + (
    '<p class="hint" style="margin-top:8px">La lista del día se publica desde '
    '<a href="actualizar/"><b>/actualizar</b></a> (con clave): ahí subes el '
    '<b>Excel</b> en formato clásico (Sucursal · Vacantes · Urgencia · Esquema · Dirección) o el '
    '<b>Reporte de urgencias</b> (Sucursal · Cliente · Estatus · Ubicación · Prioridad · Vacantes — '
    'URGENTE se convierte en urgencia Alta y las tiendas sin prioridad quedan en Baja). '
    'Cuando publicas, <b>todo el equipo ve la misma lista</b> al abrir o recargar esta página, y '
    'esas mismas tiendas alimentan el <b>speech de cierre de contratación</b> (sección 2).</p>'
) + html[j:]

(WEB / "index.html").write_text(html, encoding="utf-8")

# ══════════════════════════════════════════════════════════════════
# 3 · Archivos escritos a mano
# ══════════════════════════════════════════════════════════════════
shutil.copy(SRC / "conexion.js", WEB / "conexion.js")
shutil.copy(SRC / "actualizar.html", WEB / "actualizar" / "index.html")

print(f"✔ web/index.html            {len(html)/1048576:.2f} MB")
print(f"✔ web/despacho-datos.js     {len(datos_js)/1024:.1f} KB")
print("✔ web/conexion.js")
print("✔ web/actualizar/index.html")
