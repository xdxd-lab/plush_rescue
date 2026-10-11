// Catalog values are presentation + explicit balance; Game owns all mutable state.
export const WEAPONS=Object.freeze({
 cannon:Object.freeze({id:'cannon',slot:'twohand',name:'星隕魔能砲',icon:'◎',description:'雙手魔能重砲 · 範圍爆破 · 原主副手背負保留',color:'#abff6e',damage:12,cadence:5.5}),
 pulse:Object.freeze({id:'pulse',slot:'main',name:'星光脈衝槍',icon:'✦',description:'精準單發 · 穩定追蹤瞄準',color:'#63e3ff',damage:1,cadence:1}),
 shotgun:Object.freeze({id:'shotgun',slot:'main',name:'棉花散彈槍',icon:'⋔',description:'五向散射 · 近距離集中命中',color:'#ffca78',damage:1.3,cadence:2.5}),
 burst:Object.freeze({id:'burst',slot:'main',name:'三連星光弩',icon:'»',description:'每輪三連發 · 每發重新瞄準',color:'#92ffba',damage:1.2,cadence:1.7}),
 ember:Object.freeze({id:'ember',slot:'main',name:'暖焰噴射器',icon:'♨',description:'火焰彈 · 命中後持續燃燒 3 秒',color:'#ff8459',damage:1,cadence:1.2}),
 bomber:Object.freeze({id:'bomber',slot:'main',name:'鈕扣地雷器',icon:'◉',description:'沿前方放置地雷 · 1.2 秒後範圍爆炸',color:'#f6b44d',damage:5,cadence:3.2}),
 moonfan:Object.freeze({id:'moonfan',slot:'offhand',name:'月光扇符',icon:'☾',description:'大扇形魔法 · 救援 12 位後進化為月華風暴',color:'#b8a0ff'}),
 frostwand:Object.freeze({id:'frostwand',slot:'offhand',name:'霜晶魔杖',icon:'❄',description:'冰霜扇形 · 緩速敵人 · 蓄滿進化寒星冠',color:'#91eaff'})
});
export const MAIN_WEAPONS=Object.freeze(Object.values(WEAPONS).filter(w=>w.slot==='main').map(w=>w.id));
export const OFFHAND_WEAPONS=Object.freeze(Object.values(WEAPONS).filter(w=>w.slot==='offhand').map(w=>w.id));

// A newly found weapon unlocks at Lv.1. Each subsequent pickup raises only
// its own level, even when kept unequipped. Linear +25% baseline damage per
// level, no gameplay level cap. Count resets each bounded 20-minute run.
export function weaponMultiplier(level){return 1+.25*(Math.max(1,level)-1);}
