# Despacho de Choferes

Sitio estático + Supabase. Sin servidor propio, sin PHP, sin instalación.

| Dirección | Para quién | Qué hace |
|---|---|---|
| `/` | todo el equipo, sin clave | consulta el despacho del día |
| `/actualizar` | tú, con clave | subes el Excel y se actualiza para todos |

## Estructura

```
web/                      ← esto es lo que se sube a Vercel (156 KB)
├── index.html            la app que ve el equipo
├── conexion.js           habla con Supabase
├── despacho-datos.js     lee el Excel y ubica las tiendas
└── actualizar/index.html la página con clave

src/                      ← lo que edito a mano
├── conexion.js
└── actualizar.html

build.py                  genera web/ desde el HTML original + src/
recursos/                 las 16 infografías y 2 videos ya subidos a Supabase
```

Para regenerar `web/`:

```bash
python3 build.py
```

Para verlo en local antes de publicar:

```bash
python3 -m http.server 8090 --directory web
```

## Publicar en Vercel

Al importar este repo en **vercel.com/new**, cambia una sola cosa:

> **Root Directory** → `web`

Es lo único: el repo guarda también el fuente (`build.py`, `src/`, el HTML
original), y Vercel solo debe servir `web/`. Framework Preset queda en *Other*,
sin build command. De ahí en adelante, cada push redespliega solo.

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
4. **Publicar**. El equipo lo ve al recargar.

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
