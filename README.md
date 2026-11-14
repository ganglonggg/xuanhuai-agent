# 宣怀 Agent

面向天津大学创业生态的个人智能助手，帮助用户查找创业资料、课程和合作机会，并整理下一步行动。

- `客户端/`：Electron 桌面客户端及局域网试用版。
- `信息层/xuanhuai-platform/`：共享信息服务、MCP 接口和自动化测试。
- `信息层/knowledge-base/`：知识资料处理工具、历史课表样例和索引数据。
- `xuanhuai-agent-interactive/`：交互原型。
- `宣怀Agent产品介绍.md`：产品介绍。

## 运行与验证

需要 Node.js 22 或更新版本。客户端安装依赖后运行：

```bash
cd 客户端
npm ci
npm start
```

运行自动化测试：

```bash
npm --prefix 信息层/xuanhuai-platform test
npm --prefix 客户端 test
```

开放式对话需要用户自行配置模型服务；密钥不应提交至仓库。课程历史数据仅供样例演示，未确认的安排不代表当前课表。更多配置和功能边界见各目录 README。
