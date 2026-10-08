/** Native playback only: certified IDLE frames and speed never depend on UI state. */
export function rafiMasterVariant(diameter: number) { return diameter <= 58 ? 'mini' : diameter < 92 ? 'medium' : 'hero'; }
export function createMasterPlayback(onError: () => void) {
 let alive=true, active=false, loaded=false;
 let target:{startAnimating():Promise<void>;stopAnimating():Promise<void>}|null=null;
 let serial=Promise.resolve();
 const sync=()=>{const image=target;if(!image)return;serial=serial.then(async()=>{
  if(alive && loaded && active && image===target)await image.startAnimating();else await image.stopAnimating();
 }).catch(()=>{if(alive)onError();});};
 return {
  attach(image:typeof target){target=image;loaded=false;sync();},
  loaded(){if(!alive)return;loaded=true;sync();},
  setActivity(visible:boolean,reduced:boolean){active=visible&&!reduced;sync();},
  dispose(){alive=false;active=false;sync();target=null;},
  settled:()=>serial,
 };
}
