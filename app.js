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
      collection: 'registros',
      tipoCredito: 'libre_inversion',
      // ⚠️ Reemplaza wa.link/hxop5c por tu link real, o cambia a wa.me/57XXXXXXXXXX si tienes número directo
      whatsappUrl: 'https://wa.link/hxop5c?text=' + encodeURIComponent('Hola, quiero información del crédito con garantía vehicular'),
      googleAdsId: 'AW-18090223812',
      googleAdsConversionLabel: '39BICKSmlaMcEMTRi7JD',
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
      firestoreDb: null,
      setDocFn: null,
      docFn: null,
      rechazoReason: '',
      // ━━━ Sub-flujo de ingresos (igual que cartera) ━━━
      mostrarInputIngresos: false,
      ingresosRaw: '',          // string solo dígitos
      skipMetaEvent: false,     // true cuando ingresos $4M-$8M (no enviar Lead a Meta)
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
        const { getFirestore, doc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
        const app = initializeApp(CONFIG.firebase);
        state.firestoreDb = getFirestore(app);
        state.setDocFn = setDoc;
        state.docFn = doc;
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
      ingresos_bajos:     'Para este tipo de crédito se requieren ingresos mínimos de $4.000.000 mensuales. Si tu situación cambia, estaremos aquí para ayudarte.',
    };
  
    function esPositiva(campo, val) {
      if (campo === 'sinReportes') return val === false;
      if (campo === 'ingresos') return val === true || val === 'medio';
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
  
      // ingresos puede ser: true (>$8M) o "medio" ($4M-$8M) — ambos califican
      const ingresosOk = state.filtro.ingresos === true || state.filtro.ingresos === 'medio';
      const todasOk =
        state.filtro.vehiculoLibre === true &&
        state.filtro.modeloReciente === true &&
        state.filtro.sinReportes === false &&
        ingresosOk;
  
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

      // Meta Pixel — evento custom Qualified
      fbq('trackCustom', 'Qualified', { product: CONFIG.productName });

      // GA4 — evento qualified_lead (puedes usarlo en GA4 como conversión)
      gtagFn('event', 'qualified_lead', {
        product: CONFIG.productName,
        currency: 'COP',
        value: 1.0,
      });

      // Google Ads — evento personalizado para conversión secundaria.
      // Si más adelante creas una conversión de tipo "Qualified Lead" en
      // Google Ads, te van a dar otro Conversion Label. Reemplázalo aquí
      // y descomenta el bloque para activarlo.
      //
      // gtagFn('event', 'conversion', {
      //   send_to: CONFIG.googleAdsId + '/OTRO_LABEL_AQUI',
      //   value: 1.0,
      //   currency: 'COP',
      // });
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
        // Caso 1: Sí (>$8M) → skipMetaEvent=false, avanzar
        if (valor === true) {
          state.skipMetaEvent = false;
          dispararQualified();
          setTimeout(() => cambiarVista('formulario'), 500);
        }
        // Caso 2: "medio" ($4M-$8M) — viene de confirmarIngresoMedio()
        else if (valor === 'medio') {
          state.skipMetaEvent = true;  // NO disparar Lead a Meta
          dispararQualified();
          setTimeout(() => cambiarVista('formulario'), 500);
        }
        // Caso 3: false (<$4M) — viene de rechazarPorIngresos()
        else if (valor === false) {
          actualizarTodasLasCards(); actualizarProgreso(); rechazar('ingresos_bajos');
          return;
        }
      }
  
      actualizarTodasLasCards();
      actualizarProgreso();
    }
  
    // Bind a todos los qbtn que tengan data-q
    // (el botón "No" de ingresos no tiene data-q porque abre el sub-input)
    $$('.qbtn[data-q]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const campo = btn.getAttribute('data-q');
        const valor = btn.getAttribute('data-v') === 'true';
        responder(campo, valor);
      });
    });

    // ━━━ SUB-FLUJO INGRESOS ($4M-$8M = "medio", <$4M = rechazo) ━━━

    function formatearCOP(numStr) {
      if (!numStr) return '';
      return Number(numStr).toLocaleString('es-CO');
    }

    function actualizarUIIngresos() {
      const monto = parseInt(state.ingresosRaw, 10) || 0;
      const wrap = $('#income-wrap');
      const warn = $('#income-warn');
      const btnCont = $('#btn-ingresos-continuar');

      wrap.style.display = state.mostrarInputIngresos ? 'block' : 'none';

      if (!state.mostrarInputIngresos) {
        warn.style.display = 'none';
        btnCont.style.display = 'none';
        return;
      }

      // Lógica de los 3 caminos según el monto
      if (monto === 0) {
        warn.style.display = 'none';
        btnCont.style.display = 'none';
      } else if (monto < 4000000) {
        // <$4M → mostrar warning + botón rojo "Continuar" que rechaza
        warn.style.display = 'flex';
        btnCont.style.display = 'inline-flex';
        btnCont.classList.add('qbtn-reject');
        btnCont.dataset.action = 'rechazar';
      } else {
        // $4M-$8M → ingreso "medio" — botón normal
        warn.style.display = 'none';
        btnCont.style.display = 'inline-flex';
        btnCont.classList.remove('qbtn-reject');
        btnCont.dataset.action = 'medio';
      }
    }

    // Click en "No" → abrir sub-input
    $('#btn-ingresos-no').addEventListener('click', () => {
      state.mostrarInputIngresos = true;
      actualizarUIIngresos();
      // Marca botón "No" como seleccionado visualmente
      const btnNo = $('#btn-ingresos-no');
      const btnSi = document.querySelector('[data-q="ingresos"][data-v="true"]');
      btnNo.classList.add('qbtn-sel');
      if (btnSi) btnSi.classList.add('qbtn-dim');
      setTimeout(() => {
        const input = $('#input-ingresos');
        if (input) input.focus();
      }, 100);
    });

    // Input de ingresos: solo dígitos + formato COP
    $('#input-ingresos').addEventListener('input', (e) => {
      const soloDigitos = e.target.value.replace(/[^\d]/g, '');
      state.ingresosRaw = soloDigitos;
      e.target.value = formatearCOP(soloDigitos);
      actualizarUIIngresos();
    });

    // Botón "Continuar" del sub-flujo: decide entre medio y rechazo
    $('#btn-ingresos-continuar').addEventListener('click', () => {
      const action = $('#btn-ingresos-continuar').dataset.action;
      const monto = parseInt(state.ingresosRaw, 10) || 0;
      if (action === 'medio') {
        // $4M-$8M → "medio" → skipMetaEvent
        state.filtro.ingresos = 'medio';
        state.mostrarInputIngresos = false;
        actualizarUIIngresos();
        actualizarTodasLasCards();
        actualizarProgreso();
        responder('ingresos', 'medio');
      } else if (action === 'rechazar') {
        // <$4M → rechazo
        state.filtro.ingresos = false;
        state.mostrarInputIngresos = false;
        actualizarUIIngresos();
        actualizarTodasLasCards();
        actualizarProgreso();
        responder('ingresos', false);
      }
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
      state.mostrarInputIngresos = false;
      state.ingresosRaw = '';
      state.skipMetaEvent = false;
      // Reset visual del input
      const input = $('#input-ingresos');
      if (input) input.value = '';
      actualizarUIIngresos();
      // Reset clase de botones de ingresos
      $('#btn-ingresos-no').classList.remove('qbtn-sel');
      const btnSi = document.querySelector('[data-q="ingresos"][data-v="true"]');
      if (btnSi) btnSi.classList.remove('qbtn-dim');
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
  
      const eventId = safeUUID();

      await loadFirebase();
      if (state.firestoreDb && state.setDocFn && state.docFn) {
        try {
          // Usamos setDoc con UUID custom como docId
          // → Cloud Function tendrá event.params.docId === eventId
          // → CAPI y Pixel deduplican por mismo event_id
          const ref = state.docFn(state.firestoreDb, CONFIG.collection, eventId);
          await state.setDocFn(ref, {
            // ━━━ Campos comunes (compatibles con Cloud Function existente) ━━━
            name: nombre,
            lastName: '',
            email: email || null,
            phone: email ? ('57' + celular.replace(/^0+/, '')) : ('57' + celular.replace(/^0+/, '')),

            // ━━━ Diferenciador ━━━
            tipoCredito: CONFIG.tipoCredito,

            // ━━━ Estado ━━━
            status: 'no_califica',
            califica: false,
            solicitudEnviada: false,
            // ⚠️ Para "no califica" NO disparamos CAPI Lead (no es un lead real)
            skipMetaEvent: true,

            // ━━━ Fechas ━━━
            fechaRenovacionPoliza: fechaPoliza,
            timestamp: new Date(),

            // ━━━ Específico libre inversión ━━━
            libreInversionInfo: {
              vehiculoLibreDeuda: state.filtro.vehiculoLibre,
              vehiculoModelo2016Plus: state.filtro.modeloReciente,
              sinReportesNegativos: state.filtro.sinReportes === false,
              ingresosSuperiores8M: state.filtro.ingresos,
              ingresosMensuales: parseInt(state.ingresosRaw, 10) || null,
              proposito: null,
              rechazoReason: state.rechazoReason,
            },

            // ━━━ Event tracking ━━━
            event_id: eventId,
          });
        } catch (e) { console.error('[ABBA] Firebase no-califica error:', e); }
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
  
      // ⭐ UUID custom — se usa como docId en Firestore Y como event_id en Pixel/CAPI
      // → Cloud Function recibe event.params.docId === eventId
      // → Meta deduplica entre Pixel (browser) y CAPI (server) por mismo ID
      const eventId = safeUUID();
  
      // Guardar en Firebase
      await loadFirebase();
      let ip = null;
      try {
        const r = await fetch('https://api.ipify.org?format=json').then((r) => r.json());
        ip = r.ip;
      } catch (e) { /* silent */ }
  
      if (state.firestoreDb && state.setDocFn && state.docFn) {
        try {
          const ref = state.docFn(state.firestoreDb, CONFIG.collection, eventId);
          await state.setDocFn(ref, {
            // ━━━ Campos comunes (compatibles con Cloud Function existente) ━━━
            name:          formData.nombre,
            lastName:      formData.primerApellido,
            email:         formData.correo,
            phone:         '57' + formData.celular.replace(/^0+/, ''),

            // ━━━ Diferenciador ━━━
            tipoCredito:   CONFIG.tipoCredito,

            // ━━━ Estado ━━━
            status:        'pendiente',
            califica:      true,
            solicitudEnviada: false,
            // ⭐ skipMetaEvent refleja si los ingresos están en rango medio ($4M-$8M)
            // → Cloud Function NO disparará CAPI Lead (consistente con Pixel client-side)
            skipMetaEvent: state.skipMetaEvent,
            montoCredito:  null,

            // ━━━ Fechas ━━━
            fechaRenovacionPoliza: formData.fechaRenovacionPoliza,
            timestamp:     new Date(),

            // ━━━ Específico libre inversión ━━━
            libreInversionInfo: {
              vehiculoLibreDeuda:      state.filtro.vehiculoLibre,
              vehiculoModelo2016Plus:  state.filtro.modeloReciente,
              sinReportesNegativos:    state.filtro.sinReportes === false,
              // ingresosSuperiores8M: true ($>8M) | "medio" ($4M-$8M)
              ingresosSuperiores8M:    state.filtro.ingresos,
              // Monto exacto si lo ingresó (rango medio)
              ingresosMensuales:       parseInt(state.ingresosRaw, 10) || null,
              proposito:               formData.proposito,
              rechazoReason:           null,
            },

            // ━━━ User data para CAPI / matching ━━━
            ip,
            user_agent:    navigator.userAgent,
            fbp:           getCookie('_fbp'),
            fbc:           new URLSearchParams(window.location.search).get('fbclid') || getCookie('_fbc'),

            // ━━━ Event tracking (event_id == docId) ━━━
            event_id:      eventId,
          });
        } catch (e) { console.error('[ABBA] Firebase save error:', e); }
      }
  
      // ━━━ Meta Pixel — Lead (browser side) ━━━
      // ⚠️ Solo disparamos Lead si los ingresos NO están en rango medio.
      // skipMetaEvent === true cuando ingresos $4M-$8M (lead se guarda pero no cuenta como conversión).
      // El Cloud Function tiene la misma lógica (lee skipMetaEvent del doc) → consistencia perfecta.
      if (!state.skipMetaEvent) {
        fbq('track', 'Lead', {
          currency: 'COP',
          content_name: CONFIG.productName,
          content_category: CONFIG.tipoCredito,
          value: 1.0,
        }, {
          eventID: eventId,
        });
      }
  
      // GA4 — generate_lead (estándar)
      gtagFn('event', 'generate_lead', {
        currency: 'COP',
        value: 1.0,
        product: CONFIG.productName,
      });

      // ─── Google Ads Conversion ─────────────────────────────────
      // Disparamos la conversión con event_callback para garantizar
      // que se registra ANTES de redirigir a WhatsApp.
      // Si gtag tarda más de 1.5s o no carga, abrimos WhatsApp igual.
      let redirected = false;
      const goToWhatsApp = () => {
        if (redirected) return;
        redirected = true;
        window.open(CONFIG.whatsappUrl, '_blank');
        btnLabel.textContent = '✓ Enviado — abriendo WhatsApp';
        state.enviando = false;
        btnEnviar.disabled = false;
      };

      if (typeof window.gtag !== 'undefined') {
        gtag('event', 'conversion', {
          send_to: CONFIG.googleAdsId + '/' + CONFIG.googleAdsConversionLabel,
          value: 1.0,
          currency: 'COP',
          transaction_id: eventId,
          event_callback: goToWhatsApp,
        });
        // Failsafe: si callback no responde en 1.5s, redirigir igual
        setTimeout(goToWhatsApp, 1500);
      } else {
        // gtag no cargó (adblocker, error de red) — redirigir directo
        setTimeout(goToWhatsApp, 600);
      }
    });
  
    // ─── FOOTER YEAR ─────────────────────────────────────────────
    $('#footer-year').textContent = new Date().getFullYear();
  
    // ─── PERF: Lazy carga de Firebase tras 5s si no hay interacción
    setTimeout(loadFirebase, 5000);
  
  })();