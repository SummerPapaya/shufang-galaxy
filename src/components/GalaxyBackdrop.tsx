import { useMemo, useRef } from 'react'
import type { CSSProperties, RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * <GalaxyBackdrop> 可复用的程序化银河（design.md §A / home.md §1-A）
 *
 * - 远景银河：对角光带（倾角 −25°），程序化粒子星点 + 大半径模糊星云色斑（加法混合）
 * - 漂浮星尘：近景尘埃粒子，极慢漂移 + 闪烁
 * - 远景书房星：roomStars 传入的彩色亮星，呼吸式明暗，悬停亮度 +50%
 * - 视差：鼠标移动时镜头反向微移
 * - 氛围：体积累星云 + 缓慢自转 + 向镜头的轻穿梭（参考 星空穿梭 视频素材，无指针拨动）
 * - 穿越：外部通过 warpRef（0→1）驱动粒子径向飞散，fovRef 驱动镜头 FOV 拉伸
 *   （landing → universe 的穿越 timeline 直接写这两个 ref，不触发 React 重渲染）
 *
 * universe 视图可在此基础上扩展第一人称星野。
 */

export interface RoomStarSpec {
  /** 对应 rooms.json 的 id */
  id: string
  /** starColor */
  color: string
}

/** 由外部动画库（GSAP timeline）逐帧写入的数值 ref */
export type AnimatedNumberRef = RefObject<number>

export interface GalaxyBackdropProps {
  /** 银河星点数量，默认 1200 */
  starCount?: number
  /** 近景星尘数量，默认 200 */
  dustCount?: number
  /** 书房亮星（starColor 彩色星点），默认空 */
  roomStars?: RoomStarSpec[]
  /** 鼠标视差，默认 true */
  parallax?: boolean
  /** 穿越进度 0→1（粒子飞散），外部 timeline 写入 */
  warpRef?: AnimatedNumberRef
  /** 镜头 FOV 覆盖（穿越时 60→92→62），外部 timeline 写入 */
  fovRef?: AnimatedNumberRef
  /** 基础 FOV，默认 60 */
  baseFov?: number
  /** 悬停书房星回调（悬停时星体自动提亮 +50%） */
  onRoomStarHover?: (id: string | null) => void
  /**
   * cinematic：向镜头缓慢穿梭 + 银河自转（landing / 图书馆）
   * 强度 0 关闭穿梭，只保留闪烁与视差
   */
  travel?: number
  /** false 时不拦截指针（图书馆书廊需要把拖拽留给书） */
  interactive?: boolean
  className?: string
  style?: CSSProperties
}

/* ── 工具 ─────────────────────────────────────────── */

/** 确定性 PRNG，保证星野布局稳定 */
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gaussian(rand: () => number): number {
  // Box-Muller
  const u = Math.max(rand(), 1e-6)
  const v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

const REDUCED_MOTION =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/* ── Shaders ──────────────────────────────────────── */

const STAR_VERT = /* glsl */ `
uniform float uTime;
uniform float uWarp;
uniform float uPixelRatio;
uniform float uMotion;
uniform float uTravel;
attribute float aSize;
attribute vec3 aColor;
attribute float aPhase;
attribute float aTwinkle;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec3 p = position;
  #ifdef DRIFT
    // 近景星尘：缓慢八字漂移（电影感星空，无指针拨动）
    p.x += sin(uTime * 0.12 + aPhase * 6.2831) * 1.35 * uMotion;
    p.y += cos(uTime * 0.09 + aPhase * 4.0) * 1.05 * uMotion;
    p.z += sin(uTime * 0.07 + aPhase * 3.1) * 0.45 * uMotion;
  #endif
  #ifdef FAR_DRIFT
    // 远景银河：极慢横向蠕动，制造深空呼吸
    p.x += sin(uTime * 0.035 + aPhase * 6.2831) * 0.55 * uMotion;
    p.y += cos(uTime * 0.028 + aPhase * 5.2) * 0.35 * uMotion;
  #endif
  #ifdef TRAVEL
    // 星空穿梭：粒子从远景向镜头漂来，越过近处后循环回远处
    float zNear = -6.0;
    float zFar = -98.0;
    float span = zNear - zFar;
    p.z = zFar + mod(position.z - zFar + uTime * uTravel * uMotion, span);
  #endif
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float w = uWarp;
  // 穿越：径向飞散（越靠画面边缘越快）+ 向镜头冲刺
  float edge = clamp(length(mv.xy) / 24.0, 0.3, 1.6);
  mv.xy *= 1.0 + w * w * 3.2 * edge;
  mv.z += w * 28.0;
  float tw = mix(
    1.0,
    0.3 + 0.6 * (0.5 + 0.5 * sin(uTime * (0.5 + aTwinkle * 0.6) + aPhase * 6.2831)),
    aTwinkle * uMotion
  );
  vColor = aColor;
  vAlpha = tw;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uPixelRatio * (130.0 / max(1.0, -mv.z)) * (1.0 + w);
}
`

const STAR_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.05, d);
  gl_FragColor = vec4(vColor, a * vAlpha);
}
`

const ROOM_STAR_VERT = /* glsl */ `
uniform float uTime;
uniform float uWarp;
uniform float uPixelRatio;
uniform float uMotion;
uniform float uHoverIndex;
attribute float aSize;
attribute vec3 aColor;
attribute float aPhase;
attribute float aIndex;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float w = uWarp;
  float edge = clamp(length(mv.xy) / 24.0, 0.3, 1.6);
  mv.xy *= 1.0 + w * w * 3.2 * edge;
  mv.z += w * 28.0;
  // 呼吸感光芒：放慢周期（约 7s）、加大幅度，透明度随呼吸一起起伏
  float breathe = 1.0 + 0.3 * sin(uTime * 0.9 + aPhase * 6.2831) * uMotion;
  float hovered = step(abs(aIndex - uHoverIndex), 0.5);
  float boost = 1.0 + hovered * 0.5;
  vColor = aColor;
  vAlpha = (0.52 + 0.37 * breathe) * boost;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * breathe * boost * uPixelRatio * (130.0 / max(1.0, -mv.z)) * (1.0 + w);
}
`

/* 流动星云粒子：沿 −25° 对角带缓慢漂移 + 呼吸式闪烁；uMotion=0 时静止 */
const NEBULA_FLOW_VERT = /* glsl */ `
uniform float uTime;
uniform float uWarp;
uniform float uPixelRatio;
uniform float uMotion;
uniform vec2 uBandDir;
uniform float uTravel;
attribute float aSize;
attribute vec3 aColor;
attribute float aPhase;
attribute float aSpeed;
attribute float aAlpha;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec3 p = position;
  // 沿对角带缓慢漂移（每粒子随机 phase/speed）——电影感星云流，非交互拨动
  p.xy += uBandDir * sin(uTime * aSpeed * 0.065 + aPhase * 6.2831) * 3.2 * uMotion;
  p.y += cos(uTime * aSpeed * 0.04 + aPhase * 4.0) * 1.1 * uMotion;
  if (uTravel > 0.001) {
    float zNear = -8.0;
    float zFar = -90.0;
    float span = zNear - zFar;
    p.z = zFar + mod(position.z - zFar + uTime * uTravel * 0.65 * uMotion, span);
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float w = uWarp;
  // 穿越：与其余粒子层一致的径向飞散
  float edge = clamp(length(mv.xy) / 24.0, 0.3, 1.6);
  mv.xy *= 1.0 + w * w * 3.2 * edge;
  mv.z += w * 28.0;
  // 呼吸式闪烁（reduced-motion 时保持恒定低透明度）
  float breathe = mix(
    1.0,
    0.45 + 0.55 * (0.5 + 0.5 * sin(uTime * (0.25 + aSpeed * 0.5) + aPhase * 6.2831)),
    uMotion
  );
  vColor = aColor;
  vAlpha = aAlpha * breathe;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uPixelRatio * (130.0 / max(1.0, -mv.z)) * (1.0 + w);
}
`

const NEBULA_FLOW_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.0, d);
  a *= a;
  gl_FragColor = vec4(vColor, a * vAlpha);
}
`

/* ── 星云色斑纹理 ──────────────────────────────────── */

function makeNebulaTexture(color: string): THREE.Texture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, color)
  g.addColorStop(0.45, `${color}55`)
  g.addColorStop(1, `${color}00`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/* ── 场景 ─────────────────────────────────────────── */

interface SceneProps extends Required<Omit<GalaxyBackdropProps, 'warpRef' | 'fovRef' | 'onRoomStarHover' | 'className' | 'style' | 'interactive'>> {
  warpRef?: AnimatedNumberRef
  fovRef?: AnimatedNumberRef
  onRoomStarHover?: (id: string | null) => void
}

function GalaxyScene({
  starCount,
  dustCount,
  roomStars,
  parallax,
  warpRef,
  fovRef,
  baseFov,
  travel,
  onRoomStarHover,
}: SceneProps) {
  const groupRef = useRef<THREE.Group>(null)
  const spinRef = useRef<THREE.Group>(null)
  const nebulaMeshRefs = useRef<(THREE.Mesh | null)[]>([])
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const gl = useThree((s) => s.gl)
  const pointer = useThree((s) => s.pointer)

  const motion = REDUCED_MOTION ? 0 : 1
  const travelSpeed = REDUCED_MOTION ? 0 : travel

  /* 银河带方向：倾角 −25° */
  const bandDir = useMemo(() => {
    const a = (-25 * Math.PI) / 180
    return new THREE.Vector2(Math.cos(a), Math.sin(a))
  }, [])

  const makeUniforms = () => ({
    uTime: { value: 0 },
    uWarp: { value: 0 },
    uPixelRatio: { value: gl.getPixelRatio() },
    uMotion: { value: motion },
    uTravel: { value: travelSpeed },
  })

  /* 远景银河星点 */
  const stars = useMemo(() => {
    const rand = mulberry32(20210805)
    const pos = new Float32Array(starCount * 3)
    const size = new Float32Array(starCount)
    const color = new Float32Array(starCount * 3)
    const phase = new Float32Array(starCount)
    const twinkle = new Float32Array(starCount)
    const cWarm = new THREE.Color('#f5f0e6')
    const cGold = new THREE.Color('#ffd9a0')
    const cCyan = new THREE.Color('#aee6ff')
    const cViolet = new THREE.Color('#b48cff')
    const perp = new THREE.Vector2(-bandDir.y, bandDir.x)

    for (let i = 0; i < starCount; i++) {
      let x: number
      let y: number
      if (rand() < 0.62) {
        // 沿对角银河带分布（高斯横向散布）
        const t = (rand() * 2 - 1) * 55
        const spread = gaussian(rand) * 7
        x = bandDir.x * t + perp.x * spread
        y = bandDir.y * t + perp.y * spread
      } else {
        x = (rand() * 2 - 1) * 60
        y = (rand() * 2 - 1) * 40
      }
      pos[i * 3] = x
      pos[i * 3 + 1] = y
      pos[i * 3 + 2] = -25 - rand() * 65

      size[i] = 0.6 + rand() * rand() * 2.2
      const pick = rand()
      const c =
        pick < 0.55 ? cWarm : pick < 0.72 ? cGold : pick < 0.88 ? cCyan : cViolet
      color[i * 3] = c.r
      color[i * 3 + 1] = c.g
      color[i * 3 + 2] = c.b
      phase[i] = rand()
      twinkle[i] = rand()
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3))
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1))
    geo.setAttribute('aTwinkle', new THREE.BufferAttribute(twinkle, 1))
    return geo
  }, [starCount, bandDir])

  /* 近景漂浮星尘 */
  const dust = useMemo(() => {
    const rand = mulberry32(20120520)
    const pos = new Float32Array(dustCount * 3)
    const size = new Float32Array(dustCount)
    const color = new Float32Array(dustCount * 3)
    const phase = new Float32Array(dustCount)
    const twinkle = new Float32Array(dustCount)
    const c = new THREE.Color('#f5f0e6')
    for (let i = 0; i < dustCount; i++) {
      pos[i * 3] = (rand() * 2 - 1) * 30
      pos[i * 3 + 1] = (rand() * 2 - 1) * 20
      pos[i * 3 + 2] = -8 - rand() * 20
      size[i] = 0.5 + rand() * 1.1
      color[i * 3] = c.r
      color[i * 3 + 1] = c.g
      color[i * 3 + 2] = c.b
      phase[i] = rand()
      twinkle[i] = 0.6 + rand() * 0.4
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3))
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1))
    geo.setAttribute('aTwinkle', new THREE.BufferAttribute(twinkle, 1))
    return geo
  }, [dustCount])

  /* 流动星云粒子：体积感更强，偏青蓝 / 玫瑰，像参考视频里的气体云 */
  const nebulaFlow = useMemo(() => {
    const rand = mulberry32(20231117)
    const count = 900
    const pos = new Float32Array(count * 3)
    const size = new Float32Array(count)
    const color = new Float32Array(count * 3)
    const phase = new Float32Array(count)
    const speed = new Float32Array(count)
    const alpha = new Float32Array(count)
    const gray = new THREE.Color('#6a7898')
    const palette = ['#2a5f9e', '#3d2b6e', '#6e2b55', '#1d8bb8'].map((hex) =>
      new THREE.Color(hex).lerp(gray, 0.18),
    )
    const perp = new THREE.Vector2(-bandDir.y, bandDir.x)

    for (let i = 0; i < count; i++) {
      const t = (rand() * 2 - 1) * 58
      const spread = gaussian(rand) * 14
      pos[i * 3] = bandDir.x * t + perp.x * spread
      pos[i * 3 + 1] = bandDir.y * t + perp.y * spread
      pos[i * 3 + 2] = -22 - rand() * 55

      size[i] = 3.4 + rand() * rand() * 8.5
      const c = palette[Math.floor(rand() * palette.length)]
      const dim = 0.65 + rand() * 0.45
      color[i * 3] = c.r * dim
      color[i * 3 + 1] = c.g * dim
      color[i * 3 + 2] = c.b * dim
      phase[i] = rand()
      speed[i] = 0.4 + rand() * 1.2
      alpha[i] = 0.07 + rand() * 0.14
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3))
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1))
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1))
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1))
    return geo
  }, [bandDir])

  /* 书房亮星 */
  const roomStarGeo = useMemo(() => {
    const n = roomStars.length
    if (n === 0) return null
    const rand = mulberry32(20220601)
    const pos = new Float32Array(n * 3)
    const size = new Float32Array(n)
    const color = new Float32Array(n * 3)
    const phase = new Float32Array(n)
    const index = new Float32Array(n)
    const perp = new THREE.Vector2(-bandDir.y, bandDir.x)

    roomStars.forEach((star, i) => {
      // 沿银河带散布在中近景
      const t = ((i + 0.5) / n - 0.5) * 64
      const spread = gaussian(rand) * 5
      pos[i * 3] = bandDir.x * t + perp.x * spread
      pos[i * 3 + 1] = bandDir.y * t + perp.y * spread
      pos[i * 3 + 2] = -18 - rand() * 14
      size[i] = 4.2 + rand() * 1.6
      // 低饱和处理：向暖白混合 62%，只留很浅的色相（与星空视角的朗读者光点一致）
      const c = new THREE.Color(star.color).lerp(new THREE.Color('#f5f0e6'), 0.62)
      color[i * 3] = c.r
      color[i * 3 + 1] = c.g
      color[i * 3 + 2] = c.b
      phase[i] = i / n
      index[i] = i
    })

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3))
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1))
    geo.setAttribute('aIndex', new THREE.BufferAttribute(index, 1))
    return geo
  }, [roomStars, bandDir])

  /* 体积累星云色斑：多层、更亮，青蓝 + 玫瑰（参考视频的气体云，仍守品牌色） */
  const nebulae = useMemo(() => {
    const voidTint = new THREE.Color(0.02, 0.04, 0.1)
    const defs = [
      { color: '#1a6aa8', scale: [88, 52, 1] as const, pos: [-6, 4, -72] as const, opacity: 0.42, spin: 0.018 },
      { color: '#3a1f4e', scale: [56, 38, 1] as const, pos: [18, -10, -60] as const, opacity: 0.28, spin: -0.012 },
      { color: '#0d3a6e', scale: [96, 58, 1] as const, pos: [4, 2, -84] as const, opacity: 0.5, spin: 0.008 },
      { color: '#6e2b55', scale: [44, 30, 1] as const, pos: [-22, -6, -54] as const, opacity: 0.22, spin: -0.02 },
      { color: '#1488aa', scale: [38, 26, 1] as const, pos: [12, 10, -48] as const, opacity: 0.26, spin: 0.025 },
    ]
    return defs.map((d) => {
      const darkened = `#${new THREE.Color(d.color).lerp(voidTint, 0.32).getHexString()}`
      return { ...d, tex: makeNebulaTexture(darkened) }
    })
  }, [])

  const starMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: STAR_VERT,
        fragmentShader: STAR_FRAG,
        uniforms: makeUniforms(),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        defines: { FAR_DRIFT: 1, TRAVEL: 1 },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const dustMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: STAR_VERT,
        fragmentShader: STAR_FRAG,
        uniforms: makeUniforms(),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        defines: { DRIFT: 1, TRAVEL: 1 },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const roomStarMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: ROOM_STAR_VERT,
        fragmentShader: STAR_FRAG,
        uniforms: { ...makeUniforms(), uHoverIndex: { value: -1 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const nebulaFlowMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: NEBULA_FLOW_VERT,
        fragmentShader: NEBULA_FLOW_FRAG,
        uniforms: { ...makeUniforms(), uBandDir: { value: bandDir } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    const warp = warpRef?.current ?? 0
    for (const mat of [starMat, dustMat, roomStarMat, nebulaFlowMat]) {
      mat.uniforms.uTime.value = t
      mat.uniforms.uWarp.value = warp
      mat.uniforms.uPixelRatio.value = gl.getPixelRatio()
      if (mat.uniforms.uTravel) mat.uniforms.uTravel.value = travelSpeed
    }
    // FOV 覆盖（穿越 timeline 写入 fovRef）
    const targetFov = fovRef?.current ?? baseFov
    if (Math.abs(camera.fov - targetFov) > 0.01) {
      camera.fov = targetFov
      camera.updateProjectionMatrix()
    }
    // 视差：鼠标移动 → 镜头反向微移（±12px ≈ ±0.5 世界单位）
    if (parallax && !REDUCED_MOTION && groupRef.current) {
      const g = groupRef.current
      const k = 1 - Math.pow(0.001, delta) // 帧率无关 lerp
      g.position.x += (-pointer.x * 0.9 - g.position.x) * k
      g.position.y += (-pointer.y * 0.6 - g.position.y) * k
    }
    // 银河缓慢自转 + 星云层反向蠕动（参考视频的体积云旋转）
    if (!REDUCED_MOTION && spinRef.current) {
      spinRef.current.rotation.z += delta * 0.016
    }
    nebulae.forEach((n, i) => {
      const mesh = nebulaMeshRefs.current[i]
      if (mesh && !REDUCED_MOTION) mesh.rotation.z += delta * n.spin
    })
  })

  return (
    <group ref={groupRef}>
      <group ref={spinRef}>
      {/* 星云色斑 */}
      {nebulae.map((n, i) => (
        <mesh
          key={i}
          ref={(el) => {
            nebulaMeshRefs.current[i] = el
          }}
          position={n.pos as unknown as [number, number, number]}
        >
          <planeGeometry args={[n.scale[0], n.scale[1]]} />
          <meshBasicMaterial
            map={n.tex}
            transparent
            opacity={n.opacity}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
      {/* 远景银河 */}
      <points geometry={stars} material={starMat} />
      {/* 近景星尘 */}
      <points geometry={dust} material={dustMat} />
      {/* 流动星云粒子带 */}
      <points geometry={nebulaFlow} material={nebulaFlowMat} />
      {/* 书房亮星（悬停提亮 + 回调） */}
      {roomStarGeo && (
        <points
          geometry={roomStarGeo}
          material={roomStarMat}
          onPointerMove={(e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation()
            const idx = e.index ?? -1
            roomStarMat.uniforms.uHoverIndex.value = idx
            onRoomStarHover?.(idx >= 0 ? roomStars[idx].id : null)
          }}
          onPointerOut={() => {
            roomStarMat.uniforms.uHoverIndex.value = -1
            onRoomStarHover?.(null)
          }}
        />
      )}
      </group>
    </group>
  )
}

/* ── 外层组件 ─────────────────────────────────────── */

export default function GalaxyBackdrop({
  starCount = 1800,
  dustCount = 280,
  roomStars = [],
  parallax = true,
  warpRef,
  fovRef,
  baseFov = 60,
  travel = 3.6,
  interactive = true,
  onRoomStarHover,
  className,
  style,
}: GalaxyBackdropProps) {
  return (
    <div
      className={className}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        /* WebGL 不可用时的 CSS 径向渐变 fallback（design.md §2 性能护栏） */
        background:
          'radial-gradient(ellipse 120% 80% at 30% 20%, var(--nebula-violet) 0%, transparent 55%),' +
          'radial-gradient(ellipse 90% 70% at 75% 70%, var(--nebula-rose) 0%, transparent 50%),' +
          'radial-gradient(ellipse 140% 100% at 50% 50%, var(--nebula-mid) 0%, var(--nebula-deep) 45%, var(--void) 100%)',
        ...style,
      }}
    >
      <Canvas
        camera={{ fov: baseFov, position: [0, 0, 10], near: 0.1, far: 220 }}
        dpr={[1, 2]}
        gl={{ antialias: false, alpha: true, powerPreference: 'high-performance' }}
        raycaster={{ params: { Points: { threshold: 2.2 } } as unknown as THREE.RaycasterParameters }}
        style={{ position: 'absolute', inset: 0, pointerEvents: interactive ? 'auto' : 'none' }}
      >
        <GalaxyScene
          starCount={starCount}
          dustCount={dustCount}
          roomStars={roomStars}
          parallax={parallax}
          warpRef={warpRef}
          fovRef={fovRef}
          baseFov={baseFov}
          travel={travel}
          onRoomStarHover={onRoomStarHover}
        />
      </Canvas>
    </div>
  )
}
