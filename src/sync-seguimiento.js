/* ═══════════════════════════════════════════════════════════════
   Hace compartido el Panel de Seguimiento de Choferes.

   La app ya guarda en localStorage, así que recargar no pierde nada
   — pero cada quien ve su propia tabla. Esto la pone en Supabase para
   que sea la misma para todos y sobreviva a cambiar de navegador,
   de computadora o a limpiar el historial.

   Toda la app vive dentro de un (function(){…})(), así que sus
   funciones no se alcanzan desde fuera. El enganche es otro: arranca
   con DOMContentLoaded, así que interceptamos ese registro, bajamos
   lo del equipo, lo dejamos en localStorage y recién entonces la
   dejamos arrancar. La app carga los datos compartidos creyendo que
   son suyos.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  var CFG = { url: '__SUPABASE_URL__', key: '__SUPABASE_KEY__' };
  var CLAVE = 'seguimiento:estado';
  var ESPERA = 1200;    // respiro antes de publicar
  var SONDEO = 25000;   // cada cuánto miramos si alguien más guardó

  /* Las cuatro cajas donde la app guarda su estado. */
  var CAJAS = [
    'driverTrackerData_v1',
    'driverTrackerImportBatches_v1',
    'driverTrackerDiscarded_v1',
    'driverTrackerBaja_v1',
  ];

  var REST = CFG.url + '/rest/v1/despacho_estado';
  var H = { apikey: CFG.key, Authorization: 'Bearer ' + CFG.key, 'Content-Type': 'application/json' };

  var marcaRemota = null;
  var publicando = false;
  var temporizador = null;
  var listo = false;

  /* El método se envuelve en el PROTOTIPO, no en el objeto: asignarle una
     propiedad a localStorage se ignora en silencio (los Storage tratan las
     asignaciones como entradas de datos, no como propiedades). */
  var setItemNativo = Storage.prototype.setItem;
  function ponerOriginal(clave, valor) { setItemNativo.call(localStorage, clave, valor); }

  function traer() {
    return fetch(REST + '?select=valor,actualizado&clave=eq.' + encodeURIComponent(CLAVE), { headers: H })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (f) { return f && f.length ? f[0] : null; });
  }

  function estadoLocal() {
    var v = {};
    CAJAS.forEach(function (k) {
      try { v[k] = JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { v[k] = null; }
    });
    return v;
  }

  function aplicar(valor) {
    CAJAS.forEach(function (k) {
      if (valor && valor[k] != null) ponerOriginal(k, JSON.stringify(valor[k]));
    });
  }

  function publicar() {
    publicando = true;
    señal('Guardando para el equipo…');
    // Igual que en el Clasificador: si alguien más guardó mientras tanto,
    // no se pisa su trabajo — se avisa y se pide recargar.
    traer().then(function (fila) {
      if (fila && marcaRemota && fila.actualizado !== marcaRemota) {
        señal('⚠ Alguien más guardó cambios. Recarga la página antes de seguir, o perderás su trabajo o el tuyo.', true);
        publicando = false;
        return;
      }
      return fetch(REST + '?on_conflict=clave', {
        method: 'POST',
        headers: Object.assign({ Prefer: 'resolution=merge-duplicates,return=representation' }, H),
        body: JSON.stringify({ clave: CLAVE, valor: estadoLocal() }),
      }).then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw new Error(t || ('HTTP ' + r.status)); });
        return r.json();
      }).then(function (filas) {
        if (filas && filas[0]) marcaRemota = filas[0].actualizado;
        señal('✓ Guardado para el equipo');
        publicando = false;
      });
    }).catch(function () {
      publicando = false;
      señal('Sin conexión: tus cambios están solo en este navegador', true);
    });
  }

  /* Cada vez que la app guarda en una de sus cajas, lo publicamos. */
  Storage.prototype.setItem = function (clave, valor) {
    setItemNativo.call(this, clave, valor);
    // Solo nos interesa localStorage; sessionStorage sigue igual.
    if (this === localStorage && listo && CAJAS.indexOf(clave) >= 0) {
      clearTimeout(temporizador);
      temporizador = setTimeout(publicar, ESPERA);
    }
  };

  /* ── Aviso arriba a la derecha ──────────────────────────────── */
  var caja;
  function señal(texto, alerta) {
    if (!document.body) return;
    if (!caja) {
      caja = document.createElement('div');
      caja.style.cssText = 'position:fixed;right:14px;top:52px;z-index:99999;max-width:320px;' +
        'font:13px Inter,system-ui,sans-serif;padding:8px 13px;border-radius:7px;' +
        'box-shadow:0 4px 14px rgba(0,0,0,.18);transition:opacity .3s';
      document.body.appendChild(caja);
    }
    caja.style.background = alerta ? '#FBEAE8' : '#E7F4EC';
    caja.style.color = alerta ? '#B3261E' : '#1F7A4D';
    caja.style.border = '1px solid ' + (alerta ? '#f0c4c0' : '#b9e0c9');
    caja.textContent = texto;
    caja.style.opacity = '1';
    clearTimeout(caja._t);
    if (!alerta) caja._t = setTimeout(function () { caja.style.opacity = '0'; }, 2500);
  }

  /* ── Retener el arranque hasta tener lo del equipo ───────────── */
  var arranque = null;
  var registrar = document.addEventListener.bind(document);
  document.addEventListener = function (tipo, fn, opciones) {
    if (tipo === 'DOMContentLoaded' && !arranque && typeof fn === 'function') {
      arranque = fn;          // guardamos el init de la app…
      return;                 // …y no lo registramos todavía
    }
    return registrar(tipo, fn, opciones);
  };

  function arrancarApp() {
    document.addEventListener = registrar;   // devolvemos el original
    listo = true;
    if (arranque) {
      // Si el documento ya está listo, se llama directo; si no, se registra.
      if (document.readyState === 'loading') registrar('DOMContentLoaded', arranque);
      else arranque();
    }
  }

  traer().then(function (fila) {
    if (fila && fila.valor) {
      marcaRemota = fila.actualizado;
      aplicar(fila.valor);
      arrancarApp();
      señal('✓ Cargado lo del equipo');
    } else {
      // Nadie ha publicado: arranca con lo que haya aquí y lo sube.
      arrancarApp();
      if (CAJAS.some(function (k) { return localStorage.getItem(k); })) publicar();
    }
  }).catch(function () {
    arrancarApp();
    señal('Sin conexión: trabajando solo en este navegador', true);
  });

  /* ── Cambios de otros mientras la página está abierta ────────── */
  setInterval(function () {
    if (publicando || !listo) return;
    traer().then(function (fila) {
      if (!fila || fila.actualizado === marcaRemota) return;
      marcaRemota = fila.actualizado;
      aplicar(fila.valor);
      // No se repinta solo: la app no expone su render desde fuera.
      señal('Hay cambios del equipo — recarga la página para verlos.', true);
    }).catch(function () {});
  }, SONDEO);
})();
