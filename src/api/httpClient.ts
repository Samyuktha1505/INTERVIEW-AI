// This sets up a reusable axios instance with default config
import axios from 'axios';

const apiClient = axios.create({
  baseURL: 'http://localhost:8000',
  withCredentials: true, // enables cookie handling (like HTTP-only tokens)
  headers: {
    'Content-Type': 'application/json',
  },
});

export default apiClient;
