const remoteStatus = document.getElementById('remoteStatus')
const remoteLoginForm = document.getElementById('remoteLoginForm')
const remoteTreeKeyInput = document.getElementById('remoteTreeKey')
const remoteEmailInput = document.getElementById('remoteEmail')
const remotePasswordInput = document.getElementById('remotePassword')
const remoteGuestInput = document.getElementById('remoteGuest')
const remoteLogoutBtn = document.getElementById('remoteLogoutBtn')
const authPanel = document.getElementById('authPanel')
const authPanelToggle = document.getElementById('authPanelToggle')
const remotePresenceList = document.getElementById('remotePresenceList')
const remoteSubmitBtn = remoteLoginForm?.querySelector('button[type="submit"]')

let supabaseClient = null
let remoteUser = null
let remoteRole = null
let remoteCanEdit = false
let remoteTreeId = ''
let remoteTreeVersion = null
let remoteTreeName = ''
let remoteDataChannel = null
let remotePresenceChannel = null
let remoteApplying = false
let remoteSaveTimer = null
let remoteSaveInFlight = false
let remoteSaveQueued = false
let remoteReloadQueued = false
let remoteEntityMode = false
let remoteSnapshot = normalizeData({ people: [], houses: [] })
let remotePresenceState = []
let remotePresenceRows = []
let remoteDbPresenceAvailable = true
let remoteEditingPersonId = ''
let remotePresenceTimer = null
let remotePresenceHeartbeatTimer = null
let remotePresencePollTimer = null
let remoteMovingPersonIds = new Set()
const remoteClientId = `client_${uid()}_${Date.now()}`
const remotePresenceSessionId = (() => {
  try {
    const key = 'peaches_presence_session'
    const existing = sessionStorage.getItem(key)
    if (existing) return existing
    const next = `session_${uid()}_${Date.now()}`
    sessionStorage.setItem(key, next)
    return next
  } catch (error) {
    return `session_${uid()}_${Date.now()}`
  }
})()
const REMOTE_PRESENCE_TTL = 18000
const REMOTE_PRESENCE_HEARTBEAT = 5000
const REMOTE_PRESENCE_POLL = 3000
let remoteInitialized = false

function getInitialRemoteTreeKey() {
  return (getUrlRemoteTreeKey() || SUPABASE_CONFIG?.treeId || '').trim()
}

function getUrlRemoteTreeKey() {
  const params = new URLSearchParams(window.location.search)
  return (params.get('tree') || params.get('treeId') || '').trim()
}

function setRemoteTreeUrl(treeId, replace = false) {
  if (!window.history?.pushState) return

  const url = new URL(window.location.href)
  url.searchParams.set('tree', treeId)
  url.searchParams.delete('treeId')

  const method = replace ? 'replaceState' : 'pushState'
  window.history[method]({ remoteTreeId: treeId }, '', url)
}

function clearRemoteTreeUrl(replace = false) {
  if (!window.history?.pushState) return

  const url = new URL(window.location.href)
  url.searchParams.delete('tree')
  url.searchParams.delete('treeId')

  const method = replace ? 'replaceState' : 'pushState'
  window.history[method]({ remoteTreeId: '' }, '', url)
}

function isSupabaseConfigured() {
  return !!(
    window.supabase &&
    SUPABASE_CONFIG?.url &&
    SUPABASE_CONFIG?.anonKey
  )
}

function isRemoteTreeActive() {
  return !!remoteTreeId
}

function getActiveStorageKey() {
  return isRemoteTreeActive() ? `${STORAGE_KEY}_remote_${remoteTreeId}` : STORAGE_KEY
}

function setRemoteStatus(text) {
  if (remoteStatus) remoteStatus.textContent = text
}

function getRemoteTreeId() {
  return remoteTreeId
}

function roleCanEdit(role) {
  return role === 'owner' || role === 'editor'
}

function remoteModeLabel(mode) {
  if (mode === 'editor') return 'редактор'
  if (mode === 'viewer') return 'просмотр'
  return 'гость'
}

function remoteModeDisplayName(mode) {
  if (mode === 'editor') return 'Редактор'
  if (mode === 'viewer') return 'Зритель'
  return 'Гость'
}

function getLocalPresenceMode() {
  if (!remoteUser) return 'guest'
  return remoteCanEdit ? 'editor' : 'viewer'
}

function getLocalPresenceName() {
  return remoteModeDisplayName(getLocalPresenceMode())
}

function getLocalPresenceIdentity() {
  return remotePresenceSessionId
}

function buildPresencePayload() {
  const editingPerson = remoteEditingPersonId ? getPerson(remoteEditingPersonId) : null

  return {
    clientId: remoteClientId,
    sessionId: remotePresenceSessionId,
    identityKey: getLocalPresenceIdentity(),
    name: getLocalPresenceName(),
    mode: getLocalPresenceMode(),
    selectedIds: Array.from(selectedPersonIds),
    editingPersonId: remoteEditingPersonId || '',
    editingPersonName: editingPerson ? displayName(editingPerson) : '',
    at: Date.now()
  }
}

function getPresenceIdentity(person) {
  if (person?.identityKey) return person.identityKey
  if (person?.sessionId) return person.sessionId
  if (person?.userId) return `user:${person.userId}`
  if (person?.name && String(person.name).includes('@')) return `email:${String(person.name).toLowerCase()}`
  return person?.clientId || ''
}

function comparePresencePeople(a, b) {
  const modeOrder = { editor: 0, viewer: 1, guest: 2 }
  const aMode = modeOrder[a?.mode] ?? 3
  const bMode = modeOrder[b?.mode] ?? 3
  if (aMode !== bMode) return aMode - bMode
  return getPresenceIdentity(a).localeCompare(getPresenceIdentity(b), 'ru')
}

function normalizeRemotePresence(rawPeople) {
  const byIdentity = new Map()
  const now = Date.now()

  rawPeople.forEach(person => {
    if (!person?.clientId || person.clientId === remoteClientId) return
    if (Number(person.at || 0) && now - Number(person.at || 0) > REMOTE_PRESENCE_TTL) return

    const identity = getPresenceIdentity(person)
    if (!identity || identity === getLocalPresenceIdentity()) return

    const previous = byIdentity.get(identity)
    if (!previous || Number(person.at || 0) >= Number(previous.at || 0)) {
      byIdentity.set(identity, person)
    }
  })

  return Array.from(byIdentity.values()).sort(comparePresencePeople)
}

function collectRealtimePresencePeople() {
  if (!remotePresenceChannel) return []
  return Object.values(remotePresenceChannel.presenceState()).flat()
}

function collectDbPresencePeople() {
  const now = Date.now()
  const people = []

  remotePresenceRows.forEach(person => {
    if (!person?.at || now - Number(person.at) > REMOTE_PRESENCE_TTL) {
      return
    }

    people.push(person)
  })

  return people
}

function syncRemotePresenceState() {
  remotePresenceState = normalizeRemotePresence([
    ...collectRealtimePresencePeople(),
    ...collectDbPresencePeople()
  ])

  renderRemotePresenceList()
  applyRemotePresenceToCards()
}

function withPresenceDisplayNames(people) {
  const counters = { editor: 0, viewer: 0, guest: 0 }

  return people.map(person => {
    if (person.clientId === remoteClientId || getPresenceIdentity(person) === getLocalPresenceIdentity()) {
      return { ...person, displayName: 'Вы' }
    }

    const mode = person.mode || 'guest'
    counters[mode] = (counters[mode] || 0) + 1

    return {
      ...person,
      displayName: `${remoteModeDisplayName(mode)} ${counters[mode]}`
    }
  })
}

function setRemotePanelOpen(open) {
  if (!authPanel || !authPanelToggle) return

  authPanel.hidden = !open
  authPanel.setAttribute('aria-hidden', open ? 'false' : 'true')
  authPanelToggle.setAttribute('aria-expanded', open ? 'true' : 'false')
}

function syncGuestControls() {
  const guest = !!remoteGuestInput?.checked

  if (remoteEmailInput) remoteEmailInput.disabled = guest
  if (remotePasswordInput) remotePasswordInput.disabled = guest
  if (remoteSubmitBtn) remoteSubmitBtn.textContent = guest ? 'Смотреть' : 'Войти'
}

function renderRemotePresenceList() {
  if (!remotePresenceList) return

  const connected = isRemoteTreeActive()
  remotePresenceList.hidden = !connected
  if (!connected) {
    remotePresenceList.innerHTML = ''
    return
  }

  const local = buildPresencePayload()
  const people = withPresenceDisplayNames([local, ...remotePresenceState])

  remotePresenceList.innerHTML = `
    <div class="remotePresenceTitle">Сейчас в древе</div>
    ${people.map(person => {
      const editing = !!person.editingPersonId
      const selectedCount = Array.isArray(person.selectedIds) ? person.selectedIds.length : 0
      const activity = editing
        ? `редактирует: ${person.editingPersonName || 'персонаж'}`
        : selectedCount > 0
          ? `выбрано карточек: ${selectedCount}`
          : 'смотрит древо'

      return `
        <div class="remotePresenceItem ${editing ? 'editing' : ''}">
          <span class="remotePresenceDot"></span>
          <div>
            <div class="remotePresenceName">${escapeHtml(person.displayName || remoteModeDisplayName(person.mode))}</div>
            <div class="remotePresenceMeta">${escapeHtml(remoteModeLabel(person.mode))} · ${escapeHtml(activity)}</div>
          </div>
        </div>
      `
    }).join('')}
  `
}

function getRemoteCardActivity(personId) {
  const editing = remotePresenceState.find(person => person.editingPersonId === personId)
  if (editing) {
    return {
      type: 'editing',
      label: 'Редактируется'
    }
  }

  const selected = remotePresenceState.find(person => Array.isArray(person.selectedIds) && person.selectedIds.includes(personId))
  if (selected) {
    return {
      type: 'selected',
      label: ''
    }
  }

  return null
}

function applyRemotePresenceToCards() {
  if (!cardsContainer) return

  cardsContainer.querySelectorAll('.card').forEach(card => {
    const activity = getRemoteCardActivity(card.dataset.id)
    card.classList.toggle('remoteSelected', activity?.type === 'selected')
    card.classList.toggle('remoteEditing', activity?.type === 'editing')

    card.querySelector('.remoteActivityBadge')?.remove()
    if (!activity || activity.type !== 'editing') return

    const badge = document.createElement('div')
    badge.className = 'remoteActivityBadge editing'
    badge.textContent = activity.label
    card.appendChild(badge)
  })
}

function handleRemotePresenceSync() {
  syncRemotePresenceState()
}

function disableRemoteDbPresence(error) {
  if (!remoteDbPresenceAvailable) return
  remoteDbPresenceAvailable = false
  console.warn(
    'Таблица tree_presence недоступна. Запустите docs/supabase-presence.sql в Supabase SQL Editor:',
    error?.message || error
  )
}

function presenceRowToPayload(row) {
  return {
    clientId: row.client_id,
    sessionId: row.session_id,
    identityKey: row.session_id,
    name: remoteModeDisplayName(row.mode),
    mode: row.mode || 'guest',
    selectedIds: Array.isArray(row.selected_ids) ? row.selected_ids.map(String) : [],
    editingPersonId: row.editing_person_id || '',
    editingPersonName: row.editing_person_name || '',
    at: row.updated_at ? new Date(row.updated_at).getTime() : Date.now()
  }
}

async function upsertRemotePresenceRow(payload) {
  if (!supabaseClient || !remoteDbPresenceAvailable || !getRemoteTreeId()) return

  const { error } = await supabaseClient
    .from('tree_presence')
    .upsert(
      {
        tree_id: getRemoteTreeId(),
        session_id: remotePresenceSessionId,
        client_id: remoteClientId,
        mode: payload.mode,
        selected_ids: payload.selectedIds,
        editing_person_id: payload.editingPersonId,
        editing_person_name: payload.editingPersonName,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'tree_id,session_id' }
    )

  if (error) disableRemoteDbPresence(error)
}

async function fetchRemotePresenceRows() {
  if (!supabaseClient || !remoteDbPresenceAvailable || !getRemoteTreeId()) return

  const since = new Date(Date.now() - REMOTE_PRESENCE_TTL).toISOString()
  const { data: rows, error } = await supabaseClient
    .from('tree_presence')
    .select('session_id,client_id,mode,selected_ids,editing_person_id,editing_person_name,updated_at')
    .eq('tree_id', getRemoteTreeId())
    .gte('updated_at', since)

  if (error) {
    disableRemoteDbPresence(error)
    return
  }

  remotePresenceRows = (rows || []).map(presenceRowToPayload)
  syncRemotePresenceState()
}

async function removeRemotePresenceRow() {
  if (!supabaseClient || !remoteDbPresenceAvailable || !getRemoteTreeId()) return

  await supabaseClient
    .from('tree_presence')
    .delete()
    .eq('tree_id', getRemoteTreeId())
    .eq('session_id', remotePresenceSessionId)
}

async function trackRemotePresence() {
  if (!isRemoteTreeActive()) return
  const payload = buildPresencePayload()

  if (remotePresenceChannel) {
    try {
      await remotePresenceChannel.track(payload)
    } catch (error) {
      console.warn('Не удалось обновить Supabase Presence:', error?.message || error)
    }
  }

  await upsertRemotePresenceRow(payload)
  renderRemotePresenceList()
}

function startRemotePresenceHeartbeat() {
  clearInterval(remotePresenceHeartbeatTimer)
  clearInterval(remotePresencePollTimer)
  trackRemotePresence()
  fetchRemotePresenceRows()

  remotePresenceHeartbeatTimer = setInterval(() => {
    trackRemotePresence()
  }, REMOTE_PRESENCE_HEARTBEAT)

  remotePresencePollTimer = setInterval(fetchRemotePresenceRows, REMOTE_PRESENCE_POLL)
}

function scheduleRemotePresence() {
  if (!isRemoteTreeActive()) return

  clearTimeout(remotePresenceTimer)
  remotePresenceTimer = setTimeout(trackRemotePresence, 150)
}

function setRemoteEditingPerson(personId) {
  remoteEditingPersonId = personId || ''
  scheduleRemotePresence()
  applyRemotePresenceToCards()
}

function clearRemoteEditingPerson(personId) {
  if (personId && remoteEditingPersonId !== personId) return
  remoteEditingPersonId = ''
  scheduleRemotePresence()
  applyRemotePresenceToCards()
}

function beginRemotePersonMove(personIds = []) {
  remoteMovingPersonIds = new Set((Array.isArray(personIds) ? personIds : []).filter(Boolean).map(String))
}

function endRemotePersonMove() {
  remoteMovingPersonIds.clear()
}

function updateRemoteControls() {
  if (!isSupabaseConfigured()) {
    setRemoteStatus('Общие древа не настроены')
    remoteLoginForm.hidden = true
    remoteLogoutBtn.hidden = true
    if (typeof setTreeReadOnly === 'function') setTreeReadOnly(false)
    renderRemotePresenceList()
    return
  }

  const connected = isRemoteTreeActive()
  const guestConnected = connected && !remoteUser
  const treeLabel = remoteTreeName ? ` · ${remoteTreeName}` : ''

  remoteLoginForm.hidden = connected && !guestConnected
  remoteLogoutBtn.hidden = !connected

  if (!connected) {
    setRemoteStatus('Локальное древо')
    if (typeof setTreeReadOnly === 'function') setTreeReadOnly(false)
    renderRemotePresenceList()
    return
  }

  if (!remoteUser) {
    setRemoteStatus(`Общее древо: гость${treeLabel}`)
  } else if (remoteCanEdit) {
    setRemoteStatus(`Общее древо: редактор${treeLabel}`)
  } else {
    setRemoteStatus(`Общее древо: просмотр${treeLabel}`)
  }

  if (typeof setTreeReadOnly === 'function') setTreeReadOnly(!remoteCanEdit)
  renderRemotePresenceList()
}

function cloneRemoteData(source = data) {
  return normalizeData(cloneTreeData(source))
}

function entityMap(items) {
  return new Map((items || []).map(item => [String(item.id), item]))
}

function entitySignature(item) {
  return JSON.stringify(item || {})
}

function normalizeRemotePeopleRows(rows) {
  return (rows || [])
    .filter(row => row?.id && row?.data)
    .map((row, index) => normalizePerson({ ...row.data, id: row.id }, index))
}

function normalizeRemoteHouseRows(rows) {
  return (rows || [])
    .filter(row => row?.id && row?.data)
    .map((row, index) => normalizeHouse({ ...row.data, id: row.id }, index))
    .filter(house => house.name)
}

function setRemoteSnapshot(nextData = data) {
  remoteSnapshot = cloneRemoteData(nextData)
}

function applyRemoteData(nextData) {
  remoteApplying = true
  data = normalizeData(nextData)
  repairAllRelationships()
  localStorage.setItem(getActiveStorageKey(), JSON.stringify(data))
  selectedPersonIds.clear()
  renderAll()
  updateRemoteControls()
  requestAnimationFrame(centerViewOnTree)
  remoteApplying = false
}

function applyLegacyRemoteTree(row) {
  remoteTreeVersion = Number(row.version || 0)
  remoteTreeName = row.name || ''
  remoteEntityMode = false
  applyRemoteData(row.data || { people: [], houses: [] })
  setRemoteSnapshot()
}

function restoreLocalTree() {
  remoteTreeId = ''
  remoteTreeVersion = null
  remoteTreeName = ''
  remoteRole = null
  remoteCanEdit = false
  remoteEntityMode = false
  remoteSaveInFlight = false
  remoteSaveQueued = false
  remoteReloadQueued = false
  remoteDbPresenceAvailable = true
  remotePresenceRows = []
  remoteSnapshot = normalizeData({ people: [], houses: [] })
  remoteApplying = true
  load()
  selectedPersonIds.clear()
  renderAll()
  updateRemoteControls()
  requestAnimationFrame(centerViewOnTree)
  remoteApplying = false
}

async function refreshRemoteRole() {
  remoteRole = null
  remoteCanEdit = false

  if (!supabaseClient || !remoteUser || !getRemoteTreeId()) {
    updateRemoteControls()
    return
  }

  const { data: rows, error } = await supabaseClient
    .from('tree_members')
    .select('email,role')
    .eq('tree_id', getRemoteTreeId())

  if (error) {
    console.warn('Не удалось проверить роль пользователя:', error.message)
    updateRemoteControls()
    return
  }

  const userEmail = String(remoteUser.email || '').toLowerCase()
  const member = (rows || []).find(row => String(row.email || '').toLowerCase() === userEmail)

  remoteRole = member?.role || null
  remoteCanEdit = roleCanEdit(remoteRole)
  updateRemoteControls()
}

async function loadRemoteTree() {
  if (!supabaseClient || !getRemoteTreeId()) return false

  setRemoteStatus('Загружаю общее древо...')

  const { data: row, error } = await supabaseClient
    .from('trees')
    .select('id,name,data,version')
    .eq('id', getRemoteTreeId())
    .single()

  if (error) {
    setRemoteStatus('Не удалось открыть общее древо')
    alert(error.message || 'Не удалось загрузить общее древо.')
    return false
  }

  remoteTreeVersion = Number(row.version || 0)
  remoteTreeName = row.name || ''

  const [peopleResult, housesResult] = await Promise.all([
    supabaseClient
      .from('tree_people')
      .select('id,data,updated_at')
      .eq('tree_id', getRemoteTreeId()),
    supabaseClient
      .from('tree_houses')
      .select('id,data,updated_at')
      .eq('tree_id', getRemoteTreeId())
  ])

  if (peopleResult.error || housesResult.error) {
    console.warn(
      'Покомпонентные таблицы недоступны, используется старый JSON-режим:',
      peopleResult.error?.message || housesResult.error?.message
    )
    applyLegacyRemoteTree(row)
    subscribeRemoteTree()
    return true
  }

  remoteEntityMode = true
  const nextData = normalizeData({
    people: normalizeRemotePeopleRows(peopleResult.data),
    houses: normalizeRemoteHouseRows(housesResult.data)
  })

  applyRemoteData(nextData)
  setRemoteSnapshot()
  subscribeRemoteTree()
  return true
}

function applyRemotePersonRow(row) {
  if (!row?.id || !row?.data) return

  const nextPerson = normalizePerson({ ...row.data, id: row.id }, data.people.length)
  const currentIndex = data.people.findIndex(person => person.id === nextPerson.id)

  if (currentIndex >= 0) {
    data.people[currentIndex] = nextPerson
  } else {
    data.people.push(nextPerson)
  }

  const snapshotIndex = remoteSnapshot.people.findIndex(person => person.id === nextPerson.id)
  if (snapshotIndex >= 0) {
    remoteSnapshot.people[snapshotIndex] = cloneTreeData(nextPerson)
  } else {
    remoteSnapshot.people.push(cloneTreeData(nextPerson))
  }
}

function applyRemoteHouseRow(row) {
  if (!row?.id || !row?.data) return

  const nextHouse = normalizeHouse({ ...row.data, id: row.id }, data.houses.length)
  const currentIndex = data.houses.findIndex(house => house.id === nextHouse.id)

  if (currentIndex >= 0) {
    data.houses[currentIndex] = nextHouse
  } else {
    data.houses.push(nextHouse)
  }

  const snapshotIndex = remoteSnapshot.houses.findIndex(house => house.id === nextHouse.id)
  if (snapshotIndex >= 0) {
    remoteSnapshot.houses[snapshotIndex] = cloneTreeData(nextHouse)
  } else {
    remoteSnapshot.houses.push(cloneTreeData(nextHouse))
  }
}

function removeRemotePerson(id) {
  data.people = data.people.filter(person => person.id !== id)
  data.people.forEach(person => {
    if (person.spouse === id) person.spouse = null
    person.parents = person.parents.filter(parentId => parentId !== id)
  })
  remoteSnapshot.people = remoteSnapshot.people.filter(person => person.id !== id)
}

function removeRemoteHouse(id) {
  data.houses = data.houses.filter(house => house.id !== id)
  data.people.forEach(person => {
    if (person.houseId === id) person.houseId = ''
  })
  remoteSnapshot.houses = remoteSnapshot.houses.filter(house => house.id !== id)
}

function finishRemoteEntityApply() {
  remoteApplying = true
  repairAllRelationships()
  localStorage.setItem(getActiveStorageKey(), JSON.stringify(data))
  renderAll()
  updateRemoteControls()
  remoteApplying = false
}

function shouldDeferRemoteEntityApply() {
  return remoteSaveInFlight || remoteSaveQueued || remoteMovingPersonIds.size > 0
}

function subscribeRemoteTree() {
  if (!supabaseClient || !getRemoteTreeId() || remoteDataChannel || remotePresenceChannel) return

  remotePresenceChannel = supabaseClient
    .channel(`tree-presence-${getRemoteTreeId()}`, {
      config: {
        presence: { key: remoteClientId }
      }
    })
    .on('presence', { event: 'sync' }, handleRemotePresenceSync)
    .on('presence', { event: 'join' }, handleRemotePresenceSync)
    .on('presence', { event: 'leave' }, handleRemotePresenceSync)
    .subscribe(status => {
      if (status === 'SUBSCRIBED') trackRemotePresence()
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('Presence-канал Supabase не подключился:', status)
      }
    })

  remoteDataChannel = supabaseClient
    .channel(`tree-data-${getRemoteTreeId()}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'trees',
        filter: `id=eq.${getRemoteTreeId()}`
      },
      payload => {
        if (remoteEntityMode) {
          if (payload.new?.name) {
            remoteTreeName = payload.new.name
            updateRemoteControls()
          }
          return
        }

        if (!payload.new || Number(payload.new.version || 0) === remoteTreeVersion) return
        if (remoteSaveInFlight || remoteSaveQueued) return
        applyLegacyRemoteTree(payload.new)
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'tree_people',
        filter: `tree_id=eq.${getRemoteTreeId()}`
      },
      payload => {
        if (!remoteEntityMode) return
        if (shouldDeferRemoteEntityApply()) {
          remoteReloadQueued = true
          return
        }
        if (payload.eventType === 'DELETE') {
          removeRemotePerson(payload.old?.id)
        } else {
          applyRemotePersonRow(payload.new)
        }
        finishRemoteEntityApply()
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'tree_houses',
        filter: `tree_id=eq.${getRemoteTreeId()}`
      },
      payload => {
        if (!remoteEntityMode) return
        if (shouldDeferRemoteEntityApply()) {
          remoteReloadQueued = true
          return
        }
        if (payload.eventType === 'DELETE') {
          removeRemoteHouse(payload.old?.id)
        } else {
          applyRemoteHouseRow(payload.new)
        }
        finishRemoteEntityApply()
      }
    )
    .subscribe(status => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('Realtime-канал данных Supabase не подключился:', status)
      }
    })

  startRemotePresenceHeartbeat()
}

async function unsubscribeRemoteTree() {
  if (!supabaseClient || (!remoteDataChannel && !remotePresenceChannel)) return
  clearTimeout(remotePresenceTimer)
  clearInterval(remotePresenceHeartbeatTimer)
  clearInterval(remotePresencePollTimer)
  await removeRemotePresenceRow()
  if (remotePresenceChannel) await supabaseClient.removeChannel(remotePresenceChannel)
  if (remoteDataChannel) await supabaseClient.removeChannel(remoteDataChannel)
  remotePresenceChannel = null
  remoteDataChannel = null
  remotePresenceState = []
  remotePresenceRows = []
  renderRemotePresenceList()
  applyRemotePresenceToCards()
}

function diffEntities(currentItems, snapshotItems) {
  const current = entityMap(currentItems)
  const snapshot = entityMap(snapshotItems)
  const changed = []
  const removed = []

  current.forEach((item, id) => {
    const oldItem = snapshot.get(id)
    if (!oldItem || entitySignature(item) !== entitySignature(oldItem)) {
      changed.push(item)
    }
  })

  snapshot.forEach((_item, id) => {
    if (!current.has(id)) removed.push(id)
  })

  return { changed, removed }
}

function personWithoutPositionSignature(person) {
  const copy = cloneTreeData(person || {})
  delete copy.pos
  return entitySignature(copy)
}

function isPositionOnlyPersonChange(person) {
  const oldPerson = remoteSnapshot.people.find(item => item.id === person.id)
  if (!oldPerson) return false

  return (
    personWithoutPositionSignature(person) === personWithoutPositionSignature(oldPerson) &&
    entitySignature(person.pos) !== entitySignature(oldPerson.pos)
  )
}

function replacePeopleInDataSet(targetData, people) {
  const peopleById = new Map((people || []).map(person => [person.id, person]))

  targetData.people = targetData.people.map(person => {
    const replacement = peopleById.get(person.id)
    return replacement ? cloneTreeData(replacement) : person
  })
}

async function mergeRemotePositionOnlyPeople(changedPeople) {
  const positionOnlyPeople = changedPeople.filter(isPositionOnlyPersonChange)
  if (positionOnlyPeople.length === 0) return { people: changedPeople, merged: false }

  const ids = positionOnlyPeople.map(person => person.id)
  const { data: rows, error } = await supabaseClient
    .from('tree_people')
    .select('id,data')
    .eq('tree_id', getRemoteTreeId())
    .in('id', ids)

  if (error) {
    console.warn('Не удалось подтянуть свежие карточки перед сохранением позиций:', error.message)
    return { people: changedPeople, merged: false }
  }

  const latestById = new Map((rows || []).map(row => [row.id, row.data]))
  let merged = false

  const people = changedPeople.map(person => {
    if (!ids.includes(person.id)) return person

    const latest = latestById.get(person.id)
    if (!latest) return person

    const mergedPerson = normalizePerson({ ...latest, id: person.id, pos: person.pos }, 0)
    if (entitySignature(mergedPerson) !== entitySignature(person)) merged = true

    return mergedPerson
  })

  return { people, merged }
}

function scheduleRemoteSave() {
  if (!supabaseClient || !remoteUser || !remoteCanEdit || remoteApplying) return
  if (!remoteEntityMode && remoteTreeVersion === null) return

  if (remoteSaveInFlight) {
    remoteSaveQueued = true
    return
  }

  clearTimeout(remoteSaveTimer)
  remoteSaveTimer = setTimeout(saveRemoteTree, 650)
}

function finishRemoteSave() {
  remoteSaveInFlight = false

  if (remoteSaveQueued) {
    remoteSaveQueued = false
    scheduleRemoteSave()
    return
  }

  if (remoteReloadQueued && remoteEntityMode) {
    remoteReloadQueued = false
    loadRemoteTree()
    return
  }

  updateRemoteControls()
}

async function upsertEntityRows(table, items) {
  if (items.length === 0) return null

  const rows = items.map(item => ({
    tree_id: getRemoteTreeId(),
    id: item.id,
    data: item,
    updated_at: new Date().toISOString(),
    updated_by: remoteUser.email
  }))

  const { error } = await supabaseClient
    .from(table)
    .upsert(rows, { onConflict: 'tree_id,id' })

  return error
}

async function deleteEntityRows(table, ids) {
  if (ids.length === 0) return null

  const { error } = await supabaseClient
    .from(table)
    .delete()
    .eq('tree_id', getRemoteTreeId())
    .in('id', ids)

  return error
}

async function saveRemoteEntities() {
  const currentData = cloneRemoteData()
  const peopleDiff = diffEntities(currentData.people, remoteSnapshot.people)
  const houseDiff = diffEntities(currentData.houses, remoteSnapshot.houses)
  const hasChanges =
    peopleDiff.changed.length > 0 ||
    peopleDiff.removed.length > 0 ||
    houseDiff.changed.length > 0 ||
    houseDiff.removed.length > 0

  if (!hasChanges) {
    finishRemoteSave()
    return
  }

  setRemoteStatus('Сохраняю изменения...')

  const mergedPeople = await mergeRemotePositionOnlyPeople(peopleDiff.changed)
  if (mergedPeople.merged) {
    replacePeopleInDataSet(currentData, mergedPeople.people)
    replacePeopleInDataSet(data, mergedPeople.people)
    repairAllRelationships()
    renderAll()
  }

  const errors = await Promise.all([
    upsertEntityRows('tree_people', mergedPeople.people),
    upsertEntityRows('tree_houses', houseDiff.changed),
    deleteEntityRows('tree_people', peopleDiff.removed),
    deleteEntityRows('tree_houses', houseDiff.removed)
  ])

  const error = errors.find(Boolean)
  if (error) {
    setRemoteStatus('Ошибка сохранения')
    alert(error.message || 'Не удалось сохранить изменения.')
    finishRemoteSave()
    return
  }

  await supabaseClient
    .from('trees')
    .update({
      updated_at: new Date().toISOString(),
      updated_by: remoteUser.email
    })
    .eq('id', getRemoteTreeId())

  setRemoteSnapshot(currentData)
  localStorage.setItem(getActiveStorageKey(), JSON.stringify(currentData))
  finishRemoteSave()
}

async function saveLegacyRemoteTree() {
  const nextVersion = remoteTreeVersion + 1
  const payload = cloneTreeData()
  const expectedVersion = remoteTreeVersion

  setRemoteStatus('Сохраняю общее древо...')

  const { data: rows, error } = await supabaseClient
    .from('trees')
    .update({
      data: payload,
      version: nextVersion,
      updated_at: new Date().toISOString(),
      updated_by: remoteUser.email
    })
    .eq('id', getRemoteTreeId())
    .eq('version', expectedVersion)
    .select('id,name,data,version')

  if (error) {
    setRemoteStatus('Ошибка сохранения')
    alert(error.message || 'Не удалось сохранить общее древо.')
    finishRemoteSave()
    return
  }

  if (!rows || rows.length === 0) {
    setRemoteStatus('Повторяю сохранение...')

    const { data: currentRow } = await supabaseClient
      .from('trees')
      .select('id,name,version')
      .eq('id', getRemoteTreeId())
      .single()

    if (currentRow) {
      remoteTreeVersion = Number(currentRow.version || expectedVersion)
      remoteTreeName = currentRow.name || remoteTreeName
    }

    remoteSaveQueued = true
    finishRemoteSave()
    return
  }

  remoteTreeVersion = Number(rows[0].version || nextVersion)
  remoteTreeName = rows[0].name || remoteTreeName
  setRemoteSnapshot()
  finishRemoteSave()
}

async function saveRemoteTree() {
  if (!supabaseClient || !remoteUser || !remoteCanEdit || remoteApplying) return
  if (!remoteEntityMode && remoteTreeVersion === null) return

  if (remoteSaveInFlight) {
    remoteSaveQueued = true
    return
  }

  remoteSaveInFlight = true
  remoteSaveQueued = false

  if (remoteEntityMode) {
    await saveRemoteEntities()
  } else {
    await saveLegacyRemoteTree()
  }
}

async function connectRemoteTree(treeId, email, password, asGuest = false, options = {}) {
  const nextTreeId = String(treeId || '').trim()

  if (!isSupabaseConfigured()) {
    alert('Подключение к общим древам ещё не настроено.')
    return
  }

  if (!nextTreeId) {
    alert('Введите ключ общего древа.')
    return
  }

  if (!asGuest && (!email || !password)) {
    alert('Введите email и пароль.')
    return
  }

  setRemoteStatus('Подключаюсь к общему древу...')

  await unsubscribeRemoteTree()

  remoteUser = null
  remoteTreeId = nextTreeId
  remoteTreeVersion = null
  remoteTreeName = ''
  remoteRole = asGuest ? 'guest' : null
  remoteCanEdit = false
  remoteEntityMode = false
  remoteSaveInFlight = false
  remoteSaveQueued = false
  remoteReloadQueued = false
  remoteSnapshot = normalizeData({ people: [], houses: [] })
  setRemoteTreeUrl(nextTreeId, !!options.replaceUrl)

  if (asGuest) {
    await supabaseClient.auth.signOut()
    const loaded = await loadRemoteTree()
    if (!loaded) restoreLocalTree()
    if (remotePasswordInput) remotePasswordInput.value = ''
    updateRemoteControls()
    return
  }

  const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  })

  if (authError) {
    setRemoteStatus('Ошибка входа')
    alert(authError.message || 'Не удалось войти.')
    return
  }

  remoteUser = authData.user
  remoteRole = null
  remoteCanEdit = false

  await refreshRemoteRole()

  const loaded = await loadRemoteTree()
  if (!loaded) {
    await supabaseClient.auth.signOut()
    remoteUser = null
    restoreLocalTree()
    return
  }

  remotePasswordInput.value = ''
  updateRemoteControls()
}

async function signOutRemote() {
  if (!supabaseClient) return

  clearTimeout(remoteSaveTimer)
  await unsubscribeRemoteTree()
  await supabaseClient.auth.signOut()
  clearRemoteTreeUrl()
  remoteUser = null
  restoreLocalTree()
}

async function initializeRemoteSync() {
  if (remoteInitialized) return
  remoteInitialized = true

  if (remoteTreeKeyInput) remoteTreeKeyInput.value = getInitialRemoteTreeKey()
  syncGuestControls()

  if (authPanelToggle) {
    authPanelToggle.addEventListener('click', () => {
      setRemotePanelOpen(authPanel.hidden)
    })
  }

  if (!isSupabaseConfigured()) {
    updateRemoteControls()
    return
  }

  supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey)

  remoteGuestInput?.addEventListener('change', syncGuestControls)

  remoteLoginForm.addEventListener('submit', ev => {
    ev.preventDefault()
    connectRemoteTree(
      remoteTreeKeyInput.value,
      remoteEmailInput.value.trim(),
      remotePasswordInput.value,
      !!remoteGuestInput?.checked
    )
  })
  remoteLogoutBtn.addEventListener('click', signOutRemote)

  updateRemoteControls()

  const urlTreeKey = getUrlRemoteTreeKey()
  if (urlTreeKey) {
    if (remoteGuestInput) remoteGuestInput.checked = true
    syncGuestControls()
    connectRemoteTree(urlTreeKey, '', '', true, { replaceUrl: true })
  }
}
