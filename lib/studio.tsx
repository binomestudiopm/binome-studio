'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { calculateIngredientCost, getMaterialCostIssue, normalizeRecipeIngredients, summarizeIngredientCosts, type RecipeIngredient } from './recipe-costs'
import { searchMaterials } from './material-search'
import { getMaterialDisplayName, hasNormalizedLemanName } from './material-display'
import CostCalculator from './CostCalculator'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null
const tabs = ['Accueil', 'Recettes', 'Matières premières', 'Calculateur', 'Fiches techniques', 'Production']
const recipeCategories = ['Entremets', 'Crèmes & appareils', 'Biscuits & pâtes', 'Chocolaterie', 'Glacerie', 'Confiserie', 'Autres']
const units = ['g', 'kg', 'ml', 'l', 'pièce']
type Material = {
  id: string; name: string; manufacturer: string | null; supplier: string | null; reference: string | null
  package_quantity: number | null; package_unit: string | null; package_price: number | null
  currency: string | null; vat_included: boolean | null; allergens: string[] | null
  notes: string | null
}
type Recipe = { id: string | number; title: string; category: string; yieldQty: string; yieldUnit: string; version: number; ingredients: RecipeIngredient[]; method: string; visibility?: string }
type Draft = { name: string; manufacturer: string; supplier: string; reference: string; quantity: string; unit: string; price: string; currency: string; vat: 'true' | 'false' | 'unknown'; notes: string }
const blankDraft: Draft = { name: '', manufacturer: '', supplier: '', reference: '', quantity: '', unit: 'kg', price: '', currency: 'EUR', vat: 'unknown', notes: '' }
const blankIngredient = (): RecipeIngredient => ({ ingredient_id: null, name_snapshot: '', quantity: '', unit: 'g' })

function mapRecipe(row: any): Recipe {
  return {
    id: row.id, title: row.title ?? 'Recette sans nom', category: row.category ?? 'Autres',
    yieldQty: row.yield_quantity == null ? '' : String(row.yield_quantity), yieldUnit: row.yield_unit ?? '', version: row.version ?? 1,
    ingredients: normalizeRecipeIngredients(row.ingredients),
    method: Array.isArray(row.method) ? row.method.join('\n') : String(row.method ?? ''), visibility: row.visibility ?? 'shared',
  }
}
function displayMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('fr-BE', { style: 'currency', currency, maximumFractionDigits: 4 }).format(amount)
}

export default function Studio() {
  const [ready, setReady] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [cloudStatus, setCloudStatus] = useState('Connexion cloud non configurée')
  const [tab, setTab] = useState('Accueil')
  const [materials, setMaterials] = useState<Material[]>([])
  const [materialsLoading, setMaterialsLoading] = useState(false)
  const [materialError, setMaterialError] = useState('')
  const [materialSearch, setMaterialSearch] = useState('')
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(blankDraft)
  const [savingMaterial, setSavingMaterial] = useState(false)
  const [materialSuccess, setMaterialSuccess] = useState('')
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [recipesLoading, setRecipesLoading] = useState(false)
  const [recipeSearch, setRecipeSearch] = useState('')
  const [recipeCategory, setRecipeCategory] = useState('Toutes')
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | number | null>(null)
  const [creatingRecipe, setCreatingRecipe] = useState(false)
  const [editingRecipe, setEditingRecipe] = useState(false)
  const [showHiddenRecipes, setShowHiddenRecipes] = useState(false)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState(recipeCategories[0])
  const [yieldQuantity, setYieldQuantity] = useState('1')
  const [yieldUnit, setYieldUnit] = useState('kg')
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([blankIngredient()])
  const [method, setMethod] = useState('')
  const [savingRecipe, setSavingRecipe] = useState(false)
  useEffect(() => {
    if (!supabase) { setReady(true); return }
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setUserId(data.session?.user.id ?? null); setEmail(data.session?.user.email ?? ''); setReady(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null); setEmail(session?.user.email ?? ''); setReady(true)
    })
    return () => { alive = false; subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!supabase || !userId) { setMaterials([]); setRecipes([]); return }
    let alive = true
    setMaterialsLoading(true); setRecipesLoading(true); setCloudStatus('Chargement de votre espace…')
    Promise.all([
      supabase.from('ingredients').select('id,name,manufacturer,supplier,reference,package_quantity,package_unit,package_price,currency,vat_included,allergens,notes').order('name'),
      supabase.from('recipes').select('*').order('created_at', { ascending: false }),
    ]).then(([materialResult, recipeResult]) => {
      if (!alive) return
      if (materialResult.error) setMaterialError('Chargement impossible : ' + materialResult.error.message)
      else setMaterials((materialResult.data ?? []) as Material[])
      if (recipeResult.error) setCloudStatus('Erreur de chargement : ' + recipeResult.error.message)
      else {
        const loaded = (recipeResult.data ?? []).map(mapRecipe)
        setRecipes(loaded); setSelectedRecipeId(loaded[0]?.id ?? null); setCloudStatus('Espace synchronisé')
      }
      setMaterialsLoading(false); setRecipesLoading(false)
    })
    return () => { alive = false }
  }, [userId])

  const visibleMaterials = useMemo(() => searchMaterials(materials, materialSearch), [materials, materialSearch])
  const visibleRecipes = useMemo(() => {
    const query = recipeSearch.trim().toLocaleLowerCase('fr')
    return recipes.filter(item => (showHiddenRecipes ? item.visibility === 'hidden' : item.visibility !== 'hidden') && (recipeCategory === 'Toutes' || item.category === recipeCategory) && item.title.toLocaleLowerCase('fr').includes(query))
  }, [recipes, recipeSearch, recipeCategory, showHiddenRecipes])
  const selectedMaterial = materials.find(item => item.id === selectedMaterialId)
  const selectedRecipe = recipes.find(item => item.id === selectedRecipeId)

  const signIn = async () => {
    if (!supabase) { setError('La connexion Supabase doit être configurée dans .env.local.'); return }
    setError('')
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (signInError) setError(signInError.message)
  }
  const signOut = async () => { if (supabase) await supabase.auth.signOut(); setMaterials([]); setRecipes([]); setCloudStatus('Déconnecté') }

  const openNewMaterial = () => { setEditingId(null); setDraft(blankDraft); setMaterialError(''); setMaterialSuccess(''); setFormOpen(true) }
  const openEditMaterial = (item: Material) => {
    setEditingId(item.id)
    setDraft({
      name: item.name ?? '', manufacturer: item.manufacturer ?? '', supplier: item.supplier ?? '', reference: item.reference ?? '',
      quantity: item.package_quantity == null ? '' : String(item.package_quantity), unit: item.package_unit ?? 'kg',
      price: item.package_price == null ? '' : String(item.package_price), currency: item.currency ?? 'EUR',
      vat: item.vat_included === true ? 'true' : item.vat_included === false ? 'false' : 'unknown',
      notes: item.notes ?? '',
    })
    setMaterialError(''); setMaterialSuccess(''); setFormOpen(true)
  }
  const setDraftField = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(current => ({ ...current, [key]: value }))
  const saveMaterial = async () => {
    if (!supabase || !userId) { setMaterialError('Connectez-vous pour enregistrer une matière première.'); return }
    const quantity = draft.quantity.trim() ? Number(draft.quantity) : null
    const price = draft.price.trim() ? Number(draft.price) : null
    if (!draft.name.trim() || (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0)) || (price !== null && (!Number.isFinite(price) || price < 0))) {
      setMaterialError('Vérifiez la désignation, le conditionnement et le prix.'); return
    }
    setSavingMaterial(true); setMaterialError(''); setMaterialSuccess('')
    const payload = {
      name: draft.name.trim(), manufacturer: draft.manufacturer.trim() || null, supplier: draft.supplier.trim() || null,
      reference: draft.reference.trim() || null, package_quantity: quantity, package_unit: draft.unit || null,
      package_price: price, currency: draft.currency || null,
      vat_included: draft.vat === 'unknown' ? null : draft.vat === 'true',
      notes: draft.notes.trim() || null,
    }
    const result = editingId
      ? await supabase.from('ingredients').update(payload).eq('id', editingId).select('id,name,manufacturer,supplier,reference,package_quantity,package_unit,package_price,currency,vat_included,allergens,notes').single()
      : await supabase.from('ingredients').insert({ ...payload, created_by: userId }).select('id,name,manufacturer,supplier,reference,package_quantity,package_unit,package_price,currency,vat_included,allergens,notes').single()
    if (result.error) setMaterialError('Enregistrement impossible : ' + result.error.message)
    else {
      const saved = result.data as Material
      setMaterials(current => [...current.filter(item => item.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name, 'fr')))
      setSelectedMaterialId(saved.id); setMaterialSuccess(editingId ? 'Fiche matière mise à jour.' : 'Matière ajoutée au catalogue.')
      setEditingId(null); setFormOpen(false)
    }
    setSavingMaterial(false)
  }

  const updateIngredient = (index: number, changes: Partial<RecipeIngredient>) => setIngredients(current => current.map((item, i) => i === index ? { ...item, ...changes } : item))
  const saveRecipe = async () => {
    if (!supabase || !userId) { setError('Connectez-vous pour enregistrer une recette.'); return }
    if (!title.trim() || ingredients.length === 0 || ingredients.some(item => !item.ingredient_id || !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0)) {
      setError('Sélectionnez une matière du catalogue et une quantité positive pour chaque ligne.'); return
    }
    setSavingRecipe(true); setError('')
    const savedIngredients = ingredients.map(item => ({
      ingredient_id: item.ingredient_id,
      name_snapshot: materials.find(material => material.id === item.ingredient_id)?.name ?? item.name_snapshot ?? '',
      quantity: String(item.quantity), unit: item.unit,
    }))
    const { data, error: saveError } = await supabase.from('recipes').insert({
      title: title.trim(), category, yield_quantity: Number(yieldQuantity) || 1, yield_unit: yieldUnit, version: 1,
      ingredients: savedIngredients, method: method.split('\n').map(step => step.trim()).filter(Boolean), visibility: 'shared', created_by: userId,
    }).select().single()
    if (saveError) { setError('Enregistrement impossible : ' + saveError.message); setSavingRecipe(false); return }
    const saved = mapRecipe(data)
    setRecipes(current => [saved, ...current]); setSelectedRecipeId(saved.id); setCreatingRecipe(false)
    setTitle(''); setIngredients([blankIngredient()]); setMethod(''); setSavingRecipe(false)
  }

  const beginEditRecipe = () => {
    if (!selectedRecipe) return
    setTitle(selectedRecipe.title); setCategory(selectedRecipe.category)
    setYieldQuantity(selectedRecipe.yieldQty || '1'); setYieldUnit(selectedRecipe.yieldUnit || 'kg')
    setIngredients(selectedRecipe.ingredients.map(item => ({ ...item })))
    setMethod(selectedRecipe.method); setCreatingRecipe(false); setEditingRecipe(true); setError('')
  }
  const updateRecipe = async () => {
    if (!supabase || !userId || !selectedRecipe) { setError('Connectez-vous pour modifier cette recette.'); return }
    if (!title.trim() || ingredients.length === 0 || ingredients.some(item => !item.ingredient_id || !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0)) {
      setError('Sélectionnez une matière du catalogue et une quantité positive pour chaque ligne.'); return
    }
    setSavingRecipe(true); setError('')
    const savedIngredients = ingredients.map(item => ({
      ingredient_id: item.ingredient_id,
      name_snapshot: materials.find(material => material.id === item.ingredient_id)?.name ?? item.name_snapshot ?? '',
      quantity: String(item.quantity), unit: item.unit,
    }))
    const { data, error: saveError } = await supabase.from('recipes').update({
      title: title.trim(), category, yield_quantity: Number(yieldQuantity) || 1, yield_unit: yieldUnit,
      version: (selectedRecipe.version || 1) + 1, ingredients: savedIngredients,
      method: method.split('\\n').map(step => step.trim()).filter(Boolean),
    }).eq('id', selectedRecipe.id).select().single()
    if (saveError) { setError('Modification impossible : ' + saveError.message); setSavingRecipe(false); return }
    const updated = mapRecipe(data)
    setRecipes(current => current.map(item => item.id === updated.id ? updated : item))
    setSelectedRecipeId(updated.id); setEditingRecipe(false); setSavingRecipe(false)
  }
  const setSelectedRecipeHidden = async (hidden: boolean) => {
    if (!supabase || !userId || !selectedRecipe) { setError('Connectez-vous pour modifier cette recette.'); return }
    const { error: updateError } = await supabase.from('recipes').update({ visibility: hidden ? 'hidden' : 'shared' }).eq('id', selectedRecipe.id)
    if (updateError) { setError('Impossible de modifier la visibilité : ' + updateError.message); return }
    setRecipes(current => current.map(item => item.id === selectedRecipe.id ? { ...item, visibility: hidden ? 'hidden' : 'shared' } : item))
    setSelectedRecipeId(null); setError('')
  }

  const lineCosts = selectedRecipe?.ingredients.map(item => calculateIngredientCost(item, materials.find(material => material.id === item.ingredient_id))) ?? []
  const totalCost = summarizeIngredientCosts(lineCosts)
  if (!ready) return <main className="auth-shell"><div className="auth-card"><p className="gold">BINÔME STUDIO</p><h1>Ouverture de votre atelier…</h1></div></main>
  if (!userId) return <main className="auth-shell"><div className="auth-card"><p className="gold">PAULINE & MATH</p><h1>Votre atelier partagé.</h1><p className="muted">Connectez-vous avec votre compte personnel pour retrouver vos recettes et vos données.</p>{!supabase && <p className="auth-error">Configurez l’URL du projet et la clé publique Supabase dans .env.local.</p>}<label>Adresse e-mail<input type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} /></label><label>Mot de passe<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></label>{error && <p className="auth-error">{error}</p>}<button className="goldbtn auth-submit" disabled={!supabase} onClick={signIn}>Se connecter</button><p className="tiny-note">Ne communiquez jamais votre mot de passe.</p></div></main>

  return <main><aside><div className="brand">B<span>BINÔME STUDIO<small>PAULINE & MATH</small></span></div><p className="label">ESPACE DE TRAVAIL</p>{tabs.map(item => <button className={tab === item ? 'selected' : ''} onClick={() => setTab(item)} key={item}>{item}</button>)}<small className="version">VERSION 0.5</small></aside>
    <section><header><span>PÂTISSERIE · CHOCOLATERIE · GLACERIE</span><div className="account-area"><small>{cloudStatus}</small><span>{email}</span><button className="text-btn" onClick={signOut}>Déconnexion</button></div></header><article><p className="gold">DEUX SAVOIR-FAIRE. UNE MÊME PASSION.</p><h1>{tab === 'Accueil' ? 'Bienvenue dans votre atelier.' : tab}</h1><p className="muted">Votre espace professionnel partagé, pensé pour créer, calculer et organiser.</p>
      {tab === 'Accueil' && <><h2>Votre atelier</h2><div className="grid">{tabs.slice(1).map(item => <button className="tile" onClick={() => setTab(item)} key={item}><b>{item}</b><p>Bibliothèque partagée et outils de l’atelier.</p><span>Ouvrir ↗</span></button>)}</div></>}

      {tab === 'Matières premières' && <div className="panel materials-panel"><div className="library-head"><div><h2>Catalogue des matières premières</h2><p className="muted">Recherche instantanée, fiches détaillées et matières reliées aux recettes.</p></div><button className="goldbtn" onClick={openNewMaterial}>+ Ajouter</button></div>
        {materialSuccess && <p className="success-message" role="status">{materialSuccess}</p>}
        <div className="catalog-toolbar"><input className="search" aria-label="Recherche par désignation" placeholder="Rechercher par désignation…" value={materialSearch} onChange={event => setMaterialSearch(event.target.value)} /><label>Famille professionnelle<select disabled aria-label="Filtre famille indisponible"><option>À confirmer dans le schéma existant</option></select></label></div>
        <p className="tiny-note">{materialsLoading ? 'Chargement du catalogue…' : visibleMaterials.length + ' matière(s) sur ' + materials.length + '. Le champ famille n’est pas documenté; le filtre attend la confirmation du format existant.'}</p>{materialError && <p className="auth-error">{materialError}</p>}
        <div className="catalog-layout"><div className="catalog-list">{visibleMaterials.map(item => <button type="button" className={selectedMaterialId === item.id ? 'material-card selected-material' : 'material-card'} key={item.id} onClick={() => setSelectedMaterialId(item.id)}><span className="material-card-title"><b>{getMaterialDisplayName(item)}</b></span><span className="material-card-meta">{item.manufacturer || 'Fabricant non précisé'} · {item.supplier || 'Fournisseur non précisé'}</span><span className="material-card-meta">Réf. {item.reference || '—'} · {item.package_quantity ?? '—'} {item.package_unit ?? ''}</span></button>)}{!materialsLoading && visibleMaterials.length === 0 && <p className="muted">Aucune matière trouvée.</p>}</div>
          <div className="material-detail">{formOpen ? <><p className="gold">{editingId ? 'MODIFICATION' : 'NOUVELLE MATIÈRE'}</p><h3>{editingId ? 'Modifier la fiche matière' : 'Ajouter au catalogue'}</h3>
            <label>Désignation<input value={draft.name} onChange={event => setDraftField('name', event.target.value)} /></label><div className="form-two"><label>Fabricant / marque<input value={draft.manufacturer} onChange={event => setDraftField('manufacturer', event.target.value)} /></label><label>Fournisseur<input value={draft.supplier} onChange={event => setDraftField('supplier', event.target.value)} /></label></div>
            <label>Référence<input value={draft.reference} onChange={event => setDraftField('reference', event.target.value)} /></label>
            <div className="form-two"><label>Quantité du conditionnement<input type="number" min="0" step="any" value={draft.quantity} onChange={event => setDraftField('quantity', event.target.value)} /></label><label>Unité<select value={draft.unit} onChange={event => setDraftField('unit', event.target.value)}>{['kg','g','l','ml','pièce','sac','seau','boîte'].map(item => <option key={item}>{item}</option>)}</select></label></div>
            <div className="form-two"><label>Prix du conditionnement<input type="number" min="0" step="0.01" value={draft.price} onChange={event => setDraftField('price', event.target.value)} /></label><label>Devise<select value={draft.currency} onChange={event => setDraftField('currency', event.target.value)}><option>EUR</option><option>CHF</option><option>USD</option></select></label></div>
            <label>Prix indiqué<select value={draft.vat} onChange={event => setDraftField('vat', event.target.value as Draft['vat'])}><option value="unknown">TVA non précisée</option><option value="false">HTVA</option><option value="true">TVAC</option></select></label><label>Notes<textarea rows={3} value={draft.notes} onChange={event => setDraftField('notes', event.target.value)} /></label>
            {materialError && <p className="auth-error">{materialError}</p>}<div className="detail-actions"><button className="text-btn" onClick={() => { setFormOpen(false); setEditingId(null) }}>Annuler</button><button className="goldbtn" disabled={savingMaterial || !draft.name.trim()} onClick={saveMaterial}>{savingMaterial ? 'Enregistrement…' : 'Enregistrer'}</button></div><p className="tiny-note">Allergènes, composition, source technique et date de vérification ne font pas partie du formulaire de modification.</p>
          </> : selectedMaterial ? <><p className="gold">FICHE MATIÈRE</p><h3>{getMaterialDisplayName(selectedMaterial)}</h3>{hasNormalizedLemanName(selectedMaterial) && <p className="tiny-note">Désignation d’origine conservée : {selectedMaterial.name}</p>}<dl className="material-facts"><div><dt>Marque / fabricant</dt><dd>{selectedMaterial.manufacturer || 'Non précisé'}</dd></div><div><dt>Fournisseur</dt><dd>{selectedMaterial.supplier || 'Non précisé'}</dd></div><div><dt>Référence commerciale</dt><dd>{selectedMaterial.reference || 'Non précisée'}</dd></div><div><dt>Conditionnement d’origine</dt><dd>{selectedMaterial.package_quantity == null ? 'Quantité non précisée' : String(selectedMaterial.package_quantity)} {selectedMaterial.package_unit || 'Unité non précisée'}</dd></div><div><dt>Prix d’achat du conditionnement</dt><dd>{selectedMaterial.package_price == null ? <span className="value-missing">Prix absent</span> : <><span className="value-known">Prix connu : {selectedMaterial.package_price.toFixed(2)} {selectedMaterial.currency || 'Devise non précisée'}</span><small className="fact-note">{selectedMaterial.vat_included === true ? 'Montant TVAC' : selectedMaterial.vat_included === false ? 'Montant HTVA' : 'Statut TVA non précisé'}</small></>}</dd></div><div><dt>Disponibilité du coût HTVA</dt><dd>{(() => { const issue = getMaterialCostIssue(selectedMaterial); return issue ? <span className="value-missing">Non calculable : {issue}</span> : <span className="value-known">Base complète; le coût dépendra de la quantité de la recette.</span> })()}</dd></div><div><dt>TVA</dt><dd>{selectedMaterial.vat_included === true ? 'TVAC' : selectedMaterial.vat_included === false ? 'HTVA' : 'Non précisée'}</dd></div><div><dt>Allergènes</dt><dd>{selectedMaterial.allergens?.join(', ') || 'Non précisés'}</dd></div><div><dt>Notes</dt><dd>{selectedMaterial.notes || 'Aucune'}</dd></div></dl><button className="goldbtn" onClick={() => openEditMaterial(selectedMaterial)}>Modifier cette matière</button></> : <div className="empty-detail"><span>✦</span><h3>Fiche matière</h3><p className="muted">Sélectionnez une référence ou commencez un ajout.</p><button className="goldbtn" onClick={openNewMaterial}>+ Ajouter une matière</button></div>}</div>
        </div>
      </div>}

      {tab === 'Recettes' && <div className="recipe-layout"><div className="recipe-library"><div className="library-head"><div><h2>Bibliothèque de recettes</h2><p className="muted">Recettes partagées de l’atelier.</p></div><button className="goldbtn" onClick={() => { setCreatingRecipe(true); setSelectedRecipeId(null); setError('') }}>+ Nouvelle recette</button></div>
        <input className="search" placeholder="Rechercher une recette…" value={recipeSearch} onChange={event => setRecipeSearch(event.target.value)} /><button className="text-btn" onClick={() => setShowHiddenRecipes(value => !value)}>{showHiddenRecipes ? "Afficher les recettes visibles" : "Afficher les recettes masquées"}</button><div className="category-list">{['Toutes', ...recipeCategories].map(item => <button className={recipeCategory === item ? 'chip active' : 'chip'} key={item} onClick={() => setRecipeCategory(item)}>{item}</button>)}</div>
        {recipesLoading ? <p className="muted">Chargement des recettes…</p> : <div className="recipe-list">{visibleRecipes.map(item => <button className={selectedRecipeId === item.id && !creatingRecipe ? 'recipe-card chosen' : 'recipe-card'} key={item.id} onClick={() => { setSelectedRecipeId(item.id); setCreatingRecipe(false) }}><span className="recipe-category">{item.category}</span><b>{item.title}</b><small>{item.yieldQty && item.yieldUnit ? `${item.yieldQty} ${item.yieldUnit}` : 'Rendement non renseigné'} · Version {item.version}</small><span className="recipe-arrow">›</span></button>)}{!visibleRecipes.length && <p className="muted">Aucune recette correspondante.</p>}</div>}
      </div><div className="recipe-detail">{(creatingRecipe || editingRecipe) ? <><p className="gold">{editingRecipe ? 'MODIFICATION DE FICHE' : 'NOUVELLE FICHE'}</p><h2>{editingRecipe ? 'Modifier la recette' : 'Créer une recette'}</h2><label>Nom<input value={title} onChange={event => setTitle(event.target.value)} placeholder="Ex. Mousse chocolat au lait" /></label><div className="form-two"><label>Famille<select value={category} onChange={event => setCategory(event.target.value)}>{recipeCategories.map(item => <option key={item}>{item}</option>)}</select></label><label>Rendement<input inputMode="decimal" value={yieldQuantity} onChange={event => setYieldQuantity(event.target.value)} /></label></div><label>Unité de rendement<select value={yieldUnit} onChange={event => setYieldUnit(event.target.value)}><option>kg</option><option>g</option><option>pièces</option><option>plaque</option><option>litre</option></select></label>
        <div className="ingredient-head"><h3>Ingrédients du catalogue</h3><button className="text-btn" onClick={() => setIngredients(current => [...current, blankIngredient()])}>+ Ajouter une ligne</button></div>
        {ingredients.map((item, index) => <div className="recipe-ingredient-editor" key={index}><label>Matière<select value={item.ingredient_id ?? ''} disabled={materialsLoading} onChange={event => { const material = materials.find(candidate => candidate.id === event.target.value); updateIngredient(index, { ingredient_id: material?.id ?? null, name_snapshot: material?.name ?? '' }) }}><option value="">Choisir dans le catalogue…</option>{materials.map(material => <option key={material.id} value={material.id}>{getMaterialDisplayName(material)}{material.manufacturer ? ' · ' + material.manufacturer : ''}{material.reference ? ' · Réf. ' + material.reference : ''}</option>)}</select></label><label>Quantité<input type="number" min="0" step="any" inputMode="decimal" value={item.quantity} onChange={event => updateIngredient(index, { quantity: event.target.value })} /></label><label>Unité<select value={item.unit} onChange={event => updateIngredient(index, { unit: event.target.value })}>{units.map(value => <option key={value}>{value}</option>)}</select></label><button className="text-btn remove-line" onClick={() => setIngredients(current => current.filter((_, i) => i !== index))}>Supprimer</button></div>)}
        {!materials.length && <p className="tiny-note">Ajoutez d’abord les matières au catalogue pour les sélectionner ici.</p>}<label>Procédé<textarea rows={5} value={method} onChange={event => setMethod(event.target.value)} /></label>{error && <p className="auth-error">{error}</p>}<div className="detail-actions"><button className="text-btn" onClick={() => { setCreatingRecipe(false); setEditingRecipe(false) }}>Annuler</button><button className="goldbtn" disabled={savingRecipe || !title.trim()} onClick={editingRecipe ? updateRecipe : saveRecipe}>{savingRecipe ? 'Enregistrement…' : editingRecipe ? 'Enregistrer les modifications' : 'Créer la recette'}</button></div><p className="tiny-note">La composition enregistre l’identifiant du catalogue et un instantané du nom. Les anciennes lignes libres restent lisibles.</p>
      </> : selectedRecipe ? <><p className="gold">{selectedRecipe.category.toLocaleUpperCase('fr')}</p><h2>{selectedRecipe.title}</h2><div className="recipe-meta"><span>Rendement <b>{selectedRecipe.yieldQty && selectedRecipe.yieldUnit ? `${selectedRecipe.yieldQty} ${selectedRecipe.yieldUnit}` : 'Non renseigné'}</b></span><span>Version <b>{selectedRecipe.version}</b></span></div><div className="detail-actions"><button className="goldbtn" onClick={beginEditRecipe}>Modifier cette recette</button><button className="text-btn" onClick={() => setSelectedRecipeHidden(selectedRecipe.visibility !== 'hidden')}>{selectedRecipe.visibility === 'hidden' ? 'Réafficher cette recette' : 'Masquer cette recette'}</button></div><h3>Composition</h3><div className="ingredient-table">{selectedRecipe.ingredients.map((item, index) => <div className="ingredient-row recipe-ingredient-row" key={(item.ingredient_id ?? item.name_snapshot ?? 'ingredient') + index}><span>{(() => { const linkedMaterial = materials.find(material => material.id === item.ingredient_id); return linkedMaterial ? getMaterialDisplayName(linkedMaterial) : item.name_snapshot ?? item.name ?? 'Matière sans nom' })()}<small className={item.ingredient_id ? 'linked-label' : 'legacy-label'}>{item.ingredient_id ? 'Catalogue lié' : 'Ancienne ligne sans lien'}</small>{item.ingredient_id && (() => { const linkedMaterial = materials.find(material => material.id === item.ingredient_id); return linkedMaterial && <small>{linkedMaterial.manufacturer || 'Marque non précisée'}{linkedMaterial.reference ? ' · Réf. ' + linkedMaterial.reference : ''}</small> })()}</span><b>{item.quantity} {item.unit}</b></div>)}{!selectedRecipe.ingredients.length && <p className="muted">Aucun ingrédient.</p>}</div><section className="cost-summary"><h3>Coût matière HTVA</h3><p className="muted">Calcul uniquement avec prix HTVA, conditionnement et unités compatibles.</p>{selectedRecipe.ingredients.map((item, index) => { const cost = calculateIngredientCost(item, materials.find(material => material.id === item.ingredient_id)); return <div className="cost-line" key={index}><span>{(() => { const linkedMaterial = materials.find(material => material.id === item.ingredient_id); return linkedMaterial ? getMaterialDisplayName(linkedMaterial) : item.name_snapshot ?? item.name ?? 'Matière sans nom' })()}<small>{cost.reason ?? 'Calculé depuis le conditionnement HTVA'}</small></span><b>{cost.amount === null ? 'Non calculable' : displayMoney(cost.amount, cost.currency)}</b></div> })}<div className="cost-total"><span>Total matière</span><b>{totalCost.total === null ? totalCost.reason : displayMoney(totalCost.total, totalCost.currency!) + ' HTVA'}</b></div></section><h3>Procédé de fabrication</h3><p className="method-text">{selectedRecipe.method}</p></> : <div className="empty-detail"><span>✦</span><h2>Votre prochaine création commence ici.</h2><p className="muted">Choisissez une recette ou créez-en une nouvelle.</p><button className="goldbtn" onClick={() => setCreatingRecipe(true)}>+ Nouvelle recette</button></div>}</div></div>}

      {tab === 'Calculateur' && <CostCalculator recipes={recipes} materials={materials} />}
      {!['Accueil', 'Recettes', 'Matières premières', 'Calculateur'].includes(tab) && <div className="panel"><h2>{tab}</h2><p className="muted">Ce module reste à développer.</p></div>}
      <footer>BINÔME STUDIO · PAULINE & MATH <span>Pâtisserie · Chocolaterie · Glacerie</span></footer>
    </article></section>
  </main>
}
