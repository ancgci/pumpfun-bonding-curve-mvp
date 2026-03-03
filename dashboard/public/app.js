const API_BASE = 'http://localhost:3001/api';

// Fetch data from API
async function fetchStats() {
  try {
    const response = await fetch(`${API_BASE}/stats`);
    const data = await response.json();
    updateStats(data);
  } catch (error) {
    console.error('Error fetching stats:', error);
  }
}

async function fetchPositions() {
  try {
    const response = await fetch(`${API_BASE}/positions`);
    const data = await response.json();
    updatePositions(data);
  } catch (error) {
    console.error('Error fetching positions:', error);
  }
}

async function fetchAgentStats() {
  try {
    const response = await fetch(`${API_BASE}/agent/stats`);
    const data = await response.json();
    updateAgentStatus(data);
  } catch (error) {
    console.error('Error fetching agent stats:', error);
  }
}

async function fetchTradeHistory() {
  try {
    const response = await fetch(`${API_BASE}/agent/trades`);
    const data = await response.json();
    updateTradeHistory(data);
  } catch (error) {
    console.error('Error fetching trade history:', error);
  }
}

async function fetchSimulationStatus() {
  try {
    const response = await fetch(`${API_BASE}/simulation/status`);
    const data = await response.json();
    updateSimulationStatus(data);
  } catch (error) {
    console.error('Error fetching simulation status:', error);
  }
}

async function fetchSimulationTrades() {
  try {
    const response = await fetch(`${API_BASE}/simulation/trades?limit=10`);
    const data = await response.json();
    updateSimulationTrades(data);
  } catch (error) {
    console.error('Error fetching simulation trades:', error);
  }
}

async function fetchPatterns() {
  try {
    const response = await fetch(`${API_BASE}/agent/patterns`);
    const data = await response.json();
    updatePatterns(data);
  } catch (error) {
    console.error('Error fetching patterns:', error);
  }
}

// Toggle controls (hit backend via simple JSON files for now)
async function toggleAgent() {
  try {
    await fetch(`${API_BASE}/agent/toggle`, { method: 'POST' });
    setTimeout(fetchAgentStats, 500);
  } catch (err) {
    console.error('Error toggling agent', err);
  }
}

async function toggleMode() {
  try {
    await fetch(`${API_BASE}/agent/mode`, { method: 'POST' });
    setTimeout(fetchAgentStats, 500);
  } catch (err) {
    console.error('Error toggling mode', err);
  }
}
// Update interface
function updateStats(data) {
  document.getElementById('totalInvested').textContent = `${data.totalInvested} SOL`;
  document.getElementById('winRate').textContent = `${data.winRate}%`;
  document.getElementById('wins').textContent = data.wins;
  document.getElementById('losses').textContent = data.losses;

  // Circuit Breaker
  const cbCard = document.getElementById('cbCard');
  const cbStatus = document.getElementById('cbStatus');
  const cbText = document.getElementById('cbText');
  const cbDetails = document.getElementById('cbDetails');
  const statusDot = cbCard.querySelector('.status-dot');

  if (data.circuitBreaker.isTripped) {
    statusDot.classList.add('tripped');
    cbText.textContent = `TRIPPED - ${data.circuitBreaker.tripReason || 'Unknown reason'}`;
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

  if (data) {
    agentStatus.textContent = data.enabled ? '✅ Active' : '⏸️ Disabled';
    agentMode.textContent = data.mode || 'SIMULATION';
    agentConfidence.textContent = `${(data.confidence || 0).toFixed(1)}%`;
    agentLearning.textContent = data.learningEnabled ? '✅ Enabled' : '❌ Disabled';

    // Update Form Controls (Premium Toggles)
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
      toggleModeLabel.textContent = isLive ? 'LIVE' : 'SIMULATION';
    }

    const rateLimitBadge = document.getElementById('agentRateLimit');
    if (data.rateLimited) {
      rateLimitBadge.textContent = 'LLM RATE LIMITED';
      rateLimitBadge.classList.add('rate-limited');
    } else {
      rateLimitBadge.textContent = 'LLM OK';
      rateLimitBadge.classList.remove('rate-limited');
    }

    // Update Simulation Learning Progress
    if (data.simulation) {
      const simProgressPercent = document.getElementById('simProgressPercent');
      const simProgressFill = document.getElementById('simProgressFill');
      const simTradesAnalyzed = document.getElementById('simTradesAnalyzed');
      const simWinRateImprovement = document.getElementById('simWinRateImprovement');
      const simNextOptimization = document.getElementById('simNextOptimization');

      const simProgress = (data.simulation.tradesAnalyzed / (data.simulation.tradesRequired || 50)) * 100;
      simProgressPercent.textContent = `${Math.min(simProgress, 100).toFixed(0)}%`;
      simProgressFill.style.width = `${Math.min(simProgress, 100)}%`;
      simProgressFill.textContent = `${Math.min(simProgress, 100).toFixed(0)}%`;
      simTradesAnalyzed.textContent = `${data.simulation.tradesAnalyzed}/${data.simulation.tradesRequired || 50}`;
      simWinRateImprovement.textContent = `+${(data.simulation.winRateImprovement || 0).toFixed(1)}%`;

      if (data.simulation.nextOptimization) {
        simNextOptimization.textContent = data.simulation.nextOptimization;
      } else {
        simNextOptimization.textContent = 'Ready';
      }
    }

    // Update Mainnet Learning Progress
    if (data.mainnet) {
      const mainnetProgressPercent = document.getElementById('mainnetProgressPercent');
      const mainnetProgressFill = document.getElementById('mainnetProgressFill');
      const mainnetTradesAnalyzed = document.getElementById('mainnetTradesAnalyzed');
      const mainnetWinRateImprovement = document.getElementById('mainnetWinRateImprovement');
      const mainnetNextOptimization = document.getElementById('mainnetNextOptimization');

      const mainnetProgress = (data.mainnet.tradesAnalyzed / (data.mainnet.tradesRequired || 50)) * 100;
      mainnetProgressPercent.textContent = `${Math.min(mainnetProgress, 100).toFixed(0)}%`;
      mainnetProgressFill.style.width = `${Math.min(mainnetProgress, 100)}%`;
      mainnetProgressFill.textContent = `${Math.min(mainnetProgress, 100).toFixed(0)}%`;
      mainnetTradesAnalyzed.textContent = `${data.mainnet.tradesAnalyzed}/${data.mainnet.tradesRequired || 50}`;
      mainnetWinRateImprovement.textContent = `+${(data.mainnet.winRateImprovement || 0).toFixed(1)}%`;

      if (data.mainnet.nextOptimization) {
        mainnetNextOptimization.textContent = data.mainnet.nextOptimization;
      } else {
        mainnetNextOptimization.textContent = 'Ready';
      }
    }
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
          <div>
            <div class="trade-pnl ${isProfitable ? 'profit' : 'loss'}">
              ${isProfitable ? '+' : ''}${trade.pnl.toFixed(4)} SOL
            </div>
          </div>
          <div class="confidence-badge ${confidenceLevel}">
            ${trade.confidence.toFixed(0)}% confidence
          </div>
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
      <div class="pattern-name">${pattern.name}</div>
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
    reasonsEl.innerHTML = '<span class="good">Ready for LIVE</span>';
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
  document.getElementById('lastUpdate').textContent = now.toLocaleTimeString('en-US');
}

let lastLogCount = 0;
async function fetchAgentLogs() {
  try {
    const response = await fetch(`${API_BASE}/agent/logs`);
    const logs = await response.json();

    if (!Array.isArray(logs)) return;

    const container = document.getElementById('agentLogsContainer');

    // Only update if the number of logs changed or if it's the first load
    if (logs.length !== lastLogCount && container) {
      if (logs.length === 0) {
        container.innerHTML = '<div class="loading">No agent activity logged yet...</div>';
      } else {
        container.innerHTML = logs.map(log => {
          let msgClass = 'log-msg';
          if (log.message && (log.message.includes('SKIP') || log.message.includes('ALLOW'))) {
            msgClass += ' highlight';
          }
          const timeStr = log.timestamp ? new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
          return `
            <div class="log-line">
              <span class="log-time">[${timeStr}]</span>
              <span class="log-level ${log.level}">${log.level}</span>
              <span class="${msgClass}">${log.message}</span>
            </div>
          `;
        }).join('');
        // scroll to bottom
        container.scrollTop = container.scrollHeight;
      }
      lastLogCount = logs.length;
    }
  } catch (error) {
    console.error('Error fetching agent logs:', error);
  }
}

// Auto refresh
function refreshAll() {
  fetchStats();
  fetchPositions();
  fetchAgentStats();
  fetchTradeHistory();
  fetchPatterns();
  fetchSimulationStatus();
  fetchSimulationTrades();
  updateTimestamp();
}

// Initial load
refreshAll();
fetchAgentLogs();

// Auto-refresh stats every 5 seconds
setInterval(refreshAll, 5000);

// Auto-refresh agent logs every 2 seconds for a "live terminal" feel
setInterval(fetchAgentLogs, 2000);

// wire buttons
document.getElementById('toggleAgentCheckbox')?.addEventListener('change', toggleAgent);
document.getElementById('toggleModeCheckbox')?.addEventListener('change', toggleMode);
