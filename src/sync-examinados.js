/* ═══════════════════════════════════════════════════════════════
   Hace compartido el Control de examinados.

   La app ya guarda en localStorage (tres cajas: las filas de
   examinados, los metadatos de la cuenta y los usuarios de la
   Comer), así que recargar no pierde nada — pero cada quien ve su
   propia tabla. Esto la pone en Supabase (fila examinados:estado)
   para que sea la misma para todos.

   El enganche es distinto al del Seguimiento: esta app NO arranca
   con DOMContentLoaded — es un IIFE que corre al final del body.
   build.py le parcha el bloque de Init para que:
     · espere window.__esperarEquipoExaminados (esta promesa) antes
       de arrancar, y así abra ya con lo del equipo, y
     · exponga window.__recargarExaminados, con lo que los cambios
       de otros SÍ se repintan solos (el Seguimiento no puede y pide
       recargar).

   Para publicar se envuelve Storage.prototype.setItem — en el
   PROTOTIPO, como siempre: asignar sobre localStorage se ignora.

   Red contra el borrado: antes de publicar con menos registros se
   copia lo anterior a examinados:estado:respaldo —
   window.restaurarRespaldoExaminados() lo devuelve. El aviso rojo
   solo sale si el bajón es grande: borrar una fila de relleno es
   rutina y no merece alarma.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  var CFG = { url: '__SUPABASE_URL__', key: '__SUPABASE_KEY__' };
  var CLAVE = 'examinados:estado';
  var ESPERA = 1200;    // respiro antes de publicar
  var SONDEO = 25000;   // cada cuánto miramos si alguien más guardó

  var CAJAS = [
    'control_examinados_rows_v2',
    'control_examinados_meta_v1',   // objeto, no arreglo
    'usuarios_comer_v1',
  ];

  var REST = CFG.url + '/rest/v1/despacho_estado';
  var H = { apikey: CFG.key, Authorization: 'Bearer ' + CFG.key, 'Content-Type': 'application/json' };

  var marcaRemota = null;
  var publicando = false;
  var temporizador = null;
  var listo = false;

  var setItemNativo = Storage.prototype.setItem;
  function ponerOriginal(clave, valor) { setItemNativo.call(localStorage, clave, valor); }

  function traer(clave) {
    return fetch(REST + '?select=valor,actualizado&clave=eq.' + encodeURIComponent(clave || CLAVE), { headers: H })
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
    traer().then(function (fila) {
      if (fila && marcaRemota && fila.actualizado !== marcaRemota) {
        señal('⚠ Alguien más guardó cambios. Recarga la página antes de seguir, o perderás su trabajo o el tuyo.', true);
        publicando = false;
        return;
      }
      var nuevo = estadoLocal();
      var faltan = fila ? cuantos(fila.valor) - cuantos(nuevo) : 0;
      var previo = (faltan > 0)
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
        if (faltan > 5) {
          señal('Se guardó una copia de lo anterior (' + cuantos(fila.valor) +
                ' registros). Para recuperarla: window.restaurarRespaldoExaminados()', true);
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
    if (this === localStorage && listo && CAJAS.indexOf(clave) >= 0) {
      clearTimeout(temporizador);
      temporizador = setTimeout(publicar, ESPERA);
    }
  };

  window.restaurarRespaldoExaminados = function () {
    return traer(CLAVE + ':respaldo').then(function (f) {
      if (!f || !f.valor) throw new Error('no hay copia guardada');
      return fetch(REST + '?on_conflict=clave', {
        method: 'POST',
        headers: Object.assign({ Prefer: 'resolution=merge-duplicates,return=minimal' }, H),
        body: JSON.stringify({ clave: CLAVE, valor: f.valor }),
      }).then(function () {
        señal('✓ Copia restaurada. Recarga la página.');
        return 'restaurado: recarga la página';
      });
    });
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

  /* ── Arranque: la promesa que espera el Init parchado ───────── */
  window.__esperarEquipoExaminados = traer().then(function (fila) {
    if (fila && fila.valor) {
      marcaRemota = fila.actualizado;
      aplicar(fila.valor);
      señal('✓ Cargado lo del equipo');
    } else if (CAJAS.some(function (k) { return localStorage.getItem(k); })) {
      // Nadie ha publicado: arranca con lo de aquí y lo sube.
      setTimeout(publicar, ESPERA);
    }
    listo = true;
  }).catch(function () {
    listo = true;
    señal('Sin conexión: trabajando solo en este navegador', true);
  });

  /* ── Cambios de otros mientras la página está abierta ────────── */
  setInterval(function () {
    if (publicando || !listo) return;
    traer().then(function (fila) {
      if (!fila || fila.actualizado === marcaRemota) return;
      marcaRemota = fila.actualizado;
      aplicar(fila.valor);
      // Si nadie está escribiendo, se repinta solo (el Init parchado nos
      // dejó window.__recargarExaminados); si hay un campo con foco, mejor
      // avisar que interrumpir.
      var activo = document.activeElement;
      var escribiendo = activo && (activo.tagName === 'INPUT' || activo.tagName === 'TEXTAREA');
      if (!escribiendo && typeof window.__recargarExaminados === 'function') {
        window.__recargarExaminados();
        señal('✓ Actualizado con los cambios del equipo');
      } else {
        señal('Hay cambios del equipo — recarga la página para verlos.', true);
      }
    }).catch(function () {});
  }, SONDEO);
})();
