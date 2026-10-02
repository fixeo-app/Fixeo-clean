export type RafiInput={mode:'text'|'voice'|'photo';text?:string;mediaUri?:string};
export type RafiNeed={serviceCategory:string;description:string;confidence:'low'|'medium'|'high';needsConfirmation:boolean};
const SERVICE_RULES:[RegExp,string][]=[[/fuite|robinet|lavabo|eau|plomb/i,'Plomberie'],[/clé|clef|porte|serrure/i,'Serrurerie'],[/clim|climatiseur|air condition/i,'Climatisation'],[/prise|courant|électri|disjonct/i,'Électricité']];
export function understandLocally(input:RafiInput):RafiNeed{const text=(input.text||'').trim();const hit=SERVICE_RULES.find(([r])=>r.test(text));return{serviceCategory:hit?.[1]||'Autre',description:text,confidence:hit?'high':'low',needsConfirmation:!hit||text.length<8};}
// M2 contract: richer AI analysis must go through a FIXEO server endpoint. Never ship provider secrets in mobile.
