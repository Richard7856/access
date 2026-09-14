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

  /* Las cajas donde la app guarda su estado. Si una versión nueva agrega
     otra y no se lista aquí, esa parte se queda sin compartir — la v29
     sumó la bitácora. */
  var CAJAS = [
    'driverTrackerData_v1',
    'driverTrackerImportBatches_v1',
    'driverTrackerDiscarded_v1',
    'driverTrackerBaja_v1',
    'driverTrackerLog_v1',
    'driverTrackerVacantes_v1',   // v36: plantilla de vacantes (objeto, no arreglo)
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

  function cuantos(v) {
    var n = 0;
    CAJAS.forEach(function (k) { if (v && Array.isArray(v[k])) n += v[k].length; });
    return n;
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
      var nuevo = estadoLocal();
      // Si lo que vamos a publicar tiene MENOS registros que lo que hay, se
      // guarda antes una copia. "Borrar todo" vacía y publica: sin esto, un
      // clic de una persona borraría el trabajo del equipo sin vuelta atrás.
      var previo = (fila && cuantos(fila.valor) > cuantos(nuevo))
        ? fetch(REST + '?on_conflict=clave', {
            method: 'POST',
            headers: Object.assign({ Prefer: 'resolution=merge-duplicates,return=minimal' }, H),
            body: JSON.stringify({ clave: CLAVE + ':respaldo', valor: fila.valor }),
          }).catch(function () {})
        : Promise.resolve();

      return previo.then(function () { return fetch(REST + '?on_conflict=clave', {
        method: 'POST',
        headers: Object.assign({ Prefer: 'resolution=merge-duplicates,return=representation' }, H),
        body: JSON.stringify({ clave: CLAVE, valor: nuevo }),
      }); }).then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw new Error(t || ('HTTP ' + r.status)); });
        return r.json();
      }).then(function (filas) {
        if (filas && filas[0]) marcaRemota = filas[0].actualizado;
        if (fila && cuantos(fila.valor) > cuantos(nuevo)) {
          señal('Se guardó una copia de lo anterior (' + cuantos(fila.valor) +
                ' registros). Para recuperarla: window.restaurarRespaldo()', true);
        } else {
          señal('✓ Guardado para el equipo');
        }
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

  /* ── Vacantes: espejo de la lista del Despacho (fase 1) ────────
     El Excel de vacantes se sube UNA sola vez, al Despacho (en
     /actualizar). De ahí, esto lo convierte a la plantilla que el
     panel ya entiende (driverTrackerVacantes_v1), con los mismos
     campos que produce su propio importador.

     Regla para no pisar a nadie: gana lo más nuevo. Si alguien
     todavía sube el Excel aquí a mano, su archivo se respeta hasta
     que el Despacho publique una lista más reciente. */
  var CLAVE_TIENDAS = 'despacho:tiendas';
  var CAJA_VACANTES = 'driverTrackerVacantes_v1';
  var CADENAS = ['LA COMER', 'CITY MARKET', 'FRESKO', 'SUMESA', 'CEDIS',
                 'AMAZON', 'LIVERPOOL', 'MEGA', 'SORIANA', 'WALMART', 'CHEDRAUI'];

  /* Misma normalización que usa el panel (normalizeSucursalKey):
     así sus cruces texto-libre → sucursal siguen encontrando igual. */
  function normSucursal(s) {
    return String(s || '')
      .toUpperCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/^\d+\s*-\s*/, '')
      .replace(/^L\.\s*/, '')
      .replace(/[^A-Z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function espejoVacantes() {
    return fetch(REST + '?select=valor,actualizado&clave=eq.' + encodeURIComponent(CLAVE_TIENDAS), { headers: H })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (f) {
        if (!f || !f.length || !Array.isArray(f[0].valor) || !f[0].valor.length) return false;
        var marca = f[0].actualizado;
        var actual = null;
        try { actual = JSON.parse(localStorage.getItem(CAJA_VACANTES) || 'null'); } catch (e) {}
        if (actual) {
          if (actual.origen === 'despacho' && actual.origenMarca === marca) return false;  // ya al día
          if (actual.origen !== 'despacho') {
            // Subida manual: solo se reemplaza si la lista del Despacho es más nueva.
            var suyo = Date.parse(actual.importedAt || '') || 0;
            if (suyo >= (Date.parse(marca) || 0)) return false;
          }
        }
        var items = f[0].valor.filter(function (t) { return t && t.nombre; }).map(function (t) {
          var nombre = String(t.nombre).trim();
          var arriba = normSucursal(nombre);
          var cadena = '';
          for (var i = 0; i < CADENAS.length; i++) {
            if (arriba.indexOf(CADENAS[i]) === 0) { cadena = CADENAS[i]; break; }
          }
          return {
            sucursal: nombre,
            sucursalNorm: arriba,
            cliente: cadena,
            estatusTienda: '',
            ubicacion: String(t.direccion || '').trim(),
            prioridad: String(t.urgencia || '').trim(),
            vacantes: parseInt(t.vacantes, 10) || 0,
          };
        });
        if (!items.length) return false;
        ponerOriginal(CAJA_VACANTES, JSON.stringify({
          items: items,
          importedAt: marca,
          fileName: 'Lista del Despacho (automático)',
          origen: 'despacho',
          origenMarca: marca,
        }));
        return true;
      })
      .catch(function () { return false; });
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
    var conEquipo = !!(fila && fila.valor);
    if (conEquipo) {
      marcaRemota = fila.actualizado;
      aplicar(fila.valor);
    }
    // Las vacantes del Despacho entran ANTES de arrancar: la app las
    // carga creyendo que son su plantilla importada.
    return espejoVacantes().then(function () {
      arrancarApp();
      if (conEquipo) {
        señal('✓ Cargado lo del equipo');
      } else if (CAJAS.some(function (k) { return localStorage.getItem(k); })) {
        // Nadie ha publicado: arranca con lo que haya aquí y lo sube.
        publicar();
      }
    });
  }).catch(function () {
    arrancarApp();
    señal('Sin conexión: trabajando solo en este navegador', true);
  });

  /* Recuperar la copia previa. Se llama desde la consola del navegador
     si alguien vació la tabla sin querer con "Borrar todo". */
  window.restaurarRespaldo = function () {
    return fetch(REST + '?select=valor&clave=eq.' + encodeURIComponent(CLAVE + ':respaldo'), { headers: H })
      .then(function (r) { return r.json(); })
      .then(function (f) {
        if (!f || !f.length || !f[0].valor) throw new Error('no hay copia guardada');
        return fetch(REST + '?on_conflict=clave', {
          method: 'POST',
          headers: Object.assign({ Prefer: 'resolution=merge-duplicates,return=minimal' }, H),
          body: JSON.stringify({ clave: CLAVE, valor: f[0].valor }),
        }).then(function () {
          señal('✓ Copia restaurada. Recarga la página.');
          return 'restaurado: recarga la página';
        });
      });
  };

  /* ── Cambios de otros mientras la página está abierta ────────── */
  var vueltas = 0;
  setInterval(function () {
    if (publicando || !listo) return;
    traer().then(function (fila) {
      if (!fila || fila.actualizado === marcaRemota) return;
      marcaRemota = fila.actualizado;
      aplicar(fila.valor);
      // No se repinta solo: la app no expone su render desde fuera.
      señal('Hay cambios del equipo — recarga la página para verlos.', true);
    }).then(function () {
      // Y de vez en cuando, ver si el Despacho publicó lista nueva.
      // (Después de aplicar lo del equipo, para que el espejo decida
      //  sobre la plantilla más reciente y no sobre una vieja.)
      if (++vueltas % 4 !== 0) return;
      return espejoVacantes().then(function (cambio) {
        if (cambio) señal('El Despacho publicó vacantes nuevas — recarga la página para verlas.', true);
      });
    }).catch(function () {});
  }, SONDEO);
})();
