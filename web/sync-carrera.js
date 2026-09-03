/* ═══════════════════════════════════════════════════════════════
   Hace que la Gran Carrera tenga memoria y sea del equipo.

   Toda la carrera se deriva de un solo arreglo: `records`. El
   marcador, la clasificación y hasta el escenario salen de ahí con
   useMemo, así que sincronizando ese arreglo se sincroniza todo.

     · al abrir      → baja las altas del equipo
     · al registrar  → las publica (con un respiro de 0.8 s)
     · cada 15 s     → trae lo que hayan registrado otros

   Las altas se UNEN por id, no se reemplazan: si dos personas
   registran a la vez, no se pierde ninguna. Lo que se borra a
   propósito se recuerda, para que no reaparezca en la siguiente
   unión.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  var CFG = { url: 'https://yilqentsmibgnzphztxc.supabase.co', key: 'sb_publishable_wor2_sfD-Lmw3b6WUNXGSw_oT2SAoXe' };
  var CLAVE = 'carrera:registros';
  var ESPERA = 800;
  var SONDEO = 15000;

  var REST = CFG.url + '/rest/v1/despacho_estado';
  var H = { apikey: CFG.key, Authorization: 'Bearer ' + CFG.key, 'Content-Type': 'application/json' };

  function traer() {
    return fetch(REST + '?select=valor,actualizado&clave=eq.' + encodeURIComponent(CLAVE), { headers: H })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (f) { return f && f.length ? f[0] : null; });
  }

  function guardar(lista) {
    return fetch(REST + '?on_conflict=clave', {
      method: 'POST',
      headers: Object.assign({ Prefer: 'resolution=merge-duplicates,return=representation' }, H),
      body: JSON.stringify({ clave: CLAVE, valor: lista }),
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(t || ('HTTP ' + r.status)); });
      return r.json();
    });
  }

  function firma(lista) { return (lista || []).map(function (r) { return r.id; }).join(','); }

  /* Une dos listas por id, quita lo borrado a propósito y deja las
     altas más recientes arriba, como las ordena la app. */
  function unir(a, b, borrados) {
    var vistos = {}, salida = [];
    (a || []).concat(b || []).forEach(function (r) {
      if (!r || !r.id || vistos[r.id] || borrados[r.id]) return;
      vistos[r.id] = true;
      salida.push(r);
    });
    return salida.sort(function (x, y) { return (y.timestamp || 0) - (x.timestamp || 0); });
  }

  /* ── Aviso arriba a la derecha ──────────────────────────────── */
  var caja;
  function señal(texto, alerta) {
    if (!caja) {
      caja = document.createElement('div');
      caja.style.cssText = 'position:fixed;right:14px;top:52px;z-index:99999;max-width:320px;' +
        'font:13px system-ui,sans-serif;padding:8px 13px;border-radius:7px;' +
        'box-shadow:0 4px 14px rgba(0,0,0,.18);transition:opacity .3s';
      document.body.appendChild(caja);
    }
    caja.style.background = alerta ? '#FBEAE8' : '#E7F4EC';
    caja.style.color = alerta ? '#B3261E' : '#1F7A4D';
    caja.style.border = '1px solid ' + (alerta ? '#f0c4c0' : '#b9e0c9');
    caja.textContent = texto;
    caja.style.opacity = '1';
    clearTimeout(caja._t);
    if (!alerta) caja._t = setTimeout(function () { caja.style.opacity = '0'; }, 2200);
  }

  /* ── El enganche que usa el componente ──────────────────────── */
  window.useSincronizacionCarrera = function (records, setRecords) {
    var useEffect = React.useEffect, useRef = React.useRef;
    var cargado = useRef(false);
    var marca = useRef(null);
    var borrados = useRef({});
    var previos = useRef('');
    var publicando = useRef(false);
    var temporizador = useRef(null);

    function aplicar(lista) {
      previos.current = firma(lista);
      setRecords(lista);
    }

    /* 1 · al abrir, bajar lo del equipo */
    useEffect(function () {
      traer().then(function (fila) {
        var lista = (fila && Array.isArray(fila.valor)) ? fila.valor : [];
        marca.current = fila ? fila.actualizado : null;
        cargado.current = true;
        if (lista.length) { aplicar(lista); señal('✓ Carrera del equipo cargada'); }
        else previos.current = firma(records);
      }).catch(function () {
        cargado.current = true;
        señal('Sin conexión: la carrera no se está guardando', true);
      });
    }, []);

    /* 2 · al cambiar las altas, publicarlas */
    useEffect(function () {
      if (!cargado.current) return;
      if (firma(records) === previos.current) return;   // fue un cambio que ya veníamos de aplicar

      // Lo que estaba y ya no está, se borró a propósito: que no vuelva.
      var ahora = {};
      records.forEach(function (r) { ahora[r.id] = true; });
      previos.current.split(',').forEach(function (id) {
        if (id && !ahora[id]) borrados.current[id] = true;
      });

      clearTimeout(temporizador.current);
      temporizador.current = setTimeout(function () {
        publicando.current = true;
        traer().then(function (fila) {
          var remoto = (fila && Array.isArray(fila.valor)) ? fila.valor : [];
          var union = unir(records, remoto, borrados.current);
          return guardar(union).then(function (filas) {
            if (filas && filas[0]) marca.current = filas[0].actualizado;
            if (firma(union) !== firma(records)) aplicar(union);
            else previos.current = firma(union);
            señal('✓ Guardado para el equipo');
          });
        }).catch(function () {
          señal('No se pudo guardar: revisa tu conexión', true);
        }).then(function () { publicando.current = false; });
      }, ESPERA);
    }, [records]);

    /* 3 · cada tanto, traer lo de los demás */
    useEffect(function () {
      var id = setInterval(function () {
        if (publicando.current) return;
        traer().then(function (fila) {
          if (!fila || fila.actualizado === marca.current) return;
          marca.current = fila.actualizado;
          var remoto = Array.isArray(fila.valor) ? fila.valor : [];
          var union = unir(remoto, [], borrados.current);
          if (firma(union) !== previos.current) {
            aplicar(union);
            señal('✓ Actualizado con las altas del equipo');
          }
        }).catch(function () {});
      }, SONDEO);
      return function () { clearInterval(id); };
    }, []);
  };

  /* ═══ Salón de la Fama y archivo mensual (fila carrera:extras) ═══
     Cajas nuevas de la v13: "Cerrar mes" archiva el periodo y corona
     al campeón/a, pero el hook de records no las alcanza — sin esto,
     el historial de la casa viviría solo en el navegador de quien
     cierra el mes. build.py inserta este hook junto a sus estados.

     La unión es sencilla porque casi todo son agregados:
       · Salón de la Fama → por mes (lo local pisa su propio mes)
       · archivo mensual  → por clave (cada cierre trae marca de
         tiempo propia, así que nunca chocan)                        */
  var CLAVE_EXTRAS = 'carrera:extras';

  function traerExtras() {
    return fetch(REST + '?select=valor,actualizado&clave=eq.' + encodeURIComponent(CLAVE_EXTRAS), { headers: H })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (f) { return f && f.length ? f[0] : null; });
  }

  function guardarExtras(valor) {
    return fetch(REST + '?on_conflict=clave', {
      method: 'POST',
      headers: Object.assign({ Prefer: 'resolution=merge-duplicates,return=representation' }, H),
      body: JSON.stringify({ clave: CLAVE_EXTRAS, valor: valor }),
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(t || ('HTTP ' + r.status)); });
      return r.json();
    });
  }

  window.useSincronizacionExtrasCarrera = function (hall, setHall, archivo, setArchivo) {
    var useEffect = React.useEffect, useRef = React.useRef;
    var cargado = useRef(false);
    var marca = useRef(null);
    var publicando = useRef(false);
    var temporizador = useRef(null);
    var previos = useRef('');

    function unirHall(local, remoto) {
      var porMes = {};
      (remoto || []).forEach(function (e) { if (e && e.month) porMes[e.month] = e; });
      (local || []).forEach(function (e) { if (e && e.month) porMes[e.month] = e; });
      return Object.keys(porMes).map(function (m) { return porMes[m]; });
    }
    function unirArchivo(local, remoto) { return Object.assign({}, remoto || {}, local || {}); }
    function firmaDe(h, a) { return JSON.stringify([h, a]); }

    /* 1 · al abrir, unir lo del equipo con lo local */
    useEffect(function () {
      traerExtras().then(function (fila) {
        marca.current = fila ? fila.actualizado : null;
        var v = (fila && fila.valor) || {};
        var h = unirHall(hall, v.hall);
        var a = unirArchivo(archivo, v.archivo);
        previos.current = firmaDe(h, a);
        cargado.current = true;
        setHall(h);
        setArchivo(a);
      }).catch(function () {
        previos.current = firmaDe(hall, archivo);
        cargado.current = true;
      });
    }, []);

    /* 2 · al cambiar (cerrar un mes), unir con lo remoto y publicar */
    useEffect(function () {
      if (!cargado.current) return;
      if (firmaDe(hall, archivo) === previos.current) return;
      clearTimeout(temporizador.current);
      temporizador.current = setTimeout(function () {
        publicando.current = true;
        traerExtras().then(function (fila) {
          var v = (fila && fila.valor) || {};
          var h = unirHall(hall, v.hall);
          var a = unirArchivo(archivo, v.archivo);
          return guardarExtras({ hall: h, archivo: a }).then(function (filas) {
            if (filas && filas[0]) marca.current = filas[0].actualizado;
            previos.current = firmaDe(h, a);
            if (firmaDe(hall, archivo) !== previos.current) { setHall(h); setArchivo(a); }
            señal('✓ Salón de la Fama guardado para el equipo');
          });
        }).catch(function () {
          señal('No se pudo guardar el Salón de la Fama: revisa tu conexión', true);
        }).then(function () { publicando.current = false; });
      }, ESPERA);
    }, [hall, archivo]);

    /* 3 · cada tanto, traer coronaciones de otros (cambian poco) */
    useEffect(function () {
      var id = setInterval(function () {
        if (publicando.current || !cargado.current) return;
        traerExtras().then(function (fila) {
          if (!fila || fila.actualizado === marca.current) return;
          marca.current = fila.actualizado;
          var v = fila.valor || {};
          var h = unirHall([], v.hall);
          var a = unirArchivo({}, v.archivo);
          if (firmaDe(h, a) !== previos.current) {
            previos.current = firmaDe(h, a);
            setHall(h);
            setArchivo(a);
          }
        }).catch(function () {});
      }, SONDEO * 2);
      return function () { clearInterval(id); };
    }, []);
  };
})();
