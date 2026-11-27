/**
 * 和楽譜・縦譜変換器（100% フロントエンド完結版）
 * MusicXML (DOMParser) -> 調弦3案の自動算出 -> 伝統縦譜描画 & 印刷
 */

(() => {
  "use strict";

  // 音名とMIDIノート番号の変換テーブル
  const STEP_TO_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const SEMITONE_TO_NAME = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

  function midiToNoteName(midi) {
    const pitchClass = ((midi % 12) + 12) % 12;
    const octave = Math.floor(midi / 12) - 1;
    return `${SEMITONE_TO_NAME[pitchClass]}${octave}`;
  }

  // 内蔵サンプルMusicXML（外部DOCTYPEや通信一切なし）
  const SAMPLE_XML = {
    sakura: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>さくらさくら</work-title></work>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>2</duration></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>2</duration></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>4</duration></note>
    </measure>
    <measure number="2">
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>2</duration></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>2</duration></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>4</duration></note>
    </measure>
    <measure number="3">
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>2</duration></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>2</duration></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>2</duration></note>
    </measure>
    <measure number="4">
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>2</duration></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>4</duration></note>
    </measure>
    <measure number="5">
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration></note>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>2</duration></note>
    </measure>
    <measure number="6">
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration></note>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note>
      <note><pitch><step>B</step><octave>3</octave></pitch><duration>4</duration></note>
    </measure>
  </part>
</score-partwise>`,

    kojo: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>荒城の月（旋律抄）</work-title></work>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>2</duration></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>2</duration></note>
    </measure>
    <measure number="2">
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>2</duration></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>4</duration></note>
    </measure>
    <measure number="3">
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>2</duration></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>2</duration></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration></note>
    </measure>
    <measure number="4">
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>6</duration></note>
      <note><rest/><duration>2</duration></note>
    </measure>
  </part>
</score-partwise>`,

    kuroda: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>黒田節（旋律抄）</work-title></work>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>2</duration></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>2</duration></note>
    </measure>
    <measure number="2">
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>3</duration></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>2</duration></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration></note>
    </measure>
    <measure number="3">
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>2</duration></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration></note>
    </measure>
    <measure number="4">
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>6</duration></note>
      <note><rest/><duration>2</duration></note>
    </measure>
  </part>
</score-partwise>`
  };

  // アプリケーション状態
  const state = {
    parsedScore: null,
    tuningCandidates: [],
    selectedTuningIndex: 0
  };

  // DOM要素参照
  const screens = {
    1: document.getElementById("screen-upload"),
    2: document.getElementById("screen-tuning"),
    3: document.getElementById("screen-score")
  };

  const navButtons = {
    1: document.getElementById("nav-step-1"),
    2: document.getElementById("nav-step-2"),
    3: document.getElementById("nav-step-3")
  };

  function showStep(stepNumber) {
    Object.entries(screens).forEach(([num, el]) => {
      const active = Number(num) === stepNumber;
      el.hidden = !active;
      el.classList.toggle("active", active);
    });

    Object.entries(navButtons).forEach(([num, btn]) => {
      const n = Number(num);
      btn.classList.toggle("active", n === stepNumber);
      if (n < stepNumber) btn.classList.add("completed");
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /**
   * MusicXML文字列を解析して小節・音符構造を返す
   */
  function parseMusicXML(xmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, "application/xml");

    if (doc.querySelector("parsererror")) {
      throw new Error("MusicXMLの構文を解析できませんでした。正しいXMLファイルかご確認ください。");
    }

    const titleEl =
      doc.querySelector("work > work-title") ||
      doc.querySelector("movement-title") ||
      doc.querySelector("credit-words");
    const title = titleEl ? titleEl.textContent.trim() : "無題の和楽譜";

    const firstPart = doc.querySelector("part");
    if (!firstPart) {
      throw new Error("楽譜パート（<part>）が見つかりませんでした。");
    }

    let divisions = 1;
    let beats = 4;
    let beatType = 4;
    const measures = [];
    const allMidis = [];

    firstPart.querySelectorAll("measure").forEach((mEl, idx) => {
      const divEl = mEl.querySelector("attributes > divisions");
      if (divEl) divisions = Math.max(1, parseInt(divEl.textContent, 10) || 1);

      const beatsEl = mEl.querySelector("attributes > time > beats");
      const beatTypeEl = mEl.querySelector("attributes > time > beat-type");
      if (beatsEl) beats = parseInt(beatsEl.textContent, 10) || 4;
      if (beatTypeEl) beatType = parseInt(beatTypeEl.textContent, 10) || 4;

      const events = [];
      mEl.querySelectorAll("note").forEach((nEl) => {
        // 和音（<chord>）は単旋律縦譜化のため主旋律のみ抽出
        if (nEl.querySelector("chord")) return;

        const durEl = nEl.querySelector("duration");
        const rawDur = durEl ? parseInt(durEl.textContent, 10) : divisions;
        const quarterUnits = Math.max(0.25, rawDur / divisions);

        if (nEl.querySelector("rest")) {
          events.push({ isRest: true, midi: null, quarterUnits });
          return;
        }

        const stepEl = nEl.querySelector("pitch > step");
        const octaveEl = nEl.querySelector("pitch > octave");
        if (!stepEl || !octaveEl) return;

        const step = stepEl.textContent.trim().toUpperCase();
        const alterEl = nEl.querySelector("pitch > alter");
        const alter = alterEl ? parseInt(alterEl.textContent, 10) || 0 : 0;
        const octave = parseInt(octaveEl.textContent, 10);

        const semitone = STEP_TO_SEMITONE[step];
        if (semitone === undefined) return;

        const midi = (octave + 1) * 12 + semitone + alter;
        allMidis.push(midi);
        events.push({ isRest: false, midi, quarterUnits });
      });

      measures.push({
        number: mEl.getAttribute("number") || String(idx + 1),
        beats,
        beatType,
        events
      });
    });

    if (allMidis.length === 0) {
      throw new Error("有効な音符データ（<pitch>）が楽譜内に見つかりませんでした。");
    }

    const minMidi = Math.min(...allMidis);
    const maxMidi = Math.max(...allMidis);

    return {
      title,
      beats,
      beatType,
      measures,
      allMidis,
      minMidi,
      maxMidi
    };
  }

  /**
   * 楽曲の音域・頻出音から弾きやすい調弦3案（本調子・二上がり・三下がり）を評価生成
   */
  function generateTuningCandidates(parsed) {
    const { allMidis, minMidi } = parsed;

    // 頻出音高クラス（0〜11）を算出して最適な基準音（一の糸）を決定
    const freq = new Array(12).fill(0);
    allMidis.forEach((m) => {
      freq[m % 12] += 1;
    });

    // 最低音付近で曲の主音・頻出音に合いやすい一の糸MIDIを探索
    let bestRoot = minMidi;
    let bestRootScore = -Infinity;
    for (let cand = minMidi - 2; cand <= minMidi + 2; cand++) {
      const pc = ((cand % 12) + 12) % 12;
      const fifthPc = (pc + 7) % 12;
      const fourthPc = (pc + 5) % 12;
      const score = freq[pc] * 3 + freq[fifthPc] * 2 + freq[fourthPc] * 2 - Math.abs(cand - minMidi) * 1.5;
      if (score > bestRootScore) {
        bestRootScore = score;
        bestRoot = cand;
      }
    }

    // 伝統的な三種の調弦インターバル（[一の糸, 二の糸, 三の糸]）
    const definitions = [
      {
        id: "honchoshi",
        name: "本調子（ほんちょうし）",
        intervals: [0, 5, 12], // 完全四度 ＋ 完全五度（オクターブ）
        character: "最も標準的で安定感のある調弦。中音域から高音域まで無理なく指が届きます。"
      },
      {
        id: "niagari",
        name: "二上がり（にあがり）",
        intervals: [0, 7, 12], // 完全五度 ＋ 完全四度
        character: "二の糸を1音高く張る華やかな調弦。中音域の開放弦が多くなり運指が軽快になります。"
      },
      {
        id: "sansagari",
        name: "三下がり（さんさがり）",
        intervals: [0, 5, 10], // 完全四度 ＋ 完全四度
        character: "三の糸を1音下げた情緒豊かな調弦。落ち着いた民謡・叙情曲で左手の移動を抑えられます。"
      }
    ];

    const evaluated = definitions.map((def) => {
      const strings = def.intervals.map((iv) => bestRoot + iv);
      let openHits = 0;
      let maxFret = 0;
      let totalFretDistance = 0;

      allMidis.forEach((midi) => {
        const mapped = mapMidiToString(midi, strings);
        if (mapped.fret === 0) openHits += 1;
        if (mapped.fret > maxFret) maxFret = mapped.fret;
        totalFretDistance += mapped.fret;
      });

      const openRatio = Math.round((openHits / allMidis.length) * 100);
      const avgFret = totalFretDistance / allMidis.length;

      // 弾きやすさスコア（0〜100点）
      let easeScore = 72 + openRatio * 0.45 - avgFret * 2.2 - Math.max(0, maxFret - 12) * 2.5;
      easeScore = Math.max(48, Math.min(99, Math.round(easeScore)));

      return {
        ...def,
        strings,
        stringNames: strings.map(midiToNoteName),
        openRatio,
        maxFret,
        easeScore
      };
    });

    // スコア順に並べ替えて最優秀案を「一押し」にする
    evaluated.sort((a, b) => b.easeScore - a.easeScore);
    return evaluated;
  }

  /**
   * 1音を3本の糸（0:一の糸, 1:二の糸, 2:三の糸）のうち最も勘所（フレット）が小さい弦に割り当てる
   */
  function mapMidiToString(midi, strings) {
    let bestString = 0;
    let bestFret = midi - strings[0];

    for (let s = 0; s < 3; s++) {
      const fret = midi - strings[s];
      if (fret >= 0) {
        if (bestFret < 0 || fret < bestFret) {
          bestFret = fret;
          bestString = s;
        }
      }
    }

    // もし一の糸より低い音が含まれていた場合は一の糸の0（押さえ替え想定）に丸める
    if (bestFret < 0) {
      bestString = 0;
      bestFret = 0;
    }

    return { stringIndex: bestString, fret: bestFret };
  }

  /**
   * 調弦比較カード（破の章）を描画
   */
  function renderTuningCards() {
    const parsed = state.parsedScore;
    const summaryEl = document.getElementById("song-meta-summary");
    summaryEl.innerHTML = `
      <span>曲名：<strong>${escapeHtml(parsed.title)}</strong></span>
      <span>拍子：<strong>${parsed.beats}/${parsed.beatType}拍子</strong></span>
      <span>音域：<strong>${midiToNoteName(parsed.minMidi)} ～ ${midiToNoteName(parsed.maxMidi)}</strong></span>
      <span>総音符数：<strong>${parsed.allMidis.length}音</strong></span>
    `;

    const grid = document.getElementById("tuning-cards");
    grid.innerHTML = "";

    state.tuningCandidates.forEach((cand, idx) => {
      const card = document.createElement("article");
      card.className = `tuning-card${idx === 0 ? " recommended" : ""}`;

      card.innerHTML = `
        ${idx === 0 ? '<div class="recommend-stamp">一押し・最適調弦</div>' : ""}
        <div>
          <h3 class="tuning-card-title">${cand.name}</h3>
          <div class="strings-box">
            <div class="string-item"><span>一の糸（太）</span><strong>${cand.stringNames[0]}</strong></div>
            <div class="string-item"><span>二の糸（中）</span><strong>${cand.stringNames[1]}</strong></div>
            <div class="string-item"><span>三の糸（細）</span><strong>${cand.stringNames[2]}</strong></div>
          </div>
          <div class="tuning-metrics">
            <div class="metric-row">
              <span>弾きやすさ適合度</span>
              <strong>${cand.easeScore}点 / 100点</strong>
            </div>
            <div class="ease-bar-bg">
              <div class="ease-bar-fill" style="width: ${cand.easeScore}%;"></div>
            </div>
            <div class="metric-row">
              <span>開放弦（0）の活用率</span>
              <strong>${cand.openRatio}%</strong>
            </div>
            <div class="metric-row">
              <span>最高勘所ポジション</span>
              <strong>${cand.maxFret} の勘所</strong>
            </div>
          </div>
          <p class="tuning-comment">${cand.character}</p>
        </div>
        <button type="button" class="wa-btn ${idx === 0 ? "wa-btn-vermilion" : "wa-btn-secondary"}" data-choose-idx="${idx}">
          この調弦で縦譜を作成 →
        </button>
      `;

      grid.appendChild(card);
    });

    grid.querySelectorAll("[data-choose-idx]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.selectedTuningIndex = Number(btn.getAttribute("data-choose-idx"));
        navButtons[3].disabled = false;
        renderTatefuScore();
        showStep(3);
      });
    });
  }

  /**
   * 選択された調弦で伝統縦譜（急の章）を描画
   */
  function renderTatefuScore() {
    const parsed = state.parsedScore;
    const tuning = state.tuningCandidates[state.selectedTuningIndex];

    // ツールバーのプルダウン同期
    const switcher = document.getElementById("tuning-switcher");
    switcher.innerHTML = state.tuningCandidates
      .map((c, i) => `<option value="${i}" ${i === state.selectedTuningIndex ? "selected" : ""}>${c.name}</option>`)
      .join("");

    // 縦書きタイトル柱の更新
    document.getElementById("score-title").textContent = parsed.title;
    document.getElementById("score-tuning-name").textContent = tuning.name;
    document.getElementById("score-tuning-notes").textContent =
      `一の糸：${tuning.stringNames[0]} ／ 二の糸：${tuning.stringNames[1]} ／ 三の糸：${tuning.stringNames[2]}`;
    document.getElementById("score-time-sig").textContent = `${parsed.beats}分の${parsed.beatType}拍子`;

    const gridEl = document.getElementById("tatefu-grid");
    gridEl.innerHTML = "";

    // 1列あたり4小節ずつ縦に積み、列自体は右から左へ並べる
    const MEASURES_PER_COL = 4;
    for (let i = 0; i < parsed.measures.length; i += MEASURES_PER_COL) {
      const chunk = parsed.measures.slice(i, i + MEASURES_PER_COL);
      const colEl = document.createElement("div");
      colEl.className = "tatefu-col";

      // 伝統的な縦譜の列見出し（左＝三の糸、中＝二の糸、右＝一の糸）
      colEl.innerHTML = `
        <div class="col-header">
          <span>三</span>
          <span>二</span>
          <span>一</span>
        </div>
      `;

      chunk.forEach((measure, mIdx) => {
        const globalIndex = i + mIdx;
        const isLastMeasure = globalIndex === parsed.measures.length - 1;
        const mDiv = document.createElement("div");
        mDiv.className = `tatefu-measure${isLastMeasure ? " final-measure" : ""}`;

        const numTag = document.createElement("span");
        numTag.className = "measure-num-tag";
        numTag.textContent = measure.number;
        mDiv.appendChild(numTag);

        measure.events.forEach((ev) => {
          // 音価に応じた行数（0.5拍=1行、1拍=1行、2拍以上は伸ばし線行を追加）
          const sustainRows = Math.max(0, Math.floor(ev.quarterUnits) - 1);
          const isEighth = ev.quarterUnits <= 0.5;

          const row = document.createElement("div");
          row.className = "tatefu-row";

          // 3レーン（col 0 = 三の糸[index 2], col 1 = 二の糸[index 1], col 2 = 一の糸[index 0]）
          const cells = [document.createElement("div"), document.createElement("div"), document.createElement("div")];
          cells.forEach((c) => (c.className = "string-cell"));

          if (ev.isRest) {
            cells[1].textContent = "〇";
          } else {
            const mapped = mapMidiToString(ev.midi, tuning.strings);
            const visualCol = 2 - mapped.stringIndex; // 一の糸(0)->右(2), 三の糸(2)->左(0)
            cells[visualCol].textContent = String(mapped.fret);
            if (mapped.fret === 0) cells[visualCol].classList.add("open-string");
            if (isEighth) cells[visualCol].classList.add("eighth-beam");
          }

          cells.forEach((c) => row.appendChild(c));
          mDiv.appendChild(row);

          // 長音符の伸ばし線（｜）
          for (let s = 0; s < sustainRows; s++) {
            const sRow = document.createElement("div");
            sRow.className = "tatefu-row";
            const sCells = [document.createElement("div"), document.createElement("div"), document.createElement("div")];
            sCells.forEach((c) => (c.className = "string-cell sustain-line"));

            if (!ev.isRest) {
              const mapped = mapMidiToString(ev.midi, tuning.strings);
              const visualCol = 2 - mapped.stringIndex;
              sCells[visualCol].textContent = "｜";
            }
            sCells.forEach((c) => sRow.appendChild(c));
            mDiv.appendChild(sRow);
          }
        });

        colEl.appendChild(mDiv);
      });

      gridEl.appendChild(colEl);
    }
  }

  function handleXMLContent(xmlText) {
    const errorEl = document.getElementById("upload-error");
    errorEl.hidden = true;

    try {
      const parsed = parseMusicXML(xmlText);
      state.parsedScore = parsed;
      state.tuningCandidates = generateTuningCandidates(parsed);
      state.selectedTuningIndex = 0;

      navButtons[2].disabled = false;
      navButtons[3].disabled = false;

      renderTuningCards();
      showStep(2);
    } catch (err) {
      errorEl.textContent = err.message || "ファイルの読み込みに失敗しました。";
      errorEl.hidden = false;
    }
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[ch]));
  }

  // ---------------- イベント登録 ----------------
  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("file-input");

  dropZone.addEventListener("click", () => fileInput.click());
  dropZone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("dragover");
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) readUploadedFile(file);
  });

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) readUploadedFile(file);
  });

  function readUploadedFile(file) {
    const reader = new FileReader();
    reader.onload = () => handleXMLContent(String(reader.result || ""));
    reader.onerror = () => {
      const errorEl = document.getElementById("upload-error");
      errorEl.textContent = "ファイルの読み取り中にエラーが発生しました。";
      errorEl.hidden = false;
    };
    reader.readAsText(file, "UTF-8");
  }

  document.querySelectorAll("[data-sample]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-sample");
      if (SAMPLE_XML[key]) handleXMLContent(SAMPLE_XML[key]);
    });
  });

  Object.entries(navButtons).forEach(([num, btn]) => {
    btn.addEventListener("click", () => {
      if (!btn.disabled) {
        const target = Number(num);
        if (target === 3) renderTatefuScore();
        showStep(target);
      }
    });
  });

  document.getElementById("btn-back-upload").addEventListener("click", () => showStep(1));
  document.getElementById("btn-back-tuning").addEventListener("click", () => showStep(2));

  document.getElementById("tuning-switcher").addEventListener("change", (e) => {
    state.selectedTuningIndex = Number(e.target.value);
    renderTatefuScore();
  });

  document.getElementById("btn-print").addEventListener("click", () => {
    window.print();
  });
})();
