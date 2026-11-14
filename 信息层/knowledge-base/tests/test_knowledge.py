"""Check provenance, historical/current separation, and useful retrieval."""
import importlib.util
import json
import sqlite3
import sys
import unittest
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE))
from query import search, fact_lookup

spec = importlib.util.spec_from_file_location('build', BASE / 'tools/build.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class KnowledgeTests(unittest.TestCase):
    def test_missing_content_exception_rejects_unread_substantive_articles(self):
        card = {'id': 'missing', 'summary': '正文在配图中，本文件无图，内容待补',
                'missing_content_note': '来源未提供图片', 'evidence': [], 'key_points': []}
        builder.validate_missing_content_card(card, {'paragraphs': []})
        builder.validate_missing_content_card(card, {'paragraphs': [{'text': '原文：BoHack'}]})
        with self.assertRaises(ValueError):
            builder.validate_missing_content_card(card, {'paragraphs': [{'text': '7月2日报名截止。'}]})
        with self.assertRaises(ValueError):
            builder.validate_missing_content_card({**card, 'people': [{'name': '猜测人物'}]}, {'paragraphs': []})

    def test_rejects_invented_evidence(self):
        with self.assertRaises(ValueError):
            builder.require_quote('下周二在北洋园', '去年课程在卫津路举行', 'test')

    def test_ai_image_transcription_is_not_an_original_passage(self):
        body = '这是原文中足够长的一段正常说明。\n\n> 配图文字转录（AI识别，未人工核对）：某项训练任务\n'
        parts = builder.chunks(body)
        self.assertTrue(parts)
        self.assertFalse(any('某项训练任务' in text for _, text in parts))

    def test_indexed_original_passages_are_verbatim(self):
        cards = {c['id']: c for c in builder.read_json(BASE / 'data/articles.json')}
        bodies = {i: (builder.ROOT / c['archive_path']).read_text() for i, c in cards.items()}
        with sqlite3.connect(BASE / 'data/search.sqlite') as db:
            for article_id, line, passage in db.execute("SELECT article_id,line,text FROM passages WHERE kind='原文'"):
                self.assertIn(passage, bodies[article_id])
                self.assertEqual(passage.splitlines()[0], bodies[article_id].splitlines()[line-1].strip())
        db.close()

    def test_source_is_article_not_first_album_url(self):
        body = '合集：https://mp.weixin.qq.com/mp/appmsgalbum?id=1\n原文：https://mp.weixin.qq.com/s/actual\n'
        self.assertEqual(builder.article_url(body), 'https://mp.weixin.qq.com/s/actual')

    def test_short_schedule_lines_remain_searchable(self):
        result = search('双周周二', limit=20)
        self.assertTrue(any('4个密码' in r['title'] for r in result))
        self.assertTrue(any('双周周二晚18:30' in p['text'] for r in result for p in r['passages']))

    def test_series_classification_differences_are_visible(self):
        series = builder.read_json(BASE / 'data/series.json')
        lecture = next(s for s in series if s['name'] == '创业大讲堂')
        self.assertEqual(set(lecture['kinds']), {'课程', '活动'})
        self.assertTrue(lecture['classification_note'])

    def test_every_card_and_quote_is_grounded(self):
        cards = builder.read_json(BASE / 'data/articles.json')
        manifest = builder.read_json(BASE / 'work/manifest.json')
        supplements = builder.read_json(BASE / 'data/document-supplements.json')['entries']
        docx_cards = [c for c in cards if c.get('source_kind') == 'docx']
        extra_cards = [c for p in sorted((BASE / 'work/refinement-summary2').glob('batch-*-result.json')) for c in builder.read_json(p)['cards']]
        expected = manifest + (supplements if docx_cards else []) + extra_cards
        self.assertEqual({c['id'] for c in cards}, {c['id'] for c in expected})
        self.assertEqual(len(cards), len(expected))
        for c in cards:
            body = (builder.ROOT / c['archive_path']).read_text()
            if c.get('source_kind') == 'docx':
                self.assertIsNone(c['source_url'])
                self.assertTrue(c['source_document'])
                if c.get('content_status') == 'image_only_missing':
                    self.assertEqual(c['summary'], '正文在配图中，本文件无图，内容待补')
                    self.assertEqual(c['key_points'], [])
                    self.assertEqual(c['evidence'], [])
                else:
                    self.assertTrue(c['key_points'])
            else:
                self.assertEqual(c['source_url'], builder.article_url(body))
            for e in c['evidence']:
                self.assertIn(e['quote'], body)

    def test_unverified_facts_cannot_be_returned_as_current(self):
        records = builder.read_json(BASE / '人工核对记录.json')['records']
        approved = {r['candidate_id']: r for r in records if r['verdict'] == '对'}
        published = builder.read_json(BASE / 'data/published-facts.json')
        self.assertEqual({f['candidate_id'] for f in published}, set(approved))
        for f in builder.read_json(BASE / 'data/fact-candidates.json'):
            self.assertFalse(f['publishable'])
            self.assertEqual(f['verification_status'], '未核对')
        for f in published:
            self.assertEqual(f['verified_fields'], approved[f['candidate_id']]['verified_fields'])
            self.assertNotIn('registration_deadline', f)
        self.assertEqual(fact_lookup()['facts'], published)
        self.assertIn('尚未联系老师', fact_lookup()['message'])

    def test_course_alias_finds_same_course(self):
        found = search('X-lab 创业实战课', limit=5)
        self.assertTrue(found)
        self.assertTrue(any('商业计划书' in r['title'] for r in found))

    def test_join_question_returns_join_evidence(self):
        found = search('创业实战训练课怎么加入', limit=3)
        self.assertTrue(any(any('加入' in p['text'] or '入群' in p['text'] for p in r['passages']) for r in found))

    def test_robot_query_returns_specific_mentor(self):
        found = search('机器人方向的科创导师', limit=5)
        self.assertTrue(any('余辉' in r['title'] or '孟庆浩' in r['title'] for r in found))

    def test_out_of_scope_question_has_no_evidence(self):
        self.assertEqual(search('南极企鹅繁育基地'), [])

    def test_date_filter_and_provenance(self):
        found = search('创业', since='2026-11-01', until='2026-11-15')
        self.assertTrue(found)
        for r in found:
            self.assertTrue('2026-11-01' <= r['published_at'] <= '2026-11-15')
            self.assertTrue(r['source_url'] or (r['source_document'] and r['document_section']))
            self.assertTrue(r['passages'])


if __name__ == '__main__':
    unittest.main()
