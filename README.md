<div align="center">

## 网页完美翻译

**一键整页翻译成中文 支持划词翻译 自动翻译**

![version](https://img.shields.io/badge/version-1.1.5-1a73e8?style=flat-square)
![license](https://img.shields.io/badge/license-MIT-3ddc84?style=flat-square)
![platform](https://img.shields.io/badge/platform-Tampermonkey-ff8800?style=flat-square)
![engine](https://img.shields.io/badge/engine-腾讯翻译-00a4ff?style=flat-square)

[安装](#安装) · [使用](#使用) · [免责声明](#免责声明)

</div>

---

### 这是什么

一个油猴脚本 打开外语网页 点右下角的悬浮球 整页文字就地换成中文 原文随时可以还原

不用装插件、不用注册账号、不用填 API Key 翻译走后端接口 前端只负责把文字挖出来 送过去 再写回去

---

### 安装

#### 1 装脚本管理器

| 浏览器 | 管理器 |
| :--- | :--- |
| Chrome / Edge / Firefox | [Tampermonkey](https://www.tampermonkey.net/)或 Violentmonkey |
| Android（Kiwi / Lemur / Edge Canary） | Tampermonkey 从扩展商店装 |
| iOS（Safari） | [Userscripts](https://apps.apple.com/app/userscripts/id1463298887) 或 Stay |

> [!IMPORTANT]
> 手机自带浏览器（vivo、OPPO、小米、华为等）**不支持**油猴脚本 它们架构不兼容浏览器扩展 要在手机上用 请换 Kiwi Browser 这类支持扩展的浏览器

#### 2 装脚本

点下面这个链接 管理器会自动弹出安装框：

**[➜ 点我安装](https://raw.githubusercontent.com/PearBlossomPoetry/blossom-translate/main/blossom-translate.user.js)**

或者复制地址手动添加：

```
https://raw.githubusercontent.com/PearBlossomPoetry/blossom-translate/main/blossom-translate.user.js
```

---

### 使用

#### 悬浮球

| 操作 | 效果 |
| :--- | :--- |
| **点一下** | 整页翻译 按钮变成「原」 |
| **再点一下** | 还原原文 按钮变回「译」 |
| **长按** | 弹出设置面板 |
| **按住拖动** | 换位置 松手后记住 |
| **停靠状态** | 翻译完成 1.5 秒后 按钮自动滑向边缘停靠 |

### 划词翻译

在页面上选中任意外文（长按选词就行）译文会以气泡形式出现在**选区下方** 上方空间不够才翻到上面

- 选中中文不会触发
- 超过 1200 字不翻（防误选整页）
- 输入框里的选中不触发
- 点空白处关掉气泡

---

### 免责声明

- 本脚本仅供**学习交流**使用 翻译服务由腾讯翻译君提供 接口版权归其所有
- 使用的是**非公开接口** 随时可能变更或失效 不保证长期可用 可提issues随缘更新
- 请勿用于商业用途 请勿高频调用
- 翻译内容由第三方服务生成 准确性不作任何保证
- 使用本脚本产生的任何后果由使用者自行承担

---

### 更新日志

#### 1.1.5
- 划词翻译 气泡默认显示在选区下方
- 新页面自动翻译默认开启
- 停靠改为就近吸附 左右都支持
- 按钮位置记忆
- 批次 30 → 40 段 并发 3 → 5 视口优先
- 修复胶囊一直停留「翻译中」的问题
- 修复翻译中按钮文字消失的问题
- 按钮改用 inset 描边 消除圆角锯齿

<details>
<summary>更早的版本</summary>

<br>

**0.x / 1.0.x** — 原型阶段 毛坯

</details>

---

<div align="center">

***如果这个脚本帮你省了点时间***

点个 Star 就好

Made By [梨花诗](https://github.com/PearBlossomPoetry) · [moeimoe@163.com](mailto:moeimoe@163.com)

</div>
