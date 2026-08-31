// preloader.js — protótipo isolado (só index-preloader.html referencia isso).
// Cortina fixa com o "40" em partículas (mesma técnica/dados do protótipo
// validado em _prototipos/particulas-40.html, incluindo o hover que espalha
// o granulado) + CTA "Saiba mais". Dispensa por clique no CTA ou no primeiro
// scroll/gesto — a cortina sobe (slide-up) revelando o hero real, que já
// existe embaixo na posição normal o tempo todo (não precisa reposicionar
// nada do hero em si). Ver skill pessoal `particle-stipple-formation`.
(function () {
  'use strict';

  var root = document.documentElement;
  if (!root.classList.contains('preloader-active')) return;

  function finish() {
    root.classList.remove('preloader-active');
    document.body.style.overflow = '';
    try { sessionStorage.setItem('preloaderSeen40', '1'); } catch (e) {}
    // Só agora o vídeo do hero deixa de estar coberto — é aqui que ele começa
    // a baixar, e não no load da página (ver startHeroVideo em js/main.js).
    if (typeof window.startHeroVideo === 'function') window.startHeroVideo();
  }

  var preloader = document.getElementById('preloader');
  var canvas = document.getElementById('preloaderCanvas');
  var cta = document.getElementById('preloaderCta');
  if (!preloader || !canvas || !cta) { finish(); return; }

  var ctx = canvas.getContext('2d'); // alpha: true (default) — deixa o grid de pontos do CSS aparecer embaixo
  if (!ctx) { finish(); return; }

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) { finish(); return; }

  document.body.style.overflow = 'hidden';

  // ---- Tunáveis (mesmos valores aprovados no protótipo isolado) ----------
  var MAX_DPR           = 2;
  var INFLUENCE_RADIUS  = 165;
  var HOVER_GAIN        = 3.2;
  var OFFSET_DECAY      = 0.975;
  var MAX_OFFSET        = 340;
  var NUMERAL_FILL      = 0.56; // um pouco menor que o standalone — sobra espaço pro CTA a 10% do bottom
  var BREATHE_AMOUNT    = 0.018;
  var BREATHE_SPEED     = (Math.PI * 2) / 4.5;
  var FUNNEL_SPREAD     = 0.62;
  var FUNNEL_DEPTH      = 0.4;
  var TWO_PI            = Math.PI * 2;

  var DPR = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  var W = 0, H = 0, centerX = 0, centerY = 0;

  var count = 0;
  var normX, normY, normR, tx, ty, rad, ox, oy, delay, dur, phase, speed, amp, pushAngle, offX, offY;

  var formStart = 0;
  var rafId = null;
  var maxFormTime = 0;

  var pointer = { x: -9999, y: -9999, active: false };
  var pointerSX = 0, pointerSY = 0, pointerHasPos = false;
  var pointerStrength = 0;

  function easeOutCubic(t) {
    var f = t - 1;
    return f * f * f + 1;
  }

  // ---- Forma "40" — mesmos pontos normalizados do protótipo aprovado ------
  // Array em si mora em js/shape-40-data.js (window.SHAPE_40_POINTS),
  // compartilhado com js/history-hero-40.js — ver boot no fim do arquivo,
  // que espera esse global chegar antes de ler (ambos os scripts são
  // async, sem garantia de ordem entre si).

  function pointsToShape(flat) {
    var n = flat.length / 3;
    var nx = new Float32Array(n), ny = new Float32Array(n), nr = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      nx[i] = flat[i * 3]; ny[i] = flat[i * 3 + 1]; nr[i] = flat[i * 3 + 2];
    }
    return { nx: nx, ny: ny, nr: nr, n: n };
  }

  // Telas pequenas (mobile) costumam ter CPU/GPU bem mais fracas que
  // desktop — desenhar os mesmos ~22 mil pontos custa desproporcionalmente
  // mais lá. Numa tela física menor a forma também ocupa menos px, então
  // menos pontos continuam lendo como "cheios" — corta antes de alocar os
  // arrays por partícula (mais barato que sempre alocar tudo e descartar).
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
    var cx = W / 2, cy = H * 0.42; // um pouco acima do centro — sobra espaço pro CTA
    centerX = cx; centerY = cy;
    var fit = Math.min(W, H) * NUMERAL_FILL;
    for (var i = 0; i < count; i++) {
      tx[i] = cx + normX[i] * fit;
      ty[i] = cy + normY[i] * fit;
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
    W = window.innerWidth;
    H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (count) layout();
  }

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  }, { passive: true });

  function setPointer(x, y) {
    pointer.x = x; pointer.y = y; pointer.active = true;
    maybeStart(); // hover pode ter chegado com o loop congelado (parado, ocioso)
  }
  function clearPointer() { pointer.active = false; }

  function hasResidualOffset() {
    for (var i = 0; i < count; i++) {
      if (offX[i] !== 0 || offY[i] !== 0) return true;
    }
    return false;
  }
  function maybeStart() {
    if (dismissed || rafId) return;
    if (!formationDone || pointer.active || hasResidualOffset()) {
      rafId = requestAnimationFrame(frame);
    }
  }

  // Hover é conceito de mouse (cursor parado) — não faz sentido em touch, e
  // religar a física de 22 mil partículas a cada touchmove pesava demais no
  // mobile bem no gesto que a pessoa usa pra tentar dispensar (swipe pra
  // baixo). Touch só dispara o swipe-to-dismiss (mais abaixo), nunca hover.
  window.addEventListener('mousemove', function (e) { setPointer(e.clientX, e.clientY); }, { passive: true });
  window.addEventListener('mouseleave', clearPointer, { passive: true });
  window.addEventListener('blur', clearPointer);

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

    ctx.clearRect(0, 0, W, H); // fundo (grid de pontos + degradê) já vem do CSS, ver .preloader

    var usePointer = pointerStrength > 0.002;

    var anyOffset = false;

    ctx.fillStyle = '#ffffff';
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

    if (!formationDone && t >= maxFormTime) {
      formationDone = true;
      revealCta();
    }

    // Congela quando ocioso (já formado, sem hover, sem deslocamento
    // assentando) — 39.740 partículas custam ~15-20ms/frame neste tipo de
    // hardware; rodar isso pra sempre enquanto o usuário só está olhando
    // pesa a máquina inteira à toa. maybeStart() religa no próximo hover.
    if (!formationDone || usePointer || anyOffset) {
      rafId = requestAnimationFrame(frame);
    } else {
      rafId = null;
    }
  }

  function stopLoop() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stopLoop();
    else maybeStart();
  });

  // ---- Coreografia: forma -> CTA -> dispensa (clique ou scroll) -----------
  var formationDone = false;
  var ctaRevealed = false;
  var dismissed = false;

  function revealCta() {
    if (ctaRevealed) return;
    ctaRevealed = true;
    cta.classList.add('is-visible');
  }

  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    removeDismissListeners();
    preloader.classList.add('is-leaving');
    stopLoop();
    // Começa a buscar o vídeo do hero JÁ na saída da cortina (não no fim dela):
    // ganha os ~0.9s da animação de vantagem, então na hora que o hero aparece
    // o vídeo já tem os primeiros bytes e engata sem tela parada no poster.
    if (typeof window.startHeroVideo === 'function') window.startHeroVideo();
    setTimeout(finish, 950); // depois da transição de 0.9s do CSS
  }

  function onWheel(e) {
    if (e.deltaY > 4) dismiss();
  }
  function onTouchStart(e) {
    touchStartY = e.touches[0] ? e.touches[0].clientY : null;
  }
  function onTouchMove(e) {
    if (touchStartY == null || !e.touches[0]) return;
    if (touchStartY - e.touches[0].clientY > 12) dismiss();
  }
  function onKey(e) {
    if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') dismiss();
  }
  var touchStartY = null;
  function removeDismissListeners() {
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('touchstart', onTouchStart);
    window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('keydown', onKey);
  }
  window.addEventListener('wheel', onWheel, { passive: true });
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: true });
  window.addEventListener('keydown', onKey);
  cta.addEventListener('click', dismiss);

  // ---- Boot -----------------------------------------------------------------
  // Pedido explícito do guardião: a cortina nunca dispensa sozinha, só por
  // ação do usuário. Os dois fallbacks abaixo (JS-erro na formação, dados do
  // formato "40" que não chegam a tempo) ANTES chamavam finish() — dispensa
  // automática, sem gesto nenhum. Agora só revelam o CTA direto (sem a
  // animação de partículas, que depende dos dados/da formação) — o usuário
  // ainda decide quando sair, clicando ou rolando; só quem falha é a
  // coreografia visual, nunca a saída forçada. `preloader`/`cta` já existem
  // no DOM neste ponto (checados antes de chegar aqui), então revelar o CTA
  // é sempre possível.
  function revealCtaWithoutFormation() {
    ctaRevealed = true;
    cta.classList.add('is-visible');
  }

  function boot() {
    try {
      resize();
      var shape = pointsToShape(window.SHAPE_40_POINTS);
      var smallViewport = Math.min(window.innerWidth, window.innerHeight) < 640;
      if (smallViewport) shape = subsampleShape(shape, 8000);
      initParticles(shape);
      formStart = performance.now();
      rafId = requestAnimationFrame(frame);
    } catch (err) {
      revealCtaWithoutFormation();
    }
  }

  // js/shape-40-data.js chega por um <script async> à parte (mesmo
  // fetchpriority do próprio preloader.js) — sem garantia de qual dos dois
  // termina de baixar primeiro. Se os pontos já estão lá, boota direto; senão
  // espera em polling curto — se demorar demais (falha de rede nesse arquivo
  // especificamente), desiste só da ANIMAÇÃO e revela o CTA (ver comentário
  // acima), nunca dispensa sozinho.
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
        revealCtaWithoutFormation();
      }
    }, 20);
  }
})();
