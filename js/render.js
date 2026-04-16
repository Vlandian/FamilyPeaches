function renderList() {
  peopleList.innerHTML = ''
  const query = peopleSearchInput.value.trim().toLowerCase()

  data.people.filter(p => personMatchesSearch(p, query)).forEach(p => {
    const li = document.createElement('li')
    li.className = 'peopleItem'

    const main = document.createElement('div')
    main.className = 'peopleItemMain'

    const title = document.createElement('div')
    title.className = 'peopleItemTitle'
    title.textContent = displayName(p)

    const meta = document.createElement('div')
    meta.className = 'peopleItemMeta'
    meta.textContent = [
      lifeYears(p),
      getHouseName(p) ? `Дом: ${getHouseName(p)}` : '',
      p.isAlive ? 'жив' : 'умер'
    ]
      .filter(Boolean)
      .join(' • ')

    main.appendChild(title)
    main.appendChild(meta)
    main.addEventListener('click', () => {
      centerViewOnPerson(p)
      selectedPersonIds.clear()
      selectedPersonIds.add(p.id)
      updateCardSelectionClasses()
      openPersonDetailsModal(p)
    })

    const actions = document.createElement('div')

    const edit = document.createElement('button')
    edit.textContent = 'Изменить'
    edit.onclick = () => openPersonModal(p)

    const show = document.createElement('button')
    show.textContent = 'Показать'
    show.onclick = () => {
      centerViewOnPerson(p)
      selectedPersonIds.clear()
      selectedPersonIds.add(p.id)
      updateCardSelectionClasses()
    }

    const del = document.createElement('button')
    del.textContent = 'Удалить'
    del.onclick = () => {
      if (confirm('Удалить персонажа?')) deletePerson(p.id)
    }

    actions.appendChild(show)
    if (canEditTree()) {
      actions.appendChild(edit)
      actions.appendChild(del)
    }

    li.appendChild(main)
    li.appendChild(actions)
    peopleList.appendChild(li)
  })
}

function deletePerson(id) {
  if (!requireEditPermission()) return

  if (
    typeof createBackup === 'function' &&
    !createBackup('Перед удалением персонажа', { quiet: true }) &&
    !confirm('Не удалось создать резервную копию. Удалить персонажа без резерва?')
  ) {
    return
  }

  data.people = data.people.filter(p => p.id !== id)

  data.people.forEach(p => {
    setPersonSpouses(p, getSpouseIds(p).filter(spouseId => spouseId !== id))
    p.parents = p.parents.filter(parentId => parentId !== id)
  })

  save()
  renderAll()
}

function buildRelationships() {
  const map = new Map(data.people.map(p => [p.id, p]))

  data.people.forEach(p => {
    p.children = []
  })

  data.people.forEach(p => {
    p.parents.forEach(parentId => {
      const parent = map.get(parentId)
      if (parent) parent.children.push(p.id)
    })
  })
}

function renderGraph() {
  svg.innerHTML = ''
  cardsContainer.innerHTML = ''

  if (data.people.length === 0) return

  buildRelationships()

  data.people.forEach((p, i) => {
    if (!p.pos) {
      p.pos = { x: 20 + (i % 4) * 240, y: 20 + Math.floor(i / 4) * 190 }
    }
  })

  function ensureRelationshipMarkers() {
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker')
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')

    marker.setAttribute('id', 'parentArrow')
    marker.setAttribute('viewBox', '0 0 10 10')
    marker.setAttribute('refX', '9')
    marker.setAttribute('refY', '5')
    marker.setAttribute('markerWidth', '7')
    marker.setAttribute('markerHeight', '7')
    marker.setAttribute('orient', 'auto')
    marker.setAttribute('markerUnits', 'strokeWidth')
    path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z')
    marker.appendChild(path)
    defs.appendChild(marker)
    svg.appendChild(defs)
  }

  function drawLine(x1, y1, x2, y2, cls, options = {}) {
    if (x1 === x2 && y1 === y2) return

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    line.setAttribute('x1', x1)
    line.setAttribute('y1', y1)
    line.setAttribute('x2', x2)
    line.setAttribute('y2', y2)
    line.classList.add('link')
    if (cls) line.classList.add(cls)
    if (options.arrow) line.setAttribute('marker-end', 'url(#parentArrow)')
    svg.appendChild(line)
  }

  function drawNode(x, y, cls) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    circle.setAttribute('cx', x)
    circle.setAttribute('cy', y)
    circle.setAttribute('r', cls === 'child-node' ? 8 : 7)
    circle.classList.add('relationship-node')
    if (cls) circle.classList.add(cls)
    svg.appendChild(circle)
  }

  const personById = new Map(data.people.map(p => [p.id, p]))

  function relationshipKey(aId, bId) {
    return aId < bId ? `${aId}_${bId}` : `${bId}_${aId}`
  }

  data.people.forEach(p => {
    const card = document.createElement('div')
    card.className = 'card'
    if (selectedPersonIds.has(p.id)) card.classList.add('selected')
    card.style.left = toCanvasX(p.pos.x) + 'px'
    card.style.top = toCanvasY(p.pos.y) + 'px'
    card.dataset.id = p.id

    const titleHtml = p.title ? `<div class="cardTitle">${escapeHtml(p.title)}</div>` : ''
    const house = getPersonHouse(p)
    const houseHtml = house
      ? `<p class="cardHouse">Дом: ${escapeHtml(house.name)}</p>`
      : ''
    const crestHtml = house
      ? `<img class="cardCrest" src="${escapeHtml(getHouseCrestSrc(house))}" alt="Герб: ${escapeHtml(house.name)}" title="Дом ${escapeHtml(house.name)}" draggable="false" data-house-id="${escapeHtml(house.id)}">`
      : ''
    const portraitHtml = `
      <div class="cardPortraitWrap ${p.isAlive ? '' : 'dead'}">
        <img class="cardPortrait" src="${escapeHtml(getPortraitSrc(p))}" alt="Портрет: ${escapeHtml(fullName(p))}" draggable="false" style="${escapeHtml(getPortraitCropStyle(p))}">
      </div>
    `
    const descriptionHtml = p.description
      ? `<p class="cardDescription">${escapeHtml(shortText(p.description, 120))}</p>`
      : `<p class="cardDescription muted">Нет описания</p>`
    const relationLabel = getViewpointRelationLabel(p.id)
    const relationHtml = relationLabel
      ? `<div class="relationshipBadge">${escapeHtml(relationLabel)}</div>`
      : ''

    card.innerHTML = `
      ${crestHtml}
      ${relationHtml}
      ${portraitHtml}
      ${titleHtml}
      <h3>${escapeHtml(fullName(p))}</h3>
      <p class="cardMeta">${escapeHtml(cardLifeMeta(p))}</p>
      <div class="statusPill ${p.isAlive ? 'alive' : 'dead'}">${p.isAlive ? 'Жив' : 'Умер'}</div>
      ${houseHtml}
      ${descriptionHtml}
    `

    cardsContainer.appendChild(card)
    card.querySelector('.cardPortrait').addEventListener('error', ev => {
      ev.currentTarget.src = PLACEHOLDER_PORTRAIT
    }, { once: true })
    const crest = card.querySelector('.cardCrest')
    if (crest) {
      crest.addEventListener('error', ev => {
        ev.currentTarget.src = PLACEHOLDER_CREST
      }, { once: true })
      crest.addEventListener('click', ev => {
        ev.stopPropagation()
        openHouseDetailsModal(house)
      })
    }

    card.style.touchAction = 'none'
    card.addEventListener('pointerdown', ev => {
      if (ev.button !== 0) return
      if (!canEditTree()) return

      if (
        ev.target.closest('button') ||
        ev.target.closest('input') ||
        ev.target.closest('select') ||
        ev.target.closest('textarea') ||
        ev.target.closest('.cardCrest')
      ) {
        return
      }

      card.setPointerCapture(ev.pointerId)
      const startX = ev.clientX
      const startY = ev.clientY
      const dragIds = selectedPersonIds.has(p.id)
        ? Array.from(selectedPersonIds)
        : [p.id]
      if (typeof beginRemotePersonMove === 'function') beginRemotePersonMove(dragIds)

      const originals = new Map(
        dragIds
          .map(id => getPerson(id))
          .filter(Boolean)
          .map(person => [person.id, { x: person.pos.x, y: person.pos.y }])
      )
      let moved = false

      function moveHandler(me) {
        const dx = (me.clientX - startX) / treeZoom
        const dy = (me.clientY - startY) / treeZoom
        if (Math.abs(me.clientX - startX) > 4 || Math.abs(me.clientY - startY) > 4) {
          moved = true
          card.dataset.dragging = 'true'
        }

        originals.forEach((original, id) => {
          const person = getPerson(id)
          if (!person) return

          person.pos.x = clamp(original.x + dx, WORLD_MIN_X, WORLD_MAX_X - CARD_WIDTH)
          person.pos.y = clamp(original.y + dy, WORLD_MIN_Y, WORLD_MAX_Y)

          const draggedCard = cardsContainer.querySelector(`[data-id="${id}"]`)
          if (draggedCard) {
            draggedCard.style.left = toCanvasX(person.pos.x) + 'px'
            draggedCard.style.top = toCanvasY(person.pos.y) + 'px'
            if (moved) draggedCard.dataset.dragging = 'true'
          }
        })

        redrawLines()
      }

      function upHandler() {
        try {
          card.releasePointerCapture(ev.pointerId)
        } catch (e) {}
        window.removeEventListener('pointermove', moveHandler)
        window.removeEventListener('pointerup', upHandler)
        save()
        if (typeof endRemotePersonMove === 'function') endRemotePersonMove()
        if (moved) {
          setTimeout(() => {
            cardsContainer.querySelectorAll('.card').forEach(n => {
              delete n.dataset.dragging
            })
          }, 0)
        }
      }

      window.addEventListener('pointermove', moveHandler)
      window.addEventListener('pointerup', upHandler)
    })
  })

  function getAnchor(id) {
    const p = personById.get(id)
    if (!p || !p.pos) return null
    const canvasX = toCanvasX(p.pos.x)
    const canvasY = toCanvasY(p.pos.y)
    const card = cardsContainer.querySelector(`[data-id="${id}"]`)
    const cardHeight = card?.offsetHeight || 0

    return {
      x: canvasX + CARD_WIDTH / 2,
      y: canvasY + CARD_LINK_Y,
      centerY: canvasY + cardHeight / 2,
      topY: canvasY,
      bottomY: canvasY + cardHeight,
      leftX: canvasX,
      rightX: canvasX + CARD_WIDTH
    }
  }

  function childConnectionPoint(childAnchor) {
    return {
      x: childAnchor.x,
      y: childAnchor.topY - 8
    }
  }

  function parentConnectionPoint(parentAnchor) {
    return {
      x: parentAnchor.x,
      y: parentAnchor.bottomY
    }
  }

  function getChildBusY(sourceY, childEnds) {
    const below = childEnds.every(end => end.y >= sourceY)

    if (below) {
      const nearestChildY = Math.min(...childEnds.map(end => end.y))
      const preferredY = nearestChildY - CHILD_BUS_OFFSET
      return preferredY > sourceY
        ? preferredY
        : Math.round((sourceY + nearestChildY) / 2)
    }

    const nearestChildY = Math.max(...childEnds.map(end => end.y))
    const preferredY = nearestChildY + CHILD_BUS_OFFSET
    return preferredY < sourceY
      ? preferredY
      : Math.round((sourceY + nearestChildY) / 2)
  }

  function drawOrthogonalLine(start, end, cls) {
    if (start.x === end.x) {
      drawLine(start.x, start.y, end.x, end.y, cls, { arrow: true })
      return
    }

    const busY = Math.round((start.y + end.y) / 2)
    drawLine(start.x, start.y, start.x, busY, cls)
    drawLine(start.x, busY, end.x, busY, cls)
    drawLine(end.x, busY, end.x, end.y, cls, { arrow: true })
  }

  function getMarriagePairs() {
    const pairs = []
    const seen = new Set()

    data.people.forEach(person => {
      getSpouseIds(person).forEach(spouseId => {
        const spouse = personById.get(spouseId)
        if (!spouse || !getSpouseIds(spouse).includes(person.id)) return

        const key = relationshipKey(person.id, spouse.id)
        if (seen.has(key)) return

        seen.add(key)
        pairs.push([person.id, spouse.id])
      })
    })

    return pairs
  }

  function getMarriageSegment(aId, bId) {
    const a = getAnchor(aId)
    const b = getAnchor(bId)
    if (!a || !b) return null

    const left = a.x <= b.x ? a : b
    const right = a.x <= b.x ? b : a
    const y = Math.round((left.centerY + right.centerY) / 2)
    let x1 = left.rightX
    let x2 = right.leftX

    if (x1 > x2) {
      x1 = left.x
      x2 = right.x
    }

    return {
      x1,
      x2,
      y,
      leftY: left.centerY,
      rightY: right.centerY,
      leftNode: { x: x1, y: left.centerY },
      rightNode: { x: x2, y: right.centerY },
      midX: (x1 + x2) / 2
    }
  }

  function redrawLines() {
    svg.innerHTML = ''
    ensureRelationshipMarkers()

    const marriageSegments = new Map()

    getMarriagePairs().forEach(([aId, bId]) => {
      const segment = getMarriageSegment(aId, bId)
      if (!segment) return

      drawNode(segment.leftNode.x, segment.leftNode.y, 'spouse-node')
      drawNode(segment.rightNode.x, segment.rightNode.y, 'spouse-node')

      if (segment.leftNode.y !== segment.y) {
        drawLine(segment.leftNode.x, segment.leftNode.y, segment.leftNode.x, segment.y, 'marriage')
      }
      if (segment.rightNode.y !== segment.y) {
        drawLine(segment.rightNode.x, segment.rightNode.y, segment.rightNode.x, segment.y, 'marriage')
      }

      drawLine(segment.x1, segment.y, segment.x2, segment.y, 'marriage')
      marriageSegments.set(relationshipKey(aId, bId), segment)
    })

    marriageSegments.forEach((segment, pairKey) => {
      const sharedChildren = data.people
        .map(child => {
          const parents = uniqueIds(child.parents).filter(parentId => personById.has(parentId))
          if (parents.length !== 2 || relationshipKey(parents[0], parents[1]) !== pairKey) {
            return null
          }

          const anchor = getAnchor(child.id)
          return anchor
            ? childConnectionPoint(anchor)
            : null
        })
        .filter(Boolean)

      if (sharedChildren.length === 0) return

      drawNode(segment.midX, segment.y, 'child-node')

      const childrenBySide = [
        sharedChildren.filter(end => end.y >= segment.y),
        sharedChildren.filter(end => end.y < segment.y)
      ].filter(group => group.length > 0)

      childrenBySide.forEach(childEnds => {
        const busY = getChildBusY(segment.y, childEnds)
        const horizontalPoints = [segment.midX, ...childEnds.map(end => end.x)]
        const minX = Math.min(...horizontalPoints)
        const maxX = Math.max(...horizontalPoints)

        drawLine(segment.midX, segment.y, segment.midX, busY, 'parent-link')
        drawLine(minX, busY, maxX, busY, 'parent-link')

        childEnds.forEach(end => {
          drawLine(end.x, busY, end.x, end.y, 'parent-link', { arrow: true })
        })
      })
    })

    data.people.forEach(child => {
      const parents = uniqueIds(child.parents).filter(parentId => personById.has(parentId))
      const sharedPairKey = parents.length === 2 ? relationshipKey(parents[0], parents[1]) : null

      if (sharedPairKey && marriageSegments.has(sharedPairKey)) return

      parents.forEach(parentId => {
        const parentAnchor = getAnchor(parentId)
        const childAnchor = getAnchor(child.id)
        if (!parentAnchor || !childAnchor) return

        const start = parentConnectionPoint(parentAnchor)
        const end = childConnectionPoint(childAnchor)
        drawNode(start.x, start.y, 'parent-node')
        drawOrthogonalLine(start, end, 'parent-link')
      })
    })
  }

  redrawLines()
}
