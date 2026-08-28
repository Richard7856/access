/* ═══════════════════════════════════════════════════════════════
   Hace compartido el Clasificador — con FUSIÓN, no reemplazo.

   La app guarda todo su estado en localStorage con persist() y lo
   reconstruye con load() + refreshAll(). Este archivo se engancha ahí
   sin tocar su lógica:

     · al abrir      → baja lo del equipo y lo FUSIONA con lo local
     · al guardar    → fusiona y publica (con un respiro de 1.5 s)
     · cada 20 s     → si alguien más guardó, fusiona y repinta

   La versión anterior guardaba el estado ENTERO y el segundo en
   guardar perdía: le salía un candado rojo, y al recargar lo remoto
   pisaba su trabajo. Con seis personas capturando a la vez eso pasaba
   todo el día — "no guarda la memoria". Ahora se fusiona de tres vías
   (base = lo último sincronizado, local, remoto), registro por
   registro:

     · agregado local o remoto  → se queda (unión, como la Carrera)
     · editado local            → gana la edición local
     · sin cambios locales      → se toma lo remoto (trae ediciones
                                  de otros)
     · borrado                  → se respeta; una edición ajena le
                                  gana al borrado

   Detalles con historia:
   · Los registros del Clasificador no traen id (las altas son objetos
     pelones), así que se les sella un _sid: huella del contenido con
     CLAVES ORDENADAS — jsonb de Postgres reordena las claves de los
     objetos, y comparar con JSON.stringify a secas ve "distinto" donde
     no lo hay. La app arrastra el _sid sola porque persist() guarda
     los objetos completos.
   · idSeq se avanza con un salto propio por navegador: dos personas
     creando candidatos a la vez generaban el mismo 'c12' y la fusión
     los tomaba por el mismo registro.
   · "Limpiar todo" publicaría el vacío para todos: antes de publicar
     con menos registros que lo guardado, se copia lo anterior a
     clasificador:estado:respaldo — window.restaurarRespaldoClasificador()

   La clave de IA (clasificador_ai) NO se comparte: es de cada quien.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  var CFG = { url: 'https://yilqentsmibgnzphztxc.supabase.co', key: 'sb_publishable_wor2_sfD-Lmw3b6WUNXGSw_oT2SAoXe' };
  var CLAVE = 'clasificador:estado';   // fila en la tabla despacho_estado
  var LOCAL = 'clasificador_v1';       // STORE_KEY de la app
  var BASE = 'clasificador_v1:base';   // lo último sincronizado (solo de este navegador)
  var ESPERA = 1500;
  var SONDEO = 20000;

  var REST = CFG.url + '/rest/v1/despacho_estado';
  var H = { apikey: CFG.key, Authorization: 'Bearer ' + CFG.key, 'Content-Type': 'application/json' };

  /* Qué es cada campo del estado, para saber cómo fusionarlo. */
  var ARREGLOS = ['vacancies', 'accountRules', 'calls', 'altas', 'altasDoc', 'estatus', 'baseEmpleados'];
  var MAPAS = ['urgRegionMap', 'filters', 'repHiddenCols', 'bajas', 'altasFilter', 'altasEdFilter', 'kpiFilter'];
  var MAXIMOS = ['idSeq', 'altasDocSync', 'estatusSync', 'baseEmpleadosSync', 'rulesVersion'];

  var marcaRemota = null;
  var publicando = false;
  var temporizador = null;
  var persistOriginal = null;
  // Salto propio para idSeq: evita que dos navegadores generen el mismo id.
  var saltoPropio = 1 + Math.floor(Math.random() * 89);

  function traer(clave) {
    return fetch(REST + '?select=valor,actualizado&clave=eq.' + encodeURIComponent(clave || CLAVE), { headers: H })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (filas) { return filas && filas.length ? filas[0] : null; });
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

  /* Publica CON CERROJO: solo escribe si la fila sigue como la leímos
     (actualizado=eq.marca — el trigger de la tabla lo cambia en cada
     UPDATE). Si otro publicó en medio, regresa [] y el ciclo entero se
     reintenta; sin esto, dos publicaciones casi simultáneas hacían que
     la segunda pisara a la primera y la base de quien perdió la carrera
     tomara sus propios registros por "borrados por otro". */
  function publicarFila(valor, marca) {
    if (!marca) return guardar(CLAVE, valor);   // la fila no existe todavía
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

  /* ── Huellas con claves ordenadas (jsonb reordena las claves) ── */
  function firmaJson(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(firmaJson).join(',') + ']';
    return '{' + Object.keys(v).sort().map(function (k) {
      return JSON.stringify(k) + ':' + firmaJson(v[k]);
    }).join(',') + '}';
  }
  function iguales(a, b) { return firmaJson(a) === firmaJson(b); }

  function hash(texto) {
    var h = 5381;
    for (var i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  /* Sella un _sid en cada elemento que no tenga id propio ni _sid.
     Es determinista (contenido + n.º de repetición): dos navegadores
     sellando la misma lista producen los mismos _sid. */
  function sellar(arr) {
    if (!Array.isArray(arr)) return;
    var vistos = {};
    arr.forEach(function (el) {
      if (!el || typeof el !== 'object') return;
      if (el.id != null || el._sid != null) return;
      var sin = {};
      Object.keys(el).forEach(function (k) { if (k !== '_sid') sin[k] = el[k]; });
      var base = hash(firmaJson(sin));
      var n = vistos[base] || 0;
      vistos[base] = n + 1;
      el._sid = base + '#' + n;
    });
  }
  function sellarEstado(v) {
    if (!v || typeof v !== 'object') return v;
    ARREGLOS.forEach(function (k) { sellar(v[k]); });
    if (v.pools && typeof v.pools === 'object') {
      Object.keys(v.pools).forEach(function (p) { sellar(v.pools[p]); });
    }
    return v;
  }

  function idDe(el) { return el && (el.id != null ? 'i' + el.id : (el._sid != null ? 's' + el._sid : null)); }
  function porId(arr) {
    var m = {};
    (arr || []).forEach(function (el) { var k = idDe(el); if (k) m[k] = el; });
    return m;
  }

  /* ── La fusión de tres vías, registro por registro ──────────── */
  function fusionarArreglo(base, local, remoto) {
    var mBase = porId(base), mLocal = porId(local), mRemoto = porId(remoto);
    var salida = [];
    (local || []).forEach(function (el) {
      var k = idDe(el);
      if (!k) { salida.push(el); return; }
      var b = mBase[k], r = mRemoto[k];
      var editadoLocal = (b === undefined) || !iguales(el, b);
      if (r !== undefined) salida.push(editadoLocal ? el : r);
      else if (b !== undefined) { if (editadoLocal) salida.push(el); /* si no: borrado remoto aceptado */ }
      else salida.push(el);   // nuevo de este navegador
    });
    (remoto || []).forEach(function (el) {
      var k = idDe(el);
      if (!k || mLocal[k]) return;
      if (mBase[k] !== undefined) return;   // lo borró este navegador: el borrado gana
      salida.push(el);                       // nuevo de otra persona
    });
    return salida;
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
    var claves = {};
    [base, local, remoto].forEach(function (o) { Object.keys(o).forEach(function (k) { claves[k] = true; }); });
    var salida = {};
    Object.keys(claves).forEach(function (k) {
      if (ARREGLOS.indexOf(k) >= 0) { salida[k] = fusionarArreglo(base[k], local[k], remoto[k]); return; }
      if (k === 'pools') {
        var sub = {}, nombres = {};
        [base[k] || {}, local[k] || {}, remoto[k] || {}].forEach(function (o) { Object.keys(o).forEach(function (n) { nombres[n] = true; }); });
        Object.keys(nombres).forEach(function (n) {
          sub[n] = fusionarArreglo((base[k] || {})[n], (local[k] || {})[n], (remoto[k] || {})[n]);
        });
        salida[k] = sub; return;
      }
      if (MAPAS.indexOf(k) >= 0) { salida[k] = fusionarMapa(base[k], local[k], remoto[k]); return; }
      if (MAXIMOS.indexOf(k) >= 0) {
        // Máximo puro. El salto anticolisión de idSeq se aplica UNA vez por
        // sesión en aplicar(): sumarlo aquí hacía que la unión nunca fuera
        // igual a lo remoto y cada navegador abierto publicara y repintara
        // cada 20 s sin haber cambios.
        salida[k] = Math.max(+base[k] || 0, +local[k] || 0, +remoto[k] || 0);
        return;
      }
      // escalares y campos que no conocemos: si lo local cambió, gana; si no, lo remoto
      var editadoLocal = !iguales(local[k], base[k]);
      var v = editadoLocal ? local[k] : (k in remoto ? remoto[k] : local[k]);
      if (v !== undefined) salida[k] = v;
    });
    return salida;
  }

  /* Cuántos registros de trabajo hay: la red contra "Limpiar todo". */
  function cuantos(v) {
    if (!v) return 0;
    var n = 0;
    ARREGLOS.forEach(function (k) { if (Array.isArray(v[k])) n += v[k].length; });
    if (v.pools) Object.keys(v.pools).forEach(function (p) { if (Array.isArray(v.pools[p])) n += v.pools[p].length; });
    return n;
  }

  function leerLocal() {
    try { return sellarEstado(JSON.parse(localStorage.getItem(LOCAL) || 'null')); } catch (e) { return null; }
  }
  function leerBase() {
    try { return JSON.parse(localStorage.getItem(BASE) || 'null'); } catch (e) { return null; }
  }
  function escribirBase(v) {
    try { localStorage.setItem(BASE, JSON.stringify(v)); } catch (e) {}
  }

  /* Aplica un estado fusionado a la app: almacén + reconstrucción. */
  var yaSalte = false;
  function aplicar(v) {
    try { localStorage.setItem(LOCAL, JSON.stringify(v)); } catch (e) { return; }
    if (typeof load === 'function') load();
    // El salto anticolisión, una vez por sesión: dos navegadores creando
    // candidatos a la vez generaban el mismo id y la fusión los tomaba por
    // el mismo registro.
    if (!yaSalte && typeof window.idSeq === 'number') { window.idSeq += saltoPropio; yaSalte = true; }
    if (typeof refreshAll === 'function') refreshAll();
  }

  /* ── El ciclo completo: sellar → fusionar → publicar/aplicar ── */
  function sincronizar(esSondeo, intento) {
    intento = intento || 0;
    if (publicando) {
      // Ocupado con un ciclo en vuelo: un guardado no se pierde, se reintenta.
      if (!esSondeo) {
        clearTimeout(temporizador);
        temporizador = setTimeout(function () { sincronizar(false); }, 600);
      }
      return;
    }
    publicando = true;
    if (!esSondeo && !intento) señal('Guardando para el equipo…');
    // Sella los _sid en los objetos VIVOS de la app y refresca el almacén,
    // para que las huellas viajen en el próximo persist() también.
    try { if (typeof state === 'object') { sellarEstado(state); if (persistOriginal) persistOriginal(); } } catch (e) {}

    traer().then(function (fila) {
      var remoto = fila && fila.valor ? sellarEstado(fila.valor) : null;
      if (esSondeo && fila && fila.actualizado === marcaRemota) { publicando = false; return; }

      var local = leerLocal() || {};
      var base = leerBase() || {};
      var union = remoto ? fusionar(base, local, remoto) : local;

      var pasos = Promise.resolve();
      // Red contra "Limpiar todo": si va a publicarse con menos registros
      // que lo guardado, primero se copia lo anterior.
      if (remoto && cuantos(union) < cuantos(remoto)) {
        pasos = guardar(CLAVE + ':respaldo', remoto).catch(function () {});
      }

      return pasos.then(function () {
        // La unión se aplica ANTES de intentar publicar: aunque la
        // publicación falle, aquí ya se ve lo del equipo.
        if (!iguales(union, local)) {
          aplicar(union);
          if (esSondeo) señal('✓ Actualizado con los cambios del equipo');
        }
        if (remoto && iguales(union, remoto)) {
          // Nada nuevo que publicar: la fila ya es la unión.
          marcaRemota = fila.actualizado;
          escribirBase(union);
          if (!esSondeo) señal('✓ Guardado para el equipo');
          publicando = false;
          return;
        }
        return publicarFila(union, fila ? fila.actualizado : null).then(function (filas) {
          if (!filas || !filas.length) {
            // Otro publicó mientras fusionábamos: la base NO avanza, se
            // vuelve a traer, fusionar y publicar.
            publicando = false;
            if (intento < 6) {
              setTimeout(function () { sincronizar(esSondeo, intento + 1); },
                         250 + Math.floor(Math.random() * 750));
            } else if (!esSondeo) {
              señal('El equipo está guardando mucho a la vez; se reintenta solo.', true);
            }
            return;
          }
          marcaRemota = filas[0].actualizado;
          escribirBase(union);
          if (remoto && cuantos(union) < cuantos(remoto)) {
            señal('Se publicó con menos registros (' + cuantos(union) + ' de ' + cuantos(remoto) +
                  '). Hay copia de lo anterior: window.restaurarRespaldoClasificador()', true);
          } else if (!esSondeo) {
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

  /* ── Envolver persist() para que además sincronice ──────────── */
  function engancharPersist() {
    if (typeof window.persist !== 'function' || window.persist.__compartido) return false;
    persistOriginal = window.persist;
    function persistCompartido() {
      var r = persistOriginal.apply(this, arguments);
      clearTimeout(temporizador);
      temporizador = setTimeout(function () { sincronizar(false); }, ESPERA);
      return r;
    }
    persistCompartido.__compartido = true;
    window.persist = persistCompartido;
    return true;
  }

  window.restaurarRespaldoClasificador = function () {
    return traer(CLAVE + ':respaldo').then(function (f) {
      if (!f || !f.valor) throw new Error('no hay copia guardada');
      return guardar(CLAVE, f.valor).then(function () {
        // Sin esto, la fusión volvería a aceptar el borrado: la base de este
        // navegador recuerda los registros como "borrados a propósito".
        try { localStorage.removeItem(BASE); } catch (e) {}
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
      caja.style.cssText = 'position:fixed;right:14px;top:52px;z-index:99999;max-width:320px;font:13px Inter,sans-serif;' +
        'padding:8px 13px;border-radius:7px;box-shadow:0 4px 14px rgba(0,0,0,.16);transition:opacity .3s';
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

  /* ── Arranque ───────────────────────────────────────────────── */
  function iniciar() {
    if (!engancharPersist()) return setTimeout(iniciar, 300);
    // La primera fusión también RESCATA: si este navegador traía trabajo
    // que nunca llegó a publicarse, se une con lo del equipo en vez de
    // que lo remoto lo pise.
    sincronizar(false);

    setInterval(function () { sincronizar(true); }, SONDEO);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
