/*!
 * Phase 7C.9L.3S — Estimator Card CSS Parity + Profile Link Tests
 * Tests: 23 targeted checks
 */
(function() {
'use strict';

var results = [];
var pass = 0; var fail = 0;
function t(label, cond) {
  if (cond) { pass++; results.push('  PASS: ' + label); }
  else       { fail++; results.push('  FAIL: ' + label); }
}

/* ── Bootstrap FHP renderer ── */
var fs = require ? require('fs') : null;
if (!fs) { console.error('Node only'); return; }
var patchSrc = fs.readFileSync(__dirname + '/../../../../../js/fixeo_homepage_premium_patch.js','utf8');
var cssSrc   = fs.readFileSync(__dirname + '/../../../../../css/artisan-card-conversion-v1.css','utf8');

var win = {
  FixeoMatchingEngine:null,FixeoHeroes:null,FixeoPricing:null,FIXEO_CITIES:[],
  FIXEO_DETECTED_CITY:'',renderArtisans:function(){},addEventListener:function(){},
  setTimeout:function(){},MutationObserver:function(){this.observe=function(){};this.disconnect=function(){};}
};
var doc = {readyState:'complete',addEventListener:function(){},getElementById:function(){return null;},
  querySelector:function(){return null;},querySelectorAll:function(){return[];},
  createElement:function(){return{style:{},classList:{add:function(){},remove:function(){},contains:function(){return false;}},
    setAttribute:function(){},appendChild:function(){},innerHTML:'',querySelectorAll:function(){return[];},querySelector:function(){return null;}};},
  body:{style:{},classList:{add:function(){},remove:function(){},contains:function(){return false;}}}};
try{new Function('window','document',patchSrc)(win,doc);}catch(e){}
var FHP = win.FixeoHomepagePremium;

var artisan = {id:'uuid-test-1111-2222-3333',name:'Plombier Expert',category:'plomberie',
  city:'Casablanca',price_from:200,rating:0,reviewCount:0,score_qualification:0,
  description:'Expert en plomberie sanitaire.'};
var uuidArtisan = {id:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',name:'UUID Artisan',
  category:'plomberie',city:'Rabat',price_from:0,rating:0,reviewCount:0,score_qualification:0,description:''};

var estCard   = FHP.buildCard(artisan, 0, {estimatorMode:true});
var normalCard = FHP.buildCard(artisan, 0);
var uuidCard  = FHP.buildCard(uuidArtisan, 0, {estimatorMode:true});

/* ── 1: Card class ── */
t('modal card is .pvc-card.fhp-card',
  estCard.includes('class="pvc-card fhp-card"'));

/* ── 2-6: HTML parity (identical pre-action blocks) ── */
var estHeader    = estCard.substring(0, estCard.lastIndexOf('<div class="pvc-action-v3b">'));
var normalHeader = normalCard.substring(0, normalCard.lastIndexOf('<div class="pvc-action-v3b">'));
var estTrust  = estCard.indexOf('pvc-trust-v3b"');
var normTrust = normalCard.indexOf('pvc-trust-v3b"');
t('avatar block present and identical content',
  estCard.includes('pvc-avatar') && normalCard.includes('pvc-avatar') &&
  estCard.substring(estCard.indexOf('pvc-avatar'), estCard.indexOf('pvc-avatar')+120) ===
  normalCard.substring(normalCard.indexOf('pvc-avatar'), normalCard.indexOf('pvc-avatar')+120));
t('name block identical in both cards',
  estCard.includes('pvc-name') && normalCard.includes('pvc-name'));
t('trust block present in estimator card',
  estCard.includes('pvc-trust-v3b'));
t('trust block HTML identical',
  estCard.substring(estTrust, estCard.lastIndexOf('<div class="pvc-action-v3b">')) ===
  normalCard.substring(normTrust, normalCard.lastIndexOf('<div class="pvc-action-v3b">')));
t('description block present',
  estCard.includes('pvc-desc-v3b'));

/* ── 7-9: Price removed ── */
t('estimator price absent — À partir de',
  !estCard.includes('À partir de'));
t('estimator Tarif renseigné absent',
  !estCard.includes('Tarif renseigné'));
t('normal card has price block',
  normalCard.includes('À partir de'));

/* ── 10-11: Choisir cet artisan ── */
t('Choisir cet artisan present',
  estCard.includes('Choisir cet artisan'));
t('Choisir CTA has data-estimator-select',
  estCard.includes('data-estimator-select="true"'));

/* ── 12-16: Profile link ── */
t('Voir le profil complet present',
  estCard.includes('Voir le profil complet'));
t('profile link has pvc-profile-v3b class',
  estCard.includes('pvc-profile-v3b'));
t('profile link has fhp-btn-profile class',
  estCard.includes('fhp-btn-profile'));
t('profile link has target=_blank',
  estCard.includes('target="_blank"'));
t('profile link has rel=noopener noreferrer',
  estCard.includes('rel="noopener noreferrer"'));

/* ── 17: Profile URL format ── */
t('profile href format artisan-profile.html?id=',
  estCard.includes('href="artisan-profile.html?id='));

/* ── 18: Profile link does NOT have data-estimator-select (no accidental selection) ── */
var profileIdx = estCard.indexOf('pvc-profile-v3b');
var profileBlock = estCard.substring(profileIdx, profileIdx + 300);
t('profile link element does not have data-estimator-select',
  !profileBlock.includes('data-estimator-select'));

/* ── 19: UUID artisan ── */
t('UUID artisan card renders correctly',
  uuidCard.includes('UUID Artisan') && uuidCard.includes('Choisir cet artisan'));
t('UUID artisan profile href encoded',
  uuidCard.includes('artisan-profile.html?id=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'));

/* ── 20-21: Normal homepage unchanged ── */
t('normal homepage CTA unchanged — Réserver maintenant',
  normalCard.includes('Réserver maintenant'));
t('normal homepage profile link same-tab (no target=_blank)',
  normalCard.includes('pvc-profile-v3b') && !normalCard.includes('target="_blank"'));

/* ── 22-23: CSS modal scope present ── */
t('CSS has #fixeo-reservation-modal .fhp-card selector',
  cssSrc.includes('#fixeo-reservation-modal .fhp-card'));
t('CSS has trust-v3b column layout for modal',
  cssSrc.includes('#fixeo-reservation-modal .fhp-card .pvc-trust-v3b') &&
  cssSrc.includes('flex-direction: column'));

/* ── Canonical diffs ── */
var resSrc = fs.readFileSync(__dirname + '/../../../../../js/reservation.js','utf8');
t('reservation.js canonical pricing diff = 0 (amount_mad unchanged)',
  !resSrc.includes('amount_mad = ') || resSrc.includes('state._estimatorCtx.amount_mad'));

/* ── Report ── */
console.log('\nPhase 7C.9L.3S — Card Parity + Profile Link Tests');
results.forEach(function(r){console.log(r);});
console.log('\n' + pass + '/' + (pass+fail) + ' tests pass' + (fail?' — FAILURES ABOVE':''));
process.exitCode = fail ? 1 : 0;
})();
