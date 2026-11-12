# 參與與協作 · Plush Rescue

本儲存庫是可直接部署到 GitHub Pages 的靜態遊戲，沒有建置步驟。`main` 分支的根目錄就是線上網站。

`.github/workflows/ci-pages.yml` 會對每次推送與指向 `main` 的 PR 自動執行下方的必要檢查，並只在推送到 `main` 且檢查通過時部署。截至 v12.4.1（`3af4239`），本專案 Pages Source 已確認為 **GitHub Actions**，當時的 Node／DOM／export 門檻已生效；Linux Chrome 子集門檻於 v12.6.0 後的 Q2 批次追加，並在主線完成驗收。移植到其他儲存庫時仍須核對設定（見 README「發布到 GitHub Pages」）；推送前也應完成下方檢查。

## 語言

- `README.md`、`CHANGELOG.md`、本文件與 `.github/` 內的範本使用正體中文與臺灣常用語氣。
- `qa/README.md`、程式註解與提交訊息可以用英文。
- 指令、程式碼、路徑、檔名、版本識別碼與必要的技術名稱保留原文。

## 修改流程

1. 從最新的 `main` 開分支，例如 `fix/<主題>`、`feat/<主題>`、`docs/<主題>`、`test/<主題>`。
2. 直接修改根目錄的遊戲檔案與 `qa/`；本儲存庫自 V12 起沒有另外的上游原始碼（見 `README.md`「維護方式與開發來源」）。
3. 改到執行檔（`runtime-manifest.json` 列出的檔案）時，執行 `python3 qa/regenerate-manifest.py`。
4. 執行下方的必要檢查，並把結果寫進 PR；PR 上的 `CI and Pages` workflow 會再跑一次同樣的三項檢查，通過後再執行共用的 Linux Chrome 子集。
5. 發布新版本時，依 `README.md`「版本識別與標注慣例」更新 `build-info.json`、`main.js`、`index.html` 與 `CHANGELOG.md`，合併後建立 tag 與 GitHub Release。

提交訊息採 Conventional Commits 前綴：`feat:`、`fix:`、`test:`、`docs:`、`chore:`。

## 必要檢查

Node.js 版本需求見 `README.md`「本機執行與驗證」。

```sh
python3 verify-export.py
node --test qa/*.test.mjs
node qa/ui-smoke.mjs
```

CI 的 `chrome-smoke` 使用與分支診斷相同的 `chrome-q2-shared.yml`，以單輪 1280×720 矩陣加四種故障探測檢查實際輸入、設定、儲存、對話框及程序／連線清理；Pages 建置同時依賴它與 `test`。雙輪診斷另保留，失敗不以自動重試掩蓋；套件安裝或工作顯示成功都不能取代原始報告與截圖核對。詳見 [Q2 紀錄](docs/quality-audit-2026-11-12.md)。

改到輸入、版面、對話框或 WebGL 時，另外在有 Google Chrome 的環境執行（耗時約 10 分鐘）：

```sh
node qa/browser-chrome.mjs --dialogs
```

## 驗證紀錄的寫法

- 明確區分 Node 模擬測試、瀏覽器檢查與實體手機測試，不要把其中一種寫成另一種的驗證成果。
- 只寫有執行輸出可以核對的結果：命令、結束碼、通過數。
- 描述某個時點的狀態時，用「截至 vX.Y.Z（<commit>）」標注，見 `README.md`「版本識別與標注慣例」。
- 尚未驗證的項目（例如 Safari、Firefox、實體手機、真實 GPU）要列出來。

## 授權與素材

本儲存庫目前沒有專案授權檔。內附的 Three.js 依 `vendor/THREE-LICENSE.txt`（MIT）授權；角色美術與其他素材依原提供內容收錄，不因此取得額外的再散布授權。提交新素材前，請先確認你有權以本儲存庫的方式公開散布。
