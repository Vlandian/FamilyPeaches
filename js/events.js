function renderAll() {
  syncSelectedPeople()
  syncViewpointPerson()
  syncCurrentYearControl()
  renderHousesList()
  renderList()
  renderGraph()
  updateCardSelectionClasses()
}

panelToggle.addEventListener('click', () => setPanelOpen(!sidePanel.classList.contains('open')))
panelClose.addEventListener('click', () => setPanelOpen(false))
peopleSearchInput.addEventListener('input', renderList)
currentYearInput.addEventListener('change', () => {
  if (!requireEditPermission()) {
    syncCurrentYearControl()
    return
  }

  if (!data.settings) data.settings = {}
  data.settings.currentYear = normalizeCurrentYear(currentYearInput.value)
  save()
  renderAll()
})
cancelHouseEditBtn.addEventListener('click', resetHouseForm)
removeHouseCrestBtn.addEventListener('click', markHouseCrestForRemoval)
houseCrestUrlInput.addEventListener('input', () => {
  if (houseCrestUrlInput.value.trim()) removeHouseCrestBtn.hidden = false
  clearHouseCrestRemoval()
})
houseCrestFileInput.addEventListener('change', () => {
  if (houseCrestFileInput.files?.length) removeHouseCrestBtn.hidden = false
  clearHouseCrestRemoval()
})
addHouseBtn.addEventListener('click', async () => {
  if (!requireEditPermission()) return

  const name = houseNameInput.value.trim()
  const motto = houseMottoInput.value.trim()
  const seat = houseSeatInput.value.trim()
  const description = houseDescriptionInput.value.trim()
  const editingId = houseEditIdInput.value
  const existingHouse = editingId ? getHouse(editingId) : null
  if (!Array.isArray(data.houses)) data.houses = []

  if (!name) {
    alert('Укажите название дома.')
    return
  }

  if (data.houses.some(house => house.id !== editingId && house.name.toLowerCase() === name.toLowerCase())) {
    alert('Дом с таким названием уже есть.')
    return
  }

  let crest = existingHouse?.crest || ''

  try {
    const nextCrest = await getOriginalImageFromUrlOrFile(houseCrestUrlInput, houseCrestFileInput, {
      ownerId: editingId || `house_${uid()}`
    })
    if (removeHouseCrestInput.value === '1') {
      crest = ''
    } else if (nextCrest) {
      crest = nextCrest
    }
  } catch (error) {
    alert(error.message)
    return
  }

  if (existingHouse) {
    existingHouse.name = name
    existingHouse.motto = motto
    existingHouse.seat = seat
    existingHouse.description = description
    existingHouse.crest = crest
    save()
    renderAll()
    resetHouseForm()
    return
  }

  const house = {
    id: uid(),
    name,
    motto,
    seat,
    description,
    crest
  }

  data.houses.push(house)
  save()
  renderAll()

  resetHouseForm()
})

canvasEl.addEventListener('wheel', ev => {
  ev.preventDefault()
  closeContextMenus()

  const zoomDirection = ev.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
  applyTreeZoom(treeZoom * zoomDirection, ev.clientX, ev.clientY)
}, { passive: false })

cardsContainer.addEventListener('click', ev => {
  const card = ev.target.closest('.card')
  if (!card) return
  if (card.dataset.dragging === 'true') return

  const id = card.dataset.id
  const person = getPerson(id)
  if (!person) return

  if (ev.ctrlKey || ev.metaKey) {
    togglePersonSelection(id)
    return
  }

  selectedPersonIds.clear()
  selectedPersonIds.add(id)
  updateCardSelectionClasses()
  openPersonDetailsModal(person)
})

canvasEl.addEventListener('contextmenu', ev => {
  ev.preventDefault()

  const card = ev.target.closest('.card')

  if (card) {
    const person = getPerson(card.dataset.id)
    if (!person) return
    const selectedIds = Array.from(selectedPersonIds)
    const selectedPerson = selectedIds.length === 1 && selectedIds[0] !== person.id
      ? getPerson(selectedIds[0])
      : null
    const selectedName = selectedPerson ? shortText(displayName(selectedPerson), 26) : ''

    const items = [
      { action: 'viewpoint', label: viewpointPersonId === person.id ? 'Убрать точку зрения' : 'Точка зрения' },
      ...(canEditTree()
        ? [
            ...(selectedPerson
              ? [
                  { action: 'selectedAsParent', label: `${selectedName} — родитель` },
                  { action: 'selectedAsChild', label: `${selectedName} — ребёнок` },
                  { action: 'selectedAsSpouse', label: `${selectedName} — супруг(а)` }
                ]
              : []),
            { action: 'toggleEditor', label: 'Опции' },
            { action: 'addChild', label: 'Добавить ребёнка' },
            { action: 'addSpouse', label: 'Добавить супруга' },
            { action: 'delete', label: 'Удалить' }
          ]
        : [])
    ]

    const menu = createContextMenu(ev.clientX, ev.clientY, items)

    menu.addEventListener('click', menuEv => {
      const btn = menuEv.target.closest('button')
      if (!btn) return

      const action = btn.dataset.action
      menu.remove()

      if (action === 'viewpoint') {
        if (viewpointPersonId === person.id) {
          clearViewpointPerson()
        } else {
          setViewpointPerson(person.id)
        }
      } else if (action === 'selectedAsParent' && selectedPerson) {
        assignExistingParent(selectedPerson.id, person.id)
      } else if (action === 'selectedAsChild' && selectedPerson) {
        assignExistingChild(selectedPerson.id, person.id)
      } else if (action === 'selectedAsSpouse' && selectedPerson) {
        assignExistingSpouse(selectedPerson.id, person.id)
      } else if (action === 'toggleEditor' && requireEditPermission()) {
        openPersonModal(person)
      } else if (action === 'addChild' && requireEditPermission()) {
        addChildFor(person)
      } else if (action === 'addSpouse' && requireEditPermission()) {
        addSpouseFor(person)
      } else if (action === 'delete' && requireEditPermission() && confirm('Удалить персонажа?')) {
        deletePerson(person.id)
      }
    })

    window.addEventListener('click', () => menu.remove(), { once: true })
    return
  }

  const items = [
    ...(canEditTree() ? [{ action: 'new', label: 'Создать нового персонажа здесь' }] : []),
    ...(viewpointPersonId ? [{ action: 'clearViewpoint', label: 'Убрать точку зрения' }] : [])
  ]

  if (items.length === 0) return

  const menu = createContextMenu(ev.clientX, ev.clientY, items)

  menu.addEventListener('click', menuEv => {
    const btn = menuEv.target.closest('button')
    if (!btn) return

    const action = btn.dataset.action
    menu.remove()

    if (action === 'clearViewpoint') {
      clearViewpointPerson()
      return
    }

    if (action !== 'new' || !requireEditPermission()) return

    const worldPoint = getWorldPointFromClient(ev.clientX, ev.clientY)
    const person = createBasePerson(
      {
        x: clamp(worldPoint.x - CARD_WIDTH / 2, WORLD_MIN_X, WORLD_MAX_X - CARD_WIDTH),
        y: clamp(worldPoint.y - CARD_LINK_Y, WORLD_MIN_Y, WORLD_MAX_Y)
      }
    )

    savePerson(person, person.pos)
    save()
    renderAll()

    setTimeout(() => openPersonModal(person), 50)
  })

  window.addEventListener('click', () => menu.remove(), { once: true })
})

// Панорамирование: средняя кнопка мыши или Space + drag
let isPanning = false
let panStartX = 0
let panStartY = 0
let scrollStartX = 0
let scrollStartY = 0
let spacePressed = false

window.addEventListener('keydown', ev => {
  if (ev.code === 'Space') spacePressed = true
})

window.addEventListener('keyup', ev => {
  if (ev.code === 'Space') spacePressed = false
})

function startMarqueeSelection(ev) {
  const selectionBox = document.createElement('div')
  selectionBox.className = 'selectionBox'
  document.body.appendChild(selectionBox)

  const startX = ev.clientX
  const startY = ev.clientY
  let moved = false

  try {
    canvasEl.setPointerCapture(ev.pointerId)
  } catch (e) {}

  function move(me) {
    if (Math.abs(me.clientX - startX) > 4 || Math.abs(me.clientY - startY) > 4) {
      moved = true
    }

    const rect = getViewportSelectionRect(startX, startY, me.clientX, me.clientY)
    updateSelectionBox(selectionBox, rect)
  }

  function up(ue) {
    try {
      canvasEl.releasePointerCapture(ev.pointerId)
    } catch (e) {}

    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    selectionBox.remove()

    if (moved) {
      const rect = getViewportSelectionRect(startX, startY, ue.clientX, ue.clientY)
      selectCardsInViewportRect(rect, ev.ctrlKey || ev.metaKey || ev.shiftKey)
    } else {
      clearPersonSelection()
    }
  }

  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  ev.preventDefault()
}

canvasEl.addEventListener('pointerdown', ev => {
  if (
    ev.button === 0 &&
    !spacePressed &&
    !ev.target.closest('.card') &&
    !ev.target.closest('.context-menu')
  ) {
    startMarqueeSelection(ev)
    return
  }

  if (ev.button === 1 || spacePressed) {
    isPanning = true
    panStartX = ev.clientX
    panStartY = ev.clientY
    scrollStartX = canvasEl.scrollLeft
    scrollStartY = canvasEl.scrollTop
    canvasEl.style.cursor = 'grabbing'
    try {
      canvasEl.setPointerCapture(ev.pointerId)
    } catch (e) {}
    ev.preventDefault()
  }
})

canvasEl.addEventListener('mousedown', ev => {
  if (ev.button === 1) ev.preventDefault()
})

canvasEl.addEventListener('auxclick', ev => {
  if (ev.button === 1) ev.preventDefault()
})

window.addEventListener('pointermove', ev => {
  if (!isPanning) return
  const dx = ev.clientX - panStartX
  const dy = ev.clientY - panStartY
  canvasEl.scrollLeft = scrollStartX - dx
  canvasEl.scrollTop = scrollStartY - dy
})

window.addEventListener('pointerup', ev => {
  if (isPanning) {
    isPanning = false
    canvasEl.style.cursor = 'auto'
    try {
      canvasEl.releasePointerCapture(ev.pointerId)
    } catch (e) {}
  }
})
