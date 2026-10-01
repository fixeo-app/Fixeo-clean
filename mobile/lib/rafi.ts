export type RafiInput={mode:'text'|'voice'|'photo';text?:string;mediaUri?:string};
export type RafiNeed={serviceCategory:string;description:string;confidence:'low'|'medium'|'high';needsConfirmation:boolean};

const SERVICE_RULES:[RegExp,string][]=[
  [/fuite|robinet|lavabo|eau|plomb|tuyau|lma|ma\b|ماء|تسرب|حنفية/i,'Plomberie'],
  [/clé|clef|porte|serrure|mfta[h7]|bab|باب|مفتاح|قفل/i,'Serrurerie'],
  [/clim|climatiseur|air condition|takyif|mouka?yif|مكيف|تكييف/i,'Climatisation'],
  [/prise|courant|électri|disjonct|kahraba|do\b|briz|كهرباء|بريز|ضو/i,'Électricité']
];

export function understandLocally(input:RafiInput):RafiNeed{
  const text=(input.text||'').trim();
  const hit=SERVICE_RULES.find(([r])=>r.test(text));
  return{
    serviceCategory:hit?.[1]||'Autre',
    description:text,
    confidence:hit?'high':'low',
    needsConfirmation:!hit||text.length<8
  };
}
// M2 contract: richer AI analysis must go through a FIXEO server endpoint.
// Provider secrets are never shipped in the mobile bundle.
