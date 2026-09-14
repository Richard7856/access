/* ═══════════════════════════════════════════════════════════════
   Llave de persona y catálogo de reclutadores (fase 0).

   Cada pantalla inventa su propio id, así que el único cruce
   confiable entre ellas es:
     1) el TELÉFONO a 10 dígitos (la llave de verdad, invisible), y
     2) el NOMBRE normalizado como respaldo — que es lo que el
        equipo ve y escribe, igual que siempre.

   Estas funciones las usa la Central de candidatos hoy y las usarán
   los puentes de las fases 2 y 3. Nada aquí escribe en la base.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* Mayúsculas, sin acentos, un solo espacio. "José  Pérez " → "JOSE PEREZ" */
  function normalizarNombre(s) {
    return String(s || '')
      .toUpperCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-ZÑ0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* Los últimos 10 dígitos: quita +52, 044, espacios, guiones…
     Devuelve '' si no alcanza para un número real. */
  function llaveTelefono(t) {
    var d = String(t == null ? '' : t).replace(/\D/g, '');
    if (d.length > 10) d = d.slice(-10);
    return d.length === 10 ? d : '';
  }

  /* La llave con la que se agrupa a una persona: teléfono si hay,
     nombre normalizado si no. El prefijo evita que un teléfono y un
     nombre puedan chocar entre sí. */
  function llavePersona(nombre, telefono) {
    var t = llaveTelefono(telefono);
    if (t) return 't:' + t;
    var n = normalizarNombre(nombre);
    return n ? 'n:' + n : '';
  }

  /* ── Catálogo de reclutadores ─────────────────────────────────
     La fila compartida `catalogo:reclutadores` es la fuente; esta
     copia solo entra si la red falla. Cada pantalla escribe al
     reclutador distinto ("Jose", "JOSE EDUARDO"…): los alias los
     traducen todos al mismo. */
  var CATALOGO_LOCAL = [
    { id: 'valentina', nombre: 'Valentina', completo: 'Valeria Valentina', alias: ['valentina', 'valeria valentina', 'valeria', 'vale'], color: '#7C5CBF' },
    { id: 'sharon', nombre: 'Sharon', completo: 'Sharon Naomy', alias: ['sharon', 'sharon naomy'], color: '#D9662E' },
    { id: 'arely', nombre: 'Arely', completo: 'Arely Guadalupe', alias: ['arely', 'arely guadalupe'], color: '#2E86C1' },
    { id: 'david', nombre: 'David', completo: 'David', alias: ['david'], color: '#1F7A4D' },
    { id: 'jose', nombre: 'Jose', completo: 'Jose Eduardo', alias: ['jose', 'jose eduardo'], color: '#B8860B' },
    { id: 'sandra', nombre: 'Sandra', completo: 'Sandra Irasema', alias: ['sandra', 'sandra irasema'], color: '#C2185B' },
    { id: 'free', nombre: 'Sin asignar', completo: 'Sin asignar', alias: ['free', 'sin asignar', 'sin reclutador'], color: '#5B6B63' },
  ];

  /* Devuelve la entrada del catálogo para lo que sea que venga
     escrito ("JOSE EDUARDO", "jose", "Jose Eduardo P.")… o null. */
  function resolverReclutador(catalogo, texto) {
    var lista = (catalogo && catalogo.length ? catalogo : CATALOGO_LOCAL);
    var n = normalizarNombre(texto);
    if (!n) return null;
    for (var i = 0; i < lista.length; i++) {
      var r = lista[i];
      var alias = (r.alias || []).map(normalizarNombre);
      if (alias.indexOf(n) >= 0 || normalizarNombre(r.nombre) === n || normalizarNombre(r.completo) === n) return r;
    }
    /* Si empieza con el primer nombre de alguien del catálogo
       ("SANDRA IRASEMA G." → Sandra), también cuenta. */
    var primera = n.split(' ')[0];
    for (var j = 0; j < lista.length; j++) {
      if (normalizarNombre(lista[j].nombre) === primera) return lista[j];
    }
    return null;
  }

  window.Persona = {
    normalizarNombre: normalizarNombre,
    llaveTelefono: llaveTelefono,
    llavePersona: llavePersona,
    resolverReclutador: resolverReclutador,
    CATALOGO_LOCAL: CATALOGO_LOCAL,
  };
})();
