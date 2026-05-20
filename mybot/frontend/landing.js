/* ZeptAI — Landing Page JS */
'use strict';

/* ── Mobile nav toggle ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('navToggle');
  const links  = document.getElementById('navLinks');
  if (toggle && links) {
    toggle.addEventListener('click', () => links.classList.toggle('open'));
  }

  /* ── Scroll fade-in observer ── */
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.fade-up').forEach(el => obs.observe(el));

  /* ── Register service worker ── */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/static/service-worker.js')
      .then(() => console.log('[ZeptAI] Service Worker registered'))
      .catch(e => console.warn('[ZeptAI] SW registration failed:', e));
  }
});

/* ── CTA navigation helpers ─────────────────────────────────────────────── */
function goToLogin()  { window.location.href = '/auth?mode=login'; }
function goToSignup() { window.location.href = '/auth?mode=signup'; }
function goToIntake() { window.location.href = '/dashboard'; }
