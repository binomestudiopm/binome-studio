export type MaterialNameFields = {
  name: string
  manufacturer: string | null
  reference: string | null
}

export function hasNormalizedLemanName(material: MaterialNameFields): boolean {
  if (material.manufacturer?.trim().toLocaleLowerCase('fr') !== 'leman') return false

  const reference = material.reference?.trim() ?? ''
  const match = /^(\d{7})\s+(.+)$/.exec(material.name)
  return Boolean(match && /^\d{7}$/.test(reference) && match[1] === reference)
}

export function getMaterialDisplayName(material: MaterialNameFields): string {
  if (!hasNormalizedLemanName(material)) return material.name
  return material.name.replace(/^\d{7}\s+/, '')
}
