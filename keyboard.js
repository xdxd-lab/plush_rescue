// Keyboard movement never steals native input/slider/button behavior.
const interactiveSelector='input,select,textarea,button,a[href],[contenteditable]:not([contenteditable="false"]),[role="button"],[role="slider"],[role="checkbox"]';
const movementKeys=new Set(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright']);
export function isInteractiveTarget(target){return Boolean(target?.closest?.(interactiveSelector));}
export function routeKeyDown(event,status,keys){
 if(event.isComposing||event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey){keys.clear();return null;}
 if(event.key==='Escape'){
  keys.clear();
  // Buttons retain focus after Space/click, but Escape remains a global close.
  // Inputs/selects keep Escape for native editing and popup cancellation.
  if(isInteractiveTarget(event.target)&&!event.target?.closest?.('button,[role="button"],a[href]'))return null;
 if(status==='running'||status==='paused'){event.preventDefault();return status==='running'?'pause':'resume';}return null;
 }
 if(isInteractiveTarget(event.target)){keys.clear();return null;}
 if(event.key==='F3'){event.preventDefault();return 'stats';}
 if(status!=='running'){keys.clear();return null;}
 const key=event.key.toLowerCase();
 if(movementKeys.has(key)){event.preventDefault();keys.add(key);}
 else if(event.key===' ')event.preventDefault();
 return null;
}
