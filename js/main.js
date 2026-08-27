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

  // Âncoras internas (navbar, rodapé, botões) na MESMA página: fecha, pula
  // direto pro alvo (sem o smooth-scroll nativo, que ficaria rodando atrás
  // do painel), reabre.
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
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

  // Links pra OUTRA página do mesmo hotsite (ex.: index.html -> presenca.html):
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

// Accordion horizontal de depoimentos — passar o mouse ou clicar num painel
// fechado abre ele e fecha o que estava aberto (nunca mais de um por vez).
(function () {
  var accordion = document.getElementById('testimonialAccordion');
  if (!accordion) return;

  var panels = Array.prototype.slice.call(accordion.querySelectorAll('.testimonial-panel'));

  function activate(target) {
    panels.forEach(function (panel) {
      panel.classList.toggle('is-active', panel === target);
    });
  }

  panels.forEach(function (panel) {
    panel.addEventListener('mouseenter', function () { activate(panel); });
    panel.addEventListener('click', function () { activate(panel); });
    panel.addEventListener('focus', function () { activate(panel); });
  });
})();

// Scroll-reveal LETRA A LETRA no texto de abertura da seção "cobertura"
// (Presença) — GSAP + ScrollTrigger, só roda se as duas libs estiverem
// carregadas nesta página. Cada caractere do trecho não destacado (fora do
// <strong>) vira um <span class="char"> em runtime e recebe um stagger de
// cor conforme o scroll avança; <strong> e <br> ficam intactos. As cores
// são lidas dos tokens computados, nunca hex fixo aqui.
(function () {
  var lead = document.getElementById('coverageLead');
  var visual = lead ? lead.querySelector('.coverage-lead__visual') : null;
  if (!lead || !visual || !window.gsap || !window.ScrollTrigger) return;

  gsap.registerPlugin(ScrollTrigger);

  var initialColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--color-surface-alt')
    .trim();
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
        // recursa nos <span class="coverage-lead__line"> (as 3 linhas);
        // <strong> fica intocado, fora da animação.
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
    stagger: 0.02,
    scrollTrigger: {
      trigger: lead,
      start: 'top 85%',
      end: 'top 25%',
      scrub: true,
    },
  });
})();

// Ícones da "constelação" de segmentos — parallax de verdade: cada ícone
// desliza (sem fade) numa velocidade diferente (--depth, lido do elemento
// pai .segments__icon) enquanto a seção inteira passa pela tela, não só
// numa entrada única. Roda por cima da flutuação contínua em CSS
// (@keyframes segmentIconFloat, em elemento separado pra não conflitar
// com a transform que o GSAP controla aqui).
(function () {
  var section = document.getElementById('segmentos');
  var wrappers = section ? section.querySelectorAll('.segments__icon') : null;
  if (!section || !wrappers || !wrappers.length || !window.gsap || !window.ScrollTrigger) return;

  gsap.registerPlugin(ScrollTrigger);

  wrappers.forEach(function (wrapper) {
    var target = wrapper.querySelector('.segments__icon-parallax');
    if (!target) return;
    var depth = parseFloat(wrapper.dataset.depth) || 1;
    gsap.fromTo(target,
      { y: 160 * depth },
      {
        y: -80 * depth,
        ease: 'none',
        scrollTrigger: {
          trigger: section,
          start: 'top bottom',
          end: 'bottom top',
          scrub: true,
        },
      }
    );
  });
})();
