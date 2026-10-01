/** ISO 8601 em UTC com "Z" e sem milissegundos (equivalente a toIso8601ZuluString do Laravel). */
export const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString().replace(/\.\d{3}Z$/, 'Z') : null)
