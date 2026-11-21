// Холст на весь экран с учётом плотности пикселей; размеры в CSS-пикселях.

export interface Screen {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  portrait: boolean
}

export function fullscreenCanvas(canvas: HTMLCanvasElement, onResize?: (s: Screen) => void): Screen {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas is not available')
  const screen: Screen = { canvas, ctx, width: 0, height: 0, portrait: false }
  const fit = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    screen.width = window.innerWidth
    screen.height = window.innerHeight
    screen.portrait = screen.height > screen.width
    canvas.width = Math.round(screen.width * dpr)
    canvas.height = Math.round(screen.height * dpr)
    canvas.style.width = `${screen.width}px`
    canvas.style.height = `${screen.height}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    onResize?.(screen)
  }
  window.addEventListener('resize', fit)
  fit()
  return screen
}
