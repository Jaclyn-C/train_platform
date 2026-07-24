import apiClient from '@/api/client'

export const labelApi = {
  list(projectId) {
    return apiClient.get(`/projects/${projectId}/labels`).then((r) => r.data)
  },
  create(projectId, data) {
    return apiClient.post(`/projects/${projectId}/labels`, data).then((r) => r.data)
  },
  delete(projectId, labelId) {
    return apiClient.delete(`/projects/${projectId}/labels/${labelId}`)
  },
}
