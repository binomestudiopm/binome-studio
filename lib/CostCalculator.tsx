'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  additionalCostDefinitions,
  blankAdditionalCosts,
  calculateRecipeEconomics,
  type AdditionalCostInputs,
  type CalculatorMaterial,
  type CalculatorRecipe,
  type SellingPriceBasis,
} from './calculator'
import { getMaterialDisplayName } from './material-display'
import type { PriceVatBasis, PriceVatSettings } from './recipe-costs'

type Props = {
  recipes: CalculatorRecipe[]
  materials: CalculatorMaterial[]
}

function formatMoney(amount: number | null, currency: string | null): string {
  if (amount === null) return 'Non calculable'
  if (!currency) return 'Devise à choisir'
  try {
    return new Intl.NumberFormat('fr-BE', { style: 'currency', currency, maximumFractionDigits: 4 }).format(amount)
  } catch {
    return `${amount.toFixed(4)} ${currency}`
  }
}

function formatNumber(value: number | null): string {
  if (value === null) return '—'
  return new Intl.NumberFormat('fr-BE', { maximumFractionDigits: 4 }).format(value)
}

function formatPercent(value: number | null): string {
  return value === null ? '—' : `${new Intl.NumberFormat('fr-BE', { maximumFractionDigits: 2 }).format(value)} %`
}

function singularYieldUnit(unit: string | null): string {
  if (!unit) return 'unité de rendement'
  const normalized = unit.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr')
  if (['piece', 'pieces', 'unite', 'unites'].includes(normalized)) return 'pièce'
  return unit
}

export default function CostCalculator({ recipes, materials }: Props) {
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>('')
  const [desiredYield, setDesiredYield] = useState('')
  const [vatSettingsByLine, setVatSettingsByLine] = useState<Record<number, PriceVatSettings>>({})
  const [additionalCosts, setAdditionalCosts] = useState<AdditionalCostInputs>(blankAdditionalCosts)
  const [additionalCurrency, setAdditionalCurrency] = useState('')
  const [salePrice, setSalePrice] = useState('')
  const [salePriceBasis, setSalePriceBasis] = useState<SellingPriceBasis>('HTVA')
  const [salesVatRate, setSalesVatRate] = useState('')

  const selectedRecipe = recipes.find(recipe => String(recipe.id) === selectedRecipeId) ?? null

  useEffect(() => {
    setDesiredYield(selectedRecipe?.yieldQty == null ? '' : String(selectedRecipe.yieldQty))
    setVatSettingsByLine({})
    setAdditionalCosts({ ...blankAdditionalCosts })
    setAdditionalCurrency('')
    setSalePrice('')
    setSalePriceBasis('HTVA')
    setSalesVatRate('')
  }, [selectedRecipeId])

  const result = useMemo(() => calculateRecipeEconomics({
    recipe: selectedRecipe,
    materials,
    desiredYield,
    vatSettingsByLine,
    additionalCosts,
    additionalCurrency: additionalCurrency || null,
    salePrice,
    salePriceBasis,
    salesVatRate,
  }), [selectedRecipe, materials, desiredYield, vatSettingsByLine, additionalCosts, additionalCurrency, salePrice, salePriceBasis, salesVatRate])

  const setVatSetting = (index: number, key: keyof PriceVatSettings, value: PriceVatSettings[keyof PriceVatSettings]) => {
    setVatSettingsByLine(current => ({
      ...current,
      [index]: { ...current[index], [key]: value },
    }))
  }

  return <div className="panel calculator-panel">
    <div className="calculator-heading">
      <div>
        <p className="gold">ATELIER · COÛTS & RENTABILITÉ</p>
        <h2>Calculateur professionnel</h2>
        <p className="muted">Les matières et compositions sont lues depuis le catalogue et les recettes. Les valeurs saisies ici restent locales.</p>
      </div>
    </div>

    <div className="calculator-controls">
      <label>Recette existante
        <select aria-label="Sélectionner une recette" value={selectedRecipeId} onChange={event => setSelectedRecipeId(event.target.value)}>
          <option value="">Choisir une recette…</option>
          {recipes.map(recipe => <option key={recipe.id} value={String(recipe.id)}>{recipe.title}</option>)}
        </select>
      </label>
      <label>Rendement souhaité
        <span className="calculator-input-with-unit"><input aria-label="Rendement souhaité" type="number" min="0" step="any" inputMode="decimal" value={desiredYield} onChange={event => setDesiredYield(event.target.value)} disabled={!selectedRecipe} /><b>{selectedRecipe?.yieldUnit || 'unité'}</b></span>
      </label>
      <div className="calculator-base-yield"><span>Rendement de la fiche</span><b>{selectedRecipe?.yieldQty && selectedRecipe.yieldUnit ? `${selectedRecipe.yieldQty} ${selectedRecipe.yieldUnit}` : 'Non renseigné'}</b></div>
    </div>
    <p className="tiny-note">Le rendement souhaité utilise la même unité que la fiche. Les quantités de la recette sont multipliées au prorata; aucune conversion de rendement n’est supposée.</p>

    {!selectedRecipe ? <div className="calculator-empty"><h3>Sélectionnez une recette</h3><p className="muted">Sa composition apparaîtra ici; les anciennes lignes resteront visibles et seront signalées comme non reliées si nécessaire.</p></div> : <>
      <section className="calculator-section">
        <div className="calculator-section-heading"><div><p className="gold">01 · COMPOSITION</p><h3>Coût matière par ingrédient</h3></div><span>{selectedRecipe.ingredients.length} ligne(s)</span></div>
        {result.yieldIssue && <p className="calculator-warning">{result.yieldIssue}</p>}
        <div className="calculator-lines">
          {result.ingredientLines.map((line, index) => {
            const linked = line.ingredient.ingredient_id
              ? materials.find(material => material.id === line.ingredient.ingredient_id)
              : undefined
            const vatSettings = vatSettingsByLine[index] ?? { basis: 'catalog' as PriceVatBasis, rate: '' }
            const needsVatRate = vatSettings.basis === 'tvac' || (vatSettings.basis === 'catalog' && linked?.vat_included === true)
            return <article className="calculator-line" key={`${line.ingredient.ingredient_id ?? line.name}-${index}`}>
              <div className="calculator-line-title">
                <b>{linked ? getMaterialDisplayName(linked) : line.name}</b>
                <small className={linked ? 'linked-label' : 'legacy-label'}>{linked ? 'Catalogue lié' : line.ingredient.ingredient_id ? 'ID absent du catalogue' : 'Ancienne ligne sans lien'}</small>
                {linked && <small>{linked.manufacturer || 'Marque non précisée'}{linked.reference ? ` · Réf. ${linked.reference}` : ''}</small>}
              </div>
              <div className="calculator-line-quantity"><span>Quantité de fiche</span><b>{line.ingredient.quantity} {line.ingredient.unit}</b></div>
              <div className="calculator-line-quantity"><span>Quantité recalculée</span><b>{line.scaledQuantity === null ? '—' : `${formatNumber(line.scaledQuantity)} ${line.ingredient.unit}`}</b></div>
              <label className="calculator-line-vat">Base du prix catalogue
                <select aria-label={`Base TVA pour ${line.name}`} value={vatSettings.basis ?? 'catalog'} onChange={event => setVatSetting(index, 'basis', event.target.value as PriceVatBasis)}>
                  <option value="catalog">Selon la fiche matière</option>
                  <option value="htva">Prix saisi HTVA</option>
                  <option value="tvac">Prix saisi TVAC</option>
                  <option value="unknown">TVA inconnue</option>
                </select>
              </label>
              {needsVatRate && <label className="calculator-line-vat">Taux TVA achat (%)
                <input type="number" min="0" step="any" inputMode="decimal" placeholder="À renseigner" value={vatSettings.rate ?? ''} onChange={event => setVatSetting(index, 'rate', event.target.value)} />
              </label>}
              <div className="calculator-line-cost"><span>Coût matière HTVA</span><b>{formatMoney(line.cost.amount, line.cost.currency)}</b><small className={line.cost.amount === null ? 'value-missing' : 'value-known'}>{line.cost.reason ?? 'Calculé depuis le conditionnement'}</small></div>
            </article>
          })}
          {selectedRecipe.ingredients.length === 0 && <p className="muted">La recette ne contient aucune ligne d’ingrédient.</p>}
        </div>
      </section>

      <section className="calculator-section">
        <div className="calculator-section-heading"><div><p className="gold">02 · CHARGES</p><h3>Autres coûts de fabrication</h3></div></div>
        <p className="muted">Saisissez chaque montant HTVA, ou indiquez explicitement 0 si la charge est nulle. Une case vide rend le coût total incomplet.</p>
        <label className="calculator-currency">Devise des charges et du prix de vente
          <select value={additionalCurrency} onChange={event => setAdditionalCurrency(event.target.value)}>
            <option value="">Choisir une devise…</option><option value="EUR">EUR</option><option value="CHF">CHF</option><option value="USD">USD</option>
          </select>
        </label>
        <div className="calculator-extra-grid">
          {additionalCostDefinitions.map(item => {
            const line = result.additionalLines.find(candidate => candidate.key === item.key)!
            return <label key={item.key}>{item.label}
              <input type="number" min="0" step="any" inputMode="decimal" placeholder="Montant HTVA ou 0" value={additionalCosts[item.key] ?? ''} onChange={event => setAdditionalCosts(current => ({ ...current, [item.key]: event.target.value }))} />
              {line.cost.reason && <small className="value-missing">{line.cost.reason}</small>}
            </label>
          })}
        </div>
      </section>

      <section className="calculator-section">
        <div className="calculator-section-heading"><div><p className="gold">03 · VENTE</p><h3>Prix & rentabilité</h3></div></div>
        <div className="calculator-sales-grid">
          <label>Prix de vente par unité de rendement
            <input type="number" min="0" step="any" inputMode="decimal" placeholder="À renseigner" value={salePrice} onChange={event => setSalePrice(event.target.value)} />
          </label>
          <label>Prix saisi
            <select value={salePriceBasis} onChange={event => setSalePriceBasis(event.target.value as SellingPriceBasis)}><option value="HTVA">HTVA</option><option value="TVAC">TVAC</option></select>
          </label>
          <label>Taux TVA de vente (%)
            <input type="number" min="0" step="any" inputMode="decimal" placeholder="À renseigner si nécessaire" value={salesVatRate} onChange={event => setSalesVatRate(event.target.value)} />
          </label>
        </div>
        <p className="tiny-note">Aucun taux n’est présélectionné. Le taux saisi sert uniquement à convertir le prix de vente HTVA/TVAC.</p>
      </section>

      <section className="calculator-summary">
        <p className="gold">RÉSUMÉ DE FABRICATION</p>
        <div className="calculator-summary-grid">
          <div><span>Matières HTVA</span><b>{formatMoney(result.materialTotal.total, result.materialTotal.currency)}</b>{result.materialTotal.reason && <small className="value-missing">{result.materialTotal.reason}</small>}</div>
          <div><span>Autres coûts HTVA</span><b>{formatMoney(result.additionalTotal.total, result.additionalTotal.currency)}</b>{result.additionalTotal.reason && <small className="value-missing">{result.additionalTotal.reason}</small>}</div>
          <div className="calculator-summary-total"><span>Coût total de revient HTVA</span><b>{formatMoney(result.fullCost.total, result.fullCost.currency)}</b>{result.fullCost.reason && <small className="value-missing">{result.fullCost.reason}</small>}</div>
          <div><span>Coût par {singularYieldUnit(selectedRecipe.yieldUnit)}</span><b>{formatMoney(result.costPerYieldUnit, result.fullCost.currency)}</b></div>
          <div><span>Prix de vente HTVA</span><b>{formatMoney(result.sales.priceHTVA, (result.fullCost.currency ?? result.materialTotal.currency ?? additionalCurrency) || null)}</b></div>
          <div><span>Prix de vente TVAC</span><b>{formatMoney(result.sales.priceTVAC, (result.fullCost.currency ?? result.materialTotal.currency ?? additionalCurrency) || null)}</b>{result.sales.issue && <small className="value-missing">{result.sales.issue}</small>}</div>
          <div><span>Marge par unité HTVA</span><b>{formatMoney(result.sales.profitPerYieldUnit, result.fullCost.currency)}</b></div>
          <div><span>Taux de marge (marge / coût)</span><b>{formatPercent(result.sales.marginRate)}</b></div>
          <div><span>Taux de marque (marge / vente HTVA)</span><b>{formatPercent(result.sales.markRate)}</b></div>
        </div>
      </section>
    </>}
  </div>
}
