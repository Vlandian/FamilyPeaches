const remoteStatus = document.getElementById('remoteStatus')
const remoteLoginForm = document.getElementById('remoteLoginForm')
const remoteEmailInput = document.getElementById('remoteEmail')
const remotePasswordInput = document.getElementById('remotePassword')
const remoteLogoutBtn = document.getElementById('remoteLogoutBtn')

let supabaseClient = null
let remoteUser = null
let remoteTreeVersion = null
let remoteTreeName = ''
let remoteChannel = null
let remoteApplying = false
let remoteSaveTimer = null
let remoteInitialized = false

function isSupabaseConfigured() {
  return !!(
    window.supabase &&
    SUPABASE_CONFIG?.url &&
    SUPABASE_CONFIG?.anonKey &&
    SUPABASE_CONFIG?.treeId
  )
}

function setRemoteStatus(text) {
  if (remoteStatus) remoteStatus.textContent = text
}

function setAuthVisible(visible) {
  remoteLoginForm.hidden = !visible
  remoteLogoutBtn.hidden = visible
}

function setRemoteControlsSignedOut() {
  remoteUser = null
  remoteTreeVersion = null
  remoteTreeName = ''
  const configured = isSupabaseConfigured()
  setAuthVisible(configured)
  setRemoteStatus(configured ? 'Войдите для общего дерева' : 'Локальный режим')
}

function setRemoteControlsSignedIn() {
  setAuthVisible(false)
  setRemoteStatus(`Онлайн: ${remoteUser.email}${remoteTreeName ? ` · ${remoteTreeName}` : ''}`)
}

function getRemoteTreeId() {
  return SUPABASE_CONFIG.treeId
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  selectedPersonIds.clear()
  renderAll()
  setRemoteControlsSignedIn()
  remoteApplying = false
}

async function loadRemoteTree() {
  if (!supabaseClient || !remoteUser) return

  setRemoteStatus('Загружаю общее дерево...')

  const { data: row, error } = await supabaseClient
    .from('trees')
    .select('id,name,data,version')
    .eq('id', getRemoteTreeId())
    .single()

  if (error) {
    setRemoteStatus('Нет доступа к общему дереву')
    alert(error.message || 'Не удалось загрузить общее дерево.')
    return
  }

  applyRemoteTree(row)
  subscribeRemoteTree()
}

function subscribeRemoteTree() {
  if (!supabaseClient || remoteChannel) return

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
  if (!supabaseClient || !remoteUser || remoteApplying || remoteTreeVersion === null) return

  clearTimeout(remoteSaveTimer)
  remoteSaveTimer = setTimeout(saveRemoteTree, 650)
}

async function saveRemoteTree() {
  if (!supabaseClient || !remoteUser || remoteApplying || remoteTreeVersion === null) return

  const nextVersion = remoteTreeVersion + 1
  const payload = cloneTreeData()

  setRemoteStatus('Сохраняю общее дерево...')

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
    alert(error.message || 'Не удалось сохранить общее дерево.')
    return
  }

  if (!rows || rows.length === 0) {
    setRemoteStatus('Дерево изменилось у другого пользователя')
    alert('Дерево уже изменилось у другого пользователя. Сейчас загружу свежую версию, чтобы не затереть чужие правки.')
    await loadRemoteTree()
    return
  }

  remoteTreeVersion = Number(rows[0].version || nextVersion)
  remoteTreeName = rows[0].name || remoteTreeName
  setRemoteControlsSignedIn()
}

async function signInRemote(email, password) {
  if (!supabaseClient) return

  setRemoteStatus('Вхожу...')

  const { data: authData, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  })

  if (error) {
    setRemoteStatus('Ошибка входа')
    alert(error.message || 'Не удалось войти.')
    return
  }

  remoteUser = authData.user
  await loadRemoteTree()
}

async function signOutRemote() {
  if (!supabaseClient) return

  await unsubscribeRemoteTree()
  await supabaseClient.auth.signOut()
  setRemoteControlsSignedOut()
}

async function initializeRemoteSync() {
  if (remoteInitialized) return
  remoteInitialized = true

  if (!isSupabaseConfigured()) {
    setRemoteControlsSignedOut()
    return
  }

  supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey)

  remoteLoginForm.addEventListener('submit', ev => {
    ev.preventDefault()
    signInRemote(remoteEmailInput.value.trim(), remotePasswordInput.value)
  })
  remoteLogoutBtn.addEventListener('click', signOutRemote)

  const { data: sessionData } = await supabaseClient.auth.getSession()
  remoteUser = sessionData.session?.user || null

  if (!remoteUser) {
    setRemoteControlsSignedOut()
    return
  }

  await loadRemoteTree()

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    remoteUser = session?.user || null
    if (remoteUser) {
      loadRemoteTree()
    } else {
      unsubscribeRemoteTree()
      setRemoteControlsSignedOut()
    }
  })
}
