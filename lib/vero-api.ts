import https from 'node:https'

type SubmitVatInput = {
  submissionId: string
  periodYyyyMm: string
  payload: Record<string, unknown>
}

export type SubmitVatResult = {
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

function httpsPostJson(
  urlStr: string,
  body: Record<string, unknown>,
  options: {
    timeoutMs: number
    headers: Record<string, string>
    cert?: string
    key?: string
    ca?: string
  }
): Promise<{ status: number; data: Record<string, unknown>; rawText: string }> {
  return new Promise((resolve, reject) => {
    let u: URL
    try {
      u = new URL(urlStr)
    } catch {
      reject(new Error('Virheellinen VERO_API_BASE_URL'))
      return
    }
    if (u.protocol !== 'https:') {
      reject(new Error('Vero-kutsu vaatii https-osoitteen'))
      return
    }

    const payload = JSON.stringify(body)
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(payload, 'utf8')),
      ...options.headers,
    }

    const reqOpts: https.RequestOptions = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'POST',
      headers,
      timeout: options.timeoutMs,
    }
    if (options.cert) reqOpts.cert = options.cert
    if (options.key) reqOpts.key = options.key
    if (options.ca) reqOpts.ca = options.ca

    const req = https.request(reqOpts, res => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        const rawText = Buffer.concat(chunks).toString('utf8')
        let data: Record<string, unknown> = {}
        try {
          data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {}
        } catch {
          data = { _raw: rawText }
        }
        resolve({ status: res.statusCode || 0, data, rawText })
      })
    })
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('VERO API aikakatkaisu'))
    })
    req.write(payload)
    req.end()
  })
}

/**
 * Lähettää ALV-aineiston Verohallinnon rajapintaan kun VERO_API_ENABLED=true.
 * Oletus: mock (ei verkkokutsua).
 *
 * Ympäristömuuttujat (tuotanto / hiekkalaatikko):
 * - VERO_API_ENABLED=true
 * - VERO_API_BASE_URL (https://...)
 * - VERO_API_VAT_SUBMIT_PATH (oletus /vat/submissions) — korvaa Veron dokumentaation mukaiseksi
 * - VERO_API_KEY (valinnainen, jos rajapinta käyttää API-avainta)
 * - VERO_AUTHORIZATION_TOKEN (valinnainen Suomi.fi GetToken -JWT, header vero-authorizationtoken)
 * - VERO_TLS_CERT_PEM + VERO_TLS_KEY_PEM (mTLS-varmenne, PEM-tekstinä — käytä Vercel Secret -tyyppisiä monirivisiä arvoja)
 * - VERO_TLS_CA_PEM (valinnainen)
 */
export async function submitVatReturn(input: SubmitVatInput): Promise<SubmitVatResult> {
  const enabled = envBool('VERO_API_ENABLED', false)
  if (!enabled) {
    return { mode: 'mock', receipt: buildMockReceipt(input.submissionId, input.periodYyyyMm) }
  }

  const baseUrl = String(process.env.VERO_API_BASE_URL || '').trim()
  const submitPath = String(process.env.VERO_API_VAT_SUBMIT_PATH || '/vat/submissions').trim()
  const apiKey = String(process.env.VERO_API_KEY || '').trim()
  const authToken = String(process.env.VERO_AUTHORIZATION_TOKEN || '').trim()
  const certPem = String(process.env.VERO_TLS_CERT_PEM || '').trim()
  const keyPem = String(process.env.VERO_TLS_KEY_PEM || '').trim()
  const caPem = String(process.env.VERO_TLS_CA_PEM || '').trim()
  const timeoutMs = Number(process.env.VERO_API_TIMEOUT_MS || 15000)
  const t = Number.isFinite(timeoutMs) ? timeoutMs : 15000

  if (!baseUrl) {
    throw new Error('VERO API ei ole konfiguroitu (VERO_API_BASE_URL puuttuu)')
  }

  const hasMtls = Boolean(certPem && keyPem)
  if (!hasMtls && !apiKey) {
    throw new Error('VERO API: anna joko mTLS (VERO_TLS_CERT_PEM + VERO_TLS_KEY_PEM) tai VERO_API_KEY')
  }

  const url = new URL(submitPath, baseUrl).toString()
  const postBody = {
    submission_id: input.submissionId,
    period_yyyy_mm: input.periodYyyyMm,
    payload: input.payload,
  }

  const headers: Record<string, string> = {
    'x-correlation-id': input.submissionId,
  }
  if (apiKey) headers['x-api-key'] = apiKey
  if (authToken) headers['vero-authorizationtoken'] = authToken

  let status: number
  let data: Record<string, unknown>

  if (hasMtls) {
    const res = await httpsPostJson(url, postBody, {
      timeoutMs: t,
      headers,
      cert: certPem,
      key: keyPem,
      ca: caPem || undefined,
    })
    status = res.status
    data = res.data
  } else {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), t)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(postBody),
        signal: controller.signal,
      })
      status = res.status
      data = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) {
        const errMsg = String(data?.error || data?.message || `HTTP ${status}`)
        throw new Error(`VERO API virhe: ${errMsg}`)
      }
    } finally {
      clearTimeout(timer)
    }
    const receipt = {
      provider: 'vero-api',
      submitted_at: new Date().toISOString(),
      ...data,
    }
    return { mode: 'real', receipt }
  }

  if (status < 200 || status >= 300) {
    const errMsg = String(data?.error || data?.message || `HTTP ${status}`)
    throw new Error(`VERO API virhe: ${errMsg}`)
  }

  const receipt = {
    provider: 'vero-api',
    submitted_at: new Date().toISOString(),
    ...data,
  }
  return { mode: 'real', receipt }
}
