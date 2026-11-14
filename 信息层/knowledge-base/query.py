#!/usr/bin/env python3
"""Offline evidence retrieval. No API key, model, or network required."""
import argparse
import json
import math
import re
import sqlite3
from pathlib import Path

BASE = Path(__file__).resolve().parent
STOP = {'什么', '哪些', '怎么', '如何', '是否', '可以', '有没有', '有关', '关于', '介绍', '一下', '想知道', '请问', '宣怀', '学院', '天津大学', '方向', '相关', '去过', '告诉', '的', '了', '吗', '呢', '是', '我', '有', '在', '和', '与'}
EXPANSIONS = {'加入': ['加入', '入群', '扫码', '旁听'], '企业': ['企业', '走访', '参访'], '机器人': ['机器人', '机械臂']}


def terms_for(query):
    cleaned = query.lower()
    for word in sorted(STOP, key=len, reverse=True):
        cleaned = cleaned.replace(word.lower(), ' ')
    terms = set()
    for segment in re.findall(r'[\u4e00-\u9fff]+|[a-z0-9]+(?:[- ][a-z0-9]+)*', cleaned):
        if len(segment) >= 2:
            terms.add(segment)
        if re.fullmatch(r'[\u4e00-\u9fff]+', segment):
            terms.update(segment[i:i+2] for i in range(len(segment)-1))
    for key, values in EXPANSIONS.items():
        if key.lower() in query.lower():
            terms.update(v.lower() for v in values)
    return sorted(terms)


def score(text, terms):
    text = text.lower()
    return sum(min(len(t), 8) for t in terms if t in text)


def search(query, limit=5, series=None, since=None, until=None):
    db_path = BASE / 'data/search.sqlite'
    if not db_path.exists():
        raise RuntimeError('请先运行 python3 tools/build.py')
    terms = terms_for(query)
    if not terms:
        return []
    with sqlite3.connect(db_path) as db:
        db.row_factory = sqlite3.Row
        articles = [dict(r) for r in db.execute('SELECT * FROM articles')]
        paragraphs = {}
        for row in db.execute('SELECT * FROM passages'):
            paragraphs.setdefault(row['article_id'], []).append(dict(row))
    db.close()
    results = []
    series_data = json.loads((BASE / 'data/series.json').read_text())
    # Explicit names/aliases select their documented series, avoiding incidental
    # generic matches in unrelated articles. The remaining words rank evidence.
    focus_query = query
    detected_ids = None
    matched_names = []
    for s in series_data:
        for alias in [s['name'], *s['aliases']]:
            if alias.lower() in query.lower():
                matched_names.append((alias, s))
    matched_names.sort(key=lambda pair: len(pair[0]), reverse=True)
    for alias, s in matched_names:
        if alias.lower() not in focus_query.lower():
            continue
        focus_query = re.sub(re.escape(alias), ' ', focus_query, flags=re.I)
        if detected_ids is None:
            detected_ids = set()
        detected_ids.update(s['article_ids'])
    focus = terms_for(focus_query) if detected_ids is not None else terms
    document_texts = {a['id']: (a['title'] + ' ' + a['summary'] + ' ' + a['tags'] + ' ' + ' '.join(p['text'] for p in paragraphs.get(a['id'], []))).lower() for a in articles}
    weights = {t: math.log(1 + len(articles) / (1 + sum(t in text for text in document_texts.values()))) for t in set(terms + focus)}

    def weighted(text, words):
        text = text.lower()
        return sum(min(len(t), 8) * weights[t] for t in words if t in text)

    series_ids = None
    if series:
        series_ids = set()
        for s in series_data:
            if series in [s['name'], *s['aliases']]:
                series_ids.update(s['article_ids'])
    for a in articles:
        if detected_ids is not None and a['id'] not in detected_ids:
            continue
        if series_ids is not None and a['id'] not in series_ids:
            continue
        if since and a['published_at'] < since or until and a['published_at'] > until:
            continue
        # A lone two-character overlap (e.g. 基地 in an unrelated question)
        # is not sufficient evidence for a long unrecognized query.
        if detected_ids is None:
            total_weight = sum(min(len(t), 8) * weights[t] for t in terms)
            if weighted(document_texts[a['id']], terms) / max(total_weight, 1) < 0.25:
                continue
        ranked = sorted(((weighted(p['text'], focus) * 4 + weighted(p['text'], terms), p) for p in paragraphs.get(a['id'], [])), key=lambda x: (-x[0], x[1]['line']))
        best = [(s, p) for s, p in ranked if s > 0][:3]
        if not best:
            continue
        total = weighted(a['title'], focus) * 2 + weighted(a['summary'], focus) + best[0][0] * 2
        if detected_ids is not None and not focus:
            # A bare series-name query prioritizes recent documentation.
            total = 1
        result = {k: a[k] for k in ['id', 'title', 'published_at', 'source_url', 'archive_path', 'summary']}
        result.update(source_kind=a.get('source_kind', 'wechat_archive'), source_document=a.get('source_document'), document_section=a.get('document_section'), key_points=json.loads(a.get('key_points') or '[]'), processing_status='已提炼')
        notice = '历史文章依据；不代表当前安排。配图解读与原文摘录分别标记。'
        if result['source_kind'] == 'docx':
            notice = '已提炼的Word资料；网络原文链接和图片缺失。引用本地文档节号与段落，安排仍未核对。'
        result.update(score=round(total, 3), passages=[{'text': p['text'], 'line': p['line'], 'kind': p['kind'], 'document_paragraph': p.get('document_paragraph'), 'document_paragraph_end': p.get('document_paragraph_end')} for _, p in best], notice=notice)
        results.append(result)
    results.sort(key=lambda x: (x['score'], x['published_at']), reverse=True)
    conflict_path = BASE / 'data/knowledge-conflicts.json'
    conflicts = json.loads(conflict_path.read_text()) if conflict_path.exists() else []
    for result in results:
        notes = [c['guidance'] for c in conflicts if result['id'] in c['article_ids']]
        if notes:
            result['version_notes'] = notes
            result['notice'] += ' 来源版本提示：' + ' '.join(notes)
    return results[:limit]


def fact_lookup():
    path = BASE / 'data/published-facts.json'
    facts = json.loads(path.read_text(encoding='utf-8')) if path.exists() else []
    facts = [fact for fact in facts if fact.get('publishable') is True and fact.get('verified_fields')]
    if not facts:
        return {'status': 'no_verified_data', 'facts': [], 'message': '尚无已核对、可发布的事实，不能确定当前或下周安排。待核对清单仅供内部整理；尚未联系老师。'}
    return {'status': 'verified_fields_available', 'facts': facts,
            'message': f'已有 {len(facts)} 条按字段人工核对的记录，仅 verified_fields 中的字段已确认；not_verified 逐项保留未经人工确认的原值。请结合核对日期与 note 使用；尚未联系老师。'}


def search_documents(query, limit=5, series=None, since=None, until=None):
    """Retrieve verbatim supplementary Word paragraphs, without making cards.

    Only ``entries`` are eligible. Duplicate and excluded sections remain audit
    records and are deliberately never searched.
    """
    path = BASE / 'data/document-supplements.json'
    if not path.exists():
        raise RuntimeError('Word 补充正文尚未导入：缺少 data/document-supplements.json')
    source = json.loads(path.read_text())
    catalogs = [source] + [json.loads(p.read_text()) for p in sorted((BASE / 'data').glob('document-supplements-*.json'))]
    entries = [entry for catalog in catalogs for entry in catalog.get('entries', [])]
    cards_path = BASE / 'data/articles.json'
    compiled_cards = json.loads(cards_path.read_text()) if cards_path.exists() else []
    refined_ids = {c['id'] for c in compiled_cards if c.get('source_kind') == 'docx' and c.get('source_document_sha256') in {catalog.get('source_sha256') for catalog in catalogs}}
    terms = terms_for(query)
    if not terms or limit <= 0:
        return []

    # A series filter is supported only by literal text in this document, not
    # by relationships inferred from the previously indexed article archive.
    aliases = [series] if series else []
    series_path = BASE / 'data/series.json'
    if series and series_path.exists():
        for item in json.loads(series_path.read_text()):
            names = [item['name'], *item.get('aliases', [])]
            if series.casefold() in [name.casefold() for name in names]:
                aliases = names
                break
    document_texts = {
        item['id']: (item['title'] + '\n' + '\n'.join(
            paragraph['text'] for paragraph in item.get('paragraphs', [])
        )).casefold() for item in entries
    }
    weights = {
        term: math.log(1 + len(entries) / (1 + sum(
            term in text for text in document_texts.values()
        ))) for term in terms
    }

    def weighted(text):
        lowered = text.casefold()
        return sum(min(len(term), 8) * weights[term]
                   for term in terms if term in lowered)

    total_weight = sum(min(len(term), 8) * weights[term] for term in terms)
    results = []
    for entry in entries:
        text = document_texts[entry['id']]
        if aliases and not any(alias.casefold() in text for alias in aliases):
            continue
        date = entry.get('published_at')
        if (since and (not date or date < since)) or (until and (not date or date > until)):
            continue
        # Require coverage of the actual query. A common word such as 创业
        # alone must not turn an unrelated multi-topic query into a match.
        if weighted(text) / max(total_weight, 1e-12) < 0.35:
            continue
        ranked = sorted(
            ((weighted(paragraph['text']), paragraph)
             for paragraph in entry.get('paragraphs', [])),
            key=lambda pair: (-pair[0], pair[1]['document_paragraph'])
        )
        best = [(value, paragraph) for value, paragraph in ranked if value > 0][:3]
        if not best:
            continue
        document = entry.get('source_document') or source['source_document']
        section = entry['document_section']
        status = '已提炼' if entry['id'] in refined_ids else entry.get('status', '待提炼')
        results.append({
            'id': entry['id'], 'title': entry['title'], 'published_at': date,
            'archive_path': entry['archive_path'], 'source_document': document,
            'document_section': section, 'status': status,
            'source_url_status': '缺原文URL',
            'score': round(weighted(entry['title']) * 2 + best[0][0] * 2, 3),
            'passages': [
                {'text': paragraph['text'], 'kind': 'Word原文',
                 'source_document': document, 'document_section': section,
                 'document_paragraph': paragraph['document_paragraph']}
                for _, paragraph in best
            ],
            'notice': ('本文已提炼为知识卡片，当前显示Word原始段落；缺原文URL、无图片。' if status == '已提炼' else 'Word 补充正文，尚未提炼为知识卡片；缺原文URL、无图片。') +
                      '引用本地DOCX节号与段落号；历史资料不代表当前安排。',
        })
    results.sort(key=lambda item: (item['score'], item['published_at'] or ''), reverse=True)
    return results[:limit]


def main():
    parser = argparse.ArgumentParser(description='宣怀本地知识查询：返回文章依据，不生成未经核对的安排。')
    parser.add_argument('query', nargs='?', help='关键词或自然语言问题')
    parser.add_argument('--limit', type=int, default=5)
    parser.add_argument('--series', help='系列规范名或别名')
    parser.add_argument('--since', help='文章发布日期起点 YYYY-MM-DD')
    parser.add_argument('--until', help='文章发布日期终点 YYYY-MM-DD')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--facts', action='store_true', help='查询按字段人工核对后发布的事实')
    mode.add_argument('--documents', action='store_true', help='对照检索 Word 原始正文，返回本地文档段落依据')
    parser.add_argument('--json', action='store_true', help='输出机器可读 JSON')
    args = parser.parse_args()
    if not 1 <= args.limit <= 20:
        parser.error('--limit 范围 1—20')
    if args.facts:
        result = fact_lookup()
    elif not args.query:
        parser.error('请输入查询或使用 --facts')
    else:
        search_fn = search_documents if args.documents else search
        result = {'query': args.query, 'mode': 'documents' if args.documents else 'knowledge',
                  'results': search_fn(args.query, args.limit, args.series, args.since, args.until)}
        if re.search(r'下周|本周|今天|明天|现在|这学期|本学期|几号截止', args.query):
            result['current_facts'] = fact_lookup()
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    elif args.facts:
        print(result['message'])
        for fact in result['facts']:
            print(f'\n{fact["source"]["title"]}（候选标题，仅用于识别）')
            for field, value in fact['verified_fields'].items():
                print(f'  {field}：{value}（已人工确认）')
            for field, detail in fact['not_verified'].items():
                value = detail['value'] if detail['present_in_candidate'] else '候选未提供'
                print(f'  {field}：{value}（{detail["verification_status"]}）')
            print(f'  核对：{fact["verified_by"]} · {fact["verified_at"]}\n  备注：{fact["note"]}')
    else:
        if 'current_facts' in result:
            print(result['current_facts']['message'] + '\n以下仅为历史知识检索：\n')
        if not result['results']:
            print('未检索到匹配依据。关键词检索无结果不代表全部文章都没有该信息。')
        for n, r in enumerate(result['results'], 1):
            if args.documents:
                print(f'{n}. {r["title"]}（{r["published_at"] or "发布日期缺失"}）'
                      f'\n状态：{r["status"]}；缺原文URL、无图片'
                      f'\n本地来源：{r["source_document"]}，第 {r["document_section"]} 节')
                for p in r['passages']:
                    print(f'  [{p["kind"]}，DOCX第 {p["document_paragraph"]} 段] {p["text"]}')
            else:
                print(f'{n}. {r["title"]}（{r["published_at"]}）\n{r["summary"]}')
                if r.get('source_kind') == 'docx':
                    print(f'来源：{r["source_document"]}，第 {r["document_section"]} 节；网络原文链接缺失')
                else:
                    print(f'原文：{r["source_url"]}')
                for point in r.get('key_points', []):
                    print(f'  要点：{point["text"]}（DOCX第 {point["document_paragraph"]} 段）')
                for p in r['passages']:
                    location = f'DOCX第 {p["document_paragraph"]}—{p["document_paragraph_end"]} 段' if p.get('document_paragraph') else f'行 {p["line"]}'
                    print(f'  [{p["kind"]}，{location}] {p["text"]}')
            print('提示：' + r['notice'] + '\n')


if __name__ == '__main__':
    main()
