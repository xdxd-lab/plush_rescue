# V12.6.1 驗證範圍與已知限制

2026-11-12；遊戲發布提交 `548230583f4aaa029f65bf0edd80b704a9cb1053`，revision `v12.6.1-webgl-recovery-r1`，基礎來源 `1572971`。此文件記錄獨立驗證後的結果；建置當下快照另見 build-info.json。後續僅補文件及證據，不改該發布提交的 42 個 runtime bytes。

## 本輪改動與相依

V4 增加首次 WebGL 建構失敗的重試與指引；E6 建立桌面固定場景量測及暫定預算；D3 記錄保留當前及全部歷史，未刪除或改寫；D4 完成這一輪文義核對但持續追蹤；Q3 補做跨瀏覽器驗證並保留未完成事項。沒有為這批工作追加必須同批進行的其他待辦，沒有修改 Core、七個鎖定模組、玩法或既有直式視角。

## 離線與真正瀏覽器結果

| 方法 | 實得結果 | 範圍 |
|---|---|---|
| Node 24.22.1 | 237/237 | 規則、鎖定、決定性與輔助模組測試 |
| DOM/API stub | 89 項 | 真 main/Game 的介面及控制流程，不等同 WebGL |
| export | 42 hashes／84 references／29 modules | manifest、非根路徑引用及語法；diff check 通過 |
| V4 故障注入 | 兩次建構失敗後，第三次重載恢復真正 WebGL | 可信 click／Enter、四尺寸、設定與紀錄保存、無遊戲 RAF 或處理器疊加 |
| Chrome 157 完整 `--dialogs` | 68 項通過、0 failed／notRun、fatal null，28 個 dialog 情境 | Node 20.18 + experimental-websocket 作 CDP client；隔離 headless Chrome／SwiftShader，非硬體效能證據 |
| Firefox 160／geckodriver 0.37.1 | 唯一一次最後確認中，1280×720、360×640、390×844 原矩陣皆通過 | WebGL2、預熱、兩角色、開始／暫停／設定保存、移動、主副手與雙手、hover、升級、強制結算、三次重啟 |

Firefox 三組逐一核對同源 iframe 的 inner／canvas／rect 尺寸及 DPR1，每組 77 個可信事件是**事件數**，不是 77 個測項；各尺寸另有 synthetic 負對照。桌面窄 iframe 不等同實體手機或多指手感。測試使用受控掉落物、升級與結算情境，不是自然完成整局。

V4 以測試專用的 getContext 攔截讓實際 Three.js 建構失敗，沒有新增公開測試 URL 參數。失敗後無 QA global／遊戲 RAF，Three 自身 context listener 的增減平衡；不宣稱從未註冊任何瀏覽器事件。兩次可信操作重載後移除注入，第三次成功建立 WebGL，原設定及紀錄不變。沒有自動重載循環；品牌圖在非根路徑成功載入。

測試 owned session、driver、Chrome／Firefox 精確 PID、loopback ports 及 profile 已依各 run 清理。最後 Firefox 確認的精確 runner／driver／browser PID 均已不存在，兩 port 拒絕連線且可重綁；不操作使用者既有分頁。

## Q3 仍未完成：原始 Firefox 逾時與 Safari

首次未埋點 Firefox 執行中，1280 完整通過；360 的 shotgun 主手替換已通過，但 frostwand 懸停後等待 pickup 逾時，390 尚未執行。[原失敗畫面](../qa/evidence/v12.6.1/firefox-360-hover-timeout.png)仍保留。該次缺少實際 hover 事件與命中快照，**根因仍未知**，不能推定為產品 bug、沙盒或 GPU 問題。

後續診斷工具曾因回傳漏 z 而在更早階段失敗，另有 stage 綁定問題在執行前審查中修正；這些是工具問題，未列作產品通過。修後有埋點矩陣三尺寸通過，360 記到可信 mousemove 後同一 frostwand 進入副手拾取狀態；新增快照會改變時序，不能替代原矩陣。之後只預先核准一次未埋點原條件確認，三尺寸全通過。

**最後一次通過沒有消除原失敗，也不是已修復或穩定性的證明。**Q3 保持開啟，持續追蹤 Firefox 360 hover 間歇逾時；若再次發生，應保留當次實際輸入、投影、hover、遮擋與畫面，不反覆重試到通過。

Safari 27.2／SafariDriver 本輪 GET status 可用，但 POST session 明確要求在 Safari Settings 的 Developer 開啟 Allow remote automation，沒有建立遊戲 session、沒有更改設定或接管分頁。Safari 遊戲驗收仍未完成；手機 Q4、真人長局 Q6 與更廣前景／跨硬體效能校準亦未完成。

完整 Chrome 初次 sandbox 執行未取得 DevTools，測項尚未開始；之後獲允許的執行通過，具體限制未確認，不宣稱已找到啟動失敗根因。初輪 V4 工具報表錯誤留有 error，但當次 PNG／cleanup 曾被後續執行覆蓋，無法還原；本文件採用後來獨立 run-id 的最終故障注入結果，不把遺失證據補作通過。

## 效能、保留與公開證據

[E6 桌面基準](render-baseline-2026-11-12.md)包含 Apple M4 Max／ANGLE Metal 六輪、1,080 個原始樣本及六張原圖；暫定預算由同批數據初定，非 CI gate、獨立後批校準或效能收益。[D3／D4 保留紀錄](retention-review-2026-11-12.md)區分保存、部署與來源歷史；目前保留全部，不自行刪除。

機器可讀的[驗證摘要](../qa/evidence/v12.6.1/summary.json)保留各 run 的範圍與原失敗；原始完整 logs 留在本機。公開檔只含遊戲證據，不包含私人 session ID、備份位置或憑證。

- V4 錯誤畫面：[320](../qa/evidence/v12.6.1/v4-recovery-320x568.png)、[360](../qa/evidence/v12.6.1/v4-recovery-360x640.png)、[390](../qa/evidence/v12.6.1/v4-recovery-390x844.png)、[矮橫窗](../qa/evidence/v12.6.1/v4-recovery-568x320.png)。
- Chrome：[桌面](../qa/evidence/v12.6.1/chrome-desktop-game.png)、[直式](../qa/evidence/v12.6.1/chrome-portrait-game.png)。
- Firefox 最後確認：[1280](../qa/evidence/v12.6.1/firefox-1280x720.png)、[360](../qa/evidence/v12.6.1/firefox-360x640.png)、[390](../qa/evidence/v12.6.1/firefox-390x844.png)。
