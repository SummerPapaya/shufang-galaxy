<p align="center">
  <img src="./assets/readme/hero.gif" width="100%" alt="一个人的书房 · 平行宇宙：书房星、虫洞越迁与星空图书馆">
</p>

# 一个人的书房 · 平行宇宙

> A Study of One's Own — 一间间书房化作星辰，在银河里漫游。

「一个人的书房」播客的沉浸式展示 demo：从银河着陆页穿越虫洞，进入 360° 星空漫游；每颗星是一位朗读者的书房，点击进入 2.5D 房间详情，查看朗读书目并试读有声样片；「星空图书馆」以 3D 环形书墙陈列全部有声书。

线上预览：<https://shufang-galaxy.summercommences.com>

<p align="center">
  <img src="./assets/readme/workflow.svg" width="100%" alt="从星河远景到虫洞越迁、星空漫游，再进入书房或星空图书馆">
</p>

## 技术栈

- Vite 7 + React 19 + TypeScript
- Tailwind CSS 3.4 + shadcn/ui
- Three.js（@react-three/fiber + drei）
- GSAP / framer-motion / zustand

## 本地开发

```bash
npm install
npm run dev      # http://localhost:3000
```

## 构建与部署

```bash
npm run build    # 产物输出到 dist/
```

推送到 `main` 分支后由 GitHub Actions（`.github/workflows/deploy.yml`）自动构建并发布到 GitHub Pages。

## 内容数据

| 文件 | 说明 |
| --- | --- |
| `public/assets/rooms.json` | 朗读者房间：名称、星色、图片、留言、朗读书目与单集 |
| `public/assets/books.json` | 星空图书馆书目与单集 |
| `public/assets/rooms/*.jpg` | 房间图片 |
| `public/assets/audio/*.mp3` | 朗读样片音频 |

更新内容只需修改上述 JSON 与素材文件，无需改动代码。
