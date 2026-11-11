# v12.6.0 驗證範圍

2026-11-12（臺灣時間）。本輪為 R4 可攜圖集重建，以及 V2 的主武器命中閃光試點；其餘 17 格尚未接入視覺。未調整玩法、原有直式視角、trail／puff 容量或七個鎖定模組。

## R4 獨立重建

18 張來源 PNG 是經核對的 256px 縮製候選，不是上游原始解析度。來源與三份包內授權均和 S1 清單及保留副本相符。

獨立測試把工具、來源與參考資料放到另一個可攜目錄，以 Python 3.12.14／Pillow 13.0.0 執行一般模式、`python -O`，並分別使用明確及預設來源。四張輸出 PNG 都與原圖 bytes 完全一致（506,138 bytes），整幅 2048×1024 RGBA、透明像素 RGB、padding、18 格位置與 UV 也一致。另有 14 項拒絕案例，涵蓋覆寫、來源／授權／尺寸／UV／參考圖和 alpha=0 的 RGB 差異；均非零退出且不印 PASS。來源、授權與參考檔前後未變。

- PNG SHA-256：`ca39797b59dd36bb3f7fac4a49d44ce119849ed129f9bb8a3734c034e9addf07`
- RGBA SHA-256：`4635b79793e0c6c5823755dc437a93a5489422f30f32d62fa6861666159d5abc`
- 工具與來源：[tools/atlas](../tools/atlas/README.md)。生成 metadata 的選材 SHA 記錄該次輸入快照，不隨後續稽核文字回填。

## V2 桌面定向驗證

Chrome headless／SwiftShader 真實 WebGL，使用受控命中 fixture。四組場景涵蓋 360／390、明暗地圖、low／balanced／high 與減少動態；逐組核對實際 renderer ratio、flash mesh count、matrix、UV、2048×1024 貼圖與 star_09 非空 alpha。凍結同場景 RAF 後取得 before／after 原圖，命中 ROI 有 56–432 個像素變化；這是受控繪製，不是自然完整戰鬥。

[命中前](../qa/evidence/v12.6.0/hit-before.png) · [命中後](../qa/evidence/v12.6.0/hit-after.png)：390×844 high 暗圖的原始 CDP PNG，未修改像素。早期閃光已消失或被名牌遮住的圖片不列正式證據。

- 正常載入：實際 flash material 使用 atlas／star_09 UV，未見明顯方框或滲色，受控警示仍可見。
- 等待、阻擋及有效 1×1 圖片回應：保留原 CanvasTexture 與完整 UV，實際可繪。
- context lost／restored：圖集重載後能以 GPU 再畫出閃光；透過 QA 介面受控切換畫質／重設後，新預熱最終 ready、error 為 null；這項時序補證與完整矩陣的正常 UI 操作分開記錄。
- 單元測試證明 generation 拒絕舊 callback。瀏覽器的同 URL 請求會合併，本輪只證明 pending→current ready，不宣稱已驗到兩個獨立 HTTP 回呼的完成次序。
- 固定容量維持 trails 100／flashes 32／puffs 96。受控 draw-call 與 texture 計數未證明效能優勢；不推算手機 FPS、耗電或 GPU 記憶體收益。

## 檢查與限制

定向候選的 Node 228/228、DOM smoke 88/88、export 41 hashes／83 references／28 modules、diff-check 通過。Core、七鎖與既有 signature／golden 維持原內容。

最終候選已完成版本資訊核對。Chrome 完整 `--dialogs` 68/68、0 failed、0 notRun、fatal 為 null；Firefox 160 的 1280×720、360×640、390×844 完整核心矩陣均通過，實際 frame／canvas／WebGL2／預熱與輸入座標有核驗，三組升級實際作用、每組 77 trusted events 與合成事件負對照、24 張狀態截圖都有保留。測試程序與 profile 已清理。事件數不是測項數。Safari 仍等 Allow remote automation，實體手機 Q4 與真人長局 Q6 各自保留。本紀錄不是 Safari、手機、WCAG、效能提升或完整商用權利驗收。

## 執行環境診斷

沙盒內 Chrome 沒有開出 DevTools port，Firefox 也曾在建立 session 前退出；同一隔離流程在核准的外層環境完成。第一次外層 Chrome 被執行器的 420 秒整體上限中斷，之後以直接 Node session／輪詢完成整套，不縮減測項。這些紀錄與遊戲斷言結果分開。

## 發布紀錄

- 發布提交 [`c8bb435`](https://github.com/xdxd-lab/plush_rescue/commit/c8bb435ca1e711484618d90a548ddd26cc222c09)，基礎提交 `9a3431c`；[v12.6.0 Release](https://github.com/xdxd-lab/plush_rescue/releases/tag/v12.6.0)。
- [CI／Pages](https://github.com/xdxd-lab/plush_rescue/actions/runs/43085655313) 的 test、build-pages、deploy-pages 均成功；[GitHub Pages](https://xdxd-lab.github.io/plush_rescue/)。
- [Sites](https://plush-rescue-survivor.b892020xx.chatgpt.site) 保存版本 22、來源提交 `2af422f180631224873dc2ae10156fbcfb08c5f8`，正式部署回傳 succeeded。既有公開權限維持。
- Sites 套件獨立檢查通過：44 個一般檔案，包含 41 個 runtime、manifest、`.nojekyll` 與 hosting 設定。41 個 runtime 的大小與 SHA-256 均符合 manifest、Sites dist 與發布提交；不含 QA、重建工具或來源素材目錄。套件由官方流程從已推送的來源產生。
