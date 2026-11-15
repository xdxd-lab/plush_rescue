# v12.6.2 暫停繪製候選驗證

本文件分列12.6.2的受驗程式、原正式候選與metadata修正候選。受驗產品來源 `c001ce26bcd410272ce5dd9094593c997f30a926`，基準 `9cf2f5ef686d9bf035f1b9dd25e214246e5cbad0`。原code e9901b2經main merge bd79118已完成CI／Pages部署；其publication欄位缺口與新修正候選另見末節。新metadata候選的CI／部署及版本tag／Release尚未完成，不能把舊main部署或本機測試當成新候選已發布。各階段只同步識別資訊與manifest，受驗程式對應由blob映射核對。

## 變更與適用範圍

穩定暫停時不再逐幀提交相同 WebGL 畫面；首次暫停、可見內容、設定、相機、尺寸／DPR、頁面可見性、材質就緒及 context 恢復時仍有重繪途徑。保留原 RAF、遊戲步進、DOM／CSS 更新與非暫停繪製；不加入全域閒置排程器、不改玩法、直式視角或音效產品。

## 固定來源的實得結果

| 方法 | 結果 | 證據邊界 |
|---|---|---|
| 完整 Node／DOM | c001 的 Node240/240、DOM90/90 | 離線契約，非實際 WebGL |
| 匯出 | c001 的43執行檔雜湊、85引用；另有 JavaScript 語法檢查 | 正式 metadata 候選完整離線亦通過Node240、DOM90、43 hashes／85引用／30 JS模組語法 |
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

## 正式候選驗收仍需完成

新metadata提交須與c001受驗程式逐檔核對；main.js只允許revision識別字串替換，index只允許data-build替換，build-info／manifest為版本資料。新候選完整Node240／DOM90／export43-85-30已另存本機結果；這些不冒稱新SHA已有瀏覽器或正式CI通過。建置當時validation_at_build的pending是時間快照，不回寫作事後結果。同commit CI、QA2 CI原圖、具體推送／合併／版本與部署授權成立後，才可更新為正式交付紀錄。E7目前保持open，不因本文件建立而結案。

## metadata修正候選（尚未對外）

原code e9901b2、main merge bd79118與後續metadata code各自分列。main bd的CI／Pages成功只證該時點部署；原build-info.publication仍寫local-candidate-not-published，且此欄未被規範為建置快照，因此屬誤導狀態的metadata缺口。新提交移除無repo消費者的publication，manifest.layout改中性，版本12.6.2／revision不變，其他42runtime逐位元相同；source_commit為新提交直接父bd79118。新code SHA以本機固定候選紀錄識別，不能將e990或PR合成checkout當成新metadata已受驗。

validation_at_build與built_at保留原建置快照，不回寫當時未知的CI／發布結果。metadata修正不重跑12輪行為量測，但新候選須完整離線、正式CI／實際Pages及線上JSON新bytes核對；舊誤導欄位／原FAIL不抹除，tag／Release改綁新code並須另具體授權。此處不宣稱新metadata已發布。
