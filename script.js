document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.replace();

  const form = document.getElementById('auditForm');
  const urlInput = document.getElementById('urlInput');
  const loadingState = document.getElementById('loadingState');
  const resultsDashboard = document.getElementById('resultsDashboard');
  const resultsPanel = document.getElementById('resultsPanel');
  const btnText = document.getElementById('btnText');
  const loadingIcon = document.getElementById('loadingIcon');
  const targetUrlDisplay = document.getElementById('targetUrlDisplay');

  const overallEl = document.getElementById('overallScore');
  const convEl = document.getElementById('conversionScore');
  const trustEl = document.getElementById('trustScore');
  const seoEl = document.getElementById('seoScore');
  const uxEl = document.getElementById('uxScore');
  const issuesList = document.getElementById('issuesList');
  const recsList = document.getElementById('recommendationsList');

  function showLoading(show){
    if(show){
      loadingState.classList.remove('hidden');
      resultsDashboard.classList.add('hidden');
      loadingIcon.classList.remove('hidden');
      btnText.textContent = 'Analyzing...';
    } else {
      loadingState.classList.add('hidden');
      loadingIcon.classList.add('hidden');
      btnText.textContent = 'Analyze Website';
    }
  }

  function showResults(){
    resultsDashboard.classList.remove('hidden');
  }

  function seededRandom(seed){
    let h=0; for(let i=0;i<seed.length;i++){h=(h<<5)-h+seed.charCodeAt(i);h |= 0}
    return function(min=0,max=100){h = Math.imul(h, 48271) | 0; const r = Math.abs(h) % 1000 / 1000; return Math.round(min + r * (max-min));}
  }

  function generateLists(seedVal, scores){
    const issues = [];
    const recs = [];
    // simple deterministic pool
    const poolIssues = [
      'Missing clear primary CTA above the fold',
      'Weak headline — lacks value proposition',
      'Slow page load and large images',
      'No trust signals (testimonials, press, logos)',
      'Poor mobile layout for critical CTAs',
      'Broken or unclear pricing information',
      'Duplicate or thin content on main pages',
      'No meta title or description',
      'Confusing navigation and sitemap',
      'Form friction: too many fields'
    ];

    const poolRecs = [
      'Add a single, bold CTA with clear action text',
      'Rewrite headline to state the main benefit',
      'Compress and lazy-load hero images',
      'Add 2–3 customer testimonials with photos',
      'Simplify mobile CTA layout and increase tap targets',
      'Show pricing tiers with clear comparisons',
      'Expand key pages with unique, helpful copy',
      'Add concise meta title and meta description',
      'Improve header navigation with clear labels',
      'Reduce form fields and enable social sign-in'
    ];

    const rng = seededRandom(seedVal);
    const idxs = [];
    while(issues.length < 5){
      const i = rng(0, poolIssues.length-1);
      if(!idxs.includes(i)) { idxs.push(i); issues.push(poolIssues[i]); }
    }
    while(recs.length < 5){
      const i = rng(0, poolRecs.length-1);
      if(!recs.includes(poolRecs[i])) recs.push(poolRecs[i]);
    }

    // bias recommendations based on low scores
    if(scores.conversion < 60){ recs[0] = 'Prioritize above-the-fold CTA and test variants'; }
    if(scores.trust < 60){ recs[1] = 'Add social proof: testimonials, logos, and case studies'; }

    return {issues,recs};
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = urlInput.value.trim();
    if (!url) return;

    // show loading state
    showLoading(true);
    resultsPanel.classList.remove('hidden');
    targetUrlDisplay.textContent = url;
    issuesList.innerHTML = '';
    recsList.innerHTML = '';

    try {
      const resp = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `Server returned ${resp.status}`);
      }

      const payload = await resp.json();
      if (!payload || !payload.data) throw new Error('Invalid response from server');

      const data = payload.data;

      overallEl.textContent = data.overall_score ?? 0;
      convEl.textContent = data.conversion_score ?? 0;
      trustEl.textContent = data.trust_score ?? 0;
      seoEl.textContent = data.seo_score ?? 0;
      uxEl.textContent = data.ux_score ?? 0;

      issuesList.innerHTML = (data.top_issues || []).map(i => `<li>${i}</li>`).join('') || '<li>No issues found</li>';
      recsList.innerHTML = (data.top_recommendations || []).map(r => `<li>${r}</li>`).join('') || '<li>No recommendations</li>';

      showResults();
    } catch (err) {
      console.error('Analyze error:', err);
      resultsDashboard.classList.add('hidden');
      loadingState.classList.add('hidden');
      alert('Analysis failed: ' + (err.message || 'Unknown error'));
    } finally {
      showLoading(false);
      if (window.lucide) lucide.replace();
    }
  });
});
