// Weapon replace / two-handed / off-hand switching through the pickup flow.
// Run: node --test qa/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../core.js';

function seeded(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
function running(){const g=new Game({random:seeded(7),map:0});g.status='running';g.player.x=0;g.player.z=0;return g;}
function pick(g,weaponId){const d=g.addDrop({kind:'weapon',weaponId,x:0,z:0});assert.ok(d);assert.ok(g.tapPickup(d.id));assert.equal(g.status,'pickup');}

test('declining a main-hand pickup keeps the loadout but still levels the weapon',()=>{
 const g=running();pick(g,'shotgun');
 assert.equal(g.pendingPickup.slot,'main');
 assert.ok(g.resolvePickup(false));
 assert.equal(g.loadout.main,'pulse');assert.equal(g.weaponLevels.shotgun,1);assert.equal(g.status,'running');
});

test('replacing the main hand swaps only that slot and resets a burst in progress',()=>{
 const g=running();g.burstLeft=2;pick(g,'burst');g.resolvePickup(true);
 assert.equal(g.loadout.main,'burst');assert.equal(g.loadout.offhand,'moonfan');assert.equal(g.burstLeft,0);
});

test('replacing the off-hand switches to that weapon\'s own magic charge and keeps the other\'s',()=>{
 const g=running();g.magicByWeapon.moonfan.charge=5;
 pick(g,'frostwand');g.resolvePickup(true);
 assert.equal(g.loadout.offhand,'frostwand');assert.equal(g.magic,g.magicByWeapon.frostwand);
 assert.equal(g.magicByWeapon.moonfan.charge,5);
 g.chargeMagic(3);assert.equal(g.magicByWeapon.frostwand.charge,3);assert.equal(g.magicByWeapon.moonfan.charge,5);
 pick(g,'moonfan');g.resolvePickup(true);
 assert.equal(g.magic,g.magicByWeapon.moonfan);assert.equal(g.magic.charge,5);
});

test('a two-handed pickup activates it, keeps main and off-hand stored, and freezes existing magic charge',()=>{
 const g=running();g.magic.charge=5;pick(g,'cannon');
 assert.equal(g.pendingPickup.slot,'twohand');g.resolvePickup(true);
 assert.equal(g.twoHanded,'cannon');assert.equal(g.twoHandedWeapon,'cannon');
 assert.equal(g.loadout.main,'pulse');assert.equal(g.loadout.offhand,'moonfan');
 g.chargeMagic(4);assert.equal(g.magic.charge,5);
 assert.ok(g.stowTwoHanded());g.chargeMagic(4);assert.equal(g.magic.charge,9);
});

test('declining a two-handed pickup does not equip it',()=>{
 const g=running();pick(g,'cannon');g.resolvePickup(false);
 assert.equal(g.twoHanded,null);assert.equal(g.twoHandedWeapon,null);assert.equal(g.weaponLevels.cannon,1);
});

test('toggle and stow move between stored and active two-handed without losing the weapon',()=>{
 const g=running();assert.equal(g.toggleTwoHanded(),false);assert.equal(g.stowTwoHanded(),false);
 pick(g,'cannon');g.resolvePickup(true);
 assert.ok(g.stowTwoHanded());assert.equal(g.twoHanded,null);assert.equal(g.twoHandedWeapon,'cannon');
 assert.ok(g.toggleTwoHanded());assert.equal(g.twoHanded,'cannon');
 assert.ok(g.toggleTwoHanded());assert.equal(g.twoHanded,null);
 g.chargeMagic(4);assert.equal(g.magic.charge,4);
});

test('equipping a main or off-hand weapon while two-handed is active drops back to normal loadout',()=>{
 const g=running();pick(g,'cannon');g.resolvePickup(true);
 pick(g,'ember');g.resolvePickup(true);
 assert.equal(g.twoHanded,null);assert.equal(g.twoHandedWeapon,'cannon');assert.equal(g.loadout.main,'ember');
 assert.ok(g.toggleTwoHanded());assert.equal(g.twoHanded,'cannon');
 pick(g,'frostwand');g.resolvePickup(true);
 assert.equal(g.twoHanded,null);assert.equal(g.loadout.offhand,'frostwand');
});

test('repeat pickup of the same two-handed weapon levels it up, and stow/toggle are refused while ended',()=>{
 const g=running();pick(g,'cannon');g.resolvePickup(true);
 g.weaponLevels.cannon=3;pick(g,'cannon');g.resolvePickup(true);
 assert.equal(g.weaponLevels.cannon,4);assert.equal(g.twoHanded,'cannon');
 g.end('fallen');assert.equal(g.stowTwoHanded(),false);assert.equal(g.toggleTwoHanded(),false);
});

test('pickups serialize: two weapons in reach open one comparison at a time',()=>{
 const g=running();
 const a=g.addDrop({kind:'weapon',weaponId:'shotgun',x:0,z:0}),b=g.addDrop({kind:'weapon',weaponId:'frostwand',x:0,z:0});
 g.collectDrops();assert.equal(g.status,'pickup');assert.equal(g.pendingPickup.id,a.id);
 g.resolvePickup(true);assert.equal(g.status,'pickup');assert.equal(g.pendingPickup.id,b.id);
 g.resolvePickup(true);assert.equal(g.status,'running');
 assert.equal(g.loadout.main,'shotgun');assert.equal(g.loadout.offhand,'frostwand');
});

test('resolvePickup is refused outside a pickup and cannot be applied twice',()=>{
 const g=running();assert.equal(g.resolvePickup(true),false);
 pick(g,'shotgun');assert.ok(g.resolvePickup(true));assert.equal(g.resolvePickup(true),false);
});

test('in a real step loop, an active two-handed weapon fires and the off-hand does not cast',()=>{
 const g=running();pick(g,'cannon');g.resolvePickup(true);
 g.enemies.push({id:999,x:0,z:-5,hp:1e6,type:0,speed:0,angle:0});
 let casts=0,shots=0;
 for(let i=0;i<120;i++){g.invuln=1;g.step(.05,{x:0,z:0});for(const e of g.events){if(e.kind==='magic')casts++;}shots+=g.bullets.length?1:0;}
 assert.equal(casts,0);assert.ok(shots>0);
});
