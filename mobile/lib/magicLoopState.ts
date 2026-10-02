export type MagicLoopState='idle'|'understanding'|'confirm'|'creating'|'matching'|'found'|'error';
export type MagicLoopModel={state:MagicLoopState;requestId?:string;missionId?:string;message?:string};
export function transition(current:MagicLoopModel,next:MagicLoopState,patch:Partial<MagicLoopModel>={}):MagicLoopModel{return{...current,...patch,state:next};}
