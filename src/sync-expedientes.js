/* ═══════════════════════════════════════════════════════════════
   Hace compartido el Gestor de Expedientes.

   La app no guardaba nada: todo su estado vive en `const state = {}`
   y los documentos son ImageData en memoria — recargar lo perdía todo.
   Esto lo pone en Supabase: los datos del candidato en la fila
   `expedientes:estado` de despacho_estado, y cada documento (el PDF o
   la foto ORIGINAL, tal como se subió) en el bucket `expedientes`.

   La app es un solo <script> de nivel superior: sus funciones son
   globales y `state` se alcanza desde aquí (este archivo carga después
   que ella). El enganche es estilo Clasificador — envolver funciones
   sin tocar su lógica:

     · loadFileIntoDocument → además sube el archivo original al bucket
     · renderTabs / updateSpeeches / reprocessDocument → programan
       publicar (1.5 s de respiro), porque toda mutación pasa por ahí
     · al abrir → baja lo del equipo y lo reconstruye con la PROPIA
       loadFileIntoDocument de la app (mismo pipeline, cero duplicado)
     · cada 25 s → si alguien más guardó, avisa para recargar

   El bucket no tiene permiso de borrado: los archivos de candidatos
   eliminados quedan huérfanos (costo menor) y así el respaldo
   `expedientes:estado:respaldo` siempre encuentra sus documentos.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  var CFG = { url: '__SUPABASE_URL__', key: '__SUPABASE_KEY__' };
  var CLAVE = 'expedientes:estado';
  var BUCKET = 'expedientes';
  var ESPERA = 1500;    // respiro antes de publicar
  var SONDEO = 25000;   // cada cuánto miramos si alguien más guardó

  var REST = CFG.url + '/rest/v1/despacho_estado';
  var OBJ = CFG.url + '/storage/v1/object/' + BUCKET + '/';           // subir
  var PUB = CFG.url + '/storage/v1/object/public/' + BUCKET + '/';    // leer
  var H = { apikey: CFG.key, Authorization: 'Bearer ' + CFG.key };
  var HJSON = Object.assign({ 'Content-Type': 'application/json' }, H);

  var CAMPOS = ['id', 'nombre', 'proyecto', 'curp', 'nss', 'numero',
                'correo', 'vehiculo', 'placas', 'direccion'];

  var marcaRemota = null;
  var publicando = false;
  var restaurando = false;
  var temporizador = null;

  function traer(clave) {
    return fetch(REST + '?select=valor,actualizado&clave=eq.' + encodeURIComponent(clave || CLAVE), { headers: H })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (f) { return f && f.length ? f[0] : null; });
  }

  /* Del estado en memoria a lo que va a la fila: los campos del candidato
     y, por documento, su metadato — el pixel crudo NO viaja, el archivo
     original ya está en el bucket (doc._nube dice dónde). */
  function serializar() {
    return {
      candidates: state.candidates.map(function (c) {
        var docs = {};
        Object.keys(c.documentos).forEach(function (k) {
          var d = c.documentos[k];
          docs[k] = { status: d.status, fileName: d.fileName, sourceType: d.sourceType,
                      settings: d.settings, archivo: d._nube || null };
        });
        var fila = { documentos: docs };
        CAMPOS.forEach(function (f) { fila[f] = c[f]; });
        return fila;
      }),
      globalSettings: state.globalSettings,
    };
  }

  function cuantos(v) { return v && v.candidates ? v.candidates.length : 0; }

  function programar() {
    if (restaurando) return;
    clearTimeout(temporizador);
    temporizador = setTimeout(publicar, ESPERA);
  }

  function publicar() {
    publicando = true;
    señal('Guardando para el equipo…');
    traer().then(function (fila) {
      // Si alguien más guardó mientras tanto, no se pisa su trabajo.
      if (fila && marcaRemota && fila.actualizado !== marcaRemota) {
        señal('⚠ Alguien más guardó cambios. Recarga la página antes de seguir, o perderás su trabajo o el tuyo.', true);
        publicando = false;
        return;
      }
      var nuevo = serializar();
      // Menos candidatos que lo guardado → copia previa, como el Seguimiento.
      // Los documentos del respaldo siguen en el bucket (no hay borrado).
      var previo = (fila && cuantos(fila.valor) > cuantos(nuevo))
        ? fetch(REST + '?on_conflict=clave', {
            method: 'POST',
            headers: Object.assign({ Prefer: 'resolution=merge-duplicates,return=minimal' }, HJSON),
            body: JSON.stringify({ clave: CLAVE + ':respaldo', valor: fila.valor }),
          }).catch(function () {})
        : Promise.resolve();

      return previo.then(function () { return fetch(REST + '?on_conflict=clave', {
        method: 'POST',
        headers: Object.assign({ Prefer: 'resolution=merge-duplicates,return=representation' }, HJSON),
        body: JSON.stringify({ clave: CLAVE, valor: nuevo }),
      }); }).then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw new Error(t || ('HTTP ' + r.status)); });
        return r.json();
      }).then(function (filas) {
        if (filas && filas[0]) marcaRemota = filas[0].actualizado;
        if (fila && cuantos(fila.valor) > cuantos(nuevo)) {
          señal('Se guardó una copia de lo anterior (' + cuantos(fila.valor) +
                ' candidatos). Para recuperarla: window.restaurarRespaldoExpedientes()', true);
        } else {
          señal('✓ Guardado para el equipo');
        }
        publicando = false;
      });
    }).catch(function () {
      publicando = false;
      señal('Sin conexión: tus cambios están solo en esta pestaña', true);
    });
  }

  /* ── Subir el archivo original de un documento al bucket ────── */
  function tipoDe(file) {
    if (file.type) return file.type;
    var n = (file.name || '').toLowerCase();
    if (n.slice(-4) === '.pdf') return 'application/pdf';
    if (n.slice(-4) === '.png') return 'image/png';
    return 'image/jpeg';
  }

  function subir(candidate, categoryKey, doc, file) {
    var ruta = candidate.id + '/' + categoryKey;
    return fetch(OBJ + ruta, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': tipoDe(file), 'x-upsert': 'true' }, H),
      body: file,
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(t || ('HTTP ' + r.status)); });
      doc._nube = { ruta: ruta, tipo: tipoDe(file) };
      programar();
    }).catch(function () {
      señal('⚠ El documento se ve aquí pero no se pudo subir: quedará solo en esta pestaña.', true);
    });
  }

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

  /* ── Reconstruir lo del equipo con el pipeline de la app ────── */
  var cargarOriginal;   // la loadFileIntoDocument sin envolver

  function aplicar(valor) {
    restaurando = true;
    // El pipeline de la app enseña su barra de progreso y abre el modal al
    // terminar cada documento; durante la reconstrucción eso estorba.
    var progreso = window.showProgress, modal = window.openDocModal, toast = window.showToast;
    window.showProgress = function () {};
    window.openDocModal = function () {};
    window.showToast = function () {};

    state.candidates.length = 0;
    state.activeCandidateId = null;
    if (valor && valor.globalSettings) Object.assign(state.globalSettings, valor.globalSettings);

    var cadena = Promise.resolve();
    ((valor && valor.candidates) || []).forEach(function (sc) {
      var datos = {};
      CAMPOS.forEach(function (f) { datos[f] = sc[f] || ''; });
      var c = createCandidate(datos);
      state.candidates.push(c);
      Object.keys(sc.documentos || {}).forEach(function (k) {
        var sd = sc.documentos[k], d = c.documentos[k];
        if (!sd || !d) return;
        if (sd.archivo && sd.status === 'cargado') {
          cadena = cadena.then(function () {
            return fetch(PUB + sd.archivo.ruta)
              .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
              .then(function (b) {
                var f = new File([b], sd.fileName || k, { type: sd.archivo.tipo || b.type });
                return cargarOriginal(c, k, f);
              })
              .then(function () {
                if (sd.settings) d.settings = sd.settings;
                reprocessDocument(d);
                d._nube = sd.archivo;
              })
              .catch(function () { /* sin ese documento: queda pendiente */ });
          });
        }
      });
    });

    return cadena.then(function () {
      state.activeCandidateId = state.candidates.length ? state.candidates[0].id : null;
      renderTabs();
      renderCandidateWorkspace();
    }).catch(function () {}).then(function () {
      window.showProgress = progreso;
      window.openDocModal = modal;
      window.showToast = toast;
      restaurando = false;
    });
  }

  /* ── Enganches ──────────────────────────────────────────────── */
  function enganchar() {
    cargarOriginal = window.loadFileIntoDocument;
    window.loadFileIntoDocument = function (candidate, categoryKey, file) {
      var r = cargarOriginal.apply(this, arguments);
      Promise.resolve(r).then(function () {
        if (restaurando) return;
        var d = candidate.documentos[categoryKey];
        if (d && d.status === 'cargado') subir(candidate, categoryKey, d, file);
      });
      return r;
    };

    // Toda mutación termina pasando por alguna de estas tres: altas y bajas
    // de candidatos por renderTabs, cada tecla en un campo por updateSpeeches,
    // y los ajustes de un documento por reprocessDocument.
    ['renderTabs', 'updateSpeeches', 'reprocessDocument'].forEach(function (nombre) {
      var original = window[nombre];
      window[nombre] = function () {
        var r = original.apply(this, arguments);
        programar();
        return r;
      };
    });
  }

  window.restaurarRespaldoExpedientes = function () {
    return traer(CLAVE + ':respaldo').then(function (f) {
      if (!f || !f.valor) throw new Error('no hay copia guardada');
      return fetch(REST + '?on_conflict=clave', {
        method: 'POST',
        headers: Object.assign({ Prefer: 'resolution=merge-duplicates,return=minimal' }, HJSON),
        body: JSON.stringify({ clave: CLAVE, valor: f.valor }),
      }).then(function () {
        señal('✓ Copia restaurada. Recarga la página.');
        return 'restaurado: recarga la página';
      });
    });
  };

  /* ── Arranque ───────────────────────────────────────────────── */
  function iniciar() {
    if (typeof state === 'undefined' || typeof window.loadFileIntoDocument !== 'function') {
      return setTimeout(iniciar, 300);
    }
    enganchar();
    traer().then(function (fila) {
      if (fila && fila.valor) {
        marcaRemota = fila.actualizado;
        señal('Cargando los expedientes del equipo…');
        aplicar(fila.valor).then(function () { señal('✓ Cargados los expedientes del equipo'); });
      } else if (state.candidates.length) {
        publicar();
      }
    }).catch(function () {
      señal('Sin conexión: trabajando solo en esta pestaña', true);
    });

    setInterval(function () {
      if (publicando || restaurando) return;
      traer().then(function (fila) {
        if (!fila || fila.actualizado === marcaRemota) return;
        marcaRemota = fila.actualizado;
        // No se recarga solo: a media captura sería peor perder el foco.
        señal('Hay cambios del equipo — recarga la página para verlos.', true);
      }).catch(function () {});
    }, SONDEO);
  }

  iniciar();
})();
