import axios from "axios";

export const API_BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const apiClient = axios.create({
  baseURL: API_BASE,
});

export const setAuthToken = (token) => {
  if (token) {
    apiClient.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete apiClient.defaults.headers.common.Authorization;
  }
};

export const apiRequest = async ({ method = "get", url, data, token, params }) => {
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const response = await apiClient.request({ method, url, data, params, headers });
  return response.data;
};