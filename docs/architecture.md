# 維護導覽：程式、素材與發布

這份導覽幫助維護者找到修改位置。它描述儲存庫的職責分工，不代表每個檔案都在遊戲中載入。完整執行檔清單以根目錄的 `runtime-manifest.json` 和 `qa/regenerate-manifest.py` 為準。

## 從玩家畫面追到程式

```text
index.html + style.css   網頁骨架、控制項和外觀
          │
          └── main.js    啟動、組裝模組和連接畫面／遊戲
                ├── core.js + weapons.js      規則、狀態與武器資料
                ├── maps.js + garden-props.js 場景與 3DGarden 擺設
                ├── *-visuals.js              角色、道具與效果的視覺
                ├── pickup.js + input-controller.js  拾取及輸入
                ├── hud.js + dialogs.js + ui.js      HUD、選單與顯示輔助
                └── audio.js + settings-store.js     音效與設定儲存
```

箭頭是閱讀路徑的簡圖，並非完整依賴圖。`main.js` 也整合攝影機、繪圖同步、暫停時的重繪、初次材質預熱與 WebGL 復原。規則與視覺要一起檢查：例如掉落物改造涉及 `loot-art.js`、`weapon-visuals.js`、`pickup.js` 和 `ui.js` 的畫面命中範圍，不能只以模型看起來正確判定拾取正常。

## 目錄與責任

```text
./
├── index.html、style.css、*.js       玩家直接載入的頁面與模組
├── assets/                           玩家畫面使用的圖片、特效貼圖與品牌資料
├── vendor/                           隨遊戲提供的 Three.js 與其授權
├── build-info.json                   版本與建置當時的驗證快照
├── runtime-manifest.json             指定執行檔的位元組數與 SHA-256
├── verify-export.py                  檢查 manifest、資源路徑與 JS 語法
├── qa/                               Node、瀏覽器與人工驗證工具和紀錄
├── tools/                            素材重建與轉換工具，不是遊戲入口
├── docs/                             架構、素材來源、稽核及歷史紀錄
└── .github/                          PR／問題範本、負責者與工作流程
```

目錄分類是維護用途；**不要為了讓樹狀圖更整齊而直接搬移檔案**。GitHub Pages 使用儲存庫根目錄及相對路徑。若確實要移動，需同步檢查 HTML、CSS、ES module imports、動態資源、重建工具、manifest 清單與既有深層連結，再測試子路徑部署。`verify-export.py` 能檢查列入 manifest 的已知路徑，但不等於實際瀏覽器或手機驗收。

**公開邊界：**Pages 工作流程上傳的是儲存庫根目錄，而不是只有 manifest 內的遊戲檔；上傳 action 會排除 `.git` 與 `.github`。因此不要把密碼、金鑰、私人截圖、未獲再散布權的原始素材或其他不應公開的檔案提交到儲存庫。`qa/`、`docs/` 與 `tools/` 雖非遊戲執行檔，也不能當作私人儲存位置。

## 改動時從哪裡開始

| 任務 | 先看 | 驗證時特別注意 |
|---|---|---|
| 規則、武器數值 | `core.js`、`weapons.js` | 既有玩法及存活／掉落測試，避免只改畫面文字。 |
| 武器或獎品外觀 | `loot-art.js`、`weapon-visuals.js`、`pickup.js`、`ui.js` | 同屏數量、標籤遮擋、點擊／觸控範圍與回收。 |
| 按鈕、設定、暫停 | `index.html`、`style.css`、`dialogs.js`、`settings-store.js` | 手機直橫向、鍵盤焦點、設定保存、減少動態與可讀性。 |
| 地圖與擺設 | `maps.js`、`garden-props.js`、[素材紀錄](garden-props.md) | 出生點、可走路線、碰撞、授權與離線載入。 |
| 效能 | `render-sync.js`、`paused-render.js`、`qa/E6-RENDER-BUDGET.md` | 先記錄裝置／瀏覽器、場景、畫質、樣本與量測方式，再比較；繪圖指標不是手機電量或 FPS 的保證。 |
| 版本、路徑與自動化 | `build-info.json`、`qa/regenerate-manifest.py`、`verify-export.py`、`.github/workflows/` | 不要以更新雜湊取代功能測試；不應為通過檢查而移除驗證。 |

## 從 PR 到玩家可用版本

1. 從最新 `main` 開分支，確認不覆蓋別人的未合併工作；在 PR 說明變更、素材來源、測試和未測範圍。`main` 的保護規則與必要檢查以當時 GitHub Settings 與 PR 畫面為準，不為發布繞過或關閉保護。
2. 修改執行檔後，將新執行檔加入 `qa/regenerate-manifest.py` 的 `RUNTIME`，再產生 manifest；按 [CONTRIBUTING.md](../CONTRIBUTING.md) 執行必要檢查。修改版本時依 [README 的版本慣例](../README.md#版本識別與標注慣例)更新識別、變更紀錄與驗證結果。
3. PR 的 `CI and Pages` 成功**不等於已上線**。合併後，確認該次 `main` 提交的 `test`、`chrome-smoke`、`v3-ui`、`build-pages`、`deploy-pages`，再讀取正式站的 [`build-info.json`](https://xdxd-lab.github.io/plush_rescue/build-info.json) 確認版本。部署工作流程也會檢查 `main` 是否仍是要部署的提交，避免較舊的執行覆蓋新版。
4. **GitHub Pages、Git tag 和 GitHub Release 是不同的東西。**Pages 是玩家網頁；tag 標記 Git 提交；Release 是附在 tag 的發行說明。網站更新不會自動建立 tag 或 Release。按照 README 建立附註 tag 與 Release，並分別核對部署、tag 指向及 Release 內容；若缺權限或尚未建立，應明確記錄，不要把部署成功說成 Release 已完成。

Sites 連結與 GitHub Pages 亦可能部署不同版本，排查時請記錄玩家實際使用的網址和 `build-info.json`。遊戲不需要 npm 安裝；檢查或重建工具各自的相依條件仍應參考各自文件。

## 素材及授權

本儲存庫沒有整體專案授權檔；公開可讀不等於可自由再散布。Three.js [授權](../vendor/THREE-LICENSE.txt)與[執行檔重建](../tools/vendor/README.md)分別有紀錄；3DGarden 模型使用方式與來源見 [garden-props.md](garden-props.md)；Kenney 粒子素材與授權紀錄見 [materials-selection.md](materials-selection.md)。角色、品牌與其他素材的權利應各自確認。新增或替換素材時，記錄來源、授權版本、作者／署名條件、是否允許重製與公開散布，必要時保存授權證據；不要把某一素材的授權推及整個遊戲。
