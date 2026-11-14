#!/usr/bin/env python3
"""Import attributed DOCX bodies without replacing archives or inventing links.

Run from any directory: python3 /path/to/knowledge-base/tools/import_docx.py
Paragraph numbers are one-based .//w:p positions in word/document.xml,
including table paragraphs. The legacy prepared map is verified against the
original DOCX; numbered later summaries are parsed from their TOC and headings.
"""

from __future__ import annotations

import argparse
from collections import Counter
from difflib import SequenceMatcher
import hashlib
import json
import re
import unicodedata
import zipfile
from datetime import date, datetime
from pathlib import Path
from xml.etree import ElementTree as ET


KB = Path(__file__).resolve().parents[1]
WORKSPACE = KB.parents[1]
WORK = KB / "work/docx-import"
SOURCE = WORKSPACE / "信息层/天津大学宣怀学院-公众号文章汇总.docx"
ARCHIVES = WORKSPACE / "信息层/天津大学宣怀学院公众号资料库/文章"
OUTPUT = KB / "data/document-supplements.json"
REPORT = KB / "Word汇总核对报告.md"
NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


def normalize_title(title: str) -> str:
    """Ignore typography only; do not use approximate title matching."""
    return "".join(c for c in unicodedata.normalize("NFKC", title).casefold() if c.isalnum())


def write_if_changed(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_text(encoding="utf-8") == text:
        return
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(text, encoding="utf-8")
    temporary.replace(path)


def relative(path: Path) -> str:
    return path.relative_to(WORKSPACE).as_posix()


def existing_articles() -> list[dict]:
    articles = []
    for path in sorted(ARCHIVES.glob("*/文章.md")):
        text = path.read_text(encoding="utf-8")
        title_line = next((line for line in text.splitlines() if line.startswith("# ")), None)
        if title_line is None:
            raise ValueError(f"归档缺少标题：{path}")
        published = path.parent.name[:10]
        date.fromisoformat(published)
        articles.append({"title": title_line[2:].strip(), "published_at": published, "archive_path": relative(path)})
    return articles


def verified_sections() -> tuple[list[dict], str]:
    sections = json.loads((WORK / "sections.json").read_text(encoding="utf-8"))
    raw = SOURCE.read_bytes()
    with zipfile.ZipFile(SOURCE) as archive:
        document = ET.fromstring(archive.read("word/document.xml"))
    paragraphs = document.findall(".//w:p", NS)
    numbers = [section["number"] for section in sections]
    if len(numbers) != len(set(numbers)):
        raise ValueError("章节编号重复")
    for section in sections:
        metadata = section["metadata_line"]
        match = re.search(r"(\d{4})年(\d{1,2})月(\d{1,2})日", metadata)
        published = date(*map(int, match.groups())).isoformat() if match else None
        if published != section["published_at"]:
            raise ValueError(f"章节 {section['number']} 发布日期与元信息不符")
        for paragraph in section["paragraphs"]:
            number = paragraph["number"]
            if not 1 <= number <= len(paragraphs):
                raise ValueError(f"段落索引越界：{number}")
            original = "".join(node.text or "" for node in paragraphs[number - 1].findall(".//w:t", NS))
            if original != paragraph["text"]:
                raise ValueError(f"Word段落 {number} 与提取结果不同，请先重新提取 sections.json")
        if not section["paragraphs"] or section["paragraphs"][0]["text"] != metadata:
            raise ValueError(f"章节 {section['number']} 首段不是预期的元信息")
    return sections, hashlib.sha256(raw).hexdigest()


def render_entry(entry: dict) -> str:
    header = [
        f"# {entry['title']}", "",
        f"发布日期：{entry['published_at']}（来自 Word 汇总中的发布元信息）", "",
        f"状态：{entry['status']}。本文件保留 Word 原始正文；提炼结果见知识卡片目录，事实安排仍需核对。", "",
        f"来源文件：{entry['source_document']}", "",
        f"来源章节：第 {entry['document_section']} 节；ID：{entry['id']}", "",
        "原文链接：未提供；未恢复图片。段落编号是原 DOCX XML 中全部段落的一基序号（含表格内段落）。", "",
        "---", "",
    ]
    body = []
    for paragraph in entry["paragraphs"]:
        body.extend([f"<!-- document_paragraph: {paragraph['document_paragraph']} -->", paragraph["text"], ""])
    return "\n".join(header + body) + "\n"


def table_text(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", " ")


def render_report(result: dict, similarity: dict | None) -> str:
    counts = result["counts"]
    rows = [
        "# Word 汇总导入核对报告", "",
        f"来源：[天津大学宣怀学院-公众号文章汇总.docx](../天津大学宣怀学院-公众号文章汇总.docx)。SHA-256：`{result['source_sha256']}`。", "",
        f"文档共 {counts['document_sections']} 节；与现有 {counts['existing_archive_articles']} 篇本地原文按规范化标题和发布日期匹配，"
        f"新增 {counts['new_entries']} 篇正文、重复 {counts['duplicate_sections']} 篇、排除 {counts['excluded_sections']} 节；新增正文中已有 {counts['refined_entries']} 篇完成知识提炼。", "",
        "导入脚本只处理正文与来源定位，不覆盖既有原文，也不恢复或导入图片。知识提炼另行完成，见[新增文章精华](Word新增文章精华.md)。", "",
        "## 来源与限制", "",
        "- 新增正文的网络原文链接未提供，`source_url` 均为 `null`；查询引用应回到此 Word 文件、章节与段落，不能展示虚构公众号链接。",
        "- 发布日期来自每节首行元信息；正文内容保留原始文字，包括编辑署名、图片说明及页面残留文字。首行元信息不进入正文段落数组。",
        "- 段落定位采用 `word/document.xml` 中全部 `.//w:p` 的一基序号，包括表格内段落。导入时逐段与原 XML 的文本核对。",
        "- 图片、二维码、海报及图片内课表没有从 Word 恢复。出现“见下图”“扫码”等文字，不代表相应信息已经具备。",
        "- 正文的提炼状态由已构建的知识卡片决定。即使完成提炼，也不得自动视为最新、已核对或可用于推送的事实。", "",
        "## 新增正文目录", "",
        "| 文档节号 | 发布日期 | 标题 | 正文段落数 |", "| --- | --- | --- | ---: |",
    ]
    for entry in result["entries"]:
        link = Path(entry["archive_path"]).relative_to(KB.relative_to(WORKSPACE)).as_posix()
        rows.append(f"| {entry['number']:04d} | {entry['published_at']} | [{table_text(entry['title'])}]({link}) | {len(entry['paragraphs'])} |")
    rows.extend(["", "## 重复映射与复核", "", "标题使用 Unicode NFKC、大小写与标点/空白规范化后匹配，同时要求发布日期一致。匹配仅识别同一篇候选，正文复核结果另存如下。", "", "| 文档节号 | 标题 | 既有归档 | 复核状态 |", "| --- | --- | --- | --- |"])
    for duplicate in result["duplicates"]:
        matches = []
        for match in duplicate["matches"]:
            target = "../" + Path(match["archive_path"]).relative_to("信息层").as_posix()
            matches.append(f"[{match['published_at']} 归档](<{target}>)")
        review = duplicate["review"]
        rows.append(f"| {duplicate['number']:04d} | {table_text(duplicate['title'])} | {'；'.join(matches)} | {table_text(review['status'])} |")
    rows.append("")
    for duplicate in result["duplicates"]:
        rows.append(f"- 第 {duplicate['number']:04d} 节：{duplicate['review']['reason']}")
    if similarity is not None:
        rows.extend(["", "另对新增正文与既有归档做相似性筛查：" + similarity.get("method", "") + "。",
                     f"标记的高重合候选数量：{len(similarity.get('flagged', []))}。该检查不等同于语义去重或事实核验。"])
    rows.extend(["", "## 排除条目", ""])
    for item in result["excluded"]:
        rows.append(f"- 第 {item['number']:04d} 节《{item['title']}》：{item['reason']}")
    rows.extend(["", "## 重跑", "", "运行 `python3 tools/import_docx.py`。脚本读取当前归档与预提取章节，验证原 Word 后，生成 `data/document-supplements.json`、`document-supplements/*.md` 和本报告；不修改源 Word、已有文章、知识卡片或事实库。", ""])
    return "\n".join(rows)


def import_legacy() -> None:
    sections, digest = verified_sections()
    existing = existing_articles()
    index: dict[tuple[str, str], list[dict]] = {}
    for article in existing:
        index.setdefault((normalize_title(article["title"]), article["published_at"]), []).append(article)
    review_path = WORK / "duplicate-review.json"
    reviews = {row["number"]: row for row in json.loads(review_path.read_text(encoding="utf-8"))} if review_path.exists() else {}
    source = relative(SOURCE)
    cards_path = KB / 'data/articles.json'
    cards = json.loads(cards_path.read_text(encoding='utf-8')) if cards_path.exists() else []
    refined_ids = {c['id'] for c in cards if c.get('source_kind') == 'docx' and c.get('source_document_sha256') == digest}
    result = {"source_document": source, "source_sha256": digest, "entries": [], "duplicates": [], "excluded": [], "counts": {}}
    for section in sections:
        number = section["number"]
        if not section["published_at"]:
            result["excluded"].append({"number": number, "title": section["title"], "reason": "无独立发布日期；内容为账号页、视频号动态及文章列表摘录，不作为一篇文章导入。"})
            continue
        matches = index.get((normalize_title(section["title"]), section["published_at"]), [])
        if matches:
            result["duplicates"].append({"number": number, "title": section["title"], "published_at": section["published_at"], "matches": matches,
                                         "review": reviews.get(number, {"status": "matched_pending_review", "reason": "标题和日期已匹配，正文待复核。"})})
            continue
        entry = {"id": f"docx-summary-{number:04d}", "number": number, "title": section["title"], "published_at": section["published_at"],
                 "source_url": None, "archive_path": relative(KB / "document-supplements" / f"docx-summary-{number:04d}.md"),
                 "source_document": source, "document_section": number, "status": "待提炼",
                 "paragraphs": [{"document_paragraph": paragraph["number"], "text": paragraph["text"]} for paragraph in section["paragraphs"][1:]]}
        entry['status'] = '已提炼' if entry['id'] in refined_ids else '待提炼'
        result["entries"].append(entry)
    result["counts"] = {"document_sections": len(sections), "existing_archive_articles": len(existing), "new_entries": len(result["entries"]),
                        "duplicate_sections": len(result["duplicates"]), "excluded_sections": len(result["excluded"]),
                        "imported_paragraphs": sum(len(entry["paragraphs"]) for entry in result["entries"]),
                        "same_article_reviews": sum(duplicate["review"]["status"] == "same_article" for duplicate in result["duplicates"]),
                        "missing_source_urls": len(result["entries"]),
                        "refined_entries": sum(entry['status'] == '已提炼' for entry in result['entries'])}
    similarity_path = WORK / "body-similarity-review.json"
    similarity = json.loads(similarity_path.read_text(encoding="utf-8")) if similarity_path.exists() else None
    # Validate and render everything before committing generated outputs.
    rendered = [(WORKSPACE / entry["archive_path"], render_entry(entry)) for entry in result["entries"]]
    report = render_report(result, similarity)
    for path, text in rendered:
        write_if_changed(path, text)
    write_if_changed(OUTPUT, json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    write_if_changed(REPORT, report)
    print(json.dumps(result["counts"], ensure_ascii=False))




# Each source keeps its own output. The legacy source and IDs remain unchanged.
SIGNATURE = re.compile(r"^(?:(?:文案|文字|图文|编辑|校审|终审|初审|审核|审校|排版|摄影|图片|供稿|责编|来源)\s*(?:[&＆/、＋+·]|及)?\s*)+[：:|｜]\s*.+$")
TOC_DATE = re.compile(r"^\d{4}-\d{1,2}-\d{1,2} \d{2}:\d{2}$")
RULES = {
    'empty': '空段落（仅移出正文，原始段号仍保存）',
    'ai_summary_marker': '独立 AI摘要 标签移入 platform_ai_summary 字段；无明确摘要边界时不移动后续段落',
    'signature': '完整署名/来源行移入 credits 元数据',
    'account_label': '独立段落 天津大学宣怀学院',
    'down_arrows': '独立段落 ↓↓↓',
    'navigation_marker': '独立 上一篇/下一篇 标签及紧邻的目录导航标签',
    'navigation_target': '上一篇/下一篇 后紧邻的标题（须在本文件目录或既有目录中精确匹配）；或分隔符 ·',
    'ui_counter': '独立 阅读数字/留言数字 计数',
    'ui_action': '明确的独立微信界面操作标签',
    'video_ui': '播放视频、紧邻的 时长 标签和播放时长（不删除直播时间）',
    'tail_ui': '阅读计数之后纯数字点赞计数、列表化操作按钮和孤立标点',
}


def read_paragraphs(source):
    with zipfile.ZipFile(source) as package:
        xml = ET.fromstring(package.read('word/document.xml'))
        media = [name for name in package.namelist() if name.startswith('word/media/')]
    paragraphs = [{'document_paragraph': i, 'text': ''.join(n.text or '' for n in p.findall('.//w:t', NS))}
                  for i, p in enumerate(xml.findall('.//w:p', NS), 1)]
    return paragraphs, media


def parse_summary(source):
    paragraphs, media = read_paragraphs(source)
    headings = [(i, re.fullmatch(r'(\d{4})\. (.+)', p['text'])) for i, p in enumerate(paragraphs)]
    headings = [(i, m) for i, m in headings if m]
    if not headings:
        raise ValueError(f'{source.name}: 无文章标题边界')
    toc = []
    for i in range(headings[0][0] - 3):
        row = paragraphs[i:i + 4]
        if re.fullmatch(r'\d{4}', row[0]['text']) and (TOC_DATE.fullmatch(row[2]['text']) or row[2]['text'] == '—') and row[3]['text'].isdigit():
            toc.append({'number': int(row[0]['text']), 'title': row[1]['text'],
                        'published_at_minute': (datetime.strptime(row[2]['text'], '%Y-%m-%d %H:%M').isoformat(timespec='minutes') + '+08:00') if row[2]['text'] != '—' else None,
                        'declared_characters': int(row[3]['text']), 'toc_paragraph': row[0]['document_paragraph']})
    if [r['number'] for r in toc] != [int(m[1]) for _, m in headings] or len({r['number'] for r in toc}) != len(toc):
        raise ValueError('目录与正文编号未一一对应')
    sections = []
    for n, (start, m) in enumerate(headings):
        row = toc[n]
        if row['title'] != m[2]:
            raise ValueError(f"目录标题与正文不一致: {row['number']}")
        metadata = paragraphs[start + 1]
        match = re.search(r'(\d{4})年(\d{1,2})月(\d{1,2})日 (\d{2}):(\d{2})', metadata['text'])
        if row['published_at_minute'] and (not match or datetime(*map(int, match.groups())).isoformat(timespec='minutes') + '+08:00' != row['published_at_minute']):
            raise ValueError(f"发布时间元信息与目录不符: {row['number']}")
        end = headings[n + 1][0] if n + 1 < len(headings) else len(paragraphs)
        body = paragraphs[start + 2:end]
        sections.append({**row, 'published_at': row['published_at_minute'][:10] if row['published_at_minute'] else None,
                         'heading_paragraph': paragraphs[start]['document_paragraph'], 'metadata': metadata,
                         'paragraphs': body, 'raw_characters': sum(len(p['text']) for p in body),
                         'list_marker_adjusted_characters': sum(len(re.sub(r'^(\d+)\. ', r'\1', p['text'])) for p in body)})
    cover = next((p for p in paragraphs[:headings[0][0]] if re.search(r'共\s*\d+\s*篇', p['text'])), None)
    return sections, {'cover': cover, 'cover_count': int(re.search(r'共\s*(\d+)', cover['text'])[1]) if cover else None,
                      'paragraphs': paragraphs, 'media': media}


def clean_paragraphs(paragraphs, known_titles):
    kept, removed, credits, markers = [], [], [], []
    nav_pending, tail, video_stage = False, False, 0
    for p in paragraphs:
        t = p['text'].strip()
        rule = None
        if not t:
            rule = 'empty'
        elif t == 'AI摘要':
            rule = 'ai_summary_marker'
            markers.append(p)
        elif SIGNATURE.fullmatch(t):
            rule = 'signature'
            credits.append(p)
        elif t == '天津大学宣怀学院':
            rule = 'account_label'
        elif t == '↓↓↓':
            rule = 'down_arrows'
        elif t in ('上一篇', '下一篇') or (t.endswith(' · 目录') and any(x['text'].strip() in ('上一篇', '下一篇') for x in paragraphs)):
            rule = 'navigation_marker'
            nav_pending = t in ('上一篇', '下一篇')
        elif nav_pending and (t == '·' or t in known_titles):
            rule = 'navigation_target'
            nav_pending = t == '·'
        elif re.fullmatch(r'(?:阅读|留言)\s*[0-9万+.]+', t):
            rule = 'ui_counter'
            tail = True
        elif t in ('搜一搜', '复制', '在看', '赞', '分享', '收藏', '阅读原文'):
            rule = 'ui_action'
        elif t == '播放视频':
            rule, video_stage = 'video_ui', 1
        elif video_stage == 1 and t in ('，时长', '时长'):
            rule, video_stage = 'video_ui', 2
        elif video_stage == 2 and re.fullmatch(r'\d{1,2}:\d{2}(?::\d{2})?', t):
            rule, video_stage = 'video_ui', 0
        elif tail and (re.fullmatch(r'(?:\d+\. )?(?:\d+|复制|在看|赞|分享|收藏)', t) or t in ('，', '·', '■ ￼')):
            rule = 'tail_ui'
        if rule:
            removed.append({**p, 'rule': rule})
        else:
            kept.append(p)
            nav_pending, video_stage = False, 0
    summary = {'attribution': '公众号平台自动生成，非作者原文', 'paragraphs': [], 'markers': markers,
               'status': '仅发现界面标签，摘要内容边界不明；未将后续正文擅自视作平台摘要' if markers else '未发现AI摘要标签'}
    return kept, removed, credits, summary


def import_summary(source, previous):
    match = re.fullmatch(r'天津大学宣怀学院-公众号文章汇总(\d+)\.docx', source.name)
    if not match:
        raise ValueError('新增汇总文件名必须为 天津大学宣怀学院-公众号文章汇总N.docx')
    tag = 'summary' + match[1]
    prefix = 'docx-' + tag
    output = KB / f'data/document-supplements-{tag}.json'
    work = KB / f'work/docx-import-{tag}'
    sections, raw = parse_summary(source)
    sha = hashlib.sha256(source.read_bytes()).hexdigest()
    known = existing_articles() + [e for result in previous for e in result['entries']]
    known_titles = {s['title'] for s in sections} | {s['title'] for s in known}
    index = {}
    for item in known:
        index.setdefault((normalize_title(item['title']), item['published_at'][:10]), []).append(item)
    cards = json.loads((KB / 'data/articles.json').read_text())
    refined = {c['id'] for c in cards if c.get('source_document_sha256') == sha}
    result = {'source_document': relative(source), 'source_sha256': sha, 'source_id': tag,
              'entries': [], 'duplicates': [], 'suspected_duplicates': [], 'excluded': [],
              'sections': [], 'rule_definitions': RULES, 'counts': {}, 'schedules': []}
    counts = Counter({key: 0 for key in RULES})
    for section in sections:
        number = section['number']
        clean, removed, credits, ai = clean_paragraphs(section['paragraphs'], known_titles)
        counts.update(r['rule'] for r in removed)
        raw_path = work / 'raw' / f'{number:04d}.json'
        write_if_changed(raw_path, json.dumps(section, ensure_ascii=False, indent=2) + '\n')
        audit = {k: v for k, v in section.items() if k != 'paragraphs'}
        audit.update(raw_path=relative(raw_path), clean_characters=sum(len(p['text']) for p in clean),
                     credits=credits, platform_ai_summary=ai, removed=removed)
        result['sections'].append(audit)
        if not section['published_at']:
            result['excluded'].append({'number': number, 'title': section['title'], 'raw_path': relative(raw_path), 'reason': '无独立发布日期，账号页、视频号及推荐列表摘录，不是文章'})
            continue
        key = (normalize_title(section['title']), section['published_at'])
        matches = index.get(key, [])
        reference = {k: section[k] for k in ('number', 'title', 'published_at', 'published_at_minute')}
        if matches:
            matches = [{k: m[k] for k in ('id', 'title', 'published_at', 'archive_path', 'source_document') if k in m} for m in matches]
            result['duplicates'].append({**reference, 'matches': matches, 'preferred_archive_path': matches[0]['archive_path'],
                                         'metadata_source': relative(source), 'document_section': number})
        else:
            aid = f'{prefix}-{number:04d}'
            entry = {**reference, 'id': aid, 'source_url': None, 'source_document': relative(source),
                     'source_document_sha256': sha, 'document_section': number,
                     'archive_path': relative(KB / 'document-supplements' / f'{aid}.md'),
                     'status': '已提炼' if aid in refined else '待提炼', 'paragraphs': clean,
                     'raw_path': relative(raw_path), 'credits': credits, 'platform_ai_summary': ai}
            result['entries'].append(entry)
            # Exact-title/different-date is also a review candidate, never an automatic merge.
            for candidate in known:
                normalized = normalize_title(candidate['title'])
                similarity = SequenceMatcher(None, key[0], normalized).ratio()
                same_day = section['published_at'] == candidate['published_at'][:10]
                if normalized == key[0] or (similarity >= .78 and same_day) or similarity >= .92:
                    result['suspected_duplicates'].append({**reference, 'id': aid,
                        'candidate_title': candidate['title'], 'candidate_date': candidate['published_at'],
                        'candidate_path': candidate['archive_path'], 'similarity': round(similarity, 4),
                        'status': '疑似重复，保留独立正文，待人工判断'})
            # Also compare subsequent sections within this source; do not lose provenance.
            known.append(entry)
            index.setdefault(key, []).append(entry)
            write_if_changed(WORKSPACE / entry['archive_path'], render_entry(entry).replace('本文件保留 Word 原始正文', '本文件保留保守清洗后的 Word 正文（清洗前原文见 raw_path 元数据）'))
        if '宣怀课表' in section['title']:
            archived = [a for a in existing_articles() if (normalize_title(a['title']), a['published_at']) == key]
            images = []
            for a in archived:
                folder = (WORKSPACE / a['archive_path']).parent
                images += [relative(p) for p in folder.rglob('*') if p.suffix.lower() in ('.png', '.jpg', '.jpeg', '.webp')]
            result['schedules'].append({**reference, 'has_archived_images': bool(images), 'image_paths': images,
                'note': '已有配图存档；本次仅核对文件存在，未重新读图' if images else '缺本期课表配图；DOCX导语不能恢复课程、时间、地点'})
    result['counts'] = {'document_sections': len(sections), 'cover_count': raw['cover_count'],
                        'toc_entries': len(sections), 'dated_articles': sum(bool(s['published_at']) for s in sections), 'new_entries': len(result['entries']),
                        'duplicate_sections': len(result['duplicates']),
                        'suspected_duplicate_entries': len({r['number'] for r in result['suspected_duplicates']}),
                        'suspected_duplicate_pairs': len(result['suspected_duplicates']), 'excluded_sections': len(result['excluded']),
                        'declared_characters': sum(s['declared_characters'] for s in sections),
                        'dated_declared_characters': sum(s['declared_characters'] for s in sections if s['published_at']),
                        'dated_raw_count_mismatches': sum(s['declared_characters'] != s['raw_characters'] for s in sections if s['published_at']),
                        'raw_characters': sum(s['raw_characters'] for s in sections),
                        'raw_count_mismatches': sum(s['declared_characters'] != s['raw_characters'] for s in sections),
                        'adjusted_count_mismatches': sum(s['declared_characters'] != s['list_marker_adjusted_characters'] for s in sections),
                        'rule_hits': dict(counts), 'schedule_issues': len(result['schedules']),
                        'missing_schedule_images': sum(not s['has_archived_images'] for s in result['schedules'])}
    write_if_changed(work / 'raw-document.json', json.dumps({'source_document': relative(source), 'source_sha256': sha, **raw}, ensure_ascii=False, indent=2) + '\n')
    write_if_changed(output, json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    write_if_changed(KB / f'汇总{match[1]}清洗报告.md', render_cleaning_report(result))
    print(json.dumps(result['counts'], ensure_ascii=False))
    return result


def render_cleaning_report(result):
    c = result['counts']
    ordinal = result['source_id'].removeprefix('summary')
    lines = [f'# 汇总{ordinal}清洗报告', '', f"来源：{result['source_document']}；SHA-256：`{result['source_sha256']}`。", '',
        '## 篇数和去重', '',
        f"封面 {c['cover_count']} 篇；目录 {c['toc_entries']} 条；正文 {c['document_sections']} 节，编号一一对应；有日期的文章 {c['dated_articles']} 篇。新增 {c['new_entries']} 篇；精确重复 {c['duplicate_sections']} 篇；疑似重复 {c['suspected_duplicate_entries']} 篇（{c['suspected_duplicate_pairs']} 对，包含在新增中，不自动合并）；排除文章 {c['excluded_sections']} 篇。", '',
        ('297与296的差异：第0055项《天津大学创新创业学院》为账号页、视频号及推荐文章列表摘录，目录第233—236段的发布时间是“—”，无独立发布日期，应排除。因此297个编号=296篇有日期文章+1项账号页。第0297项营前宣讲会有目录也有正文，不是缺失篇目。' if ordinal == '2' else '封面、目录和正文篇数见上，排除项逐条列在下文。'), '',
        '规范化标题采用NFKC、小写、仅保留字母数字，必须同时同发布日期才判定重复；归档优先，其次第一份汇总。相近标题按同日相似度≥0.78或跨日≥0.92筛查；同标题异日期也列疑似。阈值仅用于人工复核线索，不代表语义去重结论。重复映射携带分钟发布时间补充元数据，构建写入已有卡片的 published_at_minute 与 publication_metadata，不覆盖正文、图片、链接或原发布日期。', '',
        '## 清洗和可追溯性', '',
        f'清洗前全部XML文字、空段和段号存于 work/docx-import-summary{ordinal}/raw-document.json，每篇另存 raw/NNNN.json。新增清洗正文在 document-supplements/docx-summary{ordinal}-*.md；data/document-supplements-summary{ordinal}.json 的 sections 保存逐条删除日志、署名、平台摘要字段、字数及目录/正文位置。重复篇也有原文和完整清洗日志。', '',
        '全文没有图片，也没有公众号文章原文URL；正文出现的报名/官网链接不等于原文链接。删除以完整独立段及明确上下文为准，没把重复出现的课程介绍或系列导语当作垃圾。署名含原段号保留在 credits；首行作者等保留在 metadata。', '',
        f'{c["rule_hits"]["ai_summary_marker"]}处“AI摘要”均为独立标签；没有能够确定归属与结束边界的摘要文字。platform_ai_summary 标明“公众号平台自动生成，非作者原文”，markers保留标签，paragraphs为空，status写明边界不明。后续可能是作者导语的文字保留，不冒充已成功提取平台摘要。', '',
        '| 规则 | 命中段数 | 处理 |', '| --- | ---: | --- |']
    lines += [f'| {key} | {c["rule_hits"][key]} | {value} |' for key, value in RULES.items()]
    lines += ['', '## 字数逐篇核对', '',
        f"目录合计 {c['declared_characters']} 字符（296篇有日期文章合计 {c['dated_declared_characters']}，其余为账号页）；XML正文实计 {c['raw_characters']} 字符。实计口径：去掉文章标题、发布元信息、目录及段落分隔符，逐段计算Python Unicode字符数（保留空格、标点、界面残留及署名）。共有 {c['raw_count_mismatches']} 项不等（其中文章 {c['dated_raw_count_mismatches']} 篇），逐篇列下。", '',
        f"多数差异可由数字列表的“. ”两个字符解释：仅用于诊断去除段首数字后的“. ”，仍有 {c['adjusted_count_mismatches']} 篇不等。此诊断不改正文、不称为恢复原始计数算法；缺字原因无法仅凭DOCX确证。完整{c['document_sections']}项计数见JSON sections。", '',
        '| 序号 | 日期 | 标题 | 目录 | 实计 | 差额 | 列表标记诊断计数 |', '| --- | --- | --- | ---: | ---: | ---: | ---: |']
    for s in result['sections']:
        if s['declared_characters'] != s['raw_characters']:
            lines.append(f"| {s['number']:04d} | {s['published_at']} | {table_text(s['title'])} | {s['declared_characters']} | {s['raw_characters']} | {s['raw_characters'] - s['declared_characters']:+d} | {s['list_marker_adjusted_characters']} |")
    lines += ['', '## 精确重复映射', '', '| 汇总2序号 | 标题 | 首选原记录 | 发布时间补充 |', '| --- | --- | --- | --- |']
    for d in result['duplicates']:
        lines.append(f"| {d['number']:04d} | {table_text(d['title'])} | {table_text(d['preferred_archive_path'])} | {d['published_at_minute']} |")
    lines += ['', '## 疑似重复（未合并）', '', '| 序号 | 标题 | 候选日期 / 标题 | 相似度 |', '| --- | --- | --- | ---: |']
    for d in result['suspected_duplicates']:
        lines.append(f"| {d['number']:04d} | {table_text(d['title'])} | {d['candidate_date']} / {table_text(d['candidate_title'])} | {d['similarity']} |")
    lines += ['', '## 宣怀课表配图缺口', '', '按同标题同日期匹配归档文件，未从导语推测课表。图片存在性不代表本次已读图。', '', '| 序号 | 日期 | 标题 | 配图存档 |', '| --- | --- | --- | --- |']
    for s in result['schedules']:
        lines.append(f"| {s['number']:04d} | {s['published_at']} | {table_text(s['title'])} | {s['note']} |")
    lines += ['', '## 排除项', '', *[f"- {e['number']:04d}《{e['title']}》：{e['reason']}；清洗前原文：{e['raw_path']}" for e in result['excluded']], '', '## 第二阶段进度', '', '见 work/summary2-progress.json（构建维护）及 data/pending-ingestion.json。尚未编制卡片的正文仍可通过 query.py --documents 检索。事实候选始终 publishable: false，人工核对记录不改动。', '']
    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, help='只处理指定汇总；默认依序处理全部汇总文件')
    args = parser.parse_args()
    legacy = json.loads(OUTPUT.read_text()) if OUTPUT.exists() else None
    if not args.source or args.source.resolve() == SOURCE.resolve():
        import_legacy()
        legacy = json.loads(OUTPUT.read_text())
    previous = [legacy] if legacy else []
    candidates = sorted(SOURCE.parent.glob('天津大学宣怀学院-公众号文章汇总[0-9]*.docx'),
                        key=lambda p: int(re.search(r'汇总(\d+)\.docx$', p.name)[1]))
    if args.source and args.source.resolve() == SOURCE.resolve():
        return
    if args.source:
        target = args.source.resolve()
        if target not in [p.resolve() for p in candidates]:
            candidates.append(target)
    for path in candidates:
        if args.source and path.resolve() != args.source.resolve():
            suffix = re.search(r'汇总(\d+)\.docx$', path.name)[1]
            prior_path = KB / f'data/document-supplements-summary{suffix}.json'
            if prior_path.exists():
                prior = json.loads(prior_path.read_text())
                if hashlib.sha256(path.read_bytes()).hexdigest() != prior['source_sha256']:
                    raise ValueError(f'先前汇总已变更，需重跑全部导入: {path.name}')
                previous.append(prior)
            continue
        result = import_summary(path, previous)
        previous.append(result)
        if args.source:
            break



if __name__ == '__main__':
    main()
