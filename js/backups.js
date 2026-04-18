const BACKUP_STORAGE_KEY = 'familyTree_backups_v1'
const MAX_BACKUPS = 12

const dataToolsToggle = document.getElementById('dataToolsToggle')
const dataToolsPanel = document.getElementById('dataToolsPanel')
const dataToolsClose = document.getElementById('dataToolsClose')
const exportJsonBtn = document.getElementById('exportJsonBtn')
const importJsonBtn = document.getElementById('importJsonBtn')
const importJsonFile = document.getElementById('importJsonFile')
const manualBackupBtn = document.getElementById('manualBackupBtn')
const clearRemoteCacheBtn = document.getElementById('clearRemoteCacheBtn')
const migrateRemoteImagesBtn = document.getElementById('migrateRemoteImagesBtn')
const cleanupRemoteAssetsBtn = document.getElementById('cleanupRemoteAssetsBtn')
const resetTreeBtn = document.getElementById('resetTreeBtn')
const backupsList = document.getElementById('backupsList')

function cloneTreeData(source = data) {
  return JSON.parse(JSON.stringify(source || { people: [], houses: [] }))
}

function buildExportPayload(source = data) {
  return {
    app: 'Peaches family tree',
    version: 2,
    exportedAt: new Date().toISOString(),
    data: cloneTreeData(source)
  }
}

function safeFileDate(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-')
}

function downloadJson(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function getBackups() {
  try {
    const parsed = JSON.parse(localStorage.getItem(BACKUP_STORAGE_KEY))
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    return []
  }
}

function saveBackups(backups) {
  if (!safeLocalStorageSet(BACKUP_STORAGE_KEY, JSON.stringify(backups))) {
    throw new Error('Браузерное хранилище переполнено.')
  }
}

function backupTitle(backup) {
  const date = new Date(backup.createdAt)
  const dateText = Number.isNaN(date.getTime()) ? backup.createdAt : date.toLocaleString()
  return `${dateText} · ${backup.reason || 'Резерв'}`
}

function createBackup(reason = 'Ручной резерв', options = {}) {
  const backup = {
    id: uid(),
    createdAt: new Date().toISOString(),
    reason,
    peopleCount: data.people.length,
    housesCount: (data.houses || []).length,
    data: cloneTreeData()
  }

  let backups = [backup, ...getBackups()].slice(0, MAX_BACKUPS)

  while (backups.length > 0) {
    try {
      saveBackups(backups)
      renderBackupsList()
      return true
    } catch (error) {
      backups = backups.slice(0, -1)
    }
  }

  if (!options.quiet) {
    alert('Не удалось создать резервную копию. Возможно, браузерное хранилище переполнено изображениями.')
  }

  return false
}

function ensureBackupBefore(reason, actionText) {
  if (createBackup(reason, { quiet: true })) return true
  return confirm(`Не удалось создать резервную копию. ${actionText} без резерва?`)
}

function normalizeImportedPayload(payload) {
  const rawData = payload?.data && typeof payload.data === 'object' ? payload.data : payload
  const hasPeople = Array.isArray(rawData?.people)
  const hasHouses = Array.isArray(rawData?.houses)

  if (!hasPeople && !hasHouses) {
    throw new Error('В JSON не найдено дерево: нужны поля people/houses или обёртка data.')
  }

  return normalizeData(rawData)
}

function replaceTree(nextData) {
  data = normalizeData(nextData)
  repairAllRelationships()
  save()
  selectedPersonIds.clear()
  renderAll()
  requestAnimationFrame(centerViewOnTree)
}

function exportCurrentTree() {
  downloadJson(buildExportPayload(), `peaches-tree-${safeFileDate()}.json`)
}

function clearRemoteTreeCaches() {
  const prefixes = [
    `${STORAGE_KEY}_remote_`,
    `${STORAGE_KEY}_remote_meta_`
  ]
  let removed = 0

  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i)
    if (prefixes.some(prefix => key?.startsWith(prefix))) {
      localStorage.removeItem(key)
      removed += 1
    }
  }

  alert(removed > 0
    ? `Локальный кэш общих деревьев очищен. Удалено записей: ${removed}.`
    : 'Локального кэша общих деревьев не найдено.'
  )
}

function clearLegacyRemoteTreeDataCaches() {
  const pattern = new RegExp(`^${STORAGE_KEY}_remote_[0-9a-f-]{36}$`, 'i')
  let removed = 0

  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i)
    if (key && pattern.test(key)) {
      localStorage.removeItem(key)
      removed += 1
    }
  }

  if (removed > 0) {
    console.info(`Удалён старый локальный кэш общих деревьев: ${removed}`)
  }
}

function importTreeFromFile(file) {
  if (!requireEditPermission()) {
    importJsonFile.value = ''
    return
  }

  const reader = new FileReader()

  reader.onload = () => {
    try {
      const nextData = normalizeImportedPayload(JSON.parse(reader.result))
      const peopleCount = nextData.people.length
      const housesCount = (nextData.houses || []).length

      if (!confirm(`Импортировать дерево: персонажей ${peopleCount}, домов ${housesCount}? Текущее дерево будет заменено.`)) {
        return
      }

      if (!ensureBackupBefore('Перед импортом JSON', 'Импортировать')) return

      replaceTree(nextData)
      renderBackupsList()
    } catch (error) {
      alert(error.message || 'Не удалось импортировать JSON.')
    } finally {
      importJsonFile.value = ''
    }
  }

  reader.onerror = () => {
    alert('Не удалось прочитать файл импорта.')
    importJsonFile.value = ''
  }

  reader.readAsText(file)
}

function resetTree() {
  if (!requireEditPermission()) return

  const answer = prompt('Это удалит текущее дерево. Перед сбросом будет создан резерв. Введите СБРОСИТЬ для подтверждения.')
  if (answer !== 'СБРОСИТЬ') return
  if (!ensureBackupBefore('Перед сбросом дерева', 'Сбросить дерево')) return

  replaceTree({ people: [], houses: [] })
  renderBackupsList()
}

function restoreBackup(backup) {
  if (!requireEditPermission()) return

  if (!confirm(`Восстановить резерв "${backupTitle(backup)}"? Текущее дерево будет заменено.`)) return
  if (!ensureBackupBefore('Перед восстановлением резерва', 'Восстановить')) return

  replaceTree(backup.data)
  renderBackupsList()
}

function deleteBackup(backupId) {
  if (!confirm('Удалить эту резервную копию?')) return

  saveBackups(getBackups().filter(backup => backup.id !== backupId))
  renderBackupsList()
}

function downloadBackup(backup) {
  downloadJson(
    {
      app: 'Peaches family tree',
      version: 2,
      exportedAt: backup.createdAt,
      backupReason: backup.reason,
      data: backup.data
    },
    `peaches-backup-${safeFileDate(new Date(backup.createdAt))}.json`
  )
}

function setDataToolsOpen(open) {
  dataToolsPanel.classList.toggle('open', open)
  dataToolsPanel.setAttribute('aria-hidden', open ? 'false' : 'true')
  dataToolsToggle.setAttribute('aria-expanded', open ? 'true' : 'false')
  if (open) renderBackupsList()
}

function renderBackupsList() {
  if (!backupsList) return

  backupsList.innerHTML = ''
  const backups = getBackups()

  if (backups.length === 0) {
    const empty = document.createElement('li')
    empty.className = 'backupItem backupMeta'
    empty.textContent = 'Резервных копий пока нет.'
    backupsList.appendChild(empty)
    return
  }

  backups.forEach(backup => {
    const li = document.createElement('li')
    li.className = 'backupItem'

    const title = document.createElement('div')
    title.className = 'backupTitle'
    title.textContent = backupTitle(backup)

    const meta = document.createElement('div')
    meta.className = 'backupMeta'
    meta.textContent = `Персонажи: ${backup.peopleCount ?? 0} · Дома: ${backup.housesCount ?? 0}`

    const actions = document.createElement('div')
    actions.className = 'backupActions'

    const restore = document.createElement('button')
    restore.type = 'button'
    restore.textContent = 'Восстановить'
    restore.addEventListener('click', () => restoreBackup(backup))

    const download = document.createElement('button')
    download.type = 'button'
    download.textContent = 'Скачать'
    download.addEventListener('click', () => downloadBackup(backup))

    const del = document.createElement('button')
    del.type = 'button'
    del.textContent = 'Удалить'
    del.addEventListener('click', () => deleteBackup(backup.id))

    if (canEditTree()) actions.appendChild(restore)
    actions.appendChild(download)
    actions.appendChild(del)
    li.appendChild(title)
    li.appendChild(meta)
    li.appendChild(actions)
    backupsList.appendChild(li)
  })
}

dataToolsToggle.addEventListener('click', () => setDataToolsOpen(!dataToolsPanel.classList.contains('open')))
dataToolsClose.addEventListener('click', () => setDataToolsOpen(false))
exportJsonBtn.addEventListener('click', exportCurrentTree)
importJsonBtn.addEventListener('click', () => {
  if (!requireEditPermission()) return
  importJsonFile.click()
})
manualBackupBtn.addEventListener('click', () => {
  if (createBackup('Ручной резерв')) alert('Резервная копия создана.')
})
clearRemoteCacheBtn.addEventListener('click', clearRemoteTreeCaches)
migrateRemoteImagesBtn.addEventListener('click', () => {
  if (typeof migrateRemoteBase64Images === 'function') migrateRemoteBase64Images()
})
cleanupRemoteAssetsBtn.addEventListener('click', () => {
  if (typeof cleanupUnusedRemoteAssets === 'function') cleanupUnusedRemoteAssets()
})
resetTreeBtn.addEventListener('click', resetTree)
importJsonFile.addEventListener('change', () => {
  const file = importJsonFile.files?.[0]
  if (file) importTreeFromFile(file)
})
