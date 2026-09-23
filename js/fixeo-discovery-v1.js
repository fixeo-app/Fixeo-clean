(function(){
 "use strict";
 const DATA={"eau": {"title": "Eau & plomberie", "items": [{"label": "Robinet qui fuit", "hint": "plomberie", "id": "eau.robinet-qui-fuit"}, {"label": "Fuite sous un évier", "hint": "plomberie", "id": "eau.fuite-sous-un-evier"}, {"label": "WC bouché", "hint": "plomberie", "id": "eau.wc-bouche"}, {"label": "Canalisation bouchée", "hint": "plomberie", "id": "eau.canalisation-bouchee"}, {"label": "Chasse d’eau défectueuse", "hint": "plomberie", "id": "eau.chasse-deau-defectueuse"}, {"label": "Installer un sanitaire", "hint": "plomberie", "id": "eau.installer-un-sanitaire"}, {"label": "Chauffe-eau en panne", "hint": "plomberie", "id": "eau.chauffe-eau-en-panne"}, {"label": "Faible pression d’eau", "hint": "plomberie", "id": "eau.faible-pression-deau"}]}, "electricite": {"title": "Électricité & équipements", "items": [{"label": "Prise qui ne fonctionne plus", "hint": "electricite", "id": "electricite.prise-qui-ne-fonctionne-plus"}, {"label": "Éclairage en panne", "hint": "electricite", "id": "electricite.eclairage-en-panne"}, {"label": "Disjoncteur qui saute", "hint": "electricite", "id": "electricite.disjoncteur-qui-saute"}, {"label": "Installer un luminaire", "hint": "electricite", "id": "electricite.installer-un-luminaire"}, {"label": "Ajouter une prise", "hint": "electricite", "id": "electricite.ajouter-une-prise"}, {"label": "Vérifier un tableau électrique", "hint": "electricite", "id": "electricite.verifier-un-tableau-electrique"}, {"label": "Équipement électrique en panne", "hint": "electricite", "id": "electricite.equipement-electrique-en-panne"}]}, "confort": {"title": "Climatisation & confort", "items": [{"label": "Climatiseur qui ne refroidit plus", "hint": "climatisation", "id": "confort.climatiseur-qui-ne-refroidit-plus"}, {"label": "Installer un climatiseur", "hint": "climatisation", "id": "confort.installer-un-climatiseur"}, {"label": "Entretenir une climatisation", "hint": "climatisation", "id": "confort.entretenir-une-climatisation"}, {"label": "Climatiseur qui fuit", "hint": "climatisation", "id": "confort.climatiseur-qui-fuit"}, {"label": "Bruit inhabituel de climatisation", "hint": "climatisation", "id": "confort.bruit-inhabituel-de-climatisation"}, {"label": "Problème de ventilation", "hint": "climatisation", "id": "confort.probleme-de-ventilation"}, {"label": "Chauffage en panne", "hint": "climatisation", "id": "confort.chauffage-en-panne"}]}, "portes": {"title": "Portes, fenêtres & sécurité", "items": [{"label": "Porte claquée", "hint": "serrurerie", "id": "portes.porte-claquee"}, {"label": "Clé cassée dans la serrure", "hint": "serrurerie", "id": "portes.cle-cassee-dans-la-serrure"}, {"label": "Remplacer une serrure", "hint": "serrurerie", "id": "portes.remplacer-une-serrure"}, {"label": "Fenêtre qui ferme mal", "hint": "menuiserie", "id": "portes.fenetre-qui-ferme-mal"}, {"label": "Vitre fissurée", "hint": "", "id": "portes.vitre-fissuree"}, {"label": "Volet bloqué", "hint": "menuiserie", "id": "portes.volet-bloque"}, {"label": "Réparer une porte", "hint": "menuiserie", "id": "portes.reparer-une-porte"}, {"label": "Installer une grille de protection", "hint": "", "id": "portes.installer-une-grille-de-protection"}]}, "travaux": {"title": "Travaux & rénovation", "items": [{"label": "Repeindre une pièce", "hint": "peinture", "id": "travaux.repeindre-une-piece"}, {"label": "Peindre une façade", "hint": "peinture", "id": "travaux.peindre-une-facade"}, {"label": "Poser du carrelage", "hint": "carrelage", "id": "travaux.poser-du-carrelage"}, {"label": "Réparer des joints", "hint": "carrelage", "id": "travaux.reparer-des-joints"}, {"label": "Infiltration ou étanchéité", "hint": "", "id": "travaux.infiltration-ou-etancheite"}, {"label": "Rénover une salle de bains", "hint": "", "id": "travaux.renover-une-salle-de-bains"}, {"label": "Rénover une cuisine", "hint": "", "id": "travaux.renover-une-cuisine"}, {"label": "Petits travaux de maçonnerie", "hint": "maconnerie", "id": "travaux.petits-travaux-de-maconnerie"}, {"label": "Aménager une cloison", "hint": "", "id": "travaux.amenager-une-cloison"}, {"label": "Préparer une rénovation complète", "hint": "", "id": "travaux.preparer-une-renovation-complete"}]}, "installation": {"title": "Installation & aménagement", "items": [{"label": "Monter un meuble", "hint": "bricolage", "id": "installation.monter-un-meuble"}, {"label": "Fixer une étagère", "hint": "bricolage", "id": "installation.fixer-une-etagere"}, {"label": "Installer une tringle", "hint": "bricolage", "id": "installation.installer-une-tringle"}, {"label": "Fixer un téléviseur", "hint": "bricolage", "id": "installation.fixer-un-televiseur"}, {"label": "Poser des meubles de cuisine", "hint": "menuiserie", "id": "installation.poser-des-meubles-de-cuisine"}, {"label": "Réparer un meuble", "hint": "menuiserie", "id": "installation.reparer-un-meuble"}, {"label": "Créer un rangement sur mesure", "hint": "menuiserie", "id": "installation.creer-un-rangement-sur-mesure"}, {"label": "Installer un équipement", "hint": "", "id": "installation.installer-un-equipement"}]}, "entretien": {"title": "Entretien & extérieur", "items": [{"label": "Nettoyage après travaux", "hint": "nettoyage", "id": "entretien.nettoyage-apres-travaux"}, {"label": "Grand nettoyage", "hint": "nettoyage", "id": "entretien.grand-nettoyage"}, {"label": "Nettoyer un canapé", "hint": "nettoyage", "id": "entretien.nettoyer-un-canape"}, {"label": "Entretien de jardin", "hint": "jardinage", "id": "entretien.entretien-de-jardin"}, {"label": "Taille de haie", "hint": "jardinage", "id": "entretien.taille-de-haie"}, {"label": "Problème d’arrosage", "hint": "jardinage", "id": "entretien.probleme-darrosage"}, {"label": "Aménager une terrasse", "hint": "", "id": "entretien.amenager-une-terrasse"}, {"label": "Entretien de piscine", "hint": "", "id": "entretien.entretien-de-piscine"}]}, "demenagement": {"title": "Déménagement & manutention", "items": [{"label": "Déménager un appartement", "hint": "demenagement", "id": "demenagement.demenager-un-appartement"}, {"label": "Transporter quelques meubles", "hint": "demenagement", "id": "demenagement.transporter-quelques-meubles"}, {"label": "Déplacer un objet lourd", "hint": "demenagement", "id": "demenagement.deplacer-un-objet-lourd"}, {"label": "Démonter et remonter du mobilier", "hint": "demenagement", "id": "demenagement.demonter-et-remonter-du-mobilier"}, {"label": "Charger ou décharger un véhicule", "hint": "demenagement", "id": "demenagement.charger-ou-decharger-un-vehicule"}, {"label": "Préparer un déménagement de bureau", "hint": "demenagement", "id": "demenagement.preparer-un-demenagement-de-bureau"}]}};
  let dialog, body, footer, progress, backdropStyle, origin, current, selected, entryOptions = {};
  let seed = '', city = '', rememberedCity = '', lastHeroCity = '', draft = '', priorOverflow, released = true;
  let headerObserver, observedHeader, generation = 0, busy = false;
  const drafts = new Map();
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };
  const cleanCity = value => {
    const normalize = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[-_]/g, ' ').trim();
    const wanted = normalize(value);
    return wanted ? (window.FIXEO_CITIES_MAP || []).find(item => [item.value, item.label, ...(item.aliases || [])].some(alias => normalize(alias) === wanted))?.value || '' : '';
  };
  function draftKey() { return [entryOptions.source || 'homepage_discovery', dialog.dataset.universe, selected?.id || 'free', seed].join('|'); }
  function remember() {
    const input = dialog?.querySelector('#fxd-description');
    if (input) { draft = input.value; drafts.set(draftKey(), draft); }
    const select = dialog?.querySelector('#fxd-city');
    if (select) city = select.value;
    rememberedCity = city;
  }
  function fitViewport() {
    if (!dialog?.open) return;
    const viewport = window.visualViewport, top = viewport?.offsetTop || 0, height = viewport?.height || window.innerHeight;
    const header = [...document.querySelectorAll('.fixeo-gh-mobile-bar, nav.navbar, header.site-header')].find(node => {
      const r = node.getBoundingClientRect(); return r.height > 0 && r.bottom > top && r.top < top + height;
    });
    const panelTop = Math.max(top, header?.getBoundingClientRect().bottom || 0), panelHeight = Math.max(0, top + height - panelTop);
    dialog.style.setProperty('--fxd-panel-top', panelTop + 'px');
    dialog.style.setProperty('--fxd-panel-height', panelHeight + 'px');
    dialog.dataset.compactViewport = String(panelHeight < 480);
    backdropStyle.textContent = '#fxd-launcher::backdrop { inset: ' + panelTop + 'px 0 0; }';
    if (headerObserver && header !== observedHeader) { headerObserver.disconnect(); if (header) headerObserver.observe(header); observedHeader = header; }
  }
  function release(restoreFocus = true) {
    if (released) return;
    released = true; generation++; busy = false; body.inert = false;
    document.body.style.overflow = priorOverflow;
    document.body.classList.remove('fxd-is-open');
    window.visualViewport?.removeEventListener('resize', fitViewport);
    window.visualViewport?.removeEventListener('scroll', fitViewport);
    window.removeEventListener('resize', fitViewport);
    headerObserver?.disconnect(); observedHeader = null;
    if (restoreFocus) origin?.focus({preventScroll: true});
  }
  function close(restoreFocus = true) { if (dialog?.open) { remember(); release(restoreFocus); dialog.close(); } }
  function show() {
    priorOverflow = document.body.style.overflow; released = false;
    dialog.showModal(); document.body.style.overflow = 'hidden'; document.body.classList.add('fxd-is-open');
    window.visualViewport?.addEventListener('resize', fitViewport);
    window.visualViewport?.addEventListener('scroll', fitViewport);
    window.addEventListener('resize', fitViewport); fitViewport();
  }
  function arrow() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.classList.add('fxd-choice-arrow');
    const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', 'M5 12h14m-6-6 6 6-6 6'); svg.append(path); return svg;
  }
  function build() {
    if (dialog) return;
    dialog = el('dialog', null, 'fxd-dialog'); dialog.id = 'fxd-launcher'; dialog.setAttribute('aria-labelledby', 'fxd-dialog-title');
    const header = el('header'), brand = el('div', null, 'fxd-brand'); brand.append(el('strong', 'RAFI'), el('small', 'Votre point de départ'));
    const x = el('button', '✕', 'fxd-close'); x.type = 'button'; x.setAttribute('aria-label', 'Fermer les situations'); x.onclick = () => close(); header.append(brand, x);
    progress = el('p', 'Situation → Précision éventuelle → RAFI reprend', 'fxd-progress');
    body = el('div', null, 'fxd-body'); footer = el('div', null, 'fxd-footer'); backdropStyle = el('style');
    dialog.append(header, progress, body, footer, backdropStyle);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('close', () => { if (!dialog.open) release(); });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close();
    });
    if (window.ResizeObserver) headerObserver = new window.ResizeObserver(fitViewport);
    document.body.append(dialog);
  }
  function heading() {
    body.replaceChildren(); footer.replaceChildren(); body.scrollTop = 0;
    const title = el('h2', current?.title || 'Votre besoin, avec vos mots'); title.id = 'fxd-dialog-title'; title.tabIndex = -1; body.append(title);
    return title;
  }
  function choices(focus = false) {
    remember(); selected = null; dialog.dataset.step = 'choices'; progress.hidden = false;
    const title = heading(); body.append(el('p', 'Quelle situation vous correspond ?'));
    const grid = el('div', null, 'fxd-choices');
    for (const item of current.items) {
      const button = el('button'); button.type = 'button'; button.append(el('span', item.label), arrow());
      button.onclick = () => { selected = item; details(); }; grid.append(button);
    }
    const other = el('button'); other.type = 'button'; other.append(el('span', 'Autre besoin / Je ne sais pas'), arrow());
    other.onclick = () => { selected = null; draft = seed; handoff(other, footer.querySelector('.fxd-error')); }; grid.append(other);
    body.append(grid); footer.append(el('p', '', 'fxd-error'), el('p', 'Aucune demande envoyée à cette étape.', 'fxd-note'));
    footer.querySelector('.fxd-error').setAttribute('role', 'status');
    if (focus) title.focus({preventScroll: true});
  }
  function details() {
    dialog.dataset.step = 'details'; const title = heading();
    const back = el('button', '← Retour aux situations', 'fxd-back'); back.type = 'button'; back.onclick = () => choices(true);
    const summary = el('div', null, 'fxd-selection'); summary.append(el('small', 'Votre situation'), el('strong', selected.label)); body.append(back, summary);
    draft = drafts.get(draftKey()) ?? (seed || selected.label);
    const precision = el('details', null, 'fxd-precision');
    precision.append(el('summary', 'Préciser mon besoin (facultatif)'));
    const label = el('label', 'Votre description', 'fxd-field'), input = el('textarea'); input.id = 'fxd-description'; label.htmlFor = input.id; input.maxLength = 2000;
    input.value = draft; input.oninput = remember; precision.append(label, input); body.append(precision);
    const cityRow = el('div', null, 'fxd-city-row'), cityLabel = el('label', 'Ville d’intervention', 'fxd-field'), select = el('select');
    select.id = 'fxd-city'; cityLabel.htmlFor = select.id; const empty = el('option', 'Choisir une ville'); empty.value = ''; select.append(empty);
    for (const item of window.FIXEO_CITIES_MAP || []) { const option = el('option', item.label); option.value = item.value; select.append(option); }
    select.value = city; select.onchange = remember; cityRow.append(cityLabel, select); body.append(cityRow);
    const go = el('button', 'Continuer avec RAFI →', 'fxd-primary'); go.type = 'button'; const error = el('p', '', 'fxd-error'); error.setAttribute('role', 'status');
    go.onclick = () => { remember(); handoff(go, error); };
    footer.append(go, error, el('p', 'Votre choix est transmis. Vous gardez la main.', 'fxd-note'));
    title.focus({preventScroll: true});
  }
  async function handoff(button, status) {
    if (busy) return;
    if (!window.FixeoEstimatorV2?.open) { status.textContent = 'RAFI se prépare. Réessayez dans un instant.'; return; }
    const text = draft.trim();
    // situation_id already carries the universe; only existing public entry fields
    // cross into Estimation. The launcher never starts a pricing session itself.
    const description = selected && !text.toLowerCase().includes(selected.label.toLowerCase()) ? selected.label + (text ? ' — ' + text : '') : text;
    const context = {source: entryOptions.source || 'homepage_discovery', description, city};
    if (selected?.hint) context.metier_hint = selected.hint;
    if (selected?.id) context.situation_id = selected.id;
    busy = true; body.inert = true; const ticket = ++generation; button.disabled = true; dialog.dataset.handoff = 'true';
    status.textContent = 'RAFI reprend votre besoin…';
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!reduced) await new Promise(resolve => window.setTimeout(resolve, 180));
    if (ticket !== generation || !dialog.open) return;
    close(false);
    try {
      const result = await window.FixeoEstimatorV2.open(context);
      if (result?.accepted === false) throw new Error('unavailable');
    } catch (_) {
      // Keep the very same controls and draft available after a rejected opening.
      show(); status.textContent = 'L’ouverture a échoué. Votre saisie est conservée, vous pouvez réessayer.'; button.focus({preventScroll: true});
    } finally { busy = false; button.disabled = false; delete dialog.dataset.handoff; }
  }
  window.FixeoDiscovery = {open(key, trigger, options) {
    // A current Estimation owns its data and focus; never replace that journey.
    if (window.FixeoEstimatorV2?.isOpen?.()) { window.FixeoEstimatorV2.reveal?.(); return; }
    if (dialog?.open) return;
    entryOptions = options || {}; build(); origin = trigger; current = DATA[key] || null; selected = null;
    dialog.dataset.universe = key || 'libre'; delete dialog.dataset.handoff;
    seed = entryOptions.description ?? (document.getElementById('fxhf-need-input')?.value || ''); draft = seed;
    let trusted = ''; try { trusted = sessionStorage.getItem('fxrf4_trusted_city_session') || ''; } catch (_) {}
    const heroCity = cleanCity(document.getElementById('fxhf-location')?.value);
    if (heroCity !== lastHeroCity) rememberedCity = '';
    lastHeroCity = heroCity;
    city = cleanCity(entryOptions.city) || cleanCity(rememberedCity) || heroCity || cleanCity(trusted);
    // Clear the previous universe's DOM before it can be remembered as this one.
    body.replaceChildren(); footer.replaceChildren();
    if (current) choices();
    else {
      dialog.dataset.step = 'free'; progress.hidden = true; heading();
      body.append(el('p', 'RAFI vous écoute. Décrivez votre besoin à l’écrit ou avec le micro.'));
      const go = el('button', 'Continuer avec RAFI →', 'fxd-primary'), status = el('p', '', 'fxd-error'); go.type = 'button'; status.setAttribute('role', 'status');
      go.onclick = () => handoff(go, status); footer.append(go, status);
    }
    show();
    if (!current) footer.querySelector('.fxd-primary').click();
  }};
})();
