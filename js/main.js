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

  window.addEventListener('load', function () {
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

  // Demonstração no que já existe no site: cliques em âncoras internas
  // (navbar, rodapé, botões) passam pela transição em vez do salto direto.
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      var hash = link.getAttribute('href');
      var target = hash && hash.length > 1 ? document.querySelector(hash) : null;
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
