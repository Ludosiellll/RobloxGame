// История изменений для отмены и повтора. Перетаскивание из многих шагов — один шаг отмены.

export class History<T> {
  private past: T[] = []
  private future: T[] = []
  private cur: T
  /** состояние до начала серии промежуточных изменений */
  private base: { value: T } | null = null

  constructor(initial: T, private readonly limit = 100) {
    this.cur = initial
  }

  get present(): T {
    return this.cur
  }
  get canUndo(): boolean {
    return this.past.length > 0 || this.base !== null
  }
  get canRedo(): boolean {
    return this.future.length > 0
  }

  /** transient = промежуточный шаг (тянем мышью): в историю попадёт только итог после seal() или обычного set(). */
  set(next: T, transient = false): void {
    if (transient) {
      if (!this.base) this.base = { value: this.cur }
      this.cur = next
      return
    }
    const from = this.base ? this.base.value : this.cur
    this.base = null
    this.cur = next
    if (JSON.stringify(from) === JSON.stringify(next)) return
    this.past.push(from)
    if (this.past.length > this.limit) this.past.shift()
    this.future = []
  }

  /** Завершить серию промежуточных изменений. */
  seal(): void {
    if (this.base) this.set(this.cur)
  }

  /** Бросить незавершённую серию промежуточных изменений: вернуться к состоянию до неё, в историю ничего не попадает. */
  abort(): void {
    if (!this.base) return
    this.cur = this.base.value
    this.base = null
  }

  undo(): T | null {
    this.seal()
    const prev = this.past.pop()
    if (prev === undefined) return null
    this.future.push(this.cur)
    this.cur = prev
    return prev
  }

  redo(): T | null {
    this.seal()
    const next = this.future.pop()
    if (next === undefined) return null
    this.past.push(this.cur)
    this.cur = next
    return next
  }

  /** Поправить текущее состояние, не делая из этого шага истории: отмена и повтор остаются как были. */
  amend(value: T): void {
    this.cur = value
  }

  /** Заменить всё (открыт другой проект): история очищается. */
  reset(value: T): void {
    this.past = []
    this.future = []
    this.base = null
    this.cur = value
  }
}
