# Herramientas de reclutamiento · AccessPack

Siete herramientas en un solo sitio. Estático + Supabase: sin servidor propio,
sin PHP, sin instalación.

| Dirección | Qué hace | Datos |
|---|---|---|
| `/` | portada con las siete | — |
| `/despacho` | tiendas del día, cercanía y speech de cierre | **compartidos** (Supabase) |
| `/despacho/actualizar` | subir el Excel del día · **con clave** | escribe los compartidos |
| `/torre` | leads por día/semana/mes, embudo, estatus | tu archivo, en tu navegador |
| `/clasificador` | reportes del equipo, pipeline, altas | **compartidos** (Supabase) |
| `/expedientes` | ingreso de candidatos: Excel + PDF/fotos | **nada: se pierde al recargar** |
| `/analizador` | reporte mensual de bajas y descarte | tu archivo, en tu navegador |
| `/seguimiento` | choferes: estatus, bitácora, búsqueda | **compartidos** (Supabase) |
| `/carrera` | marcador del equipo: pista, altas, clasificación | **compartidas** (Supabase) |

**Torre y Analizador siguen siendo locales**: cada quien sube su archivo y lo ve
solo él. Ahí puede tener sentido — son herramientas de análisis personal.

**El Gestor de Expedientes no guarda nada**, ni siquiera en el navegador: no usa
localStorage ni IndexedDB, todo vive en memoria (`const state = {}`). Si recargas
o cierras la pestaña a media captura, se pierde el trabajo y los documentos
adjuntos. Hacerlo persistente es más caro que el resto porque además de datos
maneja **archivos** (PDF e imágenes), que irían a Supabase Storage.

## Cómo se comparte la Carrera

Toda la carrera se deriva de un solo arreglo, `records`: el marcador, la
clasificación y hasta el escenario salen de ahí con `useMemo`. Como es React y
no hay funciones globales donde engancharse, `build.py` inserta una línea dentro
del componente que llama a `useSincronizacionCarrera(records, setRecords)`.

A diferencia del Clasificador, aquí las altas **se unen por id en vez de
reemplazarse**: si dos personas registran al mismo tiempo, no se pierde ninguna.
Y lo que se borra a propósito se recuerda, para que la siguiente unión no lo
resucite. Es lo que corresponde a una lista donde casi todo son altas nuevas.

Desde la v7 la app trae además su propio `localStorage`. Los dos conviven bien:
el navegador guarda una copia que pinta al instante y aguanta sin internet, y
Supabase sigue siendo la lista del equipo — al abrir, lo compartido pisa lo
local. El enganche se inserta **por expresión regular**, porque el valor inicial
del estado cambia entre versiones (`useState([])`, `useState(loadStoredRecords)`).

## Cómo se comparte el Seguimiento

Esta app vive dentro de un `(function(){…})()`, así que sus funciones no se
alcanzan desde fuera. El enganche es otro: arranca con `DOMContentLoaded`, así
que `sync-seguimiento.js` —cargado en el `<head>`, antes que ella— **intercepta
ese registro**, baja el estado del equipo, lo deja en `localStorage` y recién
entonces la deja arrancar. La app carga los datos compartidos creyendo que son
suyos.

Las cajas que se sincronizan están listadas en `CAJAS`. **Si una versión nueva
agrega otra y no se lista ahí, esa parte se queda sin compartir** — pasó con la
v29, que sumó la bitácora.

Para publicar se envuelve `Storage.prototype.setItem`. Tiene que ser en el
**prototipo**: asignarle una propiedad a `localStorage` se ignora en silencio,
porque los `Storage` tratan las asignaciones como entradas de datos.

Los cambios de otros mientras la página está abierta se bajan, pero **no se
repintan solos** —la app no expone su render— así que sale un aviso pidiendo
recargar.

## Cómo se comparte el Clasificador

La app guardaba todo en `localStorage` con `persist()` y lo reconstruía con
`load()` + `refreshAll()`. `sync-clasificador.js` se engancha ahí **sin tocar su
lógica**:

- **al abrir** → baja el estado del equipo y lo carga
- **al guardar** → lo publica 1.5 s después (para no mandar uno por tecla)
- **cada 20 s** → si alguien más guardó, lo trae y repinta

Si no hay internet sigue funcionando en local y avisa. La clave de IA
(`clasificador_ai`) **no se comparte**: es de cada quien.

> **Aviso de choque:** si dos personas editan a la vez, antes de publicar se
> comprueba si el otro ya guardó. Si sí, **no se pisa**: sale un aviso rojo
> pidiendo recargar. Es una protección, no una fusión — el estado se guarda
> entero, así que dos personas trabajando al mismo tiempo se estorban. Para
> turnarse va bien; para edición simultánea de verdad haría falta partir el
> estado por reclutador.

## Estructura

```
web/                            ← esto es lo que sirve Vercel
├── index.html                  portada
├── nav.js                      barra de navegación compartida
├── despacho/
│   ├── index.html              la app que ve el equipo
│   ├── conexion.js             habla con Supabase
│   ├── despacho-datos.js       lee el Excel y ubica las tiendas
│   └── actualizar/index.html   la página con clave
├── torre/index.html
├── clasificador/index.html
├── expedientes/index.html
├── analizador/index.html
├── seguimiento/index.html
├── carrera/index.html
├── sync-clasificador.js       comparte el Clasificador
├── sync-carrera.js             comparte la Carrera
└── sync-seguimiento.js         comparte el Seguimiento

movil.css                 ajustes de celular, inyectada en las 8 páginas

sitios/                   ← las otras seis, tal como salen de Claude
src/                      ← lo que edito a mano (nav, portada, conexión…)
build.py                  genera web/ desde el HTML original + sitios/ + src/
recursos/                 las 16 infografías y 2 videos ya subidos a Supabase
```

`sitios/` se lee **por prefijo de nombre**: puedes dejar caer
`dashboard_4_6.html` junto al `_4_5` y el build te avisa que hay dos versiones,
en lugar de elegir una en silencio. Borra la vieja y listo.

La barra de navegación se inyecta sola en las ocho páginas (`nav.js`), así que
no hay que tocar el HTML de cada herramienta cuando cambie.

Para regenerar `web/`:

```bash
python3 build.py
```

Para verlo en local antes de publicar:

```bash
python3 -m http.server 8090 --directory web
```

## Publicar en Vercel

El repo guarda el fuente (`build.py`, `src/`, el HTML original) además del sitio,
así que Vercel debe servir **solo `web/`**. De eso se encarga `vercel.json`:

```json
{ "outputDirectory": "web" }
```

No hay build command ni framework: es un sitio estático. Cada push redespliega
solo.

> **No pongas además _Root Directory_ = `web` en el panel de Vercel.** Si lo
> haces, Vercel buscaría `vercel.json` dentro de `web/`, no lo encontraría y
> además interpretaría la ruta como `web/web`. Es una cosa **o** la otra;
> con este archivo, *Root Directory* se queda en `./`.

## Dónde viven los datos

Proyecto de Supabase **mascotas** (`yilqentsmibgnzphztxc`), con prefijo `despacho_`
para no mezclarse con las tablas de la app de mascotas:

- **`despacho_estado`** — clave/valor: la lista vigente, la configuración de
  speechs y el contador de búsquedas del equipo.
- **`despacho_publicaciones`** — una fila por cada "Publicar". **Solo se agregan
  filas**: no hay política de UPDATE ni de DELETE, así que lo publicado no se
  puede alterar ni borrar desde la web. De ahí sale el historial y el botón
  *Restaurar*.
- **Bucket `despacho`** — las infografías y los videos. Lectura pública; el
  permiso de subida se retiró después de cargarlos.

La clave que aparece en `conexion.js` es la **publicable** (`sb_publishable_…`).
Es normal que sea visible: así funciona Supabase. Lo que protege son las
políticas RLS de arriba.

## La clave de /actualizar

La eliges tú la primera vez que entras. Se guarda como hash SHA-256 en
`despacho_estado`, así que no viaja en claro y yo nunca la vi.

**Es un candado ligero, no seguridad real**: se verifica en el navegador, así que
quien sepa de programación puede saltárselo, y a nivel base de datos cualquiera
con la clave publicable podría escribir. Sirve para lo que pediste — que nadie
del equipo borre la lista sin querer — no para guardar secretos.

Si la olvidas: borra la fila `despacho:admin` de `despacho_estado` y la página
te vuelve a pedir que la crees.

## Cómo se usa cada día

1. Entras a `/actualizar` con tu clave.
2. Arrastras el Excel. Acepta el **Reporte de urgencias**
   (Sucursal · Cliente · Estatus de Tienda · Ubicación · Prioridad · Vacantes)
   y el formato clásico (Sucursal · Vacantes · Urgencia · Esquema · Dirección).
   Descarta inactivas, combina duplicados, `URGENTE` → urgencia Alta.
3. Revisas la vista previa: cuántas tiendas, cuántas vacantes, cuáles son nuevas
   y cuáles van a desaparecer.
   - **Editar** en cualquier renglón corrige nombre, vacantes, urgencia, esquema
     y **dirección**. Al escribir una dirección la ubica sola; también acepta
     que pegues `19.4326, -99.1332` de Google Maps.
   - **＋ Agregar tienda a mano** mete una que no venga en el Excel.
   - La dirección corregida **no la pisa el Excel del día siguiente**.
4. Antes de soltar el archivo eliges qué pasa con lo ya publicado:
   - **Que mande el Excel** *(por defecto)* — la lista queda exactamente como el
     archivo. Lo que no venga desaparece, incluido lo agregado a mano.
   - **Sumar a lo publicado** — se agregan las del Excel y se quedan las que ya
     estaban.
5. **Publicar**. El equipo lo ve al recargar.

## Detalles que conviene saber

- **Ubicaciones.** Las tiendas conocidas traen coordenada exacta. El reporte solo
  trae la ciudad, así que el resto queda en el **centro de su ciudad** y la vista
  previa te lo dice. Si corriges una a mano en la sección 3 del despacho
  (*Corregir* / *Ubicar*), esa corrección se respeta en las siguientes cargas.
- **Edición.** Con la sesión abierta ves los controles de edición en la página
  principal. Para el resto del equipo es de solo lectura.
- **"Subir foto del día" se retiró.** Necesitaba una llamada a la API de
  Anthropic con credencial, y en un sitio estático no hay dónde esconderla.
  Vuelve a ser posible si algún día se agrega una función serverless.
- **Peso.** `index.html` pasó de 3.1 MB a 107 KB al sacar las infografías y los
  videos al bucket. Ahora cargan solo cuando se necesitan.
