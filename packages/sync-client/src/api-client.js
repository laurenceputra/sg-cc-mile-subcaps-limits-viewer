export class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.token = null;
  }

  setToken(token) {
    this.token = token;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const config = {
      ...options,
      headers
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(error.message || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('[ApiClient] Request failed:', error);
      throw error;
    }
  }

  async login(email, passwordHash) {
    const response = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, passwordHash })
    });
    this.setToken(response.token);
    return response;
  }

  async register(email, passwordHash, tier = 'free') {
    const response = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, passwordHash, tier })
    });
    this.setToken(response.token);
    return response;
  }

  async getSyncData() {
    return await this.request('/sync/data');
  }

  async putSyncData(encryptedData, version) {
    return await this.request('/sync/data', {
      method: 'PUT',
      body: JSON.stringify({ encryptedData, version })
    });
  }

  async getSharedMappings(cardType) {
    return await this.request(`/shared/mappings/${encodeURIComponent(cardType)}`);
  }

  async contributeMappings(mappings) {
    return await this.request('/shared/mappings/contribute', {
      method: 'POST',
      body: JSON.stringify({ mappings })
    });
  }

  async deleteUserData() {
    return await this.request('/user/data', {
      method: 'DELETE'
    });
  }
}
