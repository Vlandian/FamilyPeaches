function normalizePerson(raw, index) {
  const isAlive = typeof raw?.isAlive === 'boolean' ? raw.isAlive : !raw?.deathYear
  const spouses = [
    ...(Array.isArray(raw?.spouses) ? raw.spouses : []),
    raw?.spouse
  ]
    .filter(Boolean)
    .map(String)
  const pos =
    raw?.pos &&
    Number.isFinite(Number(raw.pos.x)) &&
    Number.isFinite(Number(raw.pos.y))
      ? { x: Number(raw.pos.x), y: Number(raw.pos.y) }
      : null

  return {
    id: String(raw?.id || uid()),
    firstName: String(raw?.firstName || '').trim(),
    lastName: String(raw?.lastName || '').trim(),
    title: String(raw?.title || '').trim(),
    gender: normalizeGender(raw?.gender),
    birthYear: toNullableNumber(raw?.birthYear),
    deathYear: isAlive ? null : toNullableNumber(raw?.deathYear),
    isAlive,
    houseId: raw?.houseId ? String(raw.houseId) : '',
    legacyHouse: String(raw?.house || '').trim(),
    description: String(raw?.description || '').trim(),
    portrait: String(raw?.portrait || raw?.imageUrl || '').trim(),
    portraitFocusX: normalizePercent(raw?.portraitFocusX, 50),
    portraitFocusY: normalizePercent(raw?.portraitFocusY, 35),
    portraitZoom: normalizePortraitZoom(raw?.portraitZoom, 1),
    parents: Array.isArray(raw?.parents)
      ? [...new Set(raw.parents.filter(Boolean).map(String))].slice(0, 2)
      : [],
    spouses: [...new Set(spouses)],
    spouse: spouses[0] || null,
    pos: pos || { x: 20 + (index % 4) * 240, y: 20 + Math.floor(index / 4) * 190 }
  }
}

function normalizeHouse(raw, index) {
  return {
    id: String(raw?.id || uid()),
    name: String(raw?.name || raw?.house || `Дом ${index + 1}`).trim(),
    motto: String(raw?.motto || '').trim(),
    seat: String(raw?.seat || raw?.domain || raw?.holding || '').trim(),
    description: String(raw?.description || '').trim(),
    crest: String(raw?.crest || raw?.crestUrl || '').trim()
  }
}

function normalizeSettings(raw) {
  return {
    currentYear: normalizeCurrentYear(raw?.currentYear)
  }
}

function normalizeData(raw) {
  const people = Array.isArray(raw?.people) ? raw.people.map(normalizePerson) : []
  const houses = Array.isArray(raw?.houses)
    ? raw.houses.map(normalizeHouse).filter(house => house.name)
    : []
  const housesByName = new Map(houses.map(house => [house.name.toLowerCase(), house]))

  people.forEach(person => {
    if (!person.legacyHouse) return

    const key = person.legacyHouse.toLowerCase()
    let house = housesByName.get(key)

    if (!house) {
      house = { id: uid(), name: person.legacyHouse, motto: '', seat: '', description: '', crest: '' }
      houses.push(house)
      housesByName.set(key, house)
    }

    if (!person.houseId) person.houseId = house.id
  })

  people.forEach(person => {
    delete person.legacyHouse
  })

  const normalized = {
    people,
    houses,
    settings: normalizeSettings(raw?.settings)
  }

  return normalized
}

function load() {
  try {
    const current = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (current) {
      data = normalizeData(current)
      repairAllRelationships()
      return
    }

    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY))
    data = normalizeData(legacy)
    repairAllRelationships()
  } catch (e) {
    data = normalizeData({ people: [] })
  }
}

function isStorageQuotaError(error) {
  return error?.name === 'QuotaExceededError' || error?.code === 22 || error?.code === 1014
}

const storageQuotaWarningKeys = new Set()

function safeLocalStorageSet(key, value) {
  try {
    localStorage.setItem(key, value)
    return true
  } catch (error) {
    if (isStorageQuotaError(error)) {
      if (!storageQuotaWarningKeys.has(key)) {
        storageQuotaWarningKeys.add(key)
        console.warn('Браузерное хранилище переполнено, локальный кэш не обновлён:', key)
      }
      return false
    }

    throw error
  }
}

function save() {
  if (typeof isRemoteTreeActive === 'function' && isRemoteTreeActive()) {
    if (typeof persistRemoteTreeMeta === 'function') persistRemoteTreeMeta()
    if (typeof scheduleRemoteSave === 'function') scheduleRemoteSave()
    return
  }

  const storageKey = typeof getActiveStorageKey === 'function'
    ? getActiveStorageKey()
    : STORAGE_KEY

  safeLocalStorageSet(storageKey, JSON.stringify(data))
  if (typeof scheduleRemoteSave === 'function') scheduleRemoteSave()
}
