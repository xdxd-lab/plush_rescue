# Q6 長局基準與真人試玩準備

## 目的與界線

此 QA harness 用固定亂數與固定 50 ms timestep 重複執行 `core.js` 的 `Game.step`，記錄可重現的長局指標。它提供核心模擬基準，不是遊戲平衡驗收，也不代替完整瀏覽器、3D 地圖碰撞或真人遊玩。測試開始時固定在 `test/longrun-q6` 基準分支；更換核心版本時，另開結果檔並記錄對應 commit，不覆寫舊結果。

`Game` 只接收地圖索引，實際地圖碰撞圓由 `maps.js` 的 Three.js `buildMap` 動態建立。本測試刻意不初始化 Three.js，因此記錄的是三個 map index 的 core-only case，並沒有地圖幾何、碰撞圓或視覺內容。瀏覽器或真人結果需另行記錄。

## 固定案例與策略

- 2 個 hero（`pudding`、`polar`）× 3 個 map index（`courtyard`、`greenhouse`、`park`），每組固定 seed 寫在 `qa/q6-longrun.mjs`。
- 每個自然案例採 `dt=0.05`，最多 24,001 個 `Game.step` 呼叫，以涵蓋 24,000 個 50 ms 更新間隔及核心在 1,200 秒觸發終止狀態所需的浮點邊界步。結果同時保存實際步數、原始 `game.time`、狀態與停止原因；不得手動改時間或狀態。只建立一組固定種子案例；不搜尋有利種子。
- 移動策略為追逐 9 個世界單位內最近的存活 drop，否則每 16 秒依序向東、北、西、南巡邏。Drop 由遊戲原本的近距離收集流程取得，不直接呼叫遠距離拾取 API。
- 武器比較視窗一律選擇替換。升級固定按 `heart`、`speed`、`rate`、`power` 順序選擇第一個已發牌項目；如果四者都沒發到，選牌單第一項。`upgrades` 記錄升級卡選擇，`skillPickups` 另記靠近後直接套用的技能掉落。策略不額外呼叫遊戲 RNG。
- 先跑自然血量。自然死亡記為 `fallen` 和實際存活秒數，不能當作 20 分鐘完成。若提早死亡，才以同 seed、同移動和選擇策略跑一次診斷組；診斷每步將 `invuln` 設為 1，只為觀察後期系統是否能到達，不是難度、存活或平衡證據。
- harness 只包裝 `damageEnemy`、`hurtPlayer` 來觀察實際傷害，原方法照常執行。報告記錄步數、狀態、原始/四捨五入後時間、HP、等級/經驗、救援數、升級、技能拾取、武器拾取選擇、觀察到的敵人種類/角色、頭目種類、盟友救援與傷害量。被擊殺敵人只計到其剩餘 HP，避免把超額傷害計入。這是測量插樁，重複結果一致本身不等同獨立證明插樁對遊戲行為零影響。
- JSON 記錄執行時取得的 Git branch/HEAD/dirty 狀態、Node 版本及 `core.js`、`weapons.js`、harness 的 SHA-256。`maxHostileEntitiesIncludingBosses` 包含普通敵人與頭目；不要拿它直接跟普通敵人的 90 個限制比較。

## 執行

```sh
node qa/q6-longrun.mjs --out=/absolute/path/to/q6-longrun.json
```

預設完整跑最多六個自然案例；只有自然案例沒有到 1,200 秒的組別才增加同 seed 診斷案例。輸出 JSON 含每分鐘檢查點與完整策略描述。Smoke 執行可用 `--max-seconds=5 --case-limit=1 --skip-diagnostics`，但不可將 smoke 結果當長局資料。

## 判讀

- 只有自然模式 `reason=survived` 且實際時間到 1,200 秒才是完成一次自然 20 分鐘模擬。
- 診斷模式即使達到 1,200 秒，也只說明該 seed/策略能推進至後期狀態；不得描述為玩家能活 20 分鐘。
- `heroId` 與 map index 只是 core case 的識別值；核心模擬不裝載 hero 視覺差異與地圖碰撞。每組 seed 不同，因此不能由此比較 hero 或地圖難度。五個自然案例在敵人角色從 30 秒才可能出現前就結束；角色清單空白不代表角色功能失效。Core-only 運行無地圖碰撞幾何、顯示、音訊、鍵鼠/觸控或瀏覽器時間差。NPC 落點與固定巡邏不等於真人策略。
- 真人測試使用 `qa/q6-human-playtest.md`，記實際版本、hero/map、玩家自己選擇、結束時間與中斷原因。不要把真人紀錄併入程式模擬統計。

## 真人試玩填寫表

見 [`q6-human-playtest.md`](./q6-human-playtest.md)。Q6 在取得真人試玩資料並經 review 前維持未完成。
