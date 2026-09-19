# フェーズ2 計画書：『星霊召喚 STELLA SUMMON』

> リサーチ（`docs/RESEARCH.md`）を完全に実装へ落とし込むための設計書。
> 注意書きは `docs/NOTES.md`、評価記録は `docs/REVIEWS.md` に分離。

---

## 1. プロダクト定義

| 項目 | 内容 |
|---|---|
| タイトル | **星霊召喚 -STELLA SUMMON-** |
| ジャンル | ソーシャルゲーム風ガチャ体験シミュレータ |
| 最優先事項 | **① 演出 ② 雰囲気 ③ 壮大な効果音 ④ 気持ちよさ** |
| プラットフォーム | ブラウザ（モバイル縦持ち最優先 / デスクトップ対応） |
| 依存 | **ゼロ**（フレームワーク無し・外部アセット無し・ビルド無し） |
| アセット | 画像/音声ファイルを一切使わず、**全てコードで生成**（Canvas / SVG / WebAudio） |
| 課金 | 無し（無償通貨のみ・実課金導線なし） |

### 世界観（雰囲気の芯）

> 「星が墜ちた夜、失われた星霊（Stella）を呼び戻す儀式」

- 舞台：夜空の下の**星辰儀（せいしんぎ）**。巨大なアストロラーベ状の魔法陣が浮遊している。
- 色：深い藍（#070a18）〜紫（#1a0f2e）を基調に、星霊の光（シアン・金・虹）が差す。
- 質感：**磨りガラス／薄明／星雲／金箔／和紙の繊維**。安っぽいネオンではなく「荘厳」を狙う。
- 音：低い環境ドローン ＋ 遠い鐘 ＋ 星の瞬きのような高音のきらめき。
- フォント：日本語は明朝寄り（`Shippori Mincho` 系が無ければ system serif）、数字は等幅。
  → **外部フォントは読み込まない**（オフライン動作のため）。`font-family` のフォールバック列で対応。

---

## 2. 技術アーキテクチャ

```
index.html                     単一エントリ。ESモジュールで src/main.js を読む
styles/
  tokens.css                   デザイントークン（色/余白/影/タイミング/イージング）
  base.css                     リセット、タイポグラフィ、スクロールバー
  layout.css                   アプリシェル、画面遷移、セーフエリア
  components.css               ボタン、カード、モーダル、バッジ、トースト、タブ
  screens.css                  各画面固有
  summon.css                   召喚ステージ・カットイン・カード顕現（演出の主戦場）
  effects.css                  キーフレーム、シェイク、フラッシュ、色収差
src/
  main.js                      ブート、エラーハンドラ、初回起動フロー
  util/
    dom.js                     h() / qs / on / raf / clamp / lerp
    rng.js                     mulberry32, xorshift128+, 重み付き抽選, シャッフル
    ease.js                    30種のイージング
    tween.js                   Promise ベースのタイムライン／トゥイーン
    events.js                  EventEmitter
    storage.js                 バージョン付き localStorage（マイグレーション）
    format.js                  数値/日付/確率のフォーマット
  audio/
    engine.js                  AudioContext, バス, リミッタ, 生成IRリバーブ, ノイズバッファ, 発音管理
    synth.js                   合成プリミティブ（osc/noise/env/FM/filterSweep/pluck/…）
    sfx.js                     名前付き効果音ライブラリ（30種以上）
    bgm.js                     アダプティブ・プロシージャルBGM
  game/
    rarity.js                  レアリティ定義（色/星/重み/演出強度）
    elements.js                属性（炎/水/風/地/光/闇/星）
    catalog.js                 星霊カタログ（★5×12, ★4×20, ★3×24, ★2×18, ★1×12 ≒ 86体）
    banners.js                 バナー定義（ピックアップ/恒常/ステップアップ）
    gacha.js                   抽選エンジン（レート/天井/ソフト天井/50-50/10連保証）
    stagePlan.js               抽選結果 → 演出プラン（昇格段数・色遷移・カメラ）
    inventory.js               所持・重複・欠片
    economy.js                 通貨・デイリー・交換所・実績
    history.js                 履歴・統計・実効確率
    state.js                   全状態の集約とセーブ
  fx/
    stage.js                   Canvas レイヤ管理（bg / fx / post）、DPR、リサイズ、RAFループ
    starfield.js               星空・星雲・流星
    particles.js               プール式パーティクル（spark/mote/shard/ribbon/petal/ring）
    magiccircle.js             魔法陣（多重リング＋ルーン＋走査）
    pillar.js                  光柱・衝撃波・レイ
    postfx.js                  フラッシュ / トラウマ型シェイク / 色収差 / ヴィネット / スローモー
    crest.js                   キャラ紋章のプロシージャル SVG 生成
  ui/
    app.js                     画面ルータ、共通ヘッダ、遷移アニメ
    home.js / bannerScreen.js / collection.js / shop.js / history.js / settings.js
    summon.js                  **演出ディレクター**（本作の心臓）
    result.js                  結果一覧
    ratesModal.js              提供割合表示
    modal.js / toast.js / confirm.js
tests/
  run.mjs                      依存ゼロのテストランナー
  gacha.test.mjs               統計検証（100万回試行でレート/天井/50-50を検証）
  stageplan.test.mjs           演出プランの整合性（結果と矛盾しないこと）
docs/
  RESEARCH.md / PLAN.md / NOTES.md / REVIEWS.md
```

### 設計原則

1. **抽選と演出の完全分離**：`gacha.js` は演出を知らない。`stagePlan.js` が結果を受けて演出を組む。
   → 「演出が結果を決める」バグ（＝確率操作）を構造的に不可能にする。
2. **演出はデータ駆動**：`StagePlan` は JSON 的なオブジェクト。ディレクタはそれを再生するだけ。
   → スキップ・品質設定・リプレイが自然に実装できる。
3. **Promise ベースのタイムライン**：`await tl.play()` で読める演出コードにする。
   中断可能（AbortSignal 相当の `token`）。
4. **パーティクルは全てプール**：GC スパイクによるフレーム落ちを防ぐ。
5. **音はスケジューラで予約**：`ctx.currentTime` 基準。視覚と音のズレを 10ms 以内に。
6. **状態は単一ソース**：`state.js` が唯一の真実。UIは購読するだけ。

---

## 3. ゲームデザイン仕様

### 3.1 レアリティ

| ID | 表記 | 星 | 色 | 基礎確率 | オーラ色 | 演出強度 |
|---|---|---|---|---|---|---|
| `r1` | N | ★1 | 灰白 `#cfd6e6` | 44.3% | 白 | 最小 |
| `r2` | R | ★2 | 蒼 `#4aa3ff` | 32.0% | 青 | 小 |
| `r3` | SR | ★3 | 銀紫 `#b9a7ff` | 18.0% | 銀 | 中 |
| `r4` | SSR | ★4 | 金 `#ffc93c` | 5.1% | 金 | 大 |
| `r5` | UR | ★5 | 虹 `conic-gradient` | 0.6% | **虹** | **最大** |

※ ★5 0.6% の内訳：ピックアップ 0.3% ＋ 恒常★5 0.3%（50/50）
※ ★4 5.1% の内訳：ピックアップ★4（3体）計 2.55% ＋ 恒常★4 2.55%

### 3.2 ピティ（天井）仕様 — **全て画面上に明示する**

| 項目 | 値 |
|---|---|
| ★5 ハード天井 | **90連**（90連目で必ず★5） |
| ★5 ソフト天井 | **74連目から** 1連ごとに ★5確率 +6.0%（74:6.6%, 80:42.6%, 89:96.6%） |
| ★4 ハード天井 | **10連**（10連目で必ず★4以上） |
| ★4 ソフト天井 | 9連目から +30% |
| 10連保証 | 上記★4ピティにより10連ごとに★4以上が1枚以上確定 |
| ピックアップ ★5 | 50/50。すり抜けたら次の★5はピックアップ確定 |
| ピックアップ ★4 | 50/50。すり抜けたら次の★4はピックアップ確定 |
| 天井引き継ぎ | 同種バナー間で引き継ぐ。恒常↔限定は別カウンタ |
| 真の天井 | 1連ごとに「祈刻」1枚。**200枚でピックアップ★5と確定交換** |

実効★5確率（ソフト天井込みのシミュレーション目標値）：**約 1.6%**（＝平均 62.5連で1体）

### 3.3 星霊カタログ

- 合計 **86体**。各体は手書きデータ：名前（漢字＋読み）、称号、属性、役割、★、フレーバーテキスト、紋章シード、テーマカラー2色。
- ビジュアルは **プロシージャル紋章（SVG）**：シードから外周リング・ルーン・幾何コア・翼/角/光輪 を決定的に生成。
  86体すべてが視覚的に別物になる。
- 属性：`炎 / 水 / 風 / 地 / 雷 / 光 / 闇 / 星`（★5は多くが「星」）
- 役割：`剣 / 盾 / 弓 / 杖 / 拳 / 刃 / 鎖 / 冠`

### 3.4 バナー

| ID | 名称 | ピックアップ | 種別 | 特徴 |
|---|---|---|---|---|
| `celestial` | 星辰祈願・限定 | ★5×1, ★4×3 | limited | 標準。50/50 |
| `eclipse` | 蝕月祈願・限定 | ★5×1, ★4×3 | limited | 闇属性寄り。同カウンタ |
| `eternal` | 常世祈願・恒常 | 無し | standard | 独立カウンタ。★5は全恒常から均等 |
| `stepup` | 星導ステップアップ | ★5×1 | stepup | 5段階。3段目★4確定、5段目**★5確定**。ループ |

### 3.5 経済

| 項目 | 値 |
|---|---|
| 通貨：星晶石 | 初期 30,000（＝20連分）|
| 単発 | 150 |
| 10連 | 1,500（割引なし） |
| デイリーボーナス | 600 ＋ 無料単発チケット1枚 |
| 重複 → 欠片 | ★1:1 / ★2:2 / ★3:5 / ★4:40 / ★5:200 |
| 交換所（欠片） | ★3=60 / ★4=400 / ★5=2000 で任意の1体と交換 |
| 交換所（祈刻） | 200枚 でピックアップ★5確定交換 |
| 実績 | 24種（初★5、3段昇格、天井到達、コンプ率、連続ログイン等）→ 星晶石報酬 |

---

## 4. 演出仕様（最重要）

### 4.1 StagePlan（演出プラン）のデータ構造

```js
{
  kind: 'single' | 'multi',
  results: [ {char, rarity, isNew, isPickup, shards} ],
  // 単発 or 10連の最後の1枚について：
  cue: {
    finalTier: 0..4,            // 到達するオーラ段階
    startTier: 0..4,            // 開始オーラ段階
    steps: [ {tier, at, sfx} ], // 昇格ステップ（0〜3段）
    rainbowConfirm: bool,       // 虹確定演出
    specialGate: null|'eclipse'|'astral', // 特殊ゲート（暗転など）
    cutIn: bool,
    cameraMove: 'static'|'push'|'orbit'|'slam',
    intensity: 0..1
  },
  backs: [ tier ],              // 10連のカード裏色（昇格前）
  backUpgrades: [ {index, toTier, at} ],
  order: [ ...indices ]         // めくり順（最良札を最後に）
}
```

### 4.2 昇格抽選の設計

結果のレアリティ `R` に対して、開始オーラ段階を抽選する。

| 到達段階 | ストレート | 1段昇格 | 2段昇格 | 3段昇格 |
|---|---|---|---|---|
| 白(0) | 100% | – | – | – |
| 青(1) | 82% | 18% | – | – |
| 銀(2) | 62% | 28% | 10% | – |
| 金(3) | 45% | 30% | 18% | 7% |
| **虹(4)** | **38%** | 27% | 20% | **15%** |

- ★5 の 15% が「白→青→銀→金→虹」級の大逆転になる（＝全体の 0.09%、約1100連に1回の伝説）。
- 昇格1段ごとに SFX を変える：
  1段目 `crackle`（バチッ）→ 2段目 `crackleHard`（ビキィッ）→ 3段目 `crackleFinal`（轟音＋合唱スタブ）
- 昇格前に必ず **120–260ms の「タメ」**（サブベースのみ / 映像ほぼ停止）。

### 4.3 単発シーケンス（タイムライン、目安 6.2秒 / ★5時 9.4秒）

| t(ms) | 映像 | 音 |
|---|---|---|
| 0 | ボタンが凹む→弾む、UIフェードアウト、ヴィネット閉じ | `uiConfirm` + BGM duck |
| 120 | 星辰儀がゆっくり回転開始、カメラ push in | 環境ドローン上昇 |
| 300 | 星晶石が指先から放たれ、陣の中心へ落下（トレイル付き） | `coinInsert` → `whoosh` |
| 700 | 着弾。衝撃波リング×3、粒子が外→内へ収束 | `impactSoft` + サブ |
| 900 | 魔法陣が点火。多重リングが逆回転、ルーンが1つずつ灯る | `charge` 開始（ライザー） |
| 900–2200 | 収束エネルギーが中心で球体に。徐々に明滅が速く | ライザーのピッチ上昇 + ハートビート |
| 2200 | **オーラ色の確定**（startTier の色に光が染まる） | 色ごとの `auraSet[tier]` |
| 2350+ | （昇格があれば）タメ → 破砕 → 次の色へ。段数分反復 | 無音 → `crackle` 系 |
| — | 最終段到達 | `tierBurst[finalTier]` |
| +0 | **解放**：白飛び1F、光柱、画面揺れ、色収差、ヒットストップ | `impactFull`（3層）＋和太鼓＋合唱 |
| +400 | （★5のみ）カットイン：紋章が横切る、速度線、名前スラム、「確定」印 | `fanfare` |
| +1200 | カードが飛来 → フリップ（3D）→ 枠が組み上がる | `cardFlip` + `frameLock` |
| +1500 | ★が1つずつ点灯 | `chimeArp`（★の数だけ上昇） |
| +1900 | ホロ箔スイープ、NEWバッジ、名前/称号/属性 | `holoSheen` + パッドコード |
| +2600 | 余韻：粒子が漂う。タップで結果へ | 環境に戻る |

### 4.4 10連シーケンス（目安 10〜14秒）

| フェーズ | 内容 |
|---|---|
| 射出 | 10個のオーブが扇状に打ち上がる（スタガー 45ms、ピッチ上昇するウーッシュ10連） |
| 天空爆散 | 上空で爆ぜる。星屑が降る |
| 配布 | 10枚のカードが弧を描いて着地。裏面色＝ヒント。着地音はピッチ±2半音ランダム |
| 裏面昇格 | 配り終え後、一部の裏が昇格（バチバチ）。虹裏が出たら BGM 停止 |
| めくり | タップでめくり。`一括めくり` / `スキップ` ボタン常設 |
| クライマックス | **最良札は必ず最後**。最後が★4/★5なら単発フル演出へ昇華（カットイン込み） |
| 結果 | グリッド表示、NEW、欠片、天井カウンタ更新のアニメ |

### 4.5 カメラ・ポストエフェクト

- `push`：FOV を詰める（scale 1.0→1.08、120ms ease-out）
- `orbit`：陣が斜めに傾き、視点が回り込む（★5のみ）
- `slam`：スラムズーム（1.35 → 1.0 を 180ms、back ease）
- シェイク：トラウマ加算式。`offset = maxOffset * trauma²`、`angle = maxAngle * trauma² * noise`、`trauma *= 0.90/frame`
- 色収差：`trauma` に比例して R/B を ±8px までずらす（post レイヤで合成）
- ヒットストップ：`timeScale = 0` を tier に応じ 0/25/45/75/110ms
- スローモー：★5開示直前 `timeScale = 0.25` を 220ms

---

## 5. 音響仕様

### 5.1 シグナルチェーン

```
[voice] → [voiceGain(env)] → [busSend(dry)] ┬→ [bus(sfx|ui|bgm)] → [master] → [limiter] → [dest]
                             [busSend(wet)] → [convolver(hall|room)] → [bus]
```

- `limiter`: DynamicsCompressor(threshold -6, knee 0, ratio 20, attack 0.003, release 0.12)
- `master`: 0.9
- バス: `bgm 0.55` / `sfx 0.85` / `ui 0.7`（設定で可変、localStorage 永続）
- リバーブ IR: 生成（hall 3.6s / room 0.45s / plate 1.4s）。ステレオ、プリディレイ 25ms。

### 5.2 効果音ライブラリ（全てプロシージャル、32種）

`ui.tap / ui.back / ui.hover / ui.confirm / ui.error / ui.toggle`
`gacha.coinInsert / gacha.whoosh / gacha.impactSoft / gacha.charge / gacha.heartbeat`
`gacha.auraWhite / gacha.auraBlue / gacha.auraSilver / gacha.auraGold / gacha.auraRainbow`
`gacha.crackle1 / gacha.crackle2 / gacha.crackle3 / gacha.silenceDrop`
`gacha.impactFull / gacha.taiko / gacha.orchHit / gacha.choirStab / gacha.choirSwell`
`gacha.shatter / gacha.pillar / gacha.cardDeal / gacha.cardFlip / gacha.frameLock`
`gacha.chimeStar / gacha.holoSheen / gacha.fanfare5 / gacha.fanfare4`
`meta.reward / meta.levelUp / meta.newBadge / meta.shardGain`

### 5.3 BGM

- キー：D エオリアン（荘厳さ）。BPM 72。
- レイヤー：`drone`（D1/A1）/ `pad`（4和音の緩やかな進行 i–VI–III–VII）/ `bell`（ランダムな鐘）/ `arp`（16分の分散）/ `tension`（短2度クラスタ）
- 画面ごとにレイヤーを出し入れ。演出中はダック。虹で完全停止 → 静寂 → 合唱。
- 結果画面では `resolve`（IV–V–i）の解決感。

---

## 6. フェーズ分割（実装順）

| # | フェーズ | 成果物 | 完了条件 |
|---|---|---|---|
| **P0** | 調査・設計 | `RESEARCH.md` `PLAN.md` `NOTES.md` | 本書 |
| **P1** | 基盤 | `util/*`, `game/state.js`, `index.html` 骨格, トークンCSS | `npm 無しで` ローカル起動、状態が保存される |
| **P2** | ガチャコア | `rarity/elements/catalog/banners/gacha/stagePlan` + テスト | 100万回試行でレート誤差 <2%、天井が必ず発火 |
| **P3** | 音響 | `audio/*` | 32種の SFX が鳴る。サウンドテスト画面で個別再生できる |
| **P4** | ビジュアルFX | `fx/*` | 星空・魔法陣・パーティクル・光柱・ポストFX が 60fps |
| **P5** | 演出ディレクター | `ui/summon.js`, `summon.css`, `effects.css` | 単発/10連の全シーケンスが音と同期して再生・スキップ可能 |
| **P6** | UI・メタ | 各画面、提供割合、履歴、交換所、実績、設定 | チェックリスト（RESEARCH §7）を全て満たす |
| **P7** | 評価と改善 | `REVIEWS.md` | 別エージェント視点のレビュー → 実装 → 再レビュー（反復） |

各フェーズ終了時に **コミット**。P7 は反復ごとにコミット。

---

## 7. 品質ゲート（各フェーズで必ず確認）

1. **60fps**：`requestAnimationFrame` の実測。ローエンド想定でパーティクル上限を自動調整。
2. **音ズレ 10ms 以内**：音は `ctx.currentTime` 予約、映像は RAF。演出の節目は音基準で同期。
3. **入力レイテンシ**：押下 → 視覚反応 1フレーム、音 50ms 以内。
4. **リーク無し**：画面遷移で RAF・AudioNode・イベントを必ず解除。
5. **セーブ堅牢性**：壊れた JSON / 旧バージョンでもクラッシュせず復旧。
6. **アクセシビリティ**：reduced-motion、PSE 配慮、色以外の冗長表現、キーボード操作。
7. **オフライン**：外部リクエスト 0（DevTools Network が空であること）。
