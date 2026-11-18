const { test } = require('node:test')
const assert = require('node:assert/strict')
const { calculateRecipeEconomics } = require('../lib/calculator.ts')

const recipe = overrides => ({
  id: 'recipe-1', title: 'Crème test', yieldQty: '1', yieldUnit: 'pièce',
  ingredients: [{ ingredient_id: 'material-1', name_snapshot: 'Farine', quantity: '100', unit: 'g' }],
  ...overrides,
})
const material = overrides => ({
  id: 'material-1', name: 'Farine', manufacturer: 'Moulin', reference: null,
  package_quantity: 1, package_unit: 'kg', package_price: 10, currency: 'EUR', vat_included: false,
  ...overrides,
})
const zeroCharges = { packaging: '0', labor: '0', overhead: '0', other: '0' }
const input = overrides => ({
  recipe: recipe(), materials: [material()], desiredYield: '1', vatSettingsByLine: {},
  additionalCosts: { ...zeroCharges }, additionalCurrency: 'EUR',
  salePrice: '', salePriceBasis: 'HTVA', salesVatRate: '', ...overrides,
})

test('calcule un coût complet HTVA et le coût par pièce après changement de rendement', () => {
  const result = calculateRecipeEconomics(input({ desiredYield: '2' }))
  assert.equal(result.ingredientLines[0].scaledQuantity, 200)
  assert.equal(result.materialTotal.total, 2)
  assert.equal(result.fullCost.total, 2)
  assert.equal(result.costPerYieldUnit, 1)
})

test('convertit les volumes litre/millilitre', () => {
  const result = calculateRecipeEconomics(input({
    recipe: recipe({ yieldUnit: 'litre', ingredients: [{ ingredient_id: 'material-1', name_snapshot: 'Crème', quantity: 500, unit: 'ml' }] }),
    materials: [material({ package_quantity: 2, package_unit: 'litre', package_price: 8 })],
  }))
  assert.equal(result.ingredientLines[0].cost.amount, 2)
})

test('calcule les pièces sans conversion implicite vers une unité de masse', () => {
  const result = calculateRecipeEconomics(input({
    recipe: recipe({ ingredients: [{ ingredient_id: 'material-1', name_snapshot: 'Décor', quantity: 4, unit: 'pièce' }] }),
    materials: [material({ package_quantity: 100, package_unit: 'pièces', package_price: 25 })],
  }))
  assert.equal(result.ingredientLines[0].cost.amount, 1)
})

test('refuse une conversion masse/volume', () => {
  const result = calculateRecipeEconomics(input({ materials: [material({ package_unit: 'litre' })] }))
  assert.equal(result.ingredientLines[0].cost.amount, null)
  assert.match(result.ingredientLines[0].cost.reason, /incompatibles/)
  assert.equal(result.fullCost.total, null)
})

test('déduit la TVA achat uniquement quand un taux est saisi', () => {
  const result = calculateRecipeEconomics(input({
    materials: [material({ package_price: 12, vat_included: true })],
    vatSettingsByLine: { 0: { basis: 'catalog', rate: '20' } },
  }))
  assert.equal(result.materialTotal.total, 1)

  const missingRate = calculateRecipeEconomics(input({ materials: [material({ package_price: 12, vat_included: true })] }))
  assert.equal(missingRate.ingredientLines[0].cost.amount, null)
  assert.match(missingRate.ingredientLines[0].cost.reason, /taux de TVA à renseigner/)
})

test('ne remplace ni prix absent ni devise absente par zéro', () => {
  const noPrice = calculateRecipeEconomics(input({ materials: [material({ package_price: null })] }))
  assert.equal(noPrice.ingredientLines[0].cost.amount, null)
  assert.match(noPrice.ingredientLines[0].cost.reason, /Prix d’achat manquant/)

  const noCurrency = calculateRecipeEconomics(input({ materials: [material({ currency: null })] }))
  assert.equal(noCurrency.ingredientLines[0].cost.amount, null)
  assert.match(noCurrency.ingredientLines[0].cost.reason, /Devise manquante/)
})

test('conserve les anciennes recettes et signale leurs lignes non reliées', () => {
  const result = calculateRecipeEconomics(input({
    recipe: recipe({ ingredients: [{ ingredient_id: null, name_snapshot: 'Sucre ancien', quantity: 200, unit: 'g' }] }),
  }))
  assert.equal(result.ingredientLines[0].name, 'Sucre ancien')
  assert.equal(result.ingredientLines[0].scaledQuantity, 200)
  assert.equal(result.ingredientLines[0].cost.amount, null)
  assert.match(result.ingredientLines[0].cost.reason, /non reliée/)
})

test('les champs de charges vides bloquent le coût total; zéro explicite est accepté', () => {
  const incomplete = calculateRecipeEconomics(input({ additionalCosts: { ...zeroCharges, labor: '' } }))
  assert.equal(incomplete.materialTotal.total, 1)
  assert.equal(incomplete.fullCost.total, null)
  assert.match(incomplete.additionalLines.find(line => line.key === 'labor').cost.reason, /saisir 0/)

  const complete = calculateRecipeEconomics(input({ additionalCosts: { ...zeroCharges, labor: '0' } }))
  assert.equal(complete.fullCost.total, 1)
})

test('refuse d’additionner des devises incompatibles', () => {
  const twoCurrencies = calculateRecipeEconomics(input({
    recipe: recipe({ ingredients: [
      { ingredient_id: 'material-1', name_snapshot: 'Farine', quantity: 100, unit: 'g' },
      { ingredient_id: 'material-2', name_snapshot: 'Chocolat', quantity: 100, unit: 'g' },
    ] }),
    materials: [material(), material({ id: 'material-2', currency: 'CHF' })],
  }))
  assert.equal(twoCurrencies.fullCost.total, null)
  assert.match(twoCurrencies.fullCost.reason, /Devises différentes/)

  const chargeMismatch = calculateRecipeEconomics(input({ additionalCurrency: 'CHF' }))
  assert.equal(chargeMismatch.fullCost.total, null)
  assert.match(chargeMismatch.fullCost.reason, /Devises différentes/)
})

test('calcule les prix HTVA et TVAC avec le taux de vente saisi, plus les deux taux de rentabilité', () => {
  const result = calculateRecipeEconomics(input({ salePrice: '4', salePriceBasis: 'HTVA', salesVatRate: '6' }))
  assert.equal(result.sales.priceHTVA, 4)
  assert.equal(result.sales.priceTVAC, 4.24)
  assert.equal(result.sales.profitPerYieldUnit, 3)
  assert.equal(result.sales.marginRate, 300)
  assert.equal(result.sales.markRate, 75)

  const fromTVAC = calculateRecipeEconomics(input({ salePrice: '5.30', salePriceBasis: 'TVAC', salesVatRate: '6' }))
  assert.equal(fromTVAC.sales.priceHTVA, 5)
  assert.equal(fromTVAC.sales.priceTVAC, 5.3)
})

test('ne calcule pas la conversion de vente sans taux de TVA', () => {
  const result = calculateRecipeEconomics(input({ salePrice: '5.30', salePriceBasis: 'TVAC' }))
  assert.equal(result.sales.priceHTVA, null)
  assert.equal(result.sales.priceTVAC, 5.3)
  assert.equal(result.sales.profitPerYieldUnit, null)
  assert.match(result.sales.issue, /Taux de TVA de vente à renseigner/)
})

test('refuse un rendement manquant et une composition vide', () => {
  const noYield = calculateRecipeEconomics(input({ recipe: recipe({ yieldQty: '' }) }))
  assert.equal(noYield.ingredientLines[0].scaledQuantity, null)
  assert.match(noYield.yieldIssue, /Rendement de base manquant/)
  assert.equal(noYield.fullCost.total, null)

  const empty = calculateRecipeEconomics(input({ recipe: recipe({ ingredients: [] }) }))
  assert.equal(empty.fullCost.total, null)
  assert.match(empty.fullCost.reason, /aucun ingrédient/)
})
