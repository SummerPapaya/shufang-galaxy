import { create } from 'zustand'

/**
 * 全局状态契约
 *
 * 三个视图层级：landing（星河远景）→ universe（星空漫游）→ room（书房详情）。
 * 本 store 是 universe / room 两个并行代理的唯一对接接口，字段与 action 签名保持稳定。
 */

export type View = 'landing' | 'universe' | 'room' | 'library'

export interface AppState {
  /** 当前视图 */
  view: View
  /** 当前打开的书房 id（view === 'room' 时非空） */
  selectedRoomId: string | null
  /** 悬停中的书房星 id（universe 内悬停提示用） */
  hoveredRoomId: string | null
  /**
   * 离开 universe 时的相机朝向（弧度），供返回时恢复：
   * 进入书房/图书馆前由 universe 视图保存，返回后相机恢复该角度。
   */
  universeCamera: { yaw: number; pitch: number } | null
  /**
   * 书房顺序（rooms.json 顺序），由 src/data/rooms.ts 加载完成后写入，
   * nextRoom / prevRoom 按此循环。
   */
  roomOrder: string[]

  /** landing → universe（由 App 层穿越 timeline 完成后调用） */
  enterUniverse: () => void
  /** universe → room（universe 代理完成"飞星"转场后调用） */
  selectRoom: (id: string) => void
  /** room → universe */
  closeRoom: () => void
  /** 设置 / 清除悬停书房星 */
  hoverRoom: (id: string | null) => void
  /** 任意视图 → landing（BrandMark 点击） */
  backToLanding: () => void
  /** universe → library（虫洞越迁） */
  openLibrary: () => void
  /** library → universe（恢复 universeCamera 角度） */
  closeLibrary: () => void
  /** universe 视图在离开前保存相机朝向 */
  setUniverseCamera: (cam: { yaw: number; pitch: number } | null) => void
  /** room 视图内切换：按 roomOrder 循环 */
  nextRoom: () => void
  prevRoom: () => void
  /** 内部：由 rooms 数据层写入顺序 */
  setRoomOrder: (ids: string[]) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  view: 'landing',
  selectedRoomId: null,
  hoveredRoomId: null,
  roomOrder: [],
  universeCamera: null,

  enterUniverse: () => set({ view: 'universe', universeCamera: null }),

  openLibrary: () => set({ view: 'library' }),

  closeLibrary: () => set({ view: 'universe' }),

  setUniverseCamera: (cam) => set({ universeCamera: cam }),

  selectRoom: (id) =>
    set({ view: 'room', selectedRoomId: id, hoveredRoomId: null }),

  closeRoom: () => set({ view: 'universe', selectedRoomId: null }),

  hoverRoom: (id) => set({ hoveredRoomId: id }),

  backToLanding: () =>
    set({ view: 'landing', selectedRoomId: null, hoveredRoomId: null }),

  nextRoom: () => {
    const { roomOrder, selectedRoomId } = get()
    if (roomOrder.length === 0) return
    const idx = selectedRoomId ? roomOrder.indexOf(selectedRoomId) : -1
    const next = roomOrder[(idx + 1) % roomOrder.length]
    set({ selectedRoomId: next, view: 'room' })
  },

  prevRoom: () => {
    const { roomOrder, selectedRoomId } = get()
    if (roomOrder.length === 0) return
    const idx = selectedRoomId ? roomOrder.indexOf(selectedRoomId) : 0
    const prev = roomOrder[(idx - 1 + roomOrder.length) % roomOrder.length]
    set({ selectedRoomId: prev, view: 'room' })
  },

  setRoomOrder: (ids) => set({ roomOrder: ids }),
}))
