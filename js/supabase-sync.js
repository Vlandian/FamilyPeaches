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
let remoteInitialized = false

function getInitialRemoteTreeKey() {
  return (getUrlRemoteTreeKey() || SUPABASE_CONFIG?.treeId || '').trim()
}

function getUrlRemoteTreeKey() {
  const params = new URLSearchParams(window.location.search)
  return (params.get('tree') || params.get('treeId') || '').trim()
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

function normalizeRemoteTree(row) {
  remoteTreeVersion = Number(row.version || 0)
  remoteTreeName = row.name || ''
  return normalizeData(row.data || { people: [], houses: [] })
}

function applyRemoteTree(row) {
  remoteApplying = true
  data = normalizeRemoteTree(row)
  repairAllRelationships()
  localStorage.setItem(getActiveStorageKey(), JSON.stringify(data))
  selectedPersonIds.clear()
  renderAll()
  updateRemoteControls()
  requestAnimationFrame(centerViewOnTree)
  remoteApplying = false
}

function restoreLocalTree() {
  remoteTreeId = ''
  remoteTreeVersion = null
  remoteTreeName = ''
  remoteRole = null
  remoteCanEdit = false
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

  applyRemoteTree(row)
  subscribeRemoteTree()
  return true
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
        if (!payload.new || Number(payload.new.version || 0) === remoteTreeVersion) return
        applyRemoteTree(payload.new)
      }
    )
    .subscribe()
}

async function unsubscribeRemoteTree() {
  if (!supabaseClient || !remoteChannel) return
  await supabaseClient.removeChannel(remoteChannel)
  remoteChannel = null
}

function scheduleRemoteSave() {
  if (!supabaseClient || !remoteUser || !remoteCanEdit || remoteApplying || remoteTreeVersion === null) return

  clearTimeout(remoteSaveTimer)
  remoteSaveTimer = setTimeout(saveRemoteTree, 650)
}

async function saveRemoteTree() {
  if (!supabaseClient || !remoteUser || !remoteCanEdit || remoteApplying || remoteTreeVersion === null) return

  const nextVersion = remoteTreeVersion + 1
  const payload = cloneTreeData()

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
    .eq('version', remoteTreeVersion)
    .select('id,name,data,version')

  if (error) {
    setRemoteStatus('Ошибка сохранения')
    alert(error.message || 'Не удалось сохранить общее древо.')
    return
  }

  if (!rows || rows.length === 0) {
    setRemoteStatus('Древо изменилось у другого пользователя')
    alert('Древо уже изменилось у другого пользователя. Сейчас загружу свежую версию, чтобы не затереть чужие правки.')
    await loadRemoteTree()
    return
  }

  remoteTreeVersion = Number(rows[0].version || nextVersion)
  remoteTreeName = rows[0].name || remoteTreeName
  updateRemoteControls()
}

async function connectRemoteTree(treeId, email, password, asGuest = false) {
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
    connectRemoteTree(urlTreeKey, '', '', true)
  }
}
