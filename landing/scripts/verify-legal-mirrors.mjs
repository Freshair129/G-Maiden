import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const landingRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pairs = [
  ['closed-beta-terms-of-use-draft.md', 'closed-beta-terms-of-use.md'],
  ['closed-beta-privacy-notice-draft.md', 'closed-beta-privacy-notice.md'],
]

for (const [canonicalName, mirrorName] of pairs) {
  const canonical = path.resolve(landingRoot, '..', 'docs', 'product', canonicalName)
  const mirror = path.resolve(landingRoot, 'src', 'legal', mirrorName)

  try {
    await access(mirror, constants.R_OK)
  } catch {
    console.log(`Legal mirror retired from landing, skipping: ${mirrorName}`)
    continue
  }

  const mirrorBytes = await readFile(mirror)

  if (mirrorBytes.length === 0) throw new Error(`Legal mirror is empty: ${mirror}`)

  try {
    await access(canonical, constants.R_OK)
  } catch {
    continue
  }

  const canonicalBytes = await readFile(canonical)
  if (!canonicalBytes.equals(mirrorBytes)) {
    throw new Error(`Legal mirror drift: copy ${canonical} to ${mirror}`)
  }
}

console.log('Legal deployment mirrors verified.')
