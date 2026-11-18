const { test } = require('node:test')
const assert = require('node:assert/strict')
const { getMaterialDisplayName, hasNormalizedLemanName } = require('../lib/material-display.ts')

const lemanProducts = [
  ['1012065 Pomme de pin', '1012065', 'Pomme de pin'],
  ['1032001 Tournesol', '1032001', 'Tournesol'],
  ['1032005 Fleur rose', '1032005', 'Fleur rose'],
  ['1051068 Marguerite blanche', '1051068', 'Marguerite blanche'],
  ['1091144 Potiron', '1091144', 'Potiron'],
  ['2014147 Feuille automne', '2014147', 'Feuille automne'],
  ['2061173 Gland', '2061173', 'Gland'],
  ['2067003 Plaquettes joyeux anniversaire', '2067003', 'Plaquettes joyeux anniversaire'],
]

test('affiche les huit désignations Leman sans leur référence initiale', () => {
  for (const [name, reference, expected] of lemanProducts) {
    const material = { name, manufacturer: 'Leman', reference }
    assert.equal(hasNormalizedLemanName(material), true, name)
    assert.equal(getMaterialDisplayName(material), expected, name)
    assert.equal(material.name, name, 'Le nom source reste intact')
  }
})

test('ne retire pas un préfixe identique pour une autre marque', () => {
  const material = { name: '1012065 Pomme de pin', manufacturer: 'Autre marque', reference: '1012065' }
  assert.equal(hasNormalizedLemanName(material), false)
  assert.equal(getMaterialDisplayName(material), material.name)
})

test('ne retire pas le préfixe si la référence ne correspond pas exactement', () => {
  const material = { name: '1012065 Pomme de pin', manufacturer: 'Leman', reference: '9999999' }
  assert.equal(hasNormalizedLemanName(material), false)
  assert.equal(getMaterialDisplayName(material), material.name)
})

test('accepte la casse et les espaces de la marque, sans modifier le nom original', () => {
  const material = { name: '1012065 Pomme de pin', manufacturer: ' LEMAN ', reference: ' 1012065 ' }
  assert.equal(getMaterialDisplayName(material), 'Pomme de pin')
  assert.equal(material.name, '1012065 Pomme de pin')
})
