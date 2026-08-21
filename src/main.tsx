import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'

// 注意：不使用 StrictMode —— 会导致 R3F canvas / GSAP effect 双跑（见 react-dev 指南）。
// BrowserRouter 仅作空壳保留，本应用为单页状态机，不依赖路由。
createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
)
