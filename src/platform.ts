// Сохранение файла у пользователя: в окне Claude — через разрешённую возможность, иначе обычной ссылкой.

interface Downloads {
  save(req: { filename: string; data: Blob | string }): Promise<{ status: string }>
}

type ClaudeHost = { use(name: 'downloads'): Promise<Downloads | null> }

export type SaveOutcome = 'saved' | 'declined' | 'failed'

export async function saveFile(filename: string, data: Blob): Promise<SaveOutcome> {
  const host = (window as unknown as { claude?: ClaudeHost }).claude
  if (host?.use) {
    try {
      const downloads = await host.use('downloads')
      if (downloads) {
        await downloads.save({ filename, data })
        return 'saved'
      }
    } catch (e) {
      const code = (e as { code?: string } | null)?.code
      return code === 'declined' ? 'declined' : 'failed'
    }
  }
  try {
    const url = URL.createObjectURL(data)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return 'saved'
  } catch {
    return 'failed'
  }
}
