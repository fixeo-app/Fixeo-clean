/**
 * RAFI Status Narrator V1
 * js/rafi-status-narrator-v1.js  v1b
 *
 * Maps REAL backend state combinations to user-facing French messages.
 *
 * ══════════════════════════════════════════════════════════════════════
 * CANONICAL STATUS VOCABULARY (from repository migrations — read-only)
 *
 *   service_requests.status:
 *     new | assigned | in_progress | completed | validated | cancelled | no_match
 *
 *   missions.status:
 *     offered | pending | in_progress | done | declined | terminée | validée
 *     (source: supabase/7c11e2-mission-lifecycle.sql)
 *
 * STATE MACHINE (missions):
 *   offered → [artisan accepts]  → pending
 *   offered → [artisan declines] → declined
 *   pending → [artisan starts]   → in_progress
 *   in_progress → [artisan done] → done
 *   done        → [client valid] → terminée     ← DISTINCT from validée
 *   terminée    → [admin settle] → (settlement columns set; status may stay terminée)
 *   terminée/validée → eligible for admin-settle-mission-fn
 *
 * STATE MACHINE (service_requests):
 *   new → [claim] → assigned → [start] → in_progress → [complete] → completed
 *   completed → [client confirms] → validated
 *   any → cancelled
 *   new → [no artisan] → no_match
 *
 * SETTLEMENT FACTS (from admin-settle-mission-fn):
 *   - Settlement is ADMIN-MANUAL (POST /api/admin/missions/settle)
 *   - ELIGIBLE: terminée, validée
 *   - Settlement sets final_price + commission_amount (DB trigger)
 *   - NO automatic payout to artisan — payout mechanism not in codebase
 *   - terminée ↔ validée transition authority: NOT CONFIRMED in code review
 *
 * ══════════════════════════════════════════════════════════════════════
 *
 * RULES:
 *   - Narrate ONLY what the status proves — no inferred future state
 *   - terminée ≠ validée: narrate each state on its own terms
 *   - Do NOT promise payment completion unless status = validée AND
 *     that state provably means payment was made (it doesn't — see facts above)
 *   - Do NOT narrate dispatch progress (candidateCount/deliveredCount)
 *     as a guaranteed outcome — use conditional phrasing
 *   - No DB writes, no auth interaction, no financial calculation
 *   - Returns structured messages — caller decides how to render
 *
 * Integration contract:
 *   var msg = RafiNarrator.narrateRequest(srStatus, context);
 *   var msg = RafiNarrator.narrateMission(missionStatus, context);
 *   var msg = RafiNarrator.narrateEnterpriseRequest(srStatus, context);
 *
 *   msg.text      → main French sentence (safe, no HTML)
 *   msg.sub       → optional sub-line (null if not applicable)
 *   msg.icon      → emoji for display
 *   msg.tone      → 'info' | 'positive' | 'waiting' | 'alert' | 'neutral'
 *   msg.adminNote → admin-facing note (do NOT render in client UI)
 */

(function (window) {
  'use strict';

  /* ════════════════════════════════════════════════════════════
   * SERVICE REQUEST NARRATION
   * Canonical: service_requests.status
   * ════════════════════════════════════════════════════════════ */

  /**
   * Narrate a service_requests.status for client-facing display.
   *
   * @param {string} srStatus
   * @param {object} [context]
   *   context.candidateCount  {number}  — artisans found in dispatch pool
   *   context.deliveredCount  {number}  — artisans notified (WhatsApp)
   *   context.artisanName     {string}  — artisan name (only meaningful for assigned/in_progress)
   *   context.city            {string}  — request city
   *   context.category        {string}  — service category slug
   * @returns {{ text, sub, icon, tone, adminNote }}
   */
  function narrateRequest(srStatus, context) {
    context = context || {};

    switch (srStatus) {

      /* ── NEW ──────────────────────────────────────────────────────
       * Dispatch has been triggered but no artisan has accepted yet.
       * deliveredCount/candidateCount are hints — not guarantees.
       * Do NOT say "un artisan confirmera" as if acceptance is certain.
       * ─────────────────────────────────────────────────────────── */
      case 'new': {
        if (context.deliveredCount && context.deliveredCount > 0) {
          var n = context.deliveredCount;
          return {
            icon: '📡',
            tone: 'waiting',
            text: 'Votre demande a été transmise à ' + n +
                  ' artisan' + (n > 1 ? 's' : '') + '.',
            sub: 'En attente qu\'un artisan accepte.',
            adminNote: n + ' artisan(s) notifiés — aucun claim enregistré.'
          };
        }
        if (context.candidateCount && context.candidateCount > 0) {
          return {
            icon: '🔍',
            tone: 'waiting',
            text: 'RAFI recherche un artisan pour votre demande.',
            sub: context.candidateCount + ' artisan' +
                 (context.candidateCount > 1 ? 's identifiés' : ' identifié') + '.',
            adminNote: context.candidateCount + ' candidates trouvés — notification non encore confirmée.'
          };
        }
        return {
          icon: '🔍',
          tone: 'waiting',
          text: 'Votre demande est en cours de traitement.',
          sub: null,
          adminNote: 'SR status=new — dispatch non encore déclenché ou statut inconnu.'
        };
      }

      /* ── ASSIGNED ─────────────────────────────────────────────────
       * An artisan has claimed the mission (pending state on missions).
       * ─────────────────────────────────────────────────────────── */
      case 'assigned': {
        var artisan = context.artisanName || 'Un artisan';
        return {
          icon: '✅',
          tone: 'positive',
          text: artisan + ' a accepté votre demande.',
          sub: null,
          adminNote: 'Mission claim enregistré. Artisan: ' + (context.artisanName || '—') + '.'
        };
      }

      /* ── IN_PROGRESS ──────────────────────────────────────────────
       * Artisan has started the intervention.
       * ─────────────────────────────────────────────────────────── */
      case 'in_progress': {
        var art2 = context.artisanName ? context.artisanName + ' est' : 'L\'artisan est';
        return {
          icon: '🔨',
          tone: 'positive',
          text: art2 + ' en cours d\'intervention.',
          sub: null,
          adminNote: 'Mission in_progress.'
        };
      }

      /* ── COMPLETED ────────────────────────────────────────────────
       * Artisan has reported work done (complete_mission_v1).
       * The service_request is now 'completed'.
       * Client validation step follows (done→terminée on mission side).
       * Do NOT say "validée" — that is a separate state.
       * ─────────────────────────────────────────────────────────── */
      case 'completed': {
        return {
          icon: '🏁',
          tone: 'waiting',
          text: 'L\'artisan a signalé la fin de l\'intervention.',
          sub: 'Confirmez que tout est en ordre pour clôturer la mission.',
          adminNote: 'SR completed — en attente de validation client (done→terminée).'
        };
      }

      /* ── VALIDATED ────────────────────────────────────────────────
       * Client has confirmed the work. This is the terminal positive state
       * for service_requests. Settlement (admin-manual) may follow.
       * Do NOT claim settlement is done — it requires admin action.
       * ─────────────────────────────────────────────────────────── */
      case 'validated': {
        return {
          icon: '⭐',
          tone: 'positive',
          text: 'Intervention confirmée.',
          sub: null,
          adminNote: 'SR validated. Settlement eligible (admin action required).'
        };
      }

      /* ── CANCELLED ────────────────────────────────────────────────
       * ─────────────────────────────────────────────────────────── */
      case 'cancelled': {
        return {
          icon: '❌',
          tone: 'neutral',
          text: 'Cette demande a été annulée.',
          sub: null,
          adminNote: 'SR cancelled. Consulter le journal d\'audit pour la raison.'
        };
      }

      /* ── NO_MATCH ─────────────────────────────────────────────────
       * Dispatch found no eligible artisan.
       * Do NOT promise a future artisan — that is not guaranteed.
       * Do NOT claim human notification — no backend evidence.
       * ─────────────────────────────────────────────────────────── */
      case 'no_match': {
        var cityNote = context.city ? ' dans la région de ' + context.city : ' dans cette zone';
        return {
          icon: '😔',
          tone: 'alert',
          text: 'Aucun artisan disponible' + cityNote + ' pour cette demande.',
          sub: 'Vous pouvez soumettre une nouvelle demande ultérieurement.',
          adminNote: 'no_match: ' + (context.city || '?') + ' / ' + (context.category || '?') +
                     '. Vérifier la couverture artisans pour ce couple ville+catégorie.'
        };
      }

      /* ── UNKNOWN / FALLBACK ───────────────────────────────────── */
      default: {
        return {
          icon: '⏳',
          tone: 'info',
          text: 'Demande en cours de traitement.',
          sub: null,
          adminNote: 'Statut SR inconnu: ' + srStatus
        };
      }
    }
  }

  /* ════════════════════════════════════════════════════════════
   * MISSION NARRATION
   * Canonical: missions.status (from 7c11e2-mission-lifecycle.sql)
   *
   * CRITICAL STATE DISTINCTION:
   *   done      = artisan reported work complete (complete_mission_v1 called)
   *               → service_request moves to 'completed'
   *               → awaiting CLIENT confirmation
   *   terminée  = client confirmed the work (done→terminée transition)
   *               = terminal positive state for the mission lifecycle
   *               = ELIGIBLE for admin settlement — settlement not yet done
   *   validée   = settlement-eligible state (terminée OR validée accepted by
   *               admin-settle-mission-fn); transition authority not confirmed
   *               in code review
   *
   * DO NOT conflate terminée with validée.
   * DO NOT narrate payment as complete for terminée — settlement is admin-manual.
   * DO NOT narrate payment as complete for validée — payout mechanism not in codebase.
   * ════════════════════════════════════════════════════════════ */

  /**
   * Narrate a missions.status for artisan/admin display.
   *
   * @param {string} missionStatus
   * @param {object} [context]
   *   context.category  {string}
   *   context.city      {string}
   * @returns {{ text, sub, icon, tone, adminNote }}
   */
  function narrateMission(missionStatus, context) {
    context = context || {};
    var cat  = context.category ? ' (' + context.category + ')' : '';
    var city = context.city ? ' à ' + context.city : '';

    switch (missionStatus) {

      /* ── OFFERED ──────────────────────────────────────────────────
       * Mission row created; artisan has been notified. No claim yet.
       * ─────────────────────────────────────────────────────────── */
      case 'offered': {
        return {
          icon: '📬',
          tone: 'info',
          text: 'Nouvelle mission' + cat + city + '.',
          sub: 'Acceptez pour confirmer votre intervention.',
          adminNote: 'Mission offered — en attente de claim artisan.'
        };
      }

      /* ── PENDING ──────────────────────────────────────────────────
       * Artisan claimed (claim_mission). Intervention not yet started.
       * ─────────────────────────────────────────────────────────── */
      case 'pending': {
        return {
          icon: '🤝',
          tone: 'positive',
          text: 'Mission acceptée' + cat + '.',
          sub: 'Démarrez l\'intervention à votre arrivée.',
          adminNote: 'Mission claimed — en attente de démarrage (start_mission_v1).'
        };
      }

      /* ── IN_PROGRESS ──────────────────────────────────────────────
       * Artisan started (start_mission_v1).
       * ─────────────────────────────────────────────────────────── */
      case 'in_progress': {
        return {
          icon: '🔨',
          tone: 'positive',
          text: 'Intervention en cours.',
          sub: 'Signalez la fin lorsque les travaux sont terminés.',
          adminNote: 'Mission in_progress — en attente de complete_mission_v1.'
        };
      }

      /* ── DONE ─────────────────────────────────────────────────────
       * Artisan reported complete (complete_mission_v1).
       * service_request moved to 'completed'.
       * Awaiting client confirmation to reach 'terminée'.
       * ─────────────────────────────────────────────────────────── */
      case 'done': {
        return {
          icon: '⏳',
          tone: 'waiting',
          text: 'Travaux signalés terminés.',
          sub: 'En attente de confirmation du client.',
          adminNote: 'Mission done — SR=completed. Awaiting client validation (done→terminée).'
        };
      }

      /* ── DECLINED ─────────────────────────────────────────────────
       * Artisan declined. SR may be re-dispatched.
       * ─────────────────────────────────────────────────────────── */
      case 'declined': {
        return {
          icon: '↩️',
          tone: 'neutral',
          text: 'Mission déclinée.',
          sub: null,
          adminNote: 'Artisan declined. Vérifier si une re-dispatch a été déclenchée.'
        };
      }

      /* ── TERMINÉE ─────────────────────────────────────────────────
       * Client confirmed the work (done→terminée).
       * This is the terminal positive lifecycle state.
       * Eligible for admin financial settlement — but settlement is NOT done yet.
       * Do NOT narrate "paiement traité" — that requires admin action.
       * Do NOT narrate "validée" — that is a distinct state.
       * ─────────────────────────────────────────────────────────── */
      case 'terminée': {
        return {
          icon: '🏆',
          tone: 'positive',
          text: 'Mission terminée.',
          sub: null,
          adminNote: 'Mission terminée — eligible for settlement (admin-settle-mission-fn). Settlement not yet confirmed.'
        };
      }

      /* ── VALIDÉE ──────────────────────────────────────────────────
       * Settlement-eligible state. Distinct from terminée.
       * Transition authority not confirmed in code review (see dossier TD-010).
       * admin-settle-mission-fn accepts both terminée AND validée.
       * Do NOT claim payout was made — payout mechanism not in codebase.
       * ─────────────────────────────────────────────────────────── */
      case 'validée': {
        return {
          icon: '✔️',
          tone: 'positive',
          text: 'Mission clôturée.',
          sub: null,
          adminNote: 'Mission validée — settlement eligible. Payout mechanism not confirmed in codebase.'
        };
      }

      /* ── UNKNOWN / FALLBACK ───────────────────────────────────── */
      default: {
        return {
          icon: '⏳',
          tone: 'info',
          text: 'Mission en cours de traitement.',
          sub: null,
          adminNote: 'Statut mission inconnu: ' + missionStatus
        };
      }
    }
  }

  /* ════════════════════════════════════════════════════════════
   * ENTERPRISE REQUEST NARRATION
   * Same canonical states — B2B framing (site/org perspective).
   * Same state-fidelity rules apply.
   * ════════════════════════════════════════════════════════════ */

  /**
   * Narrate a service_requests.status from enterprise member perspective.
   *
   * @param {string} srStatus
   * @param {object} [context]
   *   context.siteName    {string}
   *   context.category    {string}
   *   context.city        {string}
   *   context.artisanName {string}
   * @returns {{ text, sub, icon, tone, adminNote }}
   */
  function narrateEnterpriseRequest(srStatus, context) {
    context = context || {};
    var site = context.siteName ? 'Site ' + context.siteName : 'Votre site';
    var cat  = context.category ? ' · ' + context.category : '';

    switch (srStatus) {

      case 'new':
        return {
          icon: '🔍',
          tone: 'waiting',
          text: site + cat + ' — En attente d\'artisan.',
          sub: null,
          adminNote: 'Enterprise SR new — dispatch en cours.'
        };

      case 'assigned':
        return {
          icon: '✅',
          tone: 'positive',
          text: site + cat + ' — Artisan affecté.',
          sub: (context.artisanName || null),
          adminNote: 'Enterprise mission claim enregistré.'
        };

      case 'in_progress':
        return {
          icon: '🔨',
          tone: 'positive',
          text: site + cat + ' — Intervention en cours.',
          sub: null,
          adminNote: 'Enterprise mission in_progress.'
        };

      /* completed: artisan done, awaiting client confirmation */
      case 'completed':
        return {
          icon: '🏁',
          tone: 'waiting',
          text: site + cat + ' — Travaux terminés.',
          sub: 'Confirmation attendue.',
          adminNote: 'Enterprise SR completed — awaiting validation.'
        };

      /* validated: client confirmed */
      case 'validated':
        return {
          icon: '⭐',
          tone: 'positive',
          text: site + cat + ' — Intervention confirmée.',
          sub: null,
          adminNote: 'Enterprise SR validated.'
        };

      case 'cancelled':
        return {
          icon: '❌',
          tone: 'neutral',
          text: site + cat + ' — Demande annulée.',
          sub: null,
          adminNote: 'Enterprise SR cancelled.'
        };

      case 'no_match':
        return {
          icon: '⚠️',
          tone: 'alert',
          text: site + cat + ' — Aucun artisan disponible pour le moment dans cette zone.',
          sub: 'Vous pouvez soumettre une nouvelle demande ultérieurement.',
          adminNote: 'Enterprise no_match: ' + (context.city || '?') + ' / ' + (context.category || '?') + '.'
        };

      default:
        return {
          icon: '⏳',
          tone: 'info',
          text: site + cat + ' — En cours de traitement.',
          sub: null,
          adminNote: 'Statut SR inconnu: ' + srStatus
        };
    }
  }

  /* ════════════════════════════════════════════════════════════
   * TONE → CSS CLASS MAPPING
   * ════════════════════════════════════════════════════════════ */

  var TONE_CLASSES = {
    positive: 'rafi-tone-positive',
    waiting:  'rafi-tone-waiting',
    alert:    'rafi-tone-alert',
    info:     'rafi-tone-info',
    neutral:  'rafi-tone-neutral'
  };

  function toneClass(tone) {
    return TONE_CLASSES[tone] || 'rafi-tone-info';
  }

  /* ════════════════════════════════════════════════════════════
   * SELF-TEST
   * Verifies:
   *   1. All canonical statuses return non-empty text + tone + icon
   *   2. Unknown status returns safe fallback
   *   3. terminée ≠ validée (text must differ)
   *   4. done sub references client confirmation (not payment)
   *   5. terminée does NOT mention payment
   *   6. validée does NOT mention payment completion
   *   7. Context enrichment works (deliveredCount, city, artisanName)
   * ════════════════════════════════════════════════════════════ */

  var SR_STATUSES  = ['new', 'assigned', 'in_progress', 'completed', 'validated', 'cancelled', 'no_match'];
  var MIS_STATUSES = ['offered', 'pending', 'in_progress', 'done', 'declined', 'terminée', 'validée'];

  function selfTest() {
    var pass = 0, fail = 0;

    function check(label, ok) {
      if (ok) { pass++; }
      else { fail++; console.warn('FAIL:', label); }
    }

    console.group('[RafiNarrator] Self-test v1b');

    // 1. All SR statuses produce valid msg
    SR_STATUSES.forEach(function (s) {
      var msg = narrateRequest(s, { city: 'Casablanca', category: 'plomberie' });
      check('narrateRequest(' + s + ') structure',
        msg && msg.text && msg.text.length > 0 && msg.tone && msg.icon);
    });

    // 2. All mission statuses produce valid msg
    MIS_STATUSES.forEach(function (s) {
      var msg = narrateMission(s, { category: 'plomberie', city: 'Rabat' });
      check('narrateMission(' + s + ') structure',
        msg && msg.text && msg.text.length > 0 && msg.tone && msg.icon);
    });

    // 3. Enterprise narration — all SR statuses
    SR_STATUSES.forEach(function (s) {
      var msg = narrateEnterpriseRequest(s, { siteName: 'Siège', category: 'électricité' });
      check('narrateEnterpriseRequest(' + s + ') structure',
        msg && msg.text && msg.text.length > 0 && msg.tone && msg.icon);
    });

    // 4. Unknown status returns safe fallback — must not throw
    try {
      var u1 = narrateRequest('__unknown__');
      var u2 = narrateMission('__unknown__');
      var u3 = narrateEnterpriseRequest('__unknown__');
      check('narrateRequest unknown fallback', u1 && u1.text.length > 0);
      check('narrateMission unknown fallback', u2 && u2.text.length > 0);
      check('narrateEnterpriseRequest unknown fallback', u3 && u3.text.length > 0);
    } catch (e) {
      fail += 3;
      console.error('FAIL: unknown status threw', e);
    }

    // 5. STATE FIDELITY: terminée ≠ validée text
    var termMsg  = narrateMission('terminée');
    var validMsg = narrateMission('validée');
    check('terminée text ≠ validée text', termMsg.text !== validMsg.text);

    // 6. STATE FIDELITY: terminée does NOT contain payment promise
    var paymentWords = ['paiement', 'payé', 'réglé', 'traité', 'viré'];
    var termText = (termMsg.text + ' ' + (termMsg.sub || '')).toLowerCase();
    check('terminée: no payment promise in text/sub',
      !paymentWords.some(function (w) { return termText.indexOf(w) !== -1; }));

    // 7. STATE FIDELITY: validée does NOT claim payment was made
    var validText = (validMsg.text + ' ' + (validMsg.sub || '')).toLowerCase();
    check('validée: no payment-done claim in text/sub',
      !paymentWords.some(function (w) { return validText.indexOf(w) !== -1; }));

    // 8. STATE FIDELITY: done references client confirmation, not payment
    var doneMsg  = narrateMission('done');
    var doneText = (doneMsg.text + ' ' + (doneMsg.sub || '')).toLowerCase();
    check('done: references client/confirmation',
      doneText.indexOf('client') !== -1 || doneText.indexOf('confirm') !== -1);

    // 9. Context enrichment: deliveredCount in 'new' text
    var enriched = narrateRequest('new', { deliveredCount: 4 });
    check('new + deliveredCount: count appears in text', enriched.text.indexOf('4') !== -1);

    // 10. Context enrichment: city in no_match text
    var nm = narrateRequest('no_match', { city: 'Tanger' });
    check('no_match: city in text', nm.text.indexOf('Tanger') !== -1);

    // 11. toneClass returns non-empty for all tones
    Object.keys(TONE_CLASSES).forEach(function (tone) {
      check('toneClass(' + tone + ')', toneClass(tone).length > 0);
    });

    // 12. adminNote present on all statuses (aids ops debugging)
    SR_STATUSES.forEach(function (s) {
      var msg = narrateRequest(s);
      check('narrateRequest(' + s + ') has adminNote', typeof msg.adminNote === 'string' && msg.adminNote.length > 0);
    });
    MIS_STATUSES.forEach(function (s) {
      var msg = narrateMission(s);
      check('narrateMission(' + s + ') has adminNote', typeof msg.adminNote === 'string' && msg.adminNote.length > 0);
    });

    console.log('Results: ' + pass + '/' + (pass + fail) + ' PASS' +
                (fail ? ' (' + fail + ' FAIL)' : ''));
    console.groupEnd();
    return { pass: pass, fail: fail, total: pass + fail };
  }

  /* ════════════════════════════════════════════════════════════
   * PUBLIC API
   * ════════════════════════════════════════════════════════════ */

  window.RafiNarrator = {
    narrateRequest:           narrateRequest,
    narrateMission:           narrateMission,
    narrateEnterpriseRequest: narrateEnterpriseRequest,
    toneClass:                toneClass,
    SR_STATUSES:              SR_STATUSES,
    MIS_STATUSES:             MIS_STATUSES,
    selfTest:                 selfTest
  };

})(window);
