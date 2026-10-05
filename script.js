(function () {
  "use strict";

  var WORD = "Próximamente";
  // Fotos reales de obra provistas por la clienta, en el orden que ella
  // definio (empezando por la cocina).
  var PHOTOS = [
    "obra-01-cocina.jpg",
    "obra-02-luz-sombra.jpg",
    "obra-03-living.jpg",
    "obra-04-jardin.jpg",
    "obra-05-bano.jpg",
    "obra-06-losa-obra.jpg",
    "obra-07-pozo-hormigon.jpg",
    "obra-08-estructura-hormigon.jpg"
  ];
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var proxText = document.getElementById("proxText");
  var loader = document.getElementById("loader");
  var logoWrap = document.getElementById("logoWrap");
  var logoWordmark = document.getElementById("logoWordmark");
  var blueprintSvg = document.getElementById("blueprintLines");
  var hero = document.getElementById("hero");
  var parenRow = document.getElementById("parenRow");
  var contact = document.getElementById("contact");
  var contactCta = document.querySelector(".contact-cta");

  // el texto completo ocupa su lugar desde el principio (invisible) asi el
  // bloque no crece ni empuja lo de abajo mientras se tipea
  function typeText(el, text, step) {
    var typed = document.createElement("span");
    var rest = document.createElement("span");
    rest.style.visibility = "hidden";
    el.textContent = "";
    el.appendChild(typed);
    el.appendChild(rest);
    var i = 0;
    (function next() {
      typed.textContent = text.slice(0, i);
      rest.textContent = text.slice(i);
      if (i < text.length) {
        i++;
        setTimeout(next, step);
      }
    })();
  }

  // Grilla de lineas "plano tecnico": coordenadas extraidas por deteccion
  // automatica de pixeles rojos (OpenCV, columna/fila para las rectas y
  // Hough transform para las diagonales) directamente sobre las imagenes
  // de referencia LOGO LOADING ortogonales.png / diagonales.png (1674x1647)
  // que paso la clienta -- no son valores a ojo.
  var LOGO_REF_W = 1674, LOGO_REF_H = 1647;

  var REAL_X_EDGES = [431, 512, 598, 614, 679, 687, 799, 808, 862, 939, 1187, 1240];
  var REAL_Y_EDGES = [588, 661, 671, 731, 742, 851, 879, 929, 995, 1057];

  // Las 5 diagonales reales de la referencia, como segmento (dos puntos)
  // en vez de angulo+punto -- asi la pendiente sale exacta de la imagen,
  // sin estimar grados a ojo. Medidas con cortes verticales en varios x
  // (no solo deteccion Hough) porque dos de ellas pasan a solo ~11px de
  // distancia entre si (el par casi paralelo que traza el corte diagonal
  // de la pieza chica del isotipo) y una fusion por angulo las confundia
  // en una sola linea.
  var REAL_DIAGONAL_SEGMENTS = [
    { x1: 50, y1: 468.5, x2: 900, y2: 1422.5 },
    { x1: 50, y1: 592.5, x2: 1650, y2: 1581.5 },
    { x1: 50, y1: 922.5, x2: 1300, y2: 157.5 },
    { x1: 50, y1: 1093.5, x2: 1650, y2: 172.5 },
    { x1: 50, y1: 1104.5, x2: 1650, y2: 183.5 }
  ];

  var LINES = REAL_X_EDGES.map(function (x) {
    return { fx: x / LOGO_REF_W, fy: 0.5, ux: 0, uy: 1 };
  }).concat(REAL_Y_EDGES.map(function (y) {
    return { fx: 0.5, fy: y / LOGO_REF_H, ux: 1, uy: 0 };
  })).concat(REAL_DIAGONAL_SEGMENTS.map(function (d) {
    return {
      fx: (d.x1 + d.x2) / 2 / LOGO_REF_W,
      fy: (d.y1 + d.y2) / 2 / LOGO_REF_H,
      // direccion sin normalizar en fraccion de ancho/alto -- se escala a
      // pixeles reales del rect en pantalla en setupBlueprintLines, para
      // que la pendiente se mantenga correcta sea cual sea el tamano final
      fdx: (d.x2 - d.x1) / LOGO_REF_W,
      fdy: (d.y2 - d.y1) / LOGO_REF_H
    };
  }));

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function waitForLayout() {
    return new Promise(function (resolve) {
      function check() {
        if (window.innerWidth > 0 && window.innerHeight > 0 && logoWrap.getBoundingClientRect().width > 0) {
          resolve();
        } else {
          requestAnimationFrame(check);
        }
      }
      check();
    });
  }

  function setupBlueprintLines() {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    blueprintSvg.setAttribute("viewBox", "0 0 " + vw + " " + vh);
    blueprintSvg.innerHTML = "";

    var rect = logoWrap.getBoundingClientRect();
    var length = Math.hypot(vw, vh) * 0.7;
    var lines = [];

    LINES.forEach(function (def) {
      var px = rect.left + def.fx * rect.width;
      var py = rect.top + def.fy * rect.height;

      // direccion unitaria: las rectas ya la traen fija (0,1)/(1,0); las
      // diagonales la traen como fraccion de ancho/alto del isotipo y hay
      // que escalarla al tamano real en pantalla antes de normalizar, para
      // que la pendiente no se deforme si el logo no es perfectamente
      // cuadrado en su bounding box renderizado.
      var ux = def.ux, uy = def.uy;
      if (ux === undefined) {
        var ddx = def.fdx * rect.width;
        var ddy = def.fdy * rect.height;
        var dlen = Math.hypot(ddx, ddy);
        ux = ddx / dlen;
        uy = ddy / dlen;
      }

      var x1 = px - ux * length;
      var y1 = py - uy * length;
      var x2 = px + ux * length;
      var y2 = py + uy * length;

      // largo exacto calculado (2 * length), sin consultar el DOM -- asi el
      // dasharray/dashoffset se fija ANTES de insertar la linea y nunca hay
      // un frame donde se vea la linea completa sin animar (flash al entrar)
      var segLen = length * 2;

      var line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", x1);
      line.setAttribute("y1", y1);
      line.setAttribute("x2", x2);
      line.setAttribute("y2", y2);
      line.style.strokeDasharray = segLen;
      line.style.strokeDashoffset = segLen;
      blueprintSvg.appendChild(line);
      lines.push(line);
    });

    return lines;
  }

  // pausa extra entre cada grupo de lineas, para que se note que primero se
  // dibujan las verticales, despues las horizontales y despues las
  // diagonales -- en vez de una sola tanda continua. Las diagonales son
  // solo 5 (contra 12 y 10 de las otras tandas), asi que con el mismo
  // intervalo por linea terminaban de aparecer casi de golpe -- llevan un
  // intervalo mas largo para que tambien se vean una por una.
  var GRID_GROUP_GAP = 280;
  var GRID_GROUP_SIZES = [REAL_X_EDGES.length, REAL_Y_EDGES.length, REAL_DIAGONAL_SEGMENTS.length];
  var GRID_GROUP_STEP = [16, 16, 70];
  var GRID_TOTAL_DELAY = GRID_GROUP_SIZES.reduce(function (sum, size, idx) { return sum + size * GRID_GROUP_STEP[idx]; }, 0)
    + (GRID_GROUP_SIZES.length - 1) * GRID_GROUP_GAP;

  function revealBlueprintLines(lines) {
    var i = 0;
    var t = 0;
    GRID_GROUP_SIZES.forEach(function (size, g) {
      var step = GRID_GROUP_STEP[g];
      for (var j = 0; j < size; j++) {
        (function (line, delay) {
          setTimeout(function () {
            line.style.strokeDashoffset = "0";
          }, delay);
        })(lines[i], t + j * step);
        i++;
      }
      t += size * step + GRID_GROUP_GAP;
    });
  }

  function buildWord() {
    var frag = document.createDocumentFragment();
    var oWindowEl = null;
    var oLetterEl = null;
    var allLetters = [];

    WORD.split("").forEach(function (ch) {
      var span = document.createElement("span");
      span.className = "letter";
      allLetters.push(span);

      if (ch === "ó" || ch === "Ó") {
        span.classList.add("letter-o");
        oLetterEl = span;

        // caracter invisible en flujo normal, solo para reservar el ancho/alto
        // -- usa la "o" SIN tilde a proposito, ver nota de mas abajo
        var sizer = document.createElement("span");
        sizer.className = "o-sizer";
        sizer.setAttribute("aria-hidden", "true");
        sizer.textContent = "o";
        span.appendChild(sizer);

        // la "o"/"O" con tilde no esta en la fuente Demo del cliente: el
        // navegador arma una version compuesta con la tilde de la fuente de
        // respaldo, que queda desproporcionada (~40% mas alta) y desalineada
        // con el resto del cartel. En vez de depender de esa composicion,
        // se dibuja la "o" (o "O" por el text-transform:uppercase) real de
        // Degular -- identica a la de las demas letras -- y la tilde se
        // agrega aparte como una barrita en CSS (.o-accent).
        ["o-glyph-half o-glyph-half-l", "o-glyph-half o-glyph-half-r"].forEach(function (cls) {
          var half = document.createElement("span");
          half.className = cls;
          half.setAttribute("aria-hidden", "true");
          var text = document.createElement("span");
          text.className = "o-glyph-text";
          text.textContent = "o";
          half.appendChild(text);
          span.appendChild(half);
        });

        var accent = document.createElement("span");
        accent.className = "o-accent";
        accent.setAttribute("aria-hidden", "true");
        span.appendChild(accent);

        var cutLine = document.createElement("span");
        cutLine.className = "o-cut-line";
        cutLine.setAttribute("aria-hidden", "true");
        span.appendChild(cutLine);

        var win = document.createElement("span");
        win.className = "photo-window";
        win.setAttribute("aria-hidden", "true");
        PHOTOS.forEach(function (fileName) {
          var img = document.createElement("img");
          img.src = "assets_fotos_obra/" + fileName;
          img.alt = "";
          img.loading = "eager";
          win.appendChild(img);
        });
        span.appendChild(win);
        oWindowEl = win;
      } else {
        span.textContent = ch;
      }
      frag.appendChild(span);
    });

    // letras antes/despues de la o, para que se separen cuando se abren las fotos
    var oIndex = allLetters.indexOf(oLetterEl);
    allLetters.forEach(function (span, i) {
      if (i < oIndex) { span.classList.add("pre-o"); }
      else if (i > oIndex) { span.classList.add("post-o"); }
    });

    return { oWindowEl: oWindowEl, letters: allLetters };
  }

  async function runPhotoCycle(windowEl) {
    var imgs = windowEl.querySelectorAll("img");
    var letterO = windowEl.closest(".letter-o");
    var splitEls = document.querySelectorAll(".pre-o, .post-o");

    // 1) aparece el corte al medio de la o -- la palabra sigue completa
    letterO.classList.add("is-cutting");
    await sleep(500);

    // 2) recien ahi se "parte": el texto (y los parentesis) se abren a los
    // costados y se abre la ventana de fotos (rectangular vertical)
    splitEls.forEach(function (l) { l.classList.add("is-split"); });
    letterO.classList.add("is-split");
    parenRow.classList.add("is-split");
    windowEl.classList.add("is-open");
    await sleep(750);

    for (var i = 0; i < imgs.length; i++) {
      imgs.forEach(function (im) { im.classList.remove("is-active"); });
      imgs[i].classList.add("is-active");
      await sleep(650);
    }
    imgs.forEach(function (im) { im.classList.remove("is-active"); });

    // se cierra en orden inverso: la ventana se achica, el texto vuelve a
    // su lugar y por ultimo desaparece la linea de corte
    windowEl.classList.remove("is-open");
    letterO.classList.remove("is-split");
    parenRow.classList.remove("is-split");
    splitEls.forEach(function (l) { l.classList.remove("is-split"); });
    await sleep(450);
    letterO.classList.remove("is-cutting");
    await sleep(350);
  }

  async function photoLoop(windowEl) {
    while (true) {
      await runPhotoCycle(windowEl);
      await sleep(1800);
    }
  }

  // piezas del isotipo (isotipo-loading.svg) de izquierda a derecha: cada una
  // dibuja su contorno y despues se pinta de amarillo
  function loadPieces() {
    return fetch("isotipo-loading.svg")
      .then(function (r) { return r.text(); })
      .then(function (txt) {
        var doc = new DOMParser().parseFromString(txt, "image/svg+xml");
        var svg = document.importNode(doc.documentElement, true);
        svg.setAttribute("class", "isotipo-piezas");
        svg.setAttribute("aria-hidden", "true");
        logoWrap.insertBefore(svg, logoWrap.firstChild);
        return Array.prototype.slice.call(svg.querySelectorAll("path"));
      });
  }

  // velocidad de dibujo (px del svg por ms) y duracion del relleno, una por
  // pieza, de izquierda a derecha
  var PIECE_SPEED = [0.9, 0.9, 0.9, 0.9, 1.82];
  var PIECE_FILL = [900, 900, 900, 900, 450];
  // a que porcentaje del trazo empieza el relleno (1 = al terminar el trazo)
  var PIECE_FILL_AT = [1, 1, 1, 1, 0.85];

  function drawPieces(paths) {
    var lens = paths.map(function (p) { return p.getTotalLength(); });
    var start = 0;
    var lastDrawEnd = 0;
    return new Promise(function (resolve) {
      paths.forEach(function (p, i) {
        var draw = lens[i] / PIECE_SPEED[i];
        p.style.transition = "stroke-dashoffset " + Math.round(draw) + "ms linear, fill " + PIECE_FILL[i] + "ms ease, stroke " + PIECE_FILL[i] + "ms ease";
        setTimeout(function () { p.classList.add("drawn"); }, start);
        setTimeout(function () { p.classList.add("filled"); }, start + draw * PIECE_FILL_AT[i]);
        lastDrawEnd = Math.max(lastDrawEnd, start + draw);
        start += draw * 0.6;
      });
      setTimeout(resolve, lastDrawEnd);
    });
  }

  async function runSequence() {
    var built = buildWord();
    var oWindowEl = built.oWindowEl;
    var letters = built.letters;
    await waitForLayout();
    var lines = setupBlueprintLines();

    if (reducedMotion) {
      logoWordmark.classList.add("revealed");
      logoWrap.classList.add("is-wordmark-only");
      blueprintSvg.classList.add("is-faded");
      loader.classList.add("is-shrunk", "is-transparent");
      hero.classList.add("is-visible");
      parenRow.classList.add("is-open");
      letters.forEach(function (l) { proxText.appendChild(l); l.classList.add("is-in"); });
      contact.classList.add("is-visible");
      loadPieces().then(function (paths) {
        paths.forEach(function (p) { p.classList.add("drawn", "filled"); });
      });
      return;
    }

    // 1) primero se dibuja toda la grilla de fondo, sola
    await sleep(300);
    revealBlueprintLines(lines);

    // 2) recien ahi se traza el contorno del logo (lineas finas) -- solo una
    // pausa corta despues de que termina de armarse la grilla (con sus 3
    // tandas: verticales, horizontales, diagonales), no hace falta dejarla
    // mucho tiempo sola antes de arrancar el trazo del logo
    await sleep(GRID_TOTAL_DELAY + 400);
    var paths = await loadPieces();
    await drawPieces(paths);

    blueprintSvg.classList.add("is-faded");

    await sleep(600);
    loader.classList.add("is-shrunk");

    await sleep(1100);
    loader.classList.add("is-transparent");

    await sleep(300);
    hero.classList.add("is-visible");

    // el wordmark "BELFAST / Construction Management" (a la distancia real
    // medida sobre el logo del cliente) aparece recien en la pantalla de
    // "Proximamente", no apenas el logo sube -- no antes
    logoWordmark.classList.add("revealed");
    logoWrap.classList.add("is-wordmark-only");

    await sleep(200);
    parenRow.classList.add("is-open");

    // los parentesis terminan de entrar juntitos ("()", sin texto todavia
    // adentro) a los .7s (ver transition en .paren) y se quedan quietos asi
    // un toque mas antes de que arranque a tipearse "Proximamente" en medio
    await sleep(700 + 1000);
    // tipeo: cada letra aparece de golpe, una tras otra, sin desplazarse
    var TYPE_STEP = 90;
    letters.forEach(function (l, i) {
      setTimeout(function () {
        proxText.appendChild(l);
        l.classList.add("is-in");
      }, i * TYPE_STEP);
    });

    await sleep(letters.length * TYPE_STEP + 500);
    contact.classList.add("is-visible");
    typeText(contactCta, "Contactanos", 90);

    await sleep(500);
    if (oWindowEl) {
      photoLoop(oWindowEl);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runSequence);
  } else {
    runSequence();
  }
})();
