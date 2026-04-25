/* ================================================
   KARIPAP BONDA — Main Script
   ================================================ */

const WA_PHONE = '601163593539';

document.addEventListener('DOMContentLoaded', async () => {
  // Connect to db.json automatically (uses stored handle from IndexedDB)
  if (typeof DB !== 'undefined') {
    DB.init();
    await DB.autoConnect();
  }

  // ===== NAVBAR SCROLL =====
  const nav = document.getElementById('mainNav');
  const scrollTopBtn = document.getElementById('scrollTop');

  window.addEventListener('scroll', () => {
    const scrolled = window.scrollY > 60;
    nav.classList.toggle('scrolled', scrolled);
    scrollTopBtn.classList.toggle('visible', window.scrollY > 400);
  });

  // ===== SMOOTH SCROLL FOR NAV LINKS =====
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
      const target = document.querySelector(link.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      const offset = nav.offsetHeight + 10;
      window.scrollTo({ top: target.offsetTop - offset, behavior: 'smooth' });

      // Close mobile menu
      const collapseEl = document.getElementById('navMenu');
      if (collapseEl.classList.contains('show')) {
        bootstrap.Collapse.getInstance(collapseEl)?.hide();
      }
    });
  });

  // ===== SCROLL TO TOP =====
  scrollTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ===== ACTIVE NAV LINK ON SCROLL =====
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-link');

  const activateLink = () => {
    let current = '';
    sections.forEach(section => {
      const top = section.offsetTop - nav.offsetHeight - 60;
      if (window.scrollY >= top) current = section.id;
    });
    navLinks.forEach(link => {
      link.classList.toggle('active', link.getAttribute('href') === `#${current}`);
    });
  };

  window.addEventListener('scroll', activateLink, { passive: true });

  // ===== MENU FILTER =====
  const filterBtns = document.querySelectorAll('.filter-btn');
  const menuItems = document.querySelectorAll('.menu-item');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const filter = btn.dataset.filter;

      menuItems.forEach(item => {
        const match = filter === 'all' || item.dataset.category === filter;
        item.style.opacity = '0';
        item.style.transform = 'scale(0.95)';

        setTimeout(() => {
          item.classList.toggle('hidden', !match);
          if (match) {
            requestAnimationFrame(() => {
              item.style.opacity = '1';
              item.style.transform = 'scale(1)';
            });
          }
        }, 150);
      });
    });
  });

  // ===== ORDER FORM SUBMIT =====
  const form = document.getElementById('orderForm');
  const successMsg = document.getElementById('formSuccess');
  const submitBtn = document.getElementById('submitBtn');

  if (form) {
    form.addEventListener('submit', e => {
      e.preventDefault();

      const btnText    = submitBtn.querySelector('.btn-text');
      const btnLoading = submitBtn.querySelector('.btn-loading');

      btnText.classList.add('d-none');
      btnLoading.classList.remove('d-none');
      submitBtn.disabled = true;

      setTimeout(async () => {
        // Collect form data
        const order = {
          id:        Date.now(),
          nama:      document.getElementById('orderName')?.value.trim()    || '',
          telefon:   document.getElementById('orderPhone')?.value.trim()   || '',
          email:     document.getElementById('orderEmail')?.value.trim()   || '',
          perisa:    document.getElementById('orderPerisa')?.value         || '',
          kuantiti:  document.getElementById('orderKuantiti')?.value       || '',
          mesej:     document.getElementById('orderMesej')?.value.trim()   || '',
          status:    'baru',
          createdAt: new Date().toISOString(),
        };

        // Save order to db.json via DB module
        if (typeof DB !== 'undefined') {
          await DB.saveOrder(order);
        }

        // Hantar notifikasi WhatsApp automatik ke admin
        const d = new Date();
        const tgl = `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
        const msg = [
          '🛒 *PESANAN BARU — Karipap Bonda*',
          '─────────────────────',
          `📅 Tarikh  : ${tgl}`,
          `👤 Nama    : ${order.nama || '—'}`,
          `📞 Telefon : ${order.telefon || '—'}`,
          `📧 E-mel   : ${order.email || '—'}`,
          `🥟 Perisa  : ${order.perisa || '—'}`,
          `📦 Kuantiti: ${order.kuantiti || '—'}`,
          order.mesej ? `📝 Mesej   : ${order.mesej}` : '',
          '─────────────────────',
          'Sila semak panel Admin untuk tindakan lanjut.',
        ].filter(Boolean).join('\n');

        window.open(`https://wa.me/${WA_PHONE}?text=${encodeURIComponent(msg)}`, '_blank');

        btnText.classList.remove('d-none');
        btnLoading.classList.add('d-none');
        submitBtn.disabled = false;
        successMsg.classList.remove('d-none');
        form.reset();
        successMsg.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 1000);
    });
  }

  // ===== AOS — SIMPLE INTERSECTION OBSERVER =====
  const aosEls = document.querySelectorAll('[data-aos]');

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const delay = parseInt(entry.target.dataset.aosDelay || 0);
          setTimeout(() => entry.target.classList.add('aos-animate'), delay);
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );

  aosEls.forEach(el => observer.observe(el));

  // ===== COUNTER ANIMATION =====
  const counters = document.querySelectorAll('.stat-item h3');

  const animateCounter = el => {
    const text = el.textContent;
    const suffix = text.replace(/[\d.]/g, '');
    const target = parseFloat(text);
    const duration = 1600;
    const step = 16;
    const steps = duration / step;
    let current = 0;
    const increment = target / steps;

    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        current = target;
        clearInterval(timer);
      }
      el.textContent = (Number.isInteger(target) ? Math.floor(current) : current.toFixed(1)) + suffix;
    }, step);
  };

  const counterObserver = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          counterObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.5 }
  );

  counters.forEach(el => counterObserver.observe(el));

  // ===== GALLERY LIGHTBOX HINT =====
  document.querySelectorAll('.gallery-placeholder').forEach(el => {
    el.setAttribute('title', 'Gallery — images coming soon!');
  });

});
