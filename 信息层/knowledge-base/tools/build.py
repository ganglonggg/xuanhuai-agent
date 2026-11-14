#!/usr/bin/env python3
"""Validate editorial cards, merge provenance, build a local SQLite search corpus."""
import hashlib
import json
import os
import re
import sqlite3
from collections import Counter
from copy import deepcopy
from pathlib import Path
from urllib.parse import urlparse

BASE = Path(__file__).resolve().parents[1]
ROOT = BASE.parents[1]
DATA = BASE / 'data'
AS_OF = '2026-11-15'


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def publish_reviewed_facts(candidates, records):
    """Project reviewed fields without promoting the rest of a candidate."""
    candidate_map = {candidate['id']: candidate for candidate in candidates}
    if len(candidate_map) != len(candidates):
        raise ValueError('事实候选ID重复')
    if not isinstance(records, list):
        raise ValueError('人工核对记录 records 必须为数组')
    source_fields = ('title', 'article_id', 'source_url', 'source_published_at',
                     'source_document', 'document_section', 'source_type')
    reserved = (set(source_fields) - {'title'}) | {
        'id', 'candidate_id', 'source', 'verification_status', 'publishable',
        'verified_fields', 'not_verified', 'verified_by', 'verified_at', 'note',
        'method', 'current_status', 'temporal_status', 'changes', 'evidence',
        'missing_fields', 'ambiguities',
    }
    published, seen = [], set()
    for record in records:
        cid = record['candidate_id']
        if cid not in candidate_map:
            raise ValueError(f'人工核对记录的候选ID不存在: {cid}')
        if cid in seen:
            raise ValueError(f'人工核对记录的候选ID重复: {cid}')
        seen.add(cid)
        if record.get('verdict') != '对':
            continue
        candidate = candidate_map[cid]
        verified = record.get('verified_fields')
        unverified = record.get('not_verified', [])
        if not isinstance(verified, dict) or not verified:
            raise ValueError(f'{cid}: verified_fields 必须为非空字段值对象')
        if not isinstance(unverified, list) or not all(isinstance(f, str) for f in unverified):
            raise ValueError(f'{cid}: not_verified 必须为字段名数组')
        if set(verified) & set(unverified):
            raise ValueError(f'{cid}: 同一字段不能同时已确认和未确认')
        if set(verified) & reserved or set(verified) - candidate.keys():
            raise ValueError(f'{cid}: verified_fields 含保留字段或候选中不存在的字段')
        if not record.get('verified_by') or not record.get('verified_at') or not isinstance(record.get('note'), str):
            raise ValueError(f'{cid}: 缺少 verified_by、verified_at 或 note')
        fact = deepcopy(verified)
        fact.update({
            'id': cid,
            'candidate_id': cid,
            # Source title is an identifier, not an independently verified claim.
            'source': {key: deepcopy(candidate.get(key)) for key in source_fields},
            'verified_fields': deepcopy(verified),
            'not_verified': {
                field: {'value': deepcopy(candidate.get(field)),
                        'verification_status': '未经人工确认',
                        'present_in_candidate': field in candidate}
                for field in unverified
            },
            'verification_status': '仅所列字段已人工核对',
            'publishable': True,
            'verified_by': record['verified_by'],
            'verified_at': record['verified_at'],
            'note': record['note'],
        })
        if 'method' in record:
            fact['method'] = record['method']
        published.append(fact)
    return published


def article_url(text):
    for line in text.splitlines():
        if '原文' in line:
            for url in re.findall(r'https?://mp\.weixin\.qq\.com/[^\s)<>]+', line):
                if urlparse(url).path == '/s' or urlparse(url).path.startswith('/s/'):
                    return url
    raise ValueError('找不到文章原文链接')


def require_quote(quote, body, context):
    if not isinstance(quote, str) or not quote.strip() or quote not in body:
        raise ValueError(f'{context}: 引用不是正文逐字摘录: {quote!r}')


def validate_missing_content_card(card, entry):
    """Only a source with no substantive text may omit textual evidence."""
    paragraphs = entry['paragraphs'] if entry else None
    eligible = paragraphs == [] or (paragraphs is not None and len(paragraphs) == 1
                                   and paragraphs[0]['text'].strip() == '原文：BoHack')
    if not eligible or card.get('summary') != '正文在配图中，本文件无图，内容待补':
        raise ValueError(f'{card["id"]}: 最小卡片缺口与来源不匹配')
    if any(card.get(k) for k in ('evidence', 'key_points', 'people', 'projects', 'series', 'organizations')):
        raise ValueError(f'{card["id"]}: 缺图最小卡片不能补猜正文事实')
    if not card.get('missing_content_note'):
        raise ValueError(f'{card["id"]}: 缺少内容缺口说明')


def chunks(body):
    """Keep original paragraphs and line numbers; exclude archive headers and image markup."""
    lines = body.splitlines()
    result = []
    start, pending = None, []

    def flush():
        nonlocal start, pending
        if pending:
            text = '\n'.join(pending).strip()
            if len(text) >= 8:
                result.append((start, text))
        start, pending = None, []

    for i, line in enumerate(lines, 1):
        s = line.strip()
        if s.startswith(('#', '![', '原文', '公众号：', '发布日期：', '所属合集：', '合集：', '[原文', '> 配图文字转录（AI识别')) or 'mp.weixin.qq.com' in s:
            flush()
            continue
        if not s:
            if pending:
                pending.append(line)
            continue
        if not pending and (len(s) < 2 or s == '---'):
            continue
        if pending and sum(map(len, pending)) + len(line) > 650:
            flush()
        if start is None:
            start = i
        pending.append(line)
        if sum(map(len, pending)) >= 280:
            flush()
    flush()
    return result


def citation(source):
    if source.get('source_url'):
        return f'[公众号原文]({source["source_url"]})'
    relative = os.path.relpath(ROOT / source['source_document'], BASE)
    return f'[Word汇总，第{source["document_section"]}节](<{relative}>)（缺网络原文链接）'


def document_chunks(paragraphs):
    pending = []
    for paragraph in paragraphs:
        if pending and sum(len(p['text']) for p in pending) + len(paragraph['text']) > 650:
            yield pending
            pending = []
        pending.append(paragraph)
        if sum(len(p['text']) for p in pending) >= 280:
            yield pending
            pending = []
    if pending:
        yield pending


def build():
    manifest = read_json(BASE / 'work/manifest.json')
    sources = {x['id']: x for x in manifest}
    bodies = {i: (ROOT / x['archive_path']).read_text(encoding='utf-8') for i, x in sources.items()}
    for i, source in sources.items():
        source['source_url'] = article_url(bodies[i])
        source['source_kind'] = 'wechat_archive'
    results = [read_json(BASE / f'work/batch-{i}-result.json') for i in range(1, 4)]
    refined_paths = sorted((BASE / 'work/refinement').glob('batch-*-result.json'))
    additional_paths = sorted((BASE / 'work').glob('refinement-summary*/batch-*-result.json'))
    document_entries = {}
    publication_metadata = {}
    legacy_ids = set()
    for supplement_path in sorted(DATA.glob('document-supplements*.json')):
        supplement = read_json(supplement_path)
        digest = hashlib.sha256((ROOT / supplement['source_document']).read_bytes()).hexdigest()
        if digest != supplement['source_sha256']:
            raise ValueError('来源Word发生变化，需先重新提取并核对段落')
        for entry in supplement['entries']:
            aid = entry['id']
            if aid in sources:
                raise ValueError(f'正文ID重复: {aid}')
            document_entries[aid] = entry
            if supplement_path.name == 'document-supplements.json':
                legacy_ids.add(aid)
            sources[aid] = {key: entry[key] for key in ['id', 'title', 'published_at', 'source_url', 'archive_path', 'source_document', 'document_section']}
            sources[aid].update(source_kind='docx', source_document_sha256=digest)
            if entry.get('published_at_minute'):
                sources[aid]['published_at_minute'] = entry['published_at_minute']
            bodies[aid] = '\n\n'.join(p['text'] for p in entry['paragraphs'])
            # Both on-disk clean text and paragraph-level evidence must remain consistent.
            clean_body = (ROOT / entry['archive_path']).read_text()
            if any(p['text'] not in clean_body for p in entry['paragraphs']):
                raise ValueError(f'{aid}: 正文文件与导入段落不一致')
        for duplicate in supplement['duplicates']:
            if duplicate.get('published_at_minute'):
                for match in duplicate['matches']:
                    publication_metadata.setdefault(match['archive_path'], []).append({
                        'published_at_minute': duplicate['published_at_minute'],
                        'source_document': supplement['source_document'],
                        'document_section': duplicate['number'], 'status': '来源补充，未人工核对'})
    results += [read_json(path) for path in refined_paths + additional_paths]
    fact_scan_path = BASE / 'work/summary2-facts.json'
    if fact_scan_path.exists():
        results.append({'cards': [], 'series': [], 'facts': read_json(fact_scan_path)['facts']})

    def validate_evidence(evidence, aid, context):
        require_quote(evidence['quote'], bodies[aid], context)
        if aid in document_entries:
            paragraphs = {p['document_paragraph']: p['text'] for p in document_entries[aid]['paragraphs']}
            number = evidence.get('document_paragraph')
            if number not in paragraphs or evidence['quote'] not in paragraphs[number]:
                raise ValueError(f'{context}: Word引用段号不匹配 {number}')

    cards = [c for result in results for c in result['cards']]
    ids = [c['id'] for c in cards]
    if len(ids) != len(set(ids)) or not set(ids) <= set(sources) or not ({x['id'] for x in manifest} | legacy_ids) <= set(ids):
        raise ValueError('文章卡片不完整、重复或含未知ID')
    card_map = {c['id']: c for c in cards}
    for c in cards:
        c.update(sources[c['id']])
        if c['archive_path'] in publication_metadata:
            c['publication_metadata'] = publication_metadata[c['archive_path']]
            minutes = {m['published_at_minute'] for m in c['publication_metadata']}
            if len(minutes) == 1:
                c['published_at_minute'] = next(iter(minutes))
        for field in ['types', 'summary', 'series', 'people', 'organizations', 'projects', 'evidence', 'image_notes']:
            if field not in c:
                raise ValueError(f'{c["id"]} 缺字段 {field}')
        missing_content = c.get('content_status') == 'image_only_missing'
        if missing_content:
            validate_missing_content_card(c, document_entries.get(c['id']))
        if not c['summary'].strip() or (not c['evidence'] and not missing_content):
            raise ValueError(f'{c["id"]} 缺摘要或证据')
        for e in c['evidence']:
            validate_evidence(e, c['id'], c['id'])
        if c['id'] in document_entries and not c.get('key_points') and not missing_content:
            raise ValueError(f'{c["id"]}: 缺少实际提炼要点')
        for point in c.get('key_points', []):
            if not point.get('text', '').strip():
                raise ValueError(f'{c["id"]}: 空要点')
            validate_evidence(point, c['id'], c['id'])
        for image in c['image_notes']:
            if image['status'] not in ['inspected', 'needs_review'] or not (ROOT / image['path']).is_file():
                raise ValueError(f'{c["id"]} 图片记录无效 {image}')
        c['fact_ids'] = []
        c['indexed_at'] = AS_OF
        c['processing_status'] = '最小卡片，正文待补' if missing_content else '已提炼'
        c['status'] = c['processing_status']
        c['source_sha256'] = hashlib.sha256(bodies[c['id']].encode()).hexdigest()

    conflict_path = BASE / 'work/refinement/conflicts.json'
    conflicts = read_json(conflict_path) if document_entries and conflict_path.exists() else []
    for conflict in conflicts:
        for evidence in conflict['evidence']:
            validate_evidence(evidence, evidence['article_id'], conflict['id'])
        for aid in conflict['article_ids']:
            card_map[aid].setdefault('version_notes', []).append({'id': conflict['id'], 'guidance': conflict['guidance']})

    merged = {}
    for result in results:
        for s in result['series']:
            dest = merged.setdefault(s['name'], {'name': s['name'], 'kind': s['kind'], 'kinds': [], 'aliases': [], 'description': s['description'], 'article_ids': [], 'claims': []})
            dest['kinds'] = sorted(set(dest['kinds'] + s['kind'].split('/')))
            dest['kind'] = '/'.join(dest['kinds'])
            dest['classification_note'] = '资料涉及多种分类，尚未统一口径；保留原文依据。' if len(dest['kinds']) > 1 else ''
            dest['aliases'] = sorted(set(dest['aliases'] + s['aliases']))
            if s.get('annual_rhythm'):
                rhythm = deepcopy(s['annual_rhythm'])
                if not rhythm.get('value') or not rhythm.get('sources'):
                    raise ValueError(f'{s["name"]}: 年度节奏缺说明或来源')
                for source in rhythm['sources']:
                    aid = source['article_id']
                    if source.get('evidence_kind') == 'publication_metadata':
                        if source.get('title') != sources[aid]['title'] or source.get('quote'):
                            raise ValueError(f'{s["name"]}: 发布元数据不能冒充正文引文')
                    else:
                        validate_evidence(source, aid, f'{s["name"]}/年度节奏/{aid}')
                    source.update({key: sources[aid].get(key) for key in
                                   ('published_at', 'source_url', 'source_kind', 'source_document', 'document_section')})
                dest['annual_rhythm'] = rhythm
            for claim in s['claims']:
                aid = claim['article_id']
                validate_evidence(claim, aid, f'{s["name"]}/{aid}')
                claim = {**claim, 'published_at': sources[aid]['published_at'], 'source_url': sources[aid]['source_url'], 'source_kind': sources[aid]['source_kind'], 'source_document': sources[aid].get('source_document'), 'document_section': sources[aid].get('document_section'), 'validity': '文章发表时的表述，当前情况待确认'}
                if claim not in dest['claims']:
                    dest['claims'].append(claim)
    for c in cards:
        for name in c['series']:
            if name not in merged:
                raise ValueError(f'缺少系列档案 {name}')
            merged[name]['article_ids'].append(c['id'])

    facts = [f for result in results for f in result['facts']]
    if len({f['id'] for f in facts}) != len(facts):
        raise ValueError('事实候选ID重复')
    for f in facts:
        aid = f['article_id']
        if not f.get('evidence'):
            raise ValueError(f'{f["id"]} 缺证据')
        for e in f['evidence']:
            validate_evidence(e, aid, f['id'])
        f.update({'source_url': sources[aid]['source_url'], 'source_published_at': sources[aid]['published_at'], 'source_document': sources[aid].get('source_document'), 'document_section': sources[aid].get('document_section'), 'verification_status': '未核对', 'verified_by': None, 'verified_at': None, 'publishable': False, 'source_type': 'Word汇总转录' if aid in document_entries else '公众号文章', 'current_status': '待核对', 'changes': []})
        dates = [str(f.get(key) or '')[:10] for key in ['start_at', 'end_at', 'registration_deadline']]
        dates = [date for date in dates if re.fullmatch(r'\d{4}-\d{2}-\d{2}', date)]
        f['temporal_status'] = '含今日或未来节点，尚未核对' if any(date >= AS_OF for date in dates) else '已知节点均已过去' if dates else '日期不完整，不能判断当前有效性'
        for conflict in conflicts:
            if aid in conflict['article_ids']:
                f.setdefault('ambiguities', []).append(conflict['guidance'])
        if aid in card_map:
            card_map[aid]['fact_ids'].append(f['id'])

    review_path = BASE / '人工核对记录.json'
    records = read_json(review_path)['records'] if review_path.exists() else []
    published_facts = publish_reviewed_facts(facts, records)

    # Related source records are NOT silently collapsed into verified events.
    groups = {}
    for f in facts:
        evidence_text = '\n'.join(e['quote'] for e in f['evidence'])
        key = None
        if '2026级科创硕士夏令营' in f['title']:
            key = '2026级科创硕士夏令营招生（届别不是活动年份）'
        elif f.get('series') == '科创领导力' and '双周' in evidence_text and '2026-01-01' <= f['source_published_at'] < '2026-08-01':
            key = '科创领导力2026年春季文章中的双周旁听安排'
        if key:
            groups.setdefault(key, []).append(f['id'])
        elif f.get('series') and (f.get('start_at') or f.get('registration_deadline')):
            key = f'{f["series"]}｜开始 {f.get("start_at") or "未知"}｜报名截止 {f.get("registration_deadline") or "未知"}（同系列同时间节点）'
            groups.setdefault(key, []).append(f['id'])
    review_groups = [{'label': key, 'candidate_ids': ids, 'status': '疑似同一安排的多来源，待核对后合并', 'merged': False} for key, ids in groups.items() if len(ids) > 1]

    cards.sort(key=lambda x: (x['published_at'], x['id']), reverse=True)
    series = sorted(merged.values(), key=lambda x: x['name'])
    DATA.mkdir(exist_ok=True)
    write_json(DATA / 'articles.json', cards)
    write_json(DATA / 'series.json', series)
    write_json(DATA / 'fact-candidates.json', facts)
    write_json(DATA / 'review-groups.json', review_groups)
    write_json(DATA / 'knowledge-conflicts.json', conflicts)
    write_json(DATA / 'published-facts.json', published_facts)
    write_json(BASE / 'work/manifest.json', manifest)
    known_paths = {c['archive_path'] for c in cards}
    pending = []
    for p in sorted((ROOT / '信息层/天津大学宣怀学院公众号资料库/文章').glob('*/文章.md')):
        if str(p.relative_to(ROOT)) not in known_paths:
            body = p.read_text(encoding='utf-8')
            pending.append({'title': body.splitlines()[0].lstrip('# '), 'published_at': p.parent.name[:10], 'source_url': article_url(body), 'archive_path': str(p.relative_to(ROOT)), 'status': '待编制卡片和提取事实'})
    for entry in document_entries.values():
        if entry['id'] not in card_map:
            pending.append({key: entry[key] for key in ('id', 'title', 'published_at', 'source_url', 'archive_path', 'source_document', 'document_section')})
            pending[-1].update(status='待编制知识卡片', source_kind='docx')
            scan_path = BASE / 'work/summary2-fact-scan.json'
            if entry['id'].startswith('docx-summary2-') and scan_path.exists():
                scan_record = next((r for r in read_json(scan_path)['scan'] if r['id'] == entry['id']), None)
                if scan_record:
                    pending[-1].update(fact_scan_status=scan_record['status'], fact_ids=scan_record['fact_ids'], fact_scan_note=scan_record['reason'])
    pending.sort(key=lambda p: (p['published_at'], p.get('id', '')), reverse=True)
    write_json(DATA / 'pending-ingestion.json', pending)
    # Only derived processing status changes; source text and first-summary provenance stay intact.
    for supplement_path in sorted(DATA.glob('document-supplements*.json')):
        supplement = read_json(supplement_path)
        for entry in supplement['entries']:
            entry['status'] = '已提炼' if entry['id'] in card_map else '待提炼'
        write_json(supplement_path, supplement)
    summary2_ids = {i for i in document_entries if i.startswith('docx-summary2-')}
    if summary2_ids:
        progress = {'new_articles': len(summary2_ids), 'cards_completed': len(summary2_ids & card_map.keys()),
                    'cards_pending': len(summary2_ids - card_map.keys()),
                    'facts': sum(f['article_id'] in summary2_ids for f in facts),
                    'published_facts': len(published_facts)}
        scan_path = BASE / 'work/summary2-fact-scan.json'
        progress['fact_scan'] = read_json(scan_path).get('counts', {}) if scan_path.exists() else {'status': '未开始'}
        write_json(BASE / 'work/summary2-progress.json', progress)
        report_path = BASE / '汇总2清洗报告.md'
        report = report_path.read_text().split('## 第二阶段进度')[0]
        report += ('## 第二阶段进度\n\n'
                   f"新增 {progress['new_articles']} 篇，已编制 {progress['cards_completed']} 张卡片，尚余 {progress['cards_pending']} 篇列入 data/pending-ingestion.json；新增正文产生 {progress['facts']} 条事实候选，全部 publishable: false。发布库仍为 {len(published_facts)} 条。\n\n"
                   + '事实扫描进度：' + json.dumps(progress['fact_scan'], ensure_ascii=False) + '。逐篇状态见 work/summary2-fact-scan.json。\n\n'
                   + '未完成篇目保留清洗正文和出处，可用 query.py --documents 检索。平台AI摘要边界、字数差异原因、疑似重复及缺图仍按本报告待核对，不把导语补成课表。\n')
        if scan_path.exists():
            scan_records = read_json(scan_path)['scan']
            unresolved = [r for r in scan_records if r['status'] in ('待复核', '图缺失')]
            report += '\n### 事实扫描仍无法确定的篇目\n\n'
            for row in unresolved:
                entry = document_entries[row['id']]
                report += f"- 第{entry['document_section']:04d}节《{entry['title']}》：{row['status']}；{row['reason']}\n"
        report_path.write_text(report)


    tmp = DATA / 'search.tmp.sqlite'
    tmp.unlink(missing_ok=True)
    with sqlite3.connect(tmp) as db:
        db.executescript('CREATE TABLE articles (id TEXT PRIMARY KEY, title TEXT, published_at TEXT, source_url TEXT, archive_path TEXT, summary TEXT, tags TEXT, source_kind TEXT, source_document TEXT, document_section INTEGER, key_points TEXT); CREATE TABLE passages (article_id TEXT, line INTEGER, text TEXT, kind TEXT, document_paragraph INTEGER, document_paragraph_end INTEGER); CREATE INDEX passages_article ON passages(article_id);')
        for c in cards:
            tags = ' '.join(c['series'] + [p['name'] for p in c['people']] + c['organizations'] + [p['name'] + ' ' + p['direction'] for p in c['projects']])
            db.execute('INSERT INTO articles VALUES (?,?,?,?,?,?,?,?,?,?,?)', (c['id'], c['title'], c['published_at'], c['source_url'], c['archive_path'], c['summary'], tags, c['source_kind'], c.get('source_document'), c.get('document_section'), json.dumps(c.get('key_points', []), ensure_ascii=False)))
            if c['id'] in document_entries:
                db.executemany('INSERT INTO passages VALUES (?,?,?,?,?,?)', [(c['id'], 0, '\n\n'.join(p['text'] for p in group), 'Word原文', group[0]['document_paragraph'], group[-1]['document_paragraph']) for group in document_chunks(document_entries[c['id']]['paragraphs'])])
                db.executemany('INSERT INTO passages VALUES (?,?,?,?,?,?)', [(c['id'], 0, '提炼：' + point['text'] + '\n原文依据：' + point['quote'], '提炼要点（AI整理，附原文依据）', point['document_paragraph'], point['document_paragraph']) for point in c['key_points']])
            else:
                db.executemany('INSERT INTO passages VALUES (?,?,?,?,?,?)', [(c['id'], line, text, '原文', None, None) for line, text in chunks(bodies[c['id']])])
            for note in c['image_notes']:
                if note['status'] == 'inspected':
                    db.execute('INSERT INTO passages VALUES (?,?,?,?,?,?)', (c['id'], 0, note['note'], '配图解读（AI整理，未人工核对）：' + note['path'], None, None))
            for note in c.get('image_text_notes', []):
                db.execute('INSERT INTO passages VALUES (?,?,?,?,?,?)', (c['id'], 0, note['text'], '配图文字转录（AI识别，未人工核对）：' + note['original_image_path'], None, None))
        total_passages = db.execute('SELECT COUNT(*) FROM passages').fetchone()[0]
    db.close()
    tmp.replace(DATA / 'search.sqlite')
    stats = {'as_of': AS_OF, 'articles': len(cards), 'articles_last_year': sum('2025-11-15' <= c['published_at'] <= AS_OF for c in cards), 'pending_ingestion': len(pending), 'series': len(series), 'fact_candidates': len(facts), 'published_facts': len(published_facts), 'passages': total_passages, 'image_notes': dict(Counter(n['status'] for c in cards for n in c['image_notes'])), 'coverage': '现有四个合集及用户提供文章，非完整公众号历史；本轮未采集新的线上信息。'}
    stats.update(refined_document_articles=sum(c['id'] in document_entries for c in cards), document_key_points=sum(len(c.get('key_points', [])) for c in cards if c['id'] in document_entries), source_kinds=dict(Counter(c['source_kind'] for c in cards)))
    stats['minimal_cards_missing_content'] = sum(c.get('content_status') == 'image_only_missing' for c in cards)
    write_json(DATA / 'build-report.json', stats)
    lines = ['# 事实候选与待核对清单', '', f'整理基准：{AS_OF}。本清单保留原始候选，整条候选均不可直接发布。人工核对后按字段生成的 {len(published_facts)} 条记录见 data/published-facts.json；未确认字段仍不能当作已核对安排。', '']
    priority = [f for f in facts if re.match(r'^\d{4}-\d{2}-\d{2}', str(f.get('start_at') or '')) and str(f['start_at'])[:10] >= AS_OF]
    lines += ['## 尚未发生，优先核对', '', '仅按来源记载的开始日期筛选，不表示已经确认或仍可报名。', '']
    for f in sorted(priority, key=lambda f: (f['start_at'], f['id'])):
        lines += [f"- {f['start_at']} · {f['title']} · `{f['id']}` · {citation(f)}"]
    if not priority:
        lines += ['暂无开始日期明确且不早于整理基准的候选。']
    lines += ['']
    year_only = [f for f in facts if not f.get('start_at') and any(int(y) > int(AS_OF[:4]) for y in re.findall(r'20\d{2}', str(f.get('academic_term') or '')))]
    if year_only:
        lines += ['### 未来年份已知，具体开始日期待确认', '', '以下未列为精确开始日期候选，不把年份补成1月1日。', '']
        for f in year_only:
            lines += [f"- {f['title']} · {f['academic_term']} · `{f['id']}` · {citation(f)}"]
        lines += ['']
    if conflicts:
        lines += ['## 来源版本差异', '']
        for conflict in conflicts:
            lines += [f'- {conflict["topic"]}：{conflict["guidance"]}']
        lines += ['']
    lines += ['## 疑似重复来源', '', '以下仅作核对提示，尚未合并为同一事件。', '']
    for group in review_groups:
        lines += [f'- {group["label"]}：' + '、'.join(f'`{i}`' for i in group['candidate_ids'])]
    lines += ['']
    for f in facts:
        lines += [f'## {f["title"]}', '', f'- ID：`{f["id"]}`', f'- 来源：{f["source_published_at"]} · {citation(f)}', f'- 系列：{f.get("series") or "未确定"}', f'- 时间：{f.get("start_at") or "待核对"} — {f.get("end_at") or "待核对"}', f'- 报名截止：{f.get("registration_deadline") or "待核对"}', f'- 时效：{f["temporal_status"]}', f'- 地点 / 校区：{f.get("location") or "待核对"} / {f.get("campus") or "待核对"}', f'- 缺项：{"；".join(f.get("missing_fields", [])) or "待人工核对完整性"}', f'- 歧义：{"；".join(f.get("ambiguities", [])) or "无自动识别项，仍需核对"}', '- 追问状态：尚未联系任何老师。', '']
        lines += ['> ' + e['quote'].replace('\n', '\n> ') for e in f['evidence']]
        lines += ['']
    (BASE / '待核对清单.md').write_text('\n'.join(lines), encoding='utf-8')
    series_lines = ['# 系列档案', '', '依据现有文章整理；负责人、参与方式和节奏均为来源发表时的说法，不能直接当作当前情况。', '', '“从行业案例到创业实践”和“从行业案例到创业实战”存在名称差异，暂分开保留，待核对是否同一门课。', '']
    for s in series:
        series_lines += [f'## {s["name"]}', '', f'- 分类：{s["kind"]}。{s["classification_note"]}', f'- 别名：{"、".join(s["aliases"]) or "暂无已收录别名"}', f'- 关联文章：{len(s["article_ids"])} 篇', '', s['description'], '']
        if s.get('annual_rhythm'):
            series_lines += ['### 年度节奏', '', s['annual_rhythm']['value'], '', '依据：', '']
            for source in s['annual_rhythm']['sources']:
                series_lines += [f'- {source["published_at"]} · `{source["article_id"]}` · {citation(source)}',
                                 ('  发布元数据：' + source['title'] + '（仅证明条目标题与发布日期，不补推正文）')
                                 if source.get('evidence_kind') == 'publication_metadata'
                                 else '  > ' + source['quote'].replace('\n', '\n  > ')]
            series_lines += ['']
        for claim in s['claims']:
            series_lines += [f'- {claim["field"]}：{claim["value"]}（{claim["published_at"]} · {citation(claim)}）', f'  > {claim["quote"].replace(chr(10), chr(10) + "  > ")}']
        series_lines += ['']
    (BASE / '系列档案.md').write_text('\n'.join(series_lines), encoding='utf-8')
    catalog = ['# 文章知识卡片目录', '', f'共 {len(cards)} 篇；全文保留在原资料库，卡片与索引在本目录。', '']
    for c in cards:
        catalog += [f'## {c["published_at"]} · {c["title"]}', '', f'- 类型：{"、".join(c["types"])}；系列：{"、".join(c["series"]) or "无"}', f'- {citation(c)} · [本地归档](<../../{c["archive_path"]}>)', '', c['summary'], '']
        catalog += ['- ' + point['text'] for point in c.get('key_points', [])]
        catalog += ['']
    (BASE / '文章目录.md').write_text('\n'.join(catalog), encoding='utf-8')
    if document_entries:
        refined_cards = [c for c in cards if c['id'] in document_entries]
        digest = ['# Word新增文章精华', '', f'{len(refined_cards)}篇已提炼为知识卡片；每条要点有原DOCX段落依据。原文链接和图片未提供，不推测补齐。报名和活动安排仍需核对，历史经验保留作者归属。', '']
        for c in refined_cards:
            digest += [f'## {c["published_at"]} · {c["title"]}', '', c['summary'], '']
            digest += ['- ' + point['text'] for point in c['key_points']]
            if c.get('content_status') == 'image_only_missing':
                digest += ['', f'来源：{citation(c)}。正文缺失，未生成要点或引文。', '']
            else:
                digest += ['', f'来源：{citation(c)}。要点依据段落：' + '、'.join(str(p['document_paragraph']) for p in c['key_points']) + '。', '']
        (BASE / 'Word新增文章精华.md').write_text('\n'.join(digest), encoding='utf-8')
        published_document_facts = sum(f['source']['article_id'] in document_entries for f in published_facts)
        write_json(DATA / 'document-refinement-report.json', {'articles': len(refined_cards), 'key_points': sum(len(c['key_points']) for c in refined_cards), 'new_fact_candidates': sum(f['article_id'] in document_entries for f in facts), 'future_or_today_candidates': [f['id'] for f in facts if f['article_id'] in document_entries and '含今日' in f['temporal_status']], 'all_facts_unverified': published_document_facts == 0, 'published_facts': published_document_facts})
    print(json.dumps(stats, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    build()
