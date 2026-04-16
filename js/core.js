const STORAGE_KEY = 'familyTree_v2'
const LEGACY_STORAGE_KEY = 'familyTree_v1'

let data = { people: [] }

// DOM
const houseEditIdInput = document.getElementById('houseEditId')
const houseNameInput = document.getElementById('houseName')
const houseMottoInput = document.getElementById('houseMotto')
const houseSeatInput = document.getElementById('houseSeat')
const houseDescriptionInput = document.getElementById('houseDescription')
const houseCrestUrlInput = document.getElementById('houseCrestUrl')
const houseCrestFileInput = document.getElementById('houseCrestFile')
const removeHouseCrestInput = document.getElementById('removeHouseCrest')
const addHouseBtn = document.getElementById('addHouseBtn')
const cancelHouseEditBtn = document.getElementById('cancelHouseEditBtn')
const removeHouseCrestBtn = document.getElementById('removeHouseCrestBtn')
const houseMembersBox = document.getElementById('houseMembers')
const housesList = document.getElementById('housesList')

const peopleList = document.getElementById('peopleList')
const svg = document.getElementById('svgCanvas')
const cardsContainer = document.getElementById('cardsContainer')
const treeSpace = document.getElementById('treeSpace')
const treeWorld = document.getElementById('treeWorld')
const canvasEl = document.querySelector('.canvas')
const sidePanel = document.getElementById('sidePanel')
const panelToggle = document.getElementById('panelToggle')
const panelClose = document.getElementById('panelClose')
const peopleSearchInput = document.getElementById('peopleSearch')
const currentYearInput = document.getElementById('currentYearInput')

const WORLD_WIDTH = 30000
const WORLD_HEIGHT = 30000
const WORLD_MIN_X = -15000
const WORLD_MIN_Y = -15000
const WORLD_MAX_X = WORLD_MIN_X + WORLD_WIDTH
const WORLD_MAX_Y = WORLD_MIN_Y + WORLD_HEIGHT
const CARD_WIDTH = 220
const CARD_LINK_Y = 42
const CARD_PARENT_OFFSET = 28
const CHILD_BUS_OFFSET = 42
const MIN_TREE_ZOOM = 0.35
const MAX_TREE_ZOOM = 2.5
const ZOOM_STEP = 1.12
const MAX_PORTRAIT_SIZE = 640
const PLACEHOLDER_PORTRAIT = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320">
  <rect width="320" height="320" fill="#eef2f6"/>
  <circle cx="160" cy="118" r="54" fill="#a9b7c5"/>
  <path d="M62 286c15-67 55-101 98-101s83 34 98 101" fill="#a9b7c5"/>
  <path d="M0 0h320v320H0z" fill="none" stroke="#d8e0e8" stroke-width="16"/>
</svg>
`)}`
const PLACEHOLDER_CREST = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <path d="M80 10l54 20v38c0 38-22 67-54 82-32-15-54-44-54-82V30z" fill="#eef2f6" stroke="#8fa1b3" stroke-width="8"/>
  <path d="M80 35l25 10v23c0 20-10 36-25 46-15-10-25-26-25-46V45z" fill="#a9b7c5"/>
</svg>
`)}`

let treeZoom = 1
const selectedPersonIds = new Set()
let treeReadOnly = false

function uid() {
  return Math.random().toString(36).slice(2, 9)
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function toCanvasX(worldX) {
  return worldX - WORLD_MIN_X
}

function toCanvasY(worldY) {
  return worldY - WORLD_MIN_Y
}

function toWorldX(canvasX) {
  return canvasX + WORLD_MIN_X
}

function toWorldY(canvasY) {
  return canvasY + WORLD_MIN_Y
}

function setTreeWorldSize() {
  treeSpace.style.width = `${WORLD_WIDTH * treeZoom}px`
  treeSpace.style.height = `${WORLD_HEIGHT * treeZoom}px`
  treeWorld.style.width = `${WORLD_WIDTH}px`
  treeWorld.style.height = `${WORLD_HEIGHT}px`
  treeWorld.style.transform = `scale(${treeZoom})`
}

function applyTreeZoom(nextZoom, focusClientX, focusClientY) {
  const previousZoom = treeZoom
  const clampedZoom = clamp(nextZoom, MIN_TREE_ZOOM, MAX_TREE_ZOOM)

  if (clampedZoom === previousZoom) return

  const canvasRect = canvasEl.getBoundingClientRect()
  const spaceOffsetX = treeSpace.offsetLeft
  const spaceOffsetY = treeSpace.offsetTop
  const focusX = focusClientX - canvasRect.left - spaceOffsetX
  const focusY = focusClientY - canvasRect.top - spaceOffsetY
  const worldX = (canvasEl.scrollLeft + focusX) / previousZoom
  const worldY = (canvasEl.scrollTop + focusY) / previousZoom

  treeZoom = clampedZoom
  setTreeWorldSize()

  canvasEl.scrollLeft = worldX * treeZoom - focusX
  canvasEl.scrollTop = worldY * treeZoom - focusY
}

function getWorldPointFromClient(clientX, clientY) {
  const canvasRect = canvasEl.getBoundingClientRect()
  const canvasX = (canvasEl.scrollLeft + clientX - canvasRect.left - treeSpace.offsetLeft) / treeZoom
  const canvasY = (canvasEl.scrollTop + clientY - canvasRect.top - treeSpace.offsetTop) / treeZoom

  return {
    x: clamp(toWorldX(canvasX), WORLD_MIN_X, WORLD_MAX_X),
    y: clamp(toWorldY(canvasY), WORLD_MIN_Y, WORLD_MAX_Y)
  }
}

function centerViewOnTree() {
  if (data.people.length === 0) return

  const xs = data.people.map(person => toCanvasX(person.pos?.x || 0) + CARD_WIDTH / 2)
  const ys = data.people.map(person => toCanvasY(person.pos?.y || 0) + CARD_LINK_Y)
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2

  canvasEl.scrollLeft = centerX * treeZoom - canvasEl.clientWidth / 2
  canvasEl.scrollTop = centerY * treeZoom - canvasEl.clientHeight / 2
}

function centerViewOnPerson(person) {
  if (!person?.pos) return

  const centerX = toCanvasX(person.pos.x) + CARD_WIDTH / 2
  const centerY = toCanvasY(person.pos.y) + CARD_LINK_Y

  canvasEl.scrollLeft = centerX * treeZoom - canvasEl.clientWidth / 2
  canvasEl.scrollTop = centerY * treeZoom - canvasEl.clientHeight / 2
}

function syncSelectedPeople() {
  const existingIds = new Set(data.people.map(person => person.id))
  Array.from(selectedPersonIds).forEach(id => {
    if (!existingIds.has(id)) selectedPersonIds.delete(id)
  })
}

function updateCardSelectionClasses() {
  cardsContainer.querySelectorAll('.card').forEach(card => {
    card.classList.toggle('selected', selectedPersonIds.has(card.dataset.id))
  })
  if (typeof applyRemotePresenceToCards === 'function') applyRemotePresenceToCards()
  if (typeof scheduleRemotePresence === 'function') scheduleRemotePresence()
}

function togglePersonSelection(id) {
  if (selectedPersonIds.has(id)) {
    selectedPersonIds.delete(id)
  } else {
    selectedPersonIds.add(id)
  }

  updateCardSelectionClasses()
}

function clearPersonSelection() {
  selectedPersonIds.clear()
  updateCardSelectionClasses()
}

function canEditTree() {
  return !treeReadOnly
}

function requireEditPermission() {
  if (canEditTree()) return true
  alert('Это дерево открыто только для просмотра. Войдите под пользователем с правом редактирования.')
  return false
}

function updateReadOnlyControls() {
  const editControlIds = [
    'houseName',
    'houseMotto',
    'houseSeat',
    'houseDescription',
    'houseCrestUrl',
    'houseCrestFile',
    'addHouseBtn',
    'cancelHouseEditBtn',
    'removeHouseCrestBtn',
    'currentYearInput',
    'importJsonBtn',
    'resetTreeBtn',
    'importJsonFile'
  ]

  editControlIds.forEach(id => {
    const el = document.getElementById(id)
    if (el) el.disabled = treeReadOnly
  })
}

function setTreeReadOnly(readOnly) {
  treeReadOnly = !!readOnly
  document.body.classList.toggle('readOnlyMode', treeReadOnly)
  updateReadOnlyControls()
}

function getViewportSelectionRect(startX, startY, endX, endY) {
  return {
    left: Math.min(startX, endX),
    top: Math.min(startY, endY),
    right: Math.max(startX, endX),
    bottom: Math.max(startY, endY)
  }
}

function rectsIntersect(a, b) {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top
}

function updateSelectionBox(box, rect) {
  box.style.left = rect.left + 'px'
  box.style.top = rect.top + 'px'
  box.style.width = rect.right - rect.left + 'px'
  box.style.height = rect.bottom - rect.top + 'px'
}

function selectCardsInViewportRect(rect, additive) {
  if (!additive) selectedPersonIds.clear()

  cardsContainer.querySelectorAll('.card').forEach(card => {
    const cardRect = card.getBoundingClientRect()
    if (rectsIntersect(rect, cardRect)) selectedPersonIds.add(card.dataset.id)
  })

  syncSelectedPeople()
  updateCardSelectionClasses()
}

function closeContextMenus() {
  document.querySelectorAll('.context-menu').forEach(n => n.remove())
}

function setPanelOpen(open) {
  sidePanel.classList.toggle('open', open)
  sidePanel.setAttribute('aria-hidden', open ? 'false' : 'true')
  panelToggle.setAttribute('aria-expanded', open ? 'true' : 'false')
  document.body.classList.toggle('panel-open', open)
}

function createContextMenu(clientX, clientY, items) {
  closeContextMenus()

  const menu = document.createElement('div')
  menu.className = 'context-menu'
  menu.style.left = clientX + 'px'
  menu.style.top = clientY + 'px'

  items.forEach(item => {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.action = item.action
    button.textContent = item.label
    menu.appendChild(button)
  })

  document.body.appendChild(menu)

  requestAnimationFrame(() => {
    const margin = 8
    const rect = menu.getBoundingClientRect()
    const left = Math.min(clientX, window.innerWidth - rect.width - margin)
    const top = Math.min(clientY, window.innerHeight - rect.height - margin)

    menu.style.left = Math.max(margin, left) + 'px'
    menu.style.top = Math.max(margin, top) + 'px'
  })

  return menu
}

function toNullableNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function normalizeCurrentYear(value) {
  const year = toNullableNumber(value)
  return year === null ? null : Math.trunc(year)
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, function (s) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[s]
  })
}

function shortText(text, max = 110) {
  const value = String(text || '').trim()
  if (!value) return ''
  return value.length > max ? value.slice(0, max - 1) + '…' : value
}

function normalizeGender(value) {
  return ['male', 'female'].includes(value) ? value : ''
}

function genderName(value) {
  if (value === 'male') return 'Мужской'
  if (value === 'female') return 'Женский'
  return 'Не указан'
}

function getPortraitSrc(person) {
  return person.portrait || PLACEHOLDER_PORTRAIT
}

function normalizePercent(value, fallback = 50) {
  const num = Number(value)
  return Number.isFinite(num) ? clamp(num, 0, 100) : fallback
}

function normalizePortraitZoom(value, fallback = 1) {
  const num = Number(value)
  return Number.isFinite(num) ? clamp(num, 1, 3) : fallback
}

function getPortraitFocus(person) {
  return {
    x: normalizePercent(person?.portraitFocusX, 50),
    y: normalizePercent(person?.portraitFocusY, 35)
  }
}

function getPortraitZoom(person) {
  return normalizePortraitZoom(person?.portraitZoom, 1)
}

function getPortraitObjectPosition(person) {
  const focus = getPortraitFocus(person)
  return `${focus.x}% ${focus.y}%`
}

function getPortraitCropStyle(person) {
  const focus = getPortraitFocus(person)
  const zoom = getPortraitZoom(person)
  return `object-position: ${focus.x}% ${focus.y}%; --portrait-focus-x: ${focus.x}%; --portrait-focus-y: ${focus.y}%; --portrait-zoom: ${zoom};`
}

function isDataImage(value) {
  return String(value || '').startsWith('data:image/')
}

function readImageAsDataUrl(file, maxSize = MAX_PORTRAIT_SIZE, outputType = 'image/jpeg', quality = 0.86) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      const img = new Image()

      img.onload = () => {
        try {
          const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
          const width = Math.max(1, Math.round(img.width * scale))
          const height = Math.max(1, Math.round(img.height * scale))
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')

          if (!ctx) {
            reject(new Error('Браузер не смог подготовить изображение.'))
            return
          }

          canvas.width = width
          canvas.height = height
          ctx.drawImage(img, 0, 0, width, height)
          resolve(canvas.toDataURL(outputType, quality))
        } catch (error) {
          reject(new Error('Не удалось подготовить изображение для сохранения.'))
        }
      }

      img.onerror = () => reject(new Error('Не удалось прочитать изображение.'))
      img.src = reader.result
    }

    reader.onerror = () => reject(new Error('Не удалось открыть файл изображения.'))
    reader.readAsDataURL(file)
  })
}

function readOriginalImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Не удалось открыть файл изображения.'))
    reader.readAsDataURL(file)
  })
}

async function getPortraitFromInputs(existingPortrait, urlInput, fileInput, removeInput) {
  if (removeInput?.checked || removeInput?.value === '1') return ''

  const file = fileInput?.files?.[0]
  if (file) return readImageAsDataUrl(file)

  const url = String(urlInput?.value || '').trim()
  if (url) return url

  return existingPortrait || ''
}

async function getOriginalImageFromUrlOrFile(urlInput, fileInput) {
  const file = fileInput?.files?.[0]
  if (file) return readOriginalImageAsDataUrl(file)

  return String(urlInput?.value || '').trim()
}

function markPortraitForRemoval(hiddenInput, urlInput, fileInput, button) {
  hiddenInput.value = '1'
  urlInput.value = ''
  fileInput.value = ''
  if (button) button.textContent = 'Портрет будет удалён'
}

function clearPortraitRemoval(hiddenInput, button) {
  hiddenInput.value = '0'
  if (button) button.textContent = 'Убрать портрет'
}

function fullName(person) {
  const full = `${person.firstName || ''} ${person.lastName || ''}`.trim()
  return full || 'Без имени'
}

function displayName(person) {
  const name = fullName(person)
  return person.title ? `${person.title} ${name}` : name
}

function getHouse(id) {
  return (data.houses || []).find(house => house.id === id)
}

function getPersonHouse(person) {
  return getHouse(person.houseId)
}

function getHouseName(person) {
  return getPersonHouse(person)?.name || ''
}

function getHouseCrestSrc(house) {
  return house?.crest || PLACEHOLDER_CREST
}

function getHouseMembers(houseId) {
  return data.people.filter(person => person.houseId === houseId)
}

function markHouseCrestForRemoval() {
  removeHouseCrestInput.value = '1'
  houseCrestUrlInput.value = ''
  houseCrestFileInput.value = ''
  removeHouseCrestBtn.textContent = 'Герб будет убран'
}

function clearHouseCrestRemoval() {
  removeHouseCrestInput.value = '0'
  removeHouseCrestBtn.textContent = 'Убрать герб'
}

function relationshipNames(ids) {
  return ids
    .map(id => getPerson(id))
    .filter(Boolean)
    .map(displayName)
}

function getChildren(personId) {
  return data.people.filter(person => person.parents.includes(personId))
}

function personMatchesSearch(person, query) {
  if (!query) return true

  return [
    displayName(person),
    getHouseName(person),
    person.description,
    lifeYears(person)
  ]
    .join(' ')
    .toLowerCase()
    .includes(query)
}

function getCurrentTreeYear() {
  return normalizeCurrentYear(data?.settings?.currentYear)
}

function calculateAge(person) {
  const currentYear = getCurrentTreeYear()
  if (!person?.isAlive || currentYear === null || person.birthYear === null) return null

  const age = currentYear - person.birthYear
  return age >= 0 ? age : null
}

function cardLifeMeta(person) {
  if (!person.isAlive) return lifeYears(person)

  const age = calculateAge(person)
  if (age !== null) return `Возраст: ${age}`
  if (getCurrentTreeYear() !== null) return 'Возраст неизвестен'

  return lifeYears(person)
}

function syncCurrentYearControl() {
  if (!currentYearInput) return
  const currentYear = getCurrentTreeYear()
  const nextValue = currentYear === null ? '' : String(currentYear)
  if (currentYearInput.value !== nextValue) currentYearInput.value = nextValue
}

function renderNameList(names, emptyText) {
  if (names.length === 0) return `<span class="mutedText">${escapeHtml(emptyText)}</span>`
  return names.map(name => `<span>${escapeHtml(name)}</span>`).join('')
}

function lifeYears(person) {
  const birth = person.birthYear
  const death = person.deathYear

  if (birth === null && death === null) {
    return 'Годы неизвестны'
  }

  if (person.isAlive) {
    return birth !== null ? `${birth}–` : 'Годы неизвестны'
  }

  if (birth !== null && death !== null) return `${birth}–${death}`
  if (birth === null && death !== null) return `?–${death}`
  return `${birth}–?`
}
