# Orvyn_Coding_RGB_Tool_sillytavern

SillyTavern 第三方扩展：把剧情推进 / 填表 / 生成中 / 生成完成等事件推送到
Orvyn Coding RGB Tool 的本地事件桥（默认 `http://127.0.0.1:7355/event`），
让物理 RGB 状态灯跟随 SillyTavern 活动变化。

## 三个独立状态源

扩展把事件推到三个独立的 source key，可在主工具 Web 控制台分别配置灯色、
灯位与优先级：

| source         | 含义              | 事件                      | 状态     |
|----------------|-------------------|---------------------------|----------|
| sillytavern    | ST 自身 API 调用  | generation_start         | BUSY     |
|                |                   | generation_done / message_received | SUCCESS → RUNNING |
|                |                   | generation_stopped       | RUNNING  |
|                |                   | generation_error         | ERROR    |
| shujuku_story  | 剧情推进          | story_advance            | BUSY     |
|                |                   | story_done               | SUCCESS  |
| shujuku_form   | 填表              | form_submit              | BUSY     |
|                |                   | form_done                | SUCCESS  |
| 全部           | 页面关闭/空闲     | idle                     | IDLE     |

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

`sillytavern` 灯应进入 BUSY（工作中）；生成完成后短暂显示 SUCCESS（已完成），
约 5 秒后回到 RUNNING。`shujuku_story` / `shujuku_form` 只在 shujuku 脚本
加载后跟随剧情推进 / 填表状态。
