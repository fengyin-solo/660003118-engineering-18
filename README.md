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
npm ci          # 严格按 package-lock.json 安装，各机器依赖版本一致
npm run dev
```

## 模板维护

模板的说明、分类、正则与测试样例统一维护在单一数据源
[`frontend/data/templates.json`](frontend/data/templates.json)，应用与校验脚本都从这里读取
（应用侧通过 `src/store/regex.ts` 中的 `TEMPLATES` 导出，展示与套用行为不变）。

每个模板包含 5 个必填字段：

| 字段 | 含义 |
| --- | --- |
| `name` | 模板名称，必须唯一（模板列表以它作为 key） |
| `pattern` | 正则表达式（JSON 字符串，注意 `\\` 等转义） |
| `description` | 展示用说明 |
| `testString` | 套用模板时填入的测试文本 |
| `category` | 分类，必须出现在顶层 `categories` 列表中 |

样例本身含空格（如 HTML 标签）时，可额外提供可选字段 `testCases: string[]`
显式列出校验用样例；该字段只用于校验，不会进入应用。

**新增/修改模板后运行：**

```bash
cd frontend
npm run validate:templates   # 只校验模板元数据，秒级反馈
```

校验内容：必填字段齐全且无未知字段、`name` 唯一、`pattern` 是合法正则、
`category` 合法、每个测试样例都能被 `pattern` 命中。校验只读，不会改写任何文件。

## 一键检查流程（本地 / 流水线同一条链路）

```bash
npm run check        # 仓库根目录亦可：npm run check
```

依次执行 5 个阶段，任一阶段失败立即停止并指出具体环节（退出码非 0）：

| 阶段 | 内容 | 失败含义 |
| --- | --- | --- |
| 1/5 依赖安装检查 | 锁文件存在、与 `package.json` 规格一致，随后 `npm ci` | 锁文件缺失或依赖声明变了但没更新/提交锁文件 |
| 2/5 模板元数据校验 | `validate:templates` | 模板缺字段、正则非法、分类/样例有问题 |
| 3/5 类型检查 | `vue-tsc --noEmit` | TypeScript 类型错误 |
| 4/5 生产构建 | `vite build` | 构建失败 |
| 5/5 本地启动冒烟 | Vite 开发服务器启动并返回首页 | 本地开发环境实际跑不起来 |

特性：

- **可重复**：`npm ci` 严格按提交的 `package-lock.json` 安装，重复执行结果一致
- **不留产物**：默认结束时清理 `dist/`，冒烟服务器在独立端口（5199）启动并必定回收；
  需要保留构建产物时设置 `KEEP_DIST=1`（或传 `--keep-dist`）
- **不改内容**：所有检查脚本只读，重复执行不会改写模板或锁文件

可用的独立命令：`npm run check:lockfile`、`npm run validate:templates`、
`npm run typecheck`、`npm run build:only`、`npm run smoke:dev`。

## CI / 部署

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) 在 PR 与 main 分支推送时
运行与本地完全相同的 5 个阶段，并在每个阶段给出独立的成功/失败反馈；构建产物
`frontend-dist` 可在流水线运行页下载。main 分支推送通过全部检查后自动部署到
GitHub Pages（需在仓库 Settings → Pages 中将 Source 设为 GitHub Actions）。
