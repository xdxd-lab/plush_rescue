**立即遊玩：**[GitHub Pages](https://xdxd-lab.github.io/plush_rescue/) · [Sites](https://plush-rescue-survivor.b892020xx.chatgpt.site)

# 布偶救援隊 · Plush Rescue V12.2.1

這是一款可直接在瀏覽器遊玩的單人生存救援遊戲，不需要下載或安裝。GitHub Pages 版本是免建置的靜態網站；`index.html`、遊戲模組與素材都放在本儲存庫根目錄。執行遊戲不需要 CDN、`npm install` 或後端服務。

## 給未來維護者與 AI 的語言規範

**本 `README.md` 及其後續修訂，請一律使用正體中文與臺灣常用語氣撰寫。**不要改成簡體中文，也不要將整份文件改回英文。指令、程式碼、路徑、檔名、版本識別碼，以及 GitHub Pages、WebGL 等必要的技術名稱可以保留原文。

修改遊戲功能或發布新版本時，請同步更新 `CHANGELOG.md` 的功能說明、驗證結果與尚未驗證的項目（`CHANGELOG.md`、`CONTRIBUTING.md` 與 `.github/` 範本同樣使用正體中文；`qa/README.md` 與程式註解可用英文）。請明確區分 Node 模擬測試、瀏覽器檢查與實體手機測試，不要把其中一種寫成另一種的驗證成果。

## 發布到 GitHub Pages

本儲存庫的網站內容就是 `main` 分支的根目錄。後續更新請將網站檔案直接提交至根目錄，並保留隱藏檔 `.nojekyll`；不要再把匯出內容包進子資料夾。

**測試與部署 workflow：**`.github/workflows/ci-pages.yml` 會在每次推送（任何分支）、指向 `main` 的 PR 與手動觸發時執行 `test` job（Node 24、Python 3.12）：依序執行 `python3 verify-export.py`、`node --test qa/*.test.mjs`、`node qa/ui-smoke.mjs`。只有推送到 `main` 且 `test` 成功時，才會以同一個提交（`github.sha`）打包根目錄；部署前會再確認 `main` 仍指向這個提交，若 `main` 已有更新的提交就略過部署（以成功結束），避免較晚完成或重新執行的舊 run 蓋掉新版。通過後才部署到 GitHub Pages（`configure-pages` → `upload-pages-artifact` → `deploy-pages`，environment `github-pages`）。`qa/browser-chrome.mjs` 尚未在 Linux 驗證，不在必跑檢查內。

**門檻何時生效：**workflow 只有在 **Settings → Pages → Build and deployment → Source** 設為 **GitHub Actions** 之後，才會成為唯一的部署途徑。來源仍是 **Deploy from a branch** 時，GitHub 會照舊直接發布 `main` 的根目錄，**測試失敗也會上線**；這時 workflow 的測試結果只供參考，部署 job 也可能失敗或與分支部署重複。切換之前，請把「推送到 `main` 等於發布」當成事實，推送前自行完成本機檢查。切換由儲存庫管理員在 GitHub 設定頁進行，本 workflow 不會自動變更 Pages 設定。

若要在其他儲存庫部署，請至 **Settings → Pages**，選擇 **GitHub Actions**（使用上述 workflow），或選擇 **Deploy from a branch**、`main` 與 `/ (root)`（沒有測試門檻）；儲存後以 Pages 設定頁顯示的網址為準。能否使用 GitHub Pages，仍取決於該帳號方案及儲存庫的公開狀態。

## 本機執行與驗證

在儲存庫根目錄執行：

```sh
python3 verify-export.py
python3 -m http.server 8000
```

接著開啟 <http://localhost:8000/>。請勿用 `file://` 直接開啟 `index.html`，因為 JavaScript 模組需要透過 HTTP 載入。

`verify-export.py` 會檢查執行檔的 SHA-256 雜湊、非網站根路徑下的相對資源引用，以及 Node.js 可用時的 JavaScript 語法；兩位角色的動態頭像路徑也包含在檢查內。若有 Node.js，另外執行：

```sh
node --test qa/*.test.mjs
node qa/ui-smoke.mjs
```

**Node.js 版本：**建議使用 Node.js 22 LTS 或更新版本。`qa/` 會從根目錄載入沒有 `package.json` 標示的 ES 模組 `.js` 檔，必須由 Node 自動辨識模組語法：較舊的 Node 20 不加 `--experimental-detect-module` 會以 `Named export … not found … is a CommonJS module` 失敗，Node 18 不支援。選用的 `qa/browser-chrome.mjs` 另需全域 `WebSocket`（Node 22 起內建，Node 20 加 `--experimental-websocket`）。截至 v12.1.1（`ef9d208`）的實測：

| Node | 指令 | 結果 |
|---|---|---|
| 24.22.1 | `node --test qa/*.test.mjs`、`node qa/ui-smoke.mjs` | 通過（不需 flag） |
| 20.18.0 | 同上，不加 flag | 失敗（上述 CommonJS 錯誤） |
| 20.18.0 | `node --experimental-detect-module --test qa/*.test.mjs`、`node --experimental-detect-module qa/ui-smoke.mjs` | 通過 |

`qa/` 是驗證程式，並非遊戲執行檔，因此不列在 `runtime-manifest.json`。確認執行檔變更後，請依序執行 `python3 qa/regenerate-manifest.py` 與 `python3 verify-export.py`。

瀏覽器基本檢查至少應包含：切換兩位角色、開始遊戲、以 WASD／方向鍵或觸控搖桿移動、暫停與繼續、開啟設定，以及重新開始。

## 維護方式與開發來源

- **截至 V11（`cbfa10e`，本儲存庫第一個提交）：**內容是從上游開發環境整理出的精簡匯出。V5～V11 的完整測試套件與早期開發歷史沒有收錄在本儲存庫；`CHANGELOG.md` 中 V11 以前的紀錄只保留當時的驗證範圍，無法在這裡重跑。
- **自 V12（`4080051`）起：**直接在本儲存庫開發與發布，沒有另外的上游原始碼。修改遊戲時請直接編輯本儲存庫，並依「發布新版本」的步驟更新版本與驗證紀錄。

## 版本識別與標注慣例

- **唯一來源：**發布版本以 `build-info.json` 的 `version`（語意化版本，例如 `12.1.1`）與 `revision` 為準。新版本的 `revision` 採 `v<version>-<代號>-r<序號>`（例如 `v12.1.1-tap-hit-r1`）；V12、V12.1 的舊值保留作歷史紀錄。`qa/` 內的測試一律從 `build-info.json` 讀取，不另外寫死目前版本。
- **必須一致的執行檔：**`main.js` 的 `__PLUSH_QA__.revision` 與 `index.html` 的 `#game` `data-build` 必須等於 `revision`；`runtime-manifest.json` 的 `version`／`revision`／基礎來源提交 `source_commit` 由 `qa/regenerate-manifest.py` 從 `build-info.json` 複製。`qa/invariants.test.mjs` 會檢查以上欄位一致。`source_commit` 記錄基礎來源，未必是本儲存庫的發布提交。
- **發布新版本：**更新 `build-info.json` → 同步 `main.js` 與 `index.html` 的 `revision` → `python3 qa/regenerate-manifest.py`（說明文字有變時加 `--layout=…`）→ `node --test qa/*.test.mjs`、`node qa/ui-smoke.mjs`、`python3 verify-export.py` → 更新 `CHANGELOG.md`（新增版本段落與對照表一列）→ 提交後建立 tag 與 GitHub Release（見下一項）。
- **tag 與 GitHub Release：**每個發布提交建立附註 tag `v<version>`（例如 `v12.1.1`），訊息寫 `revision`；推送 tag 後在 GitHub 以該 tag 建立 Release，內容取自 `CHANGELOG.md` 對應段落。只改文件或 `qa/` 的後續提交不另立 tag。補建既有版本的 tag（需有推送權限的維護者執行）：

  ```sh
  git tag -a v11.0.0 cbfa10e -m v11-boss-rescue-r1
  git tag -a v12.0.0 4080051 -m v12-commercial-ui-r1
  git tag -a v12.1.0 dd01898 -m v12.1-tap-pickup-r1
  git tag -a v12.1.1 6858765 -m v12.1.1-tap-hit-r1
  git push origin v11.0.0 v12.0.0 v12.1.0 v12.1.1
  ```
- **`build-info.json` 欄位語意：**`source_commit` 是發布提交的父提交（基礎提交），不是發布提交本身；發布提交由 tag 與 `CHANGELOG.md` 對照表對應。`validation_at_build` 與 `built_at` 是建置當下的快照，之後只改 `qa/` 或文件時不更新（測試數量可能因此比快照多）。
- **文件中的時間標注：**描述某個時點的狀態時，以版本加提交標明，不用日期或模糊的「目前」：
  - `截至 vX.Y.Z（<commit>）`：當時的快照，例如驗證數量、檔案是否變更；之後不再更新。
  - `自 vX.Y.Z 起`：從該版開始成立的行為。
  - `vX.Y.Z 以前`／`已由 vX.Y.Z 取代`：已不再適用的舊行為。
  - 程式註解用英文對應寫法：`as of vX.Y.Z (<commit>)`、`since vX.Y.Z`、`until vX.Y.Z`。

## 參與協作

修改流程、必要檢查、提交訊息與驗證紀錄的寫法見 [`CONTRIBUTING.md`](CONTRIBUTING.md)；PR 與問題回報範本在 `.github/`。

## 版本紀錄

目前版本為 **12.2.1**（`v12.2.1-hover-pickup-r1`）。滑鼠移到寶物上停留約 0.5 秒即可拾取，也可以照常點擊；觸控拾取方式不變。在遊戲內的「設定」可選擇開啟「選擇時倒數 10 秒自動決定」；預設關閉，僅適用於升級和武器比較畫面，玩家操作會取消當次倒數。各版本的變更、驗證結果、尚未驗證的項目，以及版本與提交的對照，見 [`CHANGELOG.md`](CHANGELOG.md)。

## 素材與後續修改

`runtime-manifest.json` 記錄目前每個遊戲執行檔的大小與 SHA-256 雜湊。內附的 Three.js 授權條款位於 `vendor/THREE-LICENSE.txt`。角色美術與其他素材依原提供內容收錄，並不因此取得額外的再散布授權。

修改遊戲時請直接編輯本儲存庫，確認變更後依「版本識別與標注慣例」的發布步驟重新產生 manifest 並驗證。V11 以前的早期開發與測試歷史不在本儲存庫中（見「維護方式與開發來源」）。
