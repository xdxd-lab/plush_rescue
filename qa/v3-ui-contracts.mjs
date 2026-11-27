import assert from 'node:assert/strict';

export const v3Sizes=['1280x720','390x844','360x640'];
export const v3ShotNames=v3Sizes.flatMap(size=>['unmuted','muted'].map(state=>`v3-${size}-${state}.png`));
export function validateV3Options({enabled,shots,views,noPickup,dialogs,selfTest}){
 if(!enabled)return;
 assert.ok(shots,'--v3-audio requires --shots');
 assert.deepEqual(views,v3Sizes,'--v3-audio requires the exact ordered three-size set');
 assert.equal(noPickup,true,'--v3-audio requires --no-pickup');
 assert.equal(dialogs,false,'--v3-audio is separate from --dialogs');
 assert.ok(!selfTest,'--v3-audio cannot run a lifecycle self-test');
}
export function assertV3State(state,muted){
 assert.equal(state.status,'paused');
 assert.equal(state.muted,muted);
 assert.equal(state.volume,0,'silent UI fixture preserves volume zero');
 assert.equal(state.pressed,String(muted));
 assert.equal(state.text,muted?'已靜音':'未靜音');
 assert.equal(state.visible,true,'mute control is visible and unobscured');
}
