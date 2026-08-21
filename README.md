# Trade Journal 交易复盘

本地优先的股票交易记录、数据分析与预测工具。支持真实股票配置、持续累计的原始/拆股复权日 K、同步审计与备份、买卖点、账户隔离、动态平仓费、移动平均持仓成本、持仓周期资金回本价、FIFO 已实现盈亏、无未来数据的月度定投历史情景、真实含费收益曲线，以及基于结构化数据的 AI 个股复盘。

> 产品永久边界：本项目只做数据记录、计算、回测、预测和复盘；不连接券商交易系统，不创建、提交或执行任何订单，也不提供自动或半自动下单功能。

完整说明请阅读：[中文技术文档](docs/TECHNICAL.md)。

## 快速启动

```bash
npm install
npm run db:migrate
npm run seed
npm test
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。初始工作区维护 `QQQ`、`01810.HK`（小米集团-W）和 `NOK` 三个真实标的，不创建演示 K 线或演示交易。

## 行情配置

可直接在“设置 → 行情 K 线”中保存密钥，也可复制 `.env.example` 为 `.env.local`：

```env
TWELVE_DATA_API_KEY=
EODHD_API_KEY=
AI_BASE_URL=https://your-openai-compatible-service.example/v1
AI_MODEL=your-model-name
AI_API_KEY=
DATABASE_URL=./data/trade-journal.db
```

- QQQ、NOK：Twelve Data，代码分别为 `QQQ`、`NOK`；
- 小米集团-W：EODHD，代码为 `1810.HK`；
- API Key 仅由服务端读取；
- 缺少 Key 时不会自动将真实股票替换为演示行情；
- CSV 可作为离线数据来源。

行情刷新采用本地增量合并：首次获取套餐允许的最大历史，后续重复请求最近约 14 个自然日并修正重叠数据；接口失败或返回空数据不会删除本地历史。行情源、代码或复权口径变化时创建独立数据系列，旧系列保留到新系列成功同步。

CSV 表头：

```csv
date,open,high,low,close,volume
```

## AI 个股复盘

股票工作区的“AI分析”会先打开数据说明弹窗，仅在用户点击“生成AI分析”后请求服务。服务端发送确定性行情指标、交易日期、价格、数量、手续费和策略标签，不发送交易理由、计划或备注。分析通过 SSE 流式生成，各结构化段落会陆续显示，支持中途停止和失败重试；只有经过完整校验的结果才缓存 10 分钟。AI只解释现有数据，不直接预测股价或提供买卖建议。

## 月度定投收益曲线

股票工作区的“定投曲线”按账户和自然月合并真实买入，在同一张 K 线中使用独立百分比坐标展示历史相似情景 P20/P50/P80、全历史基准中位数、实际含费净收益和 0% 回本线。预测严格只使用买入日前的日 K；快照记录算法版本和数据截止日，后续实际行情不会回写旧预测。实际曲线计入买入手续费、FIFO 卖出净现金以及剩余持仓的预计卖出手续费。

## 可验证价格位

股票工作区的“价格位”支持维护支撑位、阻力位和观察位。每次创建、修改、归档或恢复都会记录不可变版本，版本生效日由服务器锁定为当前最新行情日；K 线只在相应版本的有效区间内绘制，避免将后来判断回填到过去。页面同时统计触及次数、首次触及、首次破位，以及首次触及后的 5/20/60 日价格表现。价格位仅用于复盘，不是下单信号。

## 常用命令

- `npm run db:migrate` — 创建或升级 `./data/trade-journal.db`
- `npm run db:backup` — 在线备份 SQLite 到 `./data/backups/`
- `npm run db:recalculate` — 在算法升级或行情替换后重算全部派生分析快照
- `npm run seed` — 幂等维护三个真实股票配置，不生成交易或 K 线
- `npm test` — 运行分析、手续费、FIFO 和行情错误映射测试
- `npx tsc --noEmit` — TypeScript 静态检查
- `npm run build` — 生产构建
- `npm run dev` — 启动本地开发服务器

## 实现要点

- Next.js App Router、React、TypeScript、Tailwind CSS；
- Lightweight Charts 5 绘制 K 线、成交量、均线和 B/S 标记；
- SQLite + better-sqlite3，本地数据不会上传；
- Decimal.js 计算动态手续费、会计成本线、周期资金回本价和 FIFO 盈亏；
- 历史快照只使用 `date < tradeDate` 的 K 线；
- 未来结果只使用 `date > tradeDate` 的 K 线。

设计参考图位于 `docs/design/trade-journal-core-screen.png`。
