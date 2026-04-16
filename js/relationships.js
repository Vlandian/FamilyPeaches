let viewpointPersonId = null

function inferGender(person) {
  if (person?.gender === 'male' || person?.gender === 'female') return person.gender

  const title = String(person?.title || '').toLowerCase()
  const firstName = String(person?.firstName || '').trim().toLowerCase()
  const lastName = String(person?.lastName || '').trim().toLowerCase()

  const femaleTitles = ['княгиня', 'королева', 'принцесса', 'герцогиня', 'графиня', 'баронесса', 'леди', 'госпожа', 'императрица', 'царица', 'наследница']
  const maleTitles = ['князь', 'король', 'принц', 'герцог', 'граф', 'барон', 'лорд', 'господин', 'император', 'царь', 'наследник']

  if (femaleTitles.some(word => title.includes(word))) return 'female'
  if (maleTitles.some(word => title.includes(word))) return 'male'
  if (/(ова|ева|ина|ая|яя)$/.test(lastName)) return 'female'
  if (/(ов|ев|ин|ый|ий)$/.test(lastName)) return 'male'
  if (firstName && /[ая]$/.test(firstName) && !['илья', 'никита', 'савва', 'фома', 'лука', 'кузьма'].includes(firstName)) return 'female'

  return 'unknown'
}

function capitalizeRelationLabel(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : ''
}

function gendered(person, male, female, unknown) {
  const gender = inferGender(person)
  if (gender === 'male') return male
  if (gender === 'female') return female
  return unknown
}

function buildChildrenMap() {
  const childrenByParent = new Map()

  data.people.forEach(person => {
    person.parents.forEach(parentId => {
      if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, [])
      childrenByParent.get(parentId).push(person.id)
    })
  })

  return childrenByParent
}

function getAncestorDistances(personId) {
  const map = getPeopleMap()
  const distances = new Map()
  const queue = (map.get(personId)?.parents || []).map(id => ({ id, distance: 1 }))

  while (queue.length > 0) {
    const item = queue.shift()
    if (!item.id || distances.has(item.id)) continue

    distances.set(item.id, item.distance)
    ;(map.get(item.id)?.parents || []).forEach(parentId => {
      queue.push({ id: parentId, distance: item.distance + 1 })
    })
  }

  return distances
}

function getDescendantDistances(personId) {
  const childrenByParent = buildChildrenMap()
  const distances = new Map()
  const queue = (childrenByParent.get(personId) || []).map(id => ({ id, distance: 1 }))

  while (queue.length > 0) {
    const item = queue.shift()
    if (!item.id || distances.has(item.id)) continue

    distances.set(item.id, item.distance)
    ;(childrenByParent.get(item.id) || []).forEach(childId => {
      queue.push({ id: childId, distance: item.distance + 1 })
    })
  }

  return distances
}

function sharedParents(a, b) {
  const bParents = new Set(b.parents || [])
  return uniqueIds(a.parents || []).filter(parentId => bParents.has(parentId))
}

function hasSameKnownParents(a, b, shared) {
  return shared.length >= 2 && uniqueIds(a.parents).length === uniqueIds(b.parents).length
}

function ancestorLabel(person, distance) {
  if (distance === 1) return gendered(person, 'отец', 'мать', 'родитель')
  if (distance === 2) return gendered(person, 'дед', 'бабушка', 'дедушка/бабушка')

  const prefix = 'пра'.repeat(distance - 2)
  return gendered(person, `${prefix}дед`, `${prefix}бабушка`, `${prefix}предок`)
}

function descendantLabel(person, distance) {
  if (distance === 1) return gendered(person, 'сын', 'дочь', 'ребёнок')
  if (distance === 2) return gendered(person, 'внук', 'внучка', 'внук/внучка')

  const prefix = 'пра'.repeat(distance - 2)
  return gendered(person, `${prefix}внук`, `${prefix}внучка`, `${prefix}потомок`)
}

function cousinDegreeName(degree, feminine = false) {
  const names = {
    2: ['двоюродный', 'двоюродная'],
    3: ['троюродный', 'троюродная'],
    4: ['четвероюродный', 'четвероюродная'],
    5: ['пятиюродный', 'пятиюродная'],
    6: ['шестиюродный', 'шестиюродная'],
    7: ['семиюродный', 'семиюродная'],
    8: ['восьмиюродный', 'восьмиюродная'],
    9: ['девятиюродный', 'девятиюродная'],
    10: ['десятиюродный', 'десятиюродная']
  }
  const pair = names[degree] || [`${degree}-юродный`, `${degree}-юродная`]
  return feminine ? pair[1] : pair[0]
}

function degreeKinLabel(person, degree, maleNoun, femaleNoun, unknownNoun) {
  return gendered(
    person,
    `${cousinDegreeName(degree)} ${maleNoun}`,
    `${cousinDegreeName(degree, true)} ${femaleNoun}`,
    `${cousinDegreeName(degree)} ${unknownNoun}`
  )
}

function findCommonAncestorPair(viewpoint, person, predicate) {
  const viewpointAncestors = getAncestorDistances(viewpoint.id)
  const personAncestors = getAncestorDistances(person.id)
  let best = null

  for (const [ancestorId, viewpointDistance] of viewpointAncestors.entries()) {
    const personDistance = personAncestors.get(ancestorId)
    if (!personDistance || !predicate(viewpointDistance, personDistance)) continue

    const score = viewpointDistance + personDistance
    if (!best || score < best.score) {
      best = { viewpointDistance, personDistance, score }
    }
  }

  return best
}

function siblingLabel(viewpoint, person) {
  const shared = sharedParents(viewpoint, person)
  if (shared.length === 0) return ''

  if (hasSameKnownParents(viewpoint, person, shared) || (shared.length === 1 && viewpoint.parents.length === 1 && person.parents.length === 1)) {
    return gendered(person, 'брат', 'сестра', 'брат/сестра')
  }

  const sharedParent = getPerson(shared[0])
  const parentGender = inferGender(sharedParent)

  if (parentGender === 'male') return gendered(person, 'единокровный брат', 'единокровная сестра', 'единокровный брат/сестра')
  if (parentGender === 'female') return gendered(person, 'единоутробный брат', 'единоутробная сестра', 'единоутробный брат/сестра')
  return gendered(person, 'неполнородный брат', 'неполнородная сестра', 'неполнородный брат/сестра')
}

function spouseLabel(viewpoint, person) {
  if (!getSpouseIds(viewpoint).includes(person.id) && !getSpouseIds(person).includes(viewpoint.id)) return ''
  return gendered(person, 'муж', 'жена', 'супруг(а)')
}

function stepParentLabel(viewpoint, person) {
  const parentSpouses = viewpoint.parents
    .flatMap(parentId => getSpouseIds(getPerson(parentId)))

  if (!viewpoint.parents.includes(person.id) && parentSpouses.includes(person.id)) {
    return gendered(person, 'отчим', 'мачеха', 'приёмный родитель')
  }

  return ''
}

function stepChildLabel(viewpoint, person) {
  if (person.parents.includes(viewpoint.id)) return ''
  const spouses = getSpouseIds(viewpoint).map(getPerson).filter(Boolean)
  if (spouses.some(spouse => person.parents.includes(spouse.id))) {
    return gendered(person, 'пасынок', 'падчерица', 'приёмный ребёнок')
  }
  return ''
}

function avuncularLabel(viewpoint, person) {
  const viewpointAncestors = getAncestorDistances(viewpoint.id)

  for (const [ancestorId, distance] of viewpointAncestors.entries()) {
    const ancestor = getPerson(ancestorId)
    if (!ancestor) continue

    const sibling = siblingLabel(ancestor, person)
    if (!sibling) continue

    if (distance === 1) return gendered(person, 'дядя', 'тётя', 'дядя/тётя')
    if (distance === 2) return gendered(person, 'двоюродный дед', 'двоюродная бабушка', 'двоюродный дед/бабушка')
  }

  return ''
}

function cousinUncleAuntLabel(viewpoint, person) {
  const pair = findCommonAncestorPair(
    viewpoint,
    person,
    (viewpointDistance, personDistance) => viewpointDistance === personDistance + 1 && personDistance >= 2
  )

  if (!pair) return ''
  return degreeKinLabel(person, pair.personDistance, 'дядя', 'тётя', 'дядя/тётя')
}

function nephewLabel(viewpoint, person) {
  const personAncestors = getAncestorDistances(person.id)

  for (const [ancestorId, distance] of personAncestors.entries()) {
    const ancestor = getPerson(ancestorId)
    if (!ancestor) continue

    const sibling = siblingLabel(ancestor, viewpoint)
    if (!sibling) continue

    if (distance === 1) return gendered(person, 'племянник', 'племянница', 'племянник/племянница')
    if (distance === 2) return gendered(person, 'внучатый племянник', 'внучатая племянница', 'внучатый племянник/племянница')
  }

  return ''
}

function cousinNephewNieceLabel(viewpoint, person) {
  const pair = findCommonAncestorPair(
    viewpoint,
    person,
    (viewpointDistance, personDistance) => personDistance === viewpointDistance + 1 && viewpointDistance >= 2
  )

  if (!pair) return ''
  return degreeKinLabel(person, pair.viewpointDistance, 'племянник', 'племянница', 'племянник/племянница')
}

function cousinLabel(viewpoint, person) {
  const pair = findCommonAncestorPair(
    viewpoint,
    person,
    (viewpointDistance, personDistance) => viewpointDistance === personDistance && viewpointDistance >= 2
  )

  if (!pair) return ''
  return degreeKinLabel(person, pair.viewpointDistance, 'брат', 'сестра', 'брат/сестра')
}

function describeRelationToViewpoint(viewpoint, person) {
  if (!viewpoint || !person) return ''
  if (viewpoint.id === person.id) return 'точка зрения'

  const spouse = spouseLabel(viewpoint, person)
  if (spouse) return spouse

  const stepParent = stepParentLabel(viewpoint, person)
  if (stepParent) return stepParent

  const stepChild = stepChildLabel(viewpoint, person)
  if (stepChild) return stepChild

  const ancestors = getAncestorDistances(viewpoint.id)
  if (ancestors.has(person.id)) return ancestorLabel(person, ancestors.get(person.id))

  const descendants = getDescendantDistances(viewpoint.id)
  if (descendants.has(person.id)) return descendantLabel(person, descendants.get(person.id))

  const sibling = siblingLabel(viewpoint, person)
  if (sibling) return sibling

  const avuncular = avuncularLabel(viewpoint, person)
  if (avuncular) return avuncular

  const cousinUncleAunt = cousinUncleAuntLabel(viewpoint, person)
  if (cousinUncleAunt) return cousinUncleAunt

  const nephew = nephewLabel(viewpoint, person)
  if (nephew) return nephew

  const cousinNephewNiece = cousinNephewNieceLabel(viewpoint, person)
  if (cousinNephewNiece) return cousinNephewNiece

  const cousin = cousinLabel(viewpoint, person)
  if (cousin) return cousin

  return ''
}

function getViewpointRelationLabel(personId) {
  if (!viewpointPersonId) return ''
  return capitalizeRelationLabel(describeRelationToViewpoint(getPerson(viewpointPersonId), getPerson(personId)))
}

function setViewpointPerson(personId) {
  viewpointPersonId = getPerson(personId) ? personId : null
  renderAll()
}

function clearViewpointPerson() {
  viewpointPersonId = null
  renderAll()
}

function syncViewpointPerson() {
  if (viewpointPersonId && !getPerson(viewpointPersonId)) viewpointPersonId = null
}
