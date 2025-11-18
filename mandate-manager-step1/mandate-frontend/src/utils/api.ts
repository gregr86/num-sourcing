// Gestion d'erreurs améliorée avec retry et messages clairs

export class ApiError extends Error {
  constructor(
    public status: number,
    public message: string,
    public data?: any
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 2
): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(url, options)
      
      // Pas de retry pour les erreurs client (4xx)
      if (response.status >= 400 && response.status < 500) {
        return response
      }
      
      // Retry pour les erreurs serveur (5xx) ou réseau
      if (response.ok || i === retries) {
        return response
      }
      
      // Attente exponentielle avant retry
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000))
    } catch (error) {
      if (i === retries) throw error
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000))
    }
  }
  throw new Error('Max retries reached')
}

async function handleResponse(response: Response) {
  if (!response.ok) {
    let errorMessage = `Erreur ${response.status}`
    try {
  const data = await response.clone().json()
  errorMessage = data.error || data.message || errorMessage
} catch {
  // .clone() peut aussi être utilisé ici si tu veux
  try {
    errorMessage = await response.clone().text() || errorMessage
  } catch {
    // fallback
  }
}
    throw new ApiError(response.status, errorMessage)
  }
  
  const contentType = response.headers.get('content-type')
  if (contentType?.includes('application/json')) {
    return response.json()
  }
  return response.text()
}

export const api = {
  async get(path: string) {
    const response = await fetchWithRetry(`/api${path}`, {
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      }
    })
    return handleResponse(response)
  },

  async post(path: string, body?: any) {
    const response = await fetchWithRetry(`/api${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined
    })
    return handleResponse(response)
  },

  async patch(path: string, body?: any) {
    const response = await fetchWithRetry(`/api${path}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined
    })
    return handleResponse(response)
  },

  async del(path: string) {
    const response = await fetchWithRetry(`/api${path}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      }
    })
    return handleResponse(response)
  }
}
