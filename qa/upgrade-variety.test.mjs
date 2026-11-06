// Upgrade variety: eight upgrades, four dealt per level-up (1–4 keys and the
// dialog layout unchanged). upgradeVariety:false is V11: the first four, in
// order, with no extra random draws. Run: node --test qa/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,UPGRADES,BASE_UPGRADE_IDS,UPGRADE_CHOICES,UPGRADE_CAPS,upgradeCanGrow} from '../core.js';
import {recommendUpgrade,UPGRADE_ICONS} from '../ui.js';
import {signature} from './sim-signature.mjs';

function seeded(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
function quiet(options={}){
 const g=new Game({random:seeded(5),map:0,autoEquip:true,...options});g.start();
 g.drops.length=0;g.spawn=1e9;g.dropTimer=1e9;g.nextBossMinute=1e9;g.invuln=1e9;g.fire=1e9;g.magicFire=1e9;
 return g;
}
function levelUp(g){g.exp=g.nextExp;g.levelUp();assert.equal(g.status,'upgrade');return g.upgradeChoices;}

// All defaults (upgrade and enemy variety on) are pinned in core-equivalence.test.mjs;
// this set isolates the upgrade change with enemy variety off.
const UPGRADE_SIGNATURES={
 '1:false':'b318e0b5ea25d9252b532e0acce5279f018b90003f8313a543d9ed204b11897c',
 '1:true':'6b450cef2d0d6f9a1288b9425cdc3c55c86f7cd85a1561043a83708e1007758a',
 '2:false':'721b7e0a4f38fa9f33327326200f4b00fd2899e9fa85532dd61cfae9d58486ff',
 '2:true':'7c89c1583156f130fd1c684dc7f49ae777ca5f3a7a9f6b020f3e21f1596c0ca8',
 '3:false':'b926fb32b3b28063654b81a5f3d50afa658c84dadf2b39359c04284cede125a9',
 '3:true':'822f654401b7c1404f0ac1c65969a47a6009b0263a230c1290c84da319968c5d',
};
for(const [key,expected] of Object.entries(UPGRADE_SIGNATURES)){
 const [seed,auto]=key.split(':');
 test(`gameplay signature with upgrade variety only: seed ${seed}, auto-equip ${auto}`,()=>{
  assert.equal(signature(Game,Number(seed),{autoEquip:auto==='true',enemyVariety:false}),expected);
 });
}

test('eight upgrades, each with a name, description and page icon; the first four are the V11 set',()=>{
 assert.equal(UPGRADES.length,8);assert.deepEqual(UPGRADES.slice(0,4).map(u=>u.id),BASE_UPGRADE_IDS);
 for(const u of UPGRADES){assert.ok(u.name&&u.description,u.id);assert.ok(UPGRADE_ICONS[u.id],u.id);}
});

test('variety off: always the four V11 cards in order, no random draws, new ids rejected',()=>{
 let calls=0;const base=seeded(9),g=quiet({upgradeVariety:false,random:()=>{calls++;return base();}});
 for(let i=0;i<5;i++){const before=calls;assert.deepEqual(levelUp(g),BASE_UPGRADE_IDS);assert.equal(calls,before);
  g.upgrade('magnet');assert.equal(g.status,'upgrade','magnet is not offered');g.upgrade('power');assert.equal(g.status,'running');}
 assert.equal(g.applyUpgrade('crit'),false);assert.equal(g.critChance,0);
 assert.equal(g.addDrop({kind:'upgrade',upgradeId:'guard',x:0,z:0}),null,'no new-upgrade drops');
});

test('variety on: four distinct cards in table order, never an undealt one, from four draws',()=>{
 let calls=0;const base=seeded(11),g=quiet({random:()=>{calls++;return base();}});const seen=new Set(),order=UPGRADES.map(u=>u.id);
 for(let i=0;i<40;i++){
  const before=calls,cards=levelUp(g);assert.equal(calls-before,UPGRADE_CHOICES,'one partial shuffle');
  assert.equal(cards.length,4);assert.equal(new Set(cards).size,4);
  assert.deepEqual(cards,[...cards].sort((a,b)=>order.indexOf(a)-order.indexOf(b)));
  for(const id of cards)seen.add(id);
  const undealt=order.find(id=>!cards.includes(id));g.upgrade(undealt);assert.equal(g.status,'upgrade',`undealt ${undealt} ignored`);
  g.upgrade(cards[i%4]);assert.equal(g.status,'running');
 }
 assert.equal(seen.size,8,'every upgrade shows up');
});

test('maxed upgrades leave the deal; power always remains, so there are always four cards',()=>{
 const g=quiet();
 g.fireInterval=UPGRADE_CAPS.fireInterval;g.player.speed=UPGRADE_CAPS.speed;g.player.maxHp=g.player.hp=UPGRADE_CAPS.maxHp;
 g.pickupRange=UPGRADE_CAPS.pickupRange;g.critChance=UPGRADE_CAPS.critChance;
 // Only power, reach and guard can grow; the fourth card is the first maxed one in table order.
 for(let i=0;i<10;i++){assert.deepEqual(levelUp(g),['power','rate','reach','guard']);g.upgrade('power');assert.equal(g.status,'running');}
});

test('magnet widens proximity pickup, capped',()=>{
 const g=quiet(),d=g.addDrop({kind:'upgrade',upgradeId:'power',x:g.player.x+1.3,z:g.player.z});
 g.step(.05,{x:0,z:0});assert.ok(g.drops.includes(d),'1.3 away is outside the base .95');
 g.applyUpgrade('magnet');assert.ok(Math.abs(g.pickupRange-1.425)<1e-9);g.step(.05,{x:0,z:0});assert.ok(!g.drops.includes(d),'taken at 1.43');
 for(let i=0;i<5;i++)g.applyUpgrade('magnet');assert.equal(g.pickupRange,UPGRADE_CAPS.pickupRange);assert.equal(upgradeCanGrow(g,'magnet'),false);
});

test('crit is deterministic: the chance fills a meter per main shot, crits double damage, no random draws',()=>{
 let calls=0;const base=seeded(4),g=quiet({random:()=>{calls++;return base();}});
 g.applyUpgrade('crit');g.applyUpgrade('crit');assert.ok(Math.abs(g.critChance-.24)<1e-9);
 const before=calls,crits=[];for(let i=0;i<30;i++){g.bullets.length=0;g.fireMain();crits.push(Boolean(g.bullets[0].crit));}
 assert.equal(calls,before);assert.equal(crits.filter(Boolean).length,7,'24% of 30 shots, rounded down');assert.equal(crits.indexOf(true),4,'the fifth shot is the first crit');
 g.bullets.length=0;g.critMeter=.9;g.fireMain();const [b]=g.bullets;assert.ok(b.crit);
 g.bullets.length=0;g.critMeter=0;g.fireMain();assert.ok(!g.bullets[0].crit);assert.ok(Math.abs(b.damage-2*g.bullets[0].damage)<1e-9);
 for(let i=0;i<9;i++)g.applyUpgrade('crit');assert.equal(g.critChance,UPGRADE_CAPS.critChance);
});

test('no crit upgrade: bullets carry no crit flag and the same damage as V11',()=>{
 const g=quiet();g.fireMain();assert.ok(!('crit'in g.bullets[0]));assert.equal(g.crits,0);
});

test('reach widens the off-hand magic radius',()=>{
 const g=quiet();g.events.length=0;g.castMagic();const base=g.events.find(e=>e.kind==='magic').radius;
 g.applyUpgrade('reach');g.events.length=0;g.castMagic();assert.ok(Math.abs(g.events.find(e=>e.kind==='magic').radius-base*1.15)<1e-9);
 for(let i=0;i<9;i++)g.applyUpgrade('reach');assert.equal(g.magicReach,UPGRADE_CAPS.magicReach);
});

test('guard lengthens the invulnerability after a hit',()=>{
 const g=quiet();g.invuln=0;g.hurtPlayer(1);assert.equal(g.invuln,1.25);
 g.applyUpgrade('guard');g.invuln=0;g.hurtPlayer(1);assert.ok(Math.abs(g.invuln-1.6)<1e-9);
 for(let i=0;i<9;i++)g.applyUpgrade('guard');assert.equal(g.invulnTime,UPGRADE_CAPS.invulnTime);
});

test('recommendation only picks among dealt, growable cards and still prefers power',()=>{
 const g=quiet(),dealt=ids=>UPGRADES.filter(u=>ids.includes(u.id));
 assert.equal(recommendUpgrade(g,dealt(['power','magnet','crit','guard'])),'power');
 assert.equal(recommendUpgrade(g,dealt(['rate','magnet','crit','guard'])),'rate');
 g.player.hp=1;assert.equal(recommendUpgrade(g,dealt(['power','heart','crit','guard'])),'heart');
 g.player.hp=g.player.maxHp;g.pickupRange=UPGRADE_CAPS.pickupRange;assert.equal(recommendUpgrade(g,dealt(['magnet','crit'])),'crit');
});
