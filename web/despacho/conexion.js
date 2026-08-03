/* ═══════════════════════════════════════════════════════════════
   Conexión con Supabase.
   Sustituye al almacenamiento del entorno de Claude: la app sigue
   usando window.storage.get / window.storage.set igual que antes,
   pero los datos viven en la base y son iguales para todo el equipo.

   Dos tablas:
     despacho_estado        → la lista vigente + config + contador
     despacho_publicaciones → una fila por cada "Publicar" (historial)
   ═══════════════════════════════════════════════════════════════ */
window.DESPACHO_CFG = {
  url: 'https://yilqentsmibgnzphztxc.supabase.co',
  key: 'sb_publishable_wor2_sfD-Lmw3b6WUNXGSw_oT2SAoXe',
};

(function () {
  var REST = window.DESPACHO_CFG.url + '/rest/v1/';
  var KEY = window.DESPACHO_CFG.key;

  function cabeceras(extra) {
    var h = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
    for (var k in (extra || {})) h[k] = extra[k];
    return h;
  }

  function pedir(ruta, opciones) {
    // Las cabeceras se arman AL FINAL: si se hiciera al revés, un `headers`
    // del llamador (por ejemplo Prefer) pisaría el objeto entero y se perdería
    // la apikey — el servidor responde "No API key found in request".
    var o = Object.assign({}, opciones || {});
    o.headers = cabeceras(o.headers);
    return fetch(REST + ruta, o)
      .then(function (r) {
        // Con Prefer: return=minimal la respuesta viene vacía (201 sin cuerpo),
        // así que no se puede llamar a r.json() a ciegas.
        return r.text().then(function (t) {
          if (!r.ok) throw new Error(t || ('HTTP ' + r.status));
          return t ? JSON.parse(t) : null;
        });
      });
  }

  var estado = { datos: {}, actualizado: null, actualizadoTxt: '' };

  var listo = pedir('despacho_estado?select=clave,valor,actualizado')
    .then(function (filas) {
      (filas || []).forEach(function (f) {
        // La app guarda strings JSON; la columna es jsonb. Devolvemos string.
        estado.datos[f.clave] = typeof f.valor === 'string' ? f.valor : JSON.stringify(f.valor);
        if (f.clave === 'despacho:tiendas') {
          estado.actualizado = f.actualizado;
          estado.actualizadoTxt = 'Datos del ' + fechaBonita(f.actualizado);
        }
      });
      return estado;
    })
    .catch(function (e) {
      cuandoHayaDOM(function () {
        avisar('No pude conectar con la base de datos. Revisa tu conexión y recarga la página.');
      });
      return estado;
    });

  window.DESPACHO = {
    listo: listo,
    rest: pedir,
    estado: function () { return estado; },
    esAdmin: esAdmin,
    entrar: function () { try { localStorage.setItem('despacho:admin', '1'); } catch (e) {} },
    salir: function () { try { localStorage.removeItem('despacho:admin'); } catch (e) {} },
    hash: hash,
    fechaBonita: fechaBonita,
  };

  function esAdmin() {
    try { return localStorage.getItem('despacho:admin') === '1'; } catch (e) { return false; }
  }

  /* ── El almacenamiento que espera la app ────────────────────── */
  window.storage = {
    get: function (clave) {
      return listo.then(function (e) {
        var v = e.datos[clave];
        return (v === undefined || v === null) ? null : { value: v };
      });
    },
    set: function (clave, valor) {
      return listo.then(function () {
        var texto = String(valor);
        var cuerpo;
        try { cuerpo = JSON.parse(texto); } catch (err) { cuerpo = texto; }
        return pedir('despacho_estado?on_conflict=clave', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ clave: clave, valor: cuerpo }),
        }).then(function () {
          estado.datos[clave] = texto;
          if (clave === 'despacho:tiendas') {
            estado.actualizadoTxt = 'Datos del ' + fechaBonita(new Date().toISOString());
            pintarFecha();
          }
          return true;
        }).catch(function (err) {
          avisar('No se pudo guardar: ' + err.message);
          throw err;
        });
      });
    },
  };

  /* ── Contraseña sencilla (candado ligero, no seguridad real) ── */
  function hash(texto) {
    var datos = new TextEncoder().encode('despacho:' + texto);
    return crypto.subtle.digest('SHA-256', datos).then(function (buf) {
      return Array.from(new Uint8Array(buf)).map(function (b) {
        return b.toString(16).padStart(2, '0');
      }).join('');
    });
  }

  /* ── Fechas en español ──────────────────────────────────────── */
  function fechaBonita(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('es-MX', {
      weekday: 'long', day: 'numeric', month: 'long',
      hour: 'numeric', minute: '2-digit', timeZone: 'America/Mexico_City',
    });
  }

  /* ── Aviso discreto abajo a la izquierda ────────────────────── */
  var ultimoAviso = 0;
  function avisar(texto) {
    if (Date.now() - ultimoAviso < 4000) return;
    ultimoAviso = Date.now();
    var d = document.getElementById('avisoConexion');
    if (!d) {
      d = document.createElement('div');
      d.id = 'avisoConexion';
      d.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:99999;max-width:340px;background:#131B26;' +
        'color:#fff;font:14px Inter,sans-serif;padding:11px 14px;border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.3)';
      document.body.appendChild(d);
    }
    d.textContent = texto;
    d.style.display = 'block';
    clearTimeout(d._t);
    d._t = setTimeout(function () { d.style.display = 'none'; }, 6000);
  }
  window.DESPACHO.avisar = avisar;

  function pintarFecha() {
    var el = document.getElementById('actTxt');
    if (el) el.textContent = estado.actualizadoTxt || '';
  }

  function aplicar() {
    document.body.classList.toggle('es-admin', esAdmin());
    pintarFecha();
    var link = document.getElementById('linkActualizar');
    if (link) link.textContent = esAdmin() ? '⚙ Actualizar datos' : '🔒 Actualizar datos';
  }

  function cuandoHayaDOM(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  listo.then(function () { cuandoHayaDOM(aplicar); });
})();
