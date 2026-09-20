(function(){
 "use strict";
 const DATA={"eau": {"title": "Eau & plomberie", "items": [{"label": "Robinet qui fuit", "hint": "plomberie", "id": "eau.robinet-qui-fuit"}, {"label": "Fuite sous un évier", "hint": "plomberie", "id": "eau.fuite-sous-un-evier"}, {"label": "WC bouché", "hint": "plomberie", "id": "eau.wc-bouche"}, {"label": "Canalisation bouchée", "hint": "plomberie", "id": "eau.canalisation-bouchee"}, {"label": "Chasse d’eau défectueuse", "hint": "plomberie", "id": "eau.chasse-deau-defectueuse"}, {"label": "Installer un sanitaire", "hint": "plomberie", "id": "eau.installer-un-sanitaire"}, {"label": "Chauffe-eau en panne", "hint": "plomberie", "id": "eau.chauffe-eau-en-panne"}, {"label": "Faible pression d’eau", "hint": "plomberie", "id": "eau.faible-pression-deau"}]}, "electricite": {"title": "Électricité & équipements", "items": [{"label": "Prise qui ne fonctionne plus", "hint": "electricite", "id": "electricite.prise-qui-ne-fonctionne-plus"}, {"label": "Éclairage en panne", "hint": "electricite", "id": "electricite.eclairage-en-panne"}, {"label": "Disjoncteur qui saute", "hint": "electricite", "id": "electricite.disjoncteur-qui-saute"}, {"label": "Installer un luminaire", "hint": "electricite", "id": "electricite.installer-un-luminaire"}, {"label": "Ajouter une prise", "hint": "electricite", "id": "electricite.ajouter-une-prise"}, {"label": "Vérifier un tableau électrique", "hint": "electricite", "id": "electricite.verifier-un-tableau-electrique"}, {"label": "Équipement électrique en panne", "hint": "electricite", "id": "electricite.equipement-electrique-en-panne"}]}, "confort": {"title": "Climatisation & confort", "items": [{"label": "Climatiseur qui ne refroidit plus", "hint": "climatisation", "id": "confort.climatiseur-qui-ne-refroidit-plus"}, {"label": "Installer un climatiseur", "hint": "climatisation", "id": "confort.installer-un-climatiseur"}, {"label": "Entretenir une climatisation", "hint": "climatisation", "id": "confort.entretenir-une-climatisation"}, {"label": "Climatiseur qui fuit", "hint": "climatisation", "id": "confort.climatiseur-qui-fuit"}, {"label": "Bruit inhabituel de climatisation", "hint": "climatisation", "id": "confort.bruit-inhabituel-de-climatisation"}, {"label": "Problème de ventilation", "hint": "climatisation", "id": "confort.probleme-de-ventilation"}, {"label": "Chauffage en panne", "hint": "climatisation", "id": "confort.chauffage-en-panne"}]}, "portes": {"title": "Portes, fenêtres & sécurité", "items": [{"label": "Porte claquée", "hint": "serrurerie", "id": "portes.porte-claquee"}, {"label": "Clé cassée dans la serrure", "hint": "serrurerie", "id": "portes.cle-cassee-dans-la-serrure"}, {"label": "Remplacer une serrure", "hint": "serrurerie", "id": "portes.remplacer-une-serrure"}, {"label": "Fenêtre qui ferme mal", "hint": "menuiserie", "id": "portes.fenetre-qui-ferme-mal"}, {"label": "Vitre fissurée", "hint": "", "id": "portes.vitre-fissuree"}, {"label": "Volet bloqué", "hint": "menuiserie", "id": "portes.volet-bloque"}, {"label": "Réparer une porte", "hint": "menuiserie", "id": "portes.reparer-une-porte"}, {"label": "Installer une grille de protection", "hint": "", "id": "portes.installer-une-grille-de-protection"}]}, "travaux": {"title": "Travaux & rénovation", "items": [{"label": "Repeindre une pièce", "hint": "peinture", "id": "travaux.repeindre-une-piece"}, {"label": "Peindre une façade", "hint": "peinture", "id": "travaux.peindre-une-facade"}, {"label": "Poser du carrelage", "hint": "carrelage", "id": "travaux.poser-du-carrelage"}, {"label": "Réparer des joints", "hint": "carrelage", "id": "travaux.reparer-des-joints"}, {"label": "Infiltration ou étanchéité", "hint": "", "id": "travaux.infiltration-ou-etancheite"}, {"label": "Rénover une salle de bains", "hint": "", "id": "travaux.renover-une-salle-de-bains"}, {"label": "Rénover une cuisine", "hint": "", "id": "travaux.renover-une-cuisine"}, {"label": "Petits travaux de maçonnerie", "hint": "maconnerie", "id": "travaux.petits-travaux-de-maconnerie"}, {"label": "Aménager une cloison", "hint": "", "id": "travaux.amenager-une-cloison"}, {"label": "Préparer une rénovation complète", "hint": "", "id": "travaux.preparer-une-renovation-complete"}]}, "installation": {"title": "Installation & aménagement", "items": [{"label": "Monter un meuble", "hint": "bricolage", "id": "installation.monter-un-meuble"}, {"label": "Fixer une étagère", "hint": "bricolage", "id": "installation.fixer-une-etagere"}, {"label": "Installer une tringle", "hint": "bricolage", "id": "installation.installer-une-tringle"}, {"label": "Fixer un téléviseur", "hint": "bricolage", "id": "installation.fixer-un-televiseur"}, {"label": "Poser des meubles de cuisine", "hint": "menuiserie", "id": "installation.poser-des-meubles-de-cuisine"}, {"label": "Réparer un meuble", "hint": "menuiserie", "id": "installation.reparer-un-meuble"}, {"label": "Créer un rangement sur mesure", "hint": "menuiserie", "id": "installation.creer-un-rangement-sur-mesure"}, {"label": "Installer un équipement", "hint": "", "id": "installation.installer-un-equipement"}]}, "entretien": {"title": "Entretien & extérieur", "items": [{"label": "Nettoyage après travaux", "hint": "nettoyage", "id": "entretien.nettoyage-apres-travaux"}, {"label": "Grand nettoyage", "hint": "nettoyage", "id": "entretien.grand-nettoyage"}, {"label": "Nettoyer un canapé", "hint": "nettoyage", "id": "entretien.nettoyer-un-canape"}, {"label": "Entretien de jardin", "hint": "jardinage", "id": "entretien.entretien-de-jardin"}, {"label": "Taille de haie", "hint": "jardinage", "id": "entretien.taille-de-haie"}, {"label": "Problème d’arrosage", "hint": "jardinage", "id": "entretien.probleme-darrosage"}, {"label": "Aménager une terrasse", "hint": "", "id": "entretien.amenager-une-terrasse"}, {"label": "Entretien de piscine", "hint": "", "id": "entretien.entretien-de-piscine"}]}, "demenagement": {"title": "Déménagement & manutention", "items": [{"label": "Déménager un appartement", "hint": "demenagement", "id": "demenagement.demenager-un-appartement"}, {"label": "Transporter quelques meubles", "hint": "demenagement", "id": "demenagement.transporter-quelques-meubles"}, {"label": "Déplacer un objet lourd", "hint": "demenagement", "id": "demenagement.deplacer-un-objet-lourd"}, {"label": "Démonter et remonter du mobilier", "hint": "demenagement", "id": "demenagement.demonter-et-remonter-du-mobilier"}, {"label": "Charger ou décharger un véhicule", "hint": "demenagement", "id": "demenagement.charger-ou-decharger-un-vehicule"}, {"label": "Préparer un déménagement de bureau", "hint": "demenagement", "id": "demenagement.preparer-un-demenagement-de-bureau"}]}};
  let dialog, origin, current, selected, draft = '', city = '', priorOverflow, released=true, entryOptions={};
  function release(){if(released)return;released=true;document.body.style.overflow=priorOverflow;origin?.focus({preventScroll:true});}
  const el = (tag, text, cls) => { const n=document.createElement(tag); if(text)n.textContent=text; if(cls)n.className=cls; return n; };
  function close() { if(dialog?.open) { release();dialog.close(); } }
  function build() {
    if(dialog)return;
    dialog=el('dialog',null,'fxd-dialog'); dialog.setAttribute('aria-labelledby','fxd-dialog-title');
    dialog.addEventListener('close',()=>{if(!dialog.open)release();});
    dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}});
    document.body.append(dialog);
  }
  function arrow(){
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.classList.add('fxd-choice-arrow');
    const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d','M5 12h14m-6-6 6 6-6 6');svg.append(path);return svg;
  }
  function frame(step) {
    dialog.replaceChildren();dialog.scrollTop=0;dialog.dataset.step=step;
    const header=el('header');const brand=el('div',null,'fxd-brand');
    brand.append(el('span','R','fxd-orb'));const words=el('div');words.append(el('strong','RAFI'),el('small','Votre point de départ'));brand.append(words);header.append(brand);
    const x=el('button','✕','fxd-close');x.type='button';x.setAttribute('aria-label','Fermer les situations');x.onclick=close;header.append(x);
    const body=el('div',null,'fxd-body');
    const progress=el('div',null,'fxd-progress');progress.setAttribute('aria-label',step==='choices'?'Étape 1 : votre situation':'Étape 2 : vos précisions');
    progress.append(el('span','01 · Situation',step==='choices'?'is-active':'is-complete'),el('span','02 · Précisions',step==='details'?'is-active':''),el('span','Puis RAFI'));
    dialog.append(header,progress,body);return body;
  }
  function heading(body,title,desc){const h=el('h2',title);h.id='fxd-dialog-title';body.append(h,el('p',desc));}
  function choices() {
    const b=frame('choices');b.append(el('div','QUEL EST VOTRE BESOIN ?','fxd-kicker'));heading(b,current.title,'Un premier choix. RAFI vous aide à préciser la suite.');
    const grid=el('div',null,'fxd-choices');
    for(const item of [...current.items,{label:'Autre besoin / Je ne sais pas',hint:''}]){
      const button=el('button');button.append(el('span',item.label),arrow());button.type='button';button.onclick=()=>{selected=item;details();};grid.append(button);
    } b.append(grid,el('p','Aucune demande envoyée à cette étape.','fxd-note'));
  }
  function details() {
    const b=frame('details');
    if(current){const back=el('button','← Retour aux situations','fxd-back');back.type='button';back.onclick=choices;b.append(back);}
    b.append(el('div',current?.title||'VOTRE BESOIN, VOTRE RYTHME','fxd-kicker'));
    heading(b,selected?.label==='Autre besoin / Je ne sais pas'?'Parlez-nous de votre besoin':selected?.label||'Votre besoin, avec vos mots','Un détail, une ville : RAFI reprend votre besoin et vous guide.');
    const label=el('label','Votre description','fxd-field'); const input=el('textarea');input.id='fxd-description';label.htmlFor=input.id;input.maxLength=2000;
    input.value=draft || (selected?.label==='Autre besoin / Je ne sais pas'?'':selected?.label||'');input.placeholder='Ex. : je souhaite aménager un rangement sous mon escalier…';input.oninput=()=>{draft=input.value;};
    const cityLabel=el('label','Ville d’intervention','fxd-field');const select=el('select');select.id='fxd-city';cityLabel.htmlFor=select.id;
    const empty=el('option','Choisir une ville');empty.value='';select.append(empty);
    for(const item of window.FIXEO_CITIES_MAP||[]){const option=el('option',item.label);option.value=item.value;select.append(option);}select.value=city;select.onchange=()=>{city=select.value;};
    const error=el('p','','fxd-error');error.setAttribute('role','status');
    const go=el('button','Continuer avec RAFI →','fxd-primary');go.type='button';
    go.onclick=async()=>{
      draft=input.value.trim();city=select.value;
      if(!window.FixeoEstimatorV2?.open){error.textContent='RAFI se prépare. Réessayez dans un instant.';return;}
      const description=selected && selected.hint && draft && !draft.toLowerCase().includes(selected.label.toLowerCase()) ? selected.label+' — '+draft : draft;
      const context={source:entryOptions.source||'homepage_discovery',description,city};if(selected?.hint)context.metier_hint=selected.hint;if(selected?.id)context.situation_id=selected.id;
      go.disabled=true; close();
      try {const result=await window.FixeoEstimatorV2.open(context);if(result?.accepted===false)throw new Error('unavailable');}
      catch(_){priorOverflow=document.body.style.overflow;released=false;dialog.showModal();document.body.style.overflow='hidden';error.textContent='L’ouverture a échoué. Votre saisie est conservée, vous pouvez réessayer.';}
      finally{go.disabled=false;}
    };
    const fields=el('div',null,'fxd-form-panel');fields.append(label,input,cityLabel,select);
    const voice=el('p','Vous préférez parler ? Le micro français / darija vous attend dans RAFI.','fxd-voice-note');
    b.append(fields,voice,go,error,el('p','Vous gardez la main. Aucune demande envoyée à cette étape.','fxd-note'));
  }
  window.FixeoDiscovery={open(key,trigger,options){entryOptions=options||{};build();origin=trigger;current=DATA[key]||null;selected=null;dialog.dataset.universe=key||'libre';
    draft=entryOptions.description ?? (document.getElementById('fxhf-need-input')?.value||'');city=entryOptions.city ?? (document.getElementById('fxhf-location')?.value||'');
    if(current)choices();else details();priorOverflow=document.body.style.overflow;released=false;dialog.showModal();document.body.style.overflow='hidden';
  }};
})();
