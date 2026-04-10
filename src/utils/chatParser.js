/**
 * Parse Google Chat and Hangouts JSON exports into a unified conversation format.
 * @param {Array<{name: string, data: object}>} files - parsed JSON from zip entries
 */
export function parseChat(files) {
  const conversations = []

  for (const { name, data } of files) {
    // ── Google Chat format ──
    // messages.json inside Groups/<name>/
    if (data.messages && Array.isArray(data.messages)) {
      const messages = data.messages
        .map((m) => ({
          sender: m.creator?.name || m.creator?.email || 'Unknown',
          email: m.creator?.email || '',
          text: m.text || (m.attached_files?.length ? `[Attachment: ${m.attached_files[0].original_name || 'file'}]` : ''),
          timestamp: parseGoogleDate(m.created_date),
        }))
        .filter((m) => m.text)

      if (messages.length === 0) continue

      // Derive conversation title from folder name e.g. "Groups/My Team/messages.json"
      const parts = name.split('/')
      const folderName = parts.length >= 2 ? parts[parts.length - 2] : 'Chat'
      const participants = [...new Set(messages.map((m) => m.sender))]

      conversations.push({
        id: name,
        title: folderName !== 'messages.json' ? folderName : participants.join(', '),
        participants,
        source: 'Google Chat',
        messages,
        lastMessage: messages[messages.length - 1]?.timestamp,
      })
    }

    // ── Hangouts format ──
    // Top-level { conversations: [...] }
    if (data.conversations && Array.isArray(data.conversations)) {
      for (const convo of data.conversations) {
        const participantData =
          convo.conversation?.conversation?.participant_data || []

        // Build gaia_id → display name map
        const participantMap = {}
        for (const p of participantData) {
          const id = p.id?.gaia_id
          if (id) participantMap[id] = p.fallback_name || id
        }

        const events = convo.events || []
        const messages = events
          .filter((e) => e.chat_message?.message_content)
          .map((e) => {
            const segments = e.chat_message?.message_content?.segment || []
            const text = segments.map((s) => s.text || '').join('')
            const senderId = e.sender_id?.gaia_id
            return {
              sender: participantMap[senderId] || senderId || 'Unknown',
              email: '',
              text,
              // Hangouts timestamps are microseconds since epoch
              timestamp: e.timestamp
                ? new Date(Math.floor(parseInt(e.timestamp) / 1000)).toISOString()
                : null,
            }
          })
          .filter((m) => m.text)

        if (messages.length === 0) continue

        const participants = [...new Set(messages.map((m) => m.sender))]
        conversations.push({
          id: convo.conversation?.conversation?.id?.id || name,
          title: participants.join(', '),
          participants,
          source: 'Hangouts',
          messages,
          lastMessage: messages[messages.length - 1]?.timestamp,
        })
      }
    }
  }

  // Sort newest conversation first
  return conversations.sort((a, b) => {
    if (!a.lastMessage) return 1
    if (!b.lastMessage) return -1
    return new Date(b.lastMessage) - new Date(a.lastMessage)
  })
}

function parseGoogleDate(str) {
  if (!str) return null
  // Google Chat date: "Thursday, January 1, 2023 at 12:00:00 PM UTC"
  try {
    return new Date(str.replace(' at ', ' ')).toISOString()
  } catch {
    return str
  }
}
