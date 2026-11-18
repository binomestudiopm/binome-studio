const { test } = require('node:test')
const assert = require('node:assert/strict')
const { searchMaterials } = require('../lib/material-search.ts')

const materials = [
  { id: 'cocoa-butter', name: 'Beurre de cacao', manufacturer: 'Cacao Barry', supplier: 'Ranson', reference: 'CB 70' },
  { id: 'butter', name: 'Beurre doux', manufacturer: 'Laiterie du Val', supplier: 'Cacao Barry', reference: 'BD 42' },
  { id: 'blueberry', name: 'Myrtille sauvage', manufacturer: 'Verger des Alpes', supplier: 'Ranson', reference: 'MY 01' },
  { id: 'cream', name: 'Crème fraîche', manufacturer: null, supplier: 'Maison du lait', reference: null },
]

test('recherche beurre, tous champs confondus', () => {
  assert.deepEqual(searchMaterials(materials, 'beurre').map(item => item.id), ['cocoa-butter', 'butter'])
})

test('recherche multi-mots indépendante de l’ordre', () => {
  const direct = searchMaterials(materials, 'beurre cacao').map(item => item.id)
  const reversed = searchMaterials(materials, 'cacao beurre').map(item => item.id)
  assert.deepEqual(direct, ['cocoa-butter', 'butter'])
  assert.deepEqual(reversed, direct)
})

test('recherche myrtille et accents', () => {
  assert.deepEqual(searchMaterials(materials, 'myrtille').map(item => item.id), ['blueberry'])
  assert.deepEqual(searchMaterials(materials, 'creme fraiche').map(item => item.id), ['cream'])
})

test('recherche fabricant, fournisseur, référence et espaces superflus', () => {
  assert.deepEqual(searchMaterials(materials, '  rAnSoN   01 ').map(item => item.id), ['blueberry'])
  assert.deepEqual(searchMaterials(materials, 'bd 42').map(item => item.id), ['butter'])
})

test('requête vide ou composée d’espaces retourne le catalogue complet', () => {
  assert.equal(searchMaterials(materials, '   ').length, materials.length)
})
