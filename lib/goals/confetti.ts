import type { Options } from 'canvas-confetti'

const GOLD = ['#FFD700', '#FDB931', '#DAA520']

export async function fireCoins(origin: HTMLElement, opts: { big?: boolean } = {}): Promise<void> {
  const rect = origin.getBoundingClientRect()
  const point = {
    x: (rect.left + rect.width / 2) / window.innerWidth,
    y: (rect.top + rect.height / 2) / window.innerHeight,
  }

  const { default: confetti } = await import('canvas-confetti')

  const coin: Options = {
    origin: point,
    colors: GOLD,
    shapes: ['circle'],
    scalar: 1.15,
    gravity: 1.2,
    decay: 0.91,
    ticks: 200,
    zIndex: 2000, // above dialogs and sheets
    disableForReducedMotion: true,
  }

  // The fountain
  confetti({ ...coin, particleCount: 24, angle: 90, spread: 38, startVelocity: 52 })
  confetti({ ...coin, particleCount: 12, angle: 75, spread: 30, startVelocity: 44 })
  confetti({ ...coin, particleCount: 12, angle: 105, spread: 30, startVelocity: 44 })
  window.setTimeout(() => {
    confetti({ ...coin, particleCount: 14, angle: 90, spread: 60, startVelocity: 38, scalar: 0.95 })
  }, 120)

  // Goal reached: cannons from both sides for about a second
  if (opts.big) {
    const end = Date.now() + 1000
    const frame = () => {
      confetti({ ...coin, origin: { x: 0, y: 0.75 }, particleCount: 6, angle: 60, spread: 55, startVelocity: 58 })
      confetti({ ...coin, origin: { x: 1, y: 0.75 }, particleCount: 6, angle: 120, spread: 55, startVelocity: 58 })
      if (Date.now() < end) requestAnimationFrame(frame)
    }
    frame()
  }
}