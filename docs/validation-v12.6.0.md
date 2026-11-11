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
- context lost／restored：圖集重載後能以 GPU 再畫出閃光；重設與畫質切換後，新預熱最終 ready、error 為 null。
- 單元測試證明 generation 拒絕舊 callback。瀏覽器的同 URL 請求會合併，本輪只證明 pending→current ready，不宣稱已驗到兩個獨立 HTTP 回呼的完成次序。
- 固定容量維持 trails 100／flashes 32／puffs 96。受控 draw-call 與 texture 計數未證明效能優勢；不推算手機 FPS、耗電或 GPU 記憶體收益。

## 檢查與限制

定向候選的 Node 228/228、DOM smoke 88/88、export 41 hashes／83 references／28 modules、diff-check 通過。Core、七鎖與既有 signature／golden 維持原內容。

最終版本候選的完整 Chrome／Firefox 回歸執行前，另核對版本資訊；完成後回填。Safari 仍等 Allow remote automation，實體手機 Q4 與真人長局 Q6 各自保留。本紀錄不是 Safari、手機、WCAG、效能提升或完整商用權利驗收。
