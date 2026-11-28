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


/** fetch して、サーバーにつながらないときは分かりやすいメッセージにする（読み取りをやめたときはそのまま） */
async function request(url, options) {
    try {
        return await fetch(url, options);
    } catch (err) {
        if (err.name === 'AbortError') throw err;
        throw new Error('サーバーにつながりませんでした。バックエンドが起動しているか確かめてください');
    }
}

/** API がまだない（FastAPI の 404 は {"detail": "Not Found"}） */
function isMissingApi(body) {
    return !body?.detail || body.detail === 'Not Found';
}

/** エラーのとき、APIの {"detail": "..."} をメッセージにする */
async function errorFrom(res, fallback) {
    const body = await res.json().catch(() => null);
    if (res.status === 404 && isMissingApi(body)) {
        return new Error('PDF・画像の読み取りはまだ使えません（バックエンドの準備中です）');
    }
    return new Error(body?.detail || fallback);
}

/**
 * 楽譜の PDF・画像を楽譜認識にかけて、確認画面のJSONにする（POST /api/convert）。
 * signal：読み取りをやめるときの AbortSignal
 */
export async function convertFile(file, signal) {
    const fd = new FormData();
    fd.append('file', file);
    const res = await request(`${API_BASE}/api/convert`, { method: 'POST', body: fd, signal });
    if (!res.ok) throw await errorFrom(res, '楽譜の読み取りに失敗しました');
    return res.json();
}

/**
 * 確認・編集が済んだ確認画面のJSONを送り、調弦の候補と糸譜のJSONをもらう（POST /api/analyze-notes）。
 */
export async function analyzeNotes(data) {
    const res = await request(`${API_BASE}/api/analyze-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (res.status === 404 && isMissingApi(body)) {
            throw new Error('確認した楽譜から糸譜を作る機能は、まだ使えません（バックエンドの準備中です）');
        }
        throw new Error(body?.detail || '糸譜を作れませんでした');
    }
    return res.json();
}

/**
 * PDF読み取りのお試し：原本のPDFと、読み取った結果のダミー（確認画面のJSON）を読む。
 * 返すもの：{ file, data }
 */
export async function loadConfirmSample(sample) {
    const [pdfRes, jsonRes] = await Promise.all([
        fetch(`/${sample.pdf}`),
        fetch(`/${sample.confirm}`),
    ]);
    if (!pdfRes.ok || !jsonRes.ok) throw new Error('サンプルの読み込みに失敗しました');
    const blob = await pdfRes.blob();
    const file = new File([blob], sample.pdf, { type: 'application/pdf' });
    return { file, data: await jsonRes.json() };
}


export async function loadSampleScore(key) {
    const sample_score = SAMPLE_SCORES[key]
    const res = await fetch(`/${sample_score.file}`);
    return res.json();
}