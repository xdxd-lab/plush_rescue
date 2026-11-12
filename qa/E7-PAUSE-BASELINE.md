# E7 桌面暫停繪製基準（工具準備，尚未實測）

先量測再決定是否最佳化；這不是 CI gate。固定兩個場景：低負載空場與 E6 的 dense（24 一般敵人、2 首領、2 hazard、2 ally、8 rescued）。各場景三輪新 profile；1280×720、DPR1、balanced、map0、seed20261112。Chrome 為 headless，實際 renderer 必須以報告判讀，不能拿 requested hardware 當硬體實證。

```sh
CHROME='/path/to/chrome' node qa/e7-measure.mjs --backend=hardware --expected-sha=<40-character-clean-candidate-SHA> --output=/new/path/e7.json
```

使用 Node22+，輸出路徑不可已存在。候選必須 HEAD 與指定 SHA 一致且 clean。完整執行前先確認前輪自有 browser/driver/ports 沒有殘留，沒有其他重型瀏覽器工作或音訊播放；不改系統設定，不安裝能源監測工具。

## 方法與證據

沿用 E6 的隔離 HTTP/CDP/Chrome 清理框架，不改 E6 或產品。QA 在該次頁面記憶體凍結 Game.step，保持場景數量；running 因而是受控 presentation 路徑，並非自然戰鬥或完整遊戲負載。以真正 q.pause()/q.resume() 切換狀態，不直接把 paused 寫成 status。先在測量前建立一次相同路徑的靜音音訊環境，獨立 origin 的volume固定0；不代表沒有 AudioContext。

每輪固定 running → paused → resumed，各先穩定2秒、再按performance.now量測5秒。固定順序及同次短樣本仍有暖機、排程、溫度等限制，不作跨日穩定性證據。以時間窗結束而非湊固定render數：paused可以0次render，running/resumed必須有render；最多2400樣本，超過即失敗，不截短後當完整結果。

- 每個render：相鄰呼叫起始間隔、JS renderer.render 呼叫耗時、Three.js calls/triangles、當時status。第一個interval是null，統計排除它；沒有樣本的統計為null。
- 每phase：實際經過時間、render次數/秒、累積render呼叫耗時/秒、逐項median/p95/p99/max與原始資料、PNG。
- phase前後：狀態/overlay、game time、focus/visibility與期間transition、物件數、相機矩陣、volume/audioUnlocked。數量、狀態、時間或可見性不一致即失敗；相機phase內與跨phase最大差值容許1e-5，音訊context可用性須一致。headless的focus觀測不等於前景遊戲。
- 每輪：實際WebGL renderer、版本、buffer、投影與模型、暖機、Node/OS/CPU/Chrome版本、來源SHA、runner/Chrome PID、profile/ports、啟停時間與清理狀態。

renderCpuMs只是該JS呼叫，不是整個loop CPU或GPU執行時間；renderCpuMsPerSecond也不是作業系統CPU百分比。calls/triangles或renderHz不可換算瓦數、電池續航或手機FPS。真正耗電未量測；此階段不要求Q4手機、Q6真人或S2，沒有新增其他待辦相依。

## 上限、失敗與清理

六輪依序、每輪自啟動90秒上限，boot/warmup/CDP另有較短限時；沒有自動重試。原始階段資料在PNG前原子保存，啟動即保存自有PID/ports。一般錯誤盡可能回收當前phase；連線死亡或硬終止時可能取不到尚在頁面的資料，必須保留error而不聲稱完整。

SIGINT/SIGTERM/timeout皆走自有程序群組、DevTools port、HTTP server、profile分項清理。任何清理失敗皆非零退出；未證實Chrome與port停止不刪profile。保留完整JSON與原圖，不因失敗重跑覆寫。QA1獨立核對自有PID/ports/profile，QA2檢視每種場景/階段原圖及可見限制；DEV不自驗視覺。

## 後續決策

只有本輪場景/方法驗證與清理成立後，才比較各輪差異。沒有實測前不聲稱收益或要改產品。若paused仍繪製，只能證明該受控環境仍提交繪製；是否做按需繪製須另核相機、對話框、設定預覽、材質ready/context恢復與resume正確性。基準若顯示收益有限或驗收成本不合適，可保留不改的技術結論。任何後續產品變更、CI或對外操作依該次授權，不由本工具自動觸發。
