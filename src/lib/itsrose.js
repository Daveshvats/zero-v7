import axios from 'axios';

const API_KEY = process.env.SR_ITSROSE_API_KEY;
const BASE_URL = process.env.SR_ITSROSE_API_URL || 'https://api.itsrose.net';

const itsrose = axios.create({
  baseURL: BASE_URL,
  timeout: 120000,
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  },
});

// Shared polling utility for async tasks
export async function pollTask(taskId, checkPath, options = {}) {
  const { intervalMs = 4000, maxAttempts = 35, label = 'task' } = options;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { data: res } = await itsrose.get(checkPath, { params: { task_id: taskId } });
    if (res.ok && res.data?.status === 'completed') {
      return res.data;
    }
    if (res.ok && res.data?.status === 'failed') {
      throw new Error(`${label} failed: ${res.data?.error || 'Unknown error'}`);
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(`${label} timed out after ${maxAttempts * intervalMs / 1000}s`);
}

export default itsrose;
