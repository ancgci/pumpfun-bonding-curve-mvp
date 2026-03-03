const API_BASE = 'http://localhost:3001/api';

// ════════════════════════════════════════════════════════
// API HELPERS
// ════════════════════════════════════════════════════════
async function apiFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

function showToast(msg, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('visible'), 10);
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

// ════════════════════════════════════════════════════════
// FETCH FUNCTIONS
// ════════════════════════════════════════════════════════
async function fetchStats() {
  try {
    const data = await apiFetch(`${API_BASE}/stats`);
    updateStats(data);
  } catch (e) { console.error('Error fetching stats:', e); }
}

async function fetchPositions() {
  try {
    const data = await apiFetch(`${API_BASE}/positions`);
    updatePositions(data);
  } catch (e) { console.error('Error fetching positions:', e); }
}

async function fetchAgentStats() {
  try {
    const data = await apiFetch(`${API_BASE}/agent/stats`);
    updateAgentStatus(data);
  } catch (e) { console.error('Error fetching agent stats:', e); }
}

async function fetchTradeHistory() {
  try {
    const data = await apiFetch(`${API_BASE}/agent/trades`);
    updateTradeHistory(data);
  } catch (e) { console.error('Error fetching trade history:', e); }
}

async function fetchSimulationStatus() {
  try {
    const data = await apiFetch(`${API_BASE}/simulation/status`);
    updateSimulationStatus(data);
  } catch (e) { console.error('Error fetching simulation status:', e); }
}

async function fetchSimulationTrades() {
  try {
    const data = await apiFetch(`${API_BASE}/simulation/trades?limit=10`);
    updateSimulationTrades(data);
  } catch (e) { console.error('Error fetching simulation trades:', e); }
}

async function fetchPatterns() {
  try {
    const data = await apiFetch(`${API_BASE}/agent/patterns`);
    updatePatterns(data);
  } catch (e) { console.error('Error fetching patterns:', e); }
}

async function fetchBotHealth() {
  try {
    const data = await apiFetch(`${API_BASE}/bot-health`);
    updateBotHealth(data);
  } catch (e) { console.error('Error fetching bot health:', e); }
}

async function fetchTradingConfig() {
  try {
    const data = await apiFetch(`${API_BASE}/trading-config`);
    applyTradingConfig(data);
  } catch (e) { console.error('Error fetching trading config:', e); }
}

async function fetchProtocolConfig() {
  try {
    const data = await apiFetch(`${API_BASE}/protocol-config`);
    applyProtocolConfig(data);
  } catch (e) { console.error('Error fetching protocol config:', e); }
}

async function fetchEmergencyStop() {
  try {
    const data = await apiFetch(`${API_BASE}/emergency-stop`);
    updateEmergencyBanner(data.active);
  } catch (e) { console.error('Error fetching emergency stop:', e); }
}

async function fetchLearnedRules() {
  try {
    // We re-use the patterns endpoint but display as rules for LearnerAgent
    const rawRes = await fetch(`${API_BASE}/agent/logs`);
    // Also load patterns file which has the learned rules
    const patternsRes = await fetch(`${API_BASE}/agent/patterns`);
    const patterns = await patternsRes.json();
    updateLearnedRules(patterns);
  } catch (e) { console.error('Error fetching learned rules:', e); }
}

// ════════════════════════════════════════════════════════
// CONTROL ACTIONS
// ════════════════════════════════════════════════════════

// --- Agent Toggle ---
async function toggleAgent() {
  try {
    await apiFetch(`${API_BASE}/agent/toggle`, { method: 'POST' });
    setTimeout(fetchAgentStats, 500);
  } catch (err) {
    showToast('Failed to toggle agent: ' + err.message, 'error');
  }
}

// --- Mode Toggle ---
async function toggleMode() {
  try {
    await apiFetch(`${API_BASE}/agent/mode`, { method: 'POST' });
    setTimeout(fetchAgentStats, 500);
  } catch (err) {
    showToast('Failed to change mode: ' + err.message, 'error');
  }
}

// --- Auto Buy Toggle ---
async function toggleAutoBuy(value) {
  try {
    await apiFetch(`${API_BASE}/trading-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoBuyEnabled: value }),
    });
    // Update label immediately (don't wait for next refresh)
    const lbl = document.getElementById('toggleAutoBuyLabel');
    if (lbl) lbl.textContent = value ? 'ON' : 'OFF';
    showToast(`Auto Buy ${value ? 'enabled ✅' : 'disabled ⏸️'}`);
  } catch (err) {
    // Revert checkbox on failure
    const chk = document.getElementById('toggleAutoBuyCheckbox');
    if (chk) chk.checked = !value;
    showToast('Failed to set Auto Buy: ' + err.message, 'error');
  }
}

// --- Single Trade Mode Toggle ---
async function toggleSingleTrade(value) {
  try {
    await apiFetch(`${API_BASE}/trading-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ singleTradeMode: value }),
    });
    // Update label immediately (don't wait for next refresh)
    const lbl = document.getElementById('toggleSingleTradeLabel');
    if (lbl) lbl.textContent = value ? 'ON' : 'OFF';
    showToast(`Single Trade Mode ${value ? 'enabled ✅' : 'disabled ⏸️'}`);
  } catch (err) {
    // Revert checkbox on failure
    const chk = document.getElementById('toggleSingleTradeCheckbox');
    if (chk) chk.checked = !value;
    showToast('Failed to set Single Trade Mode: ' + err.message, 'error');
  }
}

// --- Emergency Stop ---
async function triggerEmergencyStop(active, reason = '') {
  const confirmed = active
    ? confirm('⚠️ EMERGENCY STOP will halt ALL trading immediately. Continue?')
    : true;
  if (!confirmed) return;

  try {
    await apiFetch(`${API_BASE}/emergency-stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active, reason }),
    });
    updateEmergencyBanner(active);
    if (active) showToast('🚨 Emergency Stop activated!', 'warning');
    else showToast('✅ Emergency Stop cancelled');
    setTimeout(refreshAll, 700);
  } catch (err) {
    showToast('Emergency stop failed: ' + err.message, 'error');
  }
}

// --- Circuit Breaker Reset ---
async function resetCircuitBreaker() {
  const confirmed = confirm('Reset Circuit Breaker? This will allow the bot to trade again.');
  if (!confirmed) return;
  try {
    await apiFetch(`${API_BASE}/cb-reset`, { method: 'POST' });
    showToast('✅ Circuit Breaker reset successfully');
    setTimeout(refreshAll, 700);
  } catch (err) {
    showToast('CB reset failed: ' + err.message, 'error');
  }
}

// --- Save Trading Params ---
async function saveTradingParams() {
  const config = {
    buyAmountSol: parseFloat(document.getElementById('buyAmountInput').value),
    takeProfitPercent: parseFloat(document.getElementById('takeProfitInput').value),
    stopLossPercent: parseFloat(document.getElementById('stopLossInput').value),
    agentMinConfidence: parseInt(document.getElementById('confidenceInput').value),
    jitoTipAmount: parseFloat(document.getElementById('jitoTipInput').value),
    slippageBps: parseInt(document.getElementById('slippageInput').value),
    autoSellTakeProfit: document.getElementById('toggleAutoSellTPCheckbox').checked,
    autoSellStopLoss: document.getElementById('toggleAutoSellSLCheckbox').checked,
    sellPercentOnTp: parseInt(document.getElementById('sellPercentInput').value),
  };
  try {
    await apiFetch(`${API_BASE}/trading-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    const msg = document.getElementById('paramsSavedMsg');
    msg.textContent = '✅ Saved at ' + new Date().toLocaleTimeString();
    msg.style.opacity = 1;
    setTimeout(() => { msg.style.opacity = 0; }, 4000);
  } catch (err) {
    showToast('Save failed: ' + err.message, 'error');
  }
}

// --- Protocol Toggle ---
async function toggleProtocol(protocol, value) {
  try {
    await apiFetch(`${API_BASE}/protocol-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [protocol]: value }),
    });
    showToast(`${protocol} ${value ? 'enabled' : 'disabled'}`);
  } catch (err) {
    showToast('Failed to update protocol: ' + err.message, 'error');
  }
}

// --- Delete Pattern Rule ---
async function deleteRule(index) {
  try {
    await apiFetch(`${API_BASE}/agent/patterns/${index}`, { method: 'DELETE' });
    showToast('Rule deleted');
    fetchLearnedRules();
  } catch (err) {
    showToast('Delete failed: ' + err.message, 'error');
  }
}

// --- Clear All Rules ---
async function clearAllRules() {
  const confirmed = confirm('Clear ALL learned rules? The agent will start learning from scratch.');
  if (!confirmed) return;
  try {
    await apiFetch(`${API_BASE}/agent/patterns`, { method: 'DELETE' });
    showToast('✅ All rules cleared');
    fetchLearnedRules();
  } catch (err) {
    showToast('Clear failed: ' + err.message, 'error');
  }
}

// ════════════════════════════════════════════════════════
// UI UPDATE FUNCTIONS
// ════════════════════════════════════════════════════════

function updateBotHealth(data) {
  const badge = document.getElementById('botHealthBadge');
  const dot = document.getElementById('healthDot');
  const text = document.getElementById('botHealthText');

  const statusMap = {
    OPERATIONAL: { label: 'Operational', cls: 'health-ok' },
    RATE_LIMITED: { label: 'Rate Limited', cls: 'health-warn' },
    CIRCUIT_BREAKER_TRIPPED: { label: 'CB Tripped', cls: 'health-danger' },
    EMERGENCY_STOP: { label: 'EMERGENCY STOP', cls: 'health-danger' },
  };

  const s = statusMap[data.status] || { label: data.status, cls: 'health-warn' };
  dot.className = 'health-dot ' + s.cls;
  text.textContent = s.label;
  badge.className = 'bot-health-badge ' + s.cls;
}

function updateEmergencyBanner(active) {
  const banner = document.getElementById('emergencyBanner');
  const btn = document.getElementById('emergencyStopBtn');
  if (active) {
    banner.style.display = 'flex';
    btn.classList.add('active');
    btn.textContent = '✅ Cancel Emergency Stop';
  } else {
    banner.style.display = 'none';
    btn.classList.remove('active');
    btn.textContent = '🚨 EMERGENCY STOP';
  }
}

function applyTradingConfig(cfg) {
  const updateSliderAndInput = (sliderId, inputId, val) => {
    const slider = document.getElementById(sliderId);
    const input = document.getElementById(inputId);
    if (slider) slider.value = val;
    if (input) input.value = val;
  };
  updateSliderAndInput('buyAmountSlider', 'buyAmountInput', cfg.buyAmountSol ?? 0.01);
  updateSliderAndInput('takeProfitSlider', 'takeProfitInput', cfg.takeProfitPercent ?? 100);
  updateSliderAndInput('stopLossSlider', 'stopLossInput', cfg.stopLossPercent ?? 30);
  updateSliderAndInput('confidenceSlider', 'confidenceInput', cfg.agentMinConfidence ?? 70);
  updateSliderAndInput('jitoTipSlider', 'jitoTipInput', cfg.jitoTipAmount ?? 0.0001);
  updateSliderAndInput('slippageSlider', 'slippageInput', cfg.slippageBps ?? 300);

  if (cfg.autoBuyEnabled !== undefined) {
    const chk = document.getElementById('toggleAutoBuyCheckbox');
    if (chk) chk.checked = cfg.autoBuyEnabled;
    const lbl = document.getElementById('toggleAutoBuyLabel');
    if (lbl) lbl.textContent = cfg.autoBuyEnabled ? 'ON' : 'OFF';
  }
  if (cfg.singleTradeMode !== undefined) {
    const chk = document.getElementById('toggleSingleTradeCheckbox');
    if (chk) chk.checked = cfg.singleTradeMode;
    const lbl = document.getElementById('toggleSingleTradeLabel');
    if (lbl) lbl.textContent = cfg.singleTradeMode ? 'ON' : 'OFF';
  }

  // Novos campos TP/SL Auto Sell
  if (cfg.autoSellTakeProfit !== undefined) {
    const chk = document.getElementById('toggleAutoSellTPCheckbox');
    if (chk) chk.checked = cfg.autoSellTakeProfit;
  }
  if (cfg.autoSellStopLoss !== undefined) {
    const chk = document.getElementById('toggleAutoSellSLCheckbox');
    if (chk) chk.checked = cfg.autoSellStopLoss;
  }
  if (cfg.sellPercentOnTp !== undefined) {
    updateSliderAndInput('sellPercentSlider', 'sellPercentInput', cfg.sellPercentOnTp);
  }
}

function applyProtocolConfig(cfg) {
  const protocols = ['PUMPFUN', 'METEORA_DBC', 'BONK_FUN', 'DAOS_FUN', 'MOONSHOT'];
  for (const p of protocols) {
    const chk = document.getElementById(`proto-${p}`);
    if (chk) chk.checked = cfg[p] !== false;
  }
}

function updateLearnedRules(patterns) {
  const list = document.getElementById('rulesList');
  if (!patterns || patterns.length === 0) {
    list.innerHTML = '<p class="empty">No rules learned yet. The agent learns from losing trades every hour...</p>';
    return;
  }

  list.innerHTML = patterns.map((p, i) => {
    const ruleText = typeof p === 'string' ? p : (p.rule || p.name || JSON.stringify(p));
    return `
      <div class="rule-item">
        <div class="rule-index">#${i + 1}</div>
        <div class="rule-text">${ruleText}</div>
        <button class="btn-delete-rule" data-idx="${i}" title="Delete this rule">🗑</button>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.btn-delete-rule').forEach(btn => {
    btn.addEventListener('click', () => deleteRule(parseInt(btn.dataset.idx)));
  });
}

function updateStats(data) {
  document.getElementById('totalInvested').textContent = `${data.totalInvested} SOL`;
  document.getElementById('winRate').textContent = `${data.winRate}%`;
  document.getElementById('wins').textContent = data.wins;
  document.getElementById('losses').textContent = data.losses;

  // Circuit Breaker
  const cbCard = document.getElementById('cbCard');
  const cbText = document.getElementById('cbText');
  const cbDetails = document.getElementById('cbDetails');
  const statusDot = cbCard.querySelector('.status-dot');

  if (data.circuitBreaker.isTripped) {
    statusDot.classList.add('tripped');
    cbText.textContent = `TRIPPED — ${data.circuitBreaker.tripReason || 'Unknown reason'}`;
    cbText.style.color = '#ef4444';
  } else {
    statusDot.classList.remove('tripped');
    cbText.textContent = 'Operational';
    cbText.style.color = '#10b981';
  }

  cbDetails.innerHTML = `
    <div class="cb-detail">
      <div class="cb-detail-label">Daily Loss</div>
      <div class="cb-detail-value">${data.circuitBreaker.dailyLoss.toFixed(4)} SOL</div>
    </div>
    <div class="cb-detail">
      <div class="cb-detail-label">Consecutive Failures</div>
      <div class="cb-detail-value">${data.circuitBreaker.consecutiveFailures}</div>
    </div>
  `;
}

function updatePositions(positions) {
  const positionsList = document.getElementById('positionsList');
  const activeCount = document.getElementById('activeCount');
  activeCount.textContent = positions.length;

  if (positions.length === 0) {
    positionsList.innerHTML = '<p class="empty">No active positions at the moment</p>';
    return;
  }

  positionsList.innerHTML = positions.map(pos => `
    <div class="position-card">
      <div class="position-header">
        <div class="position-mint">${pos.mint.substring(0, 8)}...${pos.mint.substring(pos.mint.length - 6)}</div>
        <div class="position-age">⏱️ ${pos.ageFormatted}</div>
      </div>
      <div class="position-details">
        <div class="detail-item">
          <div class="detail-label">Invested</div>
          <div class="detail-value">${pos.buySolAmount.toFixed(4)} SOL</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Tokens</div>
          <div class="detail-value">${formatNumber(pos.buyTokenAmount)}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Take Profit</div>
          <div class="detail-value" style="color: #10b981;">+${pos.takeProfit}%</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Stop Loss</div>
          <div class="detail-value" style="color: #ef4444;">-${pos.stopLoss}%</div>
        </div>
      </div>
    </div>
  `).join('');
}

function formatNumber(num) {
  if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
  return num.toFixed(2);
}

function updateAgentStatus(data) {
  const agentStatus = document.getElementById('agentStatus');
  const agentMode = document.getElementById('agentMode');
  const agentConfidence = document.getElementById('agentConfidence');
  const agentLearning = document.getElementById('agentLearning');

  if (!data) return;

  agentStatus.textContent = data.enabled ? '✅ Active' : '⏸️ Disabled';
  agentMode.textContent = data.mode || 'SIMULATION';
  agentConfidence.textContent = `${(data.confidence || 0).toFixed(1)}%`;
  agentLearning.textContent = data.learningEnabled ? '✅ Enabled' : '❌ Disabled';

  const toggleAgentCheckbox = document.getElementById('toggleAgentCheckbox');
  const toggleAgentLabel = document.getElementById('toggleAgentLabel');
  if (toggleAgentCheckbox) {
    toggleAgentCheckbox.checked = data.enabled;
    toggleAgentLabel.textContent = data.enabled ? 'ON' : 'OFF';
  }

  const toggleModeCheckbox = document.getElementById('toggleModeCheckbox');
  const toggleModeLabel = document.getElementById('toggleModeLabel');
  if (toggleModeCheckbox) {
    const isLive = data.mode === 'LIVE';
    toggleModeCheckbox.checked = isLive;
    toggleModeLabel.textContent = isLive ? 'LIVE 🔥' : 'SIMULATION';
  }

  const rateLimitBadge = document.getElementById('agentRateLimit');
  if (data.rateLimited) {
    rateLimitBadge.textContent = 'LLM RATE LIMITED';
    rateLimitBadge.classList.add('rate-limited');
  } else {
    rateLimitBadge.textContent = 'LLM OK ✅';
    rateLimitBadge.classList.remove('rate-limited');
  }

  // Simulation Learning Progress
  if (data.simulation) {
    const simProgress = (data.simulation.tradesAnalyzed / (data.simulation.tradesRequired || 50)) * 100;
    document.getElementById('simProgressPercent').textContent = `${Math.min(simProgress, 100).toFixed(0)}%`;
    const fill = document.getElementById('simProgressFill');
    fill.style.width = `${Math.min(simProgress, 100)}%`;
    document.getElementById('simTradesAnalyzed').textContent = `${data.simulation.tradesAnalyzed}/${data.simulation.tradesRequired || 50}`;
    document.getElementById('simWinRateImprovement').textContent = `+${(data.simulation.winRateImprovement || 0).toFixed(1)}%`;
    document.getElementById('simNextOptimization').textContent = data.simulation.nextOptimization || 'Ready';
  }

  // Mainnet Learning Progress
  if (data.mainnet) {
    const mainnetProgress = (data.mainnet.tradesAnalyzed / (data.mainnet.tradesRequired || 50)) * 100;
    document.getElementById('mainnetProgressPercent').textContent = `${Math.min(mainnetProgress, 100).toFixed(0)}%`;
    const fill = document.getElementById('mainnetProgressFill');
    fill.style.width = `${Math.min(mainnetProgress, 100)}%`;
    document.getElementById('mainnetTradesAnalyzed').textContent = `${data.mainnet.tradesAnalyzed}/${data.mainnet.tradesRequired || 50}`;
    document.getElementById('mainnetWinRateImprovement').textContent = `+${(data.mainnet.winRateImprovement || 0).toFixed(1)}%`;
    document.getElementById('mainnetNextOptimization').textContent = data.mainnet.nextOptimization || 'Ready';
  }
}

function updateTradeHistory(trades) {
  const tradeHistoryList = document.getElementById('tradeHistoryList');
  if (!trades || trades.length === 0) {
    tradeHistoryList.innerHTML = '<p class="empty">No trades yet</p>';
    return;
  }
  tradeHistoryList.innerHTML = trades.slice(0, 10).map(trade => {
    const isProfitable = trade.pnl >= 0;
    const confidenceLevel = trade.confidence >= 75 ? 'high' : trade.confidence >= 50 ? 'medium' : 'low';
    return `
      <div class="trade-card ${isProfitable ? 'profit' : 'loss'}">
        <div class="trade-info">
          <div class="trade-token">${trade.token}</div>
          <div class="trade-meta">${trade.timestamp} · Entry: ${trade.entryPrice.toFixed(8)}</div>
        </div>
        <div class="trade-metrics">
          <div class="trade-pnl ${isProfitable ? 'profit' : 'loss'}">${isProfitable ? '+' : ''}${trade.pnl.toFixed(4)} SOL</div>
          <div class="confidence-badge ${confidenceLevel}">${trade.confidence.toFixed(0)}% confidence</div>
        </div>
      </div>
    `;
  }).join('');
}

function updatePatterns(patterns) {
  const patternsGrid = document.getElementById('patternsGrid');
  if (!patterns || patterns.length === 0) {
    patternsGrid.innerHTML = '<p class="empty">No trading patterns learned yet. Trading more will reveal patterns...</p>';
    return;
  }
  patternsGrid.innerHTML = patterns.map(pattern => `
    <div class="pattern-card">
      <div class="pattern-name">${pattern.name || 'Pattern'}</div>
      <div class="pattern-details">
        <div class="pattern-row">
          <span class="pattern-label">Accuracy</span>
          <span class="pattern-value">${(pattern.accuracy * 100).toFixed(1)}%</span>
        </div>
        <div class="pattern-row">
          <span class="pattern-label">Occurrences</span>
          <span class="pattern-value">${pattern.count}</span>
        </div>
        <div class="pattern-row">
          <span class="pattern-label">Avg Profit</span>
          <span class="pattern-value">+${(pattern.avgProfit * 100).toFixed(2)}%</span>
        </div>
        <div class="pattern-row">
          <span class="pattern-label">Confidence</span>
          <span class="pattern-value">${(pattern.confidence * 100).toFixed(1)}%</span>
        </div>
      </div>
    </div>
  `).join('');
}

function updateSimulationStatus(data) {
  if (!data || !data.metrics) {
    document.getElementById('simMode').textContent = 'SIMULATION';
    document.getElementById('simReadiness').textContent = '--/100';
    return;
  }
  document.getElementById('simMode').textContent = data.mode || 'SIMULATION';
  document.getElementById('simReadiness').textContent = `${(data.readinessScore || 0).toFixed(0)}/100 ${data.readyForLive ? '✅' : '⏳'}`;
  const m = data.metrics;
  document.getElementById('simWinRate').textContent = m.winRate ? `${m.winRate.toFixed(1)}%` : '--%';
  document.getElementById('simTotalTrades').textContent = m.totalTrades ?? '--';
  document.getElementById('simTotalPnl').textContent = m.totalPnL !== undefined ? `${m.totalPnL.toFixed(4)} SOL` : '--';
  document.getElementById('simDrawdown').textContent = m.maxDrawdown !== undefined ? `${m.maxDrawdown.toFixed(4)} SOL` : '--';

  const reasons = data.reasons || [];
  const reasonsEl = document.getElementById('simReasons');
  if (reasons.length === 0) {
    reasonsEl.innerHTML = '<span class="good">✅ Ready for LIVE</span>';
  } else {
    reasonsEl.innerHTML = reasons.map(r => `<span class="reason">${r}</span>`).join('');
  }
}

function updateSimulationTrades(trades) {
  const list = document.getElementById('simTradesList');
  if (!trades || trades.length === 0) {
    list.innerHTML = '<p class="empty">No simulation trades yet</p>';
    return;
  }
  list.innerHTML = trades.map(t => {
    const isWin = t.pnl > 0;
    return `
      <div class="sim-trade-card ${isWin ? 'profit' : 'loss'}">
        <div class="sim-trade-header">
          <div class="sim-trade-token">${t.tokenSymbol} · ${t.tokenMint.substring(0, 6)}...</div>
          <div class="sim-trade-status">${t.status}</div>
        </div>
        <div class="sim-trade-body">
          <div>Entry: ${t.entryPrice?.toFixed ? t.entryPrice.toFixed(8) : t.entryPrice}</div>
          <div>Exit: ${t.exitPrice?.toFixed ? t.exitPrice.toFixed(8) : t.exitPrice}</div>
          <div>Confidence: ${t.confidence}%</div>
        </div>
        <div class="sim-trade-pnl">${isWin ? '+' : ''}${t.pnl?.toFixed ? t.pnl.toFixed(4) : t.pnl} SOL (${t.pnlPercent?.toFixed ? t.pnlPercent.toFixed(2) : t.pnlPercent}%)</div>
      </div>
    `;
  }).join('');
}

function updateTimestamp() {
  const now = new Date();
  const t = now.toLocaleTimeString('en-US');
  const el = document.getElementById('lastUpdate');
  const elF = document.getElementById('lastUpdateFooter');
  if (el) el.textContent = t;
  if (elF) elF.textContent = t;
}

// ════════════════════════════════════════════════════════
// AGENT LIVE LOGS
// ════════════════════════════════════════════════════════
let lastLogCount = 0;
async function fetchAgentLogs() {
  try {
    const logs = await apiFetch(`${API_BASE}/agent/logs`);
    if (!Array.isArray(logs)) return;
    const container = document.getElementById('agentLogsContainer');
    if (logs.length !== lastLogCount && container) {
      if (logs.length === 0) {
        container.innerHTML = '<div class="loading">No agent activity logged yet...</div>';
      } else {
        container.innerHTML = logs.map(log => {
          let msgClass = 'log-msg';
          const msg = log.message || '';
          if (msg.includes('BUY') || msg.includes('TRADE')) msgClass += ' log-buy';
          else if (msg.includes('SKIP') || msg.includes('REJECTED')) msgClass += ' log-skip';
          else if (msg.includes('ERROR') || msg.includes('DUMP')) msgClass += ' log-error';
          else if (msg.includes('TP') || msg.includes('PROFIT')) msgClass += ' log-profit';

          const timeStr = log.timestamp
            ? new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false })
            : '';
          return `
            <div class="log-line">
              <span class="log-time">[${timeStr}]</span>
              <span class="log-level ${log.level}">${log.level}</span>
              <span class="${msgClass}">${escHtml(msg)}</span>
            </div>
          `;
        }).join('');
        container.scrollTop = container.scrollHeight;
      }
      lastLogCount = logs.length;
    }
  } catch (e) { console.error('Error fetching logs:', e); }
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ════════════════════════════════════════════════════════
// SLIDER ↔ INPUT SYNC
// ════════════════════════════════════════════════════════
function setupSliderSync(sliderId, inputId) {
  const slider = document.getElementById(sliderId);
  const input = document.getElementById(inputId);
  if (!slider || !input) return;
  slider.addEventListener('input', () => { input.value = slider.value; });
  input.addEventListener('input', () => { slider.value = input.value; });
}

// ════════════════════════════════════════════════════════
// REFRESH
// ════════════════════════════════════════════════════════
function refreshAll() {
  fetchStats();
  fetchPositions();
  fetchAgentStats();
  fetchTradeHistory();
  fetchPatterns();
  fetchSimulationStatus();
  fetchSimulationTrades();
  fetchBotHealth();
  fetchEmergencyStop();
  // NOTE: fetchTradingConfig and fetchProtocolConfig are NOT included here on purpose.
  // They are loaded once on page init. Calling them every 5s would overwrite
  // the user's toggle changes before they are properly persisted/confirmed.
  updateTimestamp();
}

// ════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {

  // Sync sliders ↔ inputs
  setupSliderSync('buyAmountSlider', 'buyAmountInput');
  setupSliderSync('takeProfitSlider', 'takeProfitInput');
  setupSliderSync('stopLossSlider', 'stopLossInput');
  setupSliderSync('confidenceSlider', 'confidenceInput');
  setupSliderSync('jitoTipSlider', 'jitoTipInput');
  setupSliderSync('slippageSlider', 'slippageInput');
  setupSliderSync('sellPercentSlider', 'sellPercentInput');

  // Controls
  document.getElementById('toggleAgentCheckbox')?.addEventListener('change', toggleAgent);
  document.getElementById('toggleModeCheckbox')?.addEventListener('change', toggleMode);
  document.getElementById('toggleAutoBuyCheckbox')?.addEventListener('change', e => toggleAutoBuy(e.target.checked));
  document.getElementById('toggleSingleTradeCheckbox')?.addEventListener('change', e => toggleSingleTrade(e.target.checked));

  // Emergency
  let emergencyActive = false;
  document.getElementById('emergencyStopBtn')?.addEventListener('click', () => {
    emergencyActive = !emergencyActive;
    triggerEmergencyStop(emergencyActive);
  });
  document.getElementById('cancelEmergencyStop')?.addEventListener('click', () => {
    emergencyActive = false;
    triggerEmergencyStop(false);
  });

  // CB Reset
  document.getElementById('cbResetBtn')?.addEventListener('click', resetCircuitBreaker);

  // Save Params
  document.getElementById('saveParamsBtn')?.addEventListener('click', saveTradingParams);

  // Clear Rules
  document.getElementById('clearAllRulesBtn')?.addEventListener('click', clearAllRules);

  // Protocol Toggles
  const protocols = ['PUMPFUN', 'METEORA_DBC', 'BONK_FUN', 'DAOS_FUN', 'MOONSHOT'];
  for (const p of protocols) {
    document.getElementById(`proto-${p}`)?.addEventListener('change', e => toggleProtocol(p, e.target.checked));
  }

  // Load configs on start
  fetchTradingConfig();
  fetchProtocolConfig();
  fetchLearnedRules();

  // Initial refresh
  refreshAll();
  fetchAgentLogs();

  // Auto-refresh
  setInterval(refreshAll, 5000);
  setInterval(fetchAgentLogs, 2000);
  setInterval(fetchLearnedRules, 15000);
});
