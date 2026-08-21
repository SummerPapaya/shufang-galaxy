import * as THREE from 'three'

/**
 * 程序化 canvas 贴图（universe.md §7：星体、辉光、星云全部程序化生成）。
 * 所有贴图在运行时生成，无素材文件依赖。
 */

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  return [canvas, canvas.getContext('2d')!]
}

function toTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** 书房星辉光：白炽核心 → starColor → 透明（径向渐变，加法混合用） */
export function makeGlowTexture(color: string): THREE.Texture {
  const size = 256
  const [canvas, ctx] = makeCanvas(size)
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.12, color)
  g.addColorStop(0.34, `${color}38`) // ~22%（更柔和的衰减）
  g.addColorStop(0.62, `${color}14`) // ~8%
  g.addColorStop(1, `${color}00`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return toTexture(canvas)
}

/** 星核：小而锐的亮白点（中心硬、边缘柔） */
export function makeCoreTexture(): THREE.Texture {
  const size = 64
  const [canvas, ctx] = makeCanvas(size)
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.35, 'rgba(255,252,244,0.95)')
  g.addColorStop(0.7, 'rgba(255,250,240,0.25)')
  g.addColorStop(1, 'rgba(255,250,240,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return toTexture(canvas)
}

/** hover 光晕环：细描边圆环（starColor，带轻微发光） */
export function makeRingTexture(color: string): THREE.Texture {
  const size = 256
  const [canvas, ctx] = makeCanvas(size)
  ctx.strokeStyle = color
  ctx.lineWidth = 5
  ctx.shadowColor = color
  ctx.shadowBlur = 14
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size / 2 - 18, 0, Math.PI * 2)
  ctx.stroke()
  return toTexture(canvas)
}

/** 星云色斑：大尺度径向渐变（加法混合，低透明度） */
export function makeNebulaTexture(color: string): THREE.Texture {
  const size = 256
  const [canvas, ctx] = makeCanvas(size)
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, color)
  g.addColorStop(0.45, `${color}55`)
  g.addColorStop(1, `${color}00`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return toTexture(canvas)
}
