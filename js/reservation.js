/* ============================================================
   FIXEO V7 — CENTRALIZED RESERVATION & BOOKING MODULE
   Unique module · All Reserve buttons use this module
   CompatIble with FixeoPayment engine
   ============================================================ */

(function (window) {
  'use strict';

  /* ════════════════════════════════════════════════════════
     CONFIG
  ════════════════════════════════════════════════════════ */
  const MODAL_ID = 'fixeo-reservation-modal';
  const BACKDROP_ID = 'fixeo-reservation-backdrop';

  const SERVICE_MAP = {
    plomberie:    ['Fuite d\'eau — réparation', 'Installation sanitaire', 'Chauffe-eau', 'Salle de bain complète', 'Urgence 24/7'],
    electricite:  ['Tableau électrique', 'Prises / Interrupteurs', 'Éclairage LED', 'Domotique', 'Urgence électrique'],
    peinture:     ['Peinture intérieure', 'Peinture extérieure', 'Décoration murale', 'Ravalement de façade'],
    nettoyage:    ['Nettoyage complet domicile', 'Fin de chantier', 'Entretien régulier', 'Désinfection', 'Vitrerie'],
    jardinage:    ['Tonte de pelouse', 'Taille arbres & haies', 'Aménagement paysager', 'Arrosage automatique'],
    demenagement: ['Déménagement complet', 'Emballage seul', 'Transport mobilier', 'Montage / démontage meubles'],
    bricolage:    ['Montage meubles IKEA', 'Fixations murales', 'Petits travaux DIY', 'Carrelage'],
    climatisation:['Installation climatiseur', 'Entretien annuel', 'Réparation panne', 'Pompe à chaleur'],
    menuiserie:   ['Portes & Fenêtres', 'Meubles sur mesure', 'Parquet / plancher', 'Terrasse bois'],
    maconnerie:   ['Carrelage & joints', 'Enduit & plâtre', 'Construction muret', 'Rénovation façade'],
  };

  const TIME_SLOTS = [
    { value: 'matin',      label: '🌅 Matin (8h–12h)',        icon: '🌅' },
    { value: 'apresmidi',  label: '☀️ Après-midi (14h–18h)',  icon: '☀️' },
    { value: 'soir',       label: '🌆 Soir (18h–20h)',        icon: '🌆' },
  ];

  const CATEGORY_LABELS = {
    plomberie: 'Plomberie', electricite: 'Électricité', peinture: 'Peinture',
    nettoyage: 'Nettoyage', jardinage: 'Jardinage', demenagement: 'Déménagement',
    bricolage: 'Bricolage', climatisation: 'Climatisation', menuiserie: 'Menuiserie',
    maconnerie: 'Maçonnerie',
  };

  const CATEGORY_ICONS = {
    plomberie: '🔧', electricite: '⚡', peinture: '🎨', nettoyage: '🧹',
    jardinage: '🌿', demenagement: '🚛', bricolage: '🔨', climatisation: '❄️',
    menuiserie: '🪚', maconnerie: '🧱',
  };

  /* ════════════════════════════════════════════════════════
     STATE
  ════════════════════════════════════════════════════════ */
  const state = {
    artisan: null,
    isExpress: false,
    isUrgent: false,   // set by open() when urgentContext?.urgent === true
    step: 1, // 1=form, 2=confirm
    selectedService: '',
    selectedDate: '',
    selectedSlot: 'matin',
    description: '',
    address: '',
    phone: '',
  };

  /* ════════════════════════════════════════════════════════
     UTILS
  ════════════════════════════════════════════════════════ */
  function sanitize(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(String(str)));
    return d.innerHTML;
  }

  function todayISO() {
    return new Date().toISOString().split('T')[0];
  }

  function formatDateFR(isoDate) {
    if (!isoDate) return '';
    return new Date(isoDate).toLocaleDateString('fr-FR', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }

  function getArtisanById(id) {
    /* Check window.ARTISANS first, then fall back to bare ARTISANS (set by main.js) */
    const pool = window.ARTISANS || (typeof ARTISANS !== 'undefined' && Array.isArray(ARTISANS) ? ARTISANS : null);
    if (pool) {
      return pool.find(a => a.id === id || a.id === parseInt(id)) || null;
    }
    return null;
  }

  function normalizeArtisan(input) {
    if (!input) return null;
    // If it's a number/string id
    if (typeof input === 'number' || (typeof input === 'string' && !isNaN(input))) {
      return getArtisanById(input);
    }
    // If it's already an object
    if (typeof input === 'object') {
      return {
        id: input.id || 0,
        name: input.name || input.artisanName || 'Artisan',
        initials: input.initials || (input.name ? input.name.split(' ').map(w => w[0]).join('').substring(0,2) : 'AR'),
        category: input.category || input.specialty?.toLowerCase() || 'bricolage',
        city: input.city || 'Maroc',
        rating: input.rating || 4.8,
        reviewCount: input.reviewCount || 0,
        trustScore: input.trustScore || 90,
        priceFrom: input.priceFrom || input.hourlyRate || 150,
        priceUnit: input.priceUnit || 'intervention',
        availability: input.availability || 'available',
        badges: input.badges || ['verified'],
        skills: input.skills || [],
        phone: input.phone || '',
        email: input.email || '',
        bio: input.bio || { fr: '' },
      };
    }
    return null;
  }

  function getServices(artisan) {
    if (!artisan) return ['Service standard'];
    const cat = artisan.category?.toLowerCase();
    return SERVICE_MAP[cat] || artisan.skills || ['Service standard', 'Autre'];
  }

  /* ════════════════════════════════════════════════════════
     BACKDROP
  ════════════════════════════════════════════════════════ */
  function ensureBackdrop() {
    let bd = document.getElementById(BACKDROP_ID);
    if (!bd) {
      bd = document.createElement('div');
      bd.id = BACKDROP_ID;
      bd.className = 'fixeo-res-backdrop';
      bd.onclick = close;
      document.body.appendChild(bd);
    }
    bd.classList.add('open');
    return bd;
  }

  function removeBackdrop() {
    const bd = document.getElementById(BACKDROP_ID);
    if (bd) bd.classList.remove('open');
  }

  /* ════════════════════════════════════════════════════════
     MODAL SHELL
  ════════════════════════════════════════════════════════ */
  function ensureModal() {
    let modal = document.getElementById(MODAL_ID);
    if (!modal) {
      modal = document.createElement('div');
      modal.id = MODAL_ID;
      modal.className = 'fixeo-res-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-label', 'Réservation');
      document.body.appendChild(modal);
    }
    return modal;
  }

  /* ════════════════════════════════════════════════════════
     RENDER STEP 1 — BOOKING FORM
  ════════════════════════════════════════════════════════ */
  function renderStep1() {
    const a = state.artisan;
    const services = getServices(a);
    const catLabel = CATEGORY_LABELS[a?.category] || 'Service';
    const catIcon  = CATEGORY_ICONS[a?.category]  || '🛠️';
    const today    = todayISO();

    // Express mode specific content
    // ── Top banner: express OR urgent OR nothing ────────────────
    const expressHeader = state.isExpress
      ? `<div class="fixeo-res-express-banner">
          <span class="fixeo-res-express-icon">🚀</span>
          <div>
            <div class="fixeo-res-express-title">Intervention EXPRESS</div>
            <div class="fixeo-res-express-sub">Artisan disponible dans moins d'1 heure · +50 MAD</div>
          </div>
        </div>`
      : state.isUrgent
        ? `<div class="fixeo-res-express-banner" style="background:rgba(255,65,108,.12);border-color:rgba(255,65,108,.3)">
            <span class="fixeo-res-express-icon">⚡</span>
            <div>
              <div class="fixeo-res-express-title" style="color:#ff416c">Intervention urgente</div>
              <div class="fixeo-res-express-sub">Priorité de disponibilité · Réponse rapide garantie</div>
            </div>
          </div>`
        : '';

    // ── Slot / date block: express → now, urgent → dès que possible, normal → picker ──
    const slotsHtml = (state.isExpress || state.isUrgent) ? `
      <div class="fixeo-res-field">
        <label class="fixeo-res-label">${state.isUrgent ? '⏱ Disponibilité' : 'Disponibilité'}</label>
        <div class="fixeo-res-slot-grid">
          <div class="fixeo-res-slot active" data-slot="maintenant">${state.isUrgent ? '⚡ Dès que possible' : '⚡ Dès maintenant'}</div>
        </div>
      </div>` : `
      <div class="fixeo-res-field">
        <label class="fixeo-res-label">📅 Date souhaitée</label>
        <input type="date" class="fixeo-res-input" id="res-date"
               min="${today}" value="${state.selectedDate || today}"
               onchange="FixeoReservation._onDateChange(this.value)"/>
      </div>
      <div class="fixeo-res-field">
        <label class="fixeo-res-label">⏰ Créneau horaire</label>
        <div class="fixeo-res-slot-grid" id="res-slot-grid">
          ${(function(){
            const _artId = a ? a.id : 0;
            const _bookedSlots = (window.FixeoSlotLock && _artId)
              ? window.FixeoSlotLock.getBookedSlots(_artId, state.selectedDate || todayISO())
              : [];
            return TIME_SLOTS.map(ts => {
              const _isBooked = _bookedSlots.includes(ts.value);
              const _bookedClass = _isBooked ? ' slot-booked' : '';
              const _bookedAttr  = _isBooked ? ' aria-disabled="true" title="⛔ Créneau déjà réservé"' : '';
              const _clickHandler = _isBooked
                ? 'FixeoSlotLock._onBookedSlotClick(event)'
                : `FixeoReservation._onSlotClick(this, '${ts.value}')`;
              const _activeClass = (!_isBooked && state.selectedSlot === ts.value) ? ' active' : '';
              return `<div class="fixeo-res-slot${_activeClass}${_bookedClass}" data-slot="${ts.value}"${_bookedAttr} onclick="${_clickHandler}">${ts.label}</div>`;
            }).join('');
          })()}
        </div>
      </div>`;

    // Artisan score/badges
    const badgesHtml = (a.badges || []).slice(0,3).map(b => {
      const badge = {
        verified: { label: 'Vérifié', icon: '✅' },
        pro: { label: 'Pro', icon: '🥇' },
        top_rated: { label: 'Top Noté', icon: '⭐' },
        legendary: { label: 'Légendaire', icon: '🏆' },
        expert: { label: 'Expert', icon: '🎓' },
        responsive: { label: 'Réactif', icon: '⚡' },
        friendly: { label: 'Sympathique', icon: '😊' },
      }[b] || { label: b, icon: '🏅' };
      return `<span class="fixeo-res-badge">${badge.icon} ${badge.label}</span>`;
    }).join('');

    const availClass = a.availability === 'available' ? 'available' : (a.availability === 'busy' ? 'busy' : 'offline');
    const availLabel = a.availability === 'available' ? '● Disponible' : (a.availability === 'busy' ? '● Occupé' : '● Hors ligne');

    return `
      <div class="fixeo-res-dialog" role="document">
        <!-- Header -->
        <div class="fixeo-res-header">
          <div class="fixeo-res-header-left">
            <div class="fixeo-res-header-icon">${catIcon}</div>
            <div>
              <div class="fixeo-res-header-title">${state.isExpress ? '🚀 Réservation Express' : state.isUrgent ? '⚡ Réservation urgente' : '📅 Réserver un artisan'}</div>
              <div class="fixeo-res-header-sub">Étape 1 sur 2 — Détails de la réservation</div>
            </div>
          </div>
          <button class="fixeo-res-close" onclick="FixeoReservation.close()" aria-label="Fermer">✕</button>
        </div>

        <!-- Steps indicator -->
        <div class="fixeo-res-steps">
          <div class="fixeo-res-step active">
            <div class="fixeo-res-step-dot active">1</div>
            <div class="fixeo-res-step-label">Détails</div>
          </div>
          <div class="fixeo-res-step-line"></div>
          <div class="fixeo-res-step">
            <div class="fixeo-res-step-dot">2</div>
            <div class="fixeo-res-step-label">Paiement</div>
          </div>
        </div>

        <!-- Body -->
        <div class="fixeo-res-body">

          <!-- Artisan Card -->
          <div class="fixeo-res-artisan-card">
            <div class="fixeo-res-artisan-avatar">${sanitize(a.initials || 'AR')}</div>
            <div class="fixeo-res-artisan-info">
              <div class="fixeo-res-artisan-name">${sanitize(a.name)}</div>
              <div class="fixeo-res-artisan-meta">
                ${catIcon} ${catLabel} · 📍 ${sanitize(a.city)}
              </div>
              <div class="fixeo-res-artisan-row">
                <span class="fixeo-res-stars">${'★'.repeat(Math.floor(a.rating || 4))}</span>
                <span class="fixeo-res-rating">${a.rating || '4.8'}</span>
                <span class="fixeo-res-reviews">(${a.reviewCount || 0} avis)</span>
                <span class="fixeo-res-avail ${availClass}">${availLabel}</span>
              </div>
              <div class="fixeo-res-badges">${badgesHtml}</div>
            </div>
            <div class="fixeo-res-artisan-price">
              <div class="fixeo-res-price-val">${a.priceFrom} MAD</div>
              <div class="fixeo-res-price-unit">${a.priceLabel || ('\u00c0 partir de ' + (a.priceFrom||150) + ' MAD')}</div>
            </div>
          </div>

          ${expressHeader}

          <!-- Form -->
          <div class="fixeo-res-form" id="fixeo-res-form">

            <div class="fixeo-res-field">
              <label class="fixeo-res-label">🛠️ Service souhaité *</label>
              <select class="fixeo-res-select" id="res-service"
                      onchange="FixeoReservation._onServiceChange(this.value)">
                <option value="">-- Choisissez un service --</option>
                ${services.map(s => `
                  <option value="${sanitize(s)}"${state.selectedService === s ? ' selected' : ''}>
                    ${sanitize(s)} — ${a.priceLabel || (a.priceFrom + ' MAD')}
                  </option>`).join('')}
              </select>
            </div>

            ${slotsHtml}

            <div class="fixeo-res-field">
              <label class="fixeo-res-label">📝 Description du problème</label>
              <textarea class="fixeo-res-textarea" id="res-desc" rows="3"
                        placeholder="Décrivez votre besoin en détail…"
                        oninput="FixeoReservation._onDescChange(this.value)">${sanitize(state.description)}</textarea>
            </div>

            <div class="fixeo-res-field">
              <label class="fixeo-res-label">📍 Adresse d'intervention *</label>
              <input type="text" class="fixeo-res-input" id="res-address"
                     placeholder="Ex: 12 Rue Mohammed V, Casablanca"
                     value="${sanitize(state.address)}"
                     oninput="FixeoReservation._onAddressChange(this.value)"/>
            </div>

            ${(state.isExpress || state.isUrgent) ? `
            <div class="fixeo-res-field">
              <label class="fixeo-res-label">📞 Votre téléphone *</label>
              <input type="tel" class="fixeo-res-input" id="res-phone"
                     placeholder="+212 6XX XXX XXX"
                     value="${sanitize(state.phone)}"
                     oninput="FixeoReservation._onPhoneChange(this.value)"/>
            </div>` : ''}

            <div class="fixeo-res-price-info">
              💡 <strong>Tarif estimé :</strong> ${a.priceLabel || (a.priceFrom + ' MAD')} (estimation marché)
              + 5% frais de service Fixeo${state.isExpress ? ' + 50 MAD supplément express' : ''}
            </div>

            <div class="fixeo-res-error" id="res-error" style="display:none"></div>

            <button class="fixeo-res-btn-primary" onclick="FixeoReservation._submitStep1()">
              Continuer → Récapitulatif 📋
            </button>
          </div>
        </div>

        <!-- Footer -->
        <div class="fixeo-res-footer">
          <div class="fixeo-res-security">
            <span>🔒 SSL 256-bit</span>
            <span>🛡️ 3D Secure</span>
            <span>✅ PCI-DSS</span>
            <span>🔄 Remboursement 14j</span>
          </div>
        </div>
      </div>
    `;
  }

  /* ════════════════════════════════════════════════════════
     RENDER STEP 2 — SUMMARY & CONFIRM
  ════════════════════════════════════════════════════════ */
  function renderStep2() {
    const a = state.artisan;
    const serviceTotal = state.isExpress && state.selectedService?.includes('Urgence') ? (a.priceFrom * 1.3 | 0) : a.priceFrom;
    const platformFee  = Math.round(serviceTotal * 0.05);
    const expressFee   = state.isExpress ? 50 : 0;
    const total        = serviceTotal + platformFee + expressFee;

    const catIcon = CATEGORY_ICONS[a?.category] || '🛠️';
    const slotLabel = TIME_SLOTS.find(t => t.value === state.selectedSlot)?.label || state.selectedSlot || 'Dès maintenant';

    const rows = [
      ['Artisan',      sanitize(a.name)],
      ['Service',      sanitize(state.selectedService || 'Service')],
      state.isExpress
        ? ['Intervention', '🚀 Express (dans l\'heure)']
        : ['Date',      sanitize(formatDateFR(state.selectedDate))],
      state.isExpress
        ? ['Créneau',   '⚡ Dès maintenant']
        : ['Créneau',   sanitize(slotLabel)],
      state.description ? ['Description', sanitize(state.description.substring(0, 60) + (state.description.length > 60 ? '…' : ''))] : null,
      ['Adresse',      sanitize(state.address)],
      ['Tarif service', `${a.priceLabel || (serviceTotal + ' MAD')} (indicatif)`],
      ['Frais de service (5%)', `${platformFee} MAD`],
    ].filter(Boolean);

    if (expressFee > 0) rows.push(['🚀 Supplément Express', `+ ${expressFee} MAD`]);

    return `
      <div class="fixeo-res-dialog" role="document">
        <!-- Header -->
        <div class="fixeo-res-header">
          <div class="fixeo-res-header-left">
            <div class="fixeo-res-header-icon">${catIcon}</div>
            <div>
              <div class="fixeo-res-header-title">📋 Récapitulatif</div>
              <div class="fixeo-res-header-sub">Étape 2 sur 2 — Confirmation & Paiement</div>
            </div>
          </div>
          <button class="fixeo-res-close" onclick="FixeoReservation.close()" aria-label="Fermer">✕</button>
        </div>

        <!-- Steps indicator -->
        <div class="fixeo-res-steps">
          <div class="fixeo-res-step completed">
            <div class="fixeo-res-step-dot completed">✓</div>
            <div class="fixeo-res-step-label">Détails</div>
          </div>
          <div class="fixeo-res-step-line active"></div>
          <div class="fixeo-res-step active">
            <div class="fixeo-res-step-dot active">2</div>
            <div class="fixeo-res-step-label">Paiement</div>
          </div>
        </div>

        <!-- Body -->
        <div class="fixeo-res-body">

          ${state.isExpress ? `
          <div class="fixeo-res-express-banner">
            <span class="fixeo-res-express-icon">🚀</span>
            <div>
              <div class="fixeo-res-express-title">Intervention EXPRESS confirmée</div>
              <div class="fixeo-res-express-sub">L'artisan sera chez vous dans moins d'1 heure</div>
            </div>
          </div>` : ''}

          <!-- Summary Table -->
          <div class="fixeo-res-summary">
            ${rows.map(([label, val]) => `
              <div class="fixeo-res-summary-row">
                <span class="fixeo-res-summary-label">${label}</span>
                <span class="fixeo-res-summary-val">${val}</span>
              </div>`).join('')}
            <div class="fixeo-res-summary-total">
              <span>Total à payer</span>
              <span class="fixeo-res-total-amount">${total.toLocaleString('fr-FR')} MAD</span>
            </div>
          </div>

          <!-- Trust badges -->
          <div class="fixeo-res-trust-row">
            <div class="fixeo-res-trust-item">
              <span class="fixeo-res-trust-icon">✅</span>
              <span>Artisan vérifié</span>
            </div>
            <div class="fixeo-res-trust-item">
              <span class="fixeo-res-trust-icon">🛡️</span>
              <span>Paiement sécurisé</span>
            </div>
            <div class="fixeo-res-trust-item">
              <span class="fixeo-res-trust-icon">🔄</span>
              <span>Remboursement garanti</span>
            </div>
          </div>

          <!-- ═══ SÉLECTEUR DE MÉTHODE DE PAIEMENT (COD V14) ═══ -->
          <div class="fixeo-res-payment-section">
            <div class="fixeo-res-payment-title">💳 Choisissez votre méthode de paiement</div>
            <!-- Rendu dynamique par FixeoCOD.renderPaymentSelector() -->
            <div id="fixeo-payment-method-selector">
              <!-- Injecté par cod-payment.js après le rendu -->
              <div class="fixeo-pay-options" id="fixeo-pay-options-group" style="display:flex;flex-direction:column;gap:10px;margin:12px 0">

                <!-- COD : sélectionné par défaut -->
                <label class="fixeo-pay-option selected" for="pay-method-cod"
                       onclick="FixeoCOD && FixeoCOD.selectPayMethod(this,'cod')" style="display:flex;align-items:center;gap:12px;background:rgba(32,201,151,.08);border:1.5px solid #20C997;border-radius:12px;padding:13px 15px;cursor:pointer;">
                  <input type="radio" name="fixeoPaymentMethod" id="pay-method-cod" value="cod" checked style="accent-color:#20C997;width:18px;height:18px;"/>
                  <span style="font-size:1.4rem">💵</span>
                  <div style="flex:1">
                    <div style="font-weight:700;font-size:.9rem;color:#fff">Paiement à la livraison (Cash on Delivery)</div>
                    <div style="font-size:.75rem;color:rgba(255,255,255,.5);margin-top:2px">Payez en espèces lors de l'intervention · Option principale Maroc</div>
                  </div>
                  <span style="font-size:.67rem;font-weight:700;padding:2px 8px;border-radius:20px;background:rgba(32,201,151,.2);color:#20C997;border:1px solid rgba(32,201,151,.3);white-space:nowrap">⭐ Recommandé</span>
                </label>

                <!-- CMI -->
                <label class="fixeo-pay-option" for="pay-method-cmi"
                       onclick="FixeoCOD && FixeoCOD.selectPayMethod(this,'cmi')" style="display:flex;align-items:center;gap:12px;background:rgba(255,255,255,.04);border:1.5px solid rgba(255,255,255,.1);border-radius:12px;padding:13px 15px;cursor:pointer;opacity:.65">
                  <input type="radio" name="fixeoPaymentMethod" id="pay-method-cmi" value="cmi" disabled style="accent-color:#20C997;width:18px;height:18px;"/>
                  <span style="font-size:1.4rem">🇲🇦</span>
                  <div style="flex:1">
                    <div style="font-weight:700;font-size:.9rem;color:#fff">CMI (Maroc Télécommerce)</div>
                    <div style="font-size:.75rem;color:rgba(255,255,255,.5);margin-top:2px">Carte bancaire marocaine</div>
                  </div>
                  <span style="font-size:.67rem;font-weight:700;padding:2px 8px;border-radius:20px;background:rgba(255,165,0,.1);color:rgba(255,165,0,.8);border:1px solid rgba(255,165,0,.25);white-space:nowrap">🚧 Bientôt</span>
                </label>

              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="fixeo-res-actions">
            <button class="fixeo-res-btn-secondary" onclick="FixeoReservation._goToStep1()">
              ← Modifier
            </button>
            <button class="fixeo-res-btn-primary fixeo-res-btn-pay" onclick="FixeoReservation._proceedToPayment(${total})">
              ✅ Confirmer la commande — ${total.toLocaleString('fr-FR')} MAD
            </button>
          </div>
        </div>

        <!-- Footer -->
        <div class="fixeo-res-footer">
          <div class="fixeo-res-security">
            <span>🔒 SSL 256-bit</span>
            <span>🛡️ 3D Secure</span>
            <span>✅ PCI-DSS</span>
            <span>🔄 Remboursement 14j</span>
          </div>
        </div>
      </div>
    `;
  }

  /* ════════════════════════════════════════════════════════
     RENDER ARTISAN PICKER (when no artisan passed)
  ════════════════════════════════════════════════════════ */
  function renderArtisanPicker() {
    const artisans = window.ARTISANS || [];
    const cardsHtml = artisans.slice(0, 8).map(a => {
      const catIcon = CATEGORY_ICONS[a.category] || '🛠️';
      const availClass = a.availability === 'available' ? 'available' : 'busy';
      return `
        <div class="fixeo-res-picker-card" onclick="FixeoReservation._selectArtisanFromPicker(${a.id})">
          <div class="fixeo-res-picker-avatar">${sanitize(a.initials)}</div>
          <div class="fixeo-res-picker-info">
            <div class="fixeo-res-picker-name">${sanitize(a.name)}</div>
            <div class="fixeo-res-picker-cat">${catIcon} ${CATEGORY_LABELS[a.category] || a.category}</div>
            <div class="fixeo-res-picker-meta">
              <span class="fixeo-res-stars small">${'★'.repeat(Math.floor(a.rating))}</span>
              <span>${a.rating}</span>
              <span class="fixeo-res-avail ${availClass} small">● ${a.availability === 'available' ? 'Dispo' : 'Occupé'}</span>
            </div>
            <div class="fixeo-res-picker-price">${a.priceLabel || ('\u00c0 partir de ' + (a.priceFrom||150) + ' MAD')}</div>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="fixeo-res-dialog" role="document">
        <div class="fixeo-res-header">
          <div class="fixeo-res-header-left">
            <div class="fixeo-res-header-icon">🛠️</div>
            <div>
              <div class="fixeo-res-header-title">📅 Réserver un artisan</div>
              <div class="fixeo-res-header-sub">Choisissez un artisan pour commencer</div>
            </div>
          </div>
          <button class="fixeo-res-close" onclick="FixeoReservation.close()" aria-label="Fermer">✕</button>
        </div>
        <div class="fixeo-res-body">
          <div class="fixeo-res-picker-grid">
            ${cardsHtml || '<div style="text-align:center;color:rgba(255,255,255,.5);padding:2rem">Aucun artisan disponible.</div>'}
          </div>
        </div>
      </div>`;
  }

  /* ════════════════════════════════════════════════════════
     RENDER DISPATCH
  ════════════════════════════════════════════════════════ */
  function render() {
    const modal = ensureModal();
    if (!state.artisan) {
      modal.innerHTML = renderArtisanPicker();
    } else if (state.step === 1) {
      modal.innerHTML = renderStep1();
    } else {
      modal.innerHTML = renderStep2();
    }
  }

  /* ════════════════════════════════════════════════════════
     PUBLIC API: OPEN / CLOSE
  ════════════════════════════════════════════════════════ */
  function open(artisanInput, isExpress, urgentContext) {
    // Reset state — always a clean slate
    state.step = 1;
    state.isExpress = !!isExpress;
    state.isUrgent  = false;
    state.selectedService = '';
    state.selectedDate = todayISO();
    state.selectedSlot = 'matin';
    state.description = '';
    state.address = '';
    state.phone = '';

    // Resolve artisan
    state.artisan = artisanInput ? normalizeArtisan(artisanInput) : null;

    // ── Urgent mode: prefill from urgentContext ──────────────────
    // urgentContext = { urgent:true, query, city, category, source }
    // Only activated when explicitly passed — all existing open(a, false) calls are unaffected.
    if (urgentContext && urgentContext.urgent === true) {
      state.isUrgent = true;
      state.description = urgentContext.query || '';
      state.selectedSlot = 'maintenant';
      const cat = (urgentContext.category || state.artisan?.category || '').toLowerCase();
      const catServices = SERVICE_MAP[cat];
      if (catServices && catServices.length) state.selectedService = catServices[0];
    }

    ensureBackdrop();
    render();

    /* ── Refresh slot grid with booked slots for today ── */
    if (state.artisan && !state.isExpress && window.FixeoSlotLock) {
      requestAnimationFrame(function() {
        window.FixeoSlotLock.refreshSlotGrid(state.artisan.id, state.selectedDate);
      });
    }

    const modal = document.getElementById(MODAL_ID);
    if (modal) {
      modal.classList.add('open');
      document.body.style.overflow = 'hidden';
      // Focus trap: focus first input
      requestAnimationFrame(() => {
        const first = modal.querySelector('select, input, button');
        if (first) first.focus();
      });
    }
  }

  function openExpress(artisanInput) {
    open(artisanInput, true);
  }

  function close() {
    const modal = document.getElementById(MODAL_ID);
    if (modal) {
      modal.classList.remove('open');
    }
    removeBackdrop();
    document.body.style.overflow = '';
    state.artisan = null;
    state.isExpress = false;
  }

  /* ════════════════════════════════════════════════════════
     INTERNAL HANDLERS (exposed on window.FixeoReservation._*)
  ════════════════════════════════════════════════════════ */
  function _selectArtisanFromPicker(id) {
    state.artisan = normalizeArtisan(id);
    state.step = 1;
    render();
  }

  function _onServiceChange(val) { state.selectedService = val; }
  function _onDateChange(val) {
    state.selectedDate = val;
    /* Re-render slot grid with updated booked slots */
    if (window.FixeoSlotLock && state.artisan) {
      /* Petit délai pour laisser le DOM se stabiliser */
      requestAnimationFrame(function() {
        window.FixeoSlotLock.refreshSlotGrid(state.artisan.id, val);
        /* Si le créneau actuellement sélectionné devient bloqué, désélectionner */
        if (window.FixeoSlotLock.isSlotBooked(state.artisan.id, val, state.selectedSlot)) {
          state.selectedSlot = '';
          const active = document.querySelector('#res-slot-grid .fixeo-res-slot.active');
          if (active) active.classList.remove('active');
        }
      });
    }
  }
  function _onDescChange(val)    { state.description = val; }
  function _onAddressChange(val) { state.address = val; }
  function _onPhoneChange(val)   { state.phone = val; }

  function _onSlotClick(el, slot) {
    state.selectedSlot = slot;
    document.querySelectorAll('#res-slot-grid .fixeo-res-slot')
      .forEach(s => s.classList.remove('active'));
    el.classList.add('active');
  }

  function _showError(msg) {
    const el = document.getElementById('res-error');
    if (el) {
      el.textContent = msg;
      el.style.display = msg ? 'block' : 'none';
    }
  }

  function _submitStep1() {
    // Read current values from DOM
    const serviceEl = document.getElementById('res-service');
    const dateEl    = document.getElementById('res-date');
    const descEl    = document.getElementById('res-desc');
    const addrEl    = document.getElementById('res-address');
    const phoneEl   = document.getElementById('res-phone');

    if (serviceEl) state.selectedService = serviceEl.value;
    if (dateEl)    state.selectedDate    = dateEl.value;
    if (descEl)    state.description     = descEl.value;
    if (addrEl)    state.address         = addrEl.value;
    if (phoneEl)   state.phone           = phoneEl.value;

    // Validation
    if (!state.selectedService) {
      _showError('⚠️ Veuillez choisir un service.');
      serviceEl && serviceEl.focus();
      return;
    }
    if (!state.isExpress && !state.selectedDate) {
      _showError('⚠️ Veuillez sélectionner une date.');
      dateEl && dateEl.focus();
      return;
    }
    if (!state.address || state.address.trim().length < 5) {
      _showError('⚠️ Veuillez saisir votre adresse complète.');
      addrEl && addrEl.focus();
      return;
    }
    if ((state.isExpress || state.isUrgent) && (!state.phone || state.phone.trim().length < 8)) {
      _showError('⚠️ Veuillez saisir votre numéro de téléphone.');
      phoneEl && phoneEl.focus();
      return;
    }

    /* ── Slot Lock validation ─────────────────── */
    if (!state.isExpress && window.FixeoSlotLock) {
      const artId = state.artisan ? state.artisan.id : 0;
      if (!window.FixeoSlotLock.validateSlotOnSubmit(artId, state.selectedDate, state.selectedSlot)) {
        return; /* créneau déjà réservé — erreur affichée par validateSlotOnSubmit */
      }
    }
    _showError('');
    state.step = 2;
    render();
    // Scroll modal to top
    const modal = document.getElementById(MODAL_ID);
    if (modal) modal.scrollTop = 0;
  }

  function _goToStep1() {
    state.step = 1;
    render();
  }

  function _proceedToPayment(total) {
    const a = state.artisan;
    const slotLabel = state.isExpress
      ? 'Dès maintenant'
      : (TIME_SLOTS.find(t => t.value === state.selectedSlot)?.label || state.selectedSlot);

    const bookingData = {
      artisanName : a.name,
      artisanId   : a.id,
      service     : state.selectedService,
      date        : state.isExpress
                      ? 'Aujourd\'hui (dans l\'heure)'
                      : formatDateFR(state.selectedDate),
      timeSlot    : slotLabel,
      description : state.description,
      address     : state.address,
      phone       : state.phone,
      price       : total,
      _total      : total,
      isExpress   : state.isExpress,
    };

    /* ── Lire la méthode de paiement sélectionnée ── */
    const selectedMethod = (window.FixeoCOD && typeof window.FixeoCOD.getSelectedMethod === 'function')
      ? window.FixeoCOD.getSelectedMethod()
      : 'cod'; /* COD par défaut */

    /* ══════════════════════════════════════════════════════
       BRANCHEMENT PAR MÉTHODE DE PAIEMENT
    ══════════════════════════════════════════════════════ */

    /* ── COD : Cash on Delivery ─────────────────────────── */
    if (selectedMethod === 'cod') {
      close(); /* fermer le modal réservation */

      if (window.FixeoCOD && typeof window.FixeoCOD.processCOD === 'function') {
        window.FixeoCOD.processCOD(bookingData, {
          onLoading: function(msg) {
            if (window.notifications && window.notifications.info) {
              window.notifications.info('⏳', msg);
            }
          },
          onSuccess: function(orderID, record, apiBody) {
            /* Gamification hook */
            if (window.gamification && window.gamification.updateMission) {
              window.gamification.updateMission('m2', 1);
            }
            /* ── Redirection vers la page de confirmation COD v15 ── */
            const confirmURL = (window.FixeoCOD && window.FixeoCOD.config)
              ? window.FixeoCOD.config.CONFIRMATION_URL
              : 'confirmation.html';
            window.location.href = confirmURL;
          },
          onError: function(err) {
            if (window.notifications && window.notifications.error) {
              window.notifications.error('❌ Erreur COD', err);
            } else {
              alert('❌ Erreur lors de l\'enregistrement COD : ' + err);
            }
          }
        });
      } else {
        /* FixeoCOD non chargé — fallback basique */
        close();
        const codID  = 'COD-' + Date.now().toString(36).toUpperCase();
        const codRef = 'BKG-COD-' + Date.now().toString(36).toUpperCase();
        const codCommission = Math.round(total * 0.10);
        const codNet = Math.round(total - codCommission);
        const stored = JSON.parse(localStorage.getItem('fixeo_reservations') || '[]');
        stored.unshift({
          id: codID, bookingRef: codRef,
          artisan: a.name, artisanId: a.id, service: bookingData.service,
          date: bookingData.date, time: slotLabel,
          price: total, commission: codCommission, netArtisan: codNet,
          paymentMethod: 'Cash on Delivery', method: 'Cash on Delivery',
          status: 'pending', payStatus: 'pending_cod', slotLock: true,
          createdAt: new Date().toLocaleDateString('fr-FR'),
        });
        localStorage.setItem('fixeo_reservations', JSON.stringify(stored));
        if (window.FixeoSlotLock) {
          window.FixeoSlotLock.onReservationCreated({
            artisanId: a.id, artisanName: a.name, service: bookingData.service,
            date: state.selectedDate, time: state.isExpress ? 'maintenant' : state.selectedSlot,
            timeSlot: slotLabel, price: total, isExpress: state.isExpress,
          });
        }
        alert(`✅ Commande COD enregistrée !\nRéf : ${codRef}\nMontant : ${total} MAD (paiement à la livraison)`);
      }

      /* ── Notify SlotLock & Admin ── */
      if (window.FixeoSlotLock) {
        window.FixeoSlotLock.onReservationCreated({
          artisanId   : bookingData.artisanId,
          artisanName : bookingData.artisanName,
          service     : bookingData.service,
          date        : state.selectedDate,
          time        : state.isExpress ? 'maintenant' : state.selectedSlot,
          timeSlot    : slotLabel,
          price       : total,
          isExpress   : state.isExpress,
          paid        : false,
          paymentMethod: 'Cash on Delivery',
        });
      }
      if (window.FixeoAdminReservations && typeof window.FixeoAdminReservations.addReservation === 'function') {
        window.FixeoAdminReservations.addReservation({
          artisanId: bookingData.artisanId, artisanName: bookingData.artisanName,
          service: bookingData.service, date: bookingData.date, timeSlot: slotLabel,
          price: total, isExpress: state.isExpress,
          paid: false, paymentMethod: 'Cash on Delivery', payStatus: 'pending_cod',
        });
      }
      return; /* ← sortir ici pour COD */
    }

    /* ── PAYPAL ──────────────────────────────────────────── */
    if (selectedMethod === 'paypal') {
      close(); /* fermer le modal réservation */
      if (window.FixeoPayment && typeof window.FixeoPayment.openBookingPayment === 'function') {
        window.FixeoPayment.openBookingPayment(bookingData);
      } else {
        if (window.notifications && window.notifications.info) {
          window.notifications.info('ℹ️ PayPal', 'Redirection vers le paiement PayPal...');
        }
      }
      return;
    }

    /* ── CMI (futur) ─────────────────────────────────────── */
    if (selectedMethod === 'cmi') {
      if (window.notifications && window.notifications.warning) {
        window.notifications.warning('🚧 CMI', 'CMI Maroc Télécommerce sera disponible prochainement.');
      } else {
        alert('🚧 CMI (Maroc Télécommerce) sera disponible prochainement.');
      }
      return;
    }

    /* ── Fallback générique ──────────────────────────────── */
    close();

    // Trigger FixeoPayment engine
    if (window.FixeoPayment && typeof window.FixeoPayment.openBookingPayment === 'function') {
      window.FixeoPayment.openBookingPayment(bookingData);
    } else {
      // Graceful fallback — show toast / notification
      if (window.FixeoPayment && window.FixeoPayment.showToast) {
        window.FixeoPayment.showToast('✅ Réservation envoyée', `Demande pour ${a.name} confirmée.`, 'success', 5000);
      } else if (window.notifications && window.notifications.success) {
        window.notifications.success('Réservation confirmée', `Demande envoyée à ${a.name}.`);
      } else {
        alert(`✅ Réservation confirmée !\nArtisan : ${a.name}\nService : ${bookingData.service}\nDate : ${bookingData.date}`);
      }

      // Save to localStorage
      const history = JSON.parse(localStorage.getItem('fixeo_payment_history') || '[]');
      history.push({
        id: 'BKG-' + Date.now().toString(36).toUpperCase(),
        type: state.isExpress ? 'express' : 'booking',
        artisan: a.name,
        service: bookingData.service,
        date: new Date().toLocaleDateString('fr-FR'),
        amount: total,
        status: 'confirmed',
      });
      localStorage.setItem('fixeo_payment_history', JSON.stringify(history));
    }

    /* ── Notify SlotLock engine (mark slot as taken) ── */
    if (window.FixeoSlotLock) {
      window.FixeoSlotLock.onReservationCreated({
        artisanId  : bookingData.artisanId,
        artisanName: bookingData.artisanName,
        service    : bookingData.service,
        date       : state.selectedDate,
        time       : state.isExpress ? 'maintenant' : state.selectedSlot,
        timeSlot   : slotLabel,
        price      : total,
        isExpress  : state.isExpress,
      });
    }

    /* ── Notify Admin Dashboard ── */
    if (window.FixeoAdminReservations && typeof window.FixeoAdminReservations.addReservation === 'function') {
      window.FixeoAdminReservations.addReservation({
        artisanId  : bookingData.artisanId,
        artisanName: bookingData.artisanName,
        service    : bookingData.service,
        date       : bookingData.date,
        timeSlot   : slotLabel,
        price      : total,
        isExpress  : state.isExpress,
        paid       : true,
        paymentMethod: 'Online',
      });
    }

    // Gamification hook
    if (window.gamification && window.gamification.updateMission) {
      window.gamification.updateMission('m2', 1);
    }

    // Notification system hook
    if (window.notifSystem && window.notifSystem.push) {
      window.notifSystem.push({
        type: 'success', icon: '📅',
        title: 'Réservation initiée',
        body: `Paiement en cours pour ${a.name} — ${state.selectedService}`,
      });
    }
  }

  /* ════════════════════════════════════════════════════════
     KEYBOARD HANDLER
  ════════════════════════════════════════════════════════ */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      const modal = document.getElementById(MODAL_ID);
      if (modal && modal.classList.contains('open')) {
        close();
      }
    }
  });

  /* ════════════════════════════════════════════════════════
     BACKWARD COMPATIBILITY BRIDGE
     Ensures legacy calls like openBookingModal(id) still work
  ════════════════════════════════════════════════════════ */
  window.openBookingModal = function (artisanId) {
    open(artisanId, false);
  };
  window.openExpressModal = function (artisanId) {
    open(artisanId, true);
  };
  window.openReservationModal = function (artisanInput, isExpress) {
    open(artisanInput, isExpress);
  };

  /* ════════════════════════════════════════════════════════
     EXPORT
  ════════════════════════════════════════════════════════ */
  window.FixeoReservation = {
    open,
    openExpress,
    close,
    // Internal handlers (called from inline HTML onclick)
    _selectArtisanFromPicker,
    _onServiceChange,
    _onDateChange,
    _onDescChange,
    _onAddressChange,
    _onPhoneChange,
    _onSlotClick,
    _submitStep1,
    _goToStep1,
    _proceedToPayment,
  };

})(window);
