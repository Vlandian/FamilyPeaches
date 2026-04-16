function renderHouseMembers(houseId) {
  houseMembersBox.innerHTML = ''

  const house = getHouse(houseId)
  if (!house) {
    houseMembersBox.hidden = true
    return
  }

  const title = document.createElement('h3')
  title.textContent = `Персонажи дома ${house.name}`
  houseMembersBox.appendChild(title)

  const members = getHouseMembers(house.id)
  if (members.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'mutedText'
    empty.textContent = 'Пока никто не относится к этому дому.'
    houseMembersBox.appendChild(empty)
    houseMembersBox.hidden = false
    return
  }

  const list = document.createElement('ul')
  members.forEach(person => {
    const item = document.createElement('li')
    item.textContent = displayName(person)
    list.appendChild(item)
  })

  houseMembersBox.appendChild(list)
  houseMembersBox.hidden = false
}

function resetHouseForm() {
  houseEditIdInput.value = ''
  houseNameInput.value = ''
  houseMottoInput.value = ''
  houseSeatInput.value = ''
  houseDescriptionInput.value = ''
  houseCrestUrlInput.value = ''
  houseCrestFileInput.value = ''
  clearHouseCrestRemoval()
  addHouseBtn.textContent = 'Создать дом'
  cancelHouseEditBtn.hidden = true
  removeHouseCrestBtn.hidden = true
  renderHouseMembers('')
}

function startHouseEdit(houseId) {
  const house = getHouse(houseId)
  if (!house) return

  setPanelOpen(true)
  houseEditIdInput.value = house.id
  houseNameInput.value = house.name
  houseMottoInput.value = house.motto || ''
  houseSeatInput.value = house.seat || ''
  houseDescriptionInput.value = house.description || ''
  houseCrestUrlInput.value = house.crest && !isDataImage(house.crest) ? house.crest : ''
  houseCrestFileInput.value = ''
  clearHouseCrestRemoval()
  addHouseBtn.textContent = 'Сохранить дом'
  cancelHouseEditBtn.hidden = false
  removeHouseCrestBtn.hidden = !house.crest
  renderHouseMembers(house.id)
  houseNameInput.focus()
}

function renderHousesList() {
  housesList.innerHTML = ''

  ;(data.houses || []).forEach(house => {
    const li = document.createElement('li')
    li.className = 'houseItem'

    const img = document.createElement('img')
    img.className = 'houseItemCrest'
    img.src = getHouseCrestSrc(house)
    img.alt = `Герб: ${house.name}`
    img.title = `Открыть дом ${house.name}`
    img.tabIndex = 0
    img.addEventListener('click', () => openHouseDetailsModal(house))
    img.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault()
        openHouseDetailsModal(house)
      }
    })
    img.addEventListener('error', ev => {
      ev.currentTarget.src = PLACEHOLDER_CREST
    }, { once: true })

    const text = document.createElement('div')
    text.className = 'houseItemText'

    const name = document.createElement('span')
    name.className = 'houseItemName'
    name.textContent = house.name

    const members = getHouseMembers(house.id)
    const meta = document.createElement('span')
    meta.className = 'houseItemMeta'
    meta.textContent = members.length
      ? `Персонажи: ${members.map(displayName).join(', ')}`
      : 'Нет персонажей'

    text.appendChild(name)
    text.appendChild(meta)

    const actions = document.createElement('div')
    actions.className = 'houseItemActions'

    const edit = document.createElement('button')
    edit.type = 'button'
    edit.textContent = 'Править'
    edit.addEventListener('click', () => startHouseEdit(house.id))

    const del = document.createElement('button')
    del.type = 'button'
    del.textContent = 'Удалить'
    del.addEventListener('click', () => {
      if (!confirm(`Удалить ${house.name}? У персонажей этого дома назначение будет очищено.`)) return
      if (
        typeof createBackup === 'function' &&
        !createBackup('Перед удалением дома', { quiet: true }) &&
        !confirm('Не удалось создать резервную копию. Удалить дом без резерва?')
      ) {
        return
      }

      data.houses = data.houses.filter(item => item.id !== house.id)
      data.people.forEach(person => {
        if (person.houseId === house.id) person.houseId = ''
      })

      if (houseEditIdInput.value === house.id) resetHouseForm()

      save()
      renderAll()
    })

    actions.appendChild(edit)
    actions.appendChild(del)

    li.appendChild(img)
    li.appendChild(text)
    li.appendChild(actions)
    housesList.appendChild(li)
  })
}
