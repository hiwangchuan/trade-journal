# Trade Journal 技术文档

> 文档版本：3.2
> 对应项目状态：2026-08-20  
> 运行方式：macOS 本地 Web 应用

## 1. 系统概述

Trade Journal 是一个本地优先的股票交易记录与复盘系统。系统用于：

- 管理真实持仓/关注股票；
- 获取或导入日线 OHLCV K 线；
- 将受接口窗口限制的行情持续增量累计到本地，并记录同步审计与数据质量；
- 记录买入、卖出、数量、手续费、策略和交易理由；
- 同时计算移动平均持仓成本线和包含历史卖出现金流的周期资金回本价；
- 在 K 线上显示买卖点；
- 分离“交易发生时可知的历史背景”和“交易发生后的结果”；
- 使用 FIFO 将买入和卖出配对并计算已实现盈亏；
- 将分批买卖合并为完整持仓周期，统计扣费后的净收益、R 倍数和持仓时间；
- 将确定性行情、成本和交易统计交给兼容 OpenAI Chat Completions 的模型做结构化复盘；
- 在本机 SQLite 中持久化所有业务数据。

系统不提供实盘下单、券商账户同步、实时 WebSocket 行情或投资建议。

## 2. 技术栈

| 层级 | 技术 |
| --- | --- |
| Web 框架 | Next.js 15 App Router |
| UI | React 19、TypeScript、Tailwind CSS |
| 图表 | Lightweight Charts 5 |
| 数据库 | SQLite、better-sqlite3、Drizzle Schema |
| 数据校验 | Zod |
| AI 接口 | OpenAI-compatible Chat Completions |
| 金额计算 | Decimal.js |
| 测试 | Vitest |
| 图标 | Lucide React |

应用采用单体本地架构。页面和 Route Handler 运行于同一 Next.js 项目，服务端直接访问 SQLite 与外部行情 API。

```text
浏览器
  │
  ├── Next.js 页面与 React 组件
  │       │
  │       └── /api/* Route Handlers
│               ├── SQLite（交易、行情系列、K 线、同步日志、分析结果）
  │               ├── Twelve Data（QQQ、NOK 等美股）
  │               ├── EODHD（港股）
  │               └── AI Gateway（仅用户主动生成时请求）
  │
  └── Lightweight Charts（日 K、成交量、均线、买卖标记）
```

## 3. 目录结构

```text
src/
├── app/
│   ├── api/                 # Route Handlers
│   ├── stocks/[symbol]/     # 股票工作区
│   ├── analytics/           # 买卖行为分析
│   ├── settings/            # 行情密钥与本地设置
│   └── trades/              # 交易列表
├── components/
│   ├── chart/               # K 线图组件
│   ├── stocks/              # 股票新增、配置组件
│   ├── trades/              # 交易录入、检查器、列表
│   └── ui/                  # 本地基础 UI 组件
├── db/                      # SQLite 连接与 Drizzle Schema
├── lib/
│   ├── analysis/            # 历史背景、结果、FIFO 等算法
│   ├── ai/                  # AI结构化输入、输出校验与网关客户端
│   ├── market-data/         # 数据源、增量同步、系列存储与质量检查
│   ├── backup.ts            # SQLite 在线备份
│   └── trades/              # 手续费与持久化逻辑
└── types/                   # 共享类型

drizzle/                     # 可重复执行的数据库 SQL
scripts/                     # 迁移、备份、初始化脚本
tests/                       # 算法与行情错误映射测试
data/                        # 本地 SQLite 文件（不进入 Git）
```

## 4. 安装与启动

### 4.1 环境要求

- Node.js 20 或更高版本；
- npm；
- macOS、Linux，或能够编译 `better-sqlite3` 的环境。

### 4.2 初始化

```bash
npm install
npm run db:migrate
npm run db:recalculate
npm run seed
npm test
npm run dev
```

访问：

```text
http://localhost:3000
```

默认数据库位置：

```text
./data/trade-journal.db
```

可以使用环境变量覆盖：

```env
DATABASE_URL=./data/trade-journal.db
```

### 4.3 初始化股票

`npm run seed` 是幂等初始化脚本，当前维护以下真实标的配置：

| 显示代码 | 名称 | 行情源 | 行情代码 |
| --- | --- | --- | --- |
| `QQQ` | Invesco QQQ Trust | Twelve Data | `QQQ` |
| `01810.HK` | 小米集团-W | EODHD | `1810.HK` |
| `NOK` | Nokia Oyj ADR | Twelve Data | `NOK` |

该脚本不生成演示 K 线或演示交易。它会清理 `data_provider='mock'` 的旧演示股票，因此不要对真实股票使用 `mock` 来源后再运行 Seed。

## 5. 配置与密钥管理

行情密钥有两种配置方式：

1. 打开 `/settings`，在“行情 K 线”中保存；
2. 手动写入 `.env.local`。

```env
TWELVE_DATA_API_KEY=
EODHD_API_KEY=
AI_BASE_URL=https://your-openai-compatible-service.example/v1
AI_MODEL=your-model-name
AI_API_KEY=
DATABASE_URL=./data/trade-journal.db
```

通过设置页保存时，服务端会：

- 校验 Key 长度与换行符；
- 写入项目根目录 `.env.local`；
- 使用 `0600` 文件权限；
- 立即同步到当前服务进程；
- 只向浏览器返回“是否已配置”，不会返回密钥内容。

`.env.local`、`data/` 和日志文件均已被 `.gitignore` 排除。

## 6. 行情数据体系

### 6.1 每只股票独立配置

行情源不是全局唯一值。每只股票在 `instruments` 表中保存：

- `data_provider`：行情适配器；
- `provider_symbol`：行情服务实际使用的代码。

股票工作区中的“股票配置”支持修改名称、市场、交易所、货币、时区、行情源、行情代码、价格复权口径和预计平仓手续费模型。显示代码 `symbol` 保持只读，因为它同时用于页面 URL 和历史交易关联。行情源、行情代码或复权口径变化后会标记 `market_data_stale=1`，直到刷新成功。

### 6.2 支持的行情源

| `data_provider` | 用途 | 密钥 | 代码示例 |
| --- | --- | --- | --- |
| `twelve-data` | 美股日线 | `TWELVE_DATA_API_KEY` | `QQQ`、`NOK` |
| `eodhd` | 港股/全球市场日线 | `EODHD_API_KEY` | `1810.HK` |
| `csv` | 手动离线导入 | 无 | 不使用远程代码 |
| `mock` | 开发测试 | 无 | 仅限演示用途 |

行情刷新严格按股票配置选择适配器。缺少密钥、代码错误或套餐不支持时会返回明确错误，不会自动写入 Mock K 线。

### 6.3 增量同步流程

```text
点击“增量同步”或打开已过期的股票页面
  → POST /api/market/refresh
  → 读取 instrument.data_provider / provider_symbol
  → 首次请求最大历史；以后从本地最新日期前 14 个自然日开始请求
  → 校验日期、正数价格、成交量、OHLC 高低关系和重复日期
  → 按 series_id + timestamp UPSERT：新增日期插入，重叠修正更新，旧历史保留
  → 记录返回、新增、修正、未变化和失败原因
  → 只有成功且非空的新系列才切换为活动系列
  → 行情发生变化时重新计算该股票交易分析
  → 页面重新加载并绘制 K 线
```

同步模式：

- `incremental`：日常同步，默认带 14 个自然日重叠；
- `backfill`：首次或手工请求当前套餐允许的最大历史；
- `reconcile`：重新核对当前仍可访问的完整区间；
- `csv`：对 CSV 管理的数据系列执行同样的增量合并。

接口失败、限流、鉴权失败或返回空数组时不会删除任何 K 线。模块级并发锁保证同一进程内一只股票同时只有一个同步任务。

统一 Candle 结构：

```ts
type Candle = {
  time: string;   // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source?: string;
  adjustment?: "raw" | "splits";
};
```

Twelve Data 请求 `time_series` 日线接口，并显式传入 `adjust=splits` 或 `adjust=none`。EODHD 原始价格请求 `/api/eod/{ticker}`；拆股复权模式并行请求 `/api/technical/{ticker}?function=splitadjusted`，再与原始成交量按日期合并。套餐不支持拆股复权接口时返回 `PLAN_RESTRICTED`，不会静默改变口径。

### 6.4 CSV 导入

CSV 表头必须为：

```csv
date,open,high,low,close,volume
```

示例：

```csv
date,open,high,low,close,volume
2026-08-17,50.10,51.20,49.80,50.95,23000100
2026-08-18,51.00,52.10,50.60,51.80,28600200
```

CSV 导入和远程刷新使用相同的完整校验、增量合并、同步日志与交易重算流程。为防止来源混合，必须先将股票行情来源切换为 `csv`；导入默认不删除文件未包含的历史日期。CSV 数据的复权口径由股票配置明确指定。

### 6.5 数据系列、自动补漏与质量状态

`market_data_series` 按股票、供应商代码、周期和复权口径隔离历史。修改行情源或复权方式只会创建候选系列，旧活动系列继续可读；候选系列成功写入后才切换。

打开股票详情页后，Next.js `after()` 在响应完成后检查数据是否过期，不阻塞页面。默认超过 18 小时触发同步、每 30 天进行一次深度校验，同一股票 10 分钟内不会重复尝试；这些参数可在设置页修改。批量同步按股票顺序执行，避免并发耗尽上游额度。

质量状态包括 `EMPTY`、`HEALTHY`、`REVIEW`、`STALE` 和 `ERROR`。当前检查无效 OHLCV、重复日期、超过 10 天的可疑缺口和超过 60% 的单日跳变；跳变只标记复权/公司行为复核，不自动修改价格。

### 6.6 行情错误代码

| 代码 | HTTP 状态 | 含义 |
| --- | ---: | --- |
| `AUTH` | 401 | Key 缺失或无效 |
| `PLAN_RESTRICTED` | 403 | 当前套餐无权限 |
| `SYMBOL_NOT_FOUND` | 404 | 行情代码无数据 |
| `RATE_LIMIT` | 429 | 请求额度耗尽 |
| `NETWORK` | 502 | 上游服务或网络异常 |
| `INVALID_RESPONSE` | 400 | 上游格式或参数无效 |
| `CSV_MANAGED` | 400 | 当前股票应通过 CSV 更新 |

## 7. 股票与交易模型

### 7.1 股票配置

新增股票时需要提供：

- 显示代码；
- 名称；
- 市场与交易所；
- 货币；
- 时区；
- 行情来源；
- 行情代码。

新增后可在股票工作区点击“股票配置”修改上述映射。配置修改不会删除已有 K 线或交易。

### 7.2 交易字段

每笔交易记录：

- 股票、方向（BUY/SELL）；
- 账户编号；同一股票在不同账户的持仓不会合并；
- 成交日期、成交时间；
- 成交价格、数量；
- 实际手续费；
- 买入交易后的“当前持仓全部卖出”预计手续费；配置了费率模型时以动态模型为准；
- 币种、策略、标签；
- 交易理由、计划、备注；
- 计划止损和计划目标。

金额、数量和手续费以字符串保存，并使用 Decimal.js 进行精确计算，避免 JavaScript 浮点误差。

## 8. 手续费、回本价与盈亏

### 8.1 两种回本口径

系统不会把“会计成本”和“收回整个持仓周期资金”混为一个指标：

- **持仓成本回本价**：移动加权平均成本加预计平仓费，用于当前剩余仓位的会计成本线；
- **周期资金回本价**：累计买入净支出减去累计卖出净收入，再加预计平仓费，用于回答剩余仓位卖到多少才能收回本周期全部净投入。

持仓数量归零后本周期结束，保存周期净盈亏并开启新周期。

设交易前：

- `Q`：持仓数量；
- `C`：包含买入手续费的持仓成本总额；
- `N`：本周期净现金流出；
- `F(x)`：按预计卖出成交额 `x` 动态计算的平仓手续费。

新增一笔买入 `q` 股、价格 `p`、买入手续费 `f` 后：

```text
Q' = Q + q
C' = C + p × q + f
N' = N + p × q + f

averageCost = C' / Q'
```

若股票配置了费率、最低收费和固定费用：

```text
F(x) = max(x × rate, minimum) + fixed
```

系统用二分法求解以下两个方程，避免按成交额收费造成循环依赖：

```text
accountingGross - F(accountingGross) = C'
campaignGross   - F(campaignGross)   = max(N', 0)

持仓成本回本价 = accountingGross / Q'
周期资金回本价 = campaignGross / Q'
```

费率模型全部为 0 时，使用最近一笔 BUY 中手动填写的“当前持仓全部卖出费用”，不再累加每次买入的最低收费估算。

单次买入时两种口径相同。例如买入价 100、数量 10、买入手续费 5、预计平仓费 5：

```text
持仓成本 = 100 × 10 + 5 = 1005
持仓均价 = 1005 / 10 = 100.5
两种回本价 = (1005 + 5) / 10 = 101
```

### 8.2 卖出时的成本结转与回本价

卖出前平均成本：

```text
averageCostBefore = C / Q
```

若本次卖出 `s` 股，实际卖出手续费为 `Fs`：

```text
sellBreakEvenPrice = averageCostBefore + Fs / s
realizedPnlAtAverageCost = (sellPrice - averageCostBefore) × s - Fs
```

部分卖出后，移动平均持仓成本按卖出数量比例结转，同时将卖出净收入从周期现金流出中扣除：

```text
C' = C × (1 - s / Q)
Q' = Q - s
N' = N - (sellPrice × s - Fs)
```

因此卖出价格不会改变剩余持仓的移动平均成本，但会改变周期资金回本价。低价部分止损会抬高剩余仓位的周期回本价；高价止盈会降低它。真正 SELL 使用录入的实际手续费。

系统是长仓模型。任何时点卖出数量超过同股票、同账户可用持仓时，新增、修改、导入和删除操作都会被拒绝，不会静默丢弃超额数量。

### 8.3 FIFO 已实现盈亏

卖出交易按时间顺序与最早的未平仓买入批次配对。部分成交时，买卖手续费按配对数量比例分摊。

```text
allocatedBuyFee  = buyFee  × matchedQty / buyQty
allocatedSellFee = sellFee × matchedQty / sellQty

realizedPnl = (sellPrice - buyPrice) × matchedQty
              - allocatedBuyFee
              - allocatedSellFee
```

因此已实现盈亏使用 SELL 中录入的实际手续费，不使用预计卖出手续费。FIFO 用于跨批次的已实现盈亏分析；交易检查器的持仓均价和回本线使用移动加权平均法，两种口径服务于不同目的。

## 9. 历史背景与未来结果隔离

这是系统最重要的数据规则。

### 9.1 历史背景快照

交易背景只允许读取：

```text
candle.date < trade.tradeDate
```

即使交易当天已有完整日 K，也不会进入背景计算，从而避免收盘后数据或未来数据泄漏。

当前快照指标包括：

- 20/60/120/250 日高低区间及位置百分位；
- MA5/10/20/60/120/250；
- 距 MA20、MA60 的百分比；
- ATR14 与 ATR 百分比；
- 当时成交量、20 日均量与量比；
- 最近 120 个交易日内、已确认且价格最近的 Swing High / Swing Low；
- 距枢轴点的百分比；
- 距 20 日高点/低点的交易日数。

枢轴点默认使用左右各 3 根 K 线确认，并且只能使用在交易日前已经确认的枢轴。区间位置不再强制限制在 0%–100%；突破高点会大于 100%，跌破低点会小于 0%。ATR14 使用 Wilder 平滑，量比使用最近已完成日成交量除以它之前的 20 日均量。

### 9.2 未来结果

交易结果只读取：

```text
candle.date > trade.tradeDate
```

计算内容包括：

- 1/3/5/10/20/60 日收盘收益；
- 5 日与 20 日 MFE（最大有利波动）；
- 5 日与 20 日 MAE（最大不利波动）；
- 未来 20 日最高价和最低价；
- SELL 后未来 20 日的卖飞幅度。

MFE、MAE、20 日最高/最低和卖飞幅度只有在完整取得 20 根未来 K 线后才生成；不足 20 日时保持空值，不与完整样本混合。

分析页分为两类：

1. **已平仓持仓周期**：按股票和账户合并分批买卖，统计实际扣费净收益率、周期胜率、Profit Factor、R 倍数、持仓天数和累计回撤；
2. **入场后市场表现**：描述每个 BUY 事件之后的 20 日价格路径，明确不等同于实际交易胜率，并显示“有效样本/全部事件”。

跨币种筛选时不汇总 Profit Factor 和绝对金额回撤，避免直接相加 USD 与 HKD。

背景保存于 `trade_analysis_snapshots`，结果保存于 `trade_outcomes`，两者在数据层也保持分离。

## 10. 数据库设计

| 表 | 用途 |
| --- | --- |
| `instruments` | 股票基础信息、行情映射、复权口径、数据陈旧状态和预计平仓费模型 |
| `market_data_series` | 按数据源、代码、周期和复权口径隔离的行情系列、范围与质量状态 |
| `candles` | 日线 OHLCV，归属于行情系列 |
| `market_sync_runs` | 每次同步的请求范围、计数、结果和错误 |
| `corporate_actions` | 拆股、分红、代码变更等公司行为的扩展表 |
| `market_sync_settings` | 自动同步开关、过期时间和深度校验周期 |
| `trades` | 买卖交易、手续费、计划与备注 |
| `strategies` | 交易策略字典 |
| `tags` | 标签字典 |
| `trade_tags` | 交易与标签多对多关系 |
| `manual_levels` | 手工支撑、阻力、自定义价格位 |
| `trade_analysis_snapshots` | 交易发生时的历史背景 |
| `trade_outcomes` | 交易发生后的验证结果 |

主要外键均使用级联删除：删除股票会连带删除其 K 线、交易和分析结果。当前 Web 页面没有提供删除股票入口，避免误操作。

K 线唯一键：

```text
(series_id, timestamp)
```

新行情在事务内按唯一键合并。数据源或复权口径变化时使用新 `series_id`，因此不会把不同供应商的数据混成一条价格序列，也不会因接口只返回最近一年而删除更早的本地记录。

## 11. API 概览

所有接口均为同源本地 API，基础地址默认为 `http://localhost:3000`。

### 11.1 股票

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/instruments` | 获取股票列表 |
| POST | `/api/instruments` | 新增股票 |
| PATCH | `/api/instruments/:id` | 修改股票配置 |
| GET | `/api/instruments/:id/candles` | 获取股票 K 线 |
| GET | `/api/instruments/:id/candles/export` | 导出活动系列 CSV |
| GET | `/api/instruments/:id/market-data` | 获取数据系列与同步日志 |
| GET | `/api/instruments/search?q=...` | 搜索候选股票 |

新增股票示例：

```json
{
  "symbol": "01810.HK",
  "name": "小米集团-W",
  "market": "HK",
  "exchange": "HKEX",
  "currency": "HKD",
  "timezone": "Asia/Hong_Kong",
  "dataProvider": "eodhd",
  "providerSymbol": "1810.HK"
}
```

更新股票时不接受 `symbol`，避免破坏 URL 和历史关联。

### 11.2 行情

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| POST | `/api/market/refresh` | 增量、回填或深度校验单只股票 |
| POST | `/api/market/import` | 导入 OHLCV CSV |
| POST | `/api/market/sync-all` | 顺序同步全部远程行情股票 |

刷新请求：

```json
{ "instrumentId": 4, "mode": "incremental" }
```

成功响应：

```json
{ "inserted": 1, "updated": 2, "unchanged": 7, "total": 5001 }
```

### 11.3 行情设置

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/settings/market-data` | 获取各来源是否已配置 |
| POST | `/api/settings/market-data` | 保存指定来源的 API Key |
| GET/POST | `/api/settings/market-sync` | 读取或保存自动同步策略 |
| POST | `/api/settings/backup` | 创建一致性 SQLite 在线备份 |

```json
{
  "provider": "eodhd",
  "apiKey": "YOUR_API_KEY"
}
```

### 11.4 交易

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| POST | `/api/trades` | 新增交易并生成分析 |
| PATCH | `/api/trades/:id` | 修改交易并重算 |
| DELETE | `/api/trades/:id` | 删除交易及关联分析 |
| POST | `/api/trades/:id/recalculate` | 手动重算单笔交易 |
| GET | `/api/trades/export` | 导出 JSON |
| POST | `/api/trades/import` | 导入交易 JSON |

### 11.5 AI 个股复盘

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| POST | `/api/instruments/:id/ai-analysis` | 生成当前股票的结构化 AI 复盘；`Accept: text/event-stream` 时使用 SSE |

接口先在服务端计算当前价格位置、MA20/MA60、ATR、成交量、近阶段涨跌、有效枢轴、完整持仓周期，以及按账户隔离的含手续费回本价。发送给模型的数据不包含 `reason`、`plan` 或 `note`。普通请求要求模型返回完整 JSON；流式请求要求模型返回逐行 NDJSON，服务端再转换为 `meta`、`progress`、`section`、`done`、`error` 五类 SSE 事件。最终结果仍须通过 Zod 完整校验，未完成、被取消或格式无效的响应不会进入缓存；相同模型和输入的完整结果在进程内缓存 10 分钟。

AI服务采用：

```text
POST {AI_BASE_URL}/chat/completions
Authorization: Bearer {AI_API_KEY}
```

页面打开弹窗不会发出请求，只有点击“生成AI分析”才会向配置的服务传输结构化交易数据。

流式请求可以由页面“停止”按钮取消。客户端取消会同步中止服务端的上游请求；服务端每 15 秒发送连接心跳，并允许模型最多运行 180 秒，以覆盖推理模型在真实复盘下较长的首段延迟。页面仅渲染完整解析出的段落，不直接展示半截 JSON；模型的推理增量只用于更新进度，不会暴露内部推理文本。若上游未按 NDJSON 输出，服务端会在流结束时尝试按完整 JSON 回退解析。

新增交易核心字段示例：

```json
{
  "instrumentId": 2,
  "side": "BUY",
  "tradeDate": "2026-08-18",
  "tradeAt": "2026-08-18T10:30:00",
  "price": "50.20",
  "quantity": "100",
  "fee": "18.50",
  "estimatedExitFee": "18.50",
  "currency": "HKD",
  "strategy": "Pullback",
  "reason": "回踩支撑位",
  "plan": "跌破计划止损",
  "note": "",
  "plannedStop": "47.00",
  "plannedTarget": "58.00",
  "tags": ["回踩", "按计划"]
}
```

### 11.5 分析

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/analytics/buys` | 买入数量、20 日平均收益和胜率 |
| GET | `/api/analytics/sells` | 卖出数量和平均卖飞幅度 |

## 12. 交易重算时机

下列操作会调用 `recalculateTrade`：

- 新增交易；
- 修改交易；
- 手动重算；
- 远程行情刷新完成；
- CSV 导入完成；
- 交易 JSON 导入完成。

重算使用 UPSERT 更新背景快照和结果，因此不会重复创建分析行。

## 13. 测试与质量检查

运行：

```bash
npm test
npx tsc --noEmit
```

当前自动化测试覆盖：

- 滚动区间；
- 移动平均线；
- ATR；
- 枢轴确认；
- 历史数据截止规则；
- 未来结果计算；
- FIFO 配对与双边手续费；
- 回本价；
- Twelve Data 错误映射；
- EODHD 错误映射。
- 行情重复同步幂等；
- 重叠日期修正且旧历史保留；
- 更换数据源时活动系列安全切换。

涉及 UI 的修改还应手工验证：

1. `/settings` 两个密钥输入区可见；
2. `/stocks/01810.HK` 显示 EODHD；
3. “股票配置”中 `1810.HK` 正确且显示代码只读；
4. 刷新后 K 线、成交量和买卖点正常；
5. 新增/编辑交易后手续费和回本价即时更新。

## 14. 数据备份与恢复

设置页可以点击“创建数据库备份”，命令行也可以运行：

```bash
npm run db:backup
```

备份使用 SQLite Online Backup API 写入 `data/backups/trade-journal-<UTC时间>.db`，无需停止开发服务器。完整迁移还应单独安全保存：

```text
data/trade-journal.db
.env.local
```

直接复制运行中的数据库时还可能存在 WAL 辅助文件：

```text
data/trade-journal.db-wal
data/trade-journal.db-shm
```

优先使用内置在线备份；手工复制时应先停止服务并同时处理 WAL。恢复时将备份放回数据库路径，再运行：

```bash
npm run db:migrate
```

交易页面的 JSON 导出适合迁移交易记录，但完整备份应复制 SQLite，因为 JSON 不包含全部 K 线、手工价格位和所有数据库元数据。

## 15. 常见问题

### 页面没有 K 线

依次检查：

1. 股票配置中的行情来源是否正确；
2. 对应 API Key 是否已配置；
3. `providerSymbol` 是否符合该服务格式；
4. 当前套餐是否覆盖该市场；
5. 是否达到每日请求限制；
6. 必要时使用 CSV 导入。

推荐代码：

```text
QQQ       → Twelve Data / QQQ
NOK       → Twelve Data / NOK
01810.HK  → EODHD / 1810.HK
```

### 刷新返回 400

查看响应中的 `code` 和 `message`。400 不一定表示 Key 错误，也可能是：

- 行情代码格式错误；
- 上游响应格式异常；
- 股票配置为 CSV；
- 选择了无效行情源。

Key 错误正常返回 401；套餐限制返回 403；代码不存在返回 404；额度限制返回 429。

### 配置 Key 后仍显示未配置

设置页保存后会即时设置当前进程环境变量。若手工编辑 `.env.local`，需要重启开发服务器。

### AI分析按钮为什么只打开说明页

这是隐私确认边界。打开弹窗只展示将发送的数据范围和当前模型；点击“生成AI分析”后才会把结构化指标与交易数值发送到 `AI_BASE_URL`。若按钮不可用，请检查 `AI_BASE_URL`、`AI_MODEL` 和 `AI_API_KEY` 是否同时配置，并重启服务。

### 修改行情源会不会删除交易

不会删除交易或旧 K 线。系统创建独立候选行情系列；只有新系列成功返回非空数据并通过校验后才切换为活动系列，旧系列保留为归档数据。

### 为什么股票代码不能修改

显示代码用于 `/stocks/[symbol]` URL，也承载历史交易归属。直接修改需要执行关联迁移与重定向，目前通过只读约束避免误操作。行情服务代码可以单独修改。

## 16. 当前边界与后续扩展

当前实现的明确边界：

- 仅日线，不含分钟线和实时推送；
- 单本地用户，无认证和权限系统；
- 不同步券商成交；
- 实际成交手续费由用户按总额录入；预计平仓费支持每只股票配置“费率 + 最低收费 + 固定费用”，尚未抽象为可复用券商模板；
- 交易配对使用 FIFO；
- 账户通过正整数编号隔离，尚无账户名称、券商和基础货币管理页面；
- 支持原始价格与拆股复权，不单独计算现金分红总回报；
- JSON 导入优先按导出文件中的股票代码映射本地股票，目标数据库仍需预先添加对应股票。
- AI复盘依赖第三方模型服务，只总结本地确定性计算结果，不读取新闻、财报或实时行情，也不输出投资建议；模型响应通常慢于本地计算。

适合后续扩展的方向：

- 将手续费配置抽象为可复用券商/市场费率模板；
- 增加股票删除的二次确认与备份机制；
- 增加现金分红和总回报分析；
- 增加交易所精确休市日历和持久化跨进程任务队列；
- 为 Route Handler 增加集成测试；
- 增加账户名称、券商属性、基础货币和多币种汇率换算。

## 17. 上游参考资料

- [Twelve Data API 文档](https://twelvedata.com/docs)
- [EODHD 日线历史数据 API](https://eodhd.com/financial-apis/api-for-historical-data-and-volumes)
- [EODHD 快速入门与额度说明](https://eodhd.com/financial-apis/quick-start-with-our-financial-data-apis)
- [Lightweight Charts 文档](https://tradingview.github.io/lightweight-charts/)
- [Next.js App Router 文档](https://nextjs.org/docs/app)

外部行情服务的覆盖范围、额度和套餐可能调整；出现 403 或 429 时应以上游服务当前文档为准。
