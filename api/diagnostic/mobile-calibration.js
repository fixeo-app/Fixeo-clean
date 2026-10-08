'use strict';
const calibrationInstructions = `Mobile photo calibration: OBSERVED means only directly visible physical details; DECLARED means only user_description/answers; HYPOTHESIS is a cautious possibility with positive supporting evidence; UNCERTAINTY must be explicit when the photo cannot establish condition or operation. Absence of information is never a technical defect. A wall socket with no cable/device plugged in is an ordinary visible state, not evidence of electrical risk, failure, danger or urgency. Do not add a generic "risque électrique potentiel" hypothesis merely because a socket is present. Never infer missing wiring from an unused socket. Distinguish an empty socket from a visibly broken cover, exposed conductor, burn mark, smoke or sparks. Do not claim that the installation is safe either. If no symptom is declared and no defect is visible, describe the object, say that operation and internal condition cannot be determined from this photo, and ask what the user wants checked. Do not invent repair needs or parts. Retain supported hazards and user-reported symptoms with their original provenance.`;
const fold = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
/** Narrow deterministic guard for the audited empty-socket case. Never downgrades a declared symptom or isolated hazard. */
function calibrateDescriptiveSynthesis(result, photos, input) {
 if (String(input.description || '').trim() || Object.keys(input.answers || {}).length) return result;
 if (!photos.length || photos.some(p => p.status !== 'informative' || p.safety_signals.length)) return result;
 const facts=photos.flatMap(p => p.observations.map(o => fold(o.text)));
 const unplugged=/sans\s+(?:aucun\s+)?(?:cable|appareil|fiche)|aucun.{0,25}branch|rien.{0,20}branch|non branche|prise.{0,15}vide/;
 const damage=/cass|endommag|deterior|fissur|brul|denud|expos|etincell|fumee|eau|arrache|manquant|decolle/;
 if (!facts.length || !facts.every(f => /prise/.test(f) && unplugged.test(f) && !damage.test(f))) return result;
 return {...result,trade:'autre',problem:'Aucun défaut identifiable uniquement à partir de cette image.',
  hypotheses:['Le fonctionnement de cette prise reste indéterminé à partir de la photo.'],
  urgency:'low',urgency_reason:'Aucun symptôme déclaré ni défaut établi par les informations disponibles.',
  checks:['La photo ne permet pas de conclure sur le câblage interne ou le fonctionnement. Précisez le problème rencontré.'],
  possible_parts:[],question_ids:['affected_area'],safety_signals:[]};
}
module.exports={calibrationInstructions,calibrateDescriptiveSynthesis};
