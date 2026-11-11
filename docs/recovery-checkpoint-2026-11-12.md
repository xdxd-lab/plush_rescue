# 2026-11-12 專案備份與還原分項紀錄

此為 R1／R2 的公開範圍紀錄；私密保存位置、Session、憑證及加密方式不收錄於本儲存庫。**完整環境備份與離機驗證仍未完成。**

## 已驗證的快照

- 基準：main `274e5db`，遊戲 v12.5.0；不包含此後的 E5／Q5 修改。
- 新快照 v2：94 檔、10,364,588 bytes，有逐檔 SHA-256 與大小清單。包含完整可取得的 GitHub 遠端歷史及本機 refs、素材與 QA 工具來源、Sites 當前執行檔投影及工具版本。
- 原 v1 的 bundle 因未保全 shallow 邊界所需父資料而無法獨立還原，結果維持失敗；另建 v2，不覆寫原件或校驗清單。
- 本機現役 clone 的 shallow 狀態未改。v2 由隔離完整 mirror 加入本機 refs 建立，自足且非 shallow；原 shallow 檔只作來源證據，不能套到完整還原庫。

## 獨立同機還原結果

測試者只使用 v2 快照，在全新路徑還原，未借用現役 repo 補資料：

- bundle verify、clone、fsck、30 refs 與符號 HEAD 核對通過；main 歷史 89 commits、根提交 `e472e22`，V11 父提交可讀。
- main 與 6 個 linked worktrees 均依保存的 branch／HEAD 重建且乾淨；絕對路徑重新配置。
- 84 個素材／QA／Sites 投影檔雜湊吻合，94 檔完整 manifest 於演練前後一致。
- 還原後 Node tests 207/207、DOM smoke 88 項、export 36 hashes／68 references／24 modules 與 diff check 通過。
- 未覆寫現役設定、登入憑證或啟動真實 Codex／Herdr 會話。

上述只證明**同機非私密專案分項**。快照未加密、未離機，未含私密會話／設定／資料庫、完整獨立 Sites Git、其餘 staging 報告或舊備份包。另一設備安裝、登入與會話續接未驗證；R1／R2 保持開啟。

## 工具版本快照

取得時間：2026-11-11 23:28（臺灣時間）；版本可供重建參考，不要求新機降版。磁碟版本與執行中的程序版本可能不同。

| 工具 | 當時版本 |
|---|---|
| macOS／架構 | 27.2（26B123）／arm64 |
| Git | 2.50.1（Apple Git-155） |
| Node.js | 24.22.1 |
| Python | 3.9.6 |
| GitHub CLI | 2.103.3 |
| Codex CLI（磁碟） | 0.167.1 |
| Claude Code | 2.1.322 |
| Herdr App／Core | 0.1.14／0.1.20 |
| Chrome | 157.0.8103.39 |
| Safari | 27.2（22625.2.8.11.9） |
| Firefox（暫裝測試副本） | 160.0 |

本機另保存 61 筆 skill cache 清單。以下按 provider／套件版本去重；**cache 存在不代表已啟用、已登入、已授權或是本遊戲的執行依賴**。換機應依需要安裝並重新登入，不複製憑證。

| Provider | 套件 | Cache 版本 |
|---|---|---|
| openai-bundled | visualize | 1.0.84 |
| openai-curated-remote | vidIQ connector | 9.0.1 |
| openai-curated-remote | cloud-environment | 0.2.0 |
| openai-curated-remote | engineering-suite-taste | 2.0.0 |
| openai-curated-remote | openai-templates | 0.1.1 |
| openai-curated-remote | pages | 0.1.26 |
| openai-curated-remote | plugin-management | 0.1.0 |
| openai-curated-remote | sites | 1.1.6 |
| openai-curated-remote | work-pets | 0.1.6 |
| openai-primary-runtime | documents | 26.1110.11258 |
| openai-primary-runtime | pdf | 26.1110.11258 |
| openai-primary-runtime | presentations | 26.1110.11258 |
| openai-primary-runtime | spreadsheets | 26.1110.11258 |
| openai-primary-runtime | template-creator | 26.1110.11258 |

後續以新快照記錄新提交與版本，不修改本次已驗證的 v2。復原操作步驟見[開發環境復原](../開發環境復原.md)，最新工作狀態見 [R1](https://github.com/xdxd-lab/plush_rescue/issues/15)／[R2](https://github.com/xdxd-lab/plush_rescue/issues/16)。
