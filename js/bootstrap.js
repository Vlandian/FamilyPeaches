load()

if (!localStorage.getItem(STORAGE_KEY) && data.people.length === 0) {
  const ivanId = uid()
  const mariaId = uid()
  const olgaId = uid()
  const ivanHouseId = uid()

  data.houses = [
    {
      id: ivanHouseId,
      name: 'Дом Ивановых',
      crest: ''
    }
  ]

  data.people.push(
    {
      id: ivanId,
      firstName: 'Иван',
      lastName: 'Иванов',
      title: 'Князь',
      gender: 'male',
      birthYear: 980,
      deathYear: null,
      isAlive: true,
      houseId: ivanHouseId,
      description: 'Глава рода и основатель текущей ветви семьи.',
      parents: [],
      spouse: mariaId,
      pos: { x: 80, y: 60 }
    },
    {
      id: mariaId,
      firstName: 'Мария',
      lastName: 'Иванова',
      title: 'Княгиня',
      gender: 'female',
      birthYear: 984,
      deathYear: null,
      isAlive: true,
      houseId: ivanHouseId,
      description: 'Супруга князя Ивана.',
      parents: [],
      spouse: ivanId,
      pos: { x: 360, y: 60 }
    },
    {
      id: olgaId,
      firstName: 'Ольга',
      lastName: 'Иванова',
      title: 'Наследница',
      gender: 'female',
      birthYear: 1008,
      deathYear: null,
      isAlive: true,
      houseId: ivanHouseId,
      description: 'Дочь Ивана и Марии.',
      parents: [ivanId, mariaId],
      spouse: null,
      pos: { x: 220, y: 280 }
    }
  )

  save()
  load()
}

setTreeWorldSize()
renderAll()
if (typeof initializeRemoteSync === 'function') initializeRemoteSync()
requestAnimationFrame(centerViewOnTree)
