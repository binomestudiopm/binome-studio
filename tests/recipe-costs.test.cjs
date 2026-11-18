const { test } = require('node:test')
const assert = require('node:assert/strict')
const { calculateIngredientCost, getMaterialCostIssue, normalizeRecipeIngredients, summarizeIngredientCosts } = require('../lib/recipe-costs.ts')

const material = overrides => ({
  id: 'ingredient-1', package_quantity: 1, package_unit: 'kg', package_price: 8,
  currency: 'EUR', vat_included: false, ...overrides,
})
const line = (quantity, unit = 'g') => ({ ingredient_id: 'ingredient-1', name_snapshot: 'Farine', quantity, unit })

test('calcule les grammes à partir d’un conditionnement kilogramme', () => {
  assert.deepEqual(calculateIngredientCost(line(250), material()), { amount: 2, currency: 'EUR', reason: null })
})

test('calcule les millilitres à partir d’un conditionnement litre', () => {
  assert.deepEqual(calculateIngredientCost(line(125, 'ml'), material({ package_quantity: 2, package_unit: 'litre', package_price: 6 })), { amount: 0.375, currency: 'EUR', reason: null })
})

test('ne convertit pas la masse en volume', () => {
  assert.equal(calculateIngredientCost(line(100, 'g'), material({ package_unit: 'litre' })).amount, null)
})

test('rend le coût non calculable si quantité, prix ou conditionnement manquent', () => {
  assert.equal(calculateIngredientCost(line('', 'g'), material()).reason, 'Quantité à renseigner')
  assert.equal(calculateIngredientCost(line(100), material({ package_price: null })).reason, 'Prix d’achat manquant')
  assert.equal(calculateIngredientCost(line(100), material({ package_quantity: null })).reason, 'Conditionnement manquant')
})

test('ne retire pas une TVA inconnue ou TVAC sans taux confirmé', () => {
  assert.match(calculateIngredientCost(line(100), material({ vat_included: true })).reason, /TVAC.*taux de TVA/)
  assert.match(calculateIngredientCost(line(100), material({ vat_included: null })).reason, /Statut TVA non précisé/)
})

test('identifie les informations requises sur une fiche matière', () => {
  assert.equal(getMaterialCostIssue(material()), null)
  assert.match(getMaterialCostIssue(material({ currency: null })), /Devise/)
  assert.match(getMaterialCostIssue(material({ package_unit: 'sac' })), /Unité de conditionnement/)
})

test('ne totalise pas des devises différentes', () => {
  assert.match(summarizeIngredientCosts([
    { amount: 1, currency: 'EUR', reason: null },
    { amount: 1, currency: 'CHF', reason: null },
  ]).reason, /Devises différentes/)
})

test('conserve les compositions historiques et leurs instantanés', () => {
  const legacy = normalizeRecipeIngredients([{ name: 'Sucre', quantity: 200, unit: 'g' }])
  assert.deepEqual(legacy[0], { ingredient_id: null, name_snapshot: 'Sucre', name: 'Sucre', quantity: '200', unit: 'g' })

  const linked = normalizeRecipeIngredients([{ ingredient_id: 'ingredient-1', name_snapshot: 'Farine', quantity: 1, unit: 'kg' }])
  assert.equal(linked[0].ingredient_id, 'ingredient-1')
  assert.equal(linked[0].name_snapshot, 'Farine')
})
