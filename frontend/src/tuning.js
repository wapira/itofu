/**                                                                                                            
 * 破の章 — 調弦候補カード3枚の描画                                                                            
 */
import { KOTO_STRING_NAMES } from './constants.js';


/**
 * 調弦カード3枚と曲メタ情報リボンを描画する。
 * @param {object} state - アプリケーション状態（data, selectedCandidateId）
 * @param {function} onSelect - カード選択時のコールバック（candidateId を渡す）
 */

export function renderTuningCards(state, onSelect) {
    const { data, selectedCandidateId } = state;

    // 曲メタ情報
    const summaryEl = document.getElementById('song-meta-summary');
    summaryEl.innerHTML = '';
    summaryEl.append(
        makeSpan(`曲名：${data.title}`),
        makeSpan(`作曲者：${data.composer}`),
        makeSpan(`拍子：${data.time.beats}/${data.time.beatType}拍子`),
        makeSpan(`テンポ：♩=${data.tempo}`),
    );

    // カード描画
    const grid = document.getElementById('tuning-cards');
    grid.innerHTML = '';
    data.candidates.forEach((cand) => {
        const selected = cand.id === selectedCandidateId;
        const card = document.createElement('article');
        card.className = 'tuning-card' + (selected ? ' selected' : '');

        // タイトル
        const title = document.createElement('h3');
        title.className = 'tuning-card-title';
        title.textContent = `${cand.id}：${cand.label}`;

        // 13弦グリッド
        const stringsBox = document.createElement('div');
        stringsBox.className = 'strings-box';
        KOTO_STRING_NAMES.forEach((name, i) => {
            const item = document.createElement('div');
            item.className = 'string-item';
            const nameSpan = document.createElement('span');
            nameSpan.textContent = name;
            const noteStrong = document.createElement('strong');
            noteStrong.textContent = cand.tuning[i] ?? '—';
            item.append(nameSpan, noteStrong);
            stringsBox.appendChild(item);
        });

        // 指標
        const metrics = document.createElement('div');
        metrics.className = 'tuning-metrics';
        metrics.append(
            makeMetricRow('変更弦数', `${cand.changedStrings}弦`),
            makeMetricRow('押し手回数', `${cand.oshiCount}回`),
        );

        // 説明文
        const comment = document.createElement('p');
        comment.className = 'tuning-comment';
        comment.textContent = cand.description;

        // ボタン
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'wa-btn ' + (selected ? 'wa-btn-vermilion' : 'wa-btn-secondary');
        // btn.textContent = selected ? '✓ 選択中' : 'この調弦で糸譜を表示 →';
        btn.textContent = 'この調弦で糸譜を表示 →';
        btn.addEventListener('click', () => onSelect(cand.id, true));

        const body = document.createElement('div');
        body.append(title, stringsBox, metrics, comment);
        card.append(body, btn);
        grid.appendChild(card);
    });
}

function makeSpan(text) {
    const span = document.createElement('span');
    span.textContent = text;
    return span;
}

function makeMetricRow(label, value) {
    const row = document.createElement('div');
    row.className = 'metric-row';
    const span = document.createElement('span');
    span.textContent = label;
    const strong = document.createElement('strong');
    strong.textContent = value;
    row.append(span, strong);
    return row;
}