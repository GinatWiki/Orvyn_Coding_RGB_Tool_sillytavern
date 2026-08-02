# Orvyn_Coding_RGB_Tool_sillytavern

SillyTavern 第三方扩展：把剧情推进 / 填表 / 生成中 / 生成完成等事件推送到
Orvyn Coding RGB Tool 的本地事件桥（默认 `http://127.0.0.1:7355/event`），
让物理 RGB 状态灯跟随 SillyTavern 活动变化。

## 事件与状态

所有事件都推到 `sillytavern` 这一个 source。主工具 Web 控制台的
“可视化灯配置”支持自定义添加状态，并把事件名（触发条件）映射到该状态。

| 事件                 | 含义             | 默认状态 |
|----------------------|------------------|----------|
| generation_start     | ST API 生成开始  | busy     |
| generation_done      | 生成完成         | success  |
| message_received     | AI 消息接收完成  | success  |
| generation_stopped   | 用户停止生成     | running  |
| generation_error     | API 出错         | error    |
| story_advance        | 剧情推进开始     | story_working |
| story_failed         | 剧情推进失败     | story_failed |
| story_done           | 剧情推进完成     | success  |
| form_submit          | 填表开始         | form_working |
| form_failed          | 填表失败         | form_failed |
| form_error           | 填表出错         | form_error |
| idle                 | 页面关闭/空闲    | idle     |

## 安装

本地安装：

1. 把本仓库目录复制到
   `<SillyTavern>/public/scripts/extensions/third-party/orvyn-rgb-tool-sillytavern/`。
2. 重启 SillyTavern（或刷新页面）。
3. 先启动主工具服务（事件桥监听 `127.0.0.1:7355`）。

GitHub 安装：

1. 在 SillyTavern 的 Extensions → Install extension from URL 填入本仓库 URL：
   `https://github.com/GinatWiki/Orvyn_Coding_RGB_Tool_sillytavern`
2. 重启 SillyTavern。

## 设置

扩展会在 SillyTavern 扩展设置里增加 "Orvyn RGB Tool SillyTavern Bridge" 面板：

- Bridge URL：事件桥地址，默认 `http://127.0.0.1:7355`。
- Token：可选；与主工具 `config.yaml` 的 `runtime.bridge.token` 一致。

## 验证

主工具运行后：

```sh
curl -X POST http://127.0.0.1:7355/event ^
  -H "Content-Type: application/json" ^
  -d "{\"source\":\"sillytavern\",\"event\":\"story_advance\"}"
```

`sillytavern` 灯应进入对应状态（如 `story_advance` -> story_working）；
生成完成短暂显示 SUCCESS 后回到 RUNNING。
