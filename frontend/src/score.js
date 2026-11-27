/**                                                                                                                                  
 * 急の章 — 糸譜の描画                                                                                                               
 */                                                                                                                                  
import { KOTO_STRING_NAMES, MEASURES_PER_COLUMN } from './constants.js';


/**
 * 選択中の候補で糸譜と縦書き柱を描画する。
 * @param {object} state - アプリケーション状態（data, selectedCandidateId）
 */
export function renderScore(state) {
    const { data, selectedCandidateId } = state;
    const candidate = data.candidates.find((c) => c.id === selectedCandidateId)
        ?? data.candidates[0];

    updateSwitcher(data.candidates, selectedCandidateId);
    updatePillar(data, candidate);
    renderGrid(candidate.measures);
}

/** 調弦切替プルダウンを更新 */
function updateSwitcher(candidates, selectedId) {
    const switcher = document.getElementById('tuning-switcher');
    switcher.innerHTML = '';
    candidates.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.id}：${c.label}`;
        opt.selected = c.id === selectedId;
        switcher.appendChild(opt);
    });
}

/** 右端の縦書き柱を更新 */
function updatePillar(data, candidate) {
    document.getElementById('score-title').textContent = data.title;
    document.getElementById('score-composer').textContent = data.composer;

    // pillar-meta を書き換え
    const metaEl = document.querySelector('.pillar-meta');
    metaEl.innerHTML = '';

    const tuningName = document.createElement('p');
    tuningName.className = 'vertical-tuning';
    tuningName.textContent = candidate.label;

    const timeSig = document.createElement('p');
    timeSig.textContent = `${data.time.beatType}分の${data.time.beats}拍子`;

    const tempoP = document.createElement('p');
    tempoP.textContent = `♩＝${data.tempo}`;

    metaEl.append(tuningName, timeSig, tempoP);

    // 13弦の調弦リスト
    const tuningList = document.createElement('div');
    tuningList.className = 'pillar-tuning-list';
    KOTO_STRING_NAMES.forEach((name, i) => {
        const entry = document.createElement('span');
        entry.className = 'tuning-entry';
        entry.textContent = `${name} ${candidate.tuning[i] ?? '—'}`;
        tuningList.appendChild(entry);
    });
    metaEl.appendChild(tuningList);

    // 説明文
    const desc = document.createElement('p');
    desc.className = 'pillar-description';
    desc.textContent = candidate.description;
    metaEl.appendChild(desc);
}

/** 糸譜グリッドを描画 */
function renderGrid(measures) {
    const gridEl = document.getElementById('tatefu-grid');
    gridEl.innerHTML = '';

    for (let i = 0; i < measures.length; i += MEASURES_PER_COLUMN) {
        const chunk = measures.slice(i, i + MEASURES_PER_COLUMN);
        const colEl = document.createElement('div');
        colEl.className = 'tatefu-col';

        chunk.forEach((measure, mIdx) => {
            const globalIdx = i + mIdx;
            const isLast = globalIdx === measures.length - 1;
            const mDiv = document.createElement('div');
            mDiv.className = 'tatefu-measure' + (isLast ? ' final-measure' : '');

            // 小節番号
            const numTag = document.createElement('span');
            numTag.className = 'measure-num-tag';
            numTag.textContent = globalIdx + 1;
            mDiv.appendChild(numTag);

            // 各拍を描画
            measure.forEach((beat) => {
                mDiv.appendChild(renderBeat(beat));
            });

            colEl.appendChild(mDiv);
        });

        gridEl.appendChild(colEl);
    }
}

/**
 * 1拍分のセルを生成する。
 * beat は音符オブジェクトの配列。
 * 例: [{ string: "七" }]
 *     [{ string: "九", oshi: "ヲ" }]
 *     [{ rest: true }]
 *     [{ string: "七", repeat: true }]
 *     [{ string: "八" }, { string: "七" }]  ← 1拍に複数音
 */
function renderBeat(beat) {
    const cell = document.createElement('div');
    cell.className = 'beat-cell';

    console.log('beat', beat)

    beat.forEach((note) => {
        if (note.rest) {
            const mark = document.createElement('span');
            mark.className = note.short ? 'short-rest-mark' : 'rest-mark';
            mark.textContent = note.short ? '△' : '⊙';
            cell.appendChild(mark);
            return;
        }

        if (note.repeat) {
            const mark = document.createElement('span');
            mark.className = 'repeat-mark';
            mark.textContent = '、';
            cell.appendChild(mark);
            return;
        }

        const noteEl = document.createElement('span');
        noteEl.className = 'beat-note';

        if (note.oshi) {
            const oshiMark = document.createElement('span');
            oshiMark.className = 'oshi-mark';
            oshiMark.textContent = note.oshi;
            noteEl.appendChild(oshiMark);
        }

        noteEl.append(note.string);
        cell.appendChild(noteEl);
    });

    return cell;
}