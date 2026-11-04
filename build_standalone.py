# -*- coding: utf-8 -*-
"""Inline params.js / model.js / graph.js / app.js into index.html and write
heart_hh_standalone.html -- a single file that runs by double-clicking it
(no web server, no internet).

    python build_standalone.py
"""
import io
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'index.html')
OUT = os.path.join(HERE, 'heart_hh_standalone.html')


def read(path):
    with io.open(path, 'r', encoding='utf-8') as f:
        return f.read()


html = read(SRC)


def inline(match):
    src = match.group(1)
    code = read(os.path.join(HERE, src.replace('/', os.sep)))
    # </script> inside a string literal would close the tag early
    code = code.replace('</script>', '<\\/script>')
    return '<script>\n/* ==== %s ==== */\n%s\n</script>' % (src, code)


html = re.sub(r'<script src="([^"]+)"></script>', inline, html)

with io.open(OUT, 'w', encoding='utf-8') as f:
    f.write(html)

print('wrote %s (%.0f KB)' % (OUT, os.path.getsize(OUT) / 1024.0))
