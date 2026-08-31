// history-hero-40.js — mesma física de partículas do preloader da home
// (js/preloader.js: mesmos dados em js/shape-40-data.js, mesmo funil de
// formação, jitter e "respiração", mesmo hover que espalha e relaxa),
// só que contida ao gráfico da dobra 1 da página História em vez de tela
// cheia, sem a coreografia de intro/CTA/dismiss (aqui a forma não é
// dispensada, é decoração permanente) e em grafite (fundo branco) em vez
// de branco (fundo escuro do preloader). Qualquer tunável de física novo
// aqui deve ser copiado de volta pro preloader se fizer sentido lá também.
(function () {
  'use strict';

  var canvas = document.getElementById('historyHero40');
  if (!canvas) return;

  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Tunáveis (mesmos valores do preloader — ver js/preloader.js) -------
  var MAX_DPR          = 2;
  var INFLUENCE_RADIUS = 165;
  var HOVER_GAIN       = 3.2;
  var OFFSET_DECAY     = 0.975;
  var MAX_OFFSET       = 340;
  var NUMERAL_FILL     = 0.86; // maior que o preloader (0.56): aqui não sobra espaço reservado pra CTA
  var BREATHE_AMOUNT   = 0.018;
  var BREATHE_SPEED    = (Math.PI * 2) / 4.5;
  var FUNNEL_SPREAD    = 0.62;
  var FUNNEL_DEPTH     = 0.4;
  var TWO_PI           = Math.PI * 2;

  var DPR = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  var W = 0, H = 0, centerX = 0, centerY = 0;

  var count = 0;
  var normX, normY, normR, tx, ty, rad, ox, oy, delay, dur, phase, speed, amp, pushAngle, offX, offY;

  var formStart = 0;
  var rafId = null;
  var maxFormTime = 0;
  var formationDone = false;
  var fillColor = '#2e2e30';

  var pointer = { x: -9999, y: -9999, active: false };
  var pointerSX = 0, pointerSY = 0, pointerHasPos = false;
  var pointerStrength = 0;

  function readGrafiteColor() {
    var v = getComputedStyle(document.documentElement).getPropertyValue('--ds-grafite-500').trim();
    return v || fillColor;
  }

  function easeOutCubic(t) {
    var f = t - 1;
    return f * f * f + 1;
  }

  function pointsToShape(flat) {
    var n = flat.length / 3;
    var nx = new Float32Array(n), ny = new Float32Array(n), nr = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      nx[i] = flat[i * 3]; ny[i] = flat[i * 3 + 1]; nr[i] = flat[i * 3 + 2];
    }
    return { nx: nx, ny: ny, nr: nr, n: n };
  }

  // Mesmo corte do preloader pra telas pequenas — ver js/preloader.js.
  function subsampleShape(shape, maxCount) {
    if (shape.n <= maxCount) return shape;
    var idx = new Array(shape.n);
    for (var i = 0; i < shape.n; i++) idx[i] = i;
    for (var i = 0; i < maxCount; i++) {
      var j = i + Math.floor(Math.random() * (shape.n - i));
      var tmp = idx[i]; idx[i] = idx[j]; idx[j] = tmp;
    }
    var nx = new Float32Array(maxCount), ny = new Float32Array(maxCount), nr = new Float32Array(maxCount);
    for (var k = 0; k < maxCount; k++) {
      var id = idx[k];
      nx[k] = shape.nx[id]; ny[k] = shape.ny[id]; nr[k] = shape.nr[id];
    }
    return { nx: nx, ny: ny, nr: nr, n: maxCount };
  }

  function initParticles(shape) {
    count = shape.n;
    normX = shape.nx; normY = shape.ny; normR = shape.nr;
    tx = new Float32Array(count); ty = new Float32Array(count); rad = new Float32Array(count);
    ox = new Float32Array(count); oy = new Float32Array(count);
    delay = new Float32Array(count); dur = new Float32Array(count);
    phase = new Float32Array(count); speed = new Float32Array(count); amp = new Float32Array(count);
    pushAngle = new Float32Array(count);
    offX = new Float32Array(count); offY = new Float32Array(count);

    for (var i = 0; i < count; i++) {
      delay[i] = Math.random() * 1.1;
      dur[i]   = 0.85 + Math.random() * 0.45;
      phase[i] = Math.random() * Math.PI * 2;
      speed[i] = 0.5 + Math.random() * 0.8;
      amp[i]   = 0.7 + Math.random() * 1.1;
      pushAngle[i] = Math.random() * Math.PI * 2;
      var finishAt = delay[i] + dur[i];
      if (finishAt > maxFormTime) maxFormTime = finishAt;
    }
    layout();
    scatterOrigins();
  }

  function layout() {
    centerX = W / 2; centerY = H / 2; // centralizado — sem CTA pra reservar espaço, ao contrário do preloader
    var fit = Math.min(W, H) * NUMERAL_FILL;
    for (var i = 0; i < count; i++) {
      tx[i] = centerX + normX[i] * fit;
      ty[i] = centerY + normY[i] * fit;
      rad[i] = normR[i] * fit;
    }
  }

  function scatterOrigins() {
    var fw = Math.max(W, H) * FUNNEL_SPREAD;
    var depth = H * FUNNEL_DEPTH;
    for (var i = 0; i < count; i++) {
      ox[i] = centerX + (Math.random() * 2 - 1) * fw;
      oy[i] = H + Math.random() * depth;
    }
  }

  function resize() {
    var rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    DPR = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (count) layout();
  }

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      resize();
      // Sem loop de rAF rodando nesse modo — sem isso o canvas ficaria em
      // branco após redimensionar (o backing store reseta no resize()).
      if (reduceMotion && formationDone) drawStatic();
    }, 120);
  }, { passive: true });

  function setPointer(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    pointer.x = clientX - rect.left;
    pointer.y = clientY - rect.top;
    pointer.active = true;
    maybeStart();
  }
  function clearPointer() { pointer.active = false; }

  function hasResidualOffset() {
    for (var i = 0; i < count; i++) {
      if (offX[i] !== 0 || offY[i] !== 0) return true;
    }
    return false;
  }
  function maybeStart() {
    if (rafId || reduceMotion) return;
    if (!formationDone || pointer.active || hasResidualOffset()) {
      rafId = requestAnimationFrame(frame);
    }
  }

  // prefers-reduced-motion: sem funil/jitter/respiração/hover — desenha a
  // forma já montada, uma vez só, parada (preloader nem chega a montar a
  // cortina nesse caso; aqui, diferente dele, é decoração de página, então
  // vale mostrar o "40" parado em vez de nada).
  function drawStatic() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = fillColor;
    ctx.beginPath();
    for (var i = 0; i < count; i++) {
      var r = rad[i];
      ctx.moveTo(tx[i] + r, ty[i]);
      ctx.arc(tx[i], ty[i], r, 0, TWO_PI);
    }
    ctx.fill();
  }

  // Escutado no canvas (não em window, ao contrário do preloader): ali a
  // cortina cobre a tela inteira, aqui é um elemento permanente convivendo
  // com o resto da página — hover em qualquer lugar da janela manteria os
  // 22 mil pontos recalculando à toa o tempo todo.
  canvas.addEventListener('mousemove', function (e) { setPointer(e.clientX, e.clientY); }, { passive: true });
  canvas.addEventListener('mouseleave', clearPointer, { passive: true });

  function frame(now) {
    var t = (now - formStart) / 1000;

    if (!pointer.active) {
      pointerHasPos = false;
    } else if (!pointerHasPos) {
      pointerSX = pointer.x; pointerSY = pointer.y; pointerHasPos = true;
    } else {
      pointerSX += (pointer.x - pointerSX) * 0.12;
      pointerSY += (pointer.y - pointerSY) * 0.12;
    }
    var want = pointer.active ? 1 : 0;
    pointerStrength += (want - pointerStrength) * 0.08;

    ctx.clearRect(0, 0, W, H);

    var usePointer = pointerStrength > 0.002;
    var anyOffset = false;

    ctx.fillStyle = fillColor;
    ctx.beginPath();
    for (var i = 0; i < count; i++) {
      var progress = (t - delay[i]) / dur[i];
      if (progress < 0) progress = 0; else if (progress > 1) progress = 1;
      var eased = easeOutCubic(progress);

      var jx = Math.sin(t * speed[i] + phase[i]) * amp[i] * eased;
      var jy = Math.cos(t * speed[i] * 1.3 + phase[i] * 1.7) * amp[i] * eased;

      var bx = ox[i] + (tx[i] - ox[i]) * eased + jx;
      var by = oy[i] + (ty[i] - oy[i]) * eased + jy;

      var breathe = 1 + Math.sin(t * BREATHE_SPEED) * BREATHE_AMOUNT * eased;
      bx = centerX + (bx - centerX) * breathe;
      by = centerY + (by - centerY) * breathe;

      var oxv = offX[i], oyv = offY[i];
      if (usePointer) {
        var ddx = bx - pointerSX, ddy = by - pointerSY;
        var ddist = Math.sqrt(ddx * ddx + ddy * ddy);
        if (ddist < INFLUENCE_RADIUS) {
          var falloff = 1 - ddist / INFLUENCE_RADIUS;
          falloff *= falloff;
          var gain = falloff * HOVER_GAIN * pointerStrength * eased;
          oxv += Math.cos(pushAngle[i]) * gain;
          oyv += Math.sin(pushAngle[i]) * gain;
        }
      }
      if (oxv !== 0 || oyv !== 0) {
        oxv *= OFFSET_DECAY; oyv *= OFFSET_DECAY;
        var offMag = Math.sqrt(oxv * oxv + oyv * oyv);
        if (offMag > MAX_OFFSET) { var s = MAX_OFFSET / offMag; oxv *= s; oyv *= s; }
        if (offMag < 0.02) { oxv = 0; oyv = 0; }
        offX[i] = oxv; offY[i] = oyv;
      }
      if (oxv !== 0 || oyv !== 0) anyOffset = true;

      var drawX = bx + oxv, drawY = by + oyv;
      var r = rad[i];
      ctx.moveTo(drawX + r, drawY);
      ctx.arc(drawX, drawY, r, 0, TWO_PI);
    }
    ctx.fill();

    if (!formationDone && t >= maxFormTime) formationDone = true;

    // Congela quando ocioso — ver mesmo comentário/motivo em js/preloader.js.
    if (!formationDone || usePointer || anyOffset) {
      rafId = requestAnimationFrame(frame);
    } else {
      rafId = null;
    }
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    } else {
      maybeStart();
    }
  });

  function boot() {
    try {
      fillColor = readGrafiteColor();
      resize();
      var shape = pointsToShape(window.SHAPE_40_POINTS);
      var smallViewport = Math.min(window.innerWidth, window.innerHeight) < 640;
      if (smallViewport) shape = subsampleShape(shape, 8000);
      initParticles(shape);
      if (reduceMotion) { formationDone = true; drawStatic(); return; }
      formStart = performance.now();
      rafId = requestAnimationFrame(frame);
    } catch (err) {
      // Sem dados/canvas utilizável — o gráfico fica só com o vídeo e as
      // barras (ver css/styles.css .history-hero-graphic), degrada bem.
    }
  }

  if (window.SHAPE_40_POINTS) {
    boot();
  } else {
    var waited = 0;
    var waitTimer = setInterval(function () {
      waited += 20;
      if (window.SHAPE_40_POINTS) {
        clearInterval(waitTimer);
        boot();
      } else if (waited >= 2000) {
        clearInterval(waitTimer);
      }
    }, 20);
  }
})();
