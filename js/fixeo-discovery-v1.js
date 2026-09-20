(function(){
 "use strict";
 const DATA={"eau": {"title": "Eau & plomberie", "items": [{"label": "Robinet qui fuit", "hint": "plomberie"}, {"label": "Fuite sous un évier", "hint": "plomberie"}, {"label": "WC bouché", "hint": "plomberie"}, {"label": "Canalisation bouchée", "hint": "plomberie"}, {"label": "Chasse d’eau défectueuse", "hint": "plomberie"}, {"label": "Installer un sanitaire", "hint": "plomberie"}, {"label": "Chauffe-eau en panne", "hint": "plomberie"}, {"label": "Faible pression d’eau", "hint": "plomberie"}]}, "electricite": {"title": "Électricité & équipements", "items": [{"label": "Prise qui ne fonctionne plus", "hint": "electricite"}, {"label": "Éclairage en panne", "hint": "electricite"}, {"label": "Disjoncteur qui saute", "hint": "electricite"}, {"label": "Installer un luminaire", "hint": "electricite"}, {"label": "Ajouter une prise", "hint": "electricite"}, {"label": "Vérifier un tableau électrique", "hint": "electricite"}, {"label": "Équipement électrique en panne", "hint": "electricite"}]}, "confort": {"title": "Climatisation & confort", "items": [{"label": "Climatiseur qui ne refroidit plus", "hint": "climatisation"}, {"label": "Installer un climatiseur", "hint": "climatisation"}, {"label": "Entretenir une climatisation", "hint": "climatisation"}, {"label": "Climatiseur qui fuit", "hint": "climatisation"}, {"label": "Bruit inhabituel de climatisation", "hint": "climatisation"}, {"label": "Problème de ventilation", "hint": "climatisation"}, {"label": "Chauffage en panne", "hint": "climatisation"}]}, "portes": {"title": "Portes, fenêtres & sécurité", "items": [{"label": "Porte claquée", "hint": "serrurerie"}, {"label": "Clé cassée dans la serrure", "hint": "serrurerie"}, {"label": "Remplacer une serrure", "hint": "serrurerie"}, {"label": "Fenêtre qui ferme mal", "hint": "menuiserie"}, {"label": "Vitre fissurée", "hint": ""}, {"label": "Volet bloqué", "hint": "menuiserie"}, {"label": "Réparer une porte", "hint": "menuiserie"}, {"label": "Installer une grille de protection", "hint": ""}]}, "travaux": {"title": "Travaux & rénovation", "items": [{"label": "Repeindre une pièce", "hint": "peinture"}, {"label": "Peindre une façade", "hint": "peinture"}, {"label": "Poser du carrelage", "hint": "carrelage"}, {"label": "Réparer des joints", "hint": "carrelage"}, {"label": "Infiltration ou étanchéité", "hint": ""}, {"label": "Rénover une salle de bains", "hint": ""}, {"label": "Rénover une cuisine", "hint": ""}, {"label": "Petits travaux de maçonnerie", "hint": "maconnerie"}, {"label": "Aménager une cloison", "hint": ""}, {"label": "Préparer une rénovation complète", "hint": ""}]}, "installation": {"title": "Installation & aménagement", "items": [{"label": "Monter un meuble", "hint": "bricolage"}, {"label": "Fixer une étagère", "hint": "bricolage"}, {"label": "Installer une tringle", "hint": "bricolage"}, {"label": "Fixer un téléviseur", "hint": "bricolage"}, {"label": "Poser des meubles de cuisine", "hint": "menuiserie"}, {"label": "Réparer un meuble", "hint": "menuiserie"}, {"label": "Créer un rangement sur mesure", "hint": "menuiserie"}, {"label": "Installer un équipement", "hint": ""}]}, "entretien": {"title": "Entretien & extérieur", "items": [{"label": "Nettoyage après travaux", "hint": "nettoyage"}, {"label": "Grand nettoyage", "hint": "nettoyage"}, {"label": "Nettoyer un canapé", "hint": "nettoyage"}, {"label": "Entretien de jardin", "hint": "jardinage"}, {"label": "Taille de haie", "hint": "jardinage"}, {"label": "Problème d’arrosage", "hint": "jardinage"}, {"label": "Aménager une terrasse", "hint": ""}, {"label": "Entretien de piscine", "hint": ""}]}, "demenagement": {"title": "Déménagement & manutention", "items": [{"label": "Déménager un appartement", "hint": "demenagement"}, {"label": "Transporter quelques meubles", "hint": "demenagement"}, {"label": "Déplacer un objet lourd", "hint": "demenagement"}, {"label": "Démonter et remonter du mobilier", "hint": "demenagement"}, {"label": "Charger ou décharger un véhicule", "hint": "demenagement"}, {"label": "Préparer un déménagement de bureau", "hint": "demenagement"}]}};
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
      const context={source:entryOptions.source||'homepage_discovery',description,city};if(selected?.hint)context.metier_hint=selected.hint;
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
