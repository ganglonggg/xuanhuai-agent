#!/usr/bin/env python3
"""Apply reviewed image removals; retain a recovery copy in the system Trash."""
import argparse
import hashlib
import json
import os
import re
import shutil
from collections import Counter
from pathlib import Path
from urllib.parse import unquote
from uuid import uuid4

BASE = Path(__file__).resolve().parents[1]
ROOT = BASE.parents[1]
ARCHIVE = ROOT / '信息层/天津大学宣怀学院公众号资料库'
REVIEW = BASE / 'work/image-review'
SUFFIXES = {'.png', '.jpg', '.jpeg', '.gif', '.webp'}
IMAGE_RE = re.compile(r'!\[[^\]]*\]\(([^)]+)\)')


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def serialized(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + '\n'


def plan():
    manifest = read(REVIEW / 'manifest.json')
    decisions = [d for n in range(1, 4) for d in read(REVIEW / f'decisions-{n}.json')]
    ids = [d['id'] for d in decisions]
    if len(ids) != len(set(ids)) or set(ids) != {i['id'] for i in manifest}:
        raise ValueError('图片决策有遗漏、重复或未知ID')
    decision_map = {d['id']: d for d in decisions}
    item_map = {item['id']: item for item in manifest}
    rows = []
    for item in manifest:
        d = decision_map[item['id']]
        if d['action'] not in {'keep', 'delete'} or not d.get('reason'):
            raise ValueError('非法筛选决策')
        if d.get('replacement_id'):
            replacement = item_map[d['replacement_id']]
            if d['action'] != 'delete' or decision_map[d['replacement_id']]['action'] != 'keep':
                raise ValueError('替代图片必须是保留项')
            d = {**d, 'replacement_path': replacement['paths'][0], 'replacement_width': replacement['width'], 'replacement_height': replacement['height']}
        for relative in item['paths']:
            p = ROOT / relative
            if not p.exists():
                rows.append({**d, 'original_review_action': d['action'], 'action': 'delete', 'replacement_id': None, 'replacement_path': None, 'reason': '检查后文件已从原路径移除，本轮尊重该状态并清理失效引用。原判定：' + d['reason'], 'content_kind': '清理前已移除', 'already_missing': True, 'path': relative, 'sha256': item['sha256'], 'bytes': 0})
                continue
            if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest() != item['sha256']:
                raise ValueError(f'图片在检查后发生变化或不存在，停止清理：{relative}')
            rows.append({**d, 'path': relative, 'sha256': item['sha256'], 'bytes': p.stat().st_size})
    return rows


def apply(rows):
    deleted = {str((ROOT / row['path']).resolve()): row for row in rows if row['action'] == 'delete'}
    trash = Path.home() / '.Trash' / ('宣怀无用图片-2026-11-15-' + uuid4().hex[:8])
    trash.mkdir(parents=True)
    changed = []

    def save(path, text):
        original = path.read_text(encoding='utf-8')
        if original != text:
            backup = trash / '清理前文本' / path.relative_to(ROOT)
            backup.parent.mkdir(parents=True, exist_ok=True)
            backup.write_text(original, encoding='utf-8')
            # Protect edits that happened while this specific change was prepared.
            if path.read_text(encoding='utf-8') != original:
                raise ValueError(f'文件并发变更，停止：{path}')
            path.write_text(text, encoding='utf-8')
            changed.append(str(path.relative_to(ROOT)))

    for path in ARCHIVE.glob('文章/*/文章.md'):
        body = path.read_text(encoding='utf-8')

        def replace(match):
            target = unquote(match.group(1).strip('<>'))
            if target.startswith(('http:', 'https:', 'data:')):
                return match.group(0)
            decision = deleted.get(str((path.parent / target).resolve()))
            if not decision:
                return match.group(0)
            if decision.get('replacement_path'):
                relative = os.path.relpath(ROOT / decision['replacement_path'], path.parent)
                return f'![知识配图（共享高清图）](<{relative}>)'
            if decision.get('replacement_text'):
                return '> 配图文字转录（AI识别，未人工核对）：' + decision['replacement_text'].replace('\n', ' ')
            return ''

        cleaned = IMAGE_RE.sub(replace, body)
        if cleaned != body:
            save(path, re.sub(r'\n{3,}', '\n\n', cleaned))

    for path in ARCHIVE.glob('文章/**/图片来源.json'):
        assets = read(path)
        if not isinstance(assets, list):
            raise ValueError(f'未知图片来源格式：{path}')
        images_dir = path.parent if path.parent.name == 'images' else path.parent / 'images'
        retained = []
        for asset in assets:
            decision = deleted.get(str((images_dir / asset.get('file', '')).resolve()))
            if not decision:
                retained.append(asset)
            elif decision.get('replacement_path'):
                retained.append({**asset, 'original_file': asset['file'], 'file': os.path.relpath(ROOT / decision['replacement_path'], images_dir), 'width': decision['replacement_width'], 'height': decision['replacement_height'], 'storage_note': '相同内容的共享高清图，原始来源URL保留'})
        if retained != assets:
            save(path, serialized(retained))

    # Keep an audit trail for image interpretations removed from active cards.
    for path in (BASE / 'work').glob('batch-*-result.json'):
        data = read(path)
        edited = False
        for card in data['cards']:
            removed = []
            for note in card['image_notes']:
                decision = deleted.get(str((ROOT / note['path']).resolve()))
                if decision and decision.get('replacement_path'):
                    note['original_path'] = note['path']
                    note['path'] = decision['replacement_path']
                    edited = True
                elif decision:
                    removed.append(note)
            if removed:
                card['image_notes'] = [n for n in card['image_notes'] if n not in removed]
                card.setdefault('removed_image_notes', []).extend({**n, 'removal_reason': deleted[str((ROOT / n['path']).resolve())]['reason']} for n in removed)
                edited = True
            article_dir = Path(card['archive_path']).parent
            existing_paths = {note['path'] for note in card['image_notes']}
            for row in rows:
                if Path(row['path']).parents[1] != article_dir:
                    continue
                image_path = row['path'] if row['action'] == 'keep' else row.get('replacement_path')
                if image_path and image_path not in existing_paths:
                    card['image_notes'].append({'path': image_path, 'status': 'inspected', 'note': row['reason'], 'content_kind': row['content_kind']})
                    existing_paths.add(image_path)
                    edited = True
                if row.get('replacement_text'):
                    card.setdefault('image_text_notes', []).append({'original_image_path': row['path'], 'sha256': row['sha256'], 'text': row['replacement_text'], 'status': 'AI识别，未人工核对'})
                    edited = True
        if edited:
            save(path, serialized(data))

    for absolute, row in deleted.items():
        if row.get('already_missing'):
            continue
        p = Path(absolute)
        destination = trash / '图片' / row['path']
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(p), str(destination))

    missing = []
    for path in ARCHIVE.glob('文章/*/文章.md'):
        for url in IMAGE_RE.findall(path.read_text(encoding='utf-8')):
            if not url.startswith(('https:', 'http:', 'data:')) and not (path.parent / unquote(url.strip('<>'))).is_file():
                missing.append(str(path) + ':' + url)
    if missing:
        raise ValueError(f'发现损坏图片引用：{missing}')

    image_count = sum(p.suffix.lower() in SUFFIXES for p in ARCHIVE.glob('文章/*/images/*'))
    article_count = len(list(ARCHIVE.glob('文章/*/文章.md')))
    stats_path = ARCHIVE / '归档统计.json'
    stats = read(stats_path)
    stats.update(articles=article_count, images=image_count, broken_local_image_links=0, image_cleanup_date='2026-11-15')
    save(stats_path, serialized(stats))
    status_path = ARCHIVE / '采集状态.json'
    status = read(status_path)
    status.update(archived_articles=article_count, archived_images=image_count, image_cleanup_date='2026-11-15')
    save(status_path, serialized(status))
    catalog_path = ARCHIVE / '目录.md'
    catalog = catalog_path.read_text(encoding='utf-8')
    catalog = re.sub(r'已归档 \*\*\d+ 篇文章、\d+ 个图片文件\*\*', f'已归档 **{article_count} 篇文章、{image_count} 个图片文件**', catalog)
    catalog = catalog.replace('保留原文文字与图片顺序，不改写原文。', '保留原文文字；按知识用途移除了纯装饰、引流和无额外信息照片，保留有信息价值的图片。')
    catalog += '\n图片清理记录：[清理报告](../knowledge-base/图片清理报告.md)。已移除的缓存图片及修改前文本可从系统废纸篓恢复；原文 HTML 仍保留来源快照。\n'
    save(catalog_path, catalog)

    for path in ARCHIVE.glob('合集/*/采集结果.json'):
        results = read(path)
        for row in results:
            if row.get('status') == 'ok':
                md = ARCHIVE / row['file']
                row['images'] = sum(p.suffix.lower() in SUFFIXES for p in (md.parent / 'images').glob('*'))
                row['image_cleanup_applied'] = True
        save(path, serialized(results))
        directory = path.parent / '目录.md'
        if directory.exists():
            content = directory.read_text(encoding='utf-8')
            for row in results:
                if row.get('status') == 'ok':
                    content = re.sub(r'(?m)^(.*\]\(\.\./\.\./' + re.escape(row['file']) + r'\)\s*\|)\s*\d+\s*\|$', lambda m: m.group(1) + f' {row["images"]} |', content)
            save(directory, content)

    already_missing = sum(bool(r.get('already_missing')) for r in rows)
    removed_count = len(deleted) - already_missing
    report = {'as_of': '2026-11-15', 'policy': '用户明确：人物照、课堂合影、参访现场照如无额外信息也删，只保留能提供知识或事实的图。', 'reviewed_files': len(rows), 'reviewed_unique_images': len({r['id'] for r in rows}), 'removed_files': removed_count, 'already_missing_files': already_missing, 'retained_files': image_count, 'removed_bytes': sum(r['bytes'] for r in rows if r['action'] == 'delete'), 'broken_local_image_links': 0, 'recovery_directory': str(trash), 'changed_files': changed, 'decisions': rows}
    (BASE / 'data/image-cleanup-report.json').write_text(serialized(report), encoding='utf-8')
    lines = ['# 图片清理报告', '', report['policy'], '', f'- 检查快照：{len(rows)} 个文件，按哈希去重后 {report["reviewed_unique_images"]} 张。', f'- 本轮移除：{removed_count} 个文件；另有 {already_missing} 个在执行前已被移走；当前保留：{image_count} 个文件。', '- 本地正文图片链接：无损坏。', f'- 本轮移除文件的恢复位置：`{trash}`。', '- 执行前已缺失的文件不在本轮废纸篓备份中，未擅自恢复。', '- 原文 HTML 保留为来源快照；已清理本地缓存图、Markdown 图片引用和图片来源清单。', '', '## 分类', '']
    counts = Counter((r['action'], r['content_kind']) for r in rows)
    for (action, kind), count in sorted(counts.items()):
        lines.append(f'- {"保留" if action == "keep" else "移除"} / {kind}：{count} 个。')
    lines += ['', '逐文件理由与哈希见 [机器可读报告](data/image-cleanup-report.json)。']
    (BASE / '图片清理报告.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    for sheet in REVIEW.glob('batch-*-sheet-*.jpg'):
        (trash / '检查缩略图').mkdir(exist_ok=True)
        shutil.move(str(sheet), str(trash / '检查缩略图' / sheet.name))
    print(serialized({k: v for k, v in report.items() if k not in {'decisions', 'changed_files'}}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    rows = plan()
    if args.apply:
        apply(rows)
    else:
        print(serialized({'files': len(rows), 'actions': dict(Counter(r['action'] for r in rows)), 'kinds': dict(Counter(r['content_kind'] for r in rows))}))
