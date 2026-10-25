## 變更內容

<!-- 這個 PR 改了什麼、為什麼。 -->

## 類型

- [ ] 遊戲行為或畫面（改到 `runtime-manifest.json` 列出的執行檔）
- [ ] 測試或 QA 工具（`qa/`）
- [ ] 文件
- [ ] 發布新版本（`build-info.json`、`main.js`、`index.html`、`CHANGELOG.md` 已同步）

## 檢查結果

<!-- 貼上實際輸出摘要：命令、結束碼、通過數。沒有執行的項目請勾「未執行」並說明原因。
     前三項也由 `CI and Pages` workflow 的 test job 自動執行，請確認它通過。
     注意：Settings → Pages → Source 切為 GitHub Actions 之前，合併到 main 會直接發布，不受 workflow 結果影響。 -->

- [ ] `python3 verify-export.py`
- [ ] `node --test qa/*.test.mjs`
- [ ] `node qa/ui-smoke.mjs`
- [ ] `node qa/browser-chrome.mjs --dialogs`（改到輸入、版面、對話框或 WebGL 時）
- [ ] 改到執行檔時已執行 `python3 qa/regenerate-manifest.py`

## 尚未驗證

<!-- 例如 Safari、Firefox、實體手機、真實 GPU。請區分 Node 模擬、瀏覽器檢查與實機測試。 -->
