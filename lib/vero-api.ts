type SubmitVatInput = {
  submissionId: string
  periodYyyyMm: string
  payload: Record<string, unknown>
}

type SubmitVatResult = {
  mode: 'mock' | 'real'
  receipt: Record<string, unknown>
}

function envBool(name: string, fallback: boolean): boolean {
  const v = String(process.env[name] ?? '').trim().toLowerCase()
  if (!v) return fallback
  return v === '1' || v === 'true' || v === 'yes'
}

function buildMockReceipt(submissionId: string, periodYyyyMm: string) {
  const ts = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  return {
    provider: 'vero-mock',
    receipt_id: `MOCK-ALV-${ts}-${submissionId.slice(0, 8)}`,
    period_yyyy_mm: periodYyyyMm,
    accepted_at: new Date().toISOString(),
  }
}

export async function submitVatReturn(input: SubmitVatInput): Promise<SubmitVatResult> {
  const enabled = envBool('VERO_API_ENABLED', false)
  if (!enabled) {
    return { mode: 'mock', receipt: buildMockReceipt(input.submissionId, input.periodYyyyMm) }
  }

  const baseUrl = String(process.env.VERO_API_BASE_URL || '').trim()
  const submitPath = String(process.env.VERO_API_VAT_SUBMIT_PATH || '/vat/submissions').trim()
  const apiKey = String(process.env.VERO_API_KEY || '').trim()
  const timeoutMs = Number(process.env.VERO_API_TIMEOUT_MS || 15000)

  if (!baseUrl || !apiKey) {
    throw new Error('VERO API ei ole konfiguroitu (VERO_API_BASE_URL / VERO_API_KEY puuttuu)')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 15000)
  try {
    const url = new URL(submitPath, baseUrl).toString()
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'x-correlation-id': input.submissionId,
      },
      body: JSON.stringify({
        submission_id: input.submissionId,
        period_yyyy_mm: input.periodYyyyMm,
        payload: input.payload,
      }),
      signal: controller.signal,
    })

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      const errMsg = String(data?.error || data?.message || `HTTP ${res.status}`)
      throw new Error(`VERO API virhe: ${errMsg}`)
    }

    const receipt = {
      provider: 'vero-api',
      submitted_at: new Date().toISOString(),
      ...data,
    }
    return { mode: 'real', receipt }
  } finally {
    clearTimeout(timer)
  }
}

