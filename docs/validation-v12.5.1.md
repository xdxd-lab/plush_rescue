# v12.5.1 驗證範圍

日期：2026-11-12（臺灣時間）。本版整理 Core 與四個主程式控制模組，維持玩法、直式視角、原有輸入與七個鎖定模組。以下區分實際測試與未覆蓋範圍；Safari、手機與真人完整一局未列通過。

| 類別 | 已完成的證據 |
|---|---|
| E5 決定性 | 從未排版 `274e5db` 隔離抽取重算；16 組各實際 7,200 步及 targeted 狀態吻合，舊 golden 保留；AST 結構一致 |
| E4 抽取 | `47b5995` 獨立 Node 224/224、DOM 88/88、export 40 hashes／82 references／28 modules、diff check；core／七鎖／舊 goldens 不變，四模組無靜態 cycle |
| 版本資訊 | v12.5.1 的 build-info、main QA revision、index data-build 與 manifest 一致；限定 invariants 7/7、DOM 88、export 通過 |
| Q5 基準 | 三地圖、多警示／人物／掉落物，360×640 DPR2 低／均衡／精緻、390×844 DPR3 低畫質；逐張驗實際 pixel ratio、buffer、陰影與無 modal，UI 切換／重載保存吻合 |
| Q5 候選對照 | 拆分後 360／390 低畫質共 16 場景，警示角點與名牌矩形投影差異皆為 0；數量、顯示政策與有效畫質一致，不宣稱像素完全相同 |
| Chrome 最終 | 完整 `--dialogs` 68 pass、0 fail、0 notRun，無 fatal／console 錯誤；28 個對話框情境、8 張截圖 |
| Firefox 最終 | 1280×720、360×640、390×844 完整核心矩陣通過；77 trusted events／組及 synthetic 負對照，24 張截圖 |
| Q5 動態 | 減少動態模式下，以正常 app RAF／game loop 短序列確認警示仍可繪製並隨時間前進；另有分離及靠近 HUD 場景 |

## 原始畫面範例

以下為最終候選的 Chrome headless／SwiftShader 原始 CDP PNG，CSS viewport 360×640、DPR2、低畫質 buffer 360×640、截圖 720×1280。這是注入測試狀態後的真實 WebGL 畫面，非自然一局或手機實機；未修改截圖像素。

[正常畫面](../qa/evidence/v12.5.1/portrait-low.png) · [灰階對照](../qa/evidence/v12.5.1/portrait-gray.png)

## 範圍與限制

- 低畫質名牌文字較柔；多條預警與人物交錯、下方 HUD 有局部遮擋風險，目前沒有足夠證據認定必須立即修補的產品缺陷。
- 上方補證的警示位於計時 HUD 下方，不能算已測上方 HUD 遮擋。下方警示與經驗列相交只證明受控遮擋，不證明玩家實際遭不可見攻擊。
- Firefox 160／geckodriver 0.37.1 使用同源 iframe 驗證實際尺寸與輸入座標；涵蓋設定重載、移動、拾取／裝備切換、升級實際數值、強制結算／再玩及三輪重啟。事件數不等於測項數。
- SafariDriver 的服務可啟動，但建立 session 明確要求開啟 Allow remote automation，未擅改設定或建立會話。
- 桌面縮小視窗／iframe、CDP 的 DPR 與媒體偏好模擬不等於手機；未宣稱 WCAG、硬體 GPU、FPS／耗電、完整自然敗北或真人難度通過。Q4／Q6 分別保留。
- 早期截圖工具未恢復目標畫質、被拾取對話框遮住，或以手動推進代替正常 loop 的結果已排除；只使用修正後且有逐張狀態的資料。

E4／E5 維護邊界與狀態投影限制見 [QA 說明](../qa/README.md)。完整私密／離機備份尚未完成，見[復原分項紀錄](recovery-checkpoint-2026-11-12.md)。

## 發布對照

- 遊戲發布提交：[`949ff05`](https://github.com/xdxd-lab/plush_rescue/commit/949ff0523c4c58af081a9411551bc24e48d373e3)，附註 tag [`v12.5.1`](https://github.com/xdxd-lab/plush_rescue/releases/tag/v12.5.1)，基礎提交 `e6b8dd2`。
- [CI 與 Pages](https://github.com/xdxd-lab/plush_rescue/actions/runs/43069828913) 的 test／build-pages／deploy-pages 均成功。
- [Sites](https://plush-rescue-survivor.b892020xx.chatgpt.site) 保存版本 21 已部署成功，來源提交 `e71b40f`；部署包獨立驗證為 43 個 regular files（40 執行檔、manifest、.nojekyll 與必要 hosting 設定），逐檔雜湊與遊戲來源吻合。
- 後續本次發布紀錄文件提交未改執行檔，不另建遊戲版本或重發 Sites。
