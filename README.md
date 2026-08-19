# Trade Journal 交易复盘

本地优先的股票交易记录与复盘工具。支持真实股票配置、原始/拆股复权日 K、买卖点、账户隔离、动态平仓费、移动平均持仓成本、持仓周期资金回本价、FIFO 已实现盈亏，以及严格隔离的历史背景和未来结果分析。

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
DATABASE_URL=./data/trade-journal.db
```

- QQQ、NOK：Twelve Data，代码分别为 `QQQ`、`NOK`；
- 小米集团-W：EODHD，代码为 `1810.HK`；
- API Key 仅由服务端读取；
- 缺少 Key 时不会自动将真实股票替换为演示行情；
- CSV 可作为离线数据来源。

CSV 表头：

```csv
date,open,high,low,close,volume
```

## 常用命令

- `npm run db:migrate` — 创建或升级 `./data/trade-journal.db`
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
