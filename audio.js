// Synthesized sound effects: one short oscillator voice per call. The audio
// context is created on the first unlock(), which main.js calls from a user
// gesture (browsers keep audio suspended until then). Before that, at volume 0
// or when Web Audio is missing or blocked, play() does nothing; every failure is
// silent. Split out of main.js without behaviour changes.
// getContextClass(): the AudioContext constructor; volume(): the current 0–1 volume.
export function createAudio({getContextClass,volume}){
 let context;
 function play(kind){
  if(!context||volume()===0)return;
  try{
   // currentTime is read at each call, as before the split.
   const o=context.createOscillator(),g=context.createGain();
   o.type=kind==='hurt'?'triangle':'sine';
   o.frequency.setValueAtTime(kind==='rescue'?740:kind==='hurt'?120:420,context.currentTime);
   o.frequency.exponentialRampToValueAtTime(kind==='rescue'?1100:kind==='hurt'?65:180,context.currentTime+.08);
   g.gain.setValueAtTime(volume()*(kind==='shot'?.025:.12),context.currentTime);
   g.gain.exponentialRampToValueAtTime(.0001,context.currentTime+.1);
   o.connect(g);g.connect(context.destination);o.start();o.stop(context.currentTime+.11);
  }catch{}
 }
 function unlock(){try{context??=new(getContextClass())();context.resume();}catch{}}
 return {play,unlock,get unlocked(){return Boolean(context);}};
}
