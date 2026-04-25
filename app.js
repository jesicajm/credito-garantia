/* ═══════════════════════════════════════════════════════════════
   ABBA Landing — app.js
   - Lógica del filtro (4 preguntas) con descalificación
   - Firebase (Firestore) — guarda registros
   - Meta Pixel — eventos Lead, Disqualified, Qualified
   - Google Ads — conversion tracking
   - WhatsApp redirect tras envío
   ═══════════════════════════════════════════════════════════════ */

   (() => {
    'use strict';
  
    // ─── CONFIG ──────────────────────────────────────────────────
    const CONFIG = {
      firebase: {
        apiKey: 'AIzaSyCX6kqJyaW8d7jmAmomWNkKFEjSTEboIDg',
        authDomain: 'pdf-credito-d72e6.firebaseapp.com',
        projectId: 'pdf-credito-d72e6',
        storageBucket: 'pdf-credito-d72e6.appspot.com',
        messagingSenderId: '13266000813',
        appId: '1:13266000813:web:f4e878c57d4e571fad1f24',
        measurementId: 'G-56F8P4D7QM',
      },
      collection: 'registros_libre_inversion',
      // ⚠️ Reemplaza wa.link/hxop5c por tu link real, o cambia a wa.me/57XXXXXXXXXX si tienes número directo
      whatsappUrl: 'https://wa.link/hxop5c?text=' + encodeURIComponent('Hola, quiero información del crédito con garantía vehicular'),
      googleAdsId: 'AW-XXXXXXXXX',                  // ⚠️ Reemplaza con tu Google Ads ID
      googleAdsConversionLabel: 'XXXXXXXXXX',       // ⚠️ Reemplaza con el label de tu conversión "Lead"
      metaPixelId: 'YOUR_PIXEL_ID',                 // ⚠️ Ya está cargado en index.html
      productName: 'libre_inversion_garantia_vehicular',
    };
  
    // ─── ESTADO ──────────────────────────────────────────────────
    const state = {
      paso: 0,
      filtro: {
        vehiculoLibre: null,
        modeloReciente: null,
        sinReportes: null,
        ingresos: null,
      },
      qualifiedFired: false,
      enviando: false,
      coleccionRegistros: null,
      addDocFn: null,
      rechazoReason: '',
    };
  
    // ─── HELPERS ─────────────────────────────────────────────────
    const $  = (sel, ctx = document) => ctx.querySelector(sel);
    const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  
    const today = () => new Date().toISOString().split('T')[0];
  
    const fbq = (...args) => {
      if (typeof window.fbq !== 'undefined') window.fbq(...args);
    };
  
    const gtagFn = (...args) => {
      if (typeof window.gtag !== 'undefined') window.gtag(...args);
    };
  
    const getCookie = (name) => {
      const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
      return m ? m[1] : null;
    };
  
    const safeUUID = () => {
      if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    };
  
    // ─── FIREBASE LAZY LOAD ──────────────────────────────────────
    // Solo se carga cuando el usuario interactúa con el filtro,
    // no en pageload, para no afectar LCP.
    let firebaseLoaded = false;
    async function loadFirebase() {
      if (firebaseLoaded) return;
      firebaseLoaded = true;
      try {
        const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
        const { getFirestore, collection, addDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
        const app = initializeApp(CONFIG.firebase);
        state.coleccionRegistros = collection(getFirestore(app), CONFIG.collection);
        state.addDocFn = addDoc;
      } catch (e) {
        console.warn('[ABBA] Firebase load failed:', e);
      }
    }
  
    // ─── MARK JS ENABLED ─────────────────────────────────────────
    // Sin esto, las clases .reveal no aplican opacity:0 (mejor para SEO/no-JS)
    document.documentElement.classList.add('js');
  
    // ─── NAVBAR SCROLL EFFECT ────────────────────────────────────
    const nav = $('#nav');
    const onScroll = () => {
      if (window.scrollY > 40) nav.classList.add('nav-scrolled');
      else nav.classList.remove('nav-scrolled');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  
    // ─── REVEAL ON SCROLL ────────────────────────────────────────
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -50px 0px' });
  
      $$('.section-heading, .step, .req-card, .compare-row, .savings-box').forEach((el) => {
        el.classList.add('reveal');
        io.observe(el);
      });
    }
  
    // ─── SMOOTH SCROLL CON OFFSET ────────────────────────────────
    $$('a[href^="#"]').forEach((a) => {
      a.addEventListener('click', (ev) => {
        const id = a.getAttribute('href');
        if (id === '#') return;
        const target = $(id);
        if (!target) return;
        ev.preventDefault();
        const offset = 70;
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
      });
    });
  
    // ─── TRACKING DE CTAs ────────────────────────────────────────
    $$('[data-track]').forEach((el) => {
      el.addEventListener('click', () => {
        const ev = el.getAttribute('data-track');
        fbq('trackCustom', 'CTAClick', { cta: ev });
        gtagFn('event', 'cta_click', { cta_name: ev });
      });
    });
  
    // ─── FILTRO: LÓGICA ──────────────────────────────────────────
    const cards = {
      vehiculoLibre:  { el: $('[data-card="vehiculoLibre"]'),  pos: 0 },
      modeloReciente: { el: $('[data-card="modeloReciente"]'), pos: 1 },
      sinReportes:    { el: $('[data-card="sinReportes"]'),    pos: 2 },
      ingresos:       { el: $('[data-card="ingresos"]'),       pos: 3 },
    };
  
    const REJECT_MESSAGES = {
      sin_vehiculo_libre: 'Este crédito requiere un vehículo a tu nombre completamente libre de deuda. Si aún estás pagando tu carro, podemos avisarte cuando tengamos opciones de compra de cartera.',
      vehiculo_antiguo:   'Las entidades financieras aceptan vehículos modelo 2016 o superior como garantía. Si tu vehículo es más antiguo, déjanos tus datos y te avisamos si abrimos opciones para modelos anteriores.',
      reportes_negativos: 'Los reportes negativos en centrales de riesgo dificultan la aprobación. Te sugerimos resolver tu situación crediticia primero. Déjanos tus datos y te contactamos cuando tengamos opciones.',
      ingresos_bajos:     'Para este tipo de crédito se requieren ingresos mínimos de $6.000.000 mensuales. Si tu situación cambia, estaremos aquí para ayudarte.',
    };
  
    function esPositiva(campo, val) {
      if (campo === 'sinReportes') return val === false;
      return val === true;
    }
  
    function actualizarCard(campo) {
      const { el, pos } = cards[campo];
      const val = state.filtro[campo];
  
      // Reset clases
      el.classList.remove('qcard-active', 'qcard-ok', 'qcard-fail', 'qcard-locked');
  
      if (state.paso < pos) {
        el.classList.add('qcard-locked');
      } else if (val === null) {
        el.classList.add('qcard-active');
      } else if (esPositiva(campo, val)) {
        el.classList.add('qcard-ok');
      } else {
        el.classList.add('qcard-fail');
      }
  
      // Botones seleccionados
      $$('[data-q="' + campo + '"]', el).forEach((btn) => {
        const v = btn.getAttribute('data-v') === 'true';
        btn.classList.remove('qbtn-sel', 'qbtn-dim');
        if (val !== null) {
          if (v === val) btn.classList.add('qbtn-sel');
          else btn.classList.add('qbtn-dim');
        }
      });
  
      // Badge
      const badge = $('.qcard-badge', el);
      if (val === null) {
        badge.innerHTML = '';
      } else if (esPositiva(campo, val)) {
        badge.innerHTML = '<span class="badge-ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg></span>';
      } else {
        badge.innerHTML = '<span class="badge-fail"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>';
      }
    }
  
    function actualizarTodasLasCards() {
      Object.keys(cards).forEach(actualizarCard);
    }
  
    function actualizarProgreso() {
      const respondidas = Object.values(state.filtro).filter((v) => v !== null).length;
      $('#progress-fill').style.width = (respondidas / 4 * 100) + '%';
      $('#progress-num').textContent = respondidas;
  
      const todasOk =
        state.filtro.vehiculoLibre === true &&
        state.filtro.modeloReciente === true &&
        state.filtro.sinReportes === false &&
        state.filtro.ingresos === true;
  
      $('#btn-continuar').style.display = todasOk ? 'inline-flex' : 'none';
    }
  
    function rechazar(reason) {
      state.rechazoReason = reason;
      fbq('trackCustom', 'Disqualified', {
        reason,
        step: state.paso + 1,
        product: CONFIG.productName,
      });
      gtagFn('event', 'disqualified', {
        reason,
        step: state.paso + 1,
      });
      setTimeout(() => cambiarVista('rechazo', REJECT_MESSAGES[reason]), 500);
    }
  
    function dispararQualified() {
      if (state.qualifiedFired) return;
      state.qualifiedFired = true;
      fbq('trackCustom', 'Qualified', { product: CONFIG.productName });
      gtagFn('event', 'qualified', { product: CONFIG.productName });
    }
  
    function responder(campo, valor) {
      state.filtro[campo] = valor;
      loadFirebase(); // lazy carga al primer click
  
      if (campo === 'vehiculoLibre') {
        if (valor === false) { actualizarTodasLasCards(); actualizarProgreso(); rechazar('sin_vehiculo_libre'); return; }
        setTimeout(() => { state.paso = 1; actualizarTodasLasCards(); }, 300);
      }
      else if (campo === 'modeloReciente') {
        if (valor === false) { actualizarTodasLasCards(); actualizarProgreso(); rechazar('vehiculo_antiguo'); return; }
        setTimeout(() => { state.paso = 2; actualizarTodasLasCards(); }, 300);
      }
      else if (campo === 'sinReportes') {
        if (valor === true) { actualizarTodasLasCards(); actualizarProgreso(); rechazar('reportes_negativos'); return; }
        setTimeout(() => { state.paso = 3; actualizarTodasLasCards(); }, 300);
      }
      else if (campo === 'ingresos') {
        if (valor === false) { actualizarTodasLasCards(); actualizarProgreso(); rechazar('ingresos_bajos'); return; }
        dispararQualified();
        setTimeout(() => cambiarVista('formulario'), 500);
      }
  
      actualizarTodasLasCards();
      actualizarProgreso();
    }
  
    // Bind a todos los qbtn
    $$('.qbtn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const campo = btn.getAttribute('data-q');
        const valor = btn.getAttribute('data-v') === 'true';
        responder(campo, valor);
      });
    });
  
    // Init
    actualizarTodasLasCards();
    $('#nc-fecha').setAttribute('min', today());
    $('#f-fecha').setAttribute('min', today());
  
    // Botón continuar
    $('#btn-continuar').addEventListener('click', () => {
      dispararQualified();
      fbq('track', 'ViewContent', { content_name: 'formulario_libre_inversion' });
      gtagFn('event', 'view_form', { product: CONFIG.productName });
      cambiarVista('formulario');
    });
  
    // ─── CAMBIO DE VISTAS ────────────────────────────────────────
    function cambiarVista(nombre, mensaje) {
      $$('.vista').forEach((v) => v.classList.remove('vista-active'));
      $('#vista-' + nombre).classList.add('vista-active');
      if (nombre === 'rechazo' && mensaje) {
        $('#rechazo-mensaje').textContent = mensaje;
      }
      // Scroll suave a la sección del formulario
      const section = $('#simular');
      const top = section.getBoundingClientRect().top + window.scrollY - 70;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  
    // ─── REINICIAR ───────────────────────────────────────────────
    $('#btn-reiniciar').addEventListener('click', () => {
      state.paso = 0;
      state.filtro = { vehiculoLibre: null, modeloReciente: null, sinReportes: null, ingresos: null };
      state.qualifiedFired = false;
      state.rechazoReason = '';
      actualizarTodasLasCards();
      actualizarProgreso();
      cambiarVista('filtro');
    });
  
    // ─── NO CALIFICA: GUARDAR ────────────────────────────────────
    $('#btn-no-califica').addEventListener('click', async () => {
      const nombre = $('#nc-nombre').value.trim();
      const celular = $('#nc-celular').value.trim();
      const email = $('#nc-email').value.trim();
      const fechaPoliza = $('#nc-fecha').value || null;
  
      if (!nombre || !celular) {
        alert('Por favor completa al menos tu nombre y celular.');
        return;
      }
  
      await loadFirebase();
      if (state.coleccionRegistros && state.addDocFn) {
        try {
          await state.addDocFn(state.coleccionRegistros, {
            nombre,
            celular,
            email: email || null,
            fechaRenovacionPoliza: fechaPoliza,
            status: 'no_califica',
            rechazoReason: state.rechazoReason,
            filtro: { ...state.filtro },
            producto: 'libre_inversion',
            timestamp: new Date(),
          });
        } catch (e) { console.error(e); }
      }
  
      fbq('trackCustom', 'WaitlistSignup', { reason: state.rechazoReason });
      gtagFn('event', 'waitlist_signup', { reason: state.rechazoReason });
      alert('Perfecto. Te notificaremos cuando tengamos opciones para tu perfil.');
    });
  
    // ─── FORMULARIO PRINCIPAL ────────────────────────────────────
    const form = $('#form-credito');
    const btnEnviar = $('#btn-enviar');
    const btnLabel  = $('#btn-enviar-label');
  
    // Solo dígitos en celular
    $('#f-celular').addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/[^\d]/g, '');
    });
  
    function validar() {
      const fields = ['f-nombre', 'f-apellido', 'f-celular', 'f-correo'];
      let ok = true;
      fields.forEach((id) => {
        const el = $('#' + id);
        const val = el.value.trim();
        if (!val) {
          el.classList.add('invalid');
          ok = false;
        } else {
          el.classList.remove('invalid');
        }
      });
      // Valida email
      const email = $('#f-correo').value.trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        $('#f-correo').classList.add('invalid');
        ok = false;
      }
      return ok;
    }
  
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (state.enviando) return;
  
      if (!validar()) {
        alert('Por favor completa los campos requeridos.');
        return;
      }
  
      state.enviando = true;
      btnEnviar.disabled = true;
      btnLabel.innerHTML = '<svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" style="display:inline-block;vertical-align:middle;margin-right:6px"><circle cx="12" cy="12" r="9" stroke-dasharray="28" stroke-dashoffset="10"/></svg> Enviando…';
  
      const formData = {
        nombre:        $('#f-nombre').value.trim(),
        primerApellido:$('#f-apellido').value.trim(),
        celular:       $('#f-celular').value.trim(),
        correo:        $('#f-correo').value.trim(),
        proposito:     $('#f-proposito').value || null,
        fechaRenovacionPoliza: $('#f-fecha').value || null,
      };
  
      const eventId = safeUUID();
  
      // Guardar en Firebase
      await loadFirebase();
      let ip = null;
      try {
        const r = await fetch('https://api.ipify.org?format=json').then((r) => r.json());
        ip = r.ip;
      } catch (e) { /* silent */ }
  
      if (state.coleccionRegistros && state.addDocFn) {
        try {
          await state.addDocFn(state.coleccionRegistros, {
            nombre:        formData.nombre,
            apellido:      formData.primerApellido,
            email:         formData.correo,
            phone:         '57' + formData.celular.replace(/^0+/, ''),
            proposito:     formData.proposito,
            fechaRenovacionPoliza: formData.fechaRenovacionPoliza,
            filtro:        { ...state.filtro },
            ip,
            user_agent:    navigator.userAgent,
            fbp:           getCookie('_fbp'),
            fbc:           new URLSearchParams(window.location.search).get('fbclid') || getCookie('_fbc'),
            event_id:      eventId,
            producto:      'libre_inversion',
            status:        'pendiente',
            timestamp:     new Date(),
          });
        } catch (e) { console.error('[ABBA] Firebase save error:', e); }
      }
  
      // Meta Pixel — Lead
      fbq('track', 'Lead', {
        event_id: eventId,
        currency: 'COP',
        content_name: CONFIG.productName,
        content_category: 'libre_inversion',
      });
  
      // Google Ads — Conversion
      gtagFn('event', 'conversion', {
        send_to: CONFIG.googleAdsId + '/' + CONFIG.googleAdsConversionLabel,
        transaction_id: eventId,
      });
      // GA4 — generate_lead (estándar)
      gtagFn('event', 'generate_lead', {
        currency: 'COP',
        value: 0,
        product: CONFIG.productName,
      });
  
      // Redirige a WhatsApp
      setTimeout(() => {
        window.open(CONFIG.whatsappUrl, '_blank');
        btnLabel.textContent = '✓ Enviado — abriendo WhatsApp';
        state.enviando = false;
        btnEnviar.disabled = false;
      }, 600);
    });
  
    // ─── FOOTER YEAR ─────────────────────────────────────────────
    $('#footer-year').textContent = new Date().getFullYear();
  
    // ─── PERF: Lazy carga de Firebase tras 5s si no hay interacción
    setTimeout(loadFirebase, 5000);
  
  })();