# 局域网双机测试服务

复用桌面 renderer、合作确认流程和 runtime，通过 HTTP 适配层供 Mac / Windows 浏览器访问。登录账号按用户分配固定个人数据目录，共用独立的 shared 数据目录，不读取现有桌面客户端的私人数据。

运行 `node lan/manage.js start`，查看终端中的访问地址。`status` 查询状态，`stop` 停止服务。默认端口 3218，绑定当前网络的局域网 IPv4 地址；不会监听公网 IPv6。测试账号初次创建，后续启动不重置。数据存放在 `~/Library/Application Support/XuanhuaiAgent-LAN-Test`。

`server.js` 管理密码哈希、会话、角色白名单与同源请求检查；浏览器使用 HttpOnly / SameSite=Strict Cookie，会话 8 小时过期。浏览器不能调用桌面管理员、任意 IPC 或文件接口。`web-bridge.js` 通过每 2 秒取状态保持进度同步；`web-ui.js` 适配角色入口与退出登录。

验证：`node --test test/*.test.js`；`./node_modules/.bin/electron scripts/verify-lan.js`。界面测试使用独立临时数据与模拟模型，不调用外部模型。

边界：本版为同一可信局域网的 HTTP 测试，不提供公网部署、学校认证、TLS、Windows 安装包或操作系统桌面通知。不要把端口转发到公网。模型配置属于各账号的运行内存；服务重启需重新连接。服务进程退出时会终止正在执行的任务；记录按原 runtime 持久化。
