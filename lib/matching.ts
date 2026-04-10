export type BankEventInput = {
  idx?: number
  kirjpv?: string
  arvopv?: string
  sel?: string
  maksu?: string
  summa?: number
  viite?: string | null
  tila?: string
  vak?: { vt?: string; alv?: number; lbl?: string } | null
  vtNro?: string | null
  alvp?: number | null
  laskuIdx?: number | null
}

export type InvoiceInput = {
  idx?: number
  nro?: string | null
  toimittaja?: string | null
  pvm?: string | null
  erapv?: string | null
  summa_brutto?: number | null
  summa_netto?: number | null
  alv_prosentti?: number | null
  viite?: string | null
  ehdotettu_tili?: string | null
  tapIdx?: number | null
}

export type MatchingSuggestion = {
  eventIdx: number
  invoiceIdx: number
  score: number
  confidence: 'high' | 'medium' | 'low'
  reasons: string[]
}

export type MatchingPreparedEvent = {
  eventIdx: number
  suggestions: MatchingSuggestion[]
}

function norm(s: string | null | undefined): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9a-zäöå]/gi, ' ').replace(/\s+/g, ' ').trim()
}

function normRef(s: string | null | undefined): string {
  return (s || '').replace(/\s/g, '')
}

function parseDate(s: string | null | undefined): number | null {
  if (!s) return null
  const t = Date.parse(s)
  return Number.isNaN(t) ? null : t
}

function scorePair(event: BankEventInput, invoice: InvoiceInput, eventIdx: number, invoiceIdx: number): MatchingSuggestion {
  const reasons: string[] = []
  let score = 0
  const tSum = Math.abs(Number(event.summa) || 0)
  const lBrutto = Number(invoice.summa_brutto) || 0
  const lNetto = Number(invoice.summa_netto) || 0
  if (lBrutto > 0 && Math.abs(tSum - lBrutto) <= Math.max(1.0, lBrutto * 0.01)) {
    score += 45
    reasons.push('summa_brutto')
  } else if (lBrutto > 0 && Math.abs(tSum - lBrutto) <= Math.max(2.0, lBrutto * 0.03)) {
    score += 25
    reasons.push('summa_lahi')
  }
  if (lNetto > 0 && Math.abs(tSum - lNetto) <= Math.max(1.0, lNetto * 0.01)) {
    score += 12
    reasons.push('summa_netto')
  }

  const tName = norm(event.maksu || event.sel)
  const lName = norm(invoice.toimittaja)
  if (tName && lName && (tName.includes(lName) || lName.includes(tName))) {
    score += 30
    reasons.push('nimi')
  }

  const tRef = normRef(event.viite)
  const lRef = normRef(invoice.viite)
  if (tRef && lRef && (tRef === lRef || tRef.includes(lRef) || lRef.includes(tRef))) {
    score += 50
    reasons.push('viite')
  }

  const tDate = parseDate(event.arvopv || event.kirjpv)
  const lDate = parseDate(invoice.pvm)
  if (tDate && lDate) {
    const dayMs = 24 * 60 * 60 * 1000
    const d = Math.abs(tDate - lDate)
    if (d <= 2 * dayMs) {
      score += 10
      reasons.push('paiva_2')
    } else if (d <= 14 * dayMs) {
      score += 4
      reasons.push('paiva_14')
    }
  }

  const confidence: 'high' | 'medium' | 'low' = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low'
  return { eventIdx, invoiceIdx, score, confidence, reasons }
}

export function prepareMatching(
  events: BankEventInput[],
  invoices: InvoiceInput[],
  topK = 5
): { queue: MatchingPreparedEvent[]; stats: Record<string, number> } {
  const startedAt = Date.now()
  const activeEvents = events
    .map((e, i) => ({ ...e, idx: e.idx ?? i }))
    .filter(e => e.tila !== 'tuotu' && e.tila !== 'ohitettu')
  const activeInvoices = invoices
    .map((l, i) => ({ ...l, idx: l.idx ?? i }))
    .filter(l => l.tapIdx == null)

  const queue: MatchingPreparedEvent[] = activeEvents.map(e => {
    const suggestions = activeInvoices
      .map(l => scorePair(e, l, Number(e.idx), Number(l.idx)))
      .filter(s => s.score >= 20)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
    return { eventIdx: Number(e.idx), suggestions }
  })

  queue.sort((a, b) => {
    const aTop = a.suggestions[0]?.score ?? 0
    const bTop = b.suggestions[0]?.score ?? 0
    return bTop - aTop
  })

  const stats = {
    events: activeEvents.length,
    invoices: activeInvoices.length,
    withSuggestion: queue.filter(q => q.suggestions.length > 0).length,
    highConfidence: queue.filter(q => (q.suggestions[0]?.confidence || '') === 'high').length,
    compute_ms: Date.now() - startedAt,
  }
  return { queue, stats }
}
