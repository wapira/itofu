import { SAMPLE_SCORES } from './constants.js';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

/**
 * 
 */
export async function analyzeFile(file) {
    // TODO: API 有効化後に削除（遅延込み）
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const res = await fetch('/sample.json');
    return res.json();

    try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch(`${API_BASE}/api/analyze`, {
            method: 'POST',
            body: fd,
        });
        if (!res.ok) throw new Error('解析に失敗しました');
        return res.json();
    } catch {
        // TODO: error
    }
}


export async function loadSampleScore(key) {
    const sample_score = SAMPLE_SCORES[key]
    const res = await fetch(`/${sample_score.file}`);
    return res.json();
}