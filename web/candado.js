/* ═══════════════════════════════════════════════════════════════
   Candado de palabra clave para el Clasificador, el Seguimiento y
   la Carrera. Sin correos ni cuentas: UNA palabra clave del equipo.

   Funciona como la clave de /actualizar: la primera persona que abre
   la elige, se guarda como hash SHA-256 en despacho_estado (fila
   candado:paginas) y se verifica en el navegador. Una vez dentro, el
   navegador la recuerda (localStorage candado:ok) y no vuelve a
   pedirla — hasta que la palabra cambie.

   Es un CANDADO LIGERO, no seguridad real: se verifica del lado del
   cliente, así que alguien que sepa programar puede saltárselo, igual
   que antes podía leer los datos con la clave publicable. Sirve para
   lo que se pidió: que no entre cualquiera con el enlace.

   Si se olvida la palabra: borrar la fila candado:paginas de
   despacho_estado y la siguiente persona en abrir la vuelve a crear.

   Este script corre en el <head>, antes que la app: pinta el telón
   sobre <html> directamente (el <body> aún no existe) y no usa
   DOMContentLoaded a propósito — el sincronizador del Seguimiento
   intercepta ese registro y no hay que meterse en su camino.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  var CFG = { url: 'https://yilqentsmibgnzphztxc.supabase.co', key: 'sb_publishable_wor2_sfD-Lmw3b6WUNXGSw_oT2SAoXe' };
  var CLAVE = 'candado:paginas';    // fila con {hash} en despacho_estado
  var RECUERDO = 'candado:ok';      // el hash con el que este navegador entró

  var REST = CFG.url + '/rest/v1/despacho_estado';
  var H = { apikey: CFG.key, Authorization: 'Bearer ' + CFG.key, 'Content-Type': 'application/json' };

  function hash(texto) {
    var datos = new TextEncoder().encode('candado:' + texto);
    return crypto.subtle.digest('SHA-256', datos).then(function (buf) {
      return Array.from(new Uint8Array(buf)).map(function (b) {
        return b.toString(16).padStart(2, '0');
      }).join('');
    });
  }

  function traer() {
    return fetch(REST + '?select=valor&clave=eq.' + encodeURIComponent(CLAVE), { headers: H })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (f) { return f && f.length && f[0].valor ? f[0].valor : null; });
  }

  function guardarHash(h) {
    return fetch(REST + '?on_conflict=clave', {
      method: 'POST',
      headers: Object.assign({ Prefer: 'resolution=merge-duplicates,return=minimal' }, H),
      body: JSON.stringify({ clave: CLAVE, valor: { hash: h } }),
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(t || ('HTTP ' + r.status)); });
    });
  }

  function recordado() {
    try { return localStorage.getItem(RECUERDO); } catch (e) { return null; }
  }
  function recordar(h) {
    try { localStorage.setItem(RECUERDO, h); } catch (e) {}
  }

  /* ── El telón ───────────────────────────────────────────────── */
  var telon = null;
  function pintarTelon() {
    if (telon) return;
    telon = document.createElement('div');
    telon.id = 'candadoTelon';
    telon.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;background:#F4F6FA;' +
      'display:flex;align-items:center;justify-content:center;' +
      'font-family:Inter,system-ui,sans-serif;color:#1B1B3A';
    telon.innerHTML =
      '<div style="background:#fff;border:1px solid #dfe4ec;border-radius:12px;' +
      'box-shadow:0 10px 30px rgba(27,27,58,.12);padding:30px 28px;width:min(360px,88vw)">' +
      '<div style="font-size:26px;margin-bottom:6px">🔒</div>' +
      '<h1 style="font-size:17px;margin:0 0 4px;font-weight:700">AccessPack</h1>' +
      '<p id="candadoTexto" style="font-size:13.5px;color:#5a6172;margin:0 0 16px;line-height:1.45"></p>' +
      '<form id="candadoForm">' +
      '<input id="candadoPw" type="password" autocomplete="current-password" placeholder="Palabra clave" ' +
      'style="width:100%;box-sizing:border-box;font-size:16px;padding:10px 12px;border:1px solid #cdd4e0;border-radius:8px;margin-bottom:8px">' +
      '<input id="candadoPw2" type="password" autocomplete="new-password" placeholder="Repítela" ' +
      'style="display:none;width:100%;box-sizing:border-box;font-size:16px;padding:10px 12px;border:1px solid #cdd4e0;border-radius:8px;margin-bottom:8px">' +
      '<button type="submit" id="candadoBtn" style="width:100%;font-size:14.5px;font-weight:600;padding:10px 12px;border:0;' +
      'border-radius:8px;background:#1B6EF3;color:#fff;cursor:pointer">Entrar</button>' +
      '<p id="candadoError" style="font-size:12.5px;color:#B3261E;margin:10px 0 0;min-height:16px"></p>' +
      '</form></div>';
    document.documentElement.appendChild(telon);
  }
  function quitarTelon() {
    if (telon && telon.parentNode) telon.parentNode.removeChild(telon);
    telon = null;
  }
  function ver(id) { return document.getElementById(id); }
  function error(msg) { var e = ver('candadoError'); if (e) e.textContent = msg || ''; }

  function modoEntrar(hGuardado) {
    pintarTelon();
    ver('candadoTexto').textContent = 'Esta página es del equipo. Escribe la palabra clave para entrar.';
    ver('candadoPw2').style.display = 'none';
    ver('candadoBtn').textContent = 'Entrar';
    ver('candadoForm').onsubmit = function (ev) {
      ev.preventDefault();
      var valor = ver('candadoPw').value;
      if (!valor) return;
      hash(valor).then(function (h) {
        if (h === hGuardado) { recordar(h); quitarTelon(); }
        else { error('Palabra clave incorrecta.'); ver('candadoPw').value = ''; ver('candadoPw').focus(); }
      });
    };
    setTimeout(function () { var i = ver('candadoPw'); if (i) i.focus(); }, 50);
  }

  function modoCrear() {
    pintarTelon();
    ver('candadoTexto').textContent = 'Aún no hay palabra clave. Eres la primera persona en entrar: ' +
      'elígela aquí (mínimo 4 letras) y compártela con el equipo.';
    ver('candadoPw2').style.display = 'block';
    ver('candadoPw').placeholder = 'Nueva palabra clave';
    ver('candadoPw').autocomplete = 'new-password';
    ver('candadoBtn').textContent = 'Guardar y entrar';
    ver('candadoForm').onsubmit = function (ev) {
      ev.preventDefault();
      var v1 = ver('candadoPw').value, v2 = ver('candadoPw2').value;
      if ((v1 || '').length < 4) return error('Muy corta: mínimo 4 letras.');
      if (v1 !== v2) return error('Las dos no coinciden.');
      hash(v1).then(function (h) {
        return guardarHash(h).then(function () { recordar(h); quitarTelon(); });
      }).catch(function () { error('No se pudo guardar. Revisa tu conexión e intenta de nuevo.'); });
    };
    setTimeout(function () { var i = ver('candadoPw'); if (i) i.focus(); }, 50);
  }

  function modoSinConexion() {
    pintarTelon();
    ver('candadoTexto').textContent = 'No se pudo comprobar la palabra clave (sin conexión).';
    ver('candadoPw').style.display = 'none';
    ver('candadoPw2').style.display = 'none';
    ver('candadoBtn').textContent = 'Reintentar';
    ver('candadoForm').onsubmit = function (ev) { ev.preventDefault(); location.reload(); };
  }

  /* ── Arranque ───────────────────────────────────────────────── */
  var entradaPrevia = recordado();
  // Sin recuerdo, el telón se pinta ANTES de que cargue nada; con él,
  // se entra directo y solo se re-comprueba en segundo plano por si la
  // palabra cambió.
  if (!entradaPrevia) pintarTelon();

  traer().then(function (v) {
    if (!v || !v.hash) { modoCrear(); return; }
    if (entradaPrevia === v.hash) { quitarTelon(); return; }
    if (entradaPrevia) { try { localStorage.removeItem(RECUERDO); } catch (e) {} }
    modoEntrar(v.hash);
  }).catch(function () {
    // Sin internet: si este navegador ya había entrado, se le deja pasar
    // (la app de todos modos trabaja local sin conexión).
    if (entradaPrevia) { quitarTelon(); return; }
    modoSinConexion();
  });
})();
