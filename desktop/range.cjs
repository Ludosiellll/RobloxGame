// Разбор заголовка Range: проигрыватель видео просит файл кусками.
// Возвращает { start, end } (обе границы включительно), null — отдать файл целиком, 'bad' — такого куска в файле нет.

function byteRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec((header ?? '').trim())
  if (!m || (!m[1] && !m[2])) return null
  if (!m[1]) {
    const tail = Number(m[2])
    return tail > 0 ? { start: Math.max(0, size - tail), end: size - 1 } : 'bad'
  }
  const start = Number(m[1])
  const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1
  return start < size && start <= end ? { start, end } : 'bad'
}

module.exports = { byteRange }
