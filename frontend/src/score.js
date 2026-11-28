/**                                                                                                                                  
 * 急の章 — 糸譜の描画                                                                                                               
 */                                                                                                                                  
import {
    KOTO_STRING_NAMES,
    MEASURES_PER_COLUMN,
    COLUMNS_PER_PAGE,
    FIRST_PAGE_COLUMNS,
} from './constants.js';


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

/**
 * 糸譜グリッドを描画する。
 * 1ページ目（曲名の柱あり）は FIRST_PAGE_COLUMNS 行、
 * 2ページ目からは COLUMNS_PER_PAGE 行ずつに分ける。
 */
function renderGrid(measures) {
    startedTuplets.clear();
    const columns = buildColumns(measures);

    // 1ページ目：HTML にある枠（#tatefu-grid）に入れる
    const firstGrid = document.getElementById('tatefu-grid');
    firstGrid.innerHTML = '';
    columns.slice(0, FIRST_PAGE_COLUMNS).forEach((col) => firstGrid.appendChild(col));

    // 2ページ目以降：前に作ったページを消してから作り直す
    const paper = document.getElementById('tatefu-paper');
    paper.querySelectorAll('.tatefu-page-extra').forEach((el) => el.remove());
    const legend = paper.querySelector('.tatefu-legend');

    for (let i = FIRST_PAGE_COLUMNS; i < columns.length; i += COLUMNS_PER_PAGE) {
        const page = createExtraPage(legend);
        const grid = page.querySelector('.tatefu-grid');
        columns.slice(i, i + COLUMNS_PER_PAGE).forEach((col) => grid.appendChild(col));
        paper.appendChild(page);
    }
}

/** 小節を MEASURES_PER_COLUMN ずつ1行（縦の列）にまとめた要素を返す */
function buildColumns(measures) {
    // 1小節の拍の数（いちばん長い小節に合わせる）。1行は MEASURES_PER_COLUMN 小節ぶんの拍で高さを等分する
    const beatsPerMeasure = Math.max(1, ...measures.map((m) => m.length));
    const beatsPerColumn = beatsPerMeasure * MEASURES_PER_COLUMN;

    const columns = [];
    for (let i = 0; i < measures.length; i += MEASURES_PER_COLUMN) {
        const chunk = measures.slice(i, i + MEASURES_PER_COLUMN);
        const colEl = document.createElement('div');
        colEl.className = 'tatefu-col';

        chunk.forEach((measure, mIdx) => {
            const globalIdx = i + mIdx;
            const isLast = globalIdx === measures.length - 1;
            const mDiv = document.createElement('div');
            mDiv.className = 'tatefu-measure' + (isLast ? ' final-measure' : '');
            mDiv.style.setProperty('--share', measure.length / beatsPerColumn);

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

        columns.push(colEl);
    }
    return columns;
}

/** 曲名の柱がない2ページ目以降の枠を作る */
function createExtraPage(legend) {
    const outer = document.createElement('div');
    outer.className = 'tatefu-outer-frame tatefu-page tatefu-page-extra';

    const inner = document.createElement('div');
    inner.className = 'tatefu-inner-frame';

    const wrapper = document.createElement('div');
    wrapper.className = 'tatefu-columns-wrapper';

    const grid = document.createElement('div');
    grid.className = 'tatefu-grid';

    wrapper.appendChild(grid);
    inner.appendChild(wrapper);
    outer.appendChild(inner);
    if (legend) outer.appendChild(legend.cloneNode(true));
    return outer;
}

/**
 * 1拍分のセルを生成する。
 * beat は音符オブジェクトの配列。
 * 例: [{ string: "七" }]
 *     [{ string: "九", oshi: "ヲ" }]
 *     [{ rest: true }]
 *     [{ string: "七", repeat: true }]
 *     [{ string: "七" }, { string: "八", pos: 0.5 }]           ← 8分音符2つ
 *     [{ string: "七", tuplet: { id: 1, n: 3 } }, ...]          ← 3連符
 *
 * pos は拍の中で始まる位置（0〜1、省略は 0）。
 * ふつうの拍：マスの真ん中に細い線を引き、前半（pos < 0.5）の音は線より上、
 *             後半の音は線より下に置く。
 * 連符を含む拍：半分の線は引かず、音を均等に並べて「（」と数字でくくる。
 */
function renderBeat(beat) {
    const cell = document.createElement('div');
    cell.className = 'beat-cell';

    if (beat.some((note) => note.tuplet)) {
        cell.classList.add('beat-even');
        fillItems(cell, beat);
        return cell;
    }

    cell.classList.add('beat-halves');
    const first = beat.filter((note) => (note.pos ?? 0) < 0.5 - 1e-6);
    const second = beat.filter((note) => (note.pos ?? 0) >= 0.5 - 1e-6);
    [first, second].forEach((items) => {
        const half = document.createElement('div');
        half.className = 'beat-half';
        fillItems(half, items);
        cell.appendChild(half);
    });
    return cell;
}

/**
 * 音・記号を container に縦に並べる。連符のまとまりは「（」でくくる。
 * --n（並べる数）で文字の大きさを決める（CSS）。
 */
function fillItems(container, items) {
    container.style.setProperty('--n', Math.max(items.length, 1));

    let group = null;
    items.forEach((note) => {
        const el = renderItem(note);
        if (!note.tuplet) {
            group = null;
            container.appendChild(el);
            return;
        }
        if (!group || group.dataset.id !== String(note.tuplet.id)) {
            group = document.createElement('span');
            group.className = 'tuplet-group';
            group.dataset.id = note.tuplet.id;
            // 数字は連符の最初のマスにだけ書く（2拍にまたがる連符もある）
            if (!startedTuplets.has(note.tuplet.id)) {
                startedTuplets.add(note.tuplet.id);
                group.dataset.n = note.tuplet.n;
            }
            container.appendChild(group);
        }
        group.appendChild(el);
    });
}

/** 描画中に数字を書いた連符の番号（renderGrid のたびに空にする） */
const startedTuplets = new Set();

/** 音・休符・「、」1つぶんの要素 */
function renderItem(note) {
    if (note.rest) {
        const mark = document.createElement('span');
        mark.className = 'beat-item ' + (note.short ? 'short-rest-mark' : 'rest-mark');
        mark.textContent = note.short ? '△' : '⊙';
        return mark;
    }

    if (note.repeat) {
        const mark = document.createElement('span');
        mark.className = 'beat-item repeat-mark';
        mark.textContent = '、';
        return mark;
    }

    const noteEl = document.createElement('span');
    noteEl.className = 'beat-item beat-note';

    if (note.oshi) {
        const oshiMark = document.createElement('span');
        oshiMark.className = 'oshi-mark';
        oshiMark.textContent = note.oshi;
        noteEl.appendChild(oshiMark);
    }

    noteEl.append(note.string);
    return noteEl;
}
