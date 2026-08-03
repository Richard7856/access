/* ═══════════════════════════════════════════════════════════════
   Barra de navegación compartida por las cuatro herramientas.
   Se inyecta al inicio del <body>. Estilos propios y con prefijo
   apk- porque cada app tiene su propia paleta y no deben chocar.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  var SITIOS = [
    { url: '/',              nombre: 'Inicio',       icono: '⌂' },
    { url: '/despacho/',     nombre: 'Despacho',     icono: '🚚' },
    { url: '/torre/',        nombre: 'Torre',        icono: '📊' },
    { url: '/clasificador/', nombre: 'Clasificador', icono: '🗂' },
    { url: '/expedientes/',  nombre: 'Expedientes',  icono: '📁' },
    { url: '/analizador/',   nombre: 'Analizador',   icono: '📈' },
  ];

  var CSS =
    '.apk-nav{background:#0E141C;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
      'display:flex;align-items:center;gap:4px;flex-wrap:wrap;padding:7px 14px;border-bottom:1px solid #26303F}' +
    '.apk-nav-marca{color:#8FA3BF;font-size:11.5px;font-weight:700;letter-spacing:.9px;text-transform:uppercase;' +
      'margin-right:10px;white-space:nowrap}' +
    '.apk-nav a{color:#C3CEDD;text-decoration:none;font-size:13.5px;font-weight:500;padding:6px 11px;' +
      'border-radius:6px;white-space:nowrap;line-height:1.2;display:inline-flex;align-items:center;gap:6px;' +
      'transition:background .15s,color .15s}' +
    '.apk-nav a:hover{background:#1B2534;color:#fff}' +
    '.apk-nav a.apk-aqui{background:#1D5BD6;color:#fff;font-weight:600}' +
    '.apk-nav a.apk-aqui:hover{background:#1D5BD6}' +
    '.apk-nav-ico{font-size:13px;line-height:1}' +
    '@media(max-width:560px){.apk-nav-marca{width:100%;margin:0 0 4px}.apk-nav a{font-size:12.5px;padding:5px 9px}}';

  /* Cuál de los sitios es el actual: gana la ruta más específica
     para que "/" no se marque como activa en todas. */
  function rutaActual() {
    var p = location.pathname;
    var mejor = SITIOS[0], largo = 0;
    SITIOS.forEach(function (s) {
      if (s.url !== '/' && p.indexOf(s.url.slice(0, -1)) === 0 && s.url.length > largo) {
        mejor = s; largo = s.url.length;
      }
    });
    return mejor;
  }

  function pintar() {
    if (document.querySelector('.apk-nav')) return;
    var estilo = document.createElement('style');
    estilo.textContent = CSS;
    document.head.appendChild(estilo);

    var aqui = rutaActual();
    var nav = document.createElement('nav');
    nav.className = 'apk-nav';
    /* Algunas apps le ponen padding al <body> (el Clasificador usa 26/20px).
       Sin esto la barra quedaría flotando con un marco alrededor, en vez de
       pegada al borde. Se lee en tiempo real, así que sirve para cualquiera. */
    var cs = getComputedStyle(document.body);
    if (parseFloat(cs.paddingTop) || parseFloat(cs.paddingLeft)) {
      nav.style.margin = '-' + cs.paddingTop + ' -' + cs.paddingRight +
                         ' ' + cs.paddingTop + ' -' + cs.paddingLeft;
    }
    nav.innerHTML =
      '<span class="apk-nav-marca">AccessPack</span>' +
      SITIOS.map(function (s) {
        return '<a href="' + s.url + '"' + (s === aqui ? ' class="apk-aqui" aria-current="page"' : '') + '>' +
               '<span class="apk-nav-ico">' + s.icono + '</span>' + s.nombre + '</a>';
      }).join('');
    document.body.insertAdjacentElement('afterbegin', nav);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pintar);
  else pintar();
})();
