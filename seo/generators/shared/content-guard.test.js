/**
 * content-guard.test.js — Self-test for FIXEO SEO V3 content-guard.js
 * =====================================================================
 * Dependency-free test runner. Run with:
 *
 *   node seo/generators/shared/content-guard.test.js
 *
 * Exit code 0 = all tests passed.
 * Exit code 1 = one or more tests failed.
 *
 * Test categories:
 *   A — Banned terms that MUST throw (false negative = guard is broken)
 *   B — Compliant phrases that MUST NOT throw (false positive = guard is over-broad)
 *   C — Capitalisation variants (guard must be case-insensitive)
 *   D — Apostrophe variants (ASCII ' vs Unicode ')
 *   E — Q11-approved time-based wording (must pass)
 *   F — Isolated generic words that must NOT be banned
 */

'use strict';

const { check, BANNED_TERMS } = require('./content-guard');

// ---------------------------------------------------------------------------
// Minimal test harness
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const failures = [];

function mustThrow(label, text) {
  try {
    check(text, 'test_field', 'test_page');
    failed++;
    failures.push(`  FAIL [mustThrow] "${label}" — expected throw but passed`);
  } catch (e) {
    passed++;
    console.log(`  PASS [mustThrow] "${label}"`);
  }
}

function mustPass(label, text) {
  try {
    check(text, 'test_field', 'test_page');
    passed++;
    console.log(`  PASS [mustPass]  "${label}"`);
  } catch (e) {
    failed++;
    failures.push(`  FAIL [mustPass]  "${label}" — unexpected throw: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// A — Banned terms (must throw)
// ---------------------------------------------------------------------------
console.log('\n=== A — Banned terms (must throw) ===');

mustThrow('artisan vérifié', 'Fixeo vous connecte avec un artisan vérifié disponible.');
mustThrow('artisans vérifiés', 'Nos artisans vérifiés interviennent dans votre secteur.');
mustThrow('artisan qualifié', 'Trouvez un artisan qualifié en plomberie.');
mustThrow('artisan certifié', 'Un artisan certifié vous contacte.');
mustThrow('électricien certifié', 'Un électricien certifié dans votre secteur.');
mustThrow('électricien qualifié', 'Faire appel à un électricien qualifié.');
mustThrow('plombier qualifié', 'Un plombier qualifié disponible à Casablanca.');
mustThrow('serrurier qualifié', 'Un serrurier qualifié pour votre urgence.');
mustThrow('disponible immédiatement', 'Un artisan disponible immédiatement via Fixeo.');
mustThrow('disponible maintenant', 'Plombier disponible maintenant sur Fixeo.');
mustThrow("dans l'heure (ASCII apostrophe)", "Intervention dans l'heure garantie.");
mustThrow('24h/7', 'Service disponible 24h/7 via Fixeo.');
mustThrow('24h/24', 'Disponibles 24h/24, 7j/7.');
mustThrow('7j/7', 'Nos artisans travaillent 7j/7 pour vous.');
mustThrow('devis gratuit', 'Devis gratuit et intervention rapide.');
mustThrow('intervention gratuite', 'Première intervention gratuite.');
mustThrow('connecte instantanément', 'Fixeo vous connecte instantanément avec un artisan.');
mustThrow('mise en relation instantanée', 'Mise en relation instantanée avec un professionnel.');
mustThrow('tarif garanti', 'Tarif garanti avant votre intervention.');
mustThrow('prix fixe', 'Prix fixe affiché sur notre plateforme.');
mustThrow('prix garanti', 'Prix garanti — aucune mauvaise surprise.');
mustThrow('disponibilité garantie', 'Disponibilité garantie 24h/7.');
mustThrow('réponse garantie', 'Réponse garantie en moins de 30 minutes.');
mustThrow('intervention garantie', 'Intervention garantie le jour même.');

// ---------------------------------------------------------------------------
// B — Compliant phrases (must NOT throw)
// ---------------------------------------------------------------------------
console.log('\n=== B — Compliant phrases (must NOT throw) ===');

mustPass('artisan référencé sur FIXEO', 'Profil artisan référencé sur FIXEO.');
mustPass('professionnel référencé', 'Un professionnel référencé vous contacte.');
mustPass('profils référencés', 'Consultez les profils référencés sur FIXEO.');
mustPass("l'artisan confirme sa disponibilité", "L'artisan confirme sa disponibilité et le créneau.");
mustPass('votre demande est enregistrée à toute heure', 'Votre demande est enregistrée à toute heure.');
mustPass('tarif confirmé avant intervention', 'Tarif confirmé avec l\'artisan avant intervention.');
mustPass('paiement après intervention', 'Paiement après intervention — aucun acompte.');
mustPass('le créneau est confirmé avec l\'artisan', 'Le créneau est confirmé avec l\'artisan avant l\'intervention.');
mustPass('dans les meilleurs délais (Q11 form)', 'L\'artisan confirme sa disponibilité dans les meilleurs délais.');

// ---------------------------------------------------------------------------
// C — Capitalisation variants (guard must be case-insensitive)
// ---------------------------------------------------------------------------
console.log('\n=== C — Capitalisation variants (must throw) ===');

mustThrow('ARTISAN VÉRIFIÉ (uppercase)', 'ARTISAN VÉRIFIÉ ET DISPONIBLE.');
mustThrow('Disponible Maintenant (title case)', 'Plombier Disponible Maintenant via Fixeo.');
mustThrow('DEVIS GRATUIT (all caps)', 'DEVIS GRATUIT ET RAPIDE.');
mustThrow('24H/7 (uppercase H)', 'Service 24H/7 sur Fixeo.');
mustThrow('Artisan Qualifié (mixed case)', 'Faites appel à un Artisan Qualifié.');
mustThrow('Disponible Immédiatement (title case)', 'Un Artisan Disponible Immédiatement.');

// ---------------------------------------------------------------------------
// D — Apostrophe variants (Unicode RIGHT SINGLE QUOTATION MARK U+2019)
// ---------------------------------------------------------------------------
console.log('\n=== D — Apostrophe variants (must throw) ===');

mustThrow("dans l\u2019heure (Unicode right-quote)", "Intervention dans l\u2019heure.");
mustThrow("dans l\u2018heure (Unicode left-quote)", "Intervention dans l\u2018heure.");

// ---------------------------------------------------------------------------
// E — Q11-approved time-based wording (must NOT throw)
// ---------------------------------------------------------------------------
console.log('\n=== E — Q11-approved time-based wording (must NOT throw) ===');

mustPass(
  'Q11 form: demande enregistrée à toute heure',
  'Votre demande est enregistrée à toute heure. L\'artisan confirme sa disponibilité et le créneau dans les meilleurs délais.'
);
mustPass(
  'Q11 form without time reference',
  'Décrivez votre besoin. Votre demande est enregistrée et transmise aux artisans référencés.'
);

// ---------------------------------------------------------------------------
// F — Isolated generic words (must NOT throw — no false positives)
// ---------------------------------------------------------------------------
console.log('\n=== F — Isolated generic words (must NOT throw) ===');

mustPass('disponible (alone)', 'Un artisan disponible dans votre secteur.');
mustPass('disponibilité (alone)', "L'artisan confirme sa disponibilité.");
mustPass('qualifié (alone, different context)', 'Un professionnel qualifié dans le sens général.');
mustPass('garantie (product quality, not service level)', 'Garantie de satisfaction sur nos prestations.');
mustPass('gratuit (alone, different context)', 'Inscription gratuite pour les artisans.');
mustPass('prix (alone)', 'Le prix est communiqué avant intervention.');
mustPass('intervention (alone)', 'Une intervention de qualité.');
mustPass('fixe (as adjective, not price claim)', 'Un tarif fixe est communiqué par l\'artisan.');

// ---------------------------------------------------------------------------
// G — BANNED_TERMS inventory check
// ---------------------------------------------------------------------------
console.log('\n=== G — BANNED_TERMS inventory ===');
console.log(`  Total banned terms: ${BANNED_TERMS.length}`);
BANNED_TERMS.forEach((t, i) => console.log(`  [${String(i + 1).padStart(2, '0')}] "${t}"`));

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------
console.log('\n=== RESULTS ===');
console.log(`  Total tests : ${passed + failed}`);
console.log(`  Passed      : ${passed}`);
console.log(`  Failed      : ${failed}`);

if (failures.length > 0) {
  console.error('\nFAILURES:');
  failures.forEach(f => console.error(f));
  process.exit(1);
} else {
  console.log('\n✅ All tests passed.');
  process.exit(0);
}
