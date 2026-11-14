"""Human confirmation publishes only explicitly reviewed fields."""
import contextlib
from copy import deepcopy
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE))
import query

spec = importlib.util.spec_from_file_location('publication_builder', BASE / 'tools/build.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.candidate = {
            'id': 'candidate-test', 'title': '课程标题', 'article_id': 'article-test',
            'start_at': '2026-11-20', 'end_at': '2026-11-20T17:00:00+08:00',
            'location': None, 'registration_deadline': '2026-09-29',
            'registration': {'method': '报名表', 'open': True},
            'audience': '尚未确认的受众', 'summary': '尚未确认的整段摘要',
            'verification_status': '未核对', 'publishable': False,
        }
        self.record = {
            'candidate_id': 'candidate-test', 'verdict': '对',
            'verified_fields': {'start_at': '2026-11-21'},
            'not_verified': ['end_at', 'location', 'registration', 'registration_deadline', '面试具体时间'],
            'verified_by': 'Charles', 'verified_at': '2026-11-15',
            'note': '报名截止已过，仅限已报名同学使用。', 'method': '口头确认',
        }

    def publish(self, records=None):
        return builder.publish_reviewed_facts([self.candidate], [self.record] if records is None else records)

    def test_only_reviewed_fields_are_promoted_and_original_is_untouched(self):
        before = deepcopy(self.candidate)
        record_before = deepcopy(self.record)
        result = self.publish()[0]
        self.assertTrue(result['publishable'])
        self.assertEqual(result['start_at'], '2026-11-21')
        self.assertEqual(result['verified_fields'], self.record['verified_fields'])
        for field in ['end_at', 'location', 'registration', 'registration_deadline', 'audience', 'summary', 'title']:
            self.assertNotIn(field, result)
        for field in ['verified_by', 'verified_at', 'note', 'method']:
            self.assertEqual(result[field], self.record[field])
        self.assertEqual(result['source']['title'], '课程标题')
        self.assertEqual(self.candidate, before)
        self.assertEqual(self.record, record_before)
        result['not_verified']['registration']['value']['open'] = False
        self.assertTrue(self.candidate['registration']['open'])

    def test_unverified_values_and_missing_fields_are_individually_labelled(self):
        result = self.publish()[0]
        for field in self.record['not_verified']:
            self.assertEqual(result['not_verified'][field], {
                'value': self.candidate.get(field),
                'verification_status': '未经人工确认',
                'present_in_candidate': field in self.candidate,
            })
        self.assertTrue(result['not_verified']['location']['present_in_candidate'])
        self.assertFalse(result['not_verified']['面试具体时间']['present_in_candidate'])

    def test_no_records_and_other_verdicts_publish_nothing(self):
        self.assertEqual(self.publish([]), [])
        for verdict in ['错', '待确认', None]:
            with self.subTest(verdict=verdict):
                self.record['verdict'] = verdict
                self.assertEqual(self.publish(), [])

    def test_unknown_id_errors_even_for_non_approved_record(self):
        for verdict in ['对', '错']:
            with self.subTest(verdict=verdict):
                self.record.update(candidate_id='missing', verdict=verdict)
                with self.assertRaisesRegex(ValueError, '候选ID不存在: missing'):
                    self.publish()

    def test_conflicting_duplicate_and_reserved_fields_are_rejected(self):
        bad_records = []
        overlap = deepcopy(self.record)
        overlap['not_verified'].append('start_at')
        bad_records.append([overlap])
        reserved = deepcopy(self.record)
        reserved['verified_fields']['publishable'] = True
        bad_records.append([reserved])
        empty = deepcopy(self.record)
        empty['verified_fields'] = {}
        bad_records.append([empty])
        bad_records.append([self.record, self.record])
        for records in bad_records:
            with self.subTest(records=records), self.assertRaises(ValueError):
                self.publish(records)

    def test_build_reads_records_and_fails_before_writing_on_unknown_id(self):
        original_read = builder.read_json

        def read(path):
            if path == BASE / '人工核对记录.json':
                return {'records': [dict(self.record, candidate_id='missing')]}
            return original_read(path)

        with patch.object(builder, 'read_json', side_effect=read), patch.object(builder, 'write_json') as write:
            with self.assertRaisesRegex(ValueError, '候选ID不存在: missing'):
                builder.build()
            write.assert_not_called()

    def test_real_build_matches_both_reviews_and_preserves_future_deadline_as_unverified(self):
        candidates = builder.read_json(BASE / 'data/fact-candidates.json')
        records = builder.read_json(BASE / '人工核对记录.json')['records']
        actual = builder.read_json(BASE / 'data/published-facts.json')
        expected = builder.publish_reviewed_facts(candidates, records)
        self.assertEqual(actual, expected)
        self.assertEqual(len(actual), 2)
        self.assertEqual(builder.read_json(BASE / 'data/build-report.json')['published_facts'], 2)
        for fact in actual:
            self.assertNotIn('registration_deadline', fact)
            self.assertEqual(fact['not_verified']['registration_deadline']['verification_status'], '未经人工确认')

    def test_query_and_cli_read_publication_and_show_review_scope(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'data').mkdir()
            with patch.object(query, 'BASE', root):
                self.assertEqual(query.fact_lookup()['facts'], [])
                published = self.publish()
                (root / 'data/published-facts.json').write_text(json.dumps(published), encoding='utf-8')
                self.assertEqual(query.fact_lookup()['facts'], published)
                output = io.StringIO()
                with patch.object(sys, 'argv', ['query.py', '--facts']), contextlib.redirect_stdout(output):
                    query.main()
                self.assertIn('start_at：2026-11-21（已人工确认）', output.getvalue())
                self.assertIn('registration_deadline：2026-09-29（未经人工确认）', output.getvalue())
                self.assertIn(self.record['note'], output.getvalue())
                (root / 'data/published-facts.json').write_text(json.dumps([self.candidate]), encoding='utf-8')
                self.assertEqual(query.fact_lookup()['facts'], [])


if __name__ == '__main__':
    unittest.main()
