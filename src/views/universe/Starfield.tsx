import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { UniverseControls } from './controls'
import { makeNebulaTexture } from './textures'

/**
 * 环绕星野背景层（universe.md §1-A，v2 增密版）
 * - 星空球：双层球壳（近层 58–80 / 远层 84–94）上的微星 Points（单次 draw call，
 *   自定义 shader）。80% 暖白 / 15% 青蓝 / 5% 粉；约 12% 是更亮更大的主星。
 *   ~65% 的星带 per-star twinkle：透明度 + 点尺寸随 sin(time+phase) 振荡
 *   （周期 2–8s，相位错开）；约 9 颗最亮主星另有呼吸式明暗（~7s 周期）
 * - 漂浮近景星尘：相机周围 box 内慢速漂移 + 边界回绕（shader 内完成）
 * - 星云晕染：6 块大尺度渐变 sprite（加法混合），绕 Y 轴极缓慢漂移
 *   （8–14 分钟/圈，其中 3 个核心反向漂移）+ 呼吸式明暗（12–20s 周期，相位错开）；
 *   reduced-motion 时静止
 * - 整体底色：双周期缓慢变化——主周期 80s 在 --nebula-deep ↔ --nebula-violet
 *   间渐变，副周期 137s 叠加轻微 cyan 偏移
 * 飞星转场时整体亮度随 controls.dim 降至 0.15。uMotion = 0 时全部静止。
 */

/* 确定性 PRNG，保证星野布局稳定 */
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

const BG_VERT = /* glsl */ `
uniform float uTime;
uniform float uPixelRatio;
uniform float uMotion;
attribute float aSize;
attribute vec3 aColor;
attribute float aPhase;
attribute float aSpeed;
attribute float aAlpha;
attribute float aTwinkle;
attribute float aBreath;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  // 闪烁：透明度 + 点尺寸随 sin(time + phase) 振荡，周期 2–8s，
  // 各星相位错开；reduced-motion 时关闭
  float wave = sin(uTime * aSpeed + aPhase * 6.2831);
  float tw = mix(1.0, 0.55 + 0.45 * wave, aTwinkle * uMotion);
  float twSize = mix(1.0, 0.82 + 0.36 * wave, aTwinkle * uMotion);
  // 亮星呼吸：~7s 周期大振幅明暗（aBreath > 0 的约 9 颗主星）
  float bw = 0.5 + 0.5 * sin(uTime * 0.9 + aPhase * 6.2831);
  float br = mix(1.0, 0.35 + 0.65 * bw, aBreath * uMotion);
  vColor = aColor;
  vAlpha = aAlpha * tw * br;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * twSize * uPixelRatio * (900.0 / max(1.0, -mv.z));
}
`

const BG_FRAG = /* glsl */ `
uniform float uDim;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.08, d);
  gl_FragColor = vec4(vColor, a * vAlpha * uDim);
}
`

const DUST_VERT = /* glsl */ `
uniform float uTime;
uniform float uPixelRatio;
uniform float uMotion;
attribute float aSize;
attribute float aPhase;
attribute vec3 aVel;
varying float vAlpha;

void main() {
  // box 区域（±12）内漂移 + 边界回绕
  vec3 p = position + uTime * aVel * uMotion;
  p = mod(p + 12.0, 24.0) - 12.0;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float tw = 0.6 + 0.4 * sin(uTime * (0.6 + aPhase) + aPhase * 6.2831);
  vAlpha = mix(0.75, tw, uMotion);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uPixelRatio * (34.0 / max(0.6, -mv.z));
}
`

const DUST_FRAG = /* glsl */ `
uniform float uDim;
varying float vAlpha;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  // 柔光斑：大半径低透明度径向衰减（镜头光斑感）
  float a = smoothstep(0.5, 0.0, d);
  a *= a;
  gl_FragColor = vec4(0.96, 0.94, 0.9, a * vAlpha * 0.5 * uDim);
}
`

interface StarfieldProps {
  controls: UniverseControls
  starCount: number
  dustCount: number
  nebulaCount: number
}

export default function Starfield({
  controls,
  starCount,
  dustCount,
  nebulaCount,
}: StarfieldProps) {
  const gl = useThree((s) => s.gl)
  const controlsRef = useRef(controls)
  controlsRef.current = controls

  const makeUniforms = () => ({
    uTime: { value: 0 },
    uPixelRatio: { value: gl.getPixelRatio() },
    uMotion: { value: controls.motion },
    uDim: { value: 1 },
  })

  /* 背景星：半径 84–92 的球壳 */
  const bgGeo = useMemo(() => {
    const rand = mulberry32(20120805)
    const pos = new Float32Array(starCount * 3)
    const size = new Float32Array(starCount)
    const color = new Float32Array(starCount * 3)
    const phase = new Float32Array(starCount)
    const speed = new Float32Array(starCount)
    const alpha = new Float32Array(starCount)
    const twinkle = new Float32Array(starCount)
    const breath = new Float32Array(starCount)
    const bigIdx: number[] = []
    const cWarm = new THREE.Color('#f5f0e6')
    const cCyan = new THREE.Color('#aee6ff')
    const cPink = new THREE.Color('#ffb3c8')

    for (let i = 0; i < starCount; i++) {
      // 均匀球面分布；双层球壳制造纵深（35% 近层 58–80 / 65% 远层 84–94）
      const u = rand() * 2 - 1
      const theta = rand() * Math.PI * 2
      const s = Math.sqrt(1 - u * u)
      const r = rand() < 0.35 ? 58 + rand() * 22 : 84 + rand() * 10
      pos[i * 3] = s * Math.cos(theta) * r
      pos[i * 3 + 1] = u * r
      pos[i * 3 + 2] = s * Math.sin(theta) * r

      // 尺寸/亮度分层：约 12% 是更亮更大的主星，其余微小（近小远大）
      const big = rand() < 0.12
      if (big) bigIdx.push(i)
      size[i] = big ? 0.15 + rand() * 0.16 : 0.05 + rand() * rand() * 0.11
      const pick = rand()
      const c = pick < 0.8 ? cWarm : pick < 0.95 ? cCyan : cPink
      color[i * 3] = c.r
      color[i * 3 + 1] = c.g
      color[i * 3 + 2] = c.b
      phase[i] = rand()
      speed[i] = (Math.PI * 2) / (2 + rand() * 6) // 周期 2–8s
      alpha[i] = big ? 0.75 + rand() * 0.25 : 0.35 + rand() * 0.55
      twinkle[i] = rand() < 0.65 ? 0.35 + rand() * 0.65 : 0 // 约 65% 的星闪烁
    }

    // 约 9 颗最亮主星附加呼吸式明暗（大振幅、~7s 周期，见 BG_VERT）
    bigIdx
      .sort((a, b) => size[b] - size[a])
      .slice(0, 9)
      .forEach((i) => {
        breath[i] = 0.5 + rand() * 0.5
      })

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3))
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1))
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1))
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1))
    geo.setAttribute('aTwinkle', new THREE.BufferAttribute(twinkle, 1))
    geo.setAttribute('aBreath', new THREE.BufferAttribute(breath, 1))
    return geo
  }, [starCount])

  /* 近景漂浮星尘：相机周围 box ±12（初始避开中心 3 以内） */
  const dustGeo = useMemo(() => {
    if (dustCount === 0) return null
    const rand = mulberry32(20121001)
    const pos = new Float32Array(dustCount * 3)
    const size = new Float32Array(dustCount)
    const phase = new Float32Array(dustCount)
    const vel = new Float32Array(dustCount * 3)
    for (let i = 0; i < dustCount; i++) {
      let x = (rand() * 2 - 1) * 12
      let y = (rand() * 2 - 1) * 12
      let z = (rand() * 2 - 1) * 12
      if (Math.hypot(x, y, z) < 3) {
        const k = 3.2 / (Math.hypot(x, y, z) || 1)
        x *= k
        y *= k
        z *= k
      }
      pos[i * 3] = x
      pos[i * 3 + 1] = y
      pos[i * 3 + 2] = z
      size[i] = 0.03 + rand() * 0.05
      phase[i] = rand()
      // 慢速漂移
      vel[i * 3] = (rand() * 2 - 1) * 0.22
      vel[i * 3 + 1] = (rand() * 2 - 1) * 0.16
      vel[i * 3 + 2] = (rand() * 2 - 1) * 0.22
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1))
    geo.setAttribute('aVel', new THREE.BufferAttribute(vel, 3))
    return geo
  }, [dustCount])

  /* 星云色斑：大尺度渐变 sprite（银河带环绕延续），绕 Y 轴极缓慢漂移 + 呼吸明暗 */
  const nebulae = useMemo(() => {
    const defs = [
      { color: '#2a1f55', az: 30, el: 12, scale: 52, opacity: 0.1 },
      { color: '#6e2b55', az: 130, el: -8, scale: 40, opacity: 0.08 },
      { color: '#1b2350', az: 210, el: 18, scale: 60, opacity: 0.12 },
      { color: '#2a1f55', az: 285, el: -16, scale: 44, opacity: 0.08 },
      { color: '#6e2b55', az: 340, el: 28, scale: 34, opacity: 0.06 },
      { color: '#1b2350', az: 80, el: -25, scale: 48, opacity: 0.1 },
    ].slice(0, nebulaCount)
    const rand = mulberry32(20260117)
    // 漂移方向交错：6 块中恰好 3 个核心反向漂移
    const dirs = [1, -1, 1, -1, 1, -1]
    return defs.map((d, i) => {
      const az = (d.az * Math.PI) / 180
      const el = (d.el * Math.PI) / 180
      const r = 78
      return {
        ...d,
        tex: makeNebulaTexture(d.color),
        position: [
          Math.sin(az) * Math.cos(el) * r,
          Math.sin(el) * r,
          -Math.cos(az) * Math.cos(el) * r,
        ] as [number, number, number],
        /** 漂移角速度（rad/s，8–14 分钟一圈，正反向交错） */
        driftSpeed: ((Math.PI * 2) / (480 + rand() * 360)) * dirs[i % dirs.length],
        /** 呼吸明暗周期 12–20s，相位错开 */
        breathPeriod: 12 + rand() * 8,
        phase: rand() * Math.PI * 2,
      }
    })
  }, [nebulaCount])
  const nebulaRefs = useRef<(THREE.Sprite | null)[]>([])

  /* 整体底色：双周期缓慢循环（主 80s deep↔violet，副 137s 叠加 cyan 偏移） */
  const scene = useThree((s) => s.scene)
  const bgColors = useMemo(
    () => ({
      deep: new THREE.Color('#060a1d'),
      violet: new THREE.Color('#241a4a'),
      cyan: new THREE.Color('#0d2a3a'),
      cur: new THREE.Color('#060a1d'),
    }),
    [],
  )
  useEffect(() => {
    scene.background = bgColors.cur
  }, [scene, bgColors])

  const bgMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: BG_VERT,
        fragmentShader: BG_FRAG,
        uniforms: makeUniforms(),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const dustMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: DUST_VERT,
        fragmentShader: DUST_FRAG,
        uniforms: makeUniforms(),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const { dim, motion } = controlsRef.current
    for (const mat of [bgMat, dustMat]) {
      mat.uniforms.uTime.value = t
      mat.uniforms.uPixelRatio.value = gl.getPixelRatio()
      mat.uniforms.uDim.value = dim
    }

    /* 星云：缓慢漂移 + 呼吸明暗（motion=0 时冻结静止） */
    const tm = t * motion
    const dimK = 0.45 + 0.55 * dim
    nebulae.forEach((n, i) => {
      const sp = nebulaRefs.current[i]
      if (!sp) return
      const ang = tm * n.driftSpeed
      const cos = Math.cos(ang)
      const sin = Math.sin(ang)
      sp.position.set(
        n.position[0] * cos + n.position[2] * sin,
        n.position[1] + Math.sin(tm * 0.05 + n.phase) * 2.0,
        -n.position[0] * sin + n.position[2] * cos,
      )
      const breath = 0.72 + 0.28 * Math.sin((tm * Math.PI * 2) / n.breathPeriod + n.phase)
      sp.material.opacity = n.opacity * breath * dimK
    })

    /* 底色双周期循环：主 80s deep → violet（55% 幅度），副 137s 叠加 cyan 偏移（16%） */
    const blend = 0.5 + 0.5 * Math.sin((tm * Math.PI * 2) / 80)
    const blendCyan = 0.5 + 0.5 * Math.sin((tm * Math.PI * 2) / 137 + 1.1)
    bgColors.cur
      .copy(bgColors.deep)
      .lerp(bgColors.violet, blend * 0.55)
      .lerp(bgColors.cyan, blendCyan * 0.16)
      .multiplyScalar(dimK)
  })

  return (
    <group>
      {nebulae.map((n, i) => (
        <sprite
          key={i}
          ref={(s) => {
            nebulaRefs.current[i] = s
          }}
          position={n.position}
          scale={[n.scale, n.scale, 1]}
        >
          <spriteMaterial
            map={n.tex}
            transparent
            opacity={n.opacity}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </sprite>
      ))}
      <points geometry={bgGeo} material={bgMat} />
      {dustGeo && <points geometry={dustGeo} material={dustMat} />}
    </group>
  )
}
