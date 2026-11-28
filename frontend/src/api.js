import { SAMPLE_SCORES } from './constants.js';
import { musicXmlToConfirm, toReviewScore } from './confirm/adapter.js';

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

/**
 * エラーのときのメッセージ。detail は文字列のほか、リクエストの形が違うときは配列になる。
 */
async function errorFrom(res, fallback, missingMessage) {
    const body = await res.json().catch(() => null);
    if (res.status === 404 && isMissingApi(body)) return new Error(missingMessage);
    const detail = body?.detail;
    if (Array.isArray(detail)) {
        const msgs = detail.map((d) => d?.msg).filter(Boolean);
        return new Error(`${fallback}（${msgs.slice(0, 3).join(' / ') || '送ったデータの形が違います'}）`);
    }
    return new Error(detail || fallback);
}

/**
 * 楽譜の PDF・PNG を楽譜認識にかけて、確認画面のJSONにする（POST /api/review/recognize）。
 * バックエンドが返す MusicXML から、楽譜に書いてある通りの形（確認画面のJSON）を作る。
 * signal：読み取りをやめるときの AbortSignal
 * 返すもの：{ data, warnings, missingFields }
 */
export async function convertFile(file, signal) {
    const fd = new FormData();
    fd.append('file', file);
    const res = await request(`${API_BASE}/api/review/recognize`, { method: 'POST', body: fd, signal });
    if (!res.ok) {
        throw await errorFrom(res, '楽譜の読み取りに失敗しました',
            'PDF・PNGの読み取りはまだ使えません（バックエンドの準備中です）');
    }
    const body = await res.json();
    const data = musicXmlToConfirm(body.musicxml, {
        title: body.score?.title,
        composer: body.score?.composer,
        tempo: body.score?.tempo,
    });
    return {
        data,
        warnings: body.warnings ?? [],
        missingFields: body.missing_fields ?? [],
    };
}

/**
 * 確認・編集が済んだ確認画面のJSONを送り、調弦の候補と糸譜のJSONをもらう（POST /api/review/convert）。
 * バックエンドの Score の形に直し、確認済みの印（confirmed: true）を付けて送る。
 */
export async function analyzeNotes(data) {
    const res = await request(`${API_BASE}/api/review/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: toReviewScore(data), confirmed: true }),
    });
    if (!res.ok) {
        throw await errorFrom(res, '糸譜を作れませんでした',
            '確認した楽譜から糸譜を作る機能は、まだ使えません（バックエンドの準備中です）');
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
    return { file, data: await jsonRes.json(), warnings: [], missingFields: [] };
}


export async function loadSampleScore(key) {
    const sample_score = SAMPLE_SCORES[key]
    const res = await fetch(`/${sample_score.file}`);
    return res.json();
}