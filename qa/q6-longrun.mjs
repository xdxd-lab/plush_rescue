#!/usr/bin/env node
// Deterministic, core-only long-run harness. This is evidence about repeatable
// Game.step sessions, not browser play or game-balance acceptance.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { Game, LIMITS } from '../core.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.dirname(ROOT);
const DT = 0.05;
const MAX_SECONDS = LIMITS.duration;
// Floating addition can leave Game.time a fraction below 1200 after 24,000
// updates. One additional terminal call lets the core's own duration guard set
// status=ended/reason=survived; that call exits before movement or RNG draws.
const MAX_TICKS = Math.ceil(MAX_SECONDS / DT) + 1;
const HEROES = ['pudding', 'polar'];
const MAPS = ['courtyard', 'greenhouse', 'park'];
const UPGRADES = ['heart', 'speed', 'rate', 'power'];

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function gitText(...args) {
  try { return execFileSync('git', args, { cwd: PROJECT, encoding: 'utf8' }).trim(); }
  catch (error) { return `unavailable: ${error.message}`; }
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function parseArgs(argv) {
  const opts = { out: null, maxSeconds: MAX_SECONDS, caseLimit: Infinity, skipDiagnostics: false };
  for (const arg of argv) {
    if (arg.startsWith('--out=')) opts.out = path.resolve(arg.slice(6));
    else if (arg.startsWith('--max-seconds=')) opts.maxSeconds = Number(arg.slice(14));
    else if (arg.startsWith('--case-limit=')) opts.caseLimit = Number(arg.slice(13));
    else if (arg === '--skip-diagnostics') opts.skipDiagnostics = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isFinite(opts.maxSeconds) || opts.maxSeconds <= 0 || opts.maxSeconds > MAX_SECONDS)
    throw new Error(`--max-seconds must be between 0 and ${MAX_SECONDS}`);
  if (!(opts.caseLimit > 0)) throw new Error('--case-limit must be positive');
  return opts;
}

function seedFor(heroIndex, mapIndex) {
  // Six published seeds, one per hero/map pair. Do not advance the RNG here.
  return 261_112_000 + heroIndex * 10_000 + mapIndex * 101 + 7;
}

function upgradeChoice(game) {
  const available = game.upgradeChoices;
  return UPGRADES.find(id => available.includes(id)) ?? available[0];
}

function directionAt(seconds) {
  // Fixed 16-second cardinal legs create a repeatable patrol without consuming RNG.
  const leg = Math.floor(seconds / 16) % 4;
  return [{ x: 1, z: 0 }, { x: 0, z: -1 }, { x: -1, z: 0 }, { x: 0, z: 1 }][leg];
}

function movementFor(game) {
  // Pickup policy: pursue the nearest live drop only when it is within 9 world
  // units; otherwise continue the fixed patrol. Proximity collection stays in Game.
  let nearest = null, nearestD = Infinity;
  for (const d of game.drops) {
    if (!(d.life > 0)) continue;
    const distance = Math.hypot(d.x - game.player.x, d.z - game.player.z);
    if (distance < nearestD) { nearest = d; nearestD = distance; }
  }
  if (nearest && nearestD <= 9) {
    const dx = nearest.x - game.player.x, dz = nearest.z - game.player.z;
    const length = Math.hypot(dx, dz) || 1;
    return { x: dx / length, z: dz / length, targetDropId: nearest.id };
  }
  return { ...directionAt(game.time), targetDropId: null };
}

function runCase({ hero, heroIndex, mapIndex, diagnostic, seed, maxSeconds }) {
  const game = new Game({ random: seeded(seed), map: mapIndex, heroId: hero, autoEquip: false });
  game.start();
  const result = {
    id: `${diagnostic ? 'diagnostic' : 'natural'}-${hero}-${MAPS[mapIndex]}`,
    mode: diagnostic ? 'diagnostic-invulnerability' : 'natural-health',
    seed, hero, map: { index: mapIndex, id: MAPS[mapIndex] },
    mapGeometry: 'not constructed: core-only run; map index recorded, map.js collision geometry excluded',
    strategy: {
      dtSeconds: DT,
      movement: 'nearest live drop within 9 units, else 16-second cardinal patrol E/N/W/S; Game.move and proximity collection only',
      pickup: 'replace every serialized weapon pickup (resolvePickup(true)); proximity upgrades apply via core',
      upgrade: 'fixed priority heart, speed, rate, power; first available dealt choice',
      invulnerability: diagnostic ? 'set game.invuln=1 immediately before each step; excludes natural damage/survival claims' : 'none'
    },
    stepCalls: 0, stepsCompleted: 0, status: game.status, reason: game.reason,
    timeSeconds: 0, survivedSeconds: 0, level: game.level, exp: game.exp,
    hp: game.player.hp, maxHp: game.player.maxHp, saved: game.saved,
      upgrades: [], skillPickups: [], pickups: [], damageDealt: 0, damageTaken: 0,
    damageTakenEvents: 0, observedEnemyTypes: {}, observedEnemyRoles: {},
    observedBossKinds: {}, allyRescues: 0, allyCountPeak: 0,
    maxHostileEntitiesIncludingBosses: 0, maxDrops: 0, checkpoints: []
  };
  const rawDamageEnemy = game.damageEnemy.bind(game);
  game.damageEnemy = (enemy, amount) => {
    const before = Math.max(0, enemy.hp);
    const answer = rawDamageEnemy(enemy, amount);
    result.damageDealt += Math.min(before, Math.max(0, amount));
    return answer;
  };
  const rawHurtPlayer = game.hurtPlayer.bind(game);
  game.hurtPlayer = amount => {
    const before = game.player.hp;
    const answer = rawHurtPlayer(amount);
    if (answer) { result.damageTaken += before - game.player.hp; result.damageTakenEvents++; }
    return answer;
  };

  let nextCheckpoint = 60;
  const requestedTicks = Math.ceil(maxSeconds / DT) + (maxSeconds === MAX_SECONDS ? 1 : 0);
  let guard = 0;
  while (result.stepCalls < requestedTicks && game.status !== 'ended' && guard++ < requestedTicks + 5000) {
    if (game.status === 'upgrade') {
      const choice = upgradeChoice(game);
      result.upgrades.push({ atSeconds: +game.time.toFixed(2), level: game.level, offered: [...game.upgradeChoices], selected: choice });
      game.upgrade(choice);
      continue;
    }
    if (game.status === 'pickup') {
      const pending = game.pendingPickup;
      result.pickups.push({ atSeconds: +game.time.toFixed(2), weaponId: pending?.weaponId ?? null, slot: pending?.slot ?? null, decision: 'replace' });
      game.resolvePickup(true);
      continue;
    }
    if (game.status !== 'running') break;

    if (diagnostic) game.invuln = 1;
    const input = movementFor(game);
    const oldTime = game.time;
    game.step(DT, input);
    result.stepCalls++;
    result.stepsCompleted = result.stepCalls;
    for (const event of game.events)
      if (event.kind === 'skill') result.skillPickups.push({ atSeconds: +game.time.toFixed(2), upgradeId: event.upgradeId });
    for (const enemy of game.enemies) {
      result.observedEnemyTypes[enemy.type] = true;
      if (enemy.role) result.observedEnemyRoles[enemy.role] = true;
      if (enemy.boss) result.observedBossKinds[enemy.boss] = true;
    }
    result.allyRescues = game.allyRescues;
    result.allyCountPeak = Math.max(result.allyCountPeak, game.allies.length);
    result.maxHostileEntitiesIncludingBosses = Math.max(result.maxHostileEntitiesIncludingBosses, game.enemies.length);
    result.maxDrops = Math.max(result.maxDrops, game.drops.length);
    if (game.time >= nextCheckpoint || game.status === 'ended') {
      result.checkpoints.push({
        atSeconds: +game.time.toFixed(2), stepCalls: result.stepCalls, status: game.status,
        hp: game.player.hp, maxHp: game.player.maxHp, level: game.level, exp: game.exp,
        saved: game.saved, enemyCount: game.enemies.length, roleCountsSeen: { ...result.observedEnemyRoles },
        bossKindsSeen: { ...result.observedBossKinds }, allyRescues: game.allyRescues
      });
      while (nextCheckpoint <= game.time) nextCheckpoint += 60;
    }
    if (game.time <= oldTime && game.status !== 'ended') throw new Error(`Game time did not advance: ${result.id}`);
  }
  if (guard >= requestedTicks + 5000) throw new Error(`Modal resolution guard exceeded: ${result.id}`);
  result.status = game.status;
  result.reason = game.reason;
  result.rawGameTime = game.time;
  result.timeSeconds = +game.time.toFixed(3);
  result.survivedSeconds = result.timeSeconds;
  result.level = game.level;
  result.exp = game.exp;
  result.hp = game.player.hp;
  result.maxHp = game.player.maxHp;
  result.saved = game.saved;
  result.damageDealt = +result.damageDealt.toFixed(3);
  result.damageTaken = +result.damageTaken.toFixed(3);
  result.final = {
    loadout: { ...game.loadout }, twoHandedWeapon: game.twoHandedWeapon,
    weaponLevels: { ...game.weaponLevels }, enemyCount: game.enemies.length,
    roleCountsAlive: Object.fromEntries(['dasher', 'spitter'].map(role => [role, game.enemies.filter(e => e.role === role).length])),
    allyRescues: game.allyRescues, alliesAlive: game.allies.length,
    bossKindsAlive: Object.fromEntries(['big', 'mini'].map(kind => [kind, game.enemies.filter(e => e.boss === kind).length]))
  };
  result.targetDurationReached = game.time >= Math.min(MAX_SECONDS, maxSeconds) - 1e-8;
  result.fullDurationReached = game.time >= MAX_SECONDS - 1e-8 && game.reason === 'survived';
  result.naturalSurvivalClaim = !diagnostic && result.fullDurationReached;
  return result;
}

const opts = parseArgs(process.argv.slice(2));
const cases = [];
for (let h = 0; h < HEROES.length; h++) {
  for (let m = 0; m < MAPS.length; m++) {
    if (cases.filter(c => !c.mode.startsWith('diagnostic')).length >= opts.caseLimit) continue;
    const seed = seedFor(h, m);
    const natural = runCase({ hero: HEROES[h], heroIndex: h, mapIndex: m, diagnostic: false, seed, maxSeconds: opts.maxSeconds });
    cases.push(natural);
    console.log(JSON.stringify({ id: natural.id, timeSeconds: natural.timeSeconds, status: natural.status, steps: natural.stepsCompleted, level: natural.level }));
    if (!opts.skipDiagnostics && opts.maxSeconds === MAX_SECONDS && !natural.fullDurationReached) {
      const diagnostic = runCase({ hero: HEROES[h], heroIndex: h, mapIndex: m, diagnostic: true, seed, maxSeconds: MAX_SECONDS });
      cases.push(diagnostic);
      console.log(JSON.stringify({ id: diagnostic.id, timeSeconds: diagnostic.timeSeconds, status: diagnostic.status, steps: diagnostic.stepsCompleted, level: diagnostic.level }));
    }
  }
}
const output = {
  schemaVersion: 1, generatedAt: new Date().toISOString(),
  source: {
    branch: gitText('branch', '--show-current'), head: gitText('rev-parse', 'HEAD'),
    workingTreeStatus: gitText('status', '--short'),
    sha256: Object.fromEntries(['core.js', 'weapons.js', 'qa/q6-longrun.mjs'].map(file => [file, sha256File(path.join(PROJECT, file))]))
  },
  harness: 'qa/q6-longrun.mjs', runtime: { node: process.version, platform: process.platform, arch: process.arch },
  dtSeconds: DT, requestedMaxSeconds: opts.maxSeconds,
  nominalStepsPerCase: Math.ceil(opts.maxSeconds / DT),
  maxStepsPerCase: Math.ceil(opts.maxSeconds / DT) + (opts.maxSeconds === MAX_SECONDS ? 1 : 0),
  extraTerminationStepAllowed: opts.maxSeconds === MAX_SECONDS,
  mapGeometry: 'core-only; map.js THREE geometry/collision circles are intentionally excluded',
  cases
};
if (opts.out) {
  fs.mkdirSync(path.dirname(opts.out), { recursive: true });
  fs.writeFileSync(opts.out, JSON.stringify(output, null, 2) + '\n');
  console.log(`wrote ${opts.out}`);
} else console.log(JSON.stringify(output, null, 2));
