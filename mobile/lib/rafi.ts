export type RafiInput={mode:'text'|'voice'|'photo';text?:string;mediaUri?:string};
export type RafiNeed={serviceCategory:string;description:string;confidence:'low'|'medium'|'high';needsConfirmation:boolean};
const SERVICE_RULES:[RegExp,string][]=[[/\b(fuite\w*|robinet\w*|lavabo\w*|eau|plomb\w*|chasse d['’ ]?eau|wc|toilettes?)\b/i,'Plomberie'],[/\b(cle[fs]?|porte[s]?|serrur\w*)\b/i,'Serrurerie'],[/\b(clim\w*|air condition\w*)\b/i,'Climatisation'],[/\b(prise[s]?|courant|electri\w*|disjonct\w*)\b/i,'Électricité']];
export function understandLocally(input:RafiInput):RafiNeed{const text=(input.text||'').trim();const normalized=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'');const hit=SERVICE_RULES.find(([r])=>r.test(normalized));return{serviceCategory:hit?.[1]||'Autre',description:text,confidence:hit?'high':'low',needsConfirmation:!hit||text.length<8};}
// M2 contract: richer AI analysis must go through a FIXEO server endpoint. Never ship provider secrets in mobile.
