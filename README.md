<p align="center"><img src="assets/brand/banner.jpg" alt="布偶救援隊 PLUSH RESCUE：布丁狗與北極熊並肩救回布偶朋友" width="1280"></p>

**立即遊玩：**[GitHub Pages](https://xdxd-lab.github.io/plush_rescue/) · [Sites](https://plush-rescue-survivor.b892020xx.chatgpt.site)

# 布偶救援隊 · Plush Rescue V12.6.1

這是一款可直接在瀏覽器遊玩的單人生存救援遊戲，不需要下載或安裝。GitHub Pages 版本是免建置的靜態網站；`index.html`、遊戲模組與素材都放在本儲存庫根目錄。執行遊戲不需要 CDN、`npm install` 或後端服務。

## 給未來維護者與 AI 的語言規範

**本 `README.md` 及其後續修訂，請一律使用正體中文與臺灣常用語氣撰寫。**不要改成簡體中文，也不要將整份文件改回英文。指令、程式碼、路徑、檔名、版本識別碼，以及 GitHub Pages、WebGL 等必要的技術名稱可以保留原文。

修改遊戲功能或發布新版本時，請同步更新 `CHANGELOG.md` 的功能說明、驗證結果與尚未驗證的項目（`CHANGELOG.md`、`CONTRIBUTING.md` 與 `.github/` 範本同樣使用正體中文；`qa/README.md` 與程式註解可用英文）。請明確區分 Node 模擬測試、瀏覽器檢查與實體手機測試，不要把其中一種寫成另一種的驗證成果。

## 發布到 GitHub Pages

本儲存庫的網站內容就是 `main` 分支的根目錄。後續更新請將網站檔案直接提交至根目錄，並保留隱藏檔 `.nojekyll`；不要再把匯出內容包進子資料夾。

**測試與部署 workflow：**`.github/workflows/ci-pages.yml` 在各分支推送、指向 `main` 的 PR 與手動觸發時先執行 `test`（Node 24、Python 3.12）：`python3 verify-export.py`、`node --test qa/*.test.mjs`、`node qa/ui-smoke.mjs`。通過後，`chrome-smoke` 呼叫共用的 `chrome-q2-shared.yml`，在 Linux 執行一輪 1280×720 真實 Chrome／WebGL 矩陣及四種故障探測，保存版本、截圖與清理證據。這是單尺寸 CI 範圍，不取代完整 Chrome、多瀏覽器、手機或真人驗收；執行方式與限制見 [Q2 紀錄](docs/quality-audit-2026-11-12.md)。

只有推送到 `main` 且 `test`、`chrome-smoke` 都成功，才以該次提交（`github.sha`）打包根目錄。部署前再確認 `main` 仍指向同一提交；已有更新時略過舊提交的部署，避免較晚完成或重跑的舊 run 蓋掉新版。Pages 流程為 `configure-pages` → `upload-pages-artifact` → `deploy-pages`，environment 為 `github-pages`。

**目前設定與移植注意：**截至 v12.4.1（`3af4239`），已核對本專案 Pages Source 為 **GitHub Actions**，當時的 Node／DOM／export 部署門檻已生效；Chrome 子集為 v12.6.0 後追加的 CI 改善。若移植到其他儲存庫，只有同樣設定為 GitHub Actions 後，workflow 才是唯一部署途徑；仍用 **Deploy from a branch** 時會直接發布 `main` 根目錄，測試失敗也可能上線。切換由管理員在 GitHub 設定頁進行，本 workflow 不會自動變更設定。

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

- **版本對照表由 V11（`cbfa10e`）起記錄：**這是本表列出的第一個發布版本，不等於遠端 Git 歷史的根提交。先前本機使用 shallow clone，沒有取得更早祖先；本輪完整鏡像已確認同一遠端可讀取較早歷史。早期套件與測試能否重跑，須按指定提交的實際檔案與相依逐版核對，詳見[歷史發布紀錄](docs/releases-history.md)。
- **自 V12（`4080051`）起：**本專案直接使用本儲存庫維護與發布。修改遊戲時請直接編輯本儲存庫，並依「發布新版本」的步驟更新版本與驗證紀錄。

## 版本識別與標注慣例

- **唯一來源：**發布版本以 `build-info.json` 的 `version`（語意化版本，例如 `12.1.1`）與 `revision` 為準。新版本的 `revision` 採 `v<version>-<代號>-r<序號>`（例如 `v12.1.1-tap-hit-r1`）；V12、V12.1 的舊值保留作歷史紀錄。`qa/` 內的測試一律從 `build-info.json` 讀取，不另外寫死目前版本。
- **必須一致的執行檔：**`main.js` 的 `__PLUSH_QA__.revision` 與 `index.html` 的 `#game` `data-build` 必須等於 `revision`；`runtime-manifest.json` 的 `version`／`revision`／基礎來源提交 `source_commit` 由 `qa/regenerate-manifest.py` 從 `build-info.json` 複製。`qa/invariants.test.mjs` 會檢查以上欄位一致。`source_commit` 記錄基礎來源，未必是本儲存庫的發布提交。
- **發布新版本：**更新 `build-info.json` → 同步 `main.js` 與 `index.html` 的 `revision` → `python3 qa/regenerate-manifest.py`（說明文字有變時加 `--layout=…`）→ `node --test qa/*.test.mjs`、`node qa/ui-smoke.mjs`、`python3 verify-export.py` → 更新 `CHANGELOG.md`（新增版本段落與對照表一列）→ 提交後建立 tag 與 GitHub Release（見下一項）。
- **tag 與 GitHub Release：**每個發布提交建立附註 tag `v<version>`（例如 `v12.1.1`），訊息寫 `revision`；推送 tag 後在 GitHub 以該 tag 建立 Release，內容取自 `CHANGELOG.md` 對應段落。只改文件或 `qa/` 的後續提交不另立 tag。2026-11-11 已補齊本倉庫 V11～V12.5.0 的15個可驗證版本之tag與Release；補建明確標為歷史紀錄、未重測或部署舊版，最新版未變。不要重複建立或改寫既有tag；核對表與補建規則見[歷史發布紀錄](docs/releases-history.md)。

- **`build-info.json` 欄位語意：**`source_commit` 是發布提交的父提交（基礎提交），不是發布提交本身；發布提交由 tag 與 `CHANGELOG.md` 對照表對應。`validation_at_build` 與 `built_at` 是建置當下的快照，之後只改 `qa/` 或文件時不更新（測試數量可能因此比快照多）。
- **文件中的時間標注：**描述某個時點的狀態時，以版本加提交標明，不用日期或模糊的「目前」：
  - `截至 vX.Y.Z（<commit>）`：當時的快照，例如驗證數量、檔案是否變更；之後不再更新。
  - `自 vX.Y.Z 起`：從該版開始成立的行為。
  - `vX.Y.Z 以前`／`已由 vX.Y.Z 取代`：已不再適用的舊行為。
  - 程式註解用英文對應寫法：`as of vX.Y.Z (<commit>)`、`since vX.Y.Z`、`until vX.Y.Z`。

## 參與協作

固定代號的待辦、優先級、狀態與GitHub Issues連結見[待辦與議題索引](docs/BACKLOG.md)。建立議題不等於批准實作，私密備份及會話資訊不放公開Issue。

修改流程、必要檢查、提交訊息與驗證紀錄的寫法見 [`CONTRIBUTING.md`](CONTRIBUTING.md)；PR 與問題回報範本在 `.github/`。

更換電腦時可參考[開發環境與移機復原紀錄](開發環境復原.md)。

## 版本紀錄

目前版本為 **12.6.1**（`v12.6.1-webgl-recovery-r1`）。本版在無法建立 WebGL 畫面時提供可用鍵盤操作的「再試一次」與排查指引，以重新載入保留已儲存的設定與紀錄。QA 新增固定場景的渲染量測工具；量測方法與限制見 [`E6 說明`](qa/E6-RENDER-BUDGET.md)，不代表已改善效能或完成手機驗收。雲端歷史保留與本輪文件澄清見[保留紀錄](docs/retention-review-2026-11-12.md)。v12.6.0 已將主武器命中閃光接入既有圖集的星形素材；載入前、失敗或圖片無效時仍保留原效果。素材來源與重建工具已可攜保存，玩法、原有直式視角及其他特效範圍維持前版。先前 v12.5.1 已整理 Core 排版與詳細狀態回歸測試，將對話框、拾取、輸入及畫面同步抽成獨立模組；玩法、直式視角與輸入規則延續前版。先前 v12.5.0 已加入開始畫面的材質預熱與衝刺預警的明暗對比；設定保存、選擇倒數、音效與 HUD 模組拆分，以及鎖定清單驗證與瀏覽器測項篩選，則已於 v12.4.1 完成。玩法延續 V12.4.0。升級從 8 種中每次抽 4 種，新增拾取範圍、暴擊、魔法範圍與受傷後守護時間；開局 30 秒後會出現兩種新敵人：會在你腳下丟出預警圈的遠程布偶，以及停下瞄準、地上箭頭填滿後直線衝刺的衝刺布偶。觸控時每根手指會顯示帶編號的圓點與按下擴散圈（可在設定關閉，減少動態效果時只留圓點）。暫停畫面更精簡：設定列 44 像素、畫質與下一位隊員改為分段選擇，寬而矮的視窗改成兩欄。寶物名牌在小視窗也讀得清楚：主標至少約 12 像素，碰到主角時會往旁邊移開，視窗高度低於 480 像素時最多顯示 3 個。地雷不再顯示倒數數字，引信最後 30% 的時間爆炸範圍圈會轉為亮金白。小視窗中，開始與暫停畫面的「出發救援」「繼續救援」按鈕一開啟就看得到。新增布丁狗頭像的分頁圖示與主畫面圖示、社群分享預覽，以及開始／暫停畫面的小標記。主武器光彈多了漸淡光尾，命中時有短暫亮光與小棉絮（系統要求減少動態效果時只留亮光）。救回的小首領或大首領會縮小成戴皇冠的小夥伴，在身邊幫忙 30 秒；寶物名牌只顯示最近幾個（直式最多 3 個、橫式最多 5 個）且不互相重疊。滑鼠移到寶物上停留約 0.5 秒即可拾取，也可以照常點擊；觸控拾取方式不變。在遊戲內的「設定」可選擇開啟「選擇時倒數 10 秒自動決定」；預設關閉，僅適用於升級和武器比較畫面，玩家操作會取消當次倒數。各版本的變更、驗證結果、尚未驗證的項目，以及版本與提交的對照，見 [`CHANGELOG.md`](CHANGELOG.md)。

## 素材與後續修改

`runtime-manifest.json` 記錄目前每個遊戲執行檔的大小與 SHA-256 雜湊。內附的 Three.js 授權條款位於 `vendor/THREE-LICENSE.txt`。角色美術與其他素材依原提供內容收錄，並不因此取得額外的再散布授權。

修改遊戲時請直接編輯本儲存庫，確認變更後依「版本識別與標注慣例」的發布步驟重新產生 manifest 並驗證。早期歷史與測試可用性請按完整遠端及指定提交核對，不以本機 shallow clone 的缺失判定遠端不存在（見「維護方式與開發來源」）。
