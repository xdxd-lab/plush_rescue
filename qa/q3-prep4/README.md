# Q3：有界 Firefox hover 診斷工具

本工具供已安排時段的 macOS 人工協作診斷使用，**不是一般自動回歸或效能測試**。產品基準為 v12.6.2、main `b53a74e5390ab80a7ddbeefe9bc145e4103ceb06`，runtime 對應 code `3213067b88e5f8474eb71a9580cb00d45c48a22d`。工具不改產品檔案；來源與 manifest 守門若漂移即停止，不自行下載或更新瀏覽器。

## 執行模式與前置

- Node 24、macOS 系統 Python 3、Firefox 160.0（bundle 16026.11.4）、geckodriver 0.37.1。各機先核 binary hashes；不要把不同版本結果混用。
- **可見 Firefox 可能遮住桌面、改焦點並發聲**；既有隔離 origin 流程會操作遊戲音量至 .65。需先取得 15 分鐘桌面／音訊時段與團隊 GPU 交棒，不改玩家原 profile、系統音量、Safari 偏好或權限。不能承諾背景、無聲或不搶焦點。
- 使用獨立 origin、臨時 profile、動態 loopback ports；結果必須放在 repo 外，避免個人路徑、程序身份、session 能力或原圖被意外提交／由 Pages 公開。
- 必須明確提供三個本機環境變數：`Q3_FIREFOX_BINARY`（Firefox 可執行檔絕對路徑）、`Q3_GECKODRIVER_BINARY`（driver 絕對路徑）、`Q3_REPORT_ROOT`（repo 外結果目錄絕對路徑）。路徑會 canonicalize；缺少、相對、binary 不存在或輸出落在 repo 內皆拒絕。既有 root／profiles／runs 必須為本使用者擁有的私密目錄（無 group／other 權限），子目錄不得為 symlink；新目錄以 0700 建立，不自動 chmod 或修復既有路徑。此處不提供個人機器路徑。

未傳執行旗標的命令只印準備訊息，不啟 server／browser：

```sh
node qa/q3-prep4/supervisor.mjs
python3 qa/q3-prep4/run_q3_n1.py
```

已取得具體時段及固定工具提交的執行許可、設定上述環境變數並核 clean／hash 後，才以 supervisor 執行一次：

```sh
node qa/q3-prep4/supervisor.mjs --run --expected-sha "$(git rev-parse HEAD)"
```

事先獨立核對完整工具 SHA；命令中的 HEAD 不能代替該確認。不得繞過 supervisor 直接以 Python `--run`、改用 no-sandbox、跳過權限審核或自行重試。兩個支援 runner 模組的直接執行入口也會拒絕啟動。

## 固定方法、期限與來源

單次原 1280×720 前序，再到 360×640 frostwand hover 後停止。雙 rAF、0.8 秒 dwell、8 秒 wait、0.1 秒 polling 不變；不執行後續 360 或 390 完整矩陣。觀測有限 pointer／投影／遮擋／drop／status ring；probe 可能改變時序，通過不證歷史根因或穩定性。

工作限 600 秒、含清理總限 660 秒；supervisor 從執行參數驗證後以單調時鐘計算剩餘預算，設定與版本前置檢查也扣除，不額外延長。supervisor 捕捉 stdout/stderr 上限 1 MiB，driver log 上限 1 MiB（溢出即結果無效），HTTP 回覆上限 4 MB。無自動 retry 或 timeout 延長。啟動失敗是 0 viewport，不能稱為 hover 結果。

runner 要求完整工具 HEAD、clean worktree，並在建立測試 artifacts/profile、HTTP server／driver server 前核 v12.6.2／revision／source，以及固定 manifest SHA256 `4f4c0991982e0f53edd2a9258becf682da554ae51177ac39dcf9966ec6cc6734` 與全部 43 個條目（42 個 runtime 檔加 build-info）的 bytes/hash。supervisor checkpoint、Python 與 geckodriver 版本查詢可先執行，不能稱所有程序／檔案皆在守門後。未來產品更新須明確重固定契約，不放寬驗證來容納漂移。

## 清理與持久證據

記 runner／driver／Firefox 的 kernel PID、unique/start、argv、group、精確 profile 與 ports。identity 不可得是未知，不能當不存在；真正 TERM 前立即再次核 exact owner，不廣泛以名稱 kill。此檢查與 signal 並非 OS 原子操作。

`cleanup.jsonl` 保存每個資源 begin/result、phase、PID 或 loopback port／errno；report evidence ring 最多 256。monitor errors 最後 16 筆、journal 最多 16 筆及總數／截斷旗標分列，不記無關程序 argv。ps 3 秒 timeout、identity 取得失敗或證據寫入錯誤皆保持 fail-closed。寫入失敗不能故意中斷其餘清理，且會保留 profile 供獨立 audit。

每個記錄 port 一次 connect+bind，只有 ECONNREFUSED 且可 bind 才通過；listener、未知 errno、EADDRINUSE 或權限錯誤不過，不設 reuse 選項、不延原 0.3 秒清理等待。其他資源失敗仍收集各 port 錯源；缺 port 證據或 profile 未移除不得整批成功。初始化失敗仍可能留下空私有目錄，不冒稱已清。

新 runner 的 `cleanupVerified` 只是自我觀測；supervisor 結束本身不證 descendant 清理。每批後須獨立 exact PID／group／ports／profile audit，強制退出或缺最終報告均未證，不得用後來的事後清理覆蓋當時失敗。

路徑檢查與使用並非 OS 原子操作，應使用可信且不會被其他使用者替換的父目錄；canonicalize 後安全的 repo 外 root 可由 symlink 指向，但 profiles／runs 本身不得為 symlink。目錄檢查不能保證抵抗同時修改檔案系統的敵意程序。

## 已知結果與未驗

先前 v12.6.1 Firefox360 的 hover 逾時缺當次事件，歷史根因仍 unknown；後續原條件單次通過不證穩定。另一批 session status5 在 viewport 前失敗，與 hover 分列。

本機 v12.6.2 有埋點診斷曾取得可信 pointermove、同 id11 frostwand/offhand 進 pickup 的時序，但其 monitor／port cleanup 失敗、exit1、`cleanupVerified=false`，不是完整產品 PASS 或 FAIL。事後 audit 已清是另一時點。這次清理取證修訂只完成離線 mock，**尚未重跑 Firefox 或證明實際清理成功**；全部原 FAIL／BLOCK保留。Safari remote automation、真機手機與完整跨平台回歸均未由本工具補驗。

## 離線契約與 CI

以固定產品提交的 runtime 當測試 fixture。在當前 checkout 已包含該提交的本機 Git 完整物件時：

```sh
fixture="$(mktemp -d)"
git archive b53a74e5390ab80a7ddbeefe9bc145e4103ceb06 | tar -x -C "$fixture"
Q3_TEST_RUNTIME_ROOT="$fixture" PYTHONDONTWRITEBYTECODE=1 \
  python3 -m unittest discover -s qa/q3-prep4 -p "test_*.py" -v
```

原 23 項 ownership／來源／清理 mock 加 10 項可攜設定契約，預期 33 項。依舊以原本的 SHA256、43 個檔案完整性及版本來源斷言檢查固定 runtime。未設定 `Q3_TEST_RUNTIME_ROOT` 時，測試仍以當前 checkout 作為 fixture；若它已不是固定基準，就應報來源不符。這個變數只供離線 tests，不能讓實際 Firefox 入口接受未固定的 checkout。當前候選版的清單和資產另由 `verify-export.py` 檢查，不使用歷史 fixture。

CI 的 Ubuntu test job 額外 checkout 同一個固定產品提交，再用既有 Python 3.12 跑這 33 項，測試上限仍為 2 分鐘。不啟 browser／server、不打真 socket／signal、不呼叫真 macOS identity API。Chrome／Pages 的部署條件、freshness、concurrency 與 permissions 不放寬；V3 UI 另有獨立 gate。Q3 離線 CI 成功不證 Firefox、音訊、OS identity 或實際 cleanup。
