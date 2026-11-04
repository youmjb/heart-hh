/* ------------------------------------------------------------------
 * graph.js -- canvas replacement for CGraphCtrl (GraphCtrl.cpp)
 *
 * Same layout as the original: the plotting rectangle occupies
 * 0.10 .. 0.90 of the width and 0.10 .. 0.85 of the height, with an
 * 8 x 6 grid, axis titles and tick labels.
 *
 * Traces are drawn incrementally (one segment per integration step,
 * like the original bitblt drawing) and the raw points are also kept
 * so the plot can be redrawn after a range change or a window resize.
 * ------------------------------------------------------------------ */
(function (global) {
'use strict';

function Graph(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.left = 0.10; this.top = 0.10; this.right = 0.90; this.bottom = 0.85;
    this.minX = 0; this.maxX = 100; this.minY = -1; this.maxY = 1;
    this.xDiv = 8; this.yDiv = 6;
    this.gridColor = '#808080';
    this.bgColor = '#ffffff';
    this.labelColor = '#008000';
    this.xUnit = 'ms'; this.yUnit = 'nA';
    this.lineWidth = 1;
    this.texts = [];                 // {fx, fy, text, color}
    this.segments = [];              // {x0,y0,x1,y1,color,width}
    this.dpr = 1;
    this.resize();
}

Graph.prototype.resize = function () {
    var dpr = global.devicePixelRatio || 1;
    var rect = this.canvas.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width)), h = Math.max(1, Math.round(rect.height));
    this.cssW = w; this.cssH = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
};

Graph.prototype.setXYRange = function (minX, minY, maxX, maxY) {
    this.minX = minX; this.minY = minY; this.maxX = maxX; this.maxY = maxY;
};

Graph.prototype.plotRect = function () {
    return {
        x: this.cssW * this.left,
        y: this.cssH * this.top,
        w: this.cssW * (this.right - this.left),
        h: this.cssH * (this.bottom - this.top)
    };
};

Graph.prototype.px = function (x) {
    var r = this.plotRect();
    var sx = (this.maxX - this.minX) || 1;
    return r.x + (x - this.minX) / sx * r.w;
};

Graph.prototype.py = function (y) {
    var r = this.plotRect();
    var sy = (this.maxY - this.minY) || 1;
    return r.y + r.h - (y - this.minY) / sy * r.h;
};

/* pixel -> data (inverse of px/py), for the cursor readout */
Graph.prototype.xFromPx = function (xpix) {
    var r = this.plotRect();
    return this.minX + (xpix - r.x) / r.w * (this.maxX - this.minX);
};
Graph.prototype.yFromPx = function (ypix) {
    var r = this.plotRect();
    return this.maxY - (ypix - r.y) / r.h * (this.maxY - this.minY);
};
Graph.prototype.insidePlot = function (xpix, ypix) {
    var r = this.plotRect();
    return xpix >= r.x && xpix <= r.x + r.w && ypix >= r.y && ypix <= r.y + r.h;
};

function fmt(v, span) {
    var a = Math.abs(span);
    if (a >= 100) return v.toFixed(0);
    if (a >= 10) return v.toFixed(1);
    if (a >= 1) return v.toFixed(2);
    if (a >= 0.1) return v.toFixed(3);
    return v.toPrecision(3);
}

Graph.prototype.drawFrame = function () {
    var c = this.ctx, r = this.plotRect(), i, x, y, v;

    c.save();
    c.fillStyle = this.bgColor;
    c.fillRect(0, 0, this.cssW, this.cssH);

    /* grid */
    c.strokeStyle = this.gridColor;
    c.lineWidth = 1;
    c.setLineDash([1, 3]);
    c.beginPath();
    for (i = 1; i < this.xDiv; i++) {
        x = Math.round(r.x + r.w * i / this.xDiv) + 0.5;
        c.moveTo(x, r.y); c.lineTo(x, r.y + r.h);
    }
    for (i = 1; i < this.yDiv; i++) {
        y = Math.round(r.y + r.h * i / this.yDiv) + 0.5;
        c.moveTo(r.x, y); c.lineTo(r.x + r.w, y);
    }
    c.stroke();
    c.setLineDash([]);

    /* frame */
    c.strokeStyle = this.gridColor;
    c.strokeRect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, Math.round(r.w), Math.round(r.h));

    /* zero line */
    if (this.minY < 0 && this.maxY > 0) {
        y = Math.round(this.py(0)) + 0.5;
        c.strokeStyle = this.gridColor;
        c.globalAlpha = 0.9;
        c.beginPath(); c.moveTo(r.x, y); c.lineTo(r.x + r.w, y); c.stroke();
        c.globalAlpha = 1;
    }

    /* tick labels */
    c.fillStyle = this.labelColor;
    c.font = '11px "Segoe UI", Arial, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (i = 0; i <= this.xDiv; i++) {
        v = this.minX + (this.maxX - this.minX) * i / this.xDiv;
        x = r.x + r.w * i / this.xDiv;
        c.fillText(fmt(v, this.maxX - this.minX), x, r.y + r.h + 4);
    }
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (i = 0; i <= this.yDiv; i++) {
        v = this.maxY - (this.maxY - this.minY) * i / this.yDiv;
        y = r.y + r.h * i / this.yDiv;
        c.fillText(fmt(v, this.maxY - this.minY), r.x - 6, y);
    }

    /* axis titles */
    c.textAlign = 'right'; c.textBaseline = 'top';
    c.fillText(this.xUnit, r.x + r.w, r.y + r.h + 18);
    c.textAlign = 'left'; c.textBaseline = 'bottom';
    c.fillText(this.yUnit, r.x - 34, r.y - 2);

    /* free texts (episode counter, cell death ...) */
    for (i = 0; i < this.texts.length; i++) {
        var t = this.texts[i];
        c.fillStyle = t.color;
        c.textAlign = 'left'; c.textBaseline = 'top';
        c.font = 'bold 12px "Segoe UI", Arial, sans-serif';
        c.fillText(t.text, this.cssW * t.fx, this.cssH * t.fy);
    }
    c.restore();
};

/* Clear the plot.  full = true also drops the stored trace data. */
Graph.prototype.clear = function (full) {
    if (full !== false) { this.segments = []; this.texts = []; }
    this.drawFrame();
};

Graph.prototype.putText = function (fx, fy, text, color, replace) {
    if (replace) {
        for (var i = 0; i < this.texts.length; i++) {
            if (this.texts[i].fx === fx && this.texts[i].fy === fy) {
                this.texts[i] = { fx: fx, fy: fy, text: text, color: color };
                this.redraw();
                return;
            }
        }
    }
    this.texts.push({ fx: fx, fy: fy, text: text, color: color });
    this.redraw();
};

/* Append and immediately draw one line segment. */
Graph.prototype.appendPoint = function (x0, y0, x1, y1, color, width) {
    this.segments.push({ x0: x0, y0: y0, x1: x1, y1: y1, c: color, w: width || this.lineWidth });
    var c = this.ctx;
    if (!isFinite(y0) || !isFinite(y1)) return;
    c.save();
    var r = this.plotRect();
    c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip();
    c.strokeStyle = color;
    c.lineWidth = width || this.lineWidth;
    c.beginPath();
    c.moveTo(this.px(x0), this.py(y0));
    c.lineTo(this.px(x1), this.py(y1));
    c.stroke();
    c.restore();
};

/* ---- auto scaling -------------------------------------------------
 * dataYRange()  : min/max of every stored segment
 * niceRange()   : pad by 8% and snap to a round step so the 6 grid
 *                 divisions land on readable numbers
 * autoScaleY()  : apply it; returns the new [min, max] or null
 * ------------------------------------------------------------------ */
/* Only samples inside the visible X window count, so zooming in time
   re-scales Y to what is actually on screen. */
Graph.prototype.dataYRange = function () {
    var lo = Infinity, hi = -Infinity, i, s;
    for (i = 0; i < this.segments.length; i++) {
        s = this.segments[i];
        if (s.x1 < this.minX || s.x0 > this.maxX) continue;
        if (isFinite(s.y0)) { if (s.y0 < lo) lo = s.y0; if (s.y0 > hi) hi = s.y0; }
        if (isFinite(s.y1)) { if (s.y1 < lo) lo = s.y1; if (s.y1 > hi) hi = s.y1; }
    }
    return (isFinite(lo) && isFinite(hi)) ? [lo, hi] : null;
};

function niceStep(x) {
    x = Math.abs(x);
    if (!(x > 0)) return 1;
    var e = Math.pow(10, Math.floor(Math.log(x) / Math.LN10));
    var f = x / e;
    var n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return n * e;
}

Graph.niceRange = function (lo, hi, divs) {
    if (!isFinite(lo) || !isFinite(hi)) return null;
    if (hi - lo < 1e-12) { var c = (hi + lo) / 2 || 0; lo = c - 0.5; hi = c + 0.5; }
    var pad = (hi - lo) * 0.08;
    lo -= pad; hi += pad;
    var step = niceStep((hi - lo) / (divs || 6));
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;
    /* kill -0 and floating-point dust such as 0.30000000000000004 */
    var dec = Math.max(0, -Math.floor(Math.log(step) / Math.LN10) + 2);
    lo = parseFloat(lo.toFixed(dec)) + 0;
    hi = parseFloat(hi.toFixed(dec)) + 0;
    return [lo, hi];
};

Graph.prototype.autoScaleY = function () {
    var d = this.dataYRange();
    if (!d) return null;
    var r = Graph.niceRange(d[0], d[1], this.yDiv);
    if (!r) return null;
    this.minY = r[0]; this.maxY = r[1];
    this.redraw();
    return r;
};

Graph.prototype.redraw = function () {
    this.drawFrame();
    var c = this.ctx, r = this.plotRect(), i, s, cur = null;
    c.save();
    c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip();
    for (i = 0; i < this.segments.length; i++) {
        s = this.segments[i];
        if (!isFinite(s.y0) || !isFinite(s.y1)) continue;
        if (cur === null || cur.c !== s.c || cur.w !== s.w) {
            if (cur !== null) c.stroke();
            c.strokeStyle = s.c; c.lineWidth = s.w;
            c.beginPath();
            cur = s;
        }
        c.moveTo(this.px(s.x0), this.py(s.y0));
        c.lineTo(this.px(s.x1), this.py(s.y1));
    }
    if (cur !== null) c.stroke();
    c.restore();
};

global.Graph = Graph;

})(window);
