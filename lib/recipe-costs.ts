export type RecipeIngredient = {
  ingredient_id?: string | null
  name_snapshot?: string
  name?: string
  quantity: string | number
  unit: string
}

export type CostMaterial = {
  id: string
  package_quantity: number | null
  package_unit: string | null
  package_price: number | null
  currency: string | null
  vat_included: boolean | null
}

export type PriceVatBasis = 'catalog' | 'htva' | 'tvac' | 'unknown'
export type PriceVatSettings = { basis?: PriceVatBasis; rate?: string | number | null }

export function normalizeRecipeIngredients(value: unknown): RecipeIngredient[] {
  if (!Array.isArray(value)) return []
  return value.map((entry: unknown) => {
    const item = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {}
    const name = String(item.name_snapshot ?? item.name ?? '')
    return {
      ingredient_id: typeof item.ingredient_id === 'string' ? item.ingredient_id : null,
      name_snapshot: name,
      name,
      quantity: String(item.quantity ?? ''),
      unit: String(item.unit ?? 'g'),
    }
  })
}

export type IngredientCost =
  | { amount: number; currency: string; reason: null }
  | { amount: null; currency: null; reason: string }

type UnitGroup = 'mass' | 'volume' | 'piece'

function parseRate(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const normalized = typeof value === 'string' ? value.trim().replace(',', '.') : value
  const rate = Number(normalized)
  return Number.isFinite(rate) && rate >= 0 ? rate : null
}

function effectiveVatBasis(material: CostMaterial, settings?: PriceVatSettings): Exclude<PriceVatBasis, 'catalog'> {
  if (settings?.basis && settings.basis !== 'catalog') return settings.basis
  if (settings?.basis === 'unknown') return 'unknown'
  if (material.vat_included === false) return 'htva'
  if (material.vat_included === true) return 'tvac'
  return 'unknown'
}

function unitInBase(unit: string): { group: UnitGroup; factor: number } | null {
  const normalized = unit.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr')
  if (normalized === 'g') return { group: 'mass', factor: 1 }
  if (normalized === 'kg') return { group: 'mass', factor: 1000 }
  if (normalized === 'ml') return { group: 'volume', factor: 1 }
  if (normalized === 'l' || normalized === 'litre' || normalized === 'litres') return { group: 'volume', factor: 1000 }
  if (normalized === 'piece' || normalized === 'pieces' || normalized === 'unite' || normalized === 'unites') {
    return { group: 'piece', factor: 1 }
  }
  return null
}

export function getMaterialCostIssue(material?: CostMaterial, vatSettings?: PriceVatSettings): string | null {
  if (!material) return 'Matière non reliée au catalogue'

  const packageQuantity = Number(material.package_quantity)
  if (!Number.isFinite(packageQuantity) || packageQuantity <= 0) return 'Conditionnement manquant'
  if (material.package_price === null || !Number.isFinite(Number(material.package_price)) || Number(material.package_price) < 0) {
    return 'Prix d’achat manquant'
  }
  if (!material.currency) return 'Devise manquante'
  const vatBasis = effectiveVatBasis(material, vatSettings)
  if (vatBasis === 'unknown') return 'Statut TVA non précisé : choisir HTVA ou TVAC dans le calculateur'
  if (vatBasis === 'tvac' && parseRate(vatSettings?.rate) === null) return 'Prix TVAC : taux de TVA à renseigner'
  if (!material.package_unit || !unitInBase(material.package_unit)) return 'Unité de conditionnement non reconnue'

  return null
}

export function calculateIngredientCost(
  ingredient: RecipeIngredient,
  material?: CostMaterial,
  vatSettings?: PriceVatSettings,
): IngredientCost {
  if (!ingredient.ingredient_id || !material) return { amount: null, currency: null, reason: 'Matière non reliée au catalogue' }

  const quantity = Number(ingredient.quantity)
  if (!Number.isFinite(quantity) || quantity <= 0) return { amount: null, currency: null, reason: 'Quantité à renseigner' }
  const issue = getMaterialCostIssue(material, vatSettings)
  if (issue) return { amount: null, currency: null, reason: issue }
  const currency = material.currency
  if (!currency) return { amount: null, currency: null, reason: 'Devise manquante' }

  const usedUnit = unitInBase(ingredient.unit)
  const packUnit = material.package_unit ? unitInBase(material.package_unit) : null
  if (!usedUnit || !packUnit || usedUnit.group !== packUnit.group) {
    return { amount: null, currency: null, reason: 'Unités incompatibles ou non convertibles' }
  }

  const usedBase = quantity * usedUnit.factor
  const packageBase = Number(material.package_quantity) * packUnit.factor
  const vatBasis = effectiveVatBasis(material, vatSettings)
  const rate = vatBasis === 'tvac' ? parseRate(vatSettings?.rate) : null
  const packagePriceHTVA = vatBasis === 'tvac'
    ? Number(material.package_price) / (1 + (rate ?? 0) / 100)
    : Number(material.package_price)
  return { amount: packagePriceHTVA * usedBase / packageBase, currency, reason: null }
}

export function summarizeIngredientCosts(costs: IngredientCost[]) {
  if (costs.length === 0) return { total: null, currency: null, reason: 'Aucun ingrédient dans la recette' }
  if (costs.some(cost => cost.amount === null)) return { total: null, currency: null, reason: 'Une ou plusieurs lignes ne sont pas calculables' }

  const currencies = new Set(costs.map(cost => cost.currency))
  if (currencies.size !== 1) return { total: null, currency: null, reason: 'Devises différentes : total non calculé' }

  return {
    total: costs.reduce((sum, cost) => sum + (cost.amount ?? 0), 0),
    currency: costs[0].currency,
    reason: null,
  }
}
