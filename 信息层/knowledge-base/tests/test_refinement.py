"""The Word refinement must be complete, attributable, and unpublished."""
import json
import sys
import unittest
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE))
from query import search, fact_lookup


@unittest.skipUnless((BASE / 'data/document-refinement-report.json').exists(), '提炼尚未构建')
class RefinementTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cards = json.loads((BASE / 'data/articles.json').read_text())
        cls.documents = {e['id']: e for e in json.loads((BASE / 'data/document-supplements.json').read_text())['entries']}
        cls.refined = [c for c in cls.cards if c['id'] in cls.documents]

    def test_all_new_articles_have_grounded_key_points(self):
        self.assertEqual({c['id'] for c in self.refined}, set(self.documents))
        self.assertEqual(len(self.refined), 46)
        for c in self.refined:
            self.assertEqual(c['processing_status'], '已提炼')
            self.assertTrue(c['key_points'])
            paragraphs = {p['document_paragraph']: p['text'] for p in self.documents[c['id']]['paragraphs']}
            for point in c['key_points']:
                self.assertTrue(point['text'].strip())
                self.assertIn(point['quote'], paragraphs[point['document_paragraph']])

    def test_new_cards_are_in_default_knowledge_search(self):
        result = search('致新班 报名', limit=5)
        cards = [r for r in result if r['id'] == 'docx-summary-0003']
        self.assertTrue(cards)
        card = cards[0]
        self.assertIsNone(card['source_url'])
        self.assertEqual(card['document_section'], 3)
        self.assertTrue(card['source_document'].endswith('.docx'))
        self.assertTrue(card['key_points'])
        self.assertTrue(all(p['document_paragraph'] for p in card['passages']))

    def test_future_registration_deadline_is_not_published_or_class_start(self):
        facts = json.loads((BASE / 'data/fact-candidates.json').read_text())
        candidates = [f for f in facts if f['article_id'] == 'docx-summary-0003' and str(f.get('registration_deadline')).startswith('2026-11-25')]
        self.assertTrue(candidates)
        for fact in candidates:
            self.assertIn('10:00', fact['registration_deadline'])
            self.assertNotEqual(fact.get('start_at'), fact['registration_deadline'])
            self.assertFalse(fact['publishable'])
            self.assertEqual(fact['verification_status'], '未核对')
        published = {f['candidate_id']: f for f in fact_lookup()['facts']}
        self.assertIn('candidate-docx-summary-0003-1', published)
        interview = published['candidate-docx-summary-0003-1']
        self.assertEqual(interview['start_at'], '2026-11-28')
        self.assertNotIn('registration_deadline', interview)
        self.assertEqual(interview['not_verified']['registration_deadline'], {
            'value': '2026-11-25T10:00:00+08:00',
            'verification_status': '未经人工确认', 'present_in_candidate': True})


if __name__ == '__main__':
    unittest.main()
