import apiClient from '@/api/client'

export const teamApi = {
  list() {
    return apiClient.get('/teams').then((r) => r.data)
  },
  create(name) {
    return apiClient.post('/teams', { name }).then((r) => r.data)
  },
}
