import axios from 'axios'
import { getLoginRedirect } from '../lib/loginRedirect'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  withCredentials: true, // send httpOnly cookies automatically
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config?.url?.includes('/auth/login')) {
      // Clear local state and redirect to the login screen the user came from
      window.location.href = getLoginRedirect()
    }
    return Promise.reject(err)
  },
)
