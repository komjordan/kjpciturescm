/* KJ Pictures — interactions & animations (vanilla JS, aucune dépendance) */
(() => {
  'use strict';

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------- Données du portfolio ---------- */
  const CATS = {
    portrait: 'Portrait',
    enfant: 'Enfants & Anniversaires',
    culture: 'Culture & Tradition',
    duo: 'Duo & Famille',
    pro: 'Professionnel'
  };
  const PHOTOS = [
    ['034', 'portrait'], ['044', 'culture'], ['020', 'enfant'], ['027', 'portrait'], ['005', 'duo'],
    ['029', 'pro'], ['064', 'culture'], ['021', 'enfant'], ['025', 'portrait'], ['016', 'duo'],
    ['045', 'culture'], ['058', 'enfant'], ['013', 'portrait'], ['002', 'pro'], ['066', 'culture'],
    ['039', 'enfant'], ['033', 'portrait'], ['043', 'duo'], ['018', 'culture'], ['054', 'enfant'],
    ['081', 'portrait'], ['003', 'pro'], ['050', 'culture'], ['036', 'enfant'], ['015', 'portrait'],
    ['079', 'duo'], ['022', 'culture'], ['057', 'enfant'], ['051', 'portrait'], ['030', 'pro'],
    ['046', 'culture'], ['019', 'enfant'], ['007', 'portrait'], ['028', 'duo'], ['061', 'culture'],
    ['040', 'enfant'], ['076', 'portrait'], ['024', 'duo'], ['065', 'culture'], ['062', 'enfant'],
    ['012', 'portrait'], ['047', 'duo'], ['077', 'culture'], ['048', 'enfant'], ['035', 'portrait'],
    ['023', 'duo'], ['067', 'culture'], ['055', 'enfant'], ['026', 'portrait'], ['031', 'culture'],
    ['042', 'enfant'], ['008', 'portrait'], ['037', 'culture'], ['049', 'enfant'], ['009', 'portrait'],
    ['041', 'culture'], ['059', 'enfant'], ['010', 'portrait'], ['038', 'culture'], ['017', 'enfant'],
    ['011', 'portrait'], ['032', 'pro'], ['056', 'enfant'], ['014', 'portrait'], ['063', 'enfant'],
    ['052', 'portrait'], ['053', 'portrait'], ['006', 'portrait'], ['078', 'portrait'], ['080', 'portrait']
  ].map(([id, cat]) => ({ id, cat, full: `assets/img/gallery/kj-${id}.webp`, thumb: `assets/img/thumbs/kj-${id}.webp` }));

  /* ---------- Loader ---------- */
  const loader = $('#loader');
  const finishLoading = () => {
    loader.classList.add('is-done');
    document.body.classList.remove('is-loading');
    setTimeout(() => document.body.classList.add('is-ready'), 350);
    setTimeout(() => $$('.hero .reveal-up').forEach(el => el.classList.add('is-visible')), 200);
  };
  const minDelay = new Promise(r => setTimeout(r, reduceMotion ? 0 : 1700));
  const pageLoad = new Promise(r => (document.readyState === 'complete' ? r() : window.addEventListener('load', r)));
  Promise.race([Promise.all([minDelay, pageLoad]), new Promise(r => setTimeout(r, 4500))]).then(finishLoading);

  $('#year').textContent = new Date().getFullYear();

  /* ---------- Navigation ---------- */
  const nav = $('#nav');
  const burger = $('#burger');
  const links = $('#navLinks');
  const toggleMenu = (open) => {
    burger.setAttribute('aria-expanded', open);
    links.classList.toggle('is-open', open);
    document.body.classList.toggle('no-scroll', open);
  };
  burger.addEventListener('click', () => toggleMenu(burger.getAttribute('aria-expanded') !== 'true'));
  $$('a', links).forEach(a => a.addEventListener('click', () => toggleMenu(false)));

  const progress = $('#progress');
  let lastY = 0;
  const onScroll = () => {
    const y = window.scrollY;
    const max = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    nav.classList.toggle('is-scrolled', y > 40);
    nav.classList.toggle('is-hidden', y > lastY && y > 500 && !links.classList.contains('is-open'));
    lastY = y;
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Lien actif selon la section visible
  const sections = $$('main section[id]');
  const navObs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      $$('a', links).forEach(a => a.classList.toggle('is-current', a.getAttribute('href') === `#${e.target.id}`));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  sections.forEach(s => navObs.observe(s));

  /* ---------- Hero : diaporama ---------- */
  const slides = $$('.hero__slide');
  const dotsWrap = $('#heroDots');
  let current = 0, slideTimer;
  slides.forEach((_, i) => {
    const b = document.createElement('button');
    b.setAttribute('aria-label', `Photo ${i + 1}`);
    b.addEventListener('click', () => goSlide(i));
    dotsWrap.appendChild(b);
  });
  const dots = $$('button', dotsWrap);
  function goSlide(i) {
    slides[current].classList.remove('is-active');
    dots[current].classList.remove('is-active');
    current = (i + slides.length) % slides.length;
    slides[current].classList.add('is-active');
    void dots[current].offsetWidth; // relance l'animation de la barre
    dots[current].classList.add('is-active');
    clearTimeout(slideTimer);
    slideTimer = setTimeout(() => goSlide(current + 1), 5500);
  }
  goSlide(0);

  /* ---------- Hero : texte machine à écrire ---------- */
  const typed = $('#typed');
  const words = typed.dataset.words.split('|');
  let wi = 0, ci = 0, deleting = false;
  (function type() {
    const w = words[wi];
    typed.textContent = w.slice(0, ci);
    if (!deleting && ci === w.length) { deleting = true; return setTimeout(type, 1600); }
    if (deleting && ci === 0) { deleting = false; wi = (wi + 1) % words.length; }
    ci += deleting ? -1 : 1;
    setTimeout(type, deleting ? 45 : 95);
  })();

  /* ---------- Hero : particules dorées (bokeh) ---------- */
  const canvas = $('#particles');
  if (canvas && !reduceMotion) {
    const ctx = canvas.getContext('2d');
    let w, h, parts = [];
    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      w = canvas.offsetWidth; h = canvas.offsetHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(70, w / 18));
      parts = Array.from({ length: n }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        r: Math.random() * 2.4 + .4, vy: -(Math.random() * .35 + .08), vx: (Math.random() - .5) * .2,
        a: Math.random() * .6 + .2, t: Math.random() * Math.PI * 2
      }));
    };
    resize();
    addEventListener('resize', resize);
    let heroVisible = true;
    new IntersectionObserver(([e]) => { heroVisible = e.isIntersecting; }).observe(canvas);
    (function draw() {
      if (heroVisible) {
        ctx.clearRect(0, 0, w, h);
        for (const p of parts) {
          p.x += p.vx; p.y += p.vy; p.t += .03;
          if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
          const alpha = p.a * (.6 + .4 * Math.sin(p.t));
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
          g.addColorStop(0, `rgba(243,210,122,${alpha})`);
          g.addColorStop(1, 'rgba(243,210,122,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2); ctx.fill();
        }
      }
      requestAnimationFrame(draw);
    })();
  }

  /* ---------- Révélations au défilement ---------- */
  const revealObs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-visible');
      revealObs.unobserve(e.target);
    });
  }, { threshold: .15, rootMargin: '0px 0px -40px 0px' });
  // Petit décalage en cascade entre éléments frères
  $$('.reveal-up, .reveal-left').forEach(el => {
    if (el.closest('.hero')) return;
    const sibs = [...el.parentElement.children].filter(c => c.matches('.reveal-up, .reveal-left'));
    el.style.setProperty('--d', `${Math.min(sibs.indexOf(el), 6) * 0.09}s`);
    revealObs.observe(el);
  });

  /* ---------- Compteurs ---------- */
  const countObs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target, to = +el.dataset.to, start = performance.now(), dur = 1800;
      (function tick(now) {
        const k = Math.min((now - start) / dur, 1);
        el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(tick);
      })(start);
      countObs.unobserve(el);
    });
  }, { threshold: .6 });
  $$('.count').forEach(c => countObs.observe(c));

  /* ---------- Effet 3D (tilt) ---------- */
  if (finePointer && !reduceMotion) {
    $$('.tilt').forEach(el => {
      el.addEventListener('mousemove', e => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - .5;
        const y = (e.clientY - r.top) / r.height - .5;
        el.style.transform = `perspective(900px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg) translateY(-6px)`;
      });
      el.addEventListener('mouseleave', () => {
        el.style.transition = 'transform .7s cubic-bezier(.22,1,.36,1)';
        el.style.transform = '';
        setTimeout(() => (el.style.transition = ''), 700);
      });
    });

    /* Boutons magnétiques */
    $$('.magnetic').forEach(el => {
      el.addEventListener('mousemove', e => {
        const r = el.getBoundingClientRect();
        el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .25}px, ${(e.clientY - r.top - r.height / 2) * .35}px)`;
      });
      el.addEventListener('mouseleave', () => (el.style.transform = ''));
    });

    /* Curseur personnalisé */
    const cursor = $('#cursor');
    let cx = 0, cy = 0, tx = 0, ty = 0;
    addEventListener('mousemove', e => { tx = e.clientX; ty = e.clientY; });
    (function follow() {
      cx += (tx - cx) * .2; cy += (ty - cy) * .2;
      cursor.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
      requestAnimationFrame(follow);
    })();
    document.addEventListener('mouseover', e => {
      cursor.classList.toggle('is-view', !!e.target.closest('.g-item'));
      cursor.classList.toggle('is-hover', !!e.target.closest('a, button, .card, input, select, textarea') && !e.target.closest('.g-item'));
    });
  }

  /* ---------- Portfolio : filtres + chargement progressif ---------- */
  const gallery = $('#gallery');
  const moreBtn = $('#loadMore');
  const PAGE = 16;
  let filter = 'all', shown = PAGE, visibleList = [];

  const itemObs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      itemObs.unobserve(e.target);
    });
  }, { threshold: .1 });

  function renderGallery(animateAll = true) {
    visibleList = PHOTOS.filter(p => filter === 'all' || p.cat === filter);
    const slice = visibleList.slice(0, shown);
    const already = animateAll ? 0 : gallery.children.length;
    if (animateAll) gallery.innerHTML = '';
    slice.slice(already).forEach((p, i) => {
      const fig = document.createElement('figure');
      fig.className = 'g-item' + ((already + i) % 3 === 1 ? ' is-tall' : '');
      fig.style.transitionDelay = `${(i % 8) * 60}ms`;
      fig.innerHTML = `<img src="${p.thumb}" alt="KJ Pictures — ${CATS[p.cat]}" loading="lazy" decoding="async"><figcaption>${CATS[p.cat]}</figcaption>`;
      fig.addEventListener('click', () => openLightbox(already + i));
      gallery.appendChild(fig);
      itemObs.observe(fig);
    });
    moreBtn.parentElement.hidden = shown >= visibleList.length;
  }

  $$('#filters .filter').forEach(btn => btn.addEventListener('click', () => {
    if (btn.classList.contains('is-active')) return;
    $$('#filters .filter').forEach(b => b.classList.toggle('is-active', b === btn));
    filter = btn.dataset.filter;
    shown = PAGE;
    gallery.style.opacity = '0';
    setTimeout(() => { renderGallery(); gallery.style.opacity = ''; }, 250);
  }));
  gallery.style.transition = 'opacity .25s';
  moreBtn.addEventListener('click', () => { shown += PAGE; renderGallery(false); });
  renderGallery();

  /* ---------- Lightbox ---------- */
  const lb = $('#lightbox'), lbImg = $('#lbImg'), lbCap = $('#lbCap');
  let lbIndex = 0;
  function showLb(i) {
    lbIndex = (i + visibleList.length) % visibleList.length;
    const p = visibleList[lbIndex];
    lbImg.classList.remove('is-switching');
    void lbImg.offsetWidth;
    lbImg.src = p.full;
    lbImg.alt = `KJ Pictures — ${CATS[p.cat]}`;
    lbImg.classList.add('is-switching');
    lbCap.textContent = `${CATS[p.cat]} · ${lbIndex + 1} / ${visibleList.length}`;
    // Précharge la suivante
    new Image().src = visibleList[(lbIndex + 1) % visibleList.length].full;
  }
  function openLightbox(i) {
    showLb(i);
    lb.classList.add('is-open');
    lb.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
  }
  function closeLightbox() {
    lb.classList.remove('is-open');
    lb.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
  }
  $('#lbClose').addEventListener('click', closeLightbox);
  $('#lbPrev').addEventListener('click', () => showLb(lbIndex - 1));
  $('#lbNext').addEventListener('click', () => showLb(lbIndex + 1));
  lb.addEventListener('click', e => { if (e.target === lb) closeLightbox(); });
  addEventListener('keydown', e => {
    if (!lb.classList.contains('is-open')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') showLb(lbIndex - 1);
    if (e.key === 'ArrowRight') showLb(lbIndex + 1);
  });
  let touchX = null;
  lb.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', e => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) showLb(lbIndex + (dx < 0 ? 1 : -1));
    touchX = null;
  });

  /* ---------- Bandeau photo défilant (lié au scroll) ---------- */
  const stripA = $('#stripA'), stripB = $('#stripB');
  const shuffle = arr => arr.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(v => v[1]);
  const fillStrip = (el, list) => {
    el.innerHTML = list.map(p => `<img src="${p.thumb}" alt="" loading="lazy" decoding="async">`).join('');
  };
  fillStrip(stripA, shuffle(PHOTOS).slice(0, 14));
  fillStrip(stripB, shuffle(PHOTOS).slice(0, 14));
  const strip = $('.strip');
  const ctaBg = $('.cta-band__bg');
  const parallax = () => {
    const r = strip.getBoundingClientRect();
    if (r.bottom > 0 && r.top < innerHeight) {
      const k = (innerHeight - r.top) / (innerHeight + r.height);
      stripA.style.transform = `translateX(${-k * 40}%)`;
      stripB.style.transform = `translateX(${-40 + k * 40}%)`;
    }
    const c = ctaBg.parentElement.getBoundingClientRect();
    if (c.bottom > 0 && c.top < innerHeight) {
      ctaBg.style.transform = `translateY(${(c.top / innerHeight) * 80}px)`;
    }
  };
  if (!reduceMotion) { addEventListener('scroll', parallax, { passive: true }); parallax(); }

  /* ---------- Formulaire → WhatsApp ---------- */
  $('#bookingForm').addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const lines = [
      'Bonjour KJ Pictures 👋',
      `Je m'appelle ${f.get('name')}.`,
      `Je souhaite réserver : ${f.get('service')}.`,
      f.get('date') ? `Date souhaitée : ${new Date(f.get('date')).toLocaleDateString('fr-FR')}` : '',
      f.get('phone') ? `Mon numéro : ${f.get('phone')}` : '',
      f.get('message') ? `\n${f.get('message')}` : ''
    ].filter(Boolean);
    window.open(`https://wa.me/237695144531?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener');
  });
})();
