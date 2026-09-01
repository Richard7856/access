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
| `/expedientes` | ingreso de candidatos: Excel + PDF/fotos | **compartidos** (Supabase + Storage) |
| `/analizador` | reporte mensual de bajas y descarte | tu archivo, en tu navegador |
| `/seguimiento` | choferes: estatus, bitácora, búsqueda | **compartidos** (Supabase) |
| `/carrera` | marcador del equipo: pista, altas, clasificación | **compartidas** (Supabase) |
| `/examinados` | contraseñas Midot, quién pasó y el costo por periodo | **compartidos** (Supabase) |

**Torre y Analizador siguen siendo locales**: cada quien sube su archivo y lo ve
solo él. Ahí puede tener sentido — son herramientas de análisis personal.

## Cómo se comparte el Gestor de Expedientes

La app no guardaba nada: todo vivía en `const state = {}` y los documentos son
píxeles en memoria — recargar perdía el trabajo. Ahora los datos del candidato
van a la fila `expedientes:estado` y cada documento (el PDF o la foto
**original**, tal como se subió) al bucket `expedientes`, en la ruta
`idDelCandidato/categoría`.

La app es un solo `<script>` de nivel superior, así que sus funciones son
globales y `sync-expedientes.js` (cargado después de ella) se engancha sin
tocar su lógica:

- **`loadFileIntoDocument`** → además de procesar el documento, sube el archivo
  original al bucket.
- **`renderTabs` / `updateSpeeches` / `reprocessDocument`** → programan publicar
  (1.5 s de respiro): toda mutación —altas y bajas de candidatos, cada tecla en
  un campo, los ajustes de un documento— termina pasando por alguna de las tres.
- **Al abrir** → baja la fila y reconstruye cada documento llamando a la
  **propia** `loadFileIntoDocument` de la app con el archivo bajado del bucket:
  mismo pipeline, cero código duplicado. Los ajustes guardados (brillo,
  contraste, nitidez) se re-aplican después.
- **Cada 25 s** → si alguien más guardó, avisa para recargar (a media captura
  sería peor pisar el foco). Antes de publicar comprueba si el otro ya guardó,
  como el Clasificador: protección, no fusión.

El bucket **no tiene permiso de borrado** desde la web: los archivos de
candidatos eliminados quedan huérfanos (costo menor, se limpian a mano si
estorban) y así el respaldo siempre encuentra sus documentos. Antes de publicar
un estado con **menos** candidatos que el guardado se copia el anterior a
`expedientes:estado:respaldo`; se recupera con
`window.restaurarRespaldoExpedientes()` en la consola.

## Cómo se comparte la Carrera

Toda la carrera se deriva de un solo arreglo, `records`: el marcador, la
clasificación y hasta el escenario salen de ahí con `useMemo`. Como es React y
no hay funciones globales donde engancharse, `build.py` inserta una línea dentro
del componente que llama a `useSincronizacionCarrera(records, setRecords)`.

A diferencia del Clasificador, aquí las altas **se unen por id en vez de
reemplazarse**: si dos personas registran al mismo tiempo, no se pierde ninguna.
Y lo que se borra a propósito se recuerda, para que la siguiente unión no lo
resucite. Es lo que corresponde a una lista donde casi todo son altas nuevas.

Desde la v11 hay una caja aparte, `access-pack-runner-highscore`: el récord
del minijuego *Carrera Infinita*. **No se comparte a propósito** — es la marca
personal de cada quien corriendo, no dato de trabajo. Si algún día se quiere como
récord de la casa, hay que sincronizarla como el Seguimiento (envolviendo
`Storage.prototype.setItem`), porque el hook de React solo alcanza `records`.

Desde la v13, "Cerrar mes" archiva el periodo, corona al campeón/a y deja el
marcador en cero. El Salón de la Fama y el archivo mensual viven en cajas
propias (`access-pack-hall-of-fame-v1` y `access-pack-monthly-archive-v1`) que
el hook de `records` no alcanza — sin más, el historial de la casa viviría solo
en el navegador de quien cierra el mes. Por eso `build.py` inserta un **segundo
hook**, `useSincronizacionExtrasCarrera`, junto a sus estados: publica ambos en
la fila `carrera:extras`, uniendo el Salón **por mes** (lo local pisa su propio
mes) y el archivo **por clave** (cada cierre lleva marca de tiempo, nunca
chocan). El reset del marcador viaja solo por la unión de `records`: el vaciado
es un borrado a propósito y la memoria de borrados evita que resucite.

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

> **Red contra "Borrar todo".** Ese botón vacía la tabla y, al ser compartida,
> borraría la del equipo entero sin vuelta atrás. Antes de publicar un estado
> con **menos** registros que el guardado, el sincronizador copia el anterior a
> `seguimiento:estado:respaldo`. Para recuperarlo, en la consola del navegador:
>
> ```js
> window.restaurarRespaldo()
> ```
>
> Luego se recarga la página. Es **una sola copia**, la inmediatamente anterior.

## Cómo se comparte el Clasificador

La app guardaba todo en `localStorage` con `persist()` y lo reconstruía con
`load()` + `refreshAll()`. `sync-clasificador.js` se engancha ahí **sin tocar su
lógica**:

- **al abrir** → baja lo del equipo y lo **fusiona** con lo local
- **al guardar** → fusiona y publica 1.5 s después (para no mandar uno por tecla)
- **cada 20 s** → si alguien más guardó, fusiona y repinta

Si no hay internet sigue funcionando en local y avisa. La clave de IA
(`clasificador_ai`) **no se comparte**: es de cada quien.

> **Por qué fusión y no reemplazo.** La primera versión guardaba el estado
> ENTERO: el segundo en guardar recibía un candado rojo y, al recargar, lo
> remoto **pisaba su trabajo**. Con seis personas capturando a la vez eso
> pasaba todo el día — "no guarda la memoria" — y el equipo dejó de confiar
> en la herramienta. Ahora se fusiona de **tres vías** (base = lo último
> sincronizado en este navegador, local, remoto), registro por registro:
> lo agregado por cualquiera se queda, la edición local gana, lo que no
> tocaste toma lo remoto, y el borrado se respeta (aunque una edición ajena
> le gana al borrado). Al abrir, la fusión también **rescata** el trabajo
> que quedó atorado en un navegador sin publicarse.

Detalles con historia, para no re-aprenderlos:

- Los registros del Clasificador **no traen id** (las altas son objetos
  pelones), así que el sincronizador les sella un `_sid`: huella del contenido
  con **claves ordenadas** — `jsonb` de Postgres reordena las claves de los
  objetos, y comparar con `JSON.stringify` a secas ve "distinto" donde no lo
  hay. La app arrastra el `_sid` sola porque `persist()` guarda los objetos
  completos.
- **Publicar lleva cerrojo optimista**: un UPDATE condicionado a que la fila
  siga como se leyó (`actualizado=eq.marca`; el trigger de la tabla cambia la
  marca en cada UPDATE). Si otro ganó la carrera, se vuelve a traer, fusionar
  y publicar. Sin el cerrojo, la base de quien perdía tomaba sus propios
  registros por "borrados por otro" y los tiraba.
- `idSeq` avanza con un salto aleatorio por navegador: dos personas creando
  candidatos a la vez generaban el mismo `c12` y la fusión los tomaba por el
  mismo registro.
- **Red contra "Limpiar todo"**: antes de publicar con menos registros que lo
  guardado se copia lo anterior a `clasificador:estado:respaldo`. Se recupera
  con `window.restaurarRespaldoClasificador()` (limpia también la base local,
  para que la fusión no vuelva a aceptar el borrado).
- Editar **el mismo campo del mismo registro** a la vez sigue siendo "uno
  gana": la fusión es por registro, no por campo. Para el uso real (cada
  quien captura lo suyo) no estorba.

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
- **Bucket `expedientes`** — los documentos del Gestor de Expedientes (PDF y
  fotos, máx. 15 MB). Lectura pública, subir y reemplazar con la clave
  publicable, **sin borrado**: lo subido no se puede destruir desde la web.

La clave que aparece en `conexion.js` es la **publicable** (`sb_publishable_…`).
Es normal que sea visible: así funciona Supabase. Lo que protege son las
políticas RLS de arriba.

## Cómo se comparte el Control de examinados

La app ya guardaba en localStorage (tres cajas: filas de examinados, metadatos
de la cuenta y usuarios de la Comer), pero era por navegador. Ahora vive en la
fila `examinados:estado` y es la misma para todos.

El enganche es distinto al del Seguimiento porque esta app **no arranca con
`DOMContentLoaded`**: es un IIFE que corre al final de su script. `build.py` le
parcha el bloque de Init para que espere `window.__esperarEquipoExaminados` (la
promesa que baja lo del equipo) antes de arrancar — así abre ya con los datos
compartidos — y para que deje `window.__recargarExaminados`, con lo que los
cambios de otros **sí se repintan solos** (salvo que estés escribiendo en un
campo: ahí avisa en lugar de interrumpir). Publicar es como en el Seguimiento:
`Storage.prototype.setItem` envuelto, con 1.2 s de respiro.

Red contra el borrado: antes de publicar con menos registros se copia lo
anterior a `examinados:estado:respaldo` (`window.restaurarRespaldoExaminados()`
lo devuelve). El aviso rojo solo sale con bajones grandes — borrar una fila de
relleno es rutina.

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
