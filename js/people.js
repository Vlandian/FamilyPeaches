function getPerson(id) {
  return data.people.find(p => p.id === id)
}

function getPeopleMap() {
  return new Map(data.people.map(p => [p.id, p]))
}

function uniqueIds(ids) {
  return [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean).map(String))]
}

function hasAncestor(personId, ancestorId, map = getPeopleMap()) {
  const seen = new Set()
  const stack = [...(map.get(personId)?.parents || [])]

  while (stack.length > 0) {
    const id = stack.pop()
    if (!id || seen.has(id)) continue
    if (id === ancestorId) return true

    seen.add(id)
    stack.push(...(map.get(id)?.parents || []))
  }

  return false
}

function createCandidateMap(person) {
  const map = getPeopleMap()
  const existing = map.get(person.id) || {}
  map.set(person.id, {
    ...existing,
    ...person,
    parents: uniqueIds(person.parents)
  })
  return map
}

function isInvalidSpouse(personId, spouseId, map = getPeopleMap()) {
  if (!spouseId) return false
  if (spouseId === personId || !map.has(spouseId)) return true
  return hasAncestor(personId, spouseId, map) || hasAncestor(spouseId, personId, map)
}

function repairAllRelationships() {
  const map = getPeopleMap()
  const houseIds = new Set((data.houses || []).map(house => house.id))

  data.people.forEach(person => {
    if (person.houseId && !houseIds.has(person.houseId)) person.houseId = ''
  })

  data.people.forEach(person => {
    person.parents = uniqueIds(person.parents)
      .filter(parentId => parentId !== person.id && map.has(parentId))
      .slice(0, 2)
  })

  data.people.forEach(person => {
    person.parents = person.parents.filter(parentId => !hasAncestor(parentId, person.id, map))
  })

  data.people.forEach(person => {
    if (isInvalidSpouse(person.id, person.spouse, map)) {
      person.spouse = null
      return
    }

    if (person.spouse && person.parents.includes(person.spouse)) {
      person.spouse = null
    }
  })

  data.people.forEach(person => {
    if (!person.spouse) return

    const spouse = map.get(person.spouse)
    if (!spouse || spouse.spouse === person.id) return

    if (spouse.spouse) {
      person.spouse = null
    } else {
      spouse.spouse = person.id
    }
  })

  data.people.forEach(person => {
    if (person.spouse && map.get(person.spouse)?.spouse !== person.id) {
      person.spouse = null
    }
  })
}

function setReciprocalSpouse(personId, spouseId) {
  const person = getPerson(personId)
  const spouse = spouseId ? getPerson(spouseId) : null

  if (!person) return

  data.people.forEach(other => {
    if (other.id !== personId && other.spouse === personId) {
      other.spouse = null
    }

    if (spouse && other.id !== spouse.id && other.spouse === spouse.id) {
      other.spouse = null
    }
  })

  person.spouse = spouse ? spouse.id : null

  if (spouse) {
    spouse.spouse = person.id
  }
}

function savePerson(person, createPos) {
  const existing = getPerson(person.id)
  const next = {
    ...existing,
    ...person,
    parents: uniqueIds(person.parents).slice(0, 2),
    spouse: person.spouse || null
  }

  if (existing) {
    Object.assign(existing, next)
  } else {
    data.people.push({
      ...next,
      pos: createPos
    })
  }

  setReciprocalSpouse(next.id, next.spouse)
  repairAllRelationships()
}

function createBasePerson(pos, overrides = {}) {
  return {
    id: uid(),
    firstName: 'Новый',
    lastName: '',
    title: '',
    gender: '',
    birthYear: null,
    deathYear: null,
    isAlive: true,
    houseId: '',
    description: '',
    portrait: '',
    parents: [],
    spouse: null,
    pos,
    ...overrides
  }
}

function addChildFor(parent) {
  const parents = [parent.id]
  if (parent.spouse && getPerson(parent.spouse)) parents.push(parent.spouse)

  const child = createBasePerson(
    {
      x: clamp(parent.pos.x + 40, WORLD_MIN_X, WORLD_MAX_X - CARD_WIDTH),
      y: clamp(parent.pos.y + 270, WORLD_MIN_Y, WORLD_MAX_Y)
    },
    { parents: uniqueIds(parents).slice(0, 2) }
  )

  savePerson(child, child.pos)
  save()
  renderAll()
  setTimeout(() => openPersonModal(getPerson(child.id)), 50)
}

function addSpouseFor(person) {
  if (person.spouse && getPerson(person.spouse)) {
    alert('У персонажа уже указан супруг или супруга.')
    return
  }

  const spouse = createBasePerson(
    {
      x: clamp(person.pos.x + 300, WORLD_MIN_X, WORLD_MAX_X - CARD_WIDTH),
      y: clamp(person.pos.y, WORLD_MIN_Y, WORLD_MAX_Y)
    },
    { spouse: person.id }
  )

  savePerson(spouse, spouse.pos)
  save()
  renderAll()
  setTimeout(() => openPersonModal(getPerson(spouse.id)), 50)
}

function setRelationshipOptionAvailability(currentId, parentsEl, spouseEl) {
  const id = currentId || ''
  const map = getPeopleMap()

  Array.from(parentsEl.options).forEach(option => {
    const invalid =
      !!id &&
      (option.value === id || !map.has(option.value) || hasAncestor(option.value, id, map))

    option.disabled = invalid
    if (invalid) option.selected = false
  })

  Array.from(spouseEl.options).forEach(option => {
    if (!option.value) {
      option.disabled = false
      return
    }

    const invalid = !!id && isInvalidSpouse(id, option.value, map)
    option.disabled = invalid
    if (invalid) option.selected = false
  })
}

function validatePerson(person) {
  if (!person.firstName) {
    alert('Укажите имя персонажа.')
    return false
  }

  const parentIds = Array.isArray(person.parents) ? person.parents.map(String) : []
  const uniqueParentIds = uniqueIds(parentIds)
  const map = createCandidateMap({
    ...person,
    parents: uniqueParentIds
  })

  if (uniqueParentIds.length !== parentIds.length) {
    alert('Один и тот же родитель выбран несколько раз.')
    return false
  }

  if (person.parents.length > 2) {
    alert('У персонажа может быть не больше двух родителей.')
    return false
  }

  if (uniqueParentIds.includes(person.id)) {
    alert('Персонаж не может быть родителем самому себе.')
    return false
  }

  if (uniqueParentIds.some(parentId => !getPerson(parentId))) {
    alert('Среди родителей есть несуществующий персонаж.')
    return false
  }

  if (uniqueParentIds.some(parentId => hasAncestor(parentId, person.id, map))) {
    alert('Такая связь родителей создаёт цикл в дереве.')
    return false
  }

  if (person.birthYear !== null) {
    const tooYoungParent = uniqueParentIds
      .map(parentId => getPerson(parentId))
      .find(parent => parent?.birthYear !== null && parent.birthYear > person.birthYear)

    if (tooYoungParent) {
      alert('Родитель не может родиться позже ребёнка.')
      return false
    }
  }

  if (person.spouse && person.spouse === person.id) {
    alert('Нельзя назначить персонажа супругом самому себе.')
    return false
  }

  if (person.spouse && !getPerson(person.spouse)) {
    alert('Выбранный супруг не найден.')
    return false
  }

  if (person.spouse && uniqueParentIds.includes(person.spouse)) {
    alert('Супруг не может одновременно быть родителем персонажа.')
    return false
  }

  if (person.spouse && isInvalidSpouse(person.id, person.spouse, map)) {
    alert('Нельзя назначить супругом прямого родственника по линии родитель-ребёнок.')
    return false
  }

  if (
    person.birthYear !== null &&
    person.deathYear !== null &&
    person.deathYear < person.birthYear
  ) {
    alert('Год смерти не может быть раньше года рождения.')
    return false
  }

  return true
}

function syncDeathYearState(checkboxEl, deathInputEl) {
  const alive = checkboxEl.checked
  deathInputEl.disabled = alive
  deathInputEl.placeholder = alive ? '—' : 'например, 1081'
  if (alive) deathInputEl.value = ''
}
