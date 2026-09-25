# 正则表达式可视化调试器

NFA 状态机可视化、逐步匹配高亮、分组捕获标注、回溯追踪的交互式正则调试工具。

## 技术栈

- Vue 3 + TypeScript + Vite
- Pinia 状态管理
- Tailwind CSS 样式
- Canvas 2D 状态机渲染

## 功能

- 正则表达式 NFA 状态机 Canvas 可视化
- 逐步匹配高亮（字符→状态→转移边）
- 分组捕获实时标注与颜色编码
- 回溯路径追踪与步骤计数
- 20+ 常用模式模板库
- 正则语法树分层可视化
- 匹配性能统计（步骤数/回溯次数/耗时）
- 反向引用/零宽断言/贪婪惰性模式支持

## 启动

```bash
cd frontend
npm ci          # 按 package-lock.json 安装一致的依赖版本（本地/CI/部署结果相同）
npm run dev     # 自动执行启动检查（环境 → 锁文件 → 模板元数据），通过后启动 Vite
```

## 可重复的检查流程

模板元数据校验与本地/上线检查串成一条流程，任一环节失败会指出具体环节：

| 阶段 | 内容 | 命令 |
| --- | --- | --- |
| 1 | 运行环境（Node ≥ 18、npm 可用） | 包含在 preflight 中 |
| 2 | 依赖锁文件存在且与 package.json 一致 | `npm run check:lockfile` |
| 3 | 模板元数据（缺字段/未知字段/分类未声明/正则非法/样例不匹配） | `npm run validate:templates` |
| 4 | TypeScript 类型检查 | `npm run typecheck` |
| 5 | 生产构建 | `vite build` |

```bash
npm run preflight   # 阶段 1-3，快速本地启动检查（npm run dev/build 会自动先执行）
npm run verify      # 阶段 1-5，本地复现流水线的完整检查
npm run deploy      # npm ci → verify → 确认 dist 产物，部署入口
```

- 所有检查脚本只读：不改写模板/源码、不留临时产物，重复执行结果一致。
- 依赖变化后若忘记更新 `package-lock.json`，阶段 2 会失败并给出修复命令。
- 构建失败会在阶段 5 明确中断；不产生有效 `dist` 即不允许部署。

## 新增/修改模板

模板的说明、分类、正则、测试样例集中维护在唯一数据源
[`frontend/src/data/templates.json`](frontend/src/data/templates.json)：

1. 在顶层 `categories` 中确认/新增分类；
2. 在 `templates` 中追加一条，**必须且只能**包含
   `name` / `category` / `pattern` / `description` / `testString`；
3. `testString` 用空白分隔多个样例：锚定 `^...$` 的模板要求每个样例整段匹配，
   非锚定模板要求至少一个样例能命中；
4. 保存后 `npm run dev` 即自动校验，或手动执行 `npm run validate:templates`。

模板在界面上的展示与套用行为不需要改动：`src/data/templates.ts` 按
`RegexTemplate` 类型导出，组件仍从 store 读取 `TEMPLATES`。

## 流水线

`.github/workflows/ci.yml` 在 push / PR 时依次执行：
`npm ci`（严格按锁文件安装）→ `npm run verify`（锁文件 → 模板 → 类型检查 → 构建），
任一环节失败标红中断；main 分支通过后上传 `frontend/dist` 产物并放行部署门禁。
