for(const [key,route,text]of [
 ['profile','/artisan-workspace/profile','Présentation professionnelle'],
 ['opportunities','/artisan-workspace/opportunities','Lire l’opportunité'],
 ['missions','/artisan-workspace/missions','Ouvrir cette mission'],
 ['mission','/mission/c6488b9d-5a94-44de-b128-ce8a1b3f3e5e','Votre travail est terminé.'],
 ['crm','/artisan-workspace/clients','Client W5 synthétique'],
 ['client','/artisan-workspace/client/b48cc47a-792d-4f38-be98-de87884ebf2f','Client W5 synthétique'],
 ['quotes','/artisan-workspace/quotes','DEVIS FIXEO'],
 ['quote-detail','/artisan-workspace/quote/b7efdd4f-82ae-4a7a-99ea-f37935efa519','DEV-2026-0001'],
 ['agenda','/artisan-workspace/agenda','Visite W5 de contrôle'],
 ['finance','/artisan-workspace/finance','200 MAD'],
 ['notifications','/artisan-workspace/notifications','Votre espace W5 est prêt'],
 ['rafi','/artisan-workspace/rafi','Votre mission plomberie']
]){
 await go('main',route);await pages.main.getByText(text,{exact:false}).first().waitFor({timeout:40000});
 if(key==='profile'){const value=await pages.main.getByRole('textbox',{name:'Présentation professionnelle',exact:true}).inputValue();assert.equal(value,'Atelier W5 — plomberie à Rabat.\nIntervention soignée, explications claires et prix confirmé avant travaux.');}
 await capture('main','final-'+key);report.passed.push('FINAL_REPLAY_'+key.toUpperCase());console.log('REPLAY_OK '+key);save();
}
await btn(pages.main,'Parler à RAFI').click();await btn(pages.main,'Arrêter l’enregistrement').waitFor();await capture('main','final-rafi-listening');await btn(pages.main,'Arrêter l’enregistrement').click();await pages.main.getByText('Transcription prête à relire.',{exact:true}).waitFor({timeout:30000});assert((await pages.main.getByRole('textbox',{name:'Votre note pour RAFI',exact:true}).inputValue()).length>10);await capture('main','final-rafi-voice');report.passed.push('FINAL_REAL_RAFI_VOICE');
await pages.main.getByLabel('Profil : ready',{exact:true}).waitFor({state:'attached',timeout:30000});await btn(pages.main,'Montrer une photo à RAFI').click();await pages.main.getByText('Lecture photo reçue.',{exact:true}).waitFor({timeout:30000});await capture('main','final-rafi-photo');report.passed.push('FINAL_REAL_RAFI_PHOTO');save();
