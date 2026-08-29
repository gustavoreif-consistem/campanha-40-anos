// Transição de entrada/navegação — 2 painéis grafite que abrem quando o site
// termina de carregar, e a mesma peça fecha+reabre nos links internos de
// navegação (uma prévia de como serviria de transição real entre páginas).
(function () {
  var overlay = document.getElementById('pageTransition');
  if (!overlay) return;

  var DURATION = 900; // precisa bater com a transition do CSS (.page-transition__panel)
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function open() { overlay.classList.add('is-open'); }
  function close() { overlay.classList.remove('is-open'); }

  // DOMContentLoaded (não 'load'): o painel não pode ficar esperando o
  // <video autoplay> do hero (nem vídeos/imagens ainda fora da tela) baixarem
  // por inteiro pra revelar a página — isso deixava TUDO parecendo travado
  // atrás do painel opaco enquanto só o hero video ainda buferizava.
  document.addEventListener('DOMContentLoaded', function () {
    if (reduceMotion) { open(); return; }
    setTimeout(open, 250);
  });

  // Reaproveitável: fecha (cobre a tela), roda a troca por trás, reabre.
  // Fica em window.pageTransition pra poder ser chamada de qualquer lugar
  // (ex.: um roteador real, se este site virar multi-página no futuro).
  function transitionTo(action) {
    if (reduceMotion) {
      if (typeof action === 'function') action();
      return;
    }
    close();
    setTimeout(function () {
      if (typeof action === 'function') action();
      setTimeout(open, 50);
    }, DURATION);
  }
  window.pageTransition = transitionTo;

  // Âncoras internas (navbar, rodapé, botões) na MESMA página: fecha, pula
  // direto pro alvo (sem o smooth-scroll nativo, que ficaria rodando atrás
  // do painel), reabre. Exclui .js-no-transition (ex.: itens da barra da
  // timeline de História — clique frequente, não deve carregar o painel
  // grafite a cada troca de era).
  document.querySelectorAll('a[href^="#"]:not(.js-no-transition)').forEach(function (link) {
    var hash = link.getAttribute('href');
    if (!hash || hash.length <= 1) return; // ignora href="#" solto (placeholder do rodapé)
    link.addEventListener('click', function (e) {
      var target = document.querySelector(hash);
      if (!target) return;
      e.preventDefault();
      transitionTo(function () {
        var root = document.documentElement;
        var previous = root.style.scrollBehavior;
        root.style.scrollBehavior = 'auto';
        target.scrollIntoView();
        root.style.scrollBehavior = previous;
      });
    });
  });

  // Links pra OUTRA página do mesmo hotsite (ex.: index.html -> historia.html):
  // só fecha e navega de verdade — a página nova já nasce coberta pelo
  // próprio painel (estado padrão do CSS) e se revela sozinha ao carregar.
  document.querySelectorAll('a[href]').forEach(function (link) {
    var href = link.getAttribute('href');
    if (!href || href.charAt(0) === '#') return;
    if (!/^[a-zA-Z0-9_-]+\.html(#.*)?$/.test(href)) return; // só página local do hotsite
    link.addEventListener('click', function (e) {
      e.preventDefault();
      if (reduceMotion) { window.location.href = href; return; }
      close();
      setTimeout(function () { window.location.href = href; }, DURATION);
    });
  });
})();

// Toggle do menu mobile — única interação além do <details> nativo do FAQ.
(function () {
  var toggle = document.getElementById('navToggle');
  var nav = document.getElementById('siteNav');
  if (!toggle || !nav) return;

  toggle.addEventListener('click', function () {
    var isOpen = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.innerHTML = isOpen
      ? '<svg class="icon"><use href="#icon-close"></use></svg>'
      : '<svg class="icon"><use href="#icon-menu"></use></svg>';
  });

  nav.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', function () {
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.innerHTML = '<svg class="icon"><use href="#icon-menu"></use></svg>';
    });
  });
})();

// Navbar encolhe ao rolar pra baixo (rápido) e só volta ao tamanho normal
// se a pessoa "insistir" rolando pra cima (limiar bem maior) — um scroll
// pra cima pequeno/isolado não desfaz o encolhimento, só rolagem para cima
// sustentada. Evita o vai-e-vem de trocar de estado a cada tick de scroll.
(function () {
  var header = document.querySelector('.site-header');
  if (!header) return;

  var lastY = Math.max(0, window.scrollY);
  var lastDir = 0; // 1 = descendo, -1 = subindo
  var accum = 0;
  var ticking = false;
  var topThreshold = 80;    // perto do topo, sempre normal
  var shrinkAfter = 24;     // pouca insistência pra descer já encolhe
  var expandAfter = 160;    // precisa insistir bastante pra cima pra voltar

  function update() {
    ticking = false;
    var y = Math.max(0, window.scrollY);
    var delta = y - lastY;

    if (y <= topThreshold) {
      header.classList.remove('site-header--compact');
      accum = 0;
      lastDir = 0;
      lastY = y;
      return;
    }

    var dir = delta > 0 ? 1 : (delta < 0 ? -1 : lastDir);
    if (dir !== lastDir) {
      accum = 0;
      lastDir = dir;
    }
    accum += Math.abs(delta);

    if (dir === 1 && accum > shrinkAfter) {
      header.classList.add('site-header--compact');
    } else if (dir === -1 && accum > expandAfter) {
      header.classList.remove('site-header--compact');
    }

    lastY = y;
  }

  window.addEventListener('scroll', function () {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });
})();

// Modal do vídeo manifesto — abre com áudio e controles nativos, fecha por
// botão, clique no fundo ou Esc.
(function () {
  var trigger = document.getElementById('watchManifestoBtn');
  var modal = document.getElementById('videoModal');
  if (!trigger || !modal) return;

  var video = document.getElementById('manifestoVideo');
  var closeBtn = document.getElementById('videoModalClose');
  var backdrop = modal.querySelector('[data-modal-close]');

  function openModal() {
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    video.currentTime = 0;
    video.play().catch(function () {});
    closeBtn.focus();
  }

  function closeModal() {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    video.pause();
    trigger.focus();
  }

  trigger.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  backdrop.addEventListener('click', closeModal);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
  });
})();

// Scroll-reveal LETRA A LETRA no texto "fundamentos" da Home (index.html) —
// o parágrafo inteiro revela de uma cor bem apagada até a cor sólida do
// texto, sem trecho fixo/destacado. A cor inicial (20% do token de texto
// sobre transparente) é resolvida via color-mix num elemento-sonda
// descartável, nunca hex fixo.
(function () {
  var lead = document.getElementById('fundamentosLead');
  var visual = lead ? lead.querySelector('.fundamentos-lead__visual') : null;
  if (!lead || !visual || !window.gsap || !window.ScrollTrigger) return;

  gsap.registerPlugin(ScrollTrigger);

  var probe = document.createElement('span');
  probe.style.color = 'color-mix(in srgb, var(--color-text-default) 20%, transparent)';
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  document.body.appendChild(probe);
  var initialColor = getComputedStyle(probe).color;
  document.body.removeChild(probe);

  var targetColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--color-text-default')
    .trim();

  function wrapChars(root) {
    var chars = [];
    Array.prototype.slice.call(root.childNodes).forEach(function (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        var frag = document.createDocumentFragment();
        node.textContent.split('').forEach(function (ch) {
          var span = document.createElement('span');
          span.className = 'char';
          span.textContent = ch;
          frag.appendChild(span);
          chars.push(span);
        });
        node.parentNode.replaceChild(frag, node);
      } else if (node.tagName !== 'STRONG') {
        chars = chars.concat(wrapChars(node));
      }
    });
    return chars;
  }

  var chars = wrapChars(visual);
  gsap.set(chars, { color: initialColor });
  gsap.to(chars, {
    color: targetColor,
    ease: 'none',
    stagger: 0.01,
    scrollTrigger: {
      trigger: lead,
      start: 'top 85%',
      end: 'top 25%',
      scrub: true,
    },
  });
})();

// Timeline de "História" (historia.html) — estado ativo da barra de eras.
// A barra em si fica sticky por CSS puro (ver .history-nav em styles.css,
// primeiro filho de .history-timeline) — aqui só troca qual item mostra
// "ativo" conforme o scroll passa por cada bloco (IntersectionObserver,
// sem GSAP: mesma técnica usada de verdade pelo ICARDA pra esse detalhe
// específico, olhando qual <section data-history-era> está mais visível).
(function () {
  var nav = document.querySelector('.history-nav');
  var blocks = Array.prototype.slice.call(document.querySelectorAll('[data-history-era]'));
  if (!nav || !blocks.length) return;

  var items = Array.prototype.slice.call(nav.querySelectorAll('.history-nav__item'));

  function setActive(id) {
    items.forEach(function (item) {
      item.classList.toggle('is-active', item.getAttribute('href') === '#' + id);
    });
  }

  var observer = new IntersectionObserver(function (entries) {
    var mostVisible = null;
    entries.forEach(function (entry) {
      if (entry.isIntersecting && (!mostVisible || entry.intersectionRatio > mostVisible.intersectionRatio)) {
        mostVisible = entry;
      }
    });
    if (mostVisible) setActive(mostVisible.target.id);
  }, { rootMargin: '-20% 0px -60% 0px', threshold: 0 });

  blocks.forEach(function (block) { observer.observe(block); });

  items.forEach(function (item) {
    item.addEventListener('click', function (e) {
      var target = document.querySelector(item.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
})();

// Timeline de "História" — reveal de entrada nos cards (que passam em
// fluxo normal, não empilham mais — ver .history-card em styles.css) e no
// título do bloco "presente". Puramente cosmético — sem GSAP, os cards
// continuam visíveis normalmente (guard padrão).
(function () {
  var cards = document.querySelectorAll('.history-card');
  var presentTitle = document.querySelector('.history-present__title');
  if ((!cards.length && !presentTitle) || !window.gsap || !window.ScrollTrigger) return;

  gsap.registerPlugin(ScrollTrigger);

  cards.forEach(function (card) {
    gsap.from(card, {
      opacity: 0,
      y: 40,
      duration: 0.6,
      ease: 'Power2.easeOut',
      scrollTrigger: { trigger: card, start: 'top 85%' },
    });
  });

  if (presentTitle) {
    gsap.from(presentTitle, {
      opacity: 0,
      y: 24,
      duration: 0.7,
      ease: 'Power2.easeOut',
      scrollTrigger: { trigger: presentTitle, start: 'top 85%' },
    });
  }
})();

// Scroll suave só na página "História" (guard por .history-timeline —
// nenhuma outra página do hotsite tem essa classe), pedido pra dar sensação
// de "mergulho" na timeline. JS próprio em vez de lib (Lenis foi cogitada e
// descartada quando esta página nasceu, por trocar o scroll nativo do SITE
// INTEIRO).
//
// Duas tentativas anteriores (ver histórico do arquivo) suavizavam TODO
// wheel event via lerp contínuo — isso deixava a rolagem em si com atraso
// perceptível o tempo inteiro, o oposto do pedido ("scrolla normal"). O
// mecanismo certo é outro: durante o gesto, NÃO intercepta nada (scroll
// nativo, sem preventDefault, 1:1 com o input); só quando o wheel para de
// chegar por STOP_DELAY ms é que entra uma freada curta (glide com atrito,
// desacelerando até zero) em vez do corte seco que o scroll nativo dá
// sozinho. Pra trackpad (que já entrega o próprio momentum no deltaY,
// tapering sozinho antes de parar) o glide sai pequeno quase à toa — a
// última amostra de velocidade já vem baixa; é pro mouse de catraca (sem
// momentum nenhum nativo) que esse freio faz diferença de verdade.
(function () {
  if (!document.querySelector('.history-timeline')) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var STOP_DELAY = 100; // ms sem "wheel" pra considerar que soltou o gesto
  var FRICTION = 0.88; // por frame — perto de 1 pra frenagem visível ao longo de vários frames
  var VELOCITY_SCALE = 0.045; // fração do último delta que vira o "impulso" do freio —
    // precisa ser pequena: com FRICTION alto (necessário pra frenagem em VÁRIOS frames,
    // não só 2-3), a distância total do glide é velocidade_inicial/(1-FRICTION); sem
    // encolher a velocidade de entrada primeiro, um clique de roda de 100px virava quase
    // mais 900px de glide sozinho — helicoptero, não um freio suave.
  var MIN_VELOCITY = 0.3; // px/frame abaixo disso, encerra o glide

  var velocity = 0;
  var pos = 0; // posição própria do glide — nunca reler window.scrollY dentro
    // do loop (scrollTo→scrollY tem 1 frame de atraso pra refletir no
    // Chromium, ler de volta a cada frame fazia a posição "andar pra trás")
  var coasting = false;
  var programmatic = false;
  var stopTimer = null;

  function maxScroll() {
    return document.documentElement.scrollHeight - window.innerHeight;
  }

  function normalizeDelta(e) {
    // deltaMode 1 = linhas (trackpad "clicado"/mouse com catraca), 2 = páginas.
    if (e.deltaMode === 1) return e.deltaY * 16;
    if (e.deltaMode === 2) return e.deltaY * window.innerHeight;
    return e.deltaY;
  }

  function coastLoop() {
    if (!coasting) return;
    velocity *= FRICTION;
    if (Math.abs(velocity) < MIN_VELOCITY) { coasting = false; return; }
    pos = Math.max(0, Math.min(pos + velocity, maxScroll()));
    programmatic = true;
    // behavior:'instant' é obrigatório aqui — html{scroll-behavior:smooth}
    // (usado pelos links de âncora do site) faz o PRÓPRIO navegador suavizar
    // scrollTo(x,y) por padrão; sem isso, cada frame deste loop disparava
    // outra animação suave nativa por cima da anterior, uma cancelando a
    // outra a cada ~16ms — resultado imprevisível, nada a ver com o glide
    // calculado aqui.
    window.scrollTo({ top: pos, left: 0, behavior: 'instant' });
    if (pos <= 0 || pos >= maxScroll()) { coasting = false; return; }
    requestAnimationFrame(coastLoop);
  }

  window.addEventListener('wheel', function (e) {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // scroll horizontal — não mexe
    coasting = false; // gesto novo cancela qualquer freada em andamento
    velocity = normalizeDelta(e) * VELOCITY_SCALE; // última amostra vira o "impulso" de saída do glide
    clearTimeout(stopTimer);
    stopTimer = setTimeout(function () {
      pos = window.scrollY; // única leitura — feita já parado, sem glide rodando, é confiável
      coasting = true;
      requestAnimationFrame(coastLoop);
    }, STOP_DELAY);
    // sem preventDefault: o próprio wheel já rola nativo, normal, sem atraso.
  }, { passive: true });

  // Se o scroll mudar por outro meio (teclado, scrollbar) enquanto o glide
  // ainda estivesse rodando, cancela — não briga com o controle do usuário.
  window.addEventListener('scroll', function () {
    if (programmatic) { programmatic = false; return; }
    coasting = false;
  }, { passive: true });
})();

// Reforço do autoplay do hero em mobile — o atributo autoplay+muted+playsinline
// já cobre a maioria dos browsers, mas alguns webviews (in-app do Instagram/
// Facebook, Data Saver do Android) só engatam o play depois de uma chamada
// explícita de .play(); reforça aqui e resiliente também a orientationchange,
// caso o browser pause o vídeo ao girar a tela.
(function () {
  var video = document.querySelector('.hero__media video[autoplay]');
  if (!video) return;

  function tryPlay() { video.play().catch(function () {}); }

  tryPlay();
  video.addEventListener('loadeddata', tryPlay);
  window.addEventListener('orientationchange', tryPlay);
})();

// Vídeos decorativos de fundo (autoplay/loop) só carregam quando chegam
// perto da tela — sem isso, um <video autoplay> baixa o arquivo inteiro no
// load da página mesmo estando várias seções abaixo da dobra. Marcar o
// <video> com a classe "js-lazy-video", preload="none", SEM autoplay no
// HTML, e trocar o `src` do <source> por `data-src` — este bloco troca de
// volta e dá play assim que o vídeo entra (ou está perto de entrar) na tela.
(function () {
  var videos = Array.prototype.slice.call(document.querySelectorAll('video.js-lazy-video'));
  if (!videos.length) return;

  function startVideo(video) {
    Array.prototype.slice.call(video.querySelectorAll('source[data-src]')).forEach(function (source) {
      source.src = source.dataset.src;
    });
    video.load();
    video.play().catch(function () {});
  }

  if (!window.IntersectionObserver) {
    // Sem suporte ao observer: carrega direto, em vez de deixar vazio pra sempre.
    videos.forEach(startVideo);
    return;
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      startVideo(entry.target);
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '200px' });

  videos.forEach(function (video) { observer.observe(video); });
})();
