export type MaterialSearchFields = {
  name: string
  manufacturer?: string | null
  supplier?: string | null
  reference?: string | null
}

export function normalizeMaterialSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .trim()
    .replace(/\s+/g, ' ')
}

export function searchMaterials<T extends MaterialSearchFields>(materials: T[], query: string): T[] {
  const terms = normalizeMaterialSearchText(query).split(' ').filter(Boolean)
  if (terms.length === 0) return materials

  return materials.filter(material => {
    const searchableText = normalizeMaterialSearchText([
      material.name,
      material.manufacturer,
      material.supplier,
      material.reference,
    ].filter(Boolean).join(' '))

    return terms.every(term => searchableText.includes(term))
  })
}
