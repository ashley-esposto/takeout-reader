/**
 * Parse a .vcf (vCard) file into an array of contact objects.
 */
export function parseVCF(vcfText) {
  const contacts = []
  const cards = vcfText.split(/BEGIN:VCARD/i).slice(1)

  for (const card of cards) {
    const endIdx = card.search(/END:VCARD/i)
    const body = endIdx > -1 ? card.slice(0, endIdx) : card

    // Unfold
    const unfolded = body.replace(/\r?\n[ \t]/g, '')
    const lines = unfolded.split(/\r?\n/)

    const contact = { emails: [], phones: [], addresses: [] }

    for (const line of lines) {
      const sep = line.indexOf(':')
      if (sep < 0) continue
      const keyPart = line.slice(0, sep)
      const value = line.slice(sep + 1).trim()
      // Key may have TYPE params: EMAIL;TYPE=work
      const key = keyPart.split(';')[0].toUpperCase()
      const typeMatch = keyPart.match(/TYPE=([^;:]+)/i)
      const type = typeMatch ? typeMatch[1].toLowerCase() : ''

      switch (key) {
        case 'FN':
          contact.name = decodeVCFValue(value)
          break
        case 'N':
          if (!contact.name) {
            const parts = value.split(';')
            contact.name = [parts[1], parts[0]].filter(Boolean).map(decodeVCFValue).join(' ').trim()
          }
          break
        case 'EMAIL':
          if (value) contact.emails.push({ value, type })
          break
        case 'TEL':
          if (value) contact.phones.push({ value, type })
          break
        case 'ORG':
          contact.org = decodeVCFValue(value.split(';')[0])
          break
        case 'TITLE':
          contact.title = decodeVCFValue(value)
          break
        case 'NOTE':
          contact.note = decodeVCFValue(value).replace(/\\n/g, '\n')
          break
        case 'ADR': {
          const parts = value.split(';').map(decodeVCFValue)
          // ADR: PO Box; Extended; Street; City; State; ZIP; Country
          const addr = [parts[2], parts[3], parts[4], parts[5], parts[6]]
            .filter(Boolean).join(', ')
          if (addr) contact.addresses.push({ value: addr, type })
          break
        }
        case 'URL':
          contact.url = value
          break
        default:
          break
      }
    }

    if (contact.name || contact.emails.length > 0) {
      contacts.push(contact)
    }
  }

  return contacts.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
}

function decodeVCFValue(str) {
  return (str || '').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/g, '\n').replace(/\\\\/g, '\\')
}
