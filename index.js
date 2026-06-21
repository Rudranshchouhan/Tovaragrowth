const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.warn('Warning: GEMINI_API_KEY is not set. Set it in .env for production use.');
}

// Serve static frontend from project root
app.use(express.static(path.join(__dirname, '..')));

function isValidHttpUrl(string) {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

async function fetchHtml(targetUrl) {
  const res = await axios.get(targetUrl, {
    timeout: 15000,
    headers: {
      'User-Agent': 'SiteRoastAI/1.0 (+https://siteroast.ai)'
    }
  });
  return res.data;
}

function extractData(html, baseUrl) {
  const $ = cheerio.load(html);

  // remove script and style
  $('script, style, noscript').remove();

  const title = ($('head title').first().text() || '').trim();
  const metaDescription = ($('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '').trim();

  const headings = [];
  for (let i = 1; i <= 6; i++) {
    $(`h${i}`).each((_, el) => {
      const text = $(el).text().trim();
      if (text) headings.push({ tag: `h${i}`, text });
    });
  }

  // visible text — crude: body text without scripts/styles
  const body = $('body').text().replace(/\s+/g, ' ').trim();

  // links
  const links = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href').trim();
    const text = $(el).text().trim();
    if (!href) return;
    links.push({ href, text });
  });

  // forms
  const forms = [];
  $('form').each((_, f) => {
    const $f = $(f);
    const action = $f.attr('action') || '';
    const method = ($f.attr('method') || 'get').toLowerCase();
    const inputs = [];
    $f.find('input,textarea,select,button').each((_, i) => {
      const $i = $(i);
      inputs.push({
        tag: i.tagName.toLowerCase(),
        type: $i.attr('type') || null,
        name: $i.attr('name') || null,
        placeholder: $i.attr('placeholder') || null,
        required: !!$i.attr('required')
      });
    });
    forms.push({ action, method, inputs });
  });

  // CTA buttons — buttons and links that look like CTAs
  const ctaCandidates = [];
  const ctaKeywords = ['get', 'try', 'start', 'signup', 'sign up', 'buy', 'purchase', 'download', 'free', 'demo', 'book', 'schedule'];

  $('button, a').each((_, el) => {
    const $el = $(el);
    const text = $el.text().trim();
    const classes = ($el.attr('class') || '').toLowerCase();
    const tag = el.tagName.toLowerCase();
    const href = tag === 'a' ? ($el.attr('href') || '') : '';

    // heuristic: class contains btn or text contains keywords
    const isBtnClass = classes.includes('btn') || classes.includes('button');
    const textLower = text.toLowerCase();
    const hasKeyword = ctaKeywords.some(k => textLower.includes(k));

    if (isBtnClass || hasKeyword) {
      ctaCandidates.push({ tag, text, href, classes });
    }
  });

  return {
    title,
    meta_description: metaDescription,
    headings,
    visible_text: body.slice(0, 40000),
    links,
    forms,
    ctas: ctaCandidates.slice(0, 50),
    url: baseUrl
  };
}

async function callGemini(extracted) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');

  const prompt = `You are SiteRoast AI. Analyze the following website extraction JSON and return ONLY valid JSON with the exact schema shown below. Do not add extra fields or explanatory text. Schema: {"overall_score": <int 0-100>, "conversion_score": <int>, "trust_score": <int>, "seo_score": <int>, "ux_score": <int>, "top_issues": ["..."], "top_recommendations": ["..."]} Respond with that JSON only. Here is the extracted data: ${JSON.stringify(extracted)}\nMake scores realistic, justify recommendations by looking at extracted fields (headings, meta description, links, forms, ctas, visible_text). Provide up to 5 concise issues and 5 concise prioritized recommendations.`;

  const url = `https://generativelanguage.googleapis.com/v1beta2/models/text-bison-001:generate?key=${GEMINI_API_KEY}`;

  const body = {
    prompt: { text: prompt },
    temperature: 0.2,
    max_output_tokens: 512
  };

  const res = await axios.post(url, body, { timeout: 60000 });

  // Attempt to read the generated text from possible response locations
  let raw = null;
  try {
    if (res.data && res.data.candidates && res.data.candidates[0] && res.data.candidates[0].content) raw = res.data.candidates[0].content;
    else if (res.data && res.data.candidates && res.data.candidates[0] && res.data.candidates[0].output) raw = res.data.candidates[0].output;
    else if (res.data && res.data.output && res.data.output[0] && res.data.output[0].content) raw = res.data.output[0].content;
    else if (typeof res.data === 'string') raw = res.data;
    else raw = JSON.stringify(res.data);
  } catch (err) {
    raw = JSON.stringify(res.data || {});
  }

  // If response is wrapped, try to find first JSON block in text
  const jsonTextMatch = raw.match(/\{[\s\S]*\}/);
  const jsonText = jsonTextMatch ? jsonTextMatch[0] : raw;

  const parsed = JSON.parse(jsonText);
  // basic validation: ensure numeric scores and arrays
  const ensureInt = v => (typeof v === 'number' ? Math.round(v) : parseInt(v, 10) || 0);
  return {
    overall_score: ensureInt(parsed.overall_score),
    conversion_score: ensureInt(parsed.conversion_score),
    trust_score: ensureInt(parsed.trust_score),
    seo_score: ensureInt(parsed.seo_score),
    ux_score: ensureInt(parsed.ux_score),
    top_issues: Array.isArray(parsed.top_issues) ? parsed.top_issues.slice(0,5) : [],
    top_recommendations: Array.isArray(parsed.top_recommendations) ? parsed.top_recommendations.slice(0,5) : []
  };
}

app.post('/api/analyze', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || !isValidHttpUrl(url)) {
      return res.status(400).json({ error: 'Invalid or missing `url` in request body.' });
    }

    // fetch html
    const html = await fetchHtml(url);
    const extracted = extractData(html, url);

    // call Gemini
    const geminiResult = await callGemini(extracted);

    return res.json({ success: true, data: geminiResult });
  } catch (err) {
    console.error('Analyze error:', err.message || err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.get('/health', (_, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
