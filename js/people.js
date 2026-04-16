function getPerson(id) {
  return data.people.find(p => p.id === id)
}

function getPeopleMap() {
  return new Map(data.people.map(p => [p.id, p]))
}

function uniqueIds(ids) {
  return [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean).map(String))]
}

function getSpouseIds(person) {
  return uniqueIds([
    ...(Array.isArray(person?.spouses) ? person.spouses : []),
    person?.spouse
  ])
}

function setPersonSpouses(person, spouseIds) {
  if (!person) return
  person.spouses = uniqueIds(spouseIds).filter(id => id !== person.id)
  person.spouse = person.spouses[0] || null
}

function areSpouses(aId, bId) {
  const a = getPerson(aId)
  const b = getPerson(bId)
  return !!a && !!b && getSpouseIds(a).includes(b.id) && getSpouseIds(b).includes(a.id)
}

function addSpouseLink(personId, spouseId) {
  const person = getPerson(personId)
  const spouse = getPerson(spouseId)
  if (!person || !spouse || person.id === spouse.id) return

  setPersonSpouses(person, [...getSpouseIds(person), spouse.id])
  setPersonSpouses(spouse, [...getSpouseIds(spouse), person.id])
}

function removeSpouseLink(personId, spouseId) {
  const person = getPerson(personId)
  const spouse = getPerson(spouseId)

  if (person) setPersonSpouses(person, getSpouseIds(person).filter(id => id !== spouseId))
  if (spouse) setPersonSpouses(spouse, getSpouseIds(spouse).filter(id => id !== personId))
}

function setSpouseLinks(personId, spouseIds, previousSpouseIds = null) {
  const person = getPerson(personId)
  if (!person) return

  const nextIds = uniqueIds(spouseIds)
  const oldIds = previousSpouseIds ? uniqueIds(previousSpouseIds) : getSpouseIds(person)

  oldIds
    .filter(id => !nextIds.includes(id))
    .forEach(id => removeSpouseLink(person.id, id))

  nextIds.forEach(id => addSpouseLink(person.id, id))
  setPersonSpouses(person, nextIds)
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
    parents: uniqueIds(person.parents),
    spouses: getSpouseIds(person)
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
    const spouses = getSpouseIds(person)
      .filter(spouseId => spouseId !== person.id)
      .filter(spouseId => map.has(spouseId))
      .filter(spouseId => !person.parents.includes(spouseId))
      .filter(spouseId => !isInvalidSpouse(person.id, spouseId, map))

    setPersonSpouses(person, spouses)
  })

  data.people.forEach(person => {
    getSpouseIds(person).forEach(spouseId => {
      const spouse = map.get(spouseId)
      if (!spouse) return
      if (!getSpouseIds(spouse).includes(person.id)) {
        setPersonSpouses(spouse, [...getSpouseIds(spouse), person.id])
      }
    })
  })
}

function setReciprocalSpouse(personId, spouseId) {
  if (!spouseId) return
  addSpouseLink(personId, spouseId)
}

function savePerson(person, createPos) {
  const existing = getPerson(person.id)
  const previousSpouseIds = existing ? getSpouseIds(existing) : []
  const spouseIds = getSpouseIds(person)
  const next = {
    ...existing,
    ...person,
    parents: uniqueIds(person.parents).slice(0, 2),
    spouses: spouseIds,
    spouse: spouseIds[0] || null
  }

  if (existing) {
    Object.assign(existing, next)
  } else {
    data.people.push({
      ...next,
      pos: createPos
    })
  }

  setSpouseLinks(next.id, spouseIds, previousSpouseIds)
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
    portraitFocusX: 50,
    portraitFocusY: 35,
    portraitZoom: 1,
    parents: [],
    spouses: [],
    spouse: null,
    pos,
    ...overrides
  }
}

function addChildFor(parent) {
  if (!requireEditPermission()) return

  const parents = [parent.id]
  const spouses = getSpouseIds(parent).filter(spouseId => getPerson(spouseId))
  if (spouses.length === 1) parents.push(spouses[0])

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
  if (!requireEditPermission()) return

  const spouse = createBasePerson(
    {
      x: clamp(person.pos.x + 300, WORLD_MIN_X, WORLD_MAX_X - CARD_WIDTH),
      y: clamp(person.pos.y, WORLD_MIN_Y, WORLD_MAX_Y)
    },
    { spouses: [person.id], spouse: person.id }
  )

  savePerson(spouse, spouse.pos)
  save()
  renderAll()
  setTimeout(() => openPersonModal(getPerson(spouse.id)), 50)
}

function assignExistingParent(parentId, childId) {
  if (!requireEditPermission()) return false

  const parent = getPerson(parentId)
  const child = getPerson(childId)
  if (!parent || !child) return false

  if (parent.id === child.id) {
    alert('Персонаж не может быть родителем самому себе.')
    return false
  }

  if (child.parents.includes(parent.id)) {
    alert('Этот родитель уже указан.')
    return false
  }

  if (child.parents.length >= 2) {
    alert('У персонажа может быть не больше двух родителей.')
    return false
  }

  if (getSpouseIds(child).includes(parent.id)) {
    alert('Супруг не может одновременно быть родителем персонажа.')
    return false
  }

  const nextChild = {
    ...child,
    parents: uniqueIds([...child.parents, parent.id])
  }

  if (!validatePerson(nextChild)) return false

  child.parents = nextChild.parents
  repairAllRelationships()
  save()
  renderAll()
  return true
}

function assignExistingChild(childId, parentId) {
  return assignExistingParent(parentId, childId)
}

function assignExistingSpouse(personId, spouseId) {
  if (!requireEditPermission()) return false

  const person = getPerson(personId)
  const spouse = getPerson(spouseId)
  if (!person || !spouse) return false

  if (person.id === spouse.id) {
    alert('Нельзя назначить персонажа супругом самому себе.')
    return false
  }

  if (areSpouses(person.id, spouse.id)) {
    alert('Эти персонажи уже супруги.')
    return false
  }

  if (person.parents.includes(spouse.id) || spouse.parents.includes(person.id)) {
    alert('Супруг не может одновременно быть родителем персонажа.')
    return false
  }

  if (isInvalidSpouse(person.id, spouse.id)) {
    alert('Нельзя назначить супругом прямого родственника по линии родитель-ребёнок.')
    return false
  }

  addSpouseLink(person.id, spouse.id)
  repairAllRelationships()
  save()
  renderAll()
  return true
}

function setRelationshipOptionAvailability(currentId, parentsEl, spousesEl) {
  const id = currentId || ''
  const map = getPeopleMap()

  Array.from(parentsEl.options).forEach(option => {
    const invalid =
      !!id &&
      (option.value === id || !map.has(option.value) || hasAncestor(option.value, id, map))

    option.disabled = invalid
    if (invalid) option.selected = false
  })

  Array.from(spousesEl.options).forEach(option => {
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
  const spouseIds = getSpouseIds(person)
  const map = createCandidateMap({
    ...person,
    parents: uniqueParentIds,
    spouses: spouseIds
  })

  if (uniqueParentIds.length !== parentIds.length) {
    alert('Один и тот же родитель выбран несколько раз.')
    return false
  }

  if (parentIds.length > 2) {
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

  if (spouseIds.length !== uniqueIds(spouseIds).length) {
    alert('Один и тот же супруг выбран несколько раз.')
    return false
  }

  if (spouseIds.includes(person.id)) {
    alert('Нельзя назначить персонажа супругом самому себе.')
    return false
  }

  if (spouseIds.some(spouseId => !getPerson(spouseId))) {
    alert('Выбранный супруг не найден.')
    return false
  }

  if (spouseIds.some(spouseId => uniqueParentIds.includes(spouseId))) {
    alert('Супруг не может одновременно быть родителем персонажа.')
    return false
  }

  if (spouseIds.some(spouseId => isInvalidSpouse(person.id, spouseId, map))) {
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
