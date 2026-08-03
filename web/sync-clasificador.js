/* ═══════════════════════════════════════════════════════════════
   Hace compartido el Clasificador.

   La app guarda todo su estado en localStorage con persist() y lo
   reconstruye con load() + refreshAll(). Este archivo se engancha ahí
   sin tocar su lógica:

     · al abrir      → baja el estado del equipo y lo carga
     · al guardar    → lo publica (con un respiro de 1.5 s)
     · cada 20 s     → si alguien más guardó, lo trae

   La clave de IA (clasificador_ai) NO se comparte: es de cada quien.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  var CFG = { url: 'https://yilqentsmibgnzphztxc.supabase.co', key: 'sb_publishable_wor2_sfD-Lmw3b6WUNXGSw_oT2SAoXe' };
  var CLAVE = 'clasificador:estado';   // fila en la tabla despacho_estado
  var LOCAL = 'clasificador_v1';       // STORE_KEY de la app
  var ESPERA = 1500;                   // respiro antes de publicar
  var SONDEO = 20000;                  // cada cuánto miramos si cambió

  var REST = CFG.url + '/rest/v1/despacho_estado';
  var H = { apikey: CFG.key, Authorization: 'Bearer ' + CFG.key, 'Content-Type': 'application/json' };

  var marcaRemota = null;   // "actualizado" de lo último que vimos
  var publicando = false;
  var temporizador = null;

  /* ── Traer lo que tiene el equipo ───────────────────────────── */
  function traer() {
    return fetch(REST + '?select=valor,actualizado&clave=eq.' + encodeURIComponent(CLAVE), { headers: H })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (filas) { return filas && filas.length ? filas[0] : null; });
  }

  /* ── Publicar el estado local ───────────────────────────────── */
  function publicar() {
    var crudo;
    try { crudo = localStorage.getItem(LOCAL); } catch (e) { return; }
    if (!crudo) return;
    var valor;
    try { valor = JSON.parse(crudo); } catch (e) { return; }

    publicando = true;
    señal('Guardando para el equipo…');
    // Comprobamos antes si alguien más guardó: sin esto, el último en
    // guardar borraría el trabajo del otro sin que nadie se entere.
    traer().then(function (fila) {
      if (fila && marcaRemota && fila.actualizado !== marcaRemota) {
        señal('⚠ Alguien más guardó cambios. Recarga la página antes de seguir, o perderás su trabajo o el tuyo.', true);
        publicando = false;
        return;
      }
      return fetch(REST + '?on_conflict=clave', {
        method: 'POST',
        headers: Object.assign({ Prefer: 'resolution=merge-duplicates,return=representation' }, H),
        body: JSON.stringify({ clave: CLAVE, valor: valor }),
      }).then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw new Error(t || ('HTTP ' + r.status)); });
        return r.json();
      }).then(function (filas) {
        if (filas && filas[0]) marcaRemota = filas[0].actualizado;
        señal('✓ Guardado para el equipo');
        publicando = false;
      });
    }).catch(function (e) {
      publicando = false;
      señal('Sin conexión: tus cambios están solo en este navegador', true);
    });
  }

  /* ── Aplicar lo que trajimos y repintar ─────────────────────── */
  function aplicar(fila) {
    if (!fila) return false;
    try { localStorage.setItem(LOCAL, JSON.stringify(fila.valor)); } catch (e) { return false; }
    marcaRemota = fila.actualizado;
    if (typeof load === 'function') load();
    if (typeof refreshAll === 'function') refreshAll();
    return true;
  }

  /* ── Envolver persist() para que además publique ────────────── */
  function engancharPersist() {
    if (typeof window.persist !== 'function' || window.persist.__compartido) return false;
    var original = window.persist;
    function persistCompartido() {
      var r = original.apply(this, arguments);
      clearTimeout(temporizador);
      temporizador = setTimeout(publicar, ESPERA);
      return r;
    }
    persistCompartido.__compartido = true;
    window.persist = persistCompartido;
    return true;
  }

  /* ── Aviso arriba a la derecha ──────────────────────────────── */
  var caja;
  function señal(texto, alerta) {
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
    if (!engancharPersist()) {
      // La app aún no definió persist(): reintentamos en el próximo tick.
      return setTimeout(iniciar, 300);
    }
    traer().then(function (fila) {
      if (fila) {
        aplicar(fila);
        señal('✓ Cargado lo del equipo');
      } else {
        // Nadie ha publicado todavía: subimos lo que haya en este navegador
        // para que el equipo arranque con algo.
        publicar();
      }
    }).catch(function () {
      señal('Sin conexión: trabajando solo en este navegador', true);
    });

    setInterval(function () {
      if (publicando) return;
      traer().then(function (fila) {
        if (fila && fila.actualizado !== marcaRemota) {
          aplicar(fila);
          señal('✓ Actualizado con los cambios del equipo');
        }
      }).catch(function () {});
    }, SONDEO);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
