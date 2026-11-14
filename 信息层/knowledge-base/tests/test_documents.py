"""Supplement retrieval stays verbatim, separate, and source-addressable."""
import contextlib
import io
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch
from xml.etree import ElementTree

BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE))
import query


class DocumentSearchTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.base = Path(self.directory.name)
        (self.base / 'data').mkdir()

        def entry(identifier, title, text, date, paragraph):
            return {'id': identifier, 'title': title, 'number': paragraph,
                    'published_at': date, 'source_url': None,
                    'archive_path': identifier + '.md',
                    'source_document': '信息层/汇总.docx',
                    'document_section': 3, 'status': '待提炼',
                    'paragraphs': [{'document_paragraph': paragraph, 'text': text}]}

        data = {'source_document': '信息层/汇总.docx', 'entries': [
            entry('one', '创业实战训练课', '创业实战训练课研究星际传感器。', '2026-10-10', 28),
            entry('two', '创业讲座', '创业项目研究海底机器人。', '2026-09-01', 44),
        ], 'duplicates': [entry('duplicate', '重复文章', '银杏奖报名通知。', '2026-10-01', 99)],
            'excluded': [entry('account', '账号页', '账号概览星河号。', '2026-10-01', 120)]}
        (self.base / 'data/document-supplements.json').write_text(json.dumps(data, ensure_ascii=False))
        (self.base / 'data/series.json').write_text(json.dumps([
            {'name': '创业实战训练课', 'aliases': ['X-lab 创业实战课']}
        ], ensure_ascii=False))
        self.base_patch = patch.object(query, 'BASE', self.base)
        self.base_patch.start()
        self.addCleanup(self.base_patch.stop)

    def test_source_and_status_are_explicit_without_synthetic_summary(self):
        result = query.search_documents('星际传感器')[0]
        self.assertEqual(result['status'], '待提炼')
        self.assertNotIn('summary', result)
        self.assertNotIn('source_url', result)
        self.assertIn('缺原文URL、无图片', result['notice'])
        self.assertIn('历史资料不代表当前安排', result['notice'])
        passage = result['passages'][0]
        self.assertEqual(passage['text'], '创业实战训练课研究星际传感器。')
        self.assertEqual(passage['source_document'], '信息层/汇总.docx')
        self.assertEqual(passage['document_section'], 3)
        self.assertEqual(passage['document_paragraph'], 28)

    def test_dates_and_literal_series_filter(self):
        results = query.search_documents('研究', since='2026-10-01', until='2026-10-31')
        self.assertEqual([r['id'] for r in results], ['one'])
        self.assertEqual(query.search_documents('研究', until='2026-08-31'), [])
        results = query.search_documents('研究', series='X-lab 创业实战课')
        self.assertEqual([r['id'] for r in results], ['one'])
        self.assertEqual(query.search_documents('研究', series='不存在的系列'), [])

    def test_excludes_duplicate_and_account_page_and_incidental_common_word(self):
        self.assertEqual(query.search_documents('银杏奖'), [])
        self.assertEqual(query.search_documents('星河号'), [])
        self.assertEqual(query.search_documents('创业南极企鹅繁育基地'), [])

    def test_document_cli_uses_local_citation_not_none_url(self):
        output = io.StringIO()
        with patch.object(sys, 'argv', ['query.py', '星际传感器', '--documents']), contextlib.redirect_stdout(output):
            query.main()
        text = output.getvalue()
        self.assertIn('本地来源：信息层/汇总.docx，第 3 节', text)
        self.assertIn('DOCX第 28 段', text)
        self.assertNotIn('原文：None', text)


@unittest.skipUnless((BASE / 'data/document-supplements.json').exists(), 'Word 导入尚未落盘')
class RealDocumentProvenanceTests(unittest.TestCase):
    def test_every_imported_paragraph_matches_its_original_docx_position(self):
        data = json.loads((BASE / 'data/document-supplements.json').read_text())
        root = BASE.parents[1]
        document = root / data['source_document']
        with zipfile.ZipFile(document) as package:
            xml = ElementTree.fromstring(package.read('word/document.xml'))
        ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        paragraphs = [''.join(t.text or '' for t in p.findall('.//w:t', ns))
                      for p in xml.findall('.//w:p', ns)]
        self.assertEqual(len(data['entries']), 46)
        self.assertEqual(len(data['duplicates']), 8)
        cards = json.loads((BASE / 'data/articles.json').read_text())
        refined_ids = {c['id'] for c in cards if c.get('source_kind') == 'docx'}
        for entry in data['entries']:
            self.assertEqual(entry['status'], '已提炼' if entry['id'] in refined_ids else '待提炼')
            self.assertIsNone(entry['source_url'])
            self.assertTrue((root / entry['archive_path']).exists())
            for passage in entry['paragraphs']:
                self.assertEqual(passage['text'], paragraphs[passage['document_paragraph'] - 1])


if __name__ == '__main__':
    unittest.main()
