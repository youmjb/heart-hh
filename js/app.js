/* ------------------------------------------------------------------
 * app.js -- UI layer, port of CHeart10View (heart10View.cpp)
 *
 * Reproduces OnPlay() / RunLoop() / pointplotLine() of the original
 * MFC view on top of HTML controls and two canvases.
 * ------------------------------------------------------------------ */
(function () {
'use strict';

/* ---------------- channel table (index -> label) ------------------ */
var CHANNELS = [
    { i: 3,  ko: '내향성 정류 K (IK1)',        en: 'Inward rectifier K' },
    { i: 4,  ko: 'Na 통로 (INa, Luo-Rudy)',     en: 'Na channel' },
    { i: 5,  ko: '빠른 지연정류 K (IKr)',       en: 'Rapid delayed rectifier K' },
    { i: 6,  ko: '일과성 외향 K (Ito)',         en: 'Transient outward K' },
    { i: 7,  ko: '지속성 외향 K (Isus)',        en: 'Sustained outward K' },
    { i: 8,  ko: 'L형 Ca (ICaL)',               en: 'L-type Ca' },
    { i: 9,  ko: 'T형 Ca (ICaT)',               en: 'T-type Ca' },
    { i: 10, ko: '느린 지연정류 K (IKs)',       en: 'Slow delayed rectifier K' },
    { i: 11, ko: '과분극 활성 (Ih)',            en: 'Hyperpolarisation activated' },
    { i: 12, ko: 'ACh 활성 K (IKACh)',          en: 'ACh activated K' },
    { i: 13, ko: 'Na 전류 (HH)  INa',           en: 'Na current (HH)' },
    { i: 14, ko: 'K 전류 (HH)  IKdr',           en: 'K current (HH)' },
    { i: 19, ko: '배경 Ca (IbCa)',              en: 'Background Ca' },
    { i: 20, ko: '비선택 양이온 (leak)',        en: 'Nonselective cation' },
    { i: 21, ko: 'Na-Ca 교환체',                en: 'Na-Ca exchanger' },
    { i: 22, ko: 'Na-K 펌프',                   en: 'Na-K pump' }
];

/* SF file order -> SF[] index */
var SF_INDEX = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 19, 20, 21, 22, 23];

/* ------------------------------------------------------------------
 * 실습 항목 -- 실습 매뉴얼(manual.html) 의 각 절에 맞춘 설정.
 * 모든 실험은 "HH 모델 전용 계산" 을 해제한 상태에서 하므로 hh:false 가 기본이다.
 * cur/vol 은 그 실험의 표시 범위.
 * pulse 는 배포된 .prm 값을 실습 조건으로 덮어써야 하는 경우에만 쓴다.
 * ------------------------------------------------------------------ */
var MANUAL = [
    { id: '', name: '— 직접 설정 —' },
    { id: 'I-1', name: 'I-1. 단일 활동전압 · 역치 (APthreshold)',
      prm: 'APthreshold', sfs: 'default', mode: 'ap',
      cur: [-16, 16], vol: [-120, 80], show: [13, 14] },
    { id: 'I-1b', name: 'I-1. 2)3) IKdr·INa 변화 (default)',
      prm: 'default', sfs: 'default', mode: 'ap',
      cur: [-16, 16], vol: [-120, 80], show: [13, 14] },
    { id: 'I-2', name: 'I-2. 불응기 (RefractoryPeriod)',
      prm: 'RefractoryPeriod', sfs: 'RefractoryPeriod', mode: 'ap',
      cur: [-16, 16], vol: [-120, 80], show: [13, 14] },
    { id: 'II-1', name: 'II-1. INa activation — 전압고정',
      prm: 'VCstep4INa', sfs: 'small', mode: 'vc',
      cur: [-20, 8], vol: [-120, 80], show: [13] },
    { id: 'II-2', name: 'II-2. INa inactivation — 전압고정',
      prm: 'VCstep4Inactivation', sfs: 'small', mode: 'vc',
      cur: [-20, 8], vol: [-120, 80], show: [13] },
    { id: 'II-3', name: 'II-3. IK activation — 전압고정',
      prm: 'VCstep4IK', sfs: 'small', mode: 'vc',
      cur: [-5, 55], vol: [-120, 80], show: [14] },
    { id: 'III-1', name: 'III-1. 역치전류 · rheobase',
      prm: 'rheobase', sfs: 'default', mode: 'ap',
      cur: [-16, 16], vol: [-120, 80], show: [13, 14] },
    { id: 'III-2', name: 'III-2. 순응 (accommodation)',
      prm: 'Accommodation', sfs: 'Accommodation', mode: 'ap',
      cur: [-1, 1], vol: [-120, 80], show: [13, 14],
      /* 매뉴얼 본문: Pulse3 = 500 pA, Pulse2 증분 = 50 pA
         (배포된 Accommodation.prm 은 400 pA / 100 pA 라 순응이 보이지 않음) */
      pulse: { 8: 0.5, 9: 0.5, 13: 0.05 } },
    { id: 'III-3', name: 'III-3. Anodal break',
      prm: 'AnodalBreak', sfs: 'AnodalBreak', mode: 'ap',
      cur: [-16, 16], vol: [-120, 80], show: [13, 14] }
];

var COLORS = PARAMS.COLORS;
function col(i) { return COLORS[i] || '#000000'; }

/* ---------------- state ------------------------------------------- */
var model = new HeartModel();
var graphCur, graphVol;

var ui = {
    check: {},          // channel index -> bool
    checkItot: false,
    checkCapacitive: false,
    checkHH: true,
    checkG: false,
    checkNMH: false,
    bErase: false,      // false = overlap episodes
    record: true
};

var run = {
    active: false,
    paused: false,
    episodeStarted: false,
    finished: true,
    raf: 0,
    fast: false
};

var m_TotalTime = 0, SSInterval = 0;
var recorded = [];      // { header:string } or { row:[] }
var recordCols = [];

/* ---------------- small DOM helpers ------------------------------- */
function $(id) { return document.getElementById(id); }
function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
}
function num(id) { return parseFloat($(id).value) || 0; }

/* ---------------- build the parameter panels ---------------------- */
function buildParamTable(container, names, prefix, values, decimals) {
    container.innerHTML = '';
    names.forEach(function (n, k) {
        var row = el('div', 'prow');
        var lab = el('label', null, n);
        lab.htmlFor = prefix + k;
        var inp = document.createElement('input');
        inp.type = 'number'; inp.step = 'any'; inp.id = prefix + k;
        inp.value = fixed(values[k], decimals);
        row.appendChild(lab); row.appendChild(inp);
        container.appendChild(row);
    });
}
function fixed(v, d) {
    if (v === undefined || v === null || isNaN(v)) v = 0;
    return Number(v).toFixed(d);
}

/* ------------------------------------------------------------------
 * 펄스 패널 -- 19개 값을 구간별로 묶고 단위를 붙인다.  진폭 단위는
 * 클램프 모드에 따라 nA(전류고정) / mV(전압고정) 로 바뀐다.
 * ------------------------------------------------------------------ */
var PULSE_GROUPS = [
    { t: '유지 (Holding)',   items: [[0, 'A', '유지 준위'], [1, 'ms', '유지 시간']] },
    { t: '펄스 1',           items: [[2, 'A', '시작'], [3, 'A', '끝'], [4, 'ms', '지속시간']] },
    { t: '펄스 2',           items: [[5, 'A', '시작'], [6, 'A', '끝'], [7, 'ms', '지속시간']] },
    { t: '펄스 3',           items: [[8, 'A', '시작'], [9, 'A', '끝'], [10, 'ms', '지속시간']] },
    { t: '복귀 (Return)',    items: [[11, 'A', '복귀 준위'], [12, 'ms', '복귀 시간']] },
    { t: '에피소드마다 증가', items: [[13, 'A', '펄스 2 진폭 증분'], [14, 'ms', '펄스 2 시간 증분']] },
    { t: '반복',             items: [[15, '회', '에피소드 수'], [16, 's', '에피소드 간격'],
                                     [17, '회', '자극 수'], [18, 's', '자극 간격']] }
];

function buildPulsePanel(values) {
    var box = $('pulseFields');
    box.innerHTML = '';
    PULSE_GROUPS.forEach(function (g) {
        box.appendChild(el('div', 'phead', g.t));
        g.items.forEach(function (it) {
            var k = it[0];
            var row = el('div', 'prow');
            var lab = el('label', null, it[2]);
            lab.htmlFor = 'pul' + k;
            lab.title = PARAMS.PRM_NAMES[k] || '';
            var inp = document.createElement('input');
            inp.type = 'number'; inp.step = 'any'; inp.id = 'pul' + k;
            inp.value = fixed(values[k], 2);
            inp.addEventListener('input', drawPulsePreview);
            var u = el('span', 'unit', it[1] === 'A' ? '' : it[1]);
            if (it[1] === 'A') u.dataset.amp = '1';
            row.appendChild(lab); row.appendChild(inp); row.appendChild(u);
            box.appendChild(row);
        });
    });
    updatePulseUnits();
}

function ampUnit() {
    return document.querySelector('input[name="mode"]:checked').value === 'vc' ? 'mV' : 'nA';
}

function updatePulseUnits() {
    var u = ampUnit();
    Array.prototype.forEach.call(document.querySelectorAll('#pulseFields .unit[data-amp]'),
        function (s) { s.textContent = u; });
}

/* stimulus level at time t -- mirrors CHeart10Doc::DefSteps */
function stimAt(P, t) {
    var A = P[0];
    var per = P[18] > 0 ? P[18] : 1;
    var w = (t / per - Math.trunc(t / per)) * per;
    if (w >= 0 && w <= P[1]) A = P[0];
    if (w > P[1] && w <= (P[4] + P[1])) A = (P[3] - P[2]) * (w - P[1]) / P[4] + P[2];
    if (w > (P[1] + P[4]) && w <= (P[1] + P[4] + P[7]))
        A = (P[6] - P[5]) * (w - P[1] - P[4]) / P[7] + P[5];
    if (w > (P[1] + P[4] + P[7]) && w <= (P[1] + P[4] + P[7] + P[10]))
        A = (P[9] - P[8]) * (w - P[1] - P[4] - P[7]) / P[10] + P[8];
    if (w > (P[1] + P[4] + P[7] + P[10]) && w <= (P[1] + P[4] + P[7] + P[10] + P[12])) A = P[11];
    if (w > (P[1] + P[4] + P[7] + P[10] + P[12])) A = P[0];
    if (t > (P[18] * P[17])) A = P[0];
    return A;
}

/* live schematic of the stimulus protocol -- episode 1 solid, last dashed */
function drawPulsePreview() {
    var cv = $('pulsePreview');
    if (!cv) return;
    var P = [], k;
    for (k = 0; k < 19; k++) P[k] = num('pul' + k);
    P[16] *= 1000; P[18] *= 1000;                       // sec -> ms, as the view does
    var span = P[1] + P[4] + P[7] + P[10] + P[12];
    if (P[18] < span) P[18] = span;

    var total = P[18] * P[17];
    if (!(total > 0)) total = span || 1;
    var nEp = Math.max(1, Math.trunc(P[15]) || 1);

    var Q = P.slice();
    Q[5] += P[13] * (nEp - 1); Q[6] += P[13] * (nEp - 1); Q[7] += P[14] * (nEp - 1);
    var qspan = Q[1] + Q[4] + Q[7] + Q[10] + Q[12];
    if (Q[18] < qspan) Q[18] = qspan;
    var qtotal = Math.max(total, Q[18] * Q[17]);

    var N = 600, i, t, lo = Infinity, hi = -Infinity, a = [], b = [];
    var tmax = Math.max(total, qtotal);
    for (i = 0; i <= N; i++) {
        t = tmax * i / N;
        a.push(stimAt(P, t));
        b.push(nEp > 1 ? stimAt(Q, t) : null);
    }
    a.concat(b).forEach(function (v) {
        if (v === null || !isFinite(v)) return;
        if (v < lo) lo = v; if (v > hi) hi = v;
    });
    if (!isFinite(lo)) { lo = -1; hi = 1; }
    if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
    var pad = (hi - lo) * 0.18; lo -= pad; hi += pad;

    var dpr = window.devicePixelRatio || 1;
    var rect = cv.getBoundingClientRect();
    var W = Math.max(60, Math.round(rect.width)), H = Math.max(40, Math.round(rect.height));
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    var c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);

    var L = 34, R = 6, T = 12, B = 16;
    function X(tt) { return L + (tt / tmax) * (W - L - R); }
    function Y(v) { return T + (hi - v) / (hi - lo) * (H - T - B); }

    c.strokeStyle = '#d7dbe0'; c.lineWidth = 1;
    c.strokeRect(L + 0.5, T + 0.5, W - L - R - 1, H - T - B - 1);

    if (lo < 0 && hi > 0) {                              // zero line
        c.strokeStyle = '#c8ced5'; c.setLineDash([2, 3]);
        c.beginPath(); c.moveTo(L, Y(0)); c.lineTo(W - R, Y(0)); c.stroke();
        c.setLineDash([]);
    }

    /* phase boundaries + labels */
    var bounds = [0, P[1], P[1] + P[4], P[1] + P[4] + P[7],
                  P[1] + P[4] + P[7] + P[10], P[1] + P[4] + P[7] + P[10] + P[12]];
    var names = ['H', 'P1', 'P2', 'P3', 'R'];
    c.font = '9px "Segoe UI", Arial, sans-serif';
    c.textBaseline = 'top';
    for (i = 0; i < 5; i++) {
        if (bounds[i + 1] - bounds[i] <= 0 || bounds[i] > tmax) continue;
        c.strokeStyle = '#e6eaef'; c.setLineDash([2, 3]);
        c.beginPath(); c.moveTo(X(Math.min(bounds[i + 1], tmax)), T);
        c.lineTo(X(Math.min(bounds[i + 1], tmax)), H - B); c.stroke();
        c.setLineDash([]);
        c.fillStyle = '#8a949f'; c.textAlign = 'center';
        var cx = X(Math.min((bounds[i] + bounds[i + 1]) / 2, tmax));
        if (cx > L + 6 && cx < W - R - 6) c.fillText(names[i], cx, T + 1);
    }

    function poly(arr, style, dash) {
        c.strokeStyle = style; c.lineWidth = dash ? 1 : 1.6; c.setLineDash(dash || []);
        c.beginPath();
        for (var j = 0; j <= N; j++) {
            if (arr[j] === null) continue;
            var xx = X(tmax * j / N), yy = Y(arr[j]);
            if (j === 0) c.moveTo(xx, yy); else c.lineTo(xx, yy);
        }
        c.stroke(); c.setLineDash([]);
    }
    if (nEp > 1) poly(b, '#9db6cf', [4, 3]);
    poly(a, '#1b6ec2', null);

    /* axis labels */
    c.fillStyle = '#68727f'; c.font = '9px "Segoe UI", Arial, sans-serif';
    c.textAlign = 'right'; c.textBaseline = 'middle';
    c.fillText(hi.toFixed(2), L - 3, Y(hi) + 4);
    c.fillText(lo.toFixed(2), L - 3, Y(lo) - 4);
    c.textAlign = 'left'; c.textBaseline = 'bottom';
    c.fillText('0', L, H - 3);
    c.textAlign = 'right';
    c.fillText(tmax.toFixed(0) + ' ms', W - R, H - 3);

    var u = ampUnit();
    $('pulseCap').innerHTML =
        '실선 = 1번째 에피소드' + (nEp > 1 ? ', 점선 = ' + nEp + '번째' : '') +
        ' · 기록 구간 <b>' + total.toFixed(0) + ' ms</b> · 에피소드 <b>' + nEp + '</b>회' +
        '<br>H 유지 ' + P[1] + ' ms · P1 ' + P[4] + ' ms · P2 ' + P[7] + ' ms (' +
        P[5].toFixed(2) + ' ' + u + ') · P3 ' + P[10] + ' ms · R 복귀 ' + P[12] + ' ms';
}

/* ---- episode shading -------------------------------------------- */
var epShadeF = 1;

function shadeColor(hex, f) {
    if (f >= 0.999) return hex;
    var r = parseInt(hex.substr(1, 2), 16),
        g = parseInt(hex.substr(3, 2), 16),
        b = parseInt(hex.substr(5, 2), 16);
    function mix(v) { return Math.round(255 - (255 - v) * f); }
    function hx(v) { return ('0' + v.toString(16)).slice(-2); }
    return '#' + hx(mix(r)) + hx(mix(g)) + hx(mix(b));
}
function tc(i) { return shadeColor(col(i), epShadeF); }

function updateEpLegend() {
    var base = col(13);
    $('epLegend').style.background =
        'linear-gradient(to right,' + shadeColor(base, 0.35) + ',' + base + ')';
    $('epLegend').style.opacity = $('chkEpColor').checked ? '1' : '0.25';
}

function buildChannelList() {
    var box = $('channelList');
    box.innerHTML = '';
    CHANNELS.forEach(function (ch) {
        /* 실습에서 쓰는 두 HH 전류를 눈에 띄게 */
        var row = el('label', 'chrow' + (ch.i === 13 || ch.i === 14 ? ' hh' : ''));
        var cb = document.createElement('input');
        cb.type = 'checkbox'; cb.id = 'chk' + ch.i;
        cb.checked = (ch.i === 13 || ch.i === 14);
        ui.check[ch.i] = cb.checked;
        cb.addEventListener('change', function () { ui.check[ch.i] = cb.checked; });
        var sw = el('span', 'swatch');
        sw.style.background = col(ch.i);
        row.appendChild(cb); row.appendChild(sw);
        row.appendChild(el('span', 'chname', ch.ko));
        box.appendChild(row);
    });
}

function applyManual(id) {
    var e = null, k;
    for (k = 0; k < MANUAL.length; k++) if (MANUAL[k].id === id) e = MANUAL[k];
    if (!e || !e.prm) return;

    applyPrm(e.prm);   $('selPrm').value = e.prm;
    applySfs(e.sfs);   $('selSfs').value = e.sfs;
    if (e.pulse) {
        for (k in e.pulse) if (e.pulse.hasOwnProperty(k)) $('pul' + k).value = fixed(e.pulse[k], 2);
    }

    document.querySelector('input[name="mode"][value="' + e.mode + '"]').checked = true;

    /* 매뉴얼: 모든 실험은 HH model 체크박스를 해제한 상태에서 */
    $('chkHH').checked = false;
    $('chkG').checked = false;
    $('chkNMH').checked = false;
    $('chkOverlap').checked = true;

    CHANNELS.forEach(function (ch) {
        var on = e.show.indexOf(ch.i) >= 0;
        $('chk' + ch.i).checked = on;
        ui.check[ch.i] = on;
    });
    $('chkItot').checked = false;

    $('curMin').value = e.cur[0];  $('curMax').value = e.cur[1];
    $('volMin').value = e.vol[0];  $('volMax').value = e.vol[1];

    model.NewCell = true;          // 매뉴얼의 "Try New Cell" 과 같은 상태에서 시작
    inputValueFromControl();
    initializeGraphCtrl();
    updatePulseUnits();
    drawPulsePreview();
    setStatus(e.name + ' 설정 완료 — [실행] 또는 F2 를 누르세요.');
}

function buildPresetSelects() {
    var p = $('selPrm'), s = $('selSfs'), k;
    MANUAL.forEach(function (e) { $('selManual').appendChild(new Option(e.name, e.id)); });
    Object.keys(PARAMS.PRM).sort().forEach(function (k) {
        p.appendChild(new Option(k, k));
    });
    Object.keys(PARAMS.SFS).sort().forEach(function (k) {
        s.appendChild(new Option(k, k));
    });
    p.value = 'default';
    s.value = 'default';
}

/* ---------------- read the panels into the model ------------------ */
function readPulse() {
    var P = [], k;
    for (k = 0; k < 19; k++) P[k] = num('pul' + k);
    /* CHeart10View::InputValueFromPULSE -- episode/stimulus interval sec -> ms */
    P[16] = 1000.0 * P[16];
    P[18] = 1000.0 * P[18];
    var sum = P[1] + P[4] + P[7] + P[10] + P[12];
    if (P[18] < sum) {
        P[18] = sum;
        $('pul18').value = (P[18] / 1000.0).toFixed(3);
    }
    return P;
}

function inputValueFromControl() {
    var k;
    var P = readPulse();
    for (k = 0; k < 19; k++) model.Pulse[k] = P[k];

    for (k = 0; k < SF_INDEX.length; k++) model.SF[SF_INDEX[k]] = num('sf' + k);
    for (k = 0; k < 7; k++) model.Ion[k] = num('ion' + k);
    for (k = 0; k < 4; k++) model.Condition[k] = num('con' + k);

    m_TotalTime = model.Pulse[18] * model.Pulse[17];
    SSInterval  = m_TotalTime + model.Pulse[16];

    model.TotalTime = m_TotalTime;
    model.m_AP = document.querySelector('input[name="mode"]:checked').value === 'vc' ? 1 : 0;
    model.m_FixedTimeInterval = num('fixedDt');

    ui.checkItot       = $('chkItot').checked;
    ui.checkCapacitive = $('chkCap').checked;
    ui.checkHH         = $('chkHH').checked;
    ui.checkG          = $('chkG').checked;
    ui.checkNMH        = $('chkNMH').checked;
    ui.bErase          = !$('chkOverlap').checked;
    ui.record          = $('chkRecord').checked;
    run.fast           = $('chkFast').checked;
    model.bHH          = ui.checkHH;
    model.bUserRate    = false;
    model.bConstantField = ($('selDrive').value === 'cf');
    model.stimSign = parseFloat($('selSign').value) || 1;
}

/* The driving-force selector only reaches INa(HH)/IKdr(HH) on the pure-HH
   path.  On the cell path those two currents are always constant-field, so
   say so instead of letting the control look as if it did nothing. */
function updateDriveNote() {
    var el = $('driveNote');
    if (!el) return;
    if ($('chkHH').checked) {
        el.innerHTML = $('selDrive').value === 'cf'
            ? '지금 <b>정전장(GHK)</b> — 세포 안팎 농도차를 반영해 I–V 가 휘어집니다. ' +
              '막전류는 더 현실적이지만 <code>G = I/(V−E)</code> 가 m³h·n⁴ 에 ' +
              '정확히 비례하지 않습니다.'
            : '지금 <b>옴형</b> — HH 원논문과 같은 형태라 <code>G = I/(V−E)</code> 가 ' +
              'm³h·n⁴ 에 정확히 비례합니다. II 장의 분석을 재현하기에 알맞습니다.';
    } else {
        el.innerHTML = '<b>“HH 모델 전용 계산”을 켰을 때만 적용됩니다.</b> ' +
            '지금(해제 상태)은 INa(HH)·IKdr(HH) 가 언제나 <b>정전장</b>으로 계산됩니다.';
    }
}

/* ---------------- graphs ------------------------------------------ */
function initializeGraphCtrl() {
    graphCur.setXYRange(0, num('curMin'), m_TotalTime, num('curMax'));
    graphVol.setXYRange(0, num('volMin'), m_TotalTime, num('volMax'));
    convertUnit();
    graphCur.clear(true);
    graphVol.clear(true);
}

function convertUnit() {
    /* CHeart10View::ConvertUnit -- axis titles only (values stay in ms / nA) */
    var xUnit = (Math.abs(graphCur.maxX) > 1000 || Math.abs(graphCur.minX) > 1000) ? 'ms' : 'ms';
    graphCur.xUnit = xUnit; graphVol.xUnit = xUnit;
    graphCur.yUnit = ui.checkNMH ? 'gate' : (ui.checkG ? 'nS x10' : 'nA');
    graphVol.yUnit = 'mV';
    graphCur.gridColor = col(16); graphVol.gridColor = col(16);
    graphCur.bgColor = col(18);   graphVol.bgColor = col(18);
    graphCur.labelColor = col(17); graphVol.labelColor = col(17);
}

/* ------------------------------------------------------------------
 * trace store -- every plotted sample, per trace and per episode, so the
 * cursor can report exact values and the measurement table can find
 * peaks without the student having to read pixels off the screen.
 * ------------------------------------------------------------------ */
var traces = { order: [], meta: {}, eps: [], epInfo: [] };

function traceReset() { traces = { order: [], meta: {}, eps: [], epInfo: [] }; }

function traceNewEpisode(info) {
    traces.eps.push({});
    traces.epInfo.push(info);
}

function traceAdd(key, label, color, graph, unit, t, v) {
    if (!traces.meta[key]) {
        traces.meta[key] = { label: label, color: color, graph: graph, unit: unit };
        traces.order.push(key);
    }
    var e = traces.eps[traces.eps.length - 1];
    if (!e) return;
    var s = e[key] || (e[key] = { t: [], v: [] });
    s.t.push(t); s.v.push(v);
}

/* nearest sample at time t (series time is monotonic within an episode) */
function traceValueAt(epIndex, key, t) {
    var e = traces.eps[epIndex];
    if (!e) return null;
    var s = e[key];
    if (!s || !s.t.length) return null;
    var lo = 0, hi = s.t.length - 1, mid;
    if (t <= s.t[0]) return { t: s.t[0], v: s.v[0] };
    if (t >= s.t[hi]) return { t: s.t[hi], v: s.v[hi] };
    while (hi - lo > 1) {
        mid = (lo + hi) >> 1;
        if (s.t[mid] <= t) lo = mid; else hi = mid;
    }
    var pick = (t - s.t[lo] <= s.t[hi] - t) ? lo : hi;
    return { t: s.t[pick], v: s.v[pick] };
}

/* previous plotted values, for the m/h/n and conductance traces */
var mpre = 0, hpre = 0, npre = 0, gnapre = 0, gkpre = 0;

function pointplotLine(record) {
    var M = model;
    var tnow = M.CurrentTime, dt = M.timeinterval;
    var row = record ? [tnow.toFixed(2)] : null;
    var L;

    /* 원본은 게이트/전도도 표시를 `checkHH && checkNMH` 로 묶어 두었지만,
       매뉴얼은 HH 체크박스를 해제한 상태에서 Gate·Conductance 를 켜라고
       지시하므로 표시 조건을 계산 경로와 분리했다 (표시 전용 변경). */
    if (ui.checkNMH) {
        var mnow = M.m[13][6][1], hnow = M.h[13][6][1], nnow = M.m[14][6][1];
        if (ui.check[13]) {
            graphCur.appendPoint(tnow - dt, mpre, tnow, mnow, tc(13), 1);
            graphCur.appendPoint(tnow - dt, hpre, tnow, hnow, tc(4), 1);
            traceAdd('m', 'm', col(13), 'cur', '', tnow, mnow);
            traceAdd('h', 'h', col(4), 'cur', '', tnow, hnow);
        }
        if (ui.check[14]) {
            graphCur.appendPoint(tnow - dt, npre, tnow, nnow, tc(14), 1);
            traceAdd('n', 'n', col(14), 'cur', '', tnow, nnow);
        }
        if (record) row.push(mnow.toFixed(4), hnow.toFixed(4), nnow.toFixed(4));
        mpre = mnow; hpre = hnow; npre = nnow;
    } else if (ui.checkG) {
        var vm = M.Vm[1], vna = M.VNa[1], vk = M.VK[1];
        var nacf = vm - vna, kcf = vm - vk;
        var gnanow = M.ii[13][4][1] / nacf * 10;
        var gknow  = M.ii[14][4][1] / kcf * 10;
        if (ui.check[13]) {
            graphCur.appendPoint(tnow - dt, gnapre, tnow, gnanow, tc(13), 1);
            traceAdd('gNa', 'gNa×10', col(13), 'cur', 'nS', tnow, gnanow);
        }
        if (ui.check[14]) {
            graphCur.appendPoint(tnow - dt, gkpre, tnow, gknow, tc(14), 1);
            traceAdd('gK', 'gK×10', col(14), 'cur', 'nS', tnow, gknow);
        }
        if (record) row.push(gnanow.toFixed(4), gknow.toFixed(4));
        gnapre = gnanow; gkpre = gknow;
    } else {
        for (L = 3; L <= 14; L++) {
            if (ui.check[L]) {
                if (record) row.push(M.ii[L][4][1].toFixed(4));
                graphCur.appendPoint(tnow - dt, M.ii[L][5][1], tnow, M.ii[L][4][1], tc(L), 1);
                traceAdd('i' + L, shortNameOf(L), col(L), 'cur', 'nA', tnow, M.ii[L][4][1]);
            }
        }
    }

    for (L = 19; L <= 22; L++) {
        if (ui.check[L]) {
            if (record) row.push(M.ii[L][4][1].toFixed(4));
            graphCur.appendPoint(tnow - dt, M.ii[L][5][1], tnow, M.ii[L][4][1], tc(L), 1);
            traceAdd('i' + L, shortNameOf(L), col(L), 'cur', 'nA', tnow, M.ii[L][4][1]);
        }
    }

    var Inet = M.Itot[1], Inetb = M.Itotb[1];
    if (!ui.checkCapacitive && model.m_AP === 1) {
        Inetb = Inetb - M.Icapb[1];
        Inet  = Inet - M.Icap[1];
    }
    if (ui.checkItot) {
        if (record) row.push(Inet.toFixed(4));
        graphCur.appendPoint(tnow - dt, Inetb, tnow, Inet, tc(23), 1);
        traceAdd('itot', 'Itot', col(23), 'cur', 'nA', tnow, Inet);
    }

    if (record) row.push(M.Vm[1].toFixed(2));
    graphVol.appendPoint(tnow - dt, M.C[6][7][1], tnow, M.Vm[1], tc(13), 1);
    traceAdd('vm', 'Vm', col(13), 'vol', 'mV', tnow, M.Vm[1]);

    if (record) recorded.push(row);
}

function buildRecordColumns() {
    var c = ['time(ms)'], L;
    if (ui.checkNMH) {
        c = ['time(ms)', 'm', 'h', 'n'];
    } else if (ui.checkG) {
        c = ['time(ms)', 'gNa*10', 'gK*10'];
    } else {
        for (L = 3; L <= 14; L++) if (ui.check[L]) c.push(nameOf(L));
    }
    for (L = 19; L <= 22; L++) if (ui.check[L]) c.push(nameOf(L));
    if (ui.checkItot) c.push('Itot(nA)');
    c.push('Vm(mV)');
    recordCols = c;
}
function nameOf(i) {
    for (var k = 0; k < CHANNELS.length; k++) if (CHANNELS[k].i === i) return CHANNELS[k].en;
    return 'I' + i;
}

var SHORT = {
    3: 'IK1', 4: 'INa', 5: 'IKr', 6: 'Ito', 7: 'Isus', 8: 'ICaL', 9: 'ICaT',
    10: 'IKs', 11: 'Ih', 12: 'IKACh', 13: 'INa(HH)', 14: 'IKdr(HH)',
    19: 'IbCa', 20: 'INSC', 21: 'INaCa', 22: 'INaK'
};
function shortNameOf(i) { return SHORT[i] || ('I' + i); }

/* ---------------- run loop (CHeart10View::RunLoop) ---------------- */
function onPlay() {
    if (run.active) return;
    inputValueFromControl();
    initializeGraphCtrl();          // also resets the X window to 0..TotalTime
    recorded = [];
    buildRecordColumns();
    traceReset();
    clearMarksForRun();
    measureWin = null;
    $('measureWin').hidden = true;
    epShadeF = 1;
    setProgress(0);
    $('measureBox').hidden = true;

    model.cellNo = 1;
    model.InputAll();
    model.DefInitialVarInput();
    model.DefIonVar();
    model.DefScaleVar();
    model.INITIALSETTING();
    if (model.NewCell) model.DefInitialVarPreset();

    model.episodeN = 0;
    if (model.NewCell) {
        model.calculatevm();
        model.NewCell = false;
    }
    mpre = model.m[13][6][1]; hpre = model.h[13][6][1]; npre = model.m[14][6][1];
    gnapre = 0; gkpre = 0;

    run.active = true; run.paused = false; run.finished = false; run.episodeStarted = false;
    setStatus('계산 중 …');
    updateButtons();

    if (run.fast) {
        var t0 = performance.now();
        while (run.active && !run.finished) stepChunk(1e9);
        finishRun('완료 (' + Math.round(performance.now() - t0) + ' ms)');
    } else {
        run.raf = requestAnimationFrame(tick);
    }
}

function startEpisode() {
    if (ui.bErase) {
        graphCur.clear(true);
        graphVol.clear(true);
    }
    var nEp = Math.max(1, Math.trunc(model.Pulse[15]) || 1);
    epShadeF = ($('chkEpColor').checked && nEp > 1)
        ? 0.35 + 0.65 * (model.episodeN / (nEp - 1)) : 1;
    traceNewEpisode({
        n: 1 + model.episodeN,
        vc: model.m_AP === 1,
        p2: model.Pulse[5],          // AP mode: nA, VC mode: mV
        p2len: model.Pulse[7],
        p1: model.Pulse[2],
        p3: model.Pulse[8]
    });
    var str = '#' + (1 + model.episodeN) + ' / ' + Math.trunc(model.Pulse[15]) + ' episode';
    graphCur.putText(0.1, 0.02, str, '#0000c0', true);
    if (ui.record) recorded.push(['[' + str + ']']);
    run.episodeStarted = true;
}

/* One chunk of integration.  budget = milliseconds of wall time. */
function stepChunk(budget) {
    var t0 = performance.now();
    var M = model;
    do {
        if (!run.episodeStarted) startEpisode();

        /* inner do-while of RunLoop */
        do {
            M.SetTimeInterval();
            M.CalSteps();
            if (M.CurrentTime <= m_TotalTime) pointplotLine(ui.record);
            if (performance.now() - t0 > budget) return;
        } while (M.CurrentTime <= SSInterval && Math.abs(M.Vm[1]) <= 400);

        if (Math.abs(M.Vm[1]) > 400) {
            graphVol.putText(0.1, 0.02,
                'Cell Death !   Cell Death !   Cell Death !', '#c00000', true);
            M.NewCell = true;
        }
        M.PrepareNextPulse();
        run.episodeStarted = false;
        displayIonConc();

        if (M.episodeN >= M.Pulse[15]) { run.finished = true; return; }
    } while (performance.now() - t0 <= budget);
}

function tick() {
    if (!run.active) return;
    if (!run.paused) {
        stepChunk(14);
        setProgress((model.episodeN + Math.min(1, model.CurrentTime / (SSInterval || 1))) /
                    Math.max(1, model.Pulse[15]));
        if (run.finished) { finishRun('완료'); return; }
    }
    run.raf = requestAnimationFrame(tick);
}

function finishRun(msg) {
    run.active = false;
    run.finished = true;
    cancelAnimationFrame(run.raf);
    var tail = msg + '  —  ' + (recorded.length ? (recorded.length + ' 행 기록됨') : '기록 없음');
    var fit = $('chkAutoScale').checked ? autoScale('both') : null;
    setStatus(fit ? (tail + '  ·  ' + fit) : tail);
    fillEpisodeSelect();
    setProgress(1);
    updateButtons();
}

function onStopToggle() {
    if (!run.active) return;
    run.paused = !run.paused;
    setStatus(run.paused ? '일시정지 (Stop) — 다시 누르면 계속' : '계산 중 …');
    updateButtons();
}

function onAbort() {
    if (!run.active) return;
    finishRun('중단됨');
}

function displayIonConc() {
    $('ionReadout').textContent =
        'Ki ' + model.C[1][6][1].toFixed(2) + ' mM   ' +
        'Nai ' + model.C[2][6][1].toFixed(3) + ' mM   ' +
        'Cai(free) ' + (model.Caf[1] * 1000).toFixed(4) + ' uM   ' +
        'Vm ' + model.Vm[1].toFixed(2) + ' mV   ' +
        'dt ' + model.timeinterval.toFixed(3) + ' ms';
}

function setStatus(s) { $('status').textContent = s; }
function setProgress(f) {
    $('progBar').style.width = Math.max(0, Math.min(1, f || 0)) * 100 + '%';
}
function updateButtons() {
    $('btnPlay').disabled = run.active;
    $('btnStop').disabled = !run.active;
    $('btnAbort').disabled = !run.active;
    $('btnStop').innerHTML = (run.paused ? '▶ 계속' : '❚❚ 일시정지') +
        ' <span class="kbd">Space</span>';
}

/* ---------------- preset / file loading --------------------------- */
function applyPrm(name) {
    var v = PARAMS.PRM[name];
    if (!v) return;
    for (var k = 0; k < 19; k++) $('pul' + k).value = fixed(v[k], 2);
    drawPulsePreview();
}
function applySfs(name) {
    var v = PARAMS.SFS[name];
    if (!v) return;
    for (var k = 0; k < 17; k++) $('sf' + k).value = fixed(v[k], 2);
}

/* Parse a *.prm / *.sfs / *.ion / *.con file the way CFileIO does:
   everything after the first '=' on each line, spaces removed. */
function parseParamFile(text) {
    var out = [];
    text.split(/\r?\n/).forEach(function (line) {
        var p = line.indexOf('=');
        if (p < 0) return;
        var v = parseFloat(line.slice(p + 1).replace(/\s+/g, ''));
        out.push(isNaN(v) ? 0 : v);
    });
    return out;
}

function loadUserFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
        var vals = parseParamFile(String(reader.result));
        var ext = (file.name.split('.').pop() || '').toLowerCase();
        var k;
        if (ext === 'prm') {
            for (k = 0; k < 19 && k < vals.length; k++) $('pul' + k).value = fixed(vals[k], 2);
        } else if (ext === 'sfs') {
            for (k = 0; k < 17 && k < vals.length; k++) $('sf' + k).value = fixed(vals[k], 2);
        } else if (ext === 'ion') {
            for (k = 0; k < 7 && k < vals.length; k++) $('ion' + k).value = fixed(vals[k], 4);
        } else if (ext === 'con') {
            for (k = 0; k < 4 && k < vals.length; k++) $('con' + k).value = fixed(vals[k], 2);
        } else {
            alert('알 수 없는 확장자입니다: .' + ext + '  (.prm, .sfs, .ion, .con 만 지원)');
            return;
        }
        setStatus(file.name + ' 을(를) 불러왔습니다.');
    };
    reader.readAsText(file);
}

/* ---------------- saving files ------------------------------------
   Opened as a local file or from a web server, an <a download> works.
   Published as a claude.ai artifact, the page may not download on its
   own -- the viewer confirms each save through the downloads
   capability.  Both paths are kept so the same file works either way. */
function inArtifact() {
    return !!(window.claude && typeof window.claude.use === 'function');
}

function anchorSave(filename, href, revoke) {
    var a = document.createElement('a');
    a.href = href; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    if (revoke) setTimeout(function () { URL.revokeObjectURL(href); }, 1000);
}

function offerSave(filename, blob) {
    window.claude.use('downloads').then(function (d) {
        if (!d) { setStatus('이 화면에서는 파일 저장이 허용되지 않았습니다.'); return; }
        d.save({ filename: filename, data: blob }).then(
            function () { setStatus(filename + ' 저장함'); },
            function (e) {
                var code = (e && e.code) || 'error';
                if (code === 'declined') return;               // viewer said no
                setStatus('저장하지 못했습니다 (' + code + ')');
            });
    });
}

function saveText(filename, text) {
    var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    if (inArtifact()) { offerSave(filename, blob); return; }
    anchorSave(filename, URL.createObjectURL(blob), true);
}

function saveData() {
    if (!recorded.length) { alert('기록된 데이터가 없습니다. "데이터 기록"을 켜고 실행하세요.'); return; }
    var lines = [recordCols.join('\t')];
    recorded.forEach(function (r) { lines.push(r.join('\t')); });
    saveText('heart_data.txt', lines.join('\r\n'));
}

function savePng(graph, name) {
    if (inArtifact() && graph.canvas.toBlob) {
        graph.canvas.toBlob(function (blob) { offerSave(name, blob); }, 'image/png');
        return;
    }
    anchorSave(name, graph.canvas.toDataURL('image/png'), false);
}

/* ---------------- display range ----------------------------------- */
function applyRange() {
    graphCur.setXYRange(0, num('curMin'), m_TotalTime || graphCur.maxX, num('curMax'));
    graphVol.setXYRange(0, num('volMin'), m_TotalTime || graphVol.maxX, num('volMax'));
    convertUnit();
    graphCur.redraw();
    graphVol.redraw();
}
/* Fit the Y axis to what was actually drawn, and keep the input boxes in sync. */
function autoScale(which) {
    var done = [];
    if (which !== 'vol') {
        var rc = graphCur.autoScaleY();
        if (rc) { $('curMin').value = rc[0]; $('curMax').value = rc[1]; done.push('전류 ' + rc[0] + ' ~ ' + rc[1]); }
    }
    if (which !== 'cur') {
        var rv = graphVol.autoScaleY();
        if (rv) { $('volMin').value = rv[0]; $('volMax').value = rv[1]; done.push('막전위 ' + rv[0] + ' ~ ' + rv[1]); }
    }
    if (!done.length) return null;
    convertUnit();
    return '자동 스케일 ' + done.join(' / ');
}

function scaleY(graph, minId, maxId, factor) {
    var lo = num(minId), hi = num(maxId), mid = (lo + hi) / 2, half = (hi - lo) / 2 * factor;
    $(minId).value = (mid - half).toPrecision(4);
    $(maxId).value = (mid + half).toPrecision(4);
    applyRange();
}

/* ------------------------------------------------------------------
 * cursor readout  --  hover reads exact values off the stored traces,
 * clicks drop A / B markers so intervals (APD, 불응기, tau) can be
 * measured instead of eyeballed.
 * ------------------------------------------------------------------ */
var marks = [];              // up to two locked times
var hoverT = null;

function readEpisodeIndex() {
    var v = parseInt($('selReadEp').value, 10);
    if (isNaN(v) || v < 0 || v >= traces.eps.length) return traces.eps.length - 1;
    return v;
}

function fillEpisodeSelect() {
    var sel = $('selReadEp'), keep = sel.value, i;
    sel.innerHTML = '';
    sel.appendChild(new Option('마지막', '-1'));
    for (i = 0; i < traces.eps.length; i++) {
        sel.appendChild(new Option('#' + (traces.epInfo[i] ? traces.epInfo[i].n : i + 1), String(i)));
    }
    sel.value = (keep && sel.querySelector('option[value="' + keep + '"]')) ? keep : '-1';
}

function fmtVal(v, unit) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    var a = Math.abs(v), s;
    s = a >= 100 ? v.toFixed(1) : a >= 1 ? v.toFixed(2) : a >= 0.01 ? v.toFixed(3) : v.toFixed(4);
    return s + (unit ? ' ' + unit : '');
}

function drawOverlay(g, canvas) {
    var c = canvas.getContext('2d');
    var dpr = g.dpr;
    if (canvas.width !== g.canvas.width || canvas.height !== g.canvas.height) {
        canvas.width = g.canvas.width; canvas.height = g.canvas.height;
    }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, g.cssW, g.cssH);
    var r = g.plotRect(), i, x;

    function vline(t, color, dash, label) {
        x = g.px(t);
        if (x < r.x - 1 || x > r.x + r.w + 1) return;
        c.save();
        c.strokeStyle = color; c.lineWidth = 1; c.setLineDash(dash || []);
        c.beginPath(); c.moveTo(Math.round(x) + 0.5, r.y); c.lineTo(Math.round(x) + 0.5, r.y + r.h); c.stroke();
        if (label) {
            c.setLineDash([]);
            c.fillStyle = color;
            c.font = 'bold 11px "Segoe UI", Arial, sans-serif';
            c.textAlign = 'center'; c.textBaseline = 'top';
            c.fillText(label, x, r.y + 2);
        }
        c.restore();
    }

    for (i = 0; i < marks.length; i++) vline(marks[i], '#b45309', [4, 3], i === 0 ? 'A' : 'B');
    if (marks.length === 2) {
        var xa = g.px(marks[0]), xb = g.px(marks[1]);
        c.save();
        c.fillStyle = 'rgba(180,83,9,0.07)';
        c.fillRect(Math.min(xa, xb), r.y, Math.abs(xb - xa), r.h);
        c.restore();
    }
    if (hoverT !== null) vline(hoverT, '#c00000', []);
}

function renderReadout() {
    var box = $('readout');
    box.innerHTML = '';
    if (hoverT === null && !marks.length) {
        box.appendChild(el('span', 'hint',
            '그래프 위에 마우스를 올리면 값을 읽습니다. 두 번 클릭해 A·B 를 찍으면 '
            + '구간을 재고, 측정표가 그 구간으로 자동으로 만들어집니다.'));
        return;
    }
    if (!traces.eps.length) {
        box.appendChild(el('span', 'hint', '먼저 [실행] 하세요.'));
        return;
    }
    var ep = readEpisodeIndex();
    var info = traces.epInfo[ep];
    var t = hoverT !== null ? hoverT : marks[marks.length - 1];

    var head = el('span', 't', 't = ' + t.toFixed(2) + ' ms');
    box.appendChild(head);
    if (info) {
        box.appendChild(el('span', 'hint',
            '· ep #' + info.n + ' · pulse2 ' + info.p2.toFixed(2) + (info.vc ? ' mV' : ' nA')));
    }

    traces.order.forEach(function (key) {
        var m = traces.meta[key];
        var s = traceValueAt(ep, key, t);
        if (!s) return;
        var span = el('span', 'v');
        var sw = el('i'); sw.style.background = m.color;
        span.appendChild(sw);
        span.appendChild(document.createTextNode(m.label + ' ' + fmtVal(s.v, m.unit)));
        box.appendChild(span);
    });

    if (marks.length === 2) {
        var d = el('span', 'delta', 'Δt = ' + Math.abs(marks[1] - marks[0]).toFixed(2) + ' ms');
        box.appendChild(d);
        traces.order.forEach(function (key) {
            var m = traces.meta[key];
            var a = traceValueAt(ep, key, marks[0]), b = traceValueAt(ep, key, marks[1]);
            if (!a || !b) return;
            box.appendChild(el('span', 'delta', 'Δ' + m.label + ' = ' + fmtVal(b.v - a.v, m.unit)));
        });
    }
}

/* ---- time-axis zoom -------------------------------------------------
 * "A·B 확대" narrows both graphs to the marked interval; Y is refitted
 * to what is inside that window when 자동 스케일 is on.
 * ------------------------------------------------------------------ */
function setXWindow(t0, t1) {
    graphCur.minX = t0; graphCur.maxX = t1;
    graphVol.minX = t0; graphVol.maxX = t1;
    var fit = $('chkAutoScale').checked ? autoScale('both') : null;
    if (!fit) { graphCur.redraw(); graphVol.redraw(); }
    drawOverlay(graphCur, $('ovCur'));
    drawOverlay(graphVol, $('ovVol'));
    renderReadout();
    return fit;
}

function zoomToMarks() {
    if (marks.length < 2) {
        setStatus('A·B 확대: 그래프를 두 번 클릭해 A·B 를 먼저 찍으세요.');
        return;
    }
    var t0 = Math.min(marks[0], marks[1]), t1 = Math.max(marks[0], marks[1]);
    if (t1 - t0 < 1e-6) { setStatus('A·B 확대: 두 지점이 너무 가깝습니다.'); return; }
    /* 2% 여유를 둬야 A·B 표식이 그래프 가장자리에 붙지 않는다 */
    var pad = (t1 - t0) * 0.02;
    var fit = setXWindow(t0 - pad, t1 + pad);
    setStatus('A·B 확대  ' + t0.toFixed(2) + ' ~ ' + t1.toFixed(2) + ' ms (Δt ' +
              (t1 - t0).toFixed(2) + ' ms)' + (fit ? '  ·  ' + fit : ''));
}

function zoomOut() {
    var full = m_TotalTime || graphCur.maxX;
    var fit = setXWindow(0, full);
    setStatus('전체 보기  0 ~ ' + full.toFixed(2) + ' ms' + (fit ? '  ·  ' + fit : ''));
}

/* 실행을 새로 시작할 때: 표는 닫혀 있으므로 갱신하지 않는다 */
function clearMarksForRun() { clearMarks(false); }

function clearMarks(keepTable) {
    marks = []; hoverT = null;
    updateMeasureABState(false);
    if (keepTable !== false) refreshMeasure(false);
    if (graphCur) { drawOverlay(graphCur, $('ovCur')); drawOverlay(graphVol, $('ovVol')); renderReadout(); }
}

function cursorSetup(wrapId, g, isVol) {
    var wrap = $(wrapId);
    wrap.addEventListener('mousemove', function (e) {
        var r = wrap.getBoundingClientRect();
        var xp = e.clientX - r.left, yp = e.clientY - r.top;
        hoverT = g.insidePlot(xp, yp) ? g.xFromPx(xp) : null;
        drawOverlay(graphCur, $('ovCur'));
        drawOverlay(graphVol, $('ovVol'));
        renderReadout();
    });
    wrap.addEventListener('mouseleave', function () {
        hoverT = null;
        drawOverlay(graphCur, $('ovCur'));
        drawOverlay(graphVol, $('ovVol'));
        renderReadout();
    });
    wrap.addEventListener('click', function (e) {
        var r = wrap.getBoundingClientRect();
        var xp = e.clientX - r.left, yp = e.clientY - r.top;
        if (!g.insidePlot(xp, yp)) return;
        var t = g.xFromPx(xp);
        if (marks.length >= 2) marks = [];
        marks.push(t);
        updateMeasureABState(marks.length === 2);
        drawOverlay(graphCur, $('ovCur'));
        drawOverlay(graphVol, $('ovVol'));
        renderReadout();
        /* B 를 찍는 순간 측정표를 자동으로 만든다.  A 만 찍힌 상태로
           돌아가면(세 번째 클릭) 이미 열려 있는 표만 전체 구간으로 갱신한다. */
        refreshMeasure(marks.length === 2);
    });
}

/* ------------------------------------------------------------------
 * 에피소드별 측정표 -- I-V 곡선, 역치, overshoot, AHP, APD 를 눈금
 * 읽기 없이 바로 뽑는다.
 * ------------------------------------------------------------------ */
var measureRows = [], measureCols = [], measureWin = null;

/* A·B 가 찍혀 있고 "A·B 구간만" 이 켜져 있으면 그 시간창, 아니면 null(전체) */
function measureWindow() {
    if (marks.length === 2 && $('chkMeasureAB').checked) {
        return [Math.min(marks[0], marks[1]), Math.max(marks[0], marks[1])];
    }
    return null;
}

/* A·B 체크박스는 표식이 두 개 있을 때만 쓸 수 있다 */
function updateMeasureABState(justMarked) {
    var cb = $('chkMeasureAB'), ok = marks.length === 2;
    cb.disabled = !ok;
    if (!ok) cb.checked = false;
    else if (justMarked) cb.checked = true;
    $('labMeasureAB').style.opacity = ok ? '1' : '0.45';
}

function seriesStats(s, w) {
    if (!s || !s.t.length) return null;
    var i, mx = -Infinity, mn = Infinity, tmx = 0, tmn = 0, n = 0;
    for (i = 0; i < s.v.length; i++) {
        if (w && (s.t[i] < w[0] || s.t[i] > w[1])) continue;
        n++;
        if (s.v[i] > mx) { mx = s.v[i]; tmx = s.t[i]; }
        if (s.v[i] < mn) { mn = s.v[i]; tmn = s.t[i]; }
    }
    if (!n) return null;
    return { max: mx, tmax: tmx, min: mn, tmin: tmn, n: n };
}

/* APD: total time above `level`, and the first/last crossing */
function apd(s, level, w) {
    if (!s) return null;
    var first = -1, last = -1, i;
    for (i = 0; i < s.v.length; i++) {
        if (w && (s.t[i] < w[0] || s.t[i] > w[1])) continue;
        if (s.v[i] >= level) { if (first < 0) first = i; last = i; }
    }
    if (first < 0) return null;
    return { dur: s.t[last] - s.t[first], t0: s.t[first], t1: s.t[last] };
}

function buildMeasure() {
    if (!traces.eps.length) { setStatus('측정표: 먼저 [실행] 하세요.'); return false; }
    measureWin = measureWindow();
    var w = measureWin;
    var vc = traces.epInfo[0] && traces.epInfo[0].vc;
    measureCols = ['ep', vc ? 'step (mV)' : 'pulse2 (nA)'];
    var keys = traces.order.slice();
    var hasVm = keys.indexOf('vm') >= 0;

    /* 전류는 안쪽(min)·바깥쪽(max) 정점이 각각 의미가 있으므로 둘 다 적는다 */
    if (hasVm) {
        measureCols.push('Vm max (mV)', 't max (ms)', 'Vm min (mV)', 't min (ms)');
        if (!vc) measureCols.push('APD@-20 (ms)');   // APD 는 전류고정 모드에서만
    }
    keys.forEach(function (k) {
        if (k === 'vm') return;
        var u = traces.meta[k].unit, lab = traces.meta[k].label;
        var su = u ? ' (' + u + ')' : '';
        measureCols.push(lab + ' max' + su, lab + ' t max (ms)',
                         lab + ' min' + su, lab + ' t min (ms)');
    });

    measureRows = traces.eps.map(function (e, i) {
        var info = traces.epInfo[i] || {};
        var row = [String(info.n || i + 1), (info.p2 !== undefined ? info.p2.toFixed(3) : '')];
        var fired = false;
        if (hasVm) {
            var st = seriesStats(e['vm'], w);
            var a = apd(e['vm'], -20, w);
            fired = st && st.max >= -20;
            row.push(st ? st.max.toFixed(2) : '', st ? st.tmax.toFixed(2) : '',
                     st ? st.min.toFixed(2) : '', st ? st.tmin.toFixed(2) : '');
            if (!vc) row.push(a ? a.dur.toFixed(2) : '—');
        }
        keys.forEach(function (k) {
            if (k === 'vm') return;
            var st = seriesStats(e[k], w);
            row.push(st ? st.max.toFixed(4) : '', st ? st.tmax.toFixed(2) : '',
                     st ? st.min.toFixed(4) : '', st ? st.tmin.toFixed(2) : '');
        });
        row.fired = fired;
        return row;
    });
    return true;
}

function renderMeasure() {
    var box = $('measureBox'), win = $('measureWin');
    if (measureWin) {
        win.innerHTML = '측정 구간 <b>A–B  ' + measureWin[0].toFixed(2) + ' ~ ' +
            measureWin[1].toFixed(2) + ' ms</b> (Δt ' +
            (measureWin[1] - measureWin[0]).toFixed(2) + ' ms) — '
            + '이 구간 안에서만 max·min·APD 를 계산했습니다.';
        win.hidden = false;
    } else {
        win.hidden = true;
    }
    var html = ['<table><thead><tr>'];
    measureCols.forEach(function (c) { html.push('<th>' + c + '</th>'); });
    html.push('</tr></thead><tbody>');
    measureRows.forEach(function (r) {
        html.push('<tr' + (r.fired ? ' class="fire"' : '') + '>');
        r.forEach(function (v, i) { html.push('<td' + (i === 0 ? ' class="ep"' : '') + '>' + v + '</td>'); });
        html.push('</tr>');
    });
    html.push('</tbody></table>');
    box.innerHTML = html.join('');
    box.hidden = false;
}

/* 표를 다시 만든다.  autoShow 가 false 면 이미 열려 있을 때만 갱신한다. */
function refreshMeasure(autoShow) {
    var box = $('measureBox'), wasHidden = box.hidden;
    if (wasHidden && !autoShow) return false;
    if (!buildMeasure()) return false;
    renderMeasure();
    if (wasHidden) box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setStatus('측정표 ' + measureRows.length + ' 에피소드 · ' +
        (measureWin ? 'A–B ' + measureWin[0].toFixed(2) + ' ~ ' +
         measureWin[1].toFixed(2) + ' ms' : '에피소드 전체'));
    return true;
}

function measureCsv() {
    if (!measureRows.length && !buildMeasure()) return;
    var lines = [];
    lines.push(measureWin
        ? '# A-B window: ' + measureWin[0].toFixed(3) + ' ~ ' +
          measureWin[1].toFixed(3) + ' ms'
        : '# window: full episode');
    lines.push(measureCols.join('\t'));
    measureRows.forEach(function (r) { lines.push(r.join('\t')); });
    saveText('heart_measure.txt', lines.join('\r\n'));
}

/* ------------------------------------------------------------------
 * 강도–지속시간 곡선 (매뉴얼 III-1 2)
 * Ir 은 수평 점근선, C 는 2·Ir 과 만나는 가로축 위치로 그려 준다.
 * ------------------------------------------------------------------ */
var sdPts = [], sdFit = null, sdMeas = null, sdBusy = false;

function sdConfig() {
    return {
        SF: model.SF, Ion: model.Ion, Condition: model.Condition,
        bHH: model.bHH, bConstantField: model.bConstantField,
        stimSign: model.stimSign, m_FixedTimeInterval: model.m_FixedTimeInterval
    };
}

function sdDurations() {
    return $('sdDur').value.split(/[,\s]+/)
        .map(parseFloat).filter(function (v) { return isFinite(v) && v > 0; })
        .sort(function (a, b) { return a - b; });
}

function runStrengthDuration() {
    if (sdBusy) return;
    if (document.querySelector('input[name="mode"]:checked').value === 'vc') {
        setStatus('강도–지속시간은 전류고정(AP) 실험입니다. 모드를 바꾸고 다시 하세요.');
        return;
    }
    var durs = sdDurations();
    if (!durs.length) { setStatus('자극기간 목록을 확인하세요.'); return; }

    inputValueFromControl();                 // 현재 세포·펄스 값을 모델에 반영
    var baseP = model.Pulse.slice();
    var cfg = sdConfig();
    var level = num('sdLevel');

    $('sdBox').hidden = false;
    $('sdBox').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    sdPts = []; sdFit = null; sdMeas = null; sdBusy = true;
    $('sdRes').innerHTML = '';
    drawSD();

    /* 배치 계산이므로 setTimeout 을 쓴다.  requestAnimationFrame 은
       탭이 배경에 있을 때 멈춰서 측정이 진행되지 않는다. */
    var i = 0;
    function step() {
        try {
            if (i >= durs.length) {
                sdFit = SD.fit(sdPts);
                /* 정의 그대로 직접 측정한다.
                   Ir = 가장 긴 자극기간의 역치(평탄값),
                   C  = 2·Ir 을 줌 때 발화에 필요한 최소 자극기간. */
                sdMeas = null;
                if (sdPts.length) {
                    var last = sdPts[sdPts.length - 1];
                    var Ir = last.i;
                    $('sdMsg').textContent = 'chronaxie 측정 중 … (2 Ir = ' +
                                             (2 * Ir).toFixed(4) + ' nA)';
                    var C = SD.durationFor(cfg, baseP, 2 * Ir, level, last.dur);
                    sdMeas = { Ir: Ir, IrDur: last.dur, C: C };
                }
                sdBusy = false;
                $('sdMsg').textContent = '';
                drawSD();
                renderSDResult();
                setStatus('강도–지속시간 측정 완료 — ' + sdPts.length + ' 점' +
                    (sdMeas ? ' · Ir ' + sdMeas.Ir.toFixed(4) + ' nA' +
                        (sdMeas.C ? ' · C ' + sdMeas.C.toFixed(2) + ' ms' : '') : ''));
                return;
            }
            $('sdMsg').textContent = '측정 중 … ' + (i + 1) + '/' + durs.length +
                                     '  (자극기간 ' + durs[i] + ' ms)';
            var r = SD.thresholdFor(cfg, baseP, durs[i], level, 200);
            if (r) sdPts.push(r);
            i++;
            drawSD();
            setTimeout(step, 0);
        } catch (err) {
            sdBusy = false;
            $('sdMsg').textContent = '';
            setStatus('강도–지속시간 측정 중 오류: ' + err);
        }
    }
    setTimeout(step, 0);
}

function drawSD() {
    var cv = $('sdCanvas');
    var dpr = window.devicePixelRatio || 1;
    var rect = cv.getBoundingClientRect();
    var W = Math.max(80, Math.round(rect.width)), H = Math.max(60, Math.round(rect.height));
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    var c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);

    var L = 54, R = 14, T = 14, B = 34;
    var durs = sdDurations();
    if (!durs.length) return;

    var tmin = durs[0] / 1.6, tmax = durs[durs.length - 1] * 1.6;
    var imax = 0.1, k;
    for (k = 0; k < sdPts.length; k++) if (sdPts[k].i > imax) imax = sdPts[k].i;
    if (sdMeas) imax = Math.max(imax, sdMeas.Ir * 2.4);
    imax *= 1.12;

    function X(t) {
        return L + (Math.log(t) - Math.log(tmin)) / (Math.log(tmax) - Math.log(tmin)) * (W - L - R);
    }
    function Y(v) { return T + (1 - v / imax) * (H - T - B); }

    /* 격자 */
    c.strokeStyle = '#e6eaef'; c.lineWidth = 1;
    c.setLineDash([2, 3]);
    durs.forEach(function (d) {
        c.beginPath(); c.moveTo(X(d), T); c.lineTo(X(d), H - B); c.stroke();
    });
    c.setLineDash([]);
    c.strokeStyle = '#c8ced5';
    c.strokeRect(L + 0.5, T + 0.5, W - L - R - 1, H - T - B - 1);

    c.fillStyle = '#68727f'; c.font = '10px "Segoe UI", Arial, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'top';
    durs.forEach(function (d) { c.fillText(String(d), X(d), H - B + 4); });
    c.fillText('자극기간 t (ms, 로그)', (L + W - R) / 2, H - 14);
    c.save();
    c.translate(12, (T + H - B) / 2); c.rotate(-Math.PI / 2);
    c.textAlign = 'center'; c.textBaseline = 'top';
    c.fillText('역치전류 I (nA)', 0, 0);
    c.restore();
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (k = 0; k <= 4; k++) {
        var v = imax * k / 4;
        c.fillText(v.toFixed(2), L - 5, Y(v));
    }

    /* 식 맞춘 곡선 I = Ir(1 + C/t) — 비교용 가는 선 */
    if (sdFit && isFinite(sdFit.Ir) && isFinite(sdFit.C) && sdFit.C > 0) {
        c.strokeStyle = '#9db6cf'; c.lineWidth = 1.2;
        c.beginPath();
        for (k = 0; k <= 200; k++) {
            var t = Math.exp(Math.log(tmin) + (Math.log(tmax) - Math.log(tmin)) * k / 200);
            var yy = Y(sdFit.Ir * (1 + sdFit.C / t));
            if (k === 0) c.moveTo(X(t), yy); else c.lineTo(X(t), yy);
        }
        c.stroke();
    }

    /* 측정점을 이은 실제 곡선 */
    if (sdPts.length > 1) {
        c.strokeStyle = '#1b6ec2'; c.lineWidth = 1.8;
        c.beginPath();
        sdPts.forEach(function (pt, j) {
            if (j === 0) c.moveTo(X(pt.dur), Y(pt.i)); else c.lineTo(X(pt.dur), Y(pt.i));
        });
        c.stroke();
    }

    /* 정의 그대로 직접 측정한 Ir · C */
    if (sdMeas) {
        c.strokeStyle = '#b45309'; c.setLineDash([5, 4]); c.lineWidth = 1.3;
        c.beginPath(); c.moveTo(L, Y(sdMeas.Ir)); c.lineTo(W - R, Y(sdMeas.Ir)); c.stroke();
        c.strokeStyle = '#c9b48d';
        c.beginPath(); c.moveTo(L, Y(2 * sdMeas.Ir)); c.lineTo(W - R, Y(2 * sdMeas.Ir)); c.stroke();
        c.setLineDash([]);

        c.fillStyle = '#b45309'; c.font = 'bold 10px "Segoe UI", Arial, sans-serif';
        c.textAlign = 'left'; c.textBaseline = 'bottom';
        c.fillText('Ir (rheobase) = ' + sdMeas.Ir.toFixed(4) + ' nA', L + 5, Y(sdMeas.Ir) - 2);
        c.fillStyle = '#9a8a6b';
        c.font = '10px "Segoe UI", Arial, sans-serif';
        c.fillText('2 Ir = ' + (2 * sdMeas.Ir).toFixed(4) + ' nA', L + 5, Y(2 * sdMeas.Ir) - 2);

        if (sdMeas.C && sdMeas.C >= tmin && sdMeas.C <= tmax) {
            c.strokeStyle = '#0f8a5f'; c.setLineDash([5, 4]); c.lineWidth = 1.3;
            c.beginPath();
            c.moveTo(X(sdMeas.C), Y(2 * sdMeas.Ir)); c.lineTo(X(sdMeas.C), H - B);
            c.stroke(); c.setLineDash([]);
            c.fillStyle = '#0f8a5f';
            c.beginPath(); c.arc(X(sdMeas.C), Y(2 * sdMeas.Ir), 4.5, 0, Math.PI * 2); c.fill();
            c.font = 'bold 10px "Segoe UI", Arial, sans-serif';
            c.textAlign = 'left'; c.textBaseline = 'middle';
            c.fillText('C = ' + sdMeas.C.toFixed(2) + ' ms', X(sdMeas.C) + 7, Y(2 * sdMeas.Ir) + 11);
        }
    }

    /* 측정점 */
    c.fillStyle = '#c00000';
    sdPts.forEach(function (p) {
        c.beginPath(); c.arc(X(p.dur), Y(p.i), 3.5, 0, Math.PI * 2); c.fill();
    });
}

function renderSDResult() {
    var h = ['<table><thead><tr><th>t (ms)</th><th>역치 I (nA)</th></tr></thead><tbody>'];
    sdPts.forEach(function (p, i) {
        h.push('<tr data-i="' + i + '" title="클릭하면 이 조건을 펄스 패널에 넣습니다">' +
               '<td>' + p.dur + '</td><td>' + p.i.toFixed(4) + '</td></tr>');
    });
    h.push('</tbody></table>');

    var f = sdFit, M = sdMeas;
    var s = '<div class="sdfit">';
    if (M) {
        s += '<div class="big">측정값 (정의 그대로)</div>';
        s += '<div><span class="ir">■</span> <b>rheobase  Ir = ' + M.Ir.toFixed(4) + ' nA</b>' +
             ' — 자극기간을 가장 길게(' + M.IrDur + ' ms) 줄 때의 역치로,' +
             ' 곡선이 다가가는 <b>수평 점근선</b>입니다.' +
             ' 이보다 약하면 아무리 길게 줘도 발화하지 않습니다.</div>';
        if (M.C) {
            s += '<div><span class="cx">■</span> <b>chronaxie  C = ' + M.C.toFixed(2) + ' ms</b>' +
                 ' — <b>2 Ir = ' + (2 * M.Ir).toFixed(4) + ' nA</b> 를 줄 때 발화시키는' +
                 ' 최소 자극기간. 그래프에서 곡선이 2 Ir 선과 만나는' +
                 ' 점의 가로좌표입니다. 이분법으로 직접 측정했습니다.</div>';
        } else {
            s += '<div class="def">2 Ir 로는 주어진 범위 안에서 발화하지 않아' +
                 ' chronaxie 를 구하지 못했습니다. 자극기간 범위를 늘려 보세요.</div>';
        }
    }
    if (f && isFinite(f.C) && f.C > 0) {
        s += '<div class="def"><b>식 맞춤</b> I = Ir(1 + C/t) 으로 최소자승 맞춤하면' +
             ' Ir = ' + f.Ir.toFixed(4) + ' nA, C = ' + f.C.toFixed(2) + ' ms' +
             ' (R² = ' + (isFinite(f.r2) ? f.r2.toFixed(4) : '—') + ') 입니다' +
             ' — 그래프의 연한 회색 선.' +
             ' 측정값과 차이가 나는 것은 이 식이 <b>단순한 RC 막</b>을' +
             ' 가정하기 때문입니다. 실제 HH 세포는 긴 자극에서 h·n 이 따라 움직여' +
             ' (순응) 역치가 식이 예측하는 것보다 높은 값에서 평탄해집니다.</div>';
    }
    s += '<div class="def">짧은 자극은 막용량을 충전할 시간이 모자라 큰 전류가' +
         ' 필요하고(1/t 항), 길어질수록 그 부담이 없어져 Ir 로 수렴합니다.' +
         ' 표의 행을 누르면 그 조건이 펄스 패널에 들어가므로, [새 세포] 후 [실행] 해서' +
         ' 실제 파형을 확인해 보세요. 측정은 매 조건마다 <b>안정막전위에서 새로</b>' +
         ' 시작합니다. 화면에서 연속으로 [실행] 하면 직전 실행의 끝 상태에서' +
         ' 이어가므로 값이 조금 다를 수 있습니다.</div>';
    s += '</div>';

    $('sdRes').innerHTML = h.join('') + s;

    /* 행을 누르면 그 조건을 펄스 패널에 넣어 실제 파형을 볼 수 있게 */
    Array.prototype.forEach.call($('sdRes').querySelectorAll('tbody tr'), function (tr) {
        tr.addEventListener('click', function () {
            var p = sdPts[parseInt(tr.dataset.i, 10)];
            if (!p) return;
            var dir = model.stimSign < 0 ? 1 : -1;
            $('pul7').value = p.dur.toFixed(2);
            $('pul5').value = (dir * p.i).toFixed(4);
            $('pul6').value = (dir * p.i).toFixed(4);
            $('pul13').value = '0.00';
            $('pul15').value = '1.00';
            $('selManual').value = '';
            inputValueFromControl();
            drawPulsePreview();
            setStatus('t = ' + p.dur + ' ms, I = ' + p.i.toFixed(4) +
                      ' nA (역치) 를 펄스 패널에 넣었습니다 — [실행] 으로 확인하세요.');
        });
    });
}

function sdCsv() {
    if (!sdPts.length) { setStatus('강도–지속시간: 먼저 [자동 측정] 을 하세요.'); return; }
    var lines = ['# strength-duration curve'];
    if (sdMeas) {
        lines.push('# measured  rheobase Ir (nA)\t' + sdMeas.Ir.toFixed(6) +
                   '\t(at t = ' + sdMeas.IrDur + ' ms)');
        if (sdMeas.C) lines.push('# measured  chronaxie C (ms)\t' + sdMeas.C.toFixed(4) +
                                 '\t(at I = 2 Ir = ' + (2 * sdMeas.Ir).toFixed(6) + ' nA)');
    }
    if (sdFit && isFinite(sdFit.C)) {
        lines.push('# fit I=Ir(1+C/t)  Ir (nA)\t' + sdFit.Ir.toFixed(6));
        lines.push('# fit I=Ir(1+C/t)  C (ms)\t' + sdFit.C.toFixed(4));
        lines.push('# fit R2\t' + sdFit.r2.toFixed(6));
    }
    lines.push('duration(ms)\tthreshold(nA)\t1/t(1/ms)');
    sdPts.forEach(function (p) {
        lines.push(p.dur + '\t' + p.i.toFixed(6) + '\t' + (1 / p.dur).toFixed(6));
    });
    saveText('strength_duration.txt', lines.join('\r\n'));
}

/* ------------------------------------------------------------------
 * IK 활성화 시간상수 (매뉴얼 II-4) 와 α_n · β_n (II-5)
 *
 * n(t) = n∞(1 − e^(−t/τ)) 이고 IK ∝ n⁴ 이므로, 전류가 full 값의 56 % 에
 * 닿는 시각은 (1 − e^(−t/τ))⁴ = 0.56  →  e^(−t/τ) = 0.1347  →  t = 2τ.
 * 그래서 "56 % 도달시간의 반" 이 시간상수가 된다.
 * ------------------------------------------------------------------ */
var tauPts = [], tauBusy = false;

function runTauSweep() {
    if (tauBusy) return;
    if (document.querySelector('input[name="mode"]:checked').value !== 'vc') {
        setStatus('τ 측정은 전압고정(VC) 실험입니다. 모드를 바꾸고 다시 하세요.');
        return;
    }
    inputValueFromControl();
    var baseP = model.Pulse.slice();
    var cfg = sdConfig();
    var nEp = Math.max(1, Math.trunc(baseP[15]) || 1);
    var step = baseP[13];

    $('tauBox').hidden = false;
    $('tauBox').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    tauPts = []; tauBusy = true;
    $('tauRes').innerHTML = '';
    drawTau();

    var i = 0;
    function next() {
        try {
            if (i >= nEp) {
                tauBusy = false;
                $('tauMsg').textContent = '';
                finishTau();
                return;
            }
            var V = baseP[5] + step * i;
            $('tauMsg').textContent = '측정 중 … ' + (i + 1) + '/' + nEp +
                                      '  (지령전위 ' + V.toFixed(0) + ' mV)';
            var r = SD.tauForStep(cfg, baseP, V, { dt: 0.02, capMs: 600 });
            if (r && isFinite(r.tau) && r.tau > 0) tauPts.push(r);
            i++;
            drawTau();
            setTimeout(next, 0);
        } catch (err) {
            tauBusy = false;
            $('tauMsg').textContent = '';
            setStatus('τ 측정 중 오류: ' + err);
        }
    }
    setTimeout(next, 0);
}

/* HH 식에서 바로 나오는 이론값 (heart10Doc.cpp RateConstantsDefault 와 동일) */
function hhN(V) {
    var x = 10 - V - 65;
    var a = (Math.abs(x) < 1e-6) ? 0.1 : 0.01 * x / (Math.exp(x / 10) - 1);
    var b = 0.125 * Math.exp((-V - 65) / 80);
    return { alpha: a, beta: b, tau: 1 / (a + b), ninf: a / (a + b) };
}

/* n∞ 는 전도도로부터: G = Iss/(V − EK),  n∞ = (G/Gmax)^(1/4) */
function finishTau() {
    var gmax = 0;
    tauPts.forEach(function (p) {
        var d = p.V - p.VK;
        p.G = Math.abs(d) > 1e-9 ? p.Iss / d : 0;
        if (p.G > gmax) gmax = p.G;
    });
    tauPts.forEach(function (p) {
        p.ninf = gmax > 0 ? Math.pow(Math.max(0, p.G / gmax), 0.25) : NaN;
        p.alpha = p.ninf / p.tau;
        p.beta = (1 - p.ninf) / p.tau;
        p.th = hhN(p.V);
    });
    drawTau();
    renderTauResult();
    setStatus('τ 측정 완료 — ' + tauPts.length + ' 점');
}

function drawTau() {
    var cv = $('tauCanvas');
    var dpr = window.devicePixelRatio || 1;
    var rect = cv.getBoundingClientRect();
    var W = Math.max(80, Math.round(rect.width)), H = Math.max(60, Math.round(rect.height));
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    var c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    if (!tauPts.length) return;

    var mode = $('tauPlot').value;
    var L = 56, R = 16, T = 14, B = 34, k;

    var vmin = Infinity, vmax = -Infinity, ymax = 0;
    tauPts.forEach(function (p) {
        if (p.V < vmin) vmin = p.V;
        if (p.V > vmax) vmax = p.V;
        if (mode === 'tau') { if (p.tau > ymax) ymax = p.tau; }
        else {
            if (isFinite(p.alpha) && p.alpha > ymax) ymax = p.alpha;
            if (isFinite(p.beta) && p.beta > ymax) ymax = p.beta;
        }
    });
    if (vmax - vmin < 1e-9) { vmin -= 5; vmax += 5; }
    var pad = (vmax - vmin) * 0.08; vmin -= pad; vmax += pad;
    ymax = (ymax || 1) * 1.15;

    function X(v) { return L + (v - vmin) / (vmax - vmin) * (W - L - R); }
    function Y(v) { return T + (1 - v / ymax) * (H - T - B); }

    c.strokeStyle = '#c8ced5'; c.lineWidth = 1;
    c.strokeRect(L + 0.5, T + 0.5, W - L - R - 1, H - T - B - 1);
    c.strokeStyle = '#e6eaef'; c.setLineDash([2, 3]);
    tauPts.forEach(function (p) {
        c.beginPath(); c.moveTo(X(p.V), T); c.lineTo(X(p.V), H - B); c.stroke();
    });
    c.setLineDash([]);

    c.fillStyle = '#68727f'; c.font = '10px "Segoe UI", Arial, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'top';
    tauPts.forEach(function (p) { c.fillText(p.V.toFixed(0), X(p.V), H - B + 4); });
    c.fillText('지령전위 (mV)', (L + W - R) / 2, H - 14);
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (k = 0; k <= 4; k++) c.fillText((ymax * k / 4).toFixed(2), L - 5, Y(ymax * k / 4));
    c.save();
    c.translate(12, (T + H - B) / 2); c.rotate(-Math.PI / 2);
    c.textAlign = 'center'; c.textBaseline = 'top';
    c.fillText(mode === 'tau' ? 'τ (ms)' : 'α_n · β_n  (1/ms)', 0, 0);
    c.restore();

    function series(get, color, label, labAt) {
        var any = false;
        c.strokeStyle = color; c.lineWidth = 1.8; c.beginPath();
        tauPts.forEach(function (p, j) {
            var v = get(p);
            if (!isFinite(v)) return;
            if (!any) { c.moveTo(X(p.V), Y(v)); any = true; } else c.lineTo(X(p.V), Y(v));
        });
        if (any) c.stroke();
        c.fillStyle = color;
        tauPts.forEach(function (p) {
            var v = get(p);
            if (!isFinite(v)) return;
            c.beginPath(); c.arc(X(p.V), Y(v), 3.2, 0, Math.PI * 2); c.fill();
        });
        if (any && label) {
            var q = tauPts[labAt === 'first' ? 0 : tauPts.length - 1];
            c.font = 'bold 10px "Segoe UI", Arial, sans-serif';
            c.textAlign = labAt === 'first' ? 'left' : 'right';
            c.textBaseline = 'bottom';
            c.fillText(label, X(q.V) + (labAt === 'first' ? 6 : -6), Y(get(q)) - 5);
        }
    }

    function theory(get, color) {
        if (!tauPts[0] || !tauPts[0].th) return;
        c.strokeStyle = color; c.lineWidth = 1.2; c.setLineDash([4, 3]);
        c.beginPath();
        tauPts.forEach(function (p, j) {
            var v = get(p.th);
            if (j === 0) c.moveTo(X(p.V), Y(v)); else c.lineTo(X(p.V), Y(v));
        });
        c.stroke(); c.setLineDash([]);
    }

    if (mode === 'tau') {
        theory(function (t) { return t.tau; }, '#9db6cf');
        series(function (p) { return p.tau; }, '#1b6ec2', 'τ (측정)', 'first');
    } else {
        theory(function (t) { return t.alpha; }, '#86c7aa');
        theory(function (t) { return t.beta; }, '#d9b382');
        series(function (p) { return p.alpha; }, '#0f8a5f', 'α_n', 'last');
        series(function (p) { return p.beta; }, '#b45309', 'β_n', 'first');
    }

    c.fillStyle = '#8a949f'; c.font = '9.5px "Segoe UI", Arial, sans-serif';
    c.textAlign = 'right'; c.textBaseline = 'top';
    c.fillText('점선 = HH 식의 이론값', W - R - 3, T + 3);
}

function renderTauResult() {
    var h = ['<table><thead><tr><th>V (mV)</th><th>56 % 도달 (ms)</th>' +
             '<th>τ 측정 (ms)</th><th>τ 이론 (ms)</th>' +
             '<th>n∞ 측정</th><th>n∞ 이론</th>' +
             '<th>α_n</th><th>β_n</th></tr></thead><tbody>'];
    tauPts.forEach(function (p) {
        h.push('<tr' + (p.grew ? ' title="정상상태까지 펄스 2 를 ' + p.dur.toFixed(0) +
                                 ' ms 로 자동 연장했습니다"' : '') + '>' +
               '<td>' + p.V.toFixed(0) + '</td>' +
               '<td>' + p.t56.toFixed(3) + '</td>' +
               '<td>' + p.tau.toFixed(3) + '</td>' +
               '<td>' + p.th.tau.toFixed(3) + '</td>' +
               '<td>' + (isFinite(p.ninf) ? p.ninf.toFixed(3) : '—') + '</td>' +
               '<td>' + p.th.ninf.toFixed(3) + '</td>' +
               '<td>' + (isFinite(p.alpha) ? p.alpha.toFixed(4) : '—') + '</td>' +
               '<td>' + (isFinite(p.beta) ? p.beta.toFixed(4) : '—') + '</td></tr>');
    });
    h.push('</tbody></table>');

    var grew = tauPts.filter(function (p) { return p.grew; });
    var s = '<div class="sdfit">';
    s += '<div class="big">왜 56 % 도달시간의 <u>반</u>이 τ 인가</div>';
    s += '<div>n 은 <b>n(t) = n∞(1 − e<sup>−t/τ</sup>)</b> 로 커지는데 전류는 ' +
         '<b>I ∝ n⁴</b> 입니다. 전류가 full 값의 56 % 가 되는 순간은<br>' +
         '(1 − e<sup>−t/τ</sup>)⁴ = 0.56 → 1 − e<sup>−t/τ</sup> = 0.56<sup>1/4</sup> = 0.865 ' +
         '→ e<sup>−t/τ</sup> = 0.135 → <b>t = 2τ</b><br>' +
         '즉 56 % 지점이 정확히 <b>두 시간상수</b>에 해당하므로 그 시간을 반으로 나눕니다. ' +
         '(n 자체라면 63 % 가 1τ 이지만, 우리가 보는 것은 n⁴ 인 전류입니다.)</div>';

    s += '<div class="def"><b>측정값이 이론값보다 작게 나오는 이유</b> — 위 유도는 ' +
         '<b>n 이 0 에서 출발</b>한다고 가정합니다. 실제로는 유지전위(−80 mV)에서도 ' +
         'n₀ ≈ 0.13 으로 이미 열려 있어, 출발점이 0 이 아니므로 56 % 지점은 2τ 보다 ' +
         '조금 일찍 옵니다. 전류로 보면 n₀⁴/n∞⁴ 가 1 % 도 안 돼 “0 에서 시작” 처럼 ' +
         '보이지만, τ 를 결정하는 것은 n⁴ 이 아니라 n 입니다. 이 차이는 탈분극이 작을수록 ' +
         '(n∞ 가 작을수록) 커집니다.</div>';

    s += '<div class="def"><b>n∞ 에도 같은 종류의 오차가 있습니다</b> — 매뉴얼은 ' +
         'G = I/(V − E<sub>K</sub>) 로 전도도를 구하라고 하지만(옴형 가정), 이 모델의 ' +
         'IK 는 <b>정전장(GHK) 구동력</b>을 씁니다. 그래서 I/(V − E<sub>K</sub>) 가 n⁴ 에 ' +
         '정확히 비례하지 않아 n∞ 추정값이 이론값과 벌어집니다.</div>';

    s += '<div class="def">시간은 매뉴얼대로 <b>펄스 2 가 시작되는 순간부터</b> 쟀습니다 ' +
         '(holding length 는 빠져 있습니다). ';
    if (grew.length) {
        s += '전류가 정상상태에 이르지 못한 ' + grew.map(function (p) {
            return p.V.toFixed(0) + ' mV';
        }).join(', ') + ' 에서는 펄스 2 를 자동으로 늘려 측정했습니다 ' +
             '(매뉴얼의 −60 mV 주의사항).';
    } else {
        s += '모든 지령전위에서 펄스 2 안에 정상상태에 도달했습니다.';
    }
    s += '</div>';

    s += '<div class="def"><b>II-5</b> 는 여기서 바로 이어집니다. ' +
         '<b>α_n = n∞/τ</b>, <b>β_n = (1 − n∞)/τ</b> 이므로 표의 두 열이 그 값입니다. ' +
         '위 선택상자를 <i>α_n · β_n</i> 로 바꾸면 막전압에 대한 그래프가 ' +
         '그려지고, 점선으로 HH 식의 이론값이 같이 나오므로 얼마나 가까운지 ' +
         '확인할 수 있습니다.</div>';
    s += '</div>';

    $('tauRes').innerHTML = h.join('') + s;
}

function tauCsv() {
    if (!tauPts.length) { setStatus('τ: 먼저 [자동 측정] 을 하세요.'); return; }
    var lines = ['# IK activation kinetics (56% rule: t56 = 2 tau)',
                 '# theory columns are the HH rate equations at that V',
                 'V(mV)\tt56(ms)\ttau(ms)\ttau_theory(ms)\tIss(nA)\tG(nA/mV)\tninf\tninf_theory' +
                 '\talpha_n(1/ms)\tbeta_n(1/ms)\talpha_theory\tbeta_theory\tpulse2(ms)'];
    tauPts.forEach(function (p) {
        lines.push([p.V.toFixed(2), p.t56.toFixed(4), p.tau.toFixed(4), p.th.tau.toFixed(4),
                    p.Iss.toFixed(6), p.G.toFixed(6), p.ninf.toFixed(5), p.th.ninf.toFixed(5),
                    p.alpha.toFixed(5), p.beta.toFixed(5),
                    p.th.alpha.toFixed(5), p.th.beta.toFixed(5),
                    p.dur.toFixed(1)].join('\t'));
    });
    saveText('ik_activation_tau.txt', lines.join('\r\n'));
}

/* ------------------------------------------------------------------
 * 활동전압 재구성 (매뉴얼 II-6)
 * α·β 만으로 적분한 결과를 모델(HH 모드)의 실제 계산과 겹쳐 보여 준다.
 * ------------------------------------------------------------------ */
var rcRes = null, rcRef = null;

function runReconstruct() {
    inputValueFromControl();

    var SF = model.SF, Ion = model.Ion, Con = model.Condition;
    var par = {
        gNa: SF[13] * 200 / 1000 * SF[23],          // DefScaleVar 와 같은 식
        gK: SF[14] * 60 / 1000 * SF[23],
        gLeak: SF[20] * 0.0561 * 1.5 / 1000 * SF[23],
        rgLeakK: 1.4,
        Cap: SF[23] * 132 / 1000,
        Nae: Ion[0], Nai: Ion[1], Ke: Ion[2], Ki: Ion[3],
        tempC: Con[3], Rseal: Con[1],
        stimSign: model.stimSign,
        V0: -67, settle: 40,
        t0: num('rcT0'), dur: num('rcDur'), amp: num('rcAmp'),
        T: num('rcT'), dt: 0.01,
        measured: $('rcMeasured').checked ? tauPts.filter(function (p) {
            return isFinite(p.alpha) && isFinite(p.beta);
        }) : null
    };

    if ($('rcMeasured').checked && (!par.measured || par.measured.length < 2)) {
        setStatus('측정 α·β 를 쓰려면 먼저 II-4 패널에서 [자동 측정] 을 하세요.');
        $('rcMeasured').checked = false;
        par.measured = null;
    }

    $('reconBox').hidden = false;
    $('reconBox').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    $('rcMsg').textContent = '적분 중 …';

    /* 먼저 모델(HH 모드)로 같은 자극을 돌리고, 재구성은 그 출발 막전압에서
       시작한다.  모델의 calculatevm() 은 |Itot| < 0.02 nA 에서 멈추므로
       참 평형보다 몇 mV 떨어져 있는데, 같은 지점에서 출발해야 두 계산을
       공정하게 겹쳐 볼 수 있다. */
    rcRef = referenceAP(par);
    if (rcRef && rcRef.vm && rcRef.vm.length) {
        par.V0 = rcRef.vm[0];
        par.settle = 0;
    }

    rcRes = RECON.reconstruct(par);
    rcPar = par;

    /* 측정 α·β 를 썼다면, 비교용으로 HH 식 결과도 함께 구한다 */
    rcHHpeak = null;
    if (par.measured) {
        var alt = {}, kk;
        for (kk in par) if (par.hasOwnProperty(kk)) alt[kk] = par[kk];
        alt.measured = null;
        var r2 = RECON.reconstruct(alt);
        if (r2 && r2.V.length) rcHHpeak = Math.max.apply(null, r2.V);
    }

    $('rcMsg').textContent = '';
    drawRecon();
    renderReconResult();
    setStatus('활동전압 재구성 완료 — 정점 ' +
        Math.max.apply(null, rcRes.V).toFixed(2) + ' mV' +
        (par.measured ? ' (n 의 α·β 는 II-4 측정값)' : ''));
}

var rcPar = null, rcHHpeak = null;

/* 모델의 HH 경로로 같은 자극을 돌린 기준 파형 */
function referenceAP(par) {
    var P = [];
    P[0] = 0; P[1] = par.t0; P[2] = 0; P[3] = 0; P[4] = 0;
    P[5] = par.amp; P[6] = par.amp; P[7] = par.dur;
    P[8] = 0; P[9] = 0; P[10] = 0;
    P[11] = 0; P[12] = Math.max(1, par.T - par.t0 - par.dur);
    P[13] = 0; P[14] = 0; P[15] = 1; P[16] = 0; P[17] = 1;
    P[18] = Math.max(par.T, P[1] + P[4] + P[7] + P[10] + P[12]);

    var cfg = {
        SF: model.SF, Ion: model.Ion, Condition: model.Condition,
        bHH: true,                      // 순수 HH 경로 = 재구성과 같은 전류 구성
        bConstantField: false,
        stimSign: model.stimSign,
        m_FixedTimeInterval: 0.01
    };
    try {
        return SD.recordEpisode(cfg, P, false, 0.01);
    } catch (e) { return null; }
}

function rcAxes(c, W, H, L, R, T, B, xmax, ymin, ymax, ylab, yfmt) {
    c.strokeStyle = '#c8ced5'; c.lineWidth = 1;
    c.strokeRect(L + 0.5, T + 0.5, W - L - R - 1, H - T - B - 1);
    c.fillStyle = '#68727f'; c.font = '10px "Segoe UI", Arial, sans-serif';
    var k, v;
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (k = 0; k <= 6; k++) {
        v = xmax * k / 6;
        c.fillText(v.toFixed(0), L + (W - L - R) * k / 6, H - B + 4);
    }
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (k = 0; k <= 4; k++) {
        v = ymin + (ymax - ymin) * k / 4;
        c.fillText(yfmt ? yfmt(v) : v.toFixed(0), L - 5,
                   T + (1 - (v - ymin) / (ymax - ymin)) * (H - T - B));
    }
    c.save();
    c.translate(11, (T + H - B) / 2); c.rotate(-Math.PI / 2);
    c.textAlign = 'center'; c.textBaseline = 'top';
    c.fillText(ylab, 0, 0);
    c.restore();
}

function drawRecon() {
    if (!rcRes) return;
    var k;

    /* ---- 위: 막전압 ---- */
    (function () {
        var cv = $('rcCanvasV');
        var dpr = window.devicePixelRatio || 1, rect = cv.getBoundingClientRect();
        var W = Math.max(80, Math.round(rect.width)), H = Math.max(60, Math.round(rect.height));
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
        var c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.clearRect(0, 0, W, H);

        var L = 50, R = 12, T = 12, B = 28;
        var xmax = rcRes.t[rcRes.t.length - 1] || 1;
        var lo = Math.min.apply(null, rcRes.V), hi = Math.max.apply(null, rcRes.V);
        var pad = (hi - lo) * 0.12 || 5; lo -= pad; hi += pad;
        function X(t) { return L + t / xmax * (W - L - R); }
        function Y(v) { return T + (1 - (v - lo) / (hi - lo)) * (H - T - B); }
        rcAxes(c, W, H, L, R, T, B, xmax, lo, hi, 'Vm (mV)', function (v) { return v.toFixed(0); });

        /* 자극 구간 */
        c.fillStyle = 'rgba(27,110,194,0.07)';
        c.fillRect(X(rcPar.t0), T, X(rcPar.t0 + rcPar.dur) - X(rcPar.t0), H - T - B);

        /* 모델 기준 파형 (점선) */
        if (rcRef && rcRef.t.length) {
            c.strokeStyle = '#9db6cf'; c.lineWidth = 2; c.setLineDash([5, 4]);
            c.beginPath();
            var started = false;
            for (k = 0; k < rcRef.t.length; k++) {
                if (rcRef.t[k] > xmax) break;
                var yy = rcRef.vm ? rcRef.vm[k] : null;
                if (yy === null) break;
                if (!started) { c.moveTo(X(rcRef.t[k]), Y(yy)); started = true; }
                else c.lineTo(X(rcRef.t[k]), Y(yy));
            }
            c.stroke(); c.setLineDash([]);
        }

        /* 재구성 */
        c.strokeStyle = '#c00000'; c.lineWidth = 1.8; c.beginPath();
        for (k = 0; k < rcRes.t.length; k++) {
            if (k === 0) c.moveTo(X(rcRes.t[k]), Y(rcRes.V[k]));
            else c.lineTo(X(rcRes.t[k]), Y(rcRes.V[k]));
        }
        c.stroke();

        c.font = 'bold 10px "Segoe UI", Arial, sans-serif';
        c.textAlign = 'right'; c.textBaseline = 'top';
        c.fillStyle = '#c00000'; c.fillText('재구성 (α·β 적분)', W - R - 4, T + 3);
        if (rcRef) { c.fillStyle = '#7f93a8'; c.fillText('모델 (HH 모드)', W - R - 4, T + 16); }
    })();

    /* ---- 아래: 게이트와 전도도 ---- */
    (function () {
        var cv = $('rcCanvasG');
        var dpr = window.devicePixelRatio || 1, rect = cv.getBoundingClientRect();
        var W = Math.max(80, Math.round(rect.width)), H = Math.max(60, Math.round(rect.height));
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
        var c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.clearRect(0, 0, W, H);

        var L = 50, R = 46, T = 12, B = 28;
        var xmax = rcRes.t[rcRes.t.length - 1] || 1;
        function X(t) { return L + t / xmax * (W - L - R); }
        function Yg(v) { return T + (1 - v) * (H - T - B); }        // 게이트 0..1
        rcAxes(c, W, H, L, R, T, B, xmax, 0, 1, '게이트 m·h·n',
               function (v) { return v.toFixed(1); });

        function line(arr, color, lab, labY) {
            c.strokeStyle = color; c.lineWidth = 1.6; c.beginPath();
            for (var j = 0; j < arr.length; j++) {
                if (j === 0) c.moveTo(X(rcRes.t[j]), Yg(arr[j]));
                else c.lineTo(X(rcRes.t[j]), Yg(arr[j]));
            }
            c.stroke();
            if (lab) {
                c.fillStyle = color; c.font = 'bold 10px "Segoe UI", Arial, sans-serif';
                c.textAlign = 'left'; c.textBaseline = 'middle';
                c.fillText(lab, L + 4, labY);
            }
        }
        line(rcRes.m, '#ff0000', 'm', T + 10);
        line(rcRes.h, '#008080', 'h', T + 22);
        line(rcRes.n, '#0000ff', 'n', T + 34);

        /* 전도도는 오른쪽 축 */
        var gmax = 0;
        for (var j = 0; j < rcRes.gNa.length; j++) {
            if (rcRes.gNa[j] > gmax) gmax = rcRes.gNa[j];
            if (rcRes.gK[j] > gmax) gmax = rcRes.gK[j];
        }
        gmax = gmax || 1;
        function Yc(v) { return T + (1 - v / (gmax * 1.08)) * (H - T - B); }
        function gline(arr, color, dash) {
            c.strokeStyle = color; c.lineWidth = 1.4; c.setLineDash(dash);
            c.beginPath();
            for (var j = 0; j < arr.length; j++) {
                if (j === 0) c.moveTo(X(rcRes.t[j]), Yc(arr[j]));
                else c.lineTo(X(rcRes.t[j]), Yc(arr[j]));
            }
            c.stroke(); c.setLineDash([]);
        }
        gline(rcRes.gNa, '#e06666', [4, 3]);
        gline(rcRes.gK, '#6a8fd6', [4, 3]);

        c.fillStyle = '#68727f'; c.font = '10px "Segoe UI", Arial, sans-serif';
        c.textAlign = 'left'; c.textBaseline = 'middle';
        for (var q = 0; q <= 2; q++) {
            var v = gmax * 1.08 * q / 2;
            c.fillText(v.toFixed(2), W - R + 4, Yc(v));
        }
        c.save();
        c.translate(W - 8, (T + H - B) / 2); c.rotate(-Math.PI / 2);
        c.textAlign = 'center'; c.textBaseline = 'top';
        c.fillText('g (점선, nA/mV)', 0, 0);
        c.restore();
        c.textAlign = 'center'; c.textBaseline = 'top';
        c.fillText('시간 (ms)', (L + W - R) / 2, H - 13);
    })();
}

function renderReconResult() {
    if (!rcRes) return;
    var lm = RECON.landmarks(rcRes, rcPar.t0);
    var h = ['<table><thead><tr><th>시점</th><th>t (ms)</th><th>Vm (mV)</th>' +
             '<th>m</th><th>h</th><th>n</th><th>m³h</th><th>n⁴</th>' +
             '<th>INa (nA)</th><th>IK (nA)</th></tr></thead><tbody>'];
    lm.forEach(function (p) {
        h.push('<tr><td style="text-align:left">' + p.label + '</td>' +
               '<td>' + p.t.toFixed(2) + '</td><td>' + p.V.toFixed(2) + '</td>' +
               '<td>' + p.m.toFixed(3) + '</td><td>' + p.h.toFixed(3) + '</td>' +
               '<td>' + p.n.toFixed(3) + '</td>' +
               '<td>' + (p.m * p.m * p.m * p.h).toFixed(4) + '</td>' +
               '<td>' + (p.n * p.n * p.n * p.n).toFixed(4) + '</td>' +
               '<td>' + p.INa.toFixed(3) + '</td><td>' + p.IK.toFixed(3) + '</td></tr>');
    });
    h.push('</tbody></table>');

    var peak = Math.max.apply(null, rcRes.V);
    var refPeak = (rcRef && rcRef.vm) ? Math.max.apply(null, rcRef.vm) : null;

    var s = '<div class="sdfit">';
    s += '<div class="big">α·β 만 있으면 활동전압이 나옵니다</div>';
    s += '<div>이 패널은 <b>HeartModel 을 쓰지 않고</b> 아래 식만으로 처음부터 적분한 ' +
         '결과입니다(<code>js/reconstruct.js</code>).<br>' +
         '&nbsp;&nbsp;① <b>dm/dt = α_m(V)(1−m) − β_m(V)m</b> &nbsp;(h, n 도 같은 꼴)<br>' +
         '&nbsp;&nbsp;② <b>I_Na = ḡ_Na·m³h·(V−E_Na)</b>, <b>I_K = ḡ_K·n⁴·(V−E_K)</b><br>' +
         '&nbsp;&nbsp;③ <b>C·dV/dt = −(I_Na + I_K + I_leak) + I_stim</b><br>' +
         'II-1 ~ II-5 에서 얻는 것이 바로 ① 의 α·β 와 ② 의 ḡ 이므로, ' +
         '<b>실험에서 측정한 값만으로 활동전압을 그려낼 수 있다</b>는 것이 HH 의 결론입니다.</div>';

    var gap = (refPeak !== null) ? Math.abs(peak - refPeak) : null;
    s += '<div class="def"><b>검증</b> — 재구성 파형(빨강)과 모델의 HH 모드 계산(회색 점선)을 ' +
         '같은 정지막전위에서 출발시켜 겹쳤습니다. 재구성 정점 <b>' + peak.toFixed(2) + ' mV</b>' +
         (refPeak !== null ? ', 모델 정점 <b>' + refPeak.toFixed(2) + ' mV</b>' +
            ' (차이 ' + gap.toFixed(2) + ' mV)' : '') +
         '. 서로 독립적으로 짠 코드가 같은 답을 내므로 ①~③ 이외에 숨은 요소가 ' +
         '없다는 뜻입니다.</div>';

    s += '<div class="def"><b>인과 고리</b> — 표를 위에서 아래로 읽으면 기전이 보입니다.<br>' +
         '<b>V ↑ → α_m ↑ → m ↑ → g_Na ↑ → I_Na 내향 → V ↑</b> 가 양성 되먹임(상승기)이고,<br>' +
         '여기에 느린 <b>h ↓</b> (Na 불활성화) 와 <b>n ↑</b> (K 활성화) 가 뒤따라 ' +
         '재분극을 만듭니다. m 은 빠르고 h·n 은 느리다는 <b>시간상수 차이</b>가 ' +
         '활동전압의 모양을 결정합니다.</div>';

    if (rcPar.measured) {
        s += '<div class="def">지금은 <b>n 의 α·β 를 II-4 에서 측정한 값</b>으로 바꿔 적분했습니다 ' +
             '(m·h 는 HH 식 — 매뉴얼의 전압고정 프로토콜로는 τ_m·τ_h 까지는 구하지 않습니다). ' +
             '<b>측정값으로도 활동전압이 그대로 재구성됩니다</b>' +
             (rcHHpeak !== null
                ? ' : 정점 <b>' + peak.toFixed(2) + ' mV</b> (측정 α·β) vs <b>' +
                  rcHHpeak.toFixed(2) + ' mV</b> (HH 식).' : '.') +
             ' 다만 정점이 더 높고 재분극이 느려집니다. 측정한 α_n 이 작고 τ 가 짧게 ' +
             '나온 탓에 n 이 덜 열려 K 전류가 모자라기 때문인데, 그 편향은 II-4 에서 ' +
             '설명한 측정 방법의 가정(n₀ ≠ 0, 옴형 전도도)에서 옵니다. ' +
             '<b>실험값만으로 활동전압을 재구성할 수 있다</b>는 결론은 그대로이고, ' +
             '측정 오차가 파형에 어떻게 드러나는지도 함께 볼 수 있습니다.</div>';
    } else {
        s += '<div class="def">위의 <i>n 의 α·β 를 II-4 측정값으로</i> 를 체크하면, ' +
             'HH 식 대신 <b>II-4 에서 직접 잰 α_n·β_n</b> 으로 적분합니다. ' +
             '실험값만으로도 같은 활동전압이 나오는지 확인해 보세요.</div>';
    }
    s += '</div>';

    $('rcRes').innerHTML = h.join('') + s;
}

function reconCsv() {
    if (!rcRes) { setStatus('재구성: 먼저 [재구성 실행] 을 하세요.'); return; }
    var lines = ['# action potential reconstructed from alpha/beta only',
                 '# ENa(mV)\t' + rcRes.ENa.toFixed(3) + '\tEK(mV)\t' + rcRes.EK.toFixed(3),
                 't(ms)\tVm(mV)\tm\th\tn\tgNa(nA/mV)\tgK(nA/mV)\tINa(nA)\tIK(nA)\tdVdt(mV/ms)'];
    for (var i = 0; i < rcRes.t.length; i += 5) {
        lines.push([rcRes.t[i].toFixed(3), rcRes.V[i].toFixed(4), rcRes.m[i].toFixed(5),
                    rcRes.h[i].toFixed(5), rcRes.n[i].toFixed(5), rcRes.gNa[i].toFixed(6),
                    rcRes.gK[i].toFixed(6), rcRes.INa[i].toFixed(5),
                    rcRes.IK[i].toFixed(5), rcRes.dVdt[i].toFixed(4)].join('\t'));
    }
    saveText('ap_reconstruction.txt', lines.join('\r\n'));
}

/* ---------------- tabs -------------------------------------------- */
function initTabs() {
    var btns = document.querySelectorAll('.tabbtn');
    Array.prototype.forEach.call(btns, function (b) {
        b.addEventListener('click', function () {
            Array.prototype.forEach.call(btns, function (x) { x.classList.remove('active'); });
            b.classList.add('active');
            Array.prototype.forEach.call(document.querySelectorAll('.tabpane'), function (p) {
                p.classList.toggle('active', p.id === b.dataset.pane);
            });
        });
    });
}

/* ---------------- boot -------------------------------------------- */
function boot() {
    buildPulsePanel(PARAMS.PRM['default']);
    buildParamTable($('sfPane'),    PARAMS.SFS_NAMES, 'sf',  PARAMS.SFS['default'], 2);
    buildParamTable($('ionPane'),   PARAMS.ION_NAMES, 'ion', PARAMS.ION, 4);
    buildParamTable($('conPane'),   PARAMS.CON_NAMES, 'con', PARAMS.CON, 2);
    buildChannelList();
    buildPresetSelects();
    initTabs();

    /* Force the model-behaviour selectors on every load, so a browser that
       restores previous form state cannot silently change the model.
       Defaults follow the practical manual (see README). */
    $('selDrive').value = 'ohmic';
    $('selSign').value = '-1';
    $('chkHH').checked = false;
    $('selManual').value = '';

    graphCur = new Graph($('canvasCur'));
    graphVol = new Graph($('canvasVol'));
    cursorSetup('wrapCur', graphCur, false);
    cursorSetup('wrapVol', graphVol, true);

    inputValueFromControl();
    initializeGraphCtrl();

    $('btnPlay').addEventListener('click', onPlay);
    $('btnStop').addEventListener('click', onStopToggle);
    $('btnAbort').addEventListener('click', onAbort);
    /* 원본 툴바의 "Try New Cell": default.prm / default.sfs 를 다시 선택하고
       이온농도를 포함한 모든 상태를 프로그램 시작 상태로 되돌린다. */
    $('btnNewCell').addEventListener('click', function () {
        model = new HeartModel();
        model.NewCell = true;
        $('selManual').value = '';
        applyPrm('default'); $('selPrm').value = 'default';
        applySfs('default'); $('selSfs').value = 'default';
        buildParamTable($('ionPane'), PARAMS.ION_NAMES, 'ion', PARAMS.ION, 4);
        buildParamTable($('conPane'), PARAMS.CON_NAMES, 'con', PARAMS.CON, 2);
        inputValueFromControl();
        initializeGraphCtrl();
        setStatus('새 세포 — default.prm / default.sfs 로 초기화되었습니다.');
    });

    $('selManual').addEventListener('change', function () { applyManual(this.value); });

    $('selPrm').addEventListener('change', function () {
        $('selManual').value = '';
        applyPrm(this.value);
        /* the Windows version keeps a matching .sfs beside each protocol */
        var m = Object.keys(PARAMS.SFS).filter(function (k) {
            return k.toLowerCase() === this.value.toLowerCase();
        }, this)[0];
        if (m) { applySfs(m); $('selSfs').value = m; }
        inputValueFromControl();
        initializeGraphCtrl();
    });
    $('selSfs').addEventListener('change', function () {
        $('selManual').value = '';
        applySfs(this.value);
    });

    $('fileInput').addEventListener('change', function () {
        if (this.files && this.files[0]) loadUserFile(this.files[0]);
        this.value = '';
    });

    $('btnApplyRange').addEventListener('click', applyRange);
    ['cur', 'vol', 'both'].forEach(function (w) {
        $('btnAuto' + (w === 'cur' ? 'Cur' : w === 'vol' ? 'Vol' : 'Both'))
            .addEventListener('click', function () {
                var fit = autoScale(w);
                setStatus(fit || '자동 스케일: 그려진 파형이 없습니다. 먼저 [실행] 하세요.');
            });
    });
    $('btnCurUp').addEventListener('click', function () { scaleY(graphCur, 'curMin', 'curMax', 0.5); });
    $('btnCurDown').addEventListener('click', function () { scaleY(graphCur, 'curMin', 'curMax', 2); });
    $('btnVolUp').addEventListener('click', function () { scaleY(graphVol, 'volMin', 'volMax', 0.5); });
    $('btnVolDown').addEventListener('click', function () { scaleY(graphVol, 'volMin', 'volMax', 2); });

    $('btnSaveData').addEventListener('click', saveData);
    $('btnPngCur').addEventListener('click', function () { savePng(graphCur, 'current.png'); });
    $('btnPngVol').addEventListener('click', function () { savePng(graphVol, 'voltage.png'); });

    $('btnCheckAll').addEventListener('click', function () {
        CHANNELS.forEach(function (ch) { $('chk' + ch.i).checked = true; ui.check[ch.i] = true; });
    });
    $('btnCheckNone').addEventListener('click', function () {
        CHANNELS.forEach(function (ch) { $('chk' + ch.i).checked = false; ui.check[ch.i] = false; });
    });

    ['chkHH', 'chkG', 'chkNMH'].forEach(function (id) {
        $(id).addEventListener('change', function () {
            if (id === 'chkNMH' && $(id).checked) $('chkG').checked = false;
            if (id === 'chkG' && $(id).checked) $('chkNMH').checked = false;
            inputValueFromControl();
            convertUnit();
            graphCur.redraw();
            if (id === 'chkHH') updateDriveNote();
        });
    });
    $('selDrive').addEventListener('change', updateDriveNote);
    updateDriveNote();

    $('selReadEp').addEventListener('change', renderReadout);
    $('btnClearMark').addEventListener('click', function () { clearMarks(true); });
    $('btnZoomMark').addEventListener('click', zoomToMarks);
    $('btnZoomOut').addEventListener('click', zoomOut);
    $('btnMeasure').addEventListener('click', function () { refreshMeasure(true); });
    $('chkMeasureAB').addEventListener('change', function () { refreshMeasure(false); });
    $('btnMeasureCsv').addEventListener('click', measureCsv);
    $('btnSDRun').addEventListener('click', runStrengthDuration);
    $('btnSDCsv').addEventListener('click', sdCsv);
    $('btnSDHide').addEventListener('click', function () { $('sdBox').hidden = true; });
    $('btnTauRun').addEventListener('click', runTauSweep);
    $('btnTauCsv').addEventListener('click', tauCsv);
    $('btnTauHide').addEventListener('click', function () { $('tauBox').hidden = true; });
    $('tauPlot').addEventListener('change', drawTau);
    /* 접이식 설명을 펴고 접으면 .plots 의 스크롤바 유무가 바뀌어
       캔버스 폭이 달라질 수 있으므로 다시 그린다 */
    Array.prototype.forEach.call(document.querySelectorAll('details.how'), function (d) {
        d.addEventListener('toggle', function () {
            graphCur.resize(); graphCur.redraw();
            graphVol.resize(); graphVol.redraw();
            drawOverlay(graphCur, $('ovCur'));
            drawOverlay(graphVol, $('ovVol'));
            if (!$('sdBox').hidden) drawSD();
            if (!$('tauBox').hidden) drawTau();
            if (!$('reconBox').hidden) drawRecon();
        });
    });
    $('btnReconRun').addEventListener('click', runReconstruct);
    $('btnReconCsv').addEventListener('click', reconCsv);
    $('btnReconHide').addEventListener('click', function () { $('reconBox').hidden = true; });
    $('btnMeasureHide').addEventListener('click', function () { $('measureBox').hidden = true; });

    window.addEventListener('resize', function () {
        graphCur.resize(); graphCur.redraw();
        graphVol.resize(); graphVol.redraw();
        drawOverlay(graphCur, $('ovCur'));
        drawOverlay(graphVol, $('ovVol'));
        drawPulsePreview();
        if (!$('sdBox').hidden) drawSD();
        if (!$('tauBox').hidden) drawTau();
        if (!$('reconBox').hidden) drawRecon();
    });

    /* 진폭 단위와 프로토콜 미리보기는 클램프 모드에 따라 달라진다 */
    Array.prototype.forEach.call(document.querySelectorAll('input[name="mode"]'), function (r) {
        r.addEventListener('change', function () { updatePulseUnits(); drawPulsePreview(); });
    });
    $('chkEpColor').addEventListener('change', updateEpLegend);
    updateEpLegend();
    updateMeasureABState(false);
    drawPulsePreview();

    /* 원본 툴바와 같은 단축키: F2 실행, Space 일시정지, Esc 중단 */
    document.addEventListener('keydown', function (e) {
        var tag = (e.target && e.target.tagName || '').toLowerCase();
        var typing = tag === 'input' || tag === 'select' || tag === 'textarea';
        if (e.key === 'F2') { e.preventDefault(); if (!run.active) onPlay(); return; }
        if (e.key === 'Escape') { e.preventDefault(); onAbort(); return; }
        if (e.key === ' ' && !typing) { e.preventDefault(); onStopToggle(); }
    });

    updateButtons();
    setStatus('준비됨 — [실행] 또는 F2 를 누르세요.');
    displayIonConc();

    /* handy for inspecting the run from the browser console */
    window.HeartApp = {
        get model() { return model; },
        get graphCur() { return graphCur; },
        get graphVol() { return graphVol; },
        get recorded() { return recorded; },
        get columns() { return recordCols; },
        ui: ui, run: run
    };
}

document.addEventListener('DOMContentLoaded', boot);

})();
