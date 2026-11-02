/* Progressive enhancement for marketing pages only. */
(() => {
  const page = document.querySelector('.marketing-page');
  if (!page) return;
  const toggle = page.querySelector('.menu-toggle');
  const nav = page.querySelector('.nav-links');
  if (toggle && nav) {
    const closeMenu = (restoreFocus = false) => {
      const wasOpen = toggle.getAttribute('aria-expanded') === 'true';
      nav.classList.remove('active');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open menu');
      if (restoreFocus && wasOpen) toggle.focus();
    };
    toggle.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('active');
      toggle.setAttribute('aria-expanded', String(isOpen));
      toggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
    });
    nav.addEventListener('click', event => {
      if (event.target.closest('a')) closeMenu();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeMenu(true);
    });
    document.addEventListener('click', event => {
      if (!event.target.closest('.site-header')) closeMenu();
    });
    const desktop = window.matchMedia('(min-width: 761px)');
    desktop.addEventListener('change', () => {
      if (desktop.matches) closeMenu();
    });
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reducedMotion.matches || !('IntersectionObserver' in window) || !Element.prototype.animate) return;
  const pending = new Set();
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const element = entry.target;
      element.classList.remove('reveal-pending');
      element.classList.add('reveal-enter');
      pending.delete(element);
      observer.unobserve(element);
      element.addEventListener('animationend', () => element.classList.remove('reveal-enter'), { once: true });
    });
  }, { threshold: 0.08 });
  page.querySelectorAll('[data-reveal]').forEach(element => {
    // The initial viewport is ready immediately; only approaching content reveals.
    if (element.getBoundingClientRect().top <= window.innerHeight) return;
    pending.add(element);
    observer.observe(element);
    element.classList.add('reveal-pending');
  });
  page.addEventListener('focusin', event => {
    const element = event.target.closest('[data-reveal]');
    if (!element) return;
    element.classList.remove('reveal-pending', 'reveal-enter');
    pending.delete(element);
    observer.unobserve(element);
  });
  reducedMotion.addEventListener('change', event => {
    if (!event.matches) return;
    observer.disconnect();
    pending.forEach(element => element.classList.remove('reveal-pending'));
    pending.clear();
    page.querySelectorAll('.reveal-enter').forEach(element => element.classList.remove('reveal-enter'));
  });
})();
