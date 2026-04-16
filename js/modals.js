function centerModal(modal) {
  const margin = 24
  const left = Math.max(margin, (window.innerWidth - modal.offsetWidth) / 2)
  const top = Math.max(margin, (window.innerHeight - modal.offsetHeight) / 2)

  modal.style.left = left + 'px'
  modal.style.top = top + 'px'
}

function openHouseDetailsModal(houseRef) {
  const house = typeof houseRef === 'string' ? getHouse(houseRef) : getHouse(houseRef?.id)
  if (!house) return

  document.querySelectorAll('.modal-overlay').forEach(n => n.remove())

  const members = getHouseMembers(house.id).map(displayName)

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'

  const modal = document.createElement('div')
  modal.className = 'modal detailsModal houseDetailsModal'

  modal.innerHTML = `
    <div class="modal-header">
      <h3>Дом</h3>
      <button class="closeBtn">×</button>
    </div>
    <div class="modal-body">
      <div class="houseDetailsStack">
        <img class="detailsCrest" src="${escapeHtml(getHouseCrestSrc(house))}" alt="Герб: ${escapeHtml(house.name)}">
        <h2>${escapeHtml(house.name)}</h2>
        <p class="detailsMotto">${house.motto ? `«${escapeHtml(house.motto)}»` : '<span class="mutedText">Девиз не указан</span>'}</p>
        <p class="detailsHouse">${house.seat ? `Вотчина: ${escapeHtml(house.seat)}` : '<span class="mutedText">Вотчина не указана</span>'}</p>

        <section class="detailsSection">
          <h4>Описание</h4>
          <p>${house.description ? escapeHtml(house.description) : '<span class="mutedText">Нет описания</span>'}</p>
        </section>

        <section class="detailsSection">
          <h4>Персонажи дома</h4>
          <div class="detailsMemberList">${renderNameList(members, 'Пока никто не относится к этому дому')}</div>
        </section>
      </div>

      <div class="modalActions">
        ${canEditTree() ? '<button id="houseDetailsEdit">Редактировать дом</button>' : ''}
        <button id="houseDetailsClose">Закрыть</button>
      </div>
    </div>
  `

  overlay.appendChild(modal)
  document.body.appendChild(overlay)

  requestAnimationFrame(() => {
    centerModal(modal)
  })

  modal.querySelector('.detailsCrest').addEventListener('error', ev => {
    ev.currentTarget.src = PLACEHOLDER_CREST
  }, { once: true })

  const houseDetailsEdit = modal.querySelector('#houseDetailsEdit')
  if (houseDetailsEdit) {
    houseDetailsEdit.addEventListener('click', () => {
      overlay.remove()
      startHouseEdit(house.id)
    })
  }
  modal.querySelector('#houseDetailsClose').addEventListener('click', () => overlay.remove())
  modal.querySelector('.closeBtn').addEventListener('click', () => overlay.remove())

  const header = modal.querySelector('.modal-header')
  header.addEventListener('pointerdown', ev => {
    if (ev.target.closest('button')) return

    header.setPointerCapture(ev.pointerId)
    const startX = ev.clientX
    const startY = ev.clientY
    const origLeft = parseInt(modal.style.left || 0, 10)
    const origTop = parseInt(modal.style.top || 0, 10)

    function move(me) {
      const margin = 12
      modal.style.left = Math.max(margin, origLeft + (me.clientX - startX)) + 'px'
      modal.style.top = Math.max(margin, origTop + (me.clientY - startY)) + 'px'
    }

    function up() {
      try {
        header.releasePointerCapture(ev.pointerId)
      } catch (e) {}
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  })
}

function openPersonDetailsModal(person) {
  document.querySelectorAll('.modal-overlay').forEach(n => n.remove())

  const parents = relationshipNames(person.parents || [])
  const spouse = person.spouse ? getPerson(person.spouse) : null
  const children = getChildren(person.id).map(displayName)
  const house = getPersonHouse(person)

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'

  const modal = document.createElement('div')
  modal.className = 'modal detailsModal'

  modal.innerHTML = `
    <div class="modal-header">
      <h3>${escapeHtml(displayName(person))}</h3>
      <button class="closeBtn">×</button>
    </div>
    <div class="modal-body">
      <div class="detailsLayout">
        <div class="detailsPortraitFrame ${person.isAlive ? '' : 'dead'}">
          <img class="detailsPortrait" src="${escapeHtml(getPortraitSrc(person))}" alt="Портрет: ${escapeHtml(fullName(person))}">
        </div>
        <div class="detailsInfo">
          <p class="detailsMeta">${escapeHtml(lifeYears(person))}</p>
          <p class="detailsMeta">Пол: ${escapeHtml(genderName(person.gender))}</p>
          <div class="statusPill ${person.isAlive ? 'alive' : 'dead'}">${person.isAlive ? 'Жив' : 'Умер'}</div>
          ${house ? `<p class="detailsHouse">Дом: ${escapeHtml(house.name)}</p>` : ''}

          <section class="detailsSection">
            <h4>Описание</h4>
            <p>${person.description ? escapeHtml(person.description) : '<span class="mutedText">Нет описания</span>'}</p>
          </section>

          <section class="detailsSection">
            <h4>Связи</h4>
            <dl class="relationshipList">
              <dt>Родители</dt>
              <dd>${renderNameList(parents, 'Не указаны')}</dd>
              <dt>Супруг(а)</dt>
              <dd>${spouse ? `<span>${escapeHtml(displayName(spouse))}</span>` : '<span class="mutedText">Не указан(а)</span>'}</dd>
              <dt>Дети</dt>
              <dd>${renderNameList(children, 'Не указаны')}</dd>
            </dl>
          </section>
        </div>
      </div>

      <div class="modalActions">
        ${canEditTree() ? '<button id="detailsEdit">Опции</button>' : ''}
        ${canEditTree() ? '<button id="detailsAddChild">Добавить ребёнка</button>' : ''}
        ${canEditTree() ? '<button id="detailsAddSpouse">Добавить супруга</button>' : ''}
        <button id="detailsClose">Закрыть</button>
      </div>
    </div>
  `

  overlay.appendChild(modal)
  document.body.appendChild(overlay)

  requestAnimationFrame(() => {
    centerModal(modal)
  })

  modal.querySelector('.detailsPortrait').addEventListener('error', ev => {
    ev.currentTarget.src = PLACEHOLDER_PORTRAIT
  }, { once: true })

  const detailsEdit = modal.querySelector('#detailsEdit')
  if (detailsEdit) {
    detailsEdit.addEventListener('click', () => {
      overlay.remove()
      openPersonModal(person)
    })
  }
  const detailsAddChild = modal.querySelector('#detailsAddChild')
  if (detailsAddChild) {
    detailsAddChild.addEventListener('click', () => {
      overlay.remove()
      addChildFor(person)
    })
  }
  const detailsAddSpouse = modal.querySelector('#detailsAddSpouse')
  if (detailsAddSpouse) {
    detailsAddSpouse.addEventListener('click', () => {
      overlay.remove()
      addSpouseFor(person)
    })
  }
  modal.querySelector('#detailsClose').addEventListener('click', () => overlay.remove())
  modal.querySelector('.closeBtn').addEventListener('click', () => overlay.remove())

  const header = modal.querySelector('.modal-header')
  header.addEventListener('pointerdown', ev => {
    if (ev.target.closest('button')) return

    header.setPointerCapture(ev.pointerId)
    const startX = ev.clientX
    const startY = ev.clientY
    const origLeft = parseInt(modal.style.left || 0, 10)
    const origTop = parseInt(modal.style.top || 0, 10)

    function move(me) {
      const margin = 12
      modal.style.left = Math.max(margin, origLeft + (me.clientX - startX)) + 'px'
      modal.style.top = Math.max(margin, origTop + (me.clientY - startY)) + 'px'
    }

    function up() {
      try {
        header.releasePointerCapture(ev.pointerId)
      } catch (e) {}
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  })
}

function openPersonModal(person) {
  if (!requireEditPermission()) return
  if (typeof setRemoteEditingPerson === 'function') setRemoteEditingPerson(person.id)

  document.querySelectorAll('.modal-overlay').forEach(n => n.remove())

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  const originalOverlayRemove = overlay.remove.bind(overlay)
  overlay.remove = () => {
    if (typeof clearRemoteEditingPerson === 'function') clearRemoteEditingPerson(person.id)
    originalOverlayRemove()
  }

  const modal = document.createElement('div')
  modal.className = 'modal'

  modal.innerHTML = `
    <div class="modal-header">
      <h3>Настройки: ${escapeHtml(fullName(person))}</h3>
      <button class="closeBtn">×</button>
    </div>
    <div class="modal-body">
      <label>Имя
        <input name="firstName" value="${escapeHtml(person.firstName)}">
      </label>

      <label>Фамилия
        <input name="lastName" value="${escapeHtml(person.lastName || '')}">
      </label>

      <label>Титул
        <input name="title" value="${escapeHtml(person.title || '')}">
      </label>

      <label>Пол
        <select name="gender">
          <option value="" ${!person.gender ? 'selected' : ''}>-- не указан --</option>
          <option value="male" ${person.gender === 'male' ? 'selected' : ''}>Мужской</option>
          <option value="female" ${person.gender === 'female' ? 'selected' : ''}>Женский</option>
        </select>
      </label>

      <div class="row">
        <div class="col">
          <label>Год рождения
            <input name="birthYear" type="number" value="${person.birthYear ?? ''}">
          </label>
        </div>
        <div class="col">
          <label>Год смерти
            <input name="deathYear" type="number" value="${person.deathYear ?? ''}">
          </label>
        </div>
      </div>

      <label class="inlineCheck">
        <input name="isAlive" type="checkbox" ${person.isAlive ? 'checked' : ''}>
        <span>Персонаж жив</span>
      </label>

      <label>Дом / Род
        <select name="houseId">
          <option value="">-- не указан --</option>
          ${data.houses.map(house => `<option value="${escapeHtml(house.id)}" ${house.id === person.houseId ? 'selected' : ''}>${escapeHtml(house.name)}</option>`).join('')}
        </select>
      </label>

      <label>Краткое описание
        <textarea name="description" rows="5">${escapeHtml(person.description || '')}</textarea>
      </label>

      <img class="portraitPreview" src="${escapeHtml(getPortraitSrc(person))}" alt="Портрет: ${escapeHtml(fullName(person))}">

      <label>Портрет по URL
        <input name="portraitUrl" type="url" value="${person.portrait && !isDataImage(person.portrait) ? escapeHtml(person.portrait) : ''}">
      </label>

      <label>Портрет с компьютера
        <input name="portraitFile" type="file" accept="image/*">
      </label>

      <input name="removePortrait" type="hidden" value="0">
      <button type="button" class="secondaryBtn" id="modalRemovePortrait">Убрать портрет</button>

      <label>Супруг
        <select name="spouse">
          <option value="">-- нет --</option>
        </select>
      </label>

      <label>Родители (Ctrl/Command, максимум 2)
        <select name="parents" multiple size="6"></select>
      </label>

      <div style="margin-top:8px;display:flex;gap:8px;justify-content:flex-end">
        <button id="modalSave">Сохранить</button>
        <button id="modalCancel">Отмена</button>
      </div>
    </div>
  `

  overlay.appendChild(modal)
  document.body.appendChild(overlay)

  requestAnimationFrame(() => {
    centerModal(modal)
  })

  const firstNameField = modal.querySelector('input[name="firstName"]')
  const lastNameField = modal.querySelector('input[name="lastName"]')
  const titleField = modal.querySelector('input[name="title"]')
  const genderField = modal.querySelector('select[name="gender"]')
  const birthYearField = modal.querySelector('input[name="birthYear"]')
  const deathYearField = modal.querySelector('input[name="deathYear"]')
  const isAliveField = modal.querySelector('input[name="isAlive"]')
  const houseField = modal.querySelector('select[name="houseId"]')
  const descriptionField = modal.querySelector('textarea[name="description"]')
  const portraitUrlField = modal.querySelector('input[name="portraitUrl"]')
  const portraitFileField = modal.querySelector('input[name="portraitFile"]')
  const removePortraitField = modal.querySelector('input[name="removePortrait"]')
  const removePortraitButton = modal.querySelector('#modalRemovePortrait')
  const portraitPreview = modal.querySelector('.portraitPreview')
  const spouseField = modal.querySelector('select[name="spouse"]')
  const parentsField = modal.querySelector('select[name="parents"]')

  portraitPreview.addEventListener('error', ev => {
    ev.currentTarget.src = PLACEHOLDER_PORTRAIT
  }, { once: true })
  removePortraitButton.addEventListener('click', () => {
    markPortraitForRemoval(removePortraitField, portraitUrlField, portraitFileField, removePortraitButton)
    portraitPreview.src = PLACEHOLDER_PORTRAIT
  })
  portraitUrlField.addEventListener('input', () => clearPortraitRemoval(removePortraitField, removePortraitButton))
  portraitFileField.addEventListener('change', () => clearPortraitRemoval(removePortraitField, removePortraitButton))

  data.people.forEach(other => {
    if (other.id === person.id) return

    const spouseOption = document.createElement('option')
    spouseOption.value = other.id
    spouseOption.textContent = displayName(other)
    spouseField.appendChild(spouseOption)

    const parentOption = document.createElement('option')
    parentOption.value = other.id
    parentOption.textContent = displayName(other)
    parentsField.appendChild(parentOption)
  })

  spouseField.value = person.spouse || ''
  Array.from(parentsField.options).forEach(option => {
    option.selected = person.parents.includes(option.value)
  })
  setRelationshipOptionAvailability(person.id, parentsField, spouseField)

  syncDeathYearState(isAliveField, deathYearField)
  isAliveField.addEventListener('change', () => syncDeathYearState(isAliveField, deathYearField))

  modal.querySelector('#modalSave').addEventListener('click', async () => {
    let portrait = ''

    try {
      portrait = await getPortraitFromInputs(
        person.portrait || '',
        portraitUrlField,
        portraitFileField,
        removePortraitField
      )
    } catch (error) {
      alert(error.message)
      return
    }

    const updated = {
      id: person.id,
      firstName: firstNameField.value.trim(),
      lastName: lastNameField.value.trim(),
      title: titleField.value.trim(),
      gender: normalizeGender(genderField.value),
      birthYear: toNullableNumber(birthYearField.value),
      deathYear: isAliveField.checked ? null : toNullableNumber(deathYearField.value),
      isAlive: isAliveField.checked,
      houseId: houseField.value || '',
      description: descriptionField.value.trim(),
      portrait,
      parents: Array.from(parentsField.selectedOptions).map(o => o.value),
      spouse: spouseField.value || null
    }

    if (!validatePerson(updated)) return

    savePerson(updated, person.pos)
    save()
    renderAll()
    overlay.remove()
  })

  modal.querySelector('#modalCancel').addEventListener('click', () => overlay.remove())
  modal.querySelector('.closeBtn').addEventListener('click', () => overlay.remove())

  const header = modal.querySelector('.modal-header')
  header.addEventListener('pointerdown', ev => {
    if (ev.target.closest('button')) return

    header.setPointerCapture(ev.pointerId)

    const startX = ev.clientX
    const startY = ev.clientY
    const origLeft = parseInt(modal.style.left || 0, 10)
    const origTop = parseInt(modal.style.top || 0, 10)

    function move(me) {
      const margin = 12
      const nextLeft = origLeft + (me.clientX - startX)
      const nextTop = origTop + (me.clientY - startY)

      modal.style.left = Math.max(margin, nextLeft) + 'px'
      modal.style.top = Math.max(margin, nextTop) + 'px'
    }

    function up() {
      try {
        header.releasePointerCapture(ev.pointerId)
      } catch (e) {}
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  })
}
