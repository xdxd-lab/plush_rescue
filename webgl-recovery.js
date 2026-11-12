// Shown only when the first WebGL renderer cannot be created. A full reload is
// intentional: a failed renderer must not leave a second game loop behind.
export function showWebGLStartError({dialog,overlay,location}){
 dialog.dataset.state='webgl-error';
 dialog.innerHTML=`<div class="eyebrow"><img class="brand-mark" src="assets/brand/brand-mark.png" alt="" width="20" height="20">PLUSH RESCUE</div>
  <h1 id="dialogTitle">暫時無法開啟 3D 畫面</h1>
  <p class="lead">瀏覽器目前無法建立 WebGL 畫面。可以再試一次；若仍失敗，請確認瀏覽器支援 WebGL、開啟硬體加速，或更新瀏覽器後重新開啟。</p>
  <button type="button" id="retryWebGL" class="primary">再試一次</button>
  <small class="random-note">重新載入不會清除已儲存的設定與紀錄；問題仍可能需要調整瀏覽器才能解決。</small>`;
 overlay.classList.add('shown');
 overlay.setAttribute('aria-hidden','false');
 const retry=dialog.querySelector('#retryWebGL');
 retry.onclick=()=>location.reload();
 retry.focus({preventScroll:true});
}
