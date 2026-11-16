# v12.6.2 暫停繪製驗證與交付範圍

本文件分列12.6.2受驗程式c001、原候選e990／mainbd錯誤metadata部署，以及正式修正code `3213067b88e5f8474eb71a9580cb00d45c48a22d`／main `5536465c9b8e0af6947fefcd45ab3fc9122ec19a`。GitHub annotated tag／Release與Pages已交付；Sites仍未更新。受驗基準9cf及各批來源保留，實得範圍與限制如下。

## 變更與適用範圍

穩定暫停時不再逐幀提交相同 WebGL 畫面；首次暫停、可見內容、設定、相機、尺寸／DPR、頁面可見性、材質就緒及 context 恢復時仍有重繪途徑。保留原 RAF、遊戲步進、DOM／CSS 更新與非暫停繪製；不加入全域閒置排程器、不改玩法、直式視角或音效產品。

## 固定來源的實得結果

| 方法 | 結果 | 證據邊界 |
|---|---|---|
| 完整 Node／DOM | c001 的 Node240/240、DOM90/90 | 離線契約，非實際 WebGL |
| 匯出 | c001 的43個manifest條目雜湊（42個runtime檔及build-info）、85引用；另有 JavaScript 語法檢查 | 正式 metadata 候選完整離線亦通過Node240、DOM90、43 hashes／85引用／30 JS模組語法 |
| 同機前後量測 | 兩版本各6輪、每輪3階段，共36張圖。基準暫停每5秒窗300–301次render，候選六窗全0；running/resumed約60次/秒 | Apple M4 Max、ANGLE Metal、Chrome157、1280×720／DPR1、balanced、固定低載／密集場景；Game.step凍結，只量presentation；先基準後候選，非交錯實驗 |
| 功能轉換 | 9項通過、10張圖：暫停重入、品質、resize、DPR單改、拾取dialog、atlas、context、快速resume及真hidden/visible | 原生事件與計數有紀錄；短暫hidden不是長時間背景驗證；狀態fixture用QA API明示設定 |
| 完整本機Chrome | c001 的68 passed／0 failed／0 notRun、console errors空，8張title/game原圖 | headless SwiftShader；保留全viewports、storage、dialog測項；QA2看圖，未見明顯黑屏或主要控制裁切 |
| 兩張運行補圖 | rapid-resume及show後明確resume兩項通過，兩張運行原圖已獨立驗收 | 前者time0.10→0.45／render2→23；後者可信hidden/visible約10.2ms，show保持paused，可信resume後time0.6667→0.9501／render39→54 |
| 資源清理 | 各批次自清與獨立指定PID／profile／port核對完成 | 指定資源的事後核查，不是全系統GPU空閒盤點；完整Chrome PGID由detached spawn推導，原log未直接記錄 |

圖片與事件證據分開核對：圖片只證拍攝當下畫面，不能證clock、render次數或功率。拾取dialog原圖來自功能批次，完整Chrome的8張圖本身沒有涵蓋每個dialog。兩張補圖解決了原功能圖都在回pause後拍攝的缺口，舊notRun不回填成當時已驗。

## 保留的失敗與限制

- 早先預設sandbox啟動Chrome SIGABRT、0輪；之後合法審核模式量測成功，不證明原失敗因果。
- 第一個兩圖批次在同步 Chrome --version 前置探測 ETIMEDOUT，0測項、0PNG；保留該失敗，沒有把它當產品退化。修正外置工具改讀bundle metadata、啟動後核實際CDP版本，再以新的單批資料完成兩圖。原逾時的內部原因仍未知，沒有延長sleep或放寬產品斷言。
- 完整Chrome執行後的CLI使用量錯誤及另一步查核KeyError不是原測試結果；持久原始JSON已先完成68/0/0。保留事件順序與獨立清理證據。
- 基準六輪結束至runner退出有約220秒未解釋尾段延遲，固定順序、短樣本與環境波動不支持一般效能因果或穩定性聲明。

零render不是零RAF、零CPU、GPU時間或耗電。未測瓦數／續航、實體手機、長局、所有設定與dialog組合、實體跨螢幕DPI、OS睡眠或任意真GPU故障；headless context extension僅是受控恢復。Firefox／Safari原Q3限制保持：Safari遠端自動化設定未確認，Firefox360歷史間歇hover原因未知。本版沒有接入V3音效原型。

## 正式交付結果（2026-11-16）

- [PR24](https://github.com/xdxd-lab/plush_rescue/pull/24)原code e990與mainbd已有CI／Pages部署，但publication仍含「本機候選未發布」，此為metadata缺口，不以事後文件將其改稱當時正確。
- [PR25](https://github.com/xdxd-lab/plush_rescue/pull/25)修正code `3213067b88e5f8474eb71a9580cb00d45c48a22d` 移除publication、中性化manifest.layout，version12.6.2／revision不變。source_commit為code直接父 `bd791180888d120eb1eadc59cc71d694c938fe6d`；main merge `5536465c9b8e0af6947fefcd45ab3fc9122ec19a` 的tree與code相同。
- 對c001受驗碼：原e990的40runtime byte-exact，main/index僅revision識別字串替換；code321再只改build-info與manifest，其他42runtime對e990 byte-exact。code321完整Node240／DOM90／export43 hashes、85引用、30 JS模組語法與metadata／父提交核對通過，沒有重跑12輪行為量測。
- code321 push CI43771648070與PR CI43771686002成功。PR實checkout為合成merge f54a301a，event head為321；不能混稱。
- [main CI43807290674](https://github.com/xdxd-lab/plush_rescue/actions/runs/43807290674)實checkout為main553，test、Chrome smoke、build、deploy-pages成功；實際actions/deploy-pages@v5成功，Pages deployment7816058094為success。CI每份正常矩陣17/0/0、console空，4負測timeout/CDP/assert/setup與cleanup有效，無forced cleanup；不是本機68項。QA2看同PR與main的desktop-title/game兩圖PASS；窄窗/dialog CI圖不在此artifact，視覺notRun，本機相關圖來源另列。
- [GitHub Pages](https://xdxd-lab.github.io/plush_rescue/)讀回全部43個manifest條目（42個runtime檔及build-info）與manifest本身，均HTTP200、bytes與main553／code321相同。manifest SHA256 `4f4c0991982e0f53edd2a9258becf682da554ae51177ac39dcf9966ec6cc6734`；build-info無publication，source_commit為bd，版本／revision正確。
- [annotated v12.6.2／Release](https://github.com/xdxd-lab/plush_rescue/releases/tag/v12.6.2)於2026-11-16 05:54:02Z發布，tag object `a85fee4053d972564ddadcd1330227b149fca98e` 解參照code321，非draft／prerelease。API targetCommitish文字main不覆蓋實際tag解參照；原生讀回與正文經獨立核驗。

validation_at_build與built_at保留原建置快照，不回寫後續CI／發布結果。以上交付是後續實得紀錄，不把候選當時的pending改寫成當時已知成功。doc-only文件更新不改43個manifest條目所列檔案或manifest本身，不新增版本，也不移動code tag。

## Sites與議題仍未完成的部分

Sites仍保留既有舊版，未因GitHub／Pages成功而更新。已從code321重新製作本機43個manifest條目所列檔案／manifest／必要hosting淨包並獨立位元／隱私核驗；後續原生source credential回覆project not found，現行owner／access資訊未能確認，因此source同步停在寫入前，沒有新source commit、保存版本或部署。錯誤不證明站點消失，不新建站或沿用舊憑證繞過。恢復正確owner存取後仍須helper來源／新包與部署各階段實證。

Issue4保持open：已交付的是桌面穩定暫停render提交減量；不是功率／手機／長局或全部跨平台效能完成。Q3的Safari設定及Firefox360歷史間歇問題、其他未驗限制維持；原FAIL、metadata錯誤部署與後續修正順序全部保留。
