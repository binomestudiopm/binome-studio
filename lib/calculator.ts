import {
  calculateIngredientCost,
  summarizeIngredientCosts,
  type CostMaterial,
  type IngredientCost,
  type PriceVatSettings,
  type RecipeIngredient,
} from './recipe-costs'

export type CalculatorRecipe = {
  id: string | number
  title: string
  yieldQty: string | number | null
  yieldUnit: string | null
  ingredients: RecipeIngredient[]
}

export type CalculatorMaterial = CostMaterial & {
  name: string
  manufacturer: string | null
  reference: string | null
}

export type AdditionalCostKey = 'packaging' | 'labor' | 'overhead' | 'other'
export type AdditionalCostInputs = Record<AdditionalCostKey, string | number | null>
export type AdditionalCostLine = {
  key: AdditionalCostKey
  label: string
  cost: IngredientCost
}

export type CalculatorLine = {
  ingredient: RecipeIngredient
  name: string
  scaledQuantity: number | null
  cost: IngredientCost
}

export type SellingPriceBasis = 'HTVA' | 'TVAC'

export type CalculatorResult = {
  yieldScale: number | null
  yieldIssue: string | null
  ingredientLines: CalculatorLine[]
  materialTotal: ReturnType<typeof summarizeIngredientCosts>
  additionalLines: AdditionalCostLine[]
  additionalTotal: ReturnType<typeof summarizeIngredientCosts>
  fullCost: ReturnType<typeof summarizeIngredientCosts>
  desiredYield: number | null
  costPerYieldUnit: number | null
  sales: {
    priceHTVA: number | null
    priceTVAC: number | null
    issue: string | null
    profitPerYieldUnit: number | null
    marginRate: number | null
    markRate: number | null
  }
}

export const additionalCostDefinitions: Array<{ key: AdditionalCostKey; label: string }> = [
  { key: 'packaging', label: 'Emballages HTVA' },
  { key: 'labor', label: 'Main-d’œuvre HTVA' },
  { key: 'overhead', label: 'Frais généraux HTVA' },
  { key: 'other', label: 'Autres charges HTVA' },
]

export const blankAdditionalCosts: AdditionalCostInputs = {
  packaging: '',
  labor: '',
  overhead: '',
  other: '',
}

function parseAmount(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const normalized = typeof value === 'string' ? value.trim().replace(',', '.') : value
  const amount = Number(normalized)
  return Number.isFinite(amount) && amount >= 0 ? amount : null
}

function missingCost(reason: string): IngredientCost {
  return { amount: null, currency: null, reason }
}

export function calculateRecipeEconomics(input: {
  recipe: CalculatorRecipe | null
  materials: CalculatorMaterial[]
  desiredYield: string | number | null
  vatSettingsByLine?: Record<number, PriceVatSettings>
  additionalCosts: AdditionalCostInputs
  additionalCurrency: string | null
  salePrice: string | number | null
  salePriceBasis: SellingPriceBasis
  salesVatRate: string | number | null
}): CalculatorResult {
  const { recipe } = input
  const baseYield = parseAmount(recipe?.yieldQty)
  const desiredYield = parseAmount(input.desiredYield)
  let yieldIssue: string | null = null

  if (!recipe) yieldIssue = 'Sélectionnez une recette'
  else if (!recipe.yieldUnit?.trim()) yieldIssue = 'Unité de rendement de la recette manquante'
  else if (baseYield === null || baseYield <= 0) yieldIssue = 'Rendement de base manquant ou invalide'
  else if (desiredYield === null || desiredYield <= 0) yieldIssue = 'Rendement souhaité à renseigner'

  const yieldScale = !yieldIssue && baseYield !== null && desiredYield !== null
    ? desiredYield / baseYield
    : null

  const ingredientLines: CalculatorLine[] = (recipe?.ingredients ?? []).map((ingredient, index) => {
    const name = ingredient.name_snapshot ?? ingredient.name ?? 'Matière sans nom'
    const sourceQuantity = parseAmount(ingredient.quantity)
    if (sourceQuantity === null || sourceQuantity <= 0) {
      return { ingredient, name, scaledQuantity: null, cost: missingCost('Quantité de recette manquante ou invalide') }
    }
    if (yieldScale === null) {
      return { ingredient, name, scaledQuantity: null, cost: missingCost(yieldIssue ?? 'Rendement non calculable') }
    }

    const scaledQuantity = sourceQuantity * yieldScale
    if (!ingredient.ingredient_id) {
      return { ingredient, name, scaledQuantity, cost: missingCost('Matière ancienne non reliée au catalogue') }
    }
    const material = input.materials.find(item => item.id === ingredient.ingredient_id)
    const cost = calculateIngredientCost(
      { ...ingredient, quantity: scaledQuantity },
      material,
      input.vatSettingsByLine?.[index],
    )
    return { ingredient, name: material?.name ?? name, scaledQuantity, cost }
  })

  const materialCosts = ingredientLines.map(line => line.cost)
  const materialTotal = summarizeIngredientCosts(materialCosts)
  const additionalLines = additionalCostDefinitions.map(({ key, label }) => {
    const rawAmount = input.additionalCosts[key]
    if (rawAmount === null || String(rawAmount).trim() === '') {
      return { key, label, cost: missingCost('Montant à renseigner; saisir 0 si aucun coût') }
    }
    const amount = parseAmount(rawAmount)
    if (amount === null) return { key, label, cost: missingCost('Montant invalide') }
    if (!input.additionalCurrency) return { key, label, cost: missingCost('Devise des charges à choisir') }
    return { key, label, cost: { amount, currency: input.additionalCurrency, reason: null } }
  })
  const additionalTotal = summarizeIngredientCosts(additionalLines.map(line => line.cost))
  const fullCost = !recipe
    ? { total: null, currency: null, reason: 'Sélectionnez une recette' }
    : recipe.ingredients.length === 0
      ? { total: null, currency: null, reason: 'La recette ne contient aucun ingrédient' }
      : summarizeIngredientCosts([...materialCosts, ...additionalLines.map(line => line.cost)])
  const costPerYieldUnit = fullCost.total !== null && desiredYield !== null && desiredYield > 0
    ? fullCost.total / desiredYield
    : null

  const salePrice = parseAmount(input.salePrice)
  const salesVatRate = parseAmount(input.salesVatRate)
  let priceHTVA: number | null = null
  let priceTVAC: number | null = null
  let salesIssue: string | null = null

  if (salePrice === null) salesIssue = 'Prix de vente à renseigner'
  else if (!input.additionalCurrency) salesIssue = 'Devise du prix de vente à choisir'
  else if (input.salePriceBasis === 'HTVA') {
    priceHTVA = salePrice
    priceTVAC = salesVatRate === null ? null : salePrice * (1 + salesVatRate / 100)
    if (salesVatRate === null) salesIssue = 'Taux de TVA de vente à renseigner pour calculer le prix TVAC'
  } else {
    priceTVAC = salePrice
    if (salesVatRate === null) salesIssue = 'Taux de TVA de vente à renseigner pour calculer le prix HTVA'
    else priceHTVA = salePrice / (1 + salesVatRate / 100)
  }

  const profitPerYieldUnit = costPerYieldUnit !== null && priceHTVA !== null
    ? priceHTVA - costPerYieldUnit
    : null
  const marginRate = profitPerYieldUnit !== null && costPerYieldUnit !== null && costPerYieldUnit > 0
    ? profitPerYieldUnit / costPerYieldUnit * 100
    : null
  const markRate = profitPerYieldUnit !== null && priceHTVA !== null && priceHTVA > 0
    ? profitPerYieldUnit / priceHTVA * 100
    : null

  return {
    yieldScale,
    yieldIssue,
    ingredientLines,
    materialTotal,
    additionalLines,
    additionalTotal,
    fullCost,
    desiredYield,
    costPerYieldUnit,
    sales: { priceHTVA, priceTVAC, issue: salesIssue, profitPerYieldUnit, marginRate, markRate },
  }
}
