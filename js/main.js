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

// Utilitário compartilhado — revela o texto de um container LETRA A LETRA
// no scroll, de uma cor bem apagada até a cor sólida do token informado
// (sem trecho fixo/destacado). A cor inicial (20% do token sobre
// transparente) é resolvida via color-mix num elemento-sonda descartável,
// nunca hex fixo. `trigger` decide a posição de leitura do scroll (pode
// ser um wrapper diferente de `visual`, ver uso com aria-label abaixo);
// `endTrigger` deixa cada chamada calibrar a janela de scroll pro próprio
// tamanho do bloco — texto curto termina de revelar quase na entrada
// ('top 25%'), bloco de página inteira precisa cobrir a altura toda
// ('bottom 25%'), senão só o topo anima e o resto já nasce sólido antes
// de entrar na tela. Usado pelo lead da Home (fundamentosLead) e pelo
// corpo do manifesto (manifesto.html).
function revealCharsOnScroll(trigger, visual, colorVar, endTrigger) {
  if (!trigger || !visual || !window.gsap || !window.ScrollTrigger) return;

  gsap.registerPlugin(ScrollTrigger);

  var probe = document.createElement('span');
  probe.style.color = 'color-mix(in srgb, var(' + colorVar + ') 20%, transparent)';
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  document.body.appendChild(probe);
  var initialColor = getComputedStyle(probe).color;
  document.body.removeChild(probe);

  var targetColor = getComputedStyle(document.documentElement)
    .getPropertyValue(colorVar)
    .trim();

  function wrapChars(root) {
    var chars = [];
    Array.prototype.slice.call(root.childNodes).forEach(function (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        // Texto só de espaço/quebra de linha (a indentação entre tags <p> no
        // próprio HTML) fica INTOCADO — não vira <span>. Motivo: um container
        // flex trata texto puramente em branco como colapsável (não gera
        // item), mas um <span> real, mesmo vazio/espaço, sempre vira item de
        // flex de verdade — cada espaço de indentação virava sua própria
        // "linha" na coluna, puxando o `gap` do container a cada um (bug real
        // encontrado no corpo do manifesto, onde .manifesto-body__group é
        // flex-column: os parágrafos pareciam a quilômetros de distância).
        if (!node.textContent.trim()) return;
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
      trigger: trigger,
      start: 'top 85%',
      end: endTrigger,
      scrub: true,
    },
  });
}

// Scroll-reveal letra a letra no texto "fundamentos" da Home (index.html).
(function () {
  var lead = document.getElementById('fundamentosLead');
  var visual = lead ? lead.querySelector('.fundamentos-lead__visual') : null;
  revealCharsOnScroll(lead, visual, '--color-text-default', 'top 25%');
})();

// Paralaxe leve (--p, 0→1) da grade de fotos do manifesto (.mfoto) e da
// composição de fechamento (.manifesto-comp) — mesmo mecanismo de
// "2026/LP Rebrand/build-ftp/index.html" (.foto/.comp): cada elemento
// escreve seu próprio progresso de 0 a 1 conforme atravessa a tela, e o
// CSS já sabe traduzir isso em transform (ver .mfoto__col--*/
// .manifesto-comp__tag--* em styles.css). Sem GSAP de propósito — é o
// mesmo scroll listener simples que a página de origem já usa.
(function () {
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var mfotos = document.querySelectorAll('.mfoto');
  var comps = document.querySelectorAll('.manifesto-comp');
  if (!mfotos.length && !comps.length) return;

  function progress(el, span) {
    var r = el.getBoundingClientRect();
    var vh = window.innerHeight;
    return Math.min(Math.max((vh - r.top) / (vh * span), 0), 1);
  }

  function update() {
    if (reduceMotion.matches) return;
    mfotos.forEach(function (el) { el.style.setProperty('--p', progress(el, 1.6).toFixed(3)); });
    comps.forEach(function (el) { el.style.setProperty('--p', progress(el, 1.35).toFixed(3)); });
  }

  update();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update, { passive: true });
  reduceMotion.addEventListener('change', update);
})();

// Timeline do manifesto (.mtimeline, manifesto.html) — os 4 marcos
// aparecem em sequência (slide-in-up com atraso entre cada um, pedido
// explícito) ao entrar na tela, não cada um por conta própria — por isso
// UM gsap.from() só, com stagger, disparado pelo trigger do container
// inteiro (.mtimeline), não por marco individual (diferente do reveal de
// cards de História, que é independente por card).
(function () {
  var marks = document.querySelectorAll('.mtimeline__mark');
  if (!marks.length || !window.gsap || !window.ScrollTrigger) return;

  gsap.registerPlugin(ScrollTrigger);

  gsap.from(marks, {
    opacity: 0,
    y: 40,
    duration: 0.6,
    ease: 'Power2.easeOut',
    stagger: 0.15,
    scrollTrigger: { trigger: '.mtimeline', start: 'top 85%' },
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
// bloco de texto do "presente" (2026). Puramente cosmético — sem GSAP, os
// cards continuam visíveis normalmente (guard padrão).
(function () {
  var cards = document.querySelectorAll('.history-card');
  var presentTitle = document.querySelector('.history-present__intro');
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

// Vídeo de fundo do hero — carregamento explícito, nunca via `autoplay` no HTML.
//
// Por quê: `autoplay` faz o browser ignorar `preload="none"` e baixar o arquivo
// inteiro (2.5MB, 83% do peso da página) já no load. Na Home esse vídeo passa os
// primeiros segundos INTEIRAMENTE coberto pela cortina do preloader — ou seja,
// baixava cedo, invisível, disputando banda com o preloader.js e com as imagens.
// Sintoma real relatado: grid de fundo (CSS) aparecia na hora, mas o "40" e as
// imagens demoravam ~10s numa primeira visita.
//
// Agora o <video> nasce sem src (só `data-src`) e sem autoplay; quem inicia é
// startHeroVideo(), chamada quando a cortina do preloader sai — ou de imediato,
// quando não há preloader nesta visita (2ª visita, reduced-motion, outra página).
(function () {
  var video = document.querySelector('video.js-hero-video');
  if (!video) return;

  var started = false;
  function startHeroVideo() {
    if (started) return;
    started = true;
    Array.prototype.slice.call(video.querySelectorAll('source[data-src]')).forEach(function (source) {
      source.src = source.dataset.src;
      source.removeAttribute('data-src');
    });
    video.load();
    tryPlay();
    // Alguns webviews (in-app do Instagram/Facebook, Data Saver do Android) só
    // engatam o play depois de uma chamada explícita já com dados carregados;
    // e alguns browsers pausam o vídeo ao girar a tela.
    video.addEventListener('loadeddata', tryPlay);
    window.addEventListener('orientationchange', tryPlay);
  }
  function tryPlay() { video.play().catch(function () {}); }

  window.startHeroVideo = startHeroVideo;

  // Sem preloader nesta visita → nada cobre o hero, pode carregar já.
  if (!document.documentElement.classList.contains('preloader-active')) {
    startHeroVideo();
    return;
  }

  // Pedido explícito do guardião: a cortina NUNCA some sozinha, só por ação
  // do usuário (clique no CTA, scroll ou swipe — ver dismiss() em
  // js/preloader.js). Havia aqui uma "rede de segurança" que forçava a
  // cortina a sumir depois de 8s caso preloader.js não chegasse a rodar
  // (falha de rede) — removida de propósito. Trade-off aceito: se
  // preloader.js falhar ao carregar por completo (não só os dados do
  // formato "40"), a cortina fica presa sem forma de dispensar — cenário
  // raro (bloqueio de rede/extensão), mas agora sem rede de segurança
  // nenhuma. Os casos de falha PARCIAL (shape data não chega a tempo, erro
  // durante a formação) continuam com saída própria: preloader.js revela o
  // CTA direto, sem animação, em vez de dispensar sozinho — ver comentário
  // em js/preloader.js.
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

// Botão de play custom sobre o vídeo do manifesto (manifesto.html, hero) —
// dois vídeos empilhados: .manifesto-hero__preview (loop mudo, mesmo
// recorte de 10s do hero da Home, carrega sozinho via .js-lazy-video) por
// baixo, .manifesto-hero__real (vídeo completo, com áudio) por cima,
// invisível até o clique. Ao clicar, pausa a prévia e toca o real — depois
// disso o real fica pra sempre (não volta pra prévia ao pausar/terminar,
// classe .is-engaged nunca é removida).
(function () {
  var wrap = document.querySelector('.manifesto-hero__video');
  var preview = wrap ? wrap.querySelector('.manifesto-hero__preview') : null;
  var real = wrap ? wrap.querySelector('.manifesto-hero__real') : null;
  var playBtn = wrap ? wrap.querySelector('.manifesto-hero__play') : null;
  if (!wrap || !real || !playBtn) return;

  playBtn.addEventListener('click', function () {
    wrap.classList.add('is-engaged');
    if (preview) preview.pause();
    real.play();
  });
})();

// Accordion de Aplicações (evolucao.html) — 1 item aberto por vez.
// A marca colorida da trilha (.apps-accordion__active-mark) é posicionada
// via JS medindo a altura real do item aberto, em vez de fixar os 123px
// do Figma (que só valiam pra aquele texto específico naquele frame) —
// assim funciona certo qualquer que seja o item aberto ou a largura da tela.
(function () {
  var accordion = document.querySelector('.apps-accordion');
  if (!accordion) return;
  var items = accordion.querySelectorAll('.apps-item');
  var mark = accordion.querySelector('.apps-accordion__active-mark');

  // Soma alturas ESTÁTICAS (trigger.offsetHeight nunca anima; scrollHeight
  // do painel é sempre a altura natural do conteúdo, mesmo com overflow:
  // hidden/max-height:0) em vez de ler getBoundingClientRect() de itens
  // vizinhos — esses SIM estão no meio de uma transition (o painel que
  // está fechando por cima empurra tudo pra baixo aos poucos), então medir
  // a caixa ao vivo pegava um valor de transição pela metade e a barra
  // aparecia deslocada (bug real, visto ao vivo — 2º item abria e a barra
  // ficava alinhada com o 3º/4º). Somar alturas-alvo direto ignora
  // completamente em que pé a animação está.
  function topOf(targetItem) {
    var top = 0;
    for (var i = 0; i < items.length; i++) {
      var el = items[i];
      if (el === targetItem) break;
      top += heightOf(el);
    }
    return top;
  }

  function heightOf(item) {
    var trigger = item.querySelector('.apps-item__trigger');
    var panel = item.querySelector('.apps-item__panel');
    var isOpen = item.classList.contains('is-open');
    return trigger.offsetHeight + (isOpen ? panel.scrollHeight : 0);
  }

  function updateMark(item) {
    if (!mark) return;
    mark.style.top = topOf(item) + 'px';
    mark.style.height = heightOf(item) + 'px';
  }

  function openItem(item) {
    items.forEach(function (el) {
      var isTarget = el === item;
      var btn = el.querySelector('.apps-item__trigger');
      var panel = el.querySelector('.apps-item__panel');
      btn.setAttribute('aria-expanded', isTarget ? 'true' : 'false');
      el.classList.toggle('is-open', isTarget);
      panel.style.maxHeight = isTarget ? panel.scrollHeight + 'px' : '';
    });
    updateMark(item);
  }

  items.forEach(function (item) {
    var btn = item.querySelector('.apps-item__trigger');
    btn.addEventListener('click', function () { openItem(item); });
  });

  var initial = accordion.querySelector('.apps-item.is-open') || items[0];
  if (initial) openItem(initial);

  window.addEventListener('resize', function () {
    var current = accordion.querySelector('.apps-item.is-open');
    if (current) updateMark(current);
  });
})();
