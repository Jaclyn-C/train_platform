import apiClient from '@/api/client'

export const trainingApi = {
  listJobs(projectId) {
    const params = projectId ? { project_id: projectId } : {}
    return apiClient.get('/training/jobs', { params }).then(r => r.data)
  },

  start(config) {
    return apiClient.post('/training/start', config).then(r => r.data)
  },

  getStatus(jobId) {
    return apiClient.get(`/training/jobs/${jobId}/status`).then(r => r.data)
  },

  deleteJob(jobId) {
    return apiClient.delete(`/training/jobs/${jobId}`)
  },
}
