const remoteStatus = document.getElementById('remoteStatus')
const remoteLoginForm = document.getElementById('remoteLoginForm')
const remoteTreeKeyInput = document.getElementById('remoteTreeKey')
const remoteEmailInput = document.getElementById('remoteEmail')
const remotePasswordInput = document.getElementById('remotePassword')
const remoteGuestInput = document.getElementById('remoteGuest')
const remoteLogoutBtn = document.getElementById('remoteLogoutBtn')
const authPanel = document.getElementById('authPanel')
const authPanelToggle = document.getElementById('authPanelToggle')
const remoteSubmitBtn = remoteLoginForm?.querySelector('button[type="submit"]')

let supabaseClient = null
let remoteUser = null
let remoteRole = null
let remoteCanEdit = false
let remoteTreeId = ''
let remoteTreeVersion = null
let remoteTreeName = ''
let remoteChannel = null
let remoteApplying = false
let remoteSaveTimer = null
let remoteSaveInFlight = false
let remoteSaveQueued = false
let remoteReloadQueued = false
let remoteEntityMode = false
let remoteSnapshot = normalizeData({ people: [], houses: [] })
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

function updateRemoteControls() {
  if (!isSupabaseConfigured()) {
    setRemoteStatus('Общие древа не настроены')
    remoteLoginForm.hidden = true
    remoteLogoutBtn.hidden = true
    if (typeof setTreeReadOnly === 'function') setTreeReadOnly(false)
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
  selectedPersonIds.clear()
  renderAll()
  updateRemoteControls()
  remoteApplying = false
}

function subscribeRemoteTree() {
  if (!supabaseClient || !getRemoteTreeId() || remoteChannel) return

  remoteChannel = supabaseClient
    .channel(`tree-${getRemoteTreeId()}`)
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
        if (remoteSaveInFlight || remoteSaveQueued) {
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
        if (remoteSaveInFlight || remoteSaveQueued) {
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
    .subscribe()
}

async function unsubscribeRemoteTree() {
  if (!supabaseClient || !remoteChannel) return
  await supabaseClient.removeChannel(remoteChannel)
  remoteChannel = null
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

  const errors = await Promise.all([
    upsertEntityRows('tree_people', peopleDiff.changed),
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
