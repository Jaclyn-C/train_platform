import apiClient from '@/api/client'

export const annotationApi = {
  get(datasetId, imageIndex) {
    return apiClient.get(`/annotations/${datasetId}/${imageIndex}`).then((r) => r.data)
  },
  save(datasetId, imageIndex, annotations) {
    return apiClient.post('/annotations/save', { dataset_id: datasetId, image_index: imageIndex, annotations }).then((r) => r.data)
  },
}
