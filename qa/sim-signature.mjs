// Deterministic gameplay signature: runs a scripted 6-minute session on a Game
// class and hashes its state every second. Used to prove core.js gameplay did
// not change (the signature computed on V11's core.js is pinned in
// core-equivalence.test.mjs). Pass a different Game class to compare versions.
import crypto from 'node:crypto';
function seeded(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
export function signature(Game,seed,{autoEquip=false,bossAllies,upgradeVariety,enemyVariety,steps=7200}={}){
 // Options are only passed when given, so V11's Game (which has none of them) runs unchanged.
 const options={};for(const [k,v] of Object.entries({bossAllies,upgradeVariety,enemyVariety}))if(v!==undefined)options[k]=v;
 const g=new Game({random:seeded(seed),map:seed%3,autoEquip,...options});g.start();
 const hash=crypto.createHash('sha256');let replace=false;
 for(let i=0;i<steps;i++){
  g.invuln=1; // survive the whole script so late-game systems (bosses, drops) run
  const a=i*.013;g.step(.05,{x:Math.cos(a),z:Math.sin(a*1.3)});
  // Resolve every modal decision the same way each time.
  if(g.status==='ended')break;
  // Pick from the dealt cards; V11 (no upgradeChoices) and upgradeVariety:false deal these four in this order.
  if(g.status==='upgrade'){const cards=g.upgradeChoices??['power','rate','speed','heart'];g.upgrade(cards[g.level%cards.length]);}
  if(g.status==='pickup'){replace=!replace;g.resolvePickup(replace);}
  if(i%20===0)hash.update(JSON.stringify([i,g.status,g.time.toFixed(3),g.saved,g.level,g.exp,g.power,g.player.x.toFixed(4),g.player.z.toFixed(4),g.player.hp,g.player.maxHp,g.enemies.length,g.rescued.length,g.bullets.length,g.drops.map(d=>[d.id,d.kind,d.weaponId||d.upgradeId,d.x.toFixed(3),d.z.toFixed(3)]),g.loadout,g.twoHandedWeapon,g.weaponLevels,g.hazards.length,g.serial]));
 }
 return hash.digest('hex');
}
