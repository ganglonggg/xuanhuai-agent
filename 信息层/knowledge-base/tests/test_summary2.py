"""Multi-source isolation, conservative cleaning, and complete provenance."""
import importlib.util
import json
import unittest
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('import_docx', BASE / 'tools/import_docx.py')
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)


class CleaningRulesTests(unittest.TestCase):
    def test_only_complete_signatures_are_metadata(self):
        texts = ['文案&编辑：张三', '文案 编辑：李四', '编辑：某人', '这篇文案讲了编辑：应该保留的内容', '天津大学宣怀学院欢迎大家']
        ps = [{'document_paragraph': i, 'text': t} for i, t in enumerate(texts, 1)]
        kept, removed, credits, ai = importer.clean_paragraphs(ps, set())
        self.assertEqual([p['text'] for p in kept], texts[3:])
        self.assertEqual(len(credits), 3)

    def test_ambiguous_summary_and_navigation_text_is_preserved(self):
        texts = ['AI摘要', '这是作者导语还是摘要，不能根据相邻关系猜测。', '上一篇', '无法确认是导航标题的正文', '↓↓↓', '将在11月20日 19:30 直播']
        ps = [{'document_paragraph': i, 'text': t} for i, t in enumerate(texts, 1)]
        kept, removed, credits, ai = importer.clean_paragraphs(ps, set())
        self.assertEqual([p['text'] for p in kept], [texts[1], texts[3], texts[5]])
        self.assertEqual(ai['paragraphs'], [])
        self.assertIn('非作者原文', ai['attribution'])


@unittest.skipUnless((BASE / 'data/document-supplements-summary2.json').exists(), '汇总2未导入')
class Summary2IntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((BASE / 'data/document-supplements-summary2.json').read_text())
        cls.sections, cls.raw = importer.parse_summary(importer.WORKSPACE / cls.data['source_document'])

    def test_account_page_explains_cover_difference(self):
        self.assertEqual(len(self.sections), 297)
        self.assertEqual(sum(bool(s['published_at']) for s in self.sections), 296)
        self.assertEqual([x['number'] for x in self.data['excluded']], [55])
        self.assertIsNone(self.sections[54]['published_at'])
        self.assertEqual(self.sections[-1]['number'], 297)
        self.assertEqual(self.raw['media'], [])

    def test_every_raw_paragraph_is_accounted_for_without_rewriting(self):
        known = {s['title'] for s in self.sections} | {s['title'] for s in importer.existing_articles()}
        known |= {s['title'] for s in json.loads((BASE / 'data/document-supplements.json').read_text())['entries']}
        entries = {e['number']: e for e in self.data['entries']}
        for raw, audit in zip(self.sections, self.data['sections']):
            self.assertEqual(raw, json.loads((importer.WORKSPACE / audit['raw_path']).read_text()))
            kept, removed, credits, ai = importer.clean_paragraphs(raw['paragraphs'], known)
            self.assertEqual(removed, audit['removed'])
            positions = [p['document_paragraph'] for p in kept + removed]
            self.assertEqual(len(positions), len(set(positions)))
            self.assertEqual(set(positions), {p['document_paragraph'] for p in raw['paragraphs']})
            if raw['number'] in entries:
                self.assertEqual(kept, entries[raw['number']]['paragraphs'])
                self.assertEqual(credits, entries[raw['number']]['credits'])
            self.assertEqual(raw['raw_characters'], sum(len(p['text']) for p in raw['paragraphs']))

    def test_duplicates_use_title_and_date_and_keep_existing_preference(self):
        normalize = importer.normalize_title
        for duplicate in self.data['duplicates']:
            for match in duplicate['matches']:
                self.assertEqual(normalize(duplicate['title']), normalize(match['title']))
                self.assertEqual(duplicate['published_at'], match['published_at'][:10])
            self.assertEqual(duplicate['preferred_archive_path'], duplicate['matches'][0]['archive_path'])
        counts = self.data['counts']
        self.assertEqual(counts['new_entries'] + counts['duplicate_sections'] + counts['excluded_sections'], 297)
        ids = {e['id'] for e in self.data['entries']}
        self.assertTrue(all(s['id'] in ids for s in self.data['suspected_duplicates']))

    def test_pending_plus_cards_covers_all_new_documents(self):
        cards = json.loads((BASE / 'data/articles.json').read_text())
        pending = json.loads((BASE / 'data/pending-ingestion.json').read_text())
        ids = {e['id'] for e in self.data['entries']}
        completed = ids & {c['id'] for c in cards}
        remaining = ids & {p.get('id') for p in pending}
        self.assertFalse(completed & remaining)
        self.assertEqual(ids, completed | remaining)
        self.assertEqual(len(json.loads((BASE / 'data/published-facts.json').read_text())), 2)

    def test_missing_schedule_images_are_explicit(self):
        self.assertEqual(len(self.data['schedules']), 10)
        missing = {s['published_at'] for s in self.data['schedules'] if not s['has_archived_images']}
        self.assertEqual(missing, {'2026-11-02', '2026-09-28', '2026-09-21', '2026-06-15', '2026-06-01', '2026-05-25'})


@unittest.skipUnless((BASE / 'work/summary2-fact-scan.json').exists(), '事实扫描未完成')
class Summary2RefinementTests(unittest.TestCase):
    def test_each_article_has_a_unique_scan_and_fact_links(self):
        data = json.loads((BASE / 'data/document-supplements-summary2.json').read_text())
        scan = json.loads((BASE / 'work/summary2-fact-scan.json').read_text())['scan']
        entries = {e['id']: e for e in data['entries']}
        self.assertEqual(len(scan), len(entries))
        self.assertEqual({r['id'] for r in scan}, set(entries))
        facts = {f['id']: f for f in json.loads((BASE / 'data/fact-candidates.json').read_text()) if f['article_id'] in entries}
        self.assertEqual(set(facts), {fid for r in scan for fid in r['fact_ids']})
        for f in facts.values():
            self.assertFalse(f['publishable'])
            ps = {p['document_paragraph']: p['text'] for p in entries[f['article_id']]['paragraphs']}
            for evidence in f['evidence']:
                self.assertIn(evidence['quote'], ps[evidence['document_paragraph']])

    def test_new_cards_follow_latest_first_and_quotes_are_clean(self):
        data = json.loads((BASE / 'data/document-supplements-summary2.json').read_text())
        entries = {e['id']: e for e in data['entries']}
        cards = [c for c in json.loads((BASE / 'data/articles.json').read_text()) if c['id'] in entries]
        order = sorted(entries.values(), key=lambda e: (e['published_at_minute'], -e['number']), reverse=True)
        self.assertEqual({c['id'] for c in cards}, {e['id'] for e in order[:len(cards)]})
        for c in cards:
            ps = {p['document_paragraph']: p['text'] for p in entries[c['id']]['paragraphs']}
            for e in c['evidence'] + c['key_points']:
                self.assertIn(e['quote'], ps[e['document_paragraph']])

    def test_future_start_priority_precedes_conflicts(self):
        text = (BASE / '待核对清单.md').read_text()
        priority = text.index('## 尚未发生，优先核对')
        self.assertLess(priority, text.index('## 来源版本差异'))
        self.assertIn('candidate-docx-summary-0003-1', text[priority:text.index('## 来源版本差异')])
