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

function updateTimestamp() {
  const now = new Date();
  document.getElementById('lastUpdate').textContent = now.toLocaleTimeString('en-US');
}

// Auto refresh
function refreshAll() {
  fetchStats();
  fetchPositions();
  updateTimestamp();
}

// Initial load
refreshAll();

// Auto-refresh every 5 seconds
setInterval(refreshAll, 5000);
