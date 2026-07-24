import apiClient from '@/api/client'

export const datasetApi = {
  listBatches(projectId) {
    return apiClient.get('/datasets/batches', { params: { project_id: projectId } }).then((r) => r.data)
  },

  upload(projectId, stage, files) {
    const form = new FormData()
    form.append('project_id', projectId)
    form.append('stage', stage)
    files.forEach((f) => form.append('files', f))
    return apiClient.post('/datasets/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data)
  },

  process(datasetId, action, extra = {}) {
    return apiClient.post(`/datasets/${datasetId}/process`, { action, ...extra }).then((r) => r.data)
  },

  listFiles(datasetId) {
    return apiClient.get(`/datasets/${datasetId}/files`).then((r) => r.data)
  },

  listImages(datasetId) {
    return apiClient.get(`/datasets/${datasetId}/images`).then((r) => r.data)
  },

  delete(datasetId) {
    return apiClient.delete(`/datasets/${datasetId}`)
  },
}
