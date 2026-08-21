# Trade Journal Web — Codex 开发规格书

> 工作名称：Trade Journal  
> 定位：本地运行的个人股票交易复盘、数据分析与历史情景预测工具
> 核心目标：在 K 线图上记录手工 B/S（Buy/Sell）点，分析这些交易点与当时历史价格结构之间的关系，验证交易发生后的结果，并比较月度定投的冻结历史情景与真实含费收益。
> 永久边界：只做数据记录、计算、回测、预测和复盘；不做交易下单、不接订单路由、不做自动或半自动交易。第一阶段同时不做券商账户同步、Docker 和多人 SaaS。

---

## 1. Codex 总体任务

请从零实现一个可在 macOS 本地运行的 Web 应用。

系统必须围绕以下主路径设计：

1. 搜索/添加股票。
2. 获取或导入日 K OHLCV 数据。
3. 在 K 线上人工添加 Buy / Sell 点。
4. 保存真实成交价格、数量、手续费、理由、标签和备注。
5. 点击任意 B/S 点时，分析“交易发生当时”它相对于历史点位的位置。
6. 将“当时可知道的历史上下文”和“交易发生后的结果验证”严格分开。
7. 对多个历史 B/S 点进行横向统计，帮助用户判断自己的买卖习惯和执行质量。
8. 按账户和自然月合并真实买入，在 K 线中比较只使用买入日前数据生成的历史情景区间与实际含费收益曲线。
9. 本地持久化，重启程序数据不丢失。

不要把项目做成 TradingView 克隆，也不要把 MVP 做成完整证券终端。

---

# 2. 产品核心思想

系统的价值不是单纯记录：

- 什么时候买；
- 什么时候卖；
- 赚了多少钱。

更重要的是回答：

### 买点分析

- 买入位置是否靠近历史支撑？
- 是否已经接近前高？
- 当前价格处于过去 20/60/120/250 个交易日区间的什么位置？
- 距离最近一个有效 Swing Low 多远？
- 距离最近 Swing High 多远？
- 是突破买入、回踩买入、追高买入还是低位买入？
- 买入时离 MA20 / MA60 多远？
- 当时是否明显偏离均线？
- 成交量相对过去 20 日均量是否放大？
- 波动率是否异常？

### 卖点分析

- 是否卖在历史压力位附近？
- 是否在突破前高之前卖出？
- 是否卖在 MA20 / MA60 下破位置？
- 卖出后是否继续大涨？
- 是否存在明显“卖飞”？
- 是否及时止损？
- 卖出位置相对过去 60/120/250 日区间在哪里？

### 长期复盘

系统最终要能够回答：

- 我的买点通常处于什么位置？
- 我的盈利交易买点有什么共同特征？
- 我的亏损交易买点有什么共同特征？
- 我经常追高吗？
- 我是否经常买在前高附近？
- 我是否习惯过早卖出？
- 我的止损是否有效？
- 哪类买点胜率最高？
- 哪类卖点最容易卖飞？

---

# 3. 非目标

以下能力永久不实现：

- 实盘交易；
- 自动下单；
- 半自动下单；
- 订单创建、提交、路由或撤单；
- 券商登录；

第一阶段同时不要实现：

- Level 2；
- 逐笔成交；
- 分钟级高频行情；
- WebSocket 实时行情；
- AI 自动荐股；
- 确定性股价预测、收益承诺或直接买卖指令；
- 复杂量化回测框架；
- Redis；
- Kafka；
- Elasticsearch；
- 微服务；
- Docker；
- Kubernetes；
- 多租户；
- 复杂权限系统。

允许实现的“预测”仅指：使用买入日前的本地历史日线生成可审计的统计情景区间，必须展示样本数、分位区间、算法版本、数据截止日和不确定性，并与后续真实含费收益进行校准。该结果不是订单建议，也不得触发任何交易动作。

---

# 4. 技术栈

优先保持依赖少、启动简单、代码容易维护。

## Frontend / Full Stack

- Next.js App Router
- React
- TypeScript
- Tailwind CSS

## Chart

- Lightweight Charts 5.x

用于：

- Candlestick Series
- Volume Pane
- Series Markers
- Price Lines
- Crosshair
- Tooltip
- 可见时间区间控制

不要引入完整 TradingView Charting Library。

## Local Database

- SQLite
- Drizzle ORM
- better-sqlite3

SQLite 文件默认保存：

```text
./data/trade-journal.db
```

`data/` 加入 `.gitignore`。

## 其他依赖

仅在确有必要时引入：

- zod
- lucide-react
- decimal.js
- clsx / tailwind-merge

不要安装大型 UI 框架。

UI 组件优先在项目内部实现：

```text
components/ui/
```

包括：

- Button
- Card
- Input
- Select
- Dialog
- Sheet
- Tabs
- Badge
- Tooltip
- SegmentedControl
- EmptyState
- Skeleton
- Toast

如果某个复杂无障碍组件自行实现成本明显过高，可以只引入对应单个轻量 primitive，不要安装整套重型组件库。

---

# 5. 本地运行方式

目标：

```bash
npm install
npm run db:migrate
npm run dev
```

浏览器访问：

```text
http://localhost:3000
```

要求：

- 不依赖 Docker。
- 不依赖远程数据库。
- SQLite 自动创建。
- `.env.local` 保存行情 API Key。
- 提供 `.env.example`。

---

# 6. 页面结构

第一版只需要以下页面：

```text
/
 /stocks
 /stocks/[symbol]
 /trades
 /analytics
 /settings
```

左侧导航：

```text
Overview
Stocks
Trades
Analytics
Settings
```

避免过多一级导航。

---

# 7. UI 设计要求

整体风格：

- macOS 原生应用感；
- 专业金融工具感；
- 极简；
- 高信息密度但不拥挤；
- 默认深色模式；
- 同时支持浅色模式；
- 避免传统后台管理系统风格；
- 避免大面积渐变；
- 避免发光霓虹；
- 避免粗重边框；
- 避免滥用卡片。

## 页面基调

背景：

```text
深灰 / charcoal
```

Panel：

```text
轻微高于背景
```

分割：

```text
1px 低对比度 border
```

圆角：

```text
8px ~ 12px
```

字体：

```text
系统字体优先
-apple-system
BlinkMacSystemFont
Inter fallback
```

## 涨跌颜色

颜色必须通过 CSS Token 管理。

默认：

```text
上涨：绿色
下跌：红色
```

设置中允许切换为 A 股习惯：

```text
上涨：红色
下跌：绿色
```

Buy / Sell 点颜色不能仅依赖颜色区分：

```text
Buy = B + 向上符号
Sell = S + 向下符号
```

保证颜色识别障碍时仍可理解。

---

# 8. 首页 Overview

首页不是行情首页，而是复盘概览。

结构：

```text
┌──────────────────────────────────────────────┐
│ Trade Journal                Search          │
├──────────────────────────────────────────────┤
│ Recent Activity                              │
│                                              │
│ B 01810.HK  54.20                            │
│ S NVDA      186.50                           │
├──────────────────────┬───────────────────────┤
│ Buy Quality          │ Sell Quality          │
│ 最近20个买点          │ 最近20个卖点           │
├──────────────────────┴───────────────────────┤
│ Stocks                                      │
│                                              │
│ Xiaomi / NVDA / QQQ ...                     │
└──────────────────────────────────────────────┘
```

第一版首页可简单，不要把开发资源集中在 Dashboard。

---

# 9. 股票详情页：核心页面

URL：

```text
/stocks/[symbol]
```

这是整个系统最重要的页面。

桌面布局：

```text
┌─────────────────────────────────────────────────────────────┐
│ Xiaomi 01810.HK        54.20       +1.8%       + Record     │
├─────────────────────────────────────────────────────────────┤
│ 1D   MA20 MA60   Levels   B/S   Analysis                   │
├───────────────────────────────────────────┬─────────────────┤
│                                           │ Trade Inspector │
│                                           │                 │
│               K LINE                      │ Selected B/S    │
│                                           │                 │
│      B          B              S           │ Context         │
│      ↑          ↑              ↓           │ Outcome         │
│                                           │ Notes           │
│                                           │                 │
├───────────────────────────────────────────┴─────────────────┤
│ Volume                                                     │
├─────────────────────────────────────────────────────────────┤
│ Trade Timeline / Historical B/S                            │
└─────────────────────────────────────────────────────────────┘
```

当没有选择 B/S 点时：

右侧显示：

- 当前区间位置；
- 最近支撑；
- 最近压力；
- MA；
- 当前行情概况。

选择 B/S 点后：

右侧切换成 Trade Inspector。

---

# 10. K 线要求

第一版仅：

```text
1D
```

暂时不要：

```text
1m
5m
15m
30m
1h
```

需要支持：

- 蜡烛图；
- 成交量；
- Crosshair；
- 自适应宽高；
- 鼠标滚轮缩放；
- 拖动时间轴；
- Reset View；
- Fit Content；
- Price Tooltip；
- 日期 Tooltip；
- B/S Marker；
- 自动支撑/压力线；
- 手工水平线；
- MA5 / MA10 / MA20 / MA60 / MA120 / MA250 开关。

默认只开启：

```text
MA20
MA60
```

避免画面过乱。

---

# 11. B/S 点交互

## 添加方式一

页面右上：

```text
+ Record Trade
```

## 添加方式二

右键 K 线：

```text
Record Buy
Record Sell
Add Note
Add Manual Level
```

如果右键某根日 K：

自动带入：

- symbol；
- trade date；
- 当日 OHLC；
- 默认成交价使用 close，但必须允许修改。

## Buy Marker

显示：

```text
 B
 ↑
```

位于 K 线下方。

## Sell Marker

显示：

```text
 ↓
 S
```

位于 K 线上方。

Marker 不直接堆太多文字。

Hover 显示：

```text
BUY
2026-08-18
54.20 HKD
500 shares
```

点击后右侧 Inspector 展开完整信息。

## 同日多笔交易

如果同一交易日存在多笔：

```text
B × 3
```

点击展开：

```text
09:42 BUY 100 @ 53.80
10:31 BUY 200 @ 54.10
14:20 BUY 200 @ 54.35
```

第一版即使只有日 K，也保留真实成交时间字段。

---

# 12. Record Trade 表单

字段：

```text
Symbol
Side
Trade Date
Trade Time
Price
Quantity
Fee
Currency

Strategy
Tags

Reason
Plan
Note
```

Strategy 第一版：

```text
Breakout
Pullback
Support
Mean Reversion
Trend
Earnings
Stop Loss
Take Profit
Manual
```

允许自定义。

## 可选计划字段

Buy 时：

```text
plannedStop
plannedTarget
```

Sell 时：

```text
exitReason
```

---

# 13. 数据模型

## instruments

```text
id
symbol
name
exchange
market
currency
timezone
dataProvider
providerSymbol
createdAt
updatedAt
```

---

## candles

```text
id
instrumentId
interval
timestamp
open
high
low
close
volume
source
adjustment
createdAt
updatedAt
```

唯一索引：

```text
instrumentId + interval + timestamp + adjustment
```

行情价格可使用 REAL。

---

## trades

交易数据需要避免 JS 浮点金额误差。

推荐将以下字段保存为 decimal string：

```text
price
quantity
fee
```

字段：

```text
id
instrumentId

side              BUY | SELL
tradeAt
tradeDate

price
quantity
fee
currency

strategyId nullable

reason
plan
note

plannedStop nullable
plannedTarget nullable

createdAt
updatedAt
```

---

## tags

```text
id
name
createdAt
```

---

## trade_tags

```text
tradeId
tagId
```

---

## strategies

```text
id
name
description
createdAt
```

---

## manual_levels

用于维护用户当前有效或已归档的关键价位。所有生效日由服务端根据当时最新行情锁定，不允许客户端把后来判断回填到过去。

```text
id
instrumentId
price
type

SUPPORT
RESISTANCE
CUSTOM

label
startDate nullable
endDate nullable
note
createdAt
```

## manual_level_versions

保存价格位的不可变审计历史。创建、修改、归档和恢复都追加版本，不覆盖既有判断。

```text
id
manualLevelId
revision
action

CREATED
UPDATED
ARCHIVED
RESTORED

price
type
label
note
effectiveDate
recordedAt
```

K 线按相邻版本的 `effectiveDate` 切分价格线区间。验证只能使用当前版本生效后的数据，至少展示触及次数、首次触及、首次破位及首次触及后 5/20/60 个交易日的价格表现。价格位不是订单或交易信号。

---

## trade_analysis_snapshots

非常重要。

保存“交易当时”的分析快照。

```text
id
tradeId

analysisVersion

price

range20High
range20Low
range20Percentile

range60High
range60Low
range60Percentile

range120High
range120Low
range120Percentile

range250High
range250Low
range250Percentile

ma5
ma10
ma20
ma60
ma120
ma250

distanceToMa20Pct
distanceToMa60Pct

atr14
atrPercent

volume
avgVolume20
volumeRatio20

nearestPriorPivotHigh
distanceToPivotHighPct
pivotHighDate

nearestPriorPivotLow
distanceToPivotLowPct
pivotLowDate

daysSince20High
daysSince20Low

createdAt
```

注意：

这个表只能使用：

```text
timestamp <= tradeDate
```

的数据计算。

严禁读取未来 K 线。

---

## trade_outcomes

保存事后表现。

```text
id
tradeId

return1d
return3d
return5d
return10d
return20d
return60d

mfe5d
mae5d

mfe20d
mae20d

maxHigh20d
minLow20d

sellMissedGain20d nullable
buyValidationScore nullable

calculatedThrough
updatedAt
```

Outcome 允许读取交易之后的数据。

必须与 Snapshot 分开。

---

# 14. 历史点位算法

这是系统核心之一。

不要一开始加入复杂 AI。

先使用可解释规则。

---

## 14.1 Rolling Range

对于交易日 T：

分别计算过去：

```text
20
60
120
250
```

个交易日：

```text
rollingHigh
rollingLow
```

并计算交易价格在区间的位置：

```text
rangePercentile =
(price - rollingLow)
/
(rollingHigh - rollingLow)
```

结果映射：

```text
0%   = 区间最低附近
50%  = 区间中部
100% = 区间最高附近
```

UI 示例：

```text
60D Range

Low                           High
──────────────●────────────────
              72%

38.20                       56.80
```

---

# 14.2 Prior High / Prior Low

计算交易发生前：

```text
20D High
60D High
120D High
250D High

20D Low
60D Low
120D Low
250D Low
```

展示距离：

```text
距离 60 日前高：-2.8%
距离 60 日前低：+18.2%
```

注意这里的 High/Low 必须是：

```text
tradeDate 之前或当天当时可见的历史数据
```

日 K MVP 下，默认采用交易日前一完整交易日完成分析。

如果交易发生当天还没有收盘，不能把当天最终 High/Low 当成交易时已知数据。

因此 Snapshot 默认基于：

```text
previous completed trading day
```

这是第一版最安全的做法。

---

# 14.3 Swing High / Swing Low

第一版使用简单 Pivot 算法。

默认：

```text
left = 3
right = 3
```

Pivot High：

当前 High 大于左右各 3 根 K 的 High。

Pivot Low：

当前 Low 小于左右各 3 根 K 的 Low。

但是进行交易时点分析时：

一个 pivot 必须在交易发生前已经被确认。

因此：

```text
pivotDate + right bars <= tradeDate
```

否则不能作为“当时已知支撑/压力”。

输出：

```text
nearestPriorPivotHigh
nearestPriorPivotLow
```

以及距离百分比。

---

# 14.4 Support / Resistance

第一版来源：

```text
自动 Pivot
+
用户手工 Level
```

右侧 Inspector 显示：

```text
Nearest Resistance
55.30
+2.03%

Nearest Support
51.80
-4.42%
```

不需要一开始实现复杂聚类支撑阻力算法。

第二阶段再考虑将多个 pivot 聚类成价格区域。

---

# 14.5 Moving Average

实现：

```text
SMA 5
SMA 10
SMA 20
SMA 60
SMA 120
SMA 250
```

交易分析重点：

```text
distanceToMa20Pct
distanceToMa60Pct
```

例如：

```text
Price vs MA20  +7.8%
Price vs MA60 +14.2%
```

用于识别追高。

---

# 14.6 ATR

实现：

```text
ATR 14
```

用途：

判断：

- 当前波动；
- 买点离支撑多少个 ATR；
- 止损是否过紧；
- B/S 点是否处于异常波动状态。

第一版只展示：

```text
ATR14
ATR%
```

---

# 14.7 Volume Context

计算：

```text
volumeRatio20 =
todayVolume / avgVolume20
```

交易 Snapshot 默认使用交易日前一完整交易日的数据。

显示：

```text
20D Volume Ratio
1.82x
```

---

# 15. B 点分析面板

选择 Buy Marker 后：

```text
BUY
54.20
2026-08-18

Historical Context
────────────────────

20D Range       84%
60D Range       72%
120D Range      61%
250D Range      55%

Nearest Pivot High
55.30
-1.99%

Nearest Pivot Low
49.80
+8.84%

MA20
51.20
+5.86%

MA60
47.80
+13.39%

Volume Ratio
1.62x

ATR14
1.85
3.41%
```

然后自动给出“规则型标签”。

例如：

```text
Near 60D High
Above MA20
Near Resistance
High Volume
Extended From MA60
```

不要生成投资建议。

只描述事实。

---

# 16. S 点分析面板

例如：

```text
SELL
62.10
2026-09-02

Historical Context
────────────────────

60D Range      96%

Nearest Resistance
63.00
+1.45%

MA20
57.30
+8.38%

From Entry
+14.58%
```

事后区域：

```text
Outcome
────────────────────

5D After Sell
+3.8%

20D After Sell
+11.2%

Max High After Sell 20D
71.80

Missed Upside
+15.62%
```

此处可以标记：

```text
Possible Early Exit
```

但不要写：

```text
卖错了
```

因为交易计划、风险偏好等因素不同。

---

# 17. Outcome 分析

这是和历史点位分析同等重要的模块。

## Buy Outcome

针对每个 BUY：

计算之后：

```text
1D
3D
5D
10D
20D
60D
```

收益。

定义：

```text
returnNd =
closeAfterNTradingDays / buyPrice - 1
```

同时计算：

### MFE

Maximum Favorable Excursion

```text
max(high after trade) / buyPrice - 1
```

### MAE

Maximum Adverse Excursion

```text
min(low after trade) / buyPrice - 1
```

例如：

```text
20D MFE  +18.3%
20D MAE   -4.2%
```

非常适合分析买点质量。

---

## Sell Outcome

针对 SELL：

计算卖出之后：

```text
5D
10D
20D
```

涨跌。

以及：

```text
20D 后最高价
```

定义：

```text
missedUpside =
maxHigh20d / sellPrice - 1
```

用来分析过早卖出。

注意：

这不是评价交易正确/错误，只是量化“卖出后的市场继续空间”。

---

# 18. Buy Quality

不要第一版就做“AI 评分”。

实现透明的规则评分。

默认 100 分制仅作为辅助。

可以拆成：

```text
Historical Position  30
Trend Context        20
Support Distance     20
Volume Context       10
Post Trade Outcome   20
```

但是：

```text
Historical Score
```

和：

```text
Outcome Score
```

必须分开显示。

禁止用未来 Outcome 修改 Historical Score。

更推荐 UI：

```text
Entry Context
Good / Neutral / Extended

Outcome
Validated / Mixed / Failed
```

并且允许在 Settings 关闭评分。

---

# 19. 历史 B/S 横向比较

股票详情页底部：

```text
Historical Trades
```

表格：

| Date | Side | Price | 60D Position | Pivot Distance | MA20 Dist | Volume | 20D Outcome |
|---|---|---:|---:|---:|---:|---:|---:|
| 08-01 | B | 48.2 | 41% | +1.2% support | -0.8% | 1.3x | +12.3% |
| 08-18 | B | 54.2 | 84% | -2.0% resistance | +5.9% | 1.6x | -3.8% |

点击一行：

- K 线自动跳转；
- 聚焦对应日期；
- 打开 Trade Inspector。

---

# 20. Analytics 页面

第一阶段不要做复杂图表。

必须包含：

## Buy Analysis

```text
Buy Trades
Average 20D Return
Median 20D Return
Win Rate 20D
Average MFE20
Average MAE20
```

### 按 60D Range Position 分组

```text
0-25%
25-50%
50-75%
75-100%
```

展示：

```text
交易次数
平均20D收益
胜率
MFE
MAE
```

这样用户能看到：

“我买在历史高位时是否表现更差？”

---

## Distance to MA20

分组：

```text
< -5%
-5% ~ 0
0 ~ +5%
+5% ~ +10%
> +10%
```

统计：

```text
Count
20D Return
Win Rate
MFE
MAE
```

用于判断追高。

---

## Distance to Resistance

分组：

```text
0 ~ 2%
2 ~ 5%
5 ~ 10%
> 10%
```

分析买在压力位附近的效果。

---

## Sell Analysis

统计：

```text
Average 20D Missed Upside
Median Missed Upside
Sell Near Resistance %
Sell Below MA20 %
```

---

# 21. 交易配对与持仓

MVP 可以支持 FIFO。

根据：

```text
symbol + account
```

将 BUY 和 SELL 配对。

第一版暂时只做一个默认账户：

```text
Default
```

但数据库可以预留：

```text
accountId
```

计算：

- 当前数量；
- 平均成本；
- 已实现收益；
- 未实现收益。

但是：

**不要让持仓计算阻塞核心 B/S 分析开发。**

优先级：

```text
B/S + Historical Analysis
>
Portfolio Accounting
```

---

# 22. Market Data Provider

必须定义接口：

```ts
export interface MarketDataProvider {
  searchInstruments(query: string): Promise<InstrumentSearchResult[]>

  getCandles(params: {
    symbol: string
    interval: '1day'
    start?: string
    end?: string
  }): Promise<Candle[]>
}
```

业务层只依赖：

```text
MarketDataProvider
```

禁止：

```text
页面组件直接调用 Twelve Data
```

---

# 23. 第一版行情 Provider

实现：

```text
TwelveDataProvider
CsvProvider
MockProvider
```

## TwelveDataProvider

通过：

```text
TWELVE_DATA_API_KEY
```

读取。

用途：

- 美股；
- 支持范围内标的；
- 开发验证。

注意：

不要假设免费 API 一定覆盖所有港股。

如果 API 返回：

```text
symbol unavailable
plan not supported
quota exceeded
```

必须以正常 UI Error State 呈现。

---

## CsvProvider

这是第一版必须有的 fallback。

允许导入标准 CSV：

```csv
date,open,high,low,close,volume
2026-08-17,52.10,53.40,51.80,52.90,182938200
```

用户可以：

```text
Settings
→ Import Market Data
```

或者股票页面：

```text
Import CSV
```

同一个 symbol 的数据执行 upsert。

---

## MockProvider

用于：

- UI 开发；
- 单元测试；
- 无 API Key 情况。

提供：

```text
AAPL
NVDA
01810.HK
```

的 fixture 数据。

fixture 不能冒充实时数据，UI 必须显示：

```text
Demo Data
```

---

# 24. 数据同步策略

第一版不要定时任务。

采用：

```text
打开股票
↓
检查数据库最后日期
↓
用户点击 Refresh
↓
Provider 请求缺失区间
↓
Upsert SQLite
```

顶部显示：

```text
Updated: 2026-08-18
Refresh
```

以后再增加自动更新。

---

# 25. API / Server Actions

推荐保持简单。

可以使用 Route Handlers：

```text
GET    /api/instruments/search
GET    /api/instruments/:id/candles

POST   /api/trades
PATCH  /api/trades/:id
DELETE /api/trades/:id

POST   /api/trades/:id/recalculate

POST   /api/market/refresh
POST   /api/market/import

GET    /api/analytics/buys
GET    /api/analytics/sells
```

所有 DB / Provider 调用只能运行在 server side。

API Key 绝不能发送到浏览器。

---

# 26. Analysis Service

目录：

```text
src/lib/analysis/
```

拆分：

```text
moving-average.ts
atr.ts
rolling-range.ts
pivot.ts
volume.ts
trade-context.ts
trade-outcome.ts
trade-pairing.ts
```

核心函数：

```ts
analyzeTradeContext(trade, historicalCandles)
```

要求：

传入的历史 candles 已经在 Service 层过滤：

```text
<= analysisCutoff
```

防止未来数据泄漏。

返回：

```ts
TradeContextSnapshot
```

---

# 27. Analysis Cutoff

这个规则必须写测试。

对于日 K：

如果交易日期：

```text
2026-08-19
```

默认 Snapshot cutoff：

```text
2026-08-18 的收盘数据
```

也就是说：

第一版不使用交易当天最终日 K 去分析交易发生当时的状态。

原因：

用户可能上午买入，而当天 High / Low / Close 尚未形成。

未来如果接入分钟线，再实现真正的 intraday cutoff。

---

# 28. Pivot Lookahead 防护

Pivot 使用：

```text
left = 3
right = 3
```

例如：

```text
08-01
```

可能是 Pivot High。

但是直到：

```text
08-06
```

左右 K 线形成后它才被确认。

因此在：

```text
08-02
```

发生的交易中：

不能把 08-01 当成已经确认的 Pivot High。

测试必须覆盖该情况。

---

# 29. K 线上的辅助图层

用户可以独立开关：

```text
B/S Points
Moving Averages
Auto Levels
Manual Levels
Position Range
```

默认：

```text
B/S ON
MA20 ON
MA60 ON
Auto Levels ON
Manual Levels ON
```

Auto Levels 只显示：

```text
最近 2 个 Pivot High
最近 2 个 Pivot Low
```

避免画面污染。

---

# 30. Trade Inspector 信息架构

Tabs：

```text
Context
Outcome
Journal
```

## Context

只显示交易当时可知信息。

## Outcome

只显示之后的数据。

## Journal

显示：

```text
Reason
Plan
Note
Tags
```

这样用户可以非常明确地区分：

```text
当时为什么买
vs
后来发生了什么
```

---

# 31. Journal 对照复盘

一个非常重要的 UX：

在 Outcome 页顶部仍显示：

```text
Original Plan
```

例如：

```text
Stop: 50.00
Target: 62.00

Reason:
回踩 MA20 后放量企稳。
```

下面显示实际：

```text
MAE20: -2.8%
MFE20: +16.2%
```

用户可以判断：

计划是否合理。

---

# 32. 手工关键价位

用户可以在 K 线上：

```text
右键
→ Add Manual Level
```

填写：

```text
Price
Type
Label
Note
```

例如：

```text
54.80
Resistance
前期平台顶部
```

交易分析时，也计算：

```text
distanceToNearestManualResistance
distanceToNearestManualSupport
```

因为用户自己认为重要的点位往往比纯算法更有复盘意义。

---

# 33. Search

第一版搜索体验：

顶部：

```text
Search symbol...
```

输入：

```text
NVDA
AAPL
01810
```

显示 Provider 搜索结果。

如果 Provider 不支持：

允许：

```text
Create Instrument Manually
```

字段：

```text
Symbol
Name
Market
Exchange
Currency
Provider Symbol
```

然后可以通过 CSV 导入数据。

---

# 34. Settings

只做：

```text
Appearance
Market Data
Chart
Analysis
Data
```

## Appearance

```text
Dark
Light
System
```

```text
Global green/red
China red/green
```

## Market Data

```text
Provider
API Key status
Test Connection
```

## Chart

```text
Default MA
Candle colors
Volume
```

## Analysis

```text
Pivot Left
Pivot Right

Range Windows
20 / 60 / 120 / 250

Outcome Windows
1 / 3 / 5 / 10 / 20 / 60
```

## Data

```text
Export Trades JSON
Import Trades JSON
Export Database Backup
```

第一版至少实现：

```text
Export Trades JSON
Import Trades JSON
```

---

# 35. 性能要求

个人本地工具，不做过度优化。

但必须：

- Chart component 使用 dynamic import / client boundary。
- 不要每次 mousemove 触发 React 全页面 render。
- Crosshair tooltip 使用局部状态或 DOM ref。
- 对 candles 做 memoization。
- Analysis 在服务端计算。
- SQLite 建索引。
- K 线一次加载默认 3~5 年日 K。
- 用户向左滚动时可选再加载更早历史。
- 不要加载几十年分钟数据。

目标：

```text
5000 根日 K
+
数百 B/S Marker
```

仍保持流畅。

---

# 36. 响应式

目标优先级：

```text
Desktop > Tablet > Mobile
```

桌面为主。

>= 1280px：

```text
Chart + Right Inspector
```

< 1280px：

Inspector 改为 Bottom Sheet。

< 768px：

允许查看，但不要求完整桌面操作体验。

---

# 37. 空状态

必须认真设计。

例如没有交易：

```text
No trades recorded

Your B/S points will appear directly on the chart.

[Record first trade]
```

没有行情：

```text
No market data

Connect a provider or import OHLCV CSV.

[Refresh] [Import CSV]
```

不能只显示空白页面。

---

# 38. Error Handling

Provider 错误统一：

```ts
MarketDataError
```

类型：

```text
AUTH
RATE_LIMIT
SYMBOL_NOT_FOUND
PLAN_RESTRICTED
NETWORK
INVALID_RESPONSE
UNKNOWN
```

UI 显示用户能理解的信息。

例如：

```text
This symbol isn't available with the current data plan.

Import CSV or switch provider.
```

不要把 API 原始错误堆栈直接展示。

---

# 39. 测试

必须使用自动测试覆盖核心算法。

重点不是 UI snapshot。

至少测试：

## rolling-range

- 20D high/low
- percentile
- high == low

## moving average

- SMA
- insufficient candles

## ATR

- True Range
- ATR14

## Pivot

- pivot high
- pivot low
- left/right
- future confirmation protection

## Snapshot

确保：

```text
未来 candle 永远不会进入 Historical Context
```

这是最高优先级测试。

## Outcome

测试：

```text
1D / 5D / 20D
MFE
MAE
```

## Pairing

测试：

```text
BUY
BUY
SELL
SELL
```

FIFO。

---

# 40. Seed / Demo

提供：

```bash
npm run seed
```

生成：

```text
Demo Stock
500 ~ 800 根日 K
5 个 BUY
4 个 SELL
2 条 Manual Level
```

首次启动如果数据库为空：

可以显示：

```text
Load Demo Workspace
```

便于快速体验整个产品。

---

# 41. 推荐目录

```text
trade-journal/
├─ src/
│  ├─ app/
│  │  ├─ page.tsx
│  │  ├─ stocks/
│  │  ├─ trades/
│  │  ├─ analytics/
│  │  ├─ settings/
│  │  └─ api/
│  │
│  ├─ components/
│  │  ├─ chart/
│  │  │  ├─ StockChart.tsx
│  │  │  ├─ TradeMarkers.ts
│  │  │  ├─ MovingAverageOverlay.ts
│  │  │  ├─ LevelOverlay.ts
│  │  │  └─ ChartTooltip.tsx
│  │  │
│  │  ├─ trades/
│  │  │  ├─ TradeForm.tsx
│  │  │  ├─ TradeInspector.tsx
│  │  │  ├─ ContextPanel.tsx
│  │  │  ├─ OutcomePanel.tsx
│  │  │  └─ TradeTimeline.tsx
│  │  │
│  │  ├─ analytics/
│  │  └─ ui/
│  │
│  ├─ db/
│  │  ├─ schema.ts
│  │  ├─ index.ts
│  │  └─ migrations/
│  │
│  ├─ lib/
│  │  ├─ analysis/
│  │  ├─ market-data/
│  │  │  ├─ types.ts
│  │  │  ├─ provider.ts
│  │  │  ├─ twelve-data.ts
│  │  │  ├─ csv.ts
│  │  │  └─ mock.ts
│  │  ├─ trades/
│  │  ├─ decimal.ts
│  │  └─ utils.ts
│  │
│  └─ types/
│
├─ data/
├─ drizzle/
├─ public/
├─ tests/
├─ .env.example
├─ drizzle.config.ts
├─ package.json
└─ README.md
```

---

# 42. 开发阶段

Codex 必须按阶段实现。

## Phase 1 — Foundation

完成：

- Next.js
- Tailwind
- SQLite
- Drizzle
- Layout
- Theme
- Demo seed

验收：

```text
npm install
npm run db:migrate
npm run seed
npm run dev
```

可以运行。

---

## Phase 2 — Chart

完成：

- 股票详情页；
- 日 K；
- Volume；
- MA20 / MA60；
- Crosshair；
- Tooltip；
- Responsive chart。

验收：

Demo K 线正确显示。

---

## Phase 3 — B/S

完成：

- Record Trade；
- Edit；
- Delete；
- B/S Marker；
- Hover；
- Click；
- Inspector；
- 同日聚合。

验收：

创建 BUY 后立即出现在对应日期 K 线上。

刷新页面仍存在。

---

## Phase 4 — Historical Context

完成：

- Rolling Range；
- SMA；
- ATR；
- Pivot；
- support/resistance；
- Snapshot；
- Context Panel。

验收：

任意 BUY / SELL 都能看到：

```text
20/60/120/250D position
MA20
MA60
nearest pivot high
nearest pivot low
volume ratio
ATR
```

---

## Phase 5 — Outcome

完成：

- future return；
- MFE；
- MAE；
- sell missed upside；
- Outcome Panel。

验收：

Context 与 Outcome 清晰分离。

---

## Phase 6 — Analytics

完成：

- Buy statistics；
- range percentile grouping；
- MA20 distance grouping；
- resistance distance grouping；
- Sell missed upside。

---

## Phase 7 — Market Provider

完成：

- Provider interface；
- Twelve Data；
- CSV；
- Mock；
- Refresh；
- provider error handling。

不要在 Phase 7 之前让第三方 API 阻塞核心功能。

---

# 43. 第一版验收场景

Codex 完成后必须自行验证：

## 场景 1

用户打开：

```text
01810.HK
```

看到 3 年日 K。

## 场景 2

在：

```text
2026-08-10
```

添加：

```text
BUY
price 50
qty 500
```

立即出现 B Marker。

## 场景 3

点击 B：

显示：

```text
60D Range Position
MA20 Distance
MA60 Distance
Nearest Pivot High
Nearest Pivot Low
Volume Ratio
ATR
```

## 场景 4

确认这些 Historical Context 数据没有使用 08-10 之后的 K 线。

## 场景 5

有足够未来数据后：

Outcome 显示：

```text
5D Return
20D Return
MFE20
MAE20
```

## 场景 6

创建 SELL。

点击后：

显示：

```text
20D Missed Upside
```

## 场景 7

Analytics 可以比较：

```text
买在 60D 高位
vs
买在 60D 低位
```

的历史表现。

---

# 44. UX 最重要的三个页面状态

## Normal

查看股票和 K 线。

## Trade Selected

右侧强调：

```text
Context
Outcome
Journal
```

## Compare Mode

第二阶段可以加入：

```text
Compare B/S
```

一次选择多个 BUY Marker。

右侧显示：

```text
Avg 60D Position
Avg MA20 Distance
Avg 20D Outcome
```

MVP 可以暂不实现 Compare Mode，但数据结构不能阻止后续增加。

---

# 45. 后续扩展

MVP 完成后再考虑：

## V1.1

- Futu Provider；
- 港股数据；
- Account；
- FIFO 完整持仓；
- 成本线；
- 已实现/未实现盈亏。

## V1.2

- 交易截图；
- 自定义 Strategy；
- Strategy Analytics；
- 手工复盘模板。

## V1.3

- 分钟 K；
- 盘中精确 B/S；
- Intraday Context。

## V1.4

- 自动识别常见交易行为：
  - breakout buy
  - pullback buy
  - chase
  - early sell
  - stop loss
  - support buy

所有识别必须可解释。

## V2

再考虑 AI。

AI 只能基于已经计算出的客观数据和用户自己的交易日志做总结，不直接预测股价。

---

# 46. Codex 编码原则

1. 先完成可运行版本，再迭代。
2. 不为了“架构漂亮”创建多余抽象。
3. Market Provider 必须抽象。
4. Analysis 算法必须是纯函数优先。
5. 历史上下文禁止未来数据。
6. 所有核心算法必须测试。
7. UI 不要像传统 Admin Dashboard。
8. 不要使用大而全组件库。
9. 不引入全局状态库，除非确有必要。
10. Server 数据优先使用 Server Component / Route Handler。
11. Chart 保持 Client Component 边界。
12. API Key 绝不暴露客户端。
13. Finance decimal 不使用普通 JS 浮点直接累计。
14. 不要过早加入缓存系统。
15. 不要实现没有写进验收标准的高级功能。

---

# 47. Codex 最终交付要求

完成项目后输出：

```text
1. 项目结构
2. 安装方法
3. 环境变量
4. 数据库初始化
5. 启动命令
6. 测试命令
7. 已实现功能
8. 未实现功能
9. 已知限制
10. 后续推荐
```

同时保证：

```bash
npm install
npm run db:migrate
npm run seed
npm test
npm run dev
```

可以正常执行。

---

# 48. MVP 最终定义

MVP 成功不是：

“能显示 K 线。”

而是：

> 用户可以在 K 线上看到自己过去的 B/S 点，点击任意一个点，知道当时它处于历史区间、均线、前高前低、支撑压力的什么位置，并能看到之后 5/20/60 个交易日市场如何验证这个决策。

只要这一闭环体验足够好，第一版就是成功的。
