import { SAMPLE_SCORES } from './constants.js';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

/**
 * 
 */
export async function analyzeFile(file) {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${API_BASE}/api/analyze`, {
        method: 'POST',
        body: fd,
    });
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || '解析に失敗しました');
    }
    return res.json();
}


export async function loadSampleScore(key) {
    const sample_score = SAMPLE_SCORES[key]
    const res = await fetch(`/${sample_score.file}`);
    return res.json();
}