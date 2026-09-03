/* ═══════════════════════════════════════════════════════════════
   Hace compartido el Control de examinados — con FUSIÓN, no reemplazo.

   La primera versión guardaba el estado ENTERO, como el Seguimiento.
   Con varias personas capturando a la vez eso BORRABA trabajo: A
   publicaba, a B se le bloqueaba el guardado, el sondeo de B traía lo
   de A pisando sus filas, y cuando B lograba publicar borraba las de
   A — reproducido con dos navegadores antes de arreglarlo. Ahora se
   fusiona de tres vías (base = lo último que este navegador ya
   incorporó, local, remoto), como el Clasificador:

     · fila agregada por cualquiera → se queda (unión por id; la
       lista de la Comer se une por número)
     · fila editada aquí            → gana la edición local
     · fila sin tocar               → toma lo remoto
     · fila borrada                 → se respeta; una edición ajena
       le gana al borrado

   Dos cuidados propios de esta app:

   · La app escribe desde su MEMORIA en cada tecla (saveData). Si la
     fusión solo tocara localStorage, la siguiente tecla la pisaría y
     la base leería filas ajenas como "borradas aquí". Por eso la
     fusión SE APLICA (almacén + repintado + base) solo cuando nadie
     tiene un campo con foco; mientras tanto se publica la unión (no
     se pierde nada) y la aplicación se reintenta en unos segundos.
     La base solo avanza cuando la app ya incorporó la unión.

   · Las filas VACÍAS nuevas de este navegador no se publican hasta
     que se llenan: un navegador recién abierto siembra 40 de relleno
     (y la Comer 40 números fijos), y publicarlas duplicaría filas o
     pisaría con vacío los números que otros ya llenaron.

   Publicar lleva cerrojo optimista (UPDATE condicionado a la marca,
   que el trigger de la tabla cambia en cada UPDATE); si otro ganó la
   carrera se vuelve a traer, fusionar y publicar. Las huellas se
   comparan con claves ordenadas — jsonb reordena las claves.

   Red contra el borrado: antes de publicar con menos registros se
   copia lo anterior a examinados:estado:respaldo —
   window.restaurarRespaldoExaminados() lo devuelve (y limpia la base
   local, para que la fusión no re-acepte el borrado).
   ═══════════════════════════════════════════════════════════════ */
(function () {
  var CFG = { url: 'https://yilqentsmibgnzphztxc.supabase.co', key: 'sb_publishable_wor2_sfD-Lmw3b6WUNXGSw_oT2SAoXe' };
  var CLAVE = 'examinados:estado';
  var BASE_LS = 'examinados:base';   // lo último que este navegador incorporó
  var ESPERA = 1200;
  var SONDEO = 20000;
  var REINTENTO_APLICAR = 4000;      // si alguien escribe, la fusión espera

  var ROWS = 'control_examinados_rows_v2';
  var META = 'control_examinados_meta_v1';
  var COMER = 'usuarios_comer_v1';
  var CAJAS = [ROWS, META, COMER];

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

  function guardar(clave, valor) {
    return fetch(REST + '?on_conflict=clave', {
      method: 'POST',
      headers: Object.assign({ Prefer: 'resolution=merge-duplicates,return=representation' }, H),
      body: JSON.stringify({ clave: clave, valor: valor }),
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(t || ('HTTP ' + r.status)); });
      return r.json();
    });
  }

  /* Con cerrojo: solo escribe si la fila sigue como la leímos. Si otro
     publicó en medio, regresa [] y el ciclo entero se reintenta. */
  function publicarFila(valor, marca) {
    if (!marca) return guardar(CLAVE, valor);
    return fetch(REST + '?clave=eq.' + encodeURIComponent(CLAVE) +
                 '&actualizado=eq.' + encodeURIComponent(marca), {
      method: 'PATCH',
      headers: Object.assign({ Prefer: 'return=representation' }, H),
      body: JSON.stringify({ valor: valor }),
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(t || ('HTTP ' + r.status)); });
      return r.json();
    });
  }

  /* ── Huellas con claves ordenadas ───────────────────────────── */
  function firmaJson(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(firmaJson).join(',') + ']';
    return '{' + Object.keys(v).sort().map(function (k) {
      return JSON.stringify(k) + ':' + firmaJson(v[k]);
    }).join(',') + '}';
  }
  function iguales(a, b) { return firmaJson(a) === firmaJson(b); }

  function idDe(el) {
    if (!el || typeof el !== 'object') return null;
    if (el.id != null) return 'i' + el.id;
    if (el.numero != null) return 'n' + el.numero;
    return null;
  }
  function porId(arr) {
    var m = {};
    (arr || []).forEach(function (el) { var k = idDe(el); if (k) m[k] = el; });
    return m;
  }
  function esVacio(el, caja) {
    if (caja === ROWS) return !el.password && !el.nombre && !el.correo && !el.reclutador && !el.paso;
    if (caja === COMER) return !el.reclutador;
    return false;
  }

  /* Fusión de un arreglo. Devuelve dos vistas:
       publicar → lo que va a la fila (sin vacías locales nuevas)
       aplicar  → lo que ve este navegador (con sus vacías de relleno) */
  function fusionarArreglo(base, local, remoto, caja) {
    var mBase = porId(base), mRemoto = porId(remoto);
    // Las vacías nuevas de aquí no entran a la fusión: son relleno.
    var relleno = [], efectivo = [];
    (local || []).forEach(function (el) {
      var k = idDe(el);
      if (k && mBase[k] === undefined && esVacio(el, caja)) relleno.push(el);
      else efectivo.push(el);
    });
    var mLocal = porId(efectivo);
    var salida = [];
    efectivo.forEach(function (el) {
      var k = idDe(el);
      if (!k) { salida.push(el); return; }
      var b = mBase[k], r = mRemoto[k];
      var editadoLocal = (b === undefined) || !iguales(el, b);
      if (r !== undefined) salida.push(editadoLocal ? el : r);
      else if (b !== undefined) { if (editadoLocal) salida.push(el); /* borrado remoto aceptado */ }
      else salida.push(el);
    });
    (remoto || []).forEach(function (el) {
      var k = idDe(el);
      if (!k || mLocal[k]) return;
      if (mBase[k] !== undefined) return;   // borrado aquí: el borrado gana
      salida.push(el);
    });
    var mSalida = porId(salida);
    var aplicar = salida.concat(relleno.filter(function (el) { return !mSalida[idDe(el)]; }));
    return { publicar: salida, aplicar: aplicar };
  }

  function fusionarMapa(base, local, remoto) {
    base = base || {}; local = local || {}; remoto = remoto || {};
    var claves = {};
    [base, local, remoto].forEach(function (o) { Object.keys(o).forEach(function (k) { claves[k] = true; }); });
    var salida = {};
    Object.keys(claves).forEach(function (k) {
      var editadoLocal = !iguales(local[k], base[k]);
      var v = editadoLocal ? local[k] : (k in remoto ? remoto[k] : local[k]);
      if (v !== undefined) salida[k] = v;
    });
    return salida;
  }

  function fusionar(base, local, remoto) {
    base = base || {}; local = local || {}; remoto = remoto || {};
    var filas = fusionarArreglo(base[ROWS], local[ROWS], remoto[ROWS], ROWS);
    var comer = fusionarArreglo(base[COMER], local[COMER], remoto[COMER], COMER);
    var meta = fusionarMapa(base[META], local[META], remoto[META]);
    var publicar = {}; publicar[ROWS] = filas.publicar; publicar[COMER] = comer.publicar; publicar[META] = meta;
    var aplicar = {}; aplicar[ROWS] = filas.aplicar; aplicar[COMER] = comer.aplicar; aplicar[META] = meta;
    return { publicar: publicar, aplicar: aplicar };
  }

  function cuantos(v) {
    var n = 0;
    if (v && Array.isArray(v[ROWS])) n += v[ROWS].length;
    if (v && Array.isArray(v[COMER])) n += v[COMER].length;
    return n;
  }

  function leerLocal() {
    var v = {};
    CAJAS.forEach(function (k) {
      try { v[k] = JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { v[k] = null; }
    });
    return v;
  }
  function leerBase() {
    try { return JSON.parse(localStorage.getItem(BASE_LS) || 'null'); } catch (e) { return null; }
  }
  function escribirBase(v) {
    try { ponerOriginal(BASE_LS, JSON.stringify(v)); } catch (e) {}
  }
  function aplicarCajas(v) {
    CAJAS.forEach(function (k) {
      if (v && v[k] != null) ponerOriginal(k, JSON.stringify(v[k]));
    });
  }

  function escribiendo() {
    var a = document.activeElement;
    return !!(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'));
  }

  function programar() {
    clearTimeout(temporizador);
    temporizador = setTimeout(function () { sincronizar(false); }, ESPERA);
  }

  /* ── El ciclo: traer → fusionar → publicar → aplicar si se puede ── */
  function sincronizar(esSondeo, intento) {
    intento = intento || 0;
    if (publicando) {
      if (!esSondeo) programar();
      return;
    }
    publicando = true;
    traer().then(function (fila) {
      var remoto = fila && fila.valor ? fila.valor : null;
      var local = leerLocal();
      var base = leerBase() || {};
      var u = fusionar(base, local, remoto);
      var localCambia = !iguales(u.aplicar, local);
      if (esSondeo && fila && fila.actualizado === marcaRemota && !localCambia) { publicando = false; return; }

      var pasos = Promise.resolve();
      if (remoto && cuantos(u.publicar) < cuantos(remoto)) {
        pasos = guardar(CLAVE + ':respaldo', remoto).catch(function () {});
      }

      return pasos.then(function () {
        var publicarlo = !remoto || !iguales(u.publicar, remoto);
        return (publicarlo ? publicarFila(u.publicar, fila ? fila.actualizado : null)
                           : Promise.resolve(null)).then(function (filas) {
          if (publicarlo && (!filas || !filas.length)) {
            // Otro publicó mientras fusionábamos: reintentar el ciclo entero.
            publicando = false;
            if (intento < 6) {
              setTimeout(function () { sincronizar(esSondeo, intento + 1); },
                         250 + Math.floor(Math.random() * 750));
            }
            return;
          }
          if (filas && filas[0]) marcaRemota = filas[0].actualizado;
          else if (fila) marcaRemota = fila.actualizado;

          if (localCambia) {
            if (escribiendo()) {
              // Alguien está capturando: la unión ya quedó publicada (nada se
              // pierde); la aplicación local espera a que suelte el campo.
              setTimeout(function () { sincronizar(false); }, REINTENTO_APLICAR);
            } else {
              aplicarCajas(u.aplicar);
              escribirBase(u.publicar);
              if (typeof window.__recargarExaminados === 'function') window.__recargarExaminados();
              if (esSondeo) señal('✓ Actualizado con los cambios del equipo');
            }
          } else {
            escribirBase(u.publicar);
          }

          if (remoto && cuantos(u.publicar) < cuantos(remoto) - 5) {
            señal('Se publicó con menos registros (' + cuantos(u.publicar) + ' de ' + cuantos(remoto) +
                  '). Hay copia de lo anterior: window.restaurarRespaldoExaminados()', true);
          } else if (!esSondeo && publicarlo) {
            señal('✓ Guardado para el equipo');
          }
          publicando = false;
        });
      });
    }).catch(function () {
      publicando = false;
      if (!esSondeo) señal('Sin conexión: tus cambios están solo en este navegador', true);
    });
  }

  /* Cada vez que la app guarda en una de sus cajas, se sincroniza. */
  Storage.prototype.setItem = function (clave, valor) {
    setItemNativo.call(this, clave, valor);
    if (this === localStorage && listo && CAJAS.indexOf(clave) >= 0) programar();
  };

  window.restaurarRespaldoExaminados = function () {
    return traer(CLAVE + ':respaldo').then(function (f) {
      if (!f || !f.valor) throw new Error('no hay copia guardada');
      return guardar(CLAVE, f.valor).then(function () {
        // Sin esto, la fusión volvería a aceptar el borrado: la base de este
        // navegador recuerda los registros como "borrados a propósito".
        try { localStorage.removeItem(BASE_LS); } catch (e) {}
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
      var u = fusionar(leerBase() || {}, leerLocal(), fila.valor);
      aplicarCajas(u.aplicar);      // al arrancar nadie escribe todavía
      escribirBase(u.publicar);
      marcaRemota = fila.actualizado;
      // Rescate: si este navegador traía trabajo sin publicar, se une y sube.
      if (!iguales(u.publicar, fila.valor)) programar();
      señal('✓ Cargado y unido con lo del equipo');
    } else if (CAJAS.some(function (k) { return localStorage.getItem(k); })) {
      programar();                  // nadie ha publicado: subir lo de aquí
    }
    listo = true;
  }).catch(function () {
    listo = true;
    señal('Sin conexión: trabajando solo en este navegador', true);
  });

  /* ── Cambios de otros mientras la página está abierta ────────── */
  setInterval(function () {
    if (!listo) return;
    sincronizar(true);
  }, SONDEO);
})();
