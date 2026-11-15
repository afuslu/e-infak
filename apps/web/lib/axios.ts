'use client'

import axios, { AxiosRequestConfig, AxiosResponse } from 'axios'
import { adminApiBase, adminAuthHeaders } from './admin-access'

function buildConfig(config?: AxiosRequestConfig): AxiosRequestConfig {
  return {
    ...config,
    baseURL: `${adminApiBase()}/api/v1`,
    headers: {
      ...adminAuthHeaders(),
      ...(config?.headers || {}),
    },
  }
}

export const api = {
  get<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return axios.get<T>(url, buildConfig(config))
  },
  post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return axios.post<T>(url, data, buildConfig(config))
  },
  put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return axios.put<T>(url, data, buildConfig(config))
  },
  patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return axios.patch<T>(url, data, buildConfig(config))
  },
  delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return axios.delete<T>(url, buildConfig(config))
  },
}
