import apiClient from '@/api/client'

export const projectApi = {
  /** Get all personal projects */
  getPersonal() {
    return apiClient.get('/projects/personal').then((r) => r.data)
  },

  /** Get all team projects */
  getTeam() {
    return apiClient.get('/projects/team').then((r) => r.data)
  },

  /** Create a personal project */
  create(data) {
    return apiClient.post('/projects/personal', data).then((r) => r.data)
  },

  /** Update a personal project */
  update(id, data) {
    return apiClient.put(`/projects/personal/${id}`, data).then((r) => r.data)
  },

  /** Delete a personal project */
  delete(id) {
    return apiClient.delete(`/projects/personal/${id}`)
  },

  /** Share/unshare a project to a team */
  share(projectId, teamId) {
    return apiClient
      .put(`/projects/personal/${projectId}/share`, { team_id: teamId })
      .then((r) => r.data)
  },
}
