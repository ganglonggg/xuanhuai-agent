const fs = require('node:fs');
const path = require('node:path');
const { hash, str, fail } = require('./storage');
const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
const stop = new Set(['什么','哪些','有没有','可以','这个','那个','怎么','如何','了解','帮我','一下','相关','关于','介绍','想要','想','我','的','了','吗','是','和','在','有','做','请','与','及','人']);
function terms(text) {
  const words = [...segmenter.segment(text.toLowerCase())].filter(x => x.isWordLike && !stop.has(x.segment)).map(x => x.segment);
  return [...new Set(words)];
}
function plain(markdown) {
  const text = markdown.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/^#+\s*/gm, '');
  const credits = /^(?:文案(?:整理)?|编辑|校审|终审|初审|校对|审核|责编|责任编辑|排版|版式|摄影|撰稿)(?:[\s&＆、/|｜·+]*(?:文案(?:整理)?|编辑|摄影|排版|版式))*\s*[:：]/;
  return text.split('\n').filter(line => {
    const normalized = line.replace(/^[\s>*_\\]+/, '').replace(/[\s*_\\]+$/, '');
    return !credits.test(normalized) && !/^原文含音视频[，,。\s].*未转录音视频内容/.test(normalized);
  }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
function createKnowledge(directory) {
  const articles = [];
  if (fs.existsSync(directory)) for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(directory, entry.name, '文章.md');
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, 'utf8');
    const title = raw.match(/^#\s+(.+)/m)?.[1] || entry.name;
    const date = entry.name.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '';
    const url = raw.match(/https?:\/\/mp\.weixin\.qq\.com\/s[^\s)]+/)?.[0] || '';
    // Keep the archival source; strip navigation metadata and recurring image links from retrieval text.
    const body = plain(raw.includes('\n---\n') ? raw.split('\n---\n').slice(1).join('\n---\n') : raw.replace(/^#.*\n/, '').replace(/^.*(?:原文链接|天津大学宣怀学院 ·).*$/gm, ''));
    const chunks = [];
    for (let i = 0; i < body.length; i += 650) chunks.push(body.slice(i, i + 950));
    articles.push({ id: hash(entry.name).slice(0, 16), title, date, url, body, chunks });
  }
  const card = a => ({ id: a.id, title: a.title, date: a.date, url: a.url });
  function search(query, limit = 5) {
    const q = str(query, '检索词', 300); const tokens = terms(q);
    if (!tokens.length) return [];
    const weights = new Map(tokens.map(t => [t, 1 + Math.log(1 + articles.length / (1 + articles.filter(d => `${d.title}${d.body}`.toLowerCase().includes(t)).length))]));
    const scoreText = text => tokens.reduce((n, t) => n + (text.includes(t) ? weights.get(t) : 0), 0);
    const scored = articles.map(a => {
      const title = a.title.toLowerCase(), body = a.body.toLowerCase();
      const snippets = a.chunks.map(text => ({ text, score: scoreText(text.toLowerCase()) })).sort((a,b) => b.score-a.score);
      const score = scoreText(title) * 3 + scoreText(body) + (snippets[0]?.score || 0);
      return { ...card(a), score, excerpts: snippets.filter(x => x.score > 0).slice(0, 2).map(x => x.text) };
    });
    return scored.filter(x => x.score > 0).sort((a,b) => b.score-a.score).slice(0, Math.min(Math.max(Number(limit)||5,1),8));
  }
  function getCard(id) { const a = articles.find(x => x.id === id); if (!a) fail('文章不存在',404); return { ...card(a), summary: a.body.slice(0,350) }; }
  return { search, getCard, count: articles.length, cards: () => articles.map(card) };
}
module.exports = { createKnowledge, terms };
