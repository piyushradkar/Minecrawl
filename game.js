// --- Supabase Setup ---
const supabaseUrl = 'https://ebcauizpkjfoesdjddnb.supabase.co';
const supabaseKey = 'sb_publishable_h9iANKVPQioFSZ6ecO5U0Q_fmZZQeLo';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

// --- DOM Elements ---
const nameScreen = document.getElementById('nameScreen');
const gameScreen = document.getElementById('gameScreen');
const leaderboardScreen = document.getElementById('leaderboardScreen');
const startGameBtn = document.getElementById('startGameBtn');
const playerNameInput = document.getElementById('playerNameInput');
const leaderboardTable = document.getElementById('leaderboardTable');
const leaderboardBody = document.getElementById('leaderboardBody');
const loadingLeaderboard = document.getElementById('loadingLeaderboard');
const leaderboardTableYesterday = document.getElementById('leaderboardTableYesterday');
const leaderboardBodyYesterday = document.getElementById('leaderboardBodyYesterday');
const loadingLeaderboardYesterday = document.getElementById('loadingLeaderboardYesterday');
const leaderboardTableEnd = document.getElementById('leaderboardTableEnd');
const leaderboardBodyEnd = document.getElementById('leaderboardBodyEnd');
const loadingLeaderboardEnd = document.getElementById('loadingLeaderboardEnd');
const playerDisplay = document.getElementById('playerDisplay');
const playAgainBtn = document.getElementById('playAgainBtn');
const shareBtn = document.getElementById('shareBtn');
const shareModal = document.getElementById('shareModal');
const shareText = document.getElementById('shareText');
const copyShareBtn = document.getElementById('copyShareBtn');
const closeShareBtn = document.getElementById('closeShareBtn');
const toast = document.getElementById('toast');

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- Game Variables ---
let playerName = "";
const cols = 30;
const rows = 10;
const blockSize = 30; // block size for grid
let grid = [];
let score = 0;
let timer;
let timeLeft = 90; // 90 seconds
let blocksMined = 0; // Track number of blocks successfully mined
let startTime; // To track the start time of the game
let lastClickTime = 0; // To track the time of the last click
const throttleInterval = 333; // milliseconds (1000 ms / 3 clicks)
let gameOver = false; // Flag to track if the game is over

let isAiMode = false;
let aiPlan = [];
let aiPlanIndex = 0;
let aiTimerId = null;
let humanMinedList = [];

// Leaderboard cache and sorting state
let cachedTodayData = [];
let cachedYesterdayData = [];
let activeSortMetric = 'score'; // 'score' or 'irr'

let dailyRandom = Math.random; // Fallback

// --- Hover State Tracking ---
let mouseX = -1;
let mouseY = -1;
let isMouseOverCanvas = false;

// --- Fading Blocks System ---
let fadingBlocks = [];

class FadingBlock {
    constructor(row, col, value) {
        this.row = row;
        this.col = col;
        this.value = value;
        this.alpha = 1;
        this.decay = 0.04; // smooth fade duration (approx 25 frames, ~0.4s)
    }

    update() {
        this.alpha -= this.decay;
    }

    draw(cCtx) {
        const x = this.col * blockSize;
        const y = this.row * blockSize;

        cCtx.save();
        cCtx.globalAlpha = this.alpha;

        // Restore original block color logic
        if (this.value < 0) {
            cCtx.fillStyle = 'skyblue';
        } else {
            const value = this.value;
            const maxValue = 100;
            const intensity = Math.min(value / maxValue, 1);
            const red = 255;
            const green = Math.floor(255 - (intensity * 155));
            const blue = Math.floor(50 * intensity);
            cCtx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
        }

        // Draw original block rectangle
        cCtx.fillRect(x, y, blockSize, blockSize);

        // Draw original black border outline
        cCtx.strokeStyle = 'black';
        cCtx.lineWidth = 1;
        cCtx.strokeRect(x, y, blockSize, blockSize);

        // Draw value text with original black Arial font
        cCtx.fillStyle = 'black';
        cCtx.textAlign = 'center';
        cCtx.textBaseline = 'middle';
        cCtx.font = '14px Arial';
        cCtx.fillText(this.value, x + blockSize / 2, y + blockSize / 2);

        cCtx.restore();
    }
}

// Utility function for random integer between min (inclusive) and max (exclusive)
function randomInt(min, max) {
    return Math.floor(dailyRandom() * (max - min) + min);
}

// Function to initialize the grid with specific rules
function initializeGrid() {
    // Reset seed for today (Perth time, UTC+8)
    const todayStr = new Date(Date.now() + 8 * 3600 * 1000).toISOString().split('T')[0];
    let seed = 0;
    for (let i = 0; i < todayStr.length; i++) {
        seed = Math.imul(31, seed) + todayStr.charCodeAt(i) | 0;
    }
    dailyRandom = function () {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };

    grid = Array.from({ length: rows }, () => Array(cols).fill(0));
    const topRows = Math.floor(rows * 0.3);
    const lowValueRange = [5, 15]; // Low-value range for the top 30% rows

    for (let row = 0; row < topRows; row++) {
        for (let col = 0; col < cols; col++) {
            if (dailyRandom() < 0.3) { // Medium probability
                grid[row][col] = randomInt(...lowValueRange);
            }
        }
    }

    const midStartRow = topRows;
    const midEndRow = Math.floor(rows * 0.8); // Middle 50% rows
    const midValueRange = [20, 60]; // Medium to high-value range for middle 50% rows
    const numClusters = 15; // Number of clusters

    for (let i = 0; i < numClusters; i++) {
        const clusterRow = randomInt(midStartRow, midEndRow);
        const clusterCol = randomInt(Math.floor(cols / 5), Math.floor(4 * cols / 5));
        const clusterSize = randomInt(3, 6); // Random cluster size
        const clusterRadius = randomInt(1, 3); // Random radius for cluster shape

        for (let j = 0; j < clusterSize; j++) {
            const offsetRow = randomInt(-clusterRadius, clusterRadius + 1);
            const offsetCol = randomInt(-clusterRadius, clusterRadius + 1);
            const r = Math.max(0, Math.min(clusterRow + offsetRow, rows - 1));
            const c = Math.max(0, Math.min(clusterCol + offsetCol, cols - 1));
            if (dailyRandom() < 0.6) { // Random chance to place a block in the cluster
                grid[r][c] = randomInt(...midValueRange);
            }
        }
    }

    const bottomStartRow = Math.floor(rows * 0.7);
    const bottomEndRow = rows;
    const midValueRangeBottom = [20, 30]; // Mid-value range for bottom rows
    const highValueRangeBottom = [150, 200]; // Very high-value blocks

    for (let row = bottomStartRow; row < bottomEndRow; row++) {
        for (let col = 0; col < cols; col++) {
            if (dailyRandom() < 0.3) { // Low probability
                if (dailyRandom() < 0.2) { // Few very high-value blocks
                    grid[row][col] = randomInt(...highValueRangeBottom);
                } else {
                    grid[row][col] = randomInt(...midValueRangeBottom);
                }
            }
        }
    }

    for (let row = 0; row < rows; row++) {
        const minVal = -1.5 * Math.pow(1.25, row);
        const maxVal = -1.5 * Math.pow(1.25, row + 1);
        const wasteValue = Math.floor(dailyRandom() * (maxVal - minVal) + minVal);

        for (let col = 0; col < cols; col++) {
            if (grid[row][col] === 0) { // Place waste blocks where no high-grade blocks are present
                grid[row][col] = wasteValue;
            }
        }
    }
}

// Function to draw the grid with original rectangular blocks and colors
function drawGrid() {
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear the canvas
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (grid[r][c] !== 0) {
                const x = c * blockSize;
                const y = r * blockSize;

                if (grid[r][c] < 0) {
                    ctx.fillStyle = 'skyblue';
                } else {
                    // For positive values, create a gradient from light yellow to dark gold
                    const value = grid[r][c];
                    const maxValue = 100; // Assume 100 is the highest value for color scaling
                    const intensity = Math.min(value / maxValue, 1); // Scale intensity between 0 and 1
                    const red = 255; // Constant red for yellow/gold
                    const green = Math.floor(255 - (intensity * 155)); // Adjust green for gradient
                    const blue = Math.floor(50 * intensity); // Adjust blue slightly to move towards gold
                    ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`; // Gradient from light yellow to dark gold
                }

                ctx.fillRect(x, y, blockSize, blockSize);
                ctx.strokeStyle = 'black';
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, blockSize, blockSize);

                ctx.fillStyle = 'black'; // Font color for numbers
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = '14px Arial'; // Adjusted font size
                ctx.fillText(grid[r][c], x + blockSize / 2, y + blockSize / 2);
            }
        }
    }
}

// Function to draw cursor highlights and locks (keeps block guide but removes gunpoint and ready text)
function drawHoverGuide() {
    if (!isMouseOverCanvas || gameOver) return;

    const col = Math.floor(mouseX / blockSize);
    const row = Math.floor(mouseY / blockSize);

    if (row >= 0 && row < rows && col >= 0 && col < cols) {
        const blockVal = grid[row][col];
        if (blockVal !== 0) {
            const x = col * blockSize;
            const y = row * blockSize;
            const mineable = canMine(row, col);

            ctx.save();
            // Block Border Neon Guide
            ctx.strokeStyle = mineable ? 'rgba(52, 211, 153, 0.85)' : 'rgba(248, 113, 113, 0.75)';
            ctx.shadowColor = mineable ? '#34d399' : '#f87171';
            ctx.shadowBlur = 10;
            ctx.lineWidth = 2;

            // Oscillating outline guide
            const timeOsc = Math.sin(Date.now() / 120) * 1.5;
            const pad = 1.5 - timeOsc;
            ctx.strokeRect(x + pad, y + pad, blockSize - pad * 2, blockSize - pad * 2);
            ctx.restore();

            // Draw locked tag relative to standard cursor position if not mineable
            if (!mineable) {
                ctx.save();
                ctx.fillStyle = '#f87171';
                ctx.font = 'bold 11px "Outfit", sans-serif';
                ctx.shadowColor = '#f87171';
                ctx.shadowBlur = 4;
                ctx.fillText('LOCKED', mouseX + 15, mouseY - 5);
                ctx.restore();
            }
        }
    }
}

// Function to update the score display based on the formula
function updateScore(value) {
    const elapsedTime = (Date.now() - startTime) / 1000; // Elapsed time in seconds
    score += value / Math.pow(1.01, elapsedTime);
    document.getElementById('score').textContent = `$${score.toFixed(2)}`; // Display score with 2 decimal points
}

// Function to handle block click with throttling
function handleClick(event) {
    if (gameOver || isAiMode) return; // Prevent mining if the game is over or AI is running

    const now = Date.now();
    if (now - lastClickTime < throttleInterval) {
        return;
    }
    lastClickTime = now;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const col = Math.floor(x / blockSize);
    const row = Math.floor(y / blockSize);

    if (row >= 0 && row < rows && col >= 0 && col < cols) {
        if (canMine(row, col)) {
            const blockValue = grid[row][col];
            grid[row][col] = 0; // Make block disappear immediately in core logic
            blocksMined++; // Increment mined blocks counter

            // Push to fading blocks list for transition drawing
            fadingBlocks.push(new FadingBlock(row, col, blockValue));

            // Push to humanMinedList for IRR calculation
            const elapsedTime = (Date.now() - startTime) / 1000;
            humanMinedList.push({ value: blockValue, time: elapsedTime });

            updateScore(blockValue); // Update score based on the block's value
            saveGameState();
        }
    }
}

// Function to check if a block can be mined
function canMine(row, col) {
    if (row === 0) return true; // Allow mining in the top row

    // Check if the block directly above is mined
    if (grid[row - 1][col] === 0) {
        // Check if the blocks diagonally above left and right are mined
        const left = col > 0 ? grid[row - 1][col - 1] : null;
        const right = col < cols - 1 ? grid[row - 1][col + 1] : null;

        if (left === 0 && right === 0) {
            return true;
        }
    }
    return false;
}

// Function to update the timer display
async function updateTimer() {
    timeLeft--;
    document.getElementById('timer').textContent = `${timeLeft}s`;

    if (timeLeft > 0) {
        if (!isAiMode) saveGameState();
    }

    if (timeLeft <= 0) {
        clearInterval(timer);
        gameOver = true; // Set game over flag
        await finishGame();
    }
}

// Continuous Frame Loop
function gameLoop() {
    if (!gameOver && gameScreen.classList.contains('active-screen')) {
        // Update fading block alphas
        fadingBlocks.forEach(fb => fb.update());
        fadingBlocks = fadingBlocks.filter(fb => fb.alpha > 0);

        drawGrid();

        // Draw active fading blocks
        fadingBlocks.forEach(fb => fb.draw(ctx));

        drawHoverGuide();
        requestAnimationFrame(gameLoop);
    }
}

// --- Supabase and App Flow ---

function showScreen(screenId) {
    nameScreen.classList.remove('active-screen');
    gameScreen.classList.remove('active-screen');
    leaderboardScreen.classList.remove('active-screen');

    document.getElementById(screenId).classList.add('active-screen');
}

function saveGameState() {
    const todayStr = new Date(Date.now() + 8 * 3600 * 1000).toISOString().split('T')[0];
    const gameState = {
        playerName: playerName,
        grid: grid,
        score: score,
        timeLeft: timeLeft,
        blocksMined: blocksMined,
        date: todayStr,
        humanMinedList: humanMinedList
    };
    localStorage.setItem('mc_state_v2', JSON.stringify(gameState));
}

function checkIfPlayedToday() {
    // Check if there is an active saved game state to resume
    const todayStr = new Date(Date.now() + 8 * 3600 * 1000).toISOString().split('T')[0];
    const savedStateStr = localStorage.getItem('mc_state_v2');
    if (savedStateStr) {
        try {
            const savedState = JSON.parse(savedStateStr);
            if (savedState.date === todayStr && savedState.timeLeft > 0) {
                playerNameInput.value = savedState.playerName;
                playerNameInput.disabled = true; // Lock the name
                startGameBtn.textContent = "Resume Operations";
                return false; // Allow them to resume
            }
        } catch (e) {
            console.error("Error parsing saved state", e);
        }
    }

    // Reset button and inputs to default active state
    playerNameInput.disabled = false;
    startGameBtn.disabled = false;
    startGameBtn.textContent = "Start Operations";
    startGameBtn.style.opacity = "1";
    startGameBtn.style.cursor = "pointer";

    return false;
}

// Function to check if a player name has already been used today (case-insensitive)
async function checkDuplicateNameToday(name) {
    try {
        const now = new Date();
        const perthTime = new Date(now.getTime() + 8 * 3600 * 1000);
        perthTime.setUTCHours(0, 0, 0, 0); // Start of Perth day
        const startOfDayUTC = new Date(perthTime.getTime() - 8 * 3600 * 1000);

        const { data, error } = await supabaseClient
            .from('scores')
            .select('name')
            .gte('created_at', startOfDayUTC.toISOString());

        if (error) {
            console.error("Error checking duplicate name:", error);
            return false;
        }

        if (!data) return false;

        const lowerInputName = name.toLowerCase();
        return data.some(row => {
            if (!row.name) return false;
            let dbPlayerName = row.name;
            if (row.name.includes('::')) {
                dbPlayerName = row.name.split('::')[0];
            }
            return dbPlayerName.toLowerCase() === lowerInputName;
        });
    } catch (err) {
        console.error("Unexpected error checking duplicate name:", err);
        return false;
    }
}

// Main profanity check: Queries the CORS-enabled vector.profanity.dev API directly from the client
// and uses a strict local check with normalization to catch phonetic variations and bypasses (like 'luvanul' or 'cockluv').
async function checkProfanity(name) {
    const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '');

    // 1. Define leetspeak and phonetic substitutions to normalize checks
    const substitutions = {
        '@': 'a', '4': 'a', '3': 'e', '1': 'i', 'l': 'i', '0': 'o',
        '5': 's', '$': 's', '7': 't', 'v': 'u', 'w': 'uu', 'z': 's'
    };

    let deLeetName = name.toLowerCase();
    for (const [char, replacement] of Object.entries(substitutions)) {
        deLeetName = deLeetName.replaceAll(char, replacement);
    }
    const normalized = deLeetName.replace(/[^a-z0-9]/g, '');

    // 2. Strict local check for key bad words & spelling variants (like 'anul')
    const strictBanned = [
        'anal', 'anul', 'anus', 'arse', 'ass', 'bastard', 'bitch', 'blowjob',
        'boner', 'buttplug', 'clitoris', 'cock', 'cunt', 'dick', 'dildo', 'dyke',
        'fag', 'felch', 'fellate', 'fellatio', 'fuck', 'fudgepacker', 'jizz',
        'knobend', 'labia', 'nigger', 'penis', 'piss', 'prick', 'pube', 'pussy',
        'scrotum', 'sh1t', 'shit', 'slut', 'smegma', 'spunk', 'tosser', 'turd',
        'twat', 'vagina', 'wank', 'whore', 'rawdog', 'clung', 'cum'
    ];

    for (const word of strictBanned) {
        if (cleanName.includes(word) || normalized.includes(word)) {
            return true;
        }
    }

    // 3. Fallback to vector API for contextual/semantic checks
    try {
        const response = await fetch('https://vector.profanity.dev', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: name })
        });

        if (!response.ok) throw new Error("Profanity API response error");

        const result = await response.json();
        return result.isProfanity === true;
    } catch (err) {
        console.warn("Profanity verification offline, bypassing check:", err);
        return false; // Fail open if API is offline
    }
}

startGameBtn.addEventListener('click', async () => {
    const isResuming = startGameBtn.textContent === "Resume Operations";

    if (!isResuming && checkIfPlayedToday()) {
        alert("You have already played today's deposit. Come back tomorrow!");
        return;
    }

    const name = playerNameInput.value.trim();
    if (name.length >= 3 && name.length <= 12) {
        // If starting a new game, check for duplicates in the database today (case-insensitive)
        if (!isResuming) {
            startGameBtn.disabled = true;
            startGameBtn.textContent = "Verifying Alias...";

            const isDuplicate = await checkDuplicateNameToday(name);

            if (isDuplicate) {
                alert(`Operator alias "${name}" has already been registered today. Please choose a different alias.`);
                startGameBtn.disabled = false;
                startGameBtn.textContent = "Start Operations";
                return;
            }

            startGameBtn.disabled = false;
            startGameBtn.textContent = "Start Operations";
        }

        playerName = name;
        const todayStr = new Date(Date.now() + 8 * 3600 * 1000).toISOString().split('T')[0];
        localStorage.setItem('mc_last_played_v2', todayStr);

        startGame(isResuming);
    } else {
        alert("Operator alias must be between 3 and 12 characters!");
    }
});

playAgainBtn.addEventListener('click', () => {
    showScreen('nameScreen');
    checkIfPlayedToday();
});

function startGame(isResuming = false, isAi = false) {
    showScreen('gameScreen');

    isAiMode = isAi;
    if (isAiMode) {
        playerDisplay.textContent = "AI Solver (Simulation)";
        document.getElementById('aiControls').style.display = 'flex';
    } else {
        playerDisplay.textContent = playerName;
        document.getElementById('aiControls').style.display = 'none';
    }

    gameOver = false;
    fadingBlocks = []; // clear old fading animations

    if (isResuming) {
        const savedStateStr = localStorage.getItem('mc_state_v2');
        if (savedStateStr) {
            const savedState = JSON.parse(savedStateStr);
            grid = savedState.grid;
            score = savedState.score;
            timeLeft = savedState.timeLeft;
            blocksMined = savedState.blocksMined || 0;
            humanMinedList = savedState.humanMinedList || [];
            // Adjust start time to accurately calculate score depreciation
            const elapsedTimeSeconds = 90 - timeLeft;
            startTime = Date.now() - (elapsedTimeSeconds * 1000);
        }
    } else {
        score = 0;
        timeLeft = 90;
        blocksMined = 0;
        humanMinedList = [];
        startTime = Date.now();
        initializeGrid();
    }

    document.getElementById('score').textContent = `$${score.toFixed(2)}`;
    document.getElementById('timer').textContent = `${timeLeft}s`;

    if (!isResuming && !isAiMode) {
        saveGameState();
    }

    clearInterval(timer);
    timer = setInterval(updateTimer, 1000);

    if (isAiMode) {
        // Run AI Solver asynchronously to let the screen repaint transition first
        setTimeout(() => {
            const selected = bestClosure(grid);
            const elapsedSeconds = 0.15; // Fixed 150ms simulated thinking time to guarantee identical results every run
            aiPlan = beamSchedule(grid, selected, elapsedSeconds, 200, 5, 0.5625);
            aiPlanIndex = 0;

            // Align game clock with the simulated thinking time
            startTime = Date.now() - (elapsedSeconds * 1000);

            clearInterval(aiTimerId);
            aiTimerId = setInterval(runAiStep, 562.5); // Click every 562.5ms to spread clicks over 90s
        }, 50);
    }

    // Fire continuous game loop
    requestAnimationFrame(gameLoop);
}

async function loadLeaderboard() {
    loadingLeaderboard.style.display = 'block';
    leaderboardTable.style.display = 'none';
    if (loadingLeaderboardYesterday) {
        loadingLeaderboardYesterday.style.display = 'block';
        loadingLeaderboardYesterday.textContent = "Decrypting standings...";
        leaderboardTableYesterday.style.display = 'none';
    }
    if (loadingLeaderboardEnd) loadingLeaderboardEnd.style.display = 'block';
    if (leaderboardTableEnd) leaderboardTableEnd.style.display = 'none';

    try {
        const now = new Date();
        const perthTime = new Date(now.getTime() + 8 * 3600 * 1000);
        perthTime.setUTCHours(0, 0, 0, 0); // Start of Perth day
        const startOfDayUTC = new Date(perthTime.getTime() - 8 * 3600 * 1000);
        const startOfYesterdayUTC = new Date(startOfDayUTC.getTime() - 24 * 3600 * 1000);

        // Fetch Today's top 100 in parallel with Yesterday's top 50
        const [todayRes, yesterdayRes] = await Promise.all([
            supabaseClient
                .from('scores')
                .select('name, score')
                .gte('created_at', startOfDayUTC.toISOString())
                .order('score', { ascending: false })
                .limit(100),
            supabaseClient
                .from('scores')
                .select('name, score')
                .gte('created_at', startOfYesterdayUTC.toISOString())
                .lt('created_at', startOfDayUTC.toISOString())
                .order('score', { ascending: false })
                .limit(50)
        ]);

        const { data: todayData, error: todayError } = todayRes;
        const { data: yesterdayData, error: yesterdayError } = yesterdayRes;

        if (todayError) {
            console.error("Error fetching today's scores:", todayError);
            loadingLeaderboard.textContent = "Grid link interrupted.";
            loadingLeaderboard.style.display = 'block';
            if (loadingLeaderboardEnd) {
                loadingLeaderboardEnd.textContent = "Grid link interrupted.";
                loadingLeaderboardEnd.style.display = 'block';
            }
        } else {
            cachedTodayData = todayData || [];
        }

        if (yesterdayError) {
            console.error("Error fetching yesterday's scores:", yesterdayError);
            if (loadingLeaderboardYesterday) {
                loadingLeaderboardYesterday.textContent = "Grid link interrupted.";
                loadingLeaderboardYesterday.style.display = 'block';
            }
        } else {
            cachedYesterdayData = yesterdayData || [];
        }

        renderLeaderboards();

    } catch (err) {
        console.error("Unexpected error loading leaderboard:", err);
        loadingLeaderboard.textContent = "Terminal offline.";
        loadingLeaderboard.style.display = 'block';
        if (loadingLeaderboardYesterday) {
            loadingLeaderboardYesterday.textContent = "Terminal offline.";
            loadingLeaderboardYesterday.style.display = 'block';
        }
        if (loadingLeaderboardEnd) {
            loadingLeaderboardEnd.textContent = "Terminal offline.";
            loadingLeaderboardEnd.style.display = 'block';
        }
    }
}

function renderLeaderboards() {
    // Process and format data helper
    const processData = (data) => {
        return data.map(row => {
            let displayName = row.name;
            let displayMined = '-';
            let displayIrr = null;
            let displayIrrText = '-';

            if (row.name && row.name.includes('::')) {
                const parts = row.name.split('::');
                displayName = parts[0];
                displayMined = parts[1];
                if (parts[2] && parts[2] !== 'NaN') {
                    const irrVal = parseFloat(parts[2]);
                    if (!isNaN(irrVal)) {
                        displayIrr = irrVal;
                        displayIrrText = `${(irrVal * 100).toFixed(1)}%`;
                    }
                }
            }

            return {
                displayName: displayName,
                minedCount: displayMined,
                irr: displayIrr,
                irrText: displayIrrText,
                score: row.score
            };
        });
    };

    const parsedToday = processData(cachedTodayData);
    const parsedYesterday = processData(cachedYesterdayData);

    // Sort today's data
    if (activeSortMetric === 'irr') {
        parsedToday.sort((a, b) => {
            const valA = a.irr !== null ? a.irr : -Infinity;
            const valB = b.irr !== null ? b.irr : -Infinity;
            if (valB !== valA) return valB - valA;
            return b.score - a.score; // secondary sub-sort by score
        });
    } else {
        parsedToday.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            const valA = a.irr !== null ? a.irr : -Infinity;
            const valB = b.irr !== null ? b.irr : -Infinity;
            return valB - valA; // secondary sub-sort by irr
        });
    }

    // Sort yesterday's data
    if (activeSortMetric === 'irr') {
        parsedYesterday.sort((a, b) => {
            const valA = a.irr !== null ? a.irr : -Infinity;
            const valB = b.irr !== null ? b.irr : -Infinity;
            if (valB !== valA) return valB - valA;
            return b.score - a.score;
        });
    } else {
        parsedYesterday.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            const valA = a.irr !== null ? a.irr : -Infinity;
            const valB = b.irr !== null ? b.irr : -Infinity;
            return valB - valA;
        });
    }

    // Render Today's Leaderboard
    leaderboardBody.innerHTML = '';
    if (leaderboardBodyEnd) leaderboardBodyEnd.innerHTML = '';

    const todayTop10 = parsedToday.slice(0, 10);
    todayTop10.forEach((row, index) => {
        let rankHtml = '';
        if (index === 0) rankHtml = `<span class="rank-badge rank-1">1</span>`;
        else if (index === 1) rankHtml = `<span class="rank-badge rank-2">2</span>`;
        else if (index === 2) rankHtml = `<span class="rank-badge rank-3">3</span>`;
        else rankHtml = `<span class="rank-badge rank-other">${index + 1}</span>`;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${rankHtml}</td>
            <td>${row.displayName}</td>
            <td style="font-family: 'Share Tech Mono', monospace; font-size: 16px; color: var(--text-secondary); text-align: center;">${row.minedCount}</td>
            <td style="font-family: 'Share Tech Mono', monospace; font-size: 16px; color: var(--accent-color); text-align: center;">${row.irrText}</td>
            <td>$${Math.round(row.score).toLocaleString()}</td>
        `;
        leaderboardBody.appendChild(tr);

        if (leaderboardBodyEnd) {
            const trEnd = document.createElement('tr');
            trEnd.innerHTML = `
                <td>${rankHtml}</td>
                <td>${row.displayName}</td>
                <td style="font-family: 'Share Tech Mono', monospace; font-size: 16px; color: var(--text-secondary); text-align: center;">${row.minedCount}</td>
                <td style="font-family: 'Share Tech Mono', monospace; font-size: 16px; color: var(--accent-color); text-align: center;">${row.irrText}</td>
                <td>$${Math.round(row.score).toLocaleString()}</td>
            `;
            leaderboardBodyEnd.appendChild(trEnd);
        }
    });

    loadingLeaderboard.style.display = 'none';
    leaderboardTable.style.display = 'table';
    if (loadingLeaderboardEnd) loadingLeaderboardEnd.style.display = 'none';
    if (leaderboardTableEnd) leaderboardTableEnd.style.display = 'table';

    // Render Yesterday's Leaderboard
    if (leaderboardBodyYesterday) {
        leaderboardBodyYesterday.innerHTML = '';
        const yesterdayTop5 = parsedYesterday.slice(0, 5);
        yesterdayTop5.forEach((row, index) => {
            let rankHtml = '';
            if (index === 0) rankHtml = `<span class="rank-badge rank-1">1</span>`;
            else if (index === 1) rankHtml = `<span class="rank-badge rank-2">2</span>`;
            else if (index === 2) rankHtml = `<span class="rank-badge rank-3">3</span>`;
            else rankHtml = `<span class="rank-badge rank-other">${index + 1}</span>`;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${rankHtml}</td>
                <td>${row.displayName}</td>
                <td style="font-family: 'Share Tech Mono', monospace; font-size: 16px; color: var(--text-secondary); text-align: center;">${row.minedCount}</td>
                <td style="font-family: 'Share Tech Mono', monospace; font-size: 16px; color: var(--accent-color); text-align: center;">${row.irrText}</td>
                <td>$${Math.round(row.score).toLocaleString()}</td>
            `;
            leaderboardBodyYesterday.appendChild(tr);
        });

        if (loadingLeaderboardYesterday) loadingLeaderboardYesterday.style.display = 'none';
        leaderboardTableYesterday.style.display = 'table';
    }
}

function setupSortControls() {
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const metric = e.target.getAttribute('data-metric');
            if (metric === activeSortMetric) return;

            activeSortMetric = metric;

            // Sync all sort button active states
            document.querySelectorAll('.sort-btn').forEach(b => {
                if (b.getAttribute('data-metric') === activeSortMetric) {
                    b.classList.add('active');
                } else {
                    b.classList.remove('active');
                }
            });

            renderLeaderboards();
        });
    });
}

async function finishGame() {
    const formatIRR = (irr) => {
        if (irr === null) return "N/A";
        return `${(irr * 100).toFixed(1)}%`;
    };

    if (isAiMode) {
        clearInterval(aiTimerId);
        clearInterval(timer);
        isAiMode = false;
        document.getElementById('aiControls').style.display = 'none';

        const finalAiScore = Math.round(score);
        document.getElementById('aiScoreEnd').textContent = `$${finalAiScore.toLocaleString()}`;

        // Calculate AI IRR based on planned steps executed so far
        const aiMinedList = aiPlan.slice(0, aiPlanIndex);
        const aiCashFlows = buildCashFlows(blocksMined, aiMinedList);
        const aiIrr = calculateIRR(aiCashFlows);
        const aiIrrText = formatIRR(aiIrr);
        document.getElementById('aiIrrEnd').textContent = aiIrrText;

        const userLastScore = parseFloat(localStorage.getItem('mc_last_user_score')) || 0;
        document.getElementById('userBestScoreEnd').textContent = `$${Math.round(userLastScore).toLocaleString()}`;

        // Retrieve saved user IRR
        const userLastIrrVal = parseFloat(localStorage.getItem('mc_last_user_irr'));
        const userIrrText = !isNaN(userLastIrrVal) ? formatIRR(userLastIrrVal) : "N/A";
        document.getElementById('userIrrEnd').textContent = userIrrText;

        let comparisonText = "";
        if (userLastScore > 0) {
            const diff = finalAiScore - userLastScore;
            if (diff > 0) {
                const percent = Math.round((diff / userLastScore) * 100);
                comparisonText = `🤖 The AI outperformed you by $${Math.round(diff).toLocaleString()} (${percent}%) with an IRR of ${aiIrrText} vs your ${userIrrText}.`;
            } else if (diff < 0) {
                const percent = Math.round((Math.abs(diff) / userLastScore) * 100);
                comparisonText = `🏆 Outstanding! You beat the AI by $${Math.round(Math.abs(diff)).toLocaleString()} (${percent}%) with an IRR of ${userIrrText} vs the AI's ${aiIrrText}.`;
            } else {
                comparisonText = `🤝 Incredible! You and the AI got the exact same score. AI IRR: ${aiIrrText}, Your IRR: ${userIrrText}.`;
            }
        } else {
            comparisonText = `Play today's challenge first to compare your score with the AI!`;
        }
        document.getElementById('aiComparisonText').textContent = comparisonText;

        showScreen('leaderboardScreen');
        document.getElementById('aiResultModal').style.display = 'flex';
        return;
    }

    clearInterval(timer);

    // Save human user score for comparison
    const finalUserScore = Math.round(score);
    localStorage.setItem('mc_last_user_score', finalUserScore);

    // Calculate player IRR
    const playerCashFlows = buildCashFlows(blocksMined, humanMinedList);
    const playerIrr = calculateIRR(playerCashFlows);
    if (playerIrr !== null) {
        localStorage.setItem('mc_last_user_irr', playerIrr.toString());
    } else {
        localStorage.setItem('mc_last_user_irr', "NaN");
    }
    showScreen('leaderboardScreen');

    // Set final player stats in the new UI elements
    document.getElementById('playerScoreEnd').textContent = `$${finalUserScore.toLocaleString()}`;
    document.getElementById('playerBlocksEnd').textContent = blocksMined;
    document.getElementById('playerIrrEnd').textContent = formatIRR(playerIrr);

    isMouseOverCanvas = false;

    try {
        // Check for profanity in the player name before saving
        let isProfane = false;
        try {
            isProfane = await checkProfanity(playerName);
        } catch (e) {
            console.error("Profanity verification error at finish:", e);
        }

        if (isProfane) {
            console.warn(`Operator alias "${playerName}" flagged for profanity. Score submission suppressed.`);
            // Remove the saved game state so they can't play the same game again
            localStorage.removeItem('mc_state_v2');
        } else {
            // 1. Submit score to Supabase
            const finalScore = Math.round(score);
            const playerIrrString = playerIrr !== null ? playerIrr.toFixed(4) : "NaN";
            const encodedName = `${playerName}::${blocksMined}::${playerIrrString}`;
            const { error: insertError } = await supabaseClient
                .from('scores')
                .insert([{ name: encodedName, score: finalScore }]);

            if (insertError) {
                console.error("Error saving score:", insertError);
                alert("Could not commit excavation data to global core.");
            } else {
                // Remove the saved game state so they can't resume a completed game
                localStorage.removeItem('mc_state_v2');
            }
        }

        // Calculate player percentile compared to other operators today
        try {
            const finalScore = Math.round(score);
            const now = new Date();
            const perthTime = new Date(now.getTime() + 8 * 3600 * 1000);
            perthTime.setUTCHours(0, 0, 0, 0); // Start of Perth day
            const startOfDayUTC = new Date(perthTime.getTime() - 8 * 3600 * 1000);

            const [totalRes, lowerRes] = await Promise.all([
                supabaseClient
                    .from('scores')
                    .select('*', { count: 'exact', head: true })
                    .gte('created_at', startOfDayUTC.toISOString()),
                supabaseClient
                    .from('scores')
                    .select('*', { count: 'exact', head: true })
                    .gte('created_at', startOfDayUTC.toISOString())
                    .lt('score', finalScore)
            ]);

            const totalCount = totalRes.count || 0;
            const lowerCount = lowerRes.count || 0;

            if (totalCount > 0) {
                // If they were profane, their score wasn't inserted, so we simulate their rank in the total
                const adjustedTotal = isProfane ? totalCount + 1 : totalCount;
                const percentile = adjustedTotal > 1 ? Math.round((lowerCount / (adjustedTotal - 1)) * 100) : 100;

                document.getElementById('playerPercentileValue').textContent = percentile;
                document.getElementById('playerPercentileContainer').style.display = 'block';
            } else {
                // First player of the day gets 100%
                document.getElementById('playerPercentileValue').textContent = "100";
                document.getElementById('playerPercentileContainer').style.display = 'block';
            }
        } catch (percErr) {
            console.error("Error calculating percentile:", percErr);
            document.getElementById('playerPercentileContainer').style.display = 'none';
        }

        // 2. Reload leaderboard
        await loadLeaderboard();

    } catch (err) {
        console.error("Unexpected error in finishGame:", err);
    }
}

// Event Listeners
canvas.addEventListener('click', handleClick);

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
    isMouseOverCanvas = true;
});

canvas.addEventListener('mouseleave', () => {
    isMouseOverCanvas = false;
    mouseX = -1;
    mouseY = -1;
});

// Generate a Wordle-style mini grid of mined and unmined blocks
function generateMiniGrid() {
    let emojiGrid = "";
    // Sample 3 rows and 8 columns (very compact)
    const sampleRows = [1, 5, 8];
    const sampleCols = [2, 6, 10, 14, 18, 22, 26, 29];

    for (let r of sampleRows) {
        let rowStr = "";
        for (let c of sampleCols) {
            const val = grid[r][c];
            if (val === 0) {
                rowStr += "⬛"; // Mined
            } else if (val < 0) {
                rowStr += "🟦"; // Waste block
            } else {
                rowStr += "🟨"; // Gold block
            }
        }
        emojiGrid += rowStr + "\n";
    }
    return emojiGrid.trim();
}

// Share button click handler
shareBtn.addEventListener('click', () => {
    const todayStr = new Date(Date.now() + 8 * 3600 * 1000).toISOString().split('T')[0];
    const formattedScore = Math.round(score).toLocaleString();
    const miniGrid = generateMiniGrid();

    const message = `⛏️ MineCrawl Daily Challenge ⛏️
Date: ${todayStr}
Operator: ${playerName}
Mined Value: $${formattedScore}
Blocks Excavated: ${blocksMined}

${miniGrid}

Can you beat my score? Play at:
https://minecrawl.netlify.app/`;

    shareText.value = message;
    shareModal.style.display = 'flex';
});

// Close share modal
closeShareBtn.addEventListener('click', () => {
    shareModal.style.display = 'none';
});

// Close modal when clicking backdrop
shareModal.addEventListener('click', (e) => {
    if (e.target === shareModal) {
        shareModal.style.display = 'none';
    }
});

// Copy to Clipboard
copyShareBtn.addEventListener('click', () => {
    shareText.select();
    shareText.setSelectionRange(0, 99999); // For mobile devices

    navigator.clipboard.writeText(shareText.value).then(() => {
        // Show success toast
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 2500);
    }).catch(err => {
        console.error('Failed to copy: ', err);
        alert('Could not copy report automatically. Please select the text and copy manually.');
    });
});

// --- Feedback Form Handling ---
const footerFeedbackLink = document.getElementById('footerFeedbackLink');
const feedbackModal = document.getElementById('feedbackModal');
const feedbackName = document.getElementById('feedbackName');
const feedbackEmail = document.getElementById('feedbackEmail');
const feedbackMessage = document.getElementById('feedbackMessage');
const submitFeedbackBtn = document.getElementById('submitFeedbackBtn');
const closeFeedbackBtn = document.getElementById('closeFeedbackBtn');

// Open Feedback Modal
footerFeedbackLink.addEventListener('click', () => {
    // Populate name if the player has entered it
    feedbackName.value = playerName || '';
    feedbackEmail.value = '';
    feedbackMessage.value = '';

    // Clear any styling overrides
    feedbackName.style.borderColor = '';
    feedbackEmail.style.borderColor = '';
    feedbackMessage.style.borderColor = '';

    feedbackModal.style.display = 'flex';
});

// Close Feedback Modal
closeFeedbackBtn.addEventListener('click', () => {
    feedbackModal.style.display = 'none';
});

// Close when clicking backdrop
feedbackModal.addEventListener('click', (e) => {
    if (e.target === feedbackModal) {
        feedbackModal.style.display = 'none';
    }
});

// Validate email format
function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// Handle Submit
submitFeedbackBtn.addEventListener('click', async () => {
    const name = feedbackName.value.trim();
    const email = feedbackEmail.value.trim();
    const message = feedbackMessage.value.trim();

    let hasError = false;

    // Reset border colors
    feedbackName.style.borderColor = '';
    feedbackEmail.style.borderColor = '';
    feedbackMessage.style.borderColor = '';

    if (!name) {
        feedbackName.style.borderColor = 'var(--danger)';
        hasError = true;
    }
    if (!email || !isValidEmail(email)) {
        feedbackEmail.style.borderColor = 'var(--danger)';
        hasError = true;
    }
    if (!message) {
        feedbackMessage.style.borderColor = 'var(--danger)';
        hasError = true;
    }

    if (hasError) {
        alert("Please fill in all fields correctly (Name, Email, and Message are compulsory).");
        return;
    }

    submitFeedbackBtn.disabled = true;
    submitFeedbackBtn.textContent = "Sending...";

    const bodyPayload = new URLSearchParams({
        'form-name': 'feedback-form',
        'name': name,
        'email': email,
        'message': message
    });

    try {
        const response = await fetch('/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: bodyPayload.toString()
        });

        if (response.ok) {
            feedbackModal.style.display = 'none';
            // Show toast message dynamically
            const originalToastText = toast.textContent;
            toast.textContent = "Feedback submitted successfully! ⛏️";
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => {
                    toast.textContent = originalToastText;
                }, 300);
            }, 2500);
        } else {
            throw new Error("Form submission failed");
        }
    } catch (err) {
        console.error("Feedback submission error:", err);
        alert("An error occurred. Please try again later.");
    } finally {
        submitFeedbackBtn.disabled = false;
        submitFeedbackBtn.textContent = "Submit";
    }
});

// --- AI Autoplay Solver Logic ---

function nodeId(row, col) {
    return row * cols + col;
}

function getParents(row, col) {
    if (row === 0) return [];
    if (col === 0 || col === cols - 1) return [-1];
    return [
        nodeId(row - 1, col - 1),
        nodeId(row - 1, col),
        nodeId(row - 1, col + 1)
    ];
}

class Dinic {
    constructor(n) {
        this.graph = Array.from({ length: n }, () => []);
    }

    addEdge(fr, to, cap) {
        const forward = [to, this.graph[to].length, cap];
        const backward = [fr, this.graph[fr].length, 0];
        this.graph[fr].push(forward);
        this.graph[to].push(backward);
    }

    maxFlow(source, sink) {
        let flow = 0.0;
        const n = this.graph.length;

        while (true) {
            const level = new Array(n).fill(-1);
            level[source] = 0;
            const q = [source];
            let qHead = 0;

            while (qHead < q.length) {
                const v = q[qHead++];
                for (const edge of this.graph[v]) {
                    const to = edge[0];
                    const cap = edge[2];
                    if (cap > 1e-9 && level[to] < 0) {
                        level[to] = level[v] + 1;
                        q.push(to);
                    }
                }
            }

            if (level[sink] < 0) {
                break;
            }

            const it = new Array(n).fill(0);

            const dfs = (v, f) => {
                if (v === sink) return f;
                for (; it[v] < this.graph[v].length; it[v]++) {
                    const edge = this.graph[v][it[v]];
                    const to = edge[0];
                    const revIdx = edge[1];
                    const cap = edge[2];
                    if (cap > 1e-9 && level[v] < level[to]) {
                        const d = dfs(to, Math.min(f, cap));
                        if (d > 1e-9) {
                            edge[2] -= d;
                            this.graph[to][revIdx][2] += d;
                            return d;
                        }
                    }
                }
                return 0.0;
            };

            while (true) {
                const pushed = dfs(source, Infinity);
                if (pushed <= 1e-9) {
                    break;
                }
                flow += pushed;
            }
        }
        return flow;
    }

    reachableFrom(source) {
        const seen = new Set([source]);
        const q = [source];
        let qHead = 0;
        while (qHead < q.length) {
            const v = q[qHead++];
            for (const edge of this.graph[v]) {
                const to = edge[0];
                const cap = edge[2];
                if (cap > 1e-9 && !seen.has(to)) {
                    seen.add(to);
                    q.push(to);
                }
            }
        }
        return seen;
    }
}

function bestClosure(gridState) {
    const source = rows * cols;
    const sink = source + 1;
    const dinic = new Dinic(sink + 1);
    const inf = 1000000.0;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const nid = r * cols + c;
            const value = gridState[r][c];
            if (value > 0) {
                dinic.addEdge(source, nid, value);
            } else {
                dinic.addEdge(nid, sink, -value);
            }

            const needed = getParents(r, c);
            for (const p of needed) {
                if (p >= 0) {
                    dinic.addEdge(nid, p, inf);
                } else {
                    dinic.addEdge(nid, sink, inf);
                }
            }
        }
    }

    dinic.maxFlow(source, sink);
    const reachable = dinic.reachableFrom(source);

    const selected = new Set();
    for (let n = 0; n < rows * cols; n++) {
        if (reachable.has(n)) {
            selected.add(n);
        }
    }
    return selected;
}

function selectedChildren(selected) {
    const children = {};
    for (const node of selected) {
        children[node] = new Set();
    }
    for (const node of selected) {
        const row = Math.floor(node / cols);
        const col = node % cols;
        const needed = getParents(row, col);
        for (const p of needed) {
            if (selected.has(p)) {
                children[p].add(node);
            }
        }
    }
    return children;
}

function threeRowLookaheadValues(gridState, selected) {
    const values = {};
    for (const node of selected) {
        const row = Math.floor(node / cols);
        const col = node % cols;
        let score = 0;
        for (let depth = 1; depth <= 3; depth++) {
            const targetRow = row + depth;
            if (targetRow >= rows) break;
            const left = Math.max(1, col - depth);
            const right = Math.min(cols - 2, col + depth);
            for (let targetCol = left; targetCol <= right; targetCol++) {
                const targetNode = targetRow * cols + targetCol;
                if (selected.has(targetNode)) {
                    score += gridState[targetRow][targetCol];
                }
            }
        }
        values[node] = score;
    }
    return values;
}

function greedySchedule(gridState, selected, elapsedSeconds = 0.0, clickIntervalSeconds = 0.5625) {
    const remainingClicks = Math.max(0, Math.floor((90 - elapsedSeconds) / clickIntervalSeconds));
    const children = selectedChildren(selected);
    const remainingParents = {};
    for (const node of selected) {
        const row = Math.floor(node / cols);
        const col = node % cols;
        const needed = getParents(row, col);
        let count = 0;
        for (const p of needed) {
            if (selected.has(p)) count++;
        }
        remainingParents[node] = count;
    }

    const lookaheadValues = threeRowLookaheadValues(gridState, selected);
    const available = new Set();
    for (const node of selected) {
        if (remainingParents[node] === 0) {
            available.add(node);
        }
    }

    const mined = new Set();
    const plan = [];

    while (available.size > 0 && plan.length < remainingClicks) {
        const elapsed = elapsedSeconds + plan.length * clickIntervalSeconds;

        let bestNode = null;
        let bestPriority = -Infinity;

        for (const node of available) {
            const row = Math.floor(node / cols);
            const col = node % cols;
            const value = gridState[row][col];
            const localGrade = lookaheadValues[node] || 0;
            let unlocks = 0;
            for (const child of children[node]) {
                if (!mined.has(child)) unlocks++;
            }
            const localGradePriority = localGrade / (row + 1);
            const immediate = value / Math.pow(1.01, elapsed);
            const priority = immediate + localGradePriority + 0.25 * unlocks;

            if (priority > bestPriority) {
                bestPriority = priority;
                bestNode = node;
            }
        }

        if (bestNode === null) break;

        available.delete(bestNode);
        mined.add(bestNode);
        const row = Math.floor(bestNode / cols);
        const col = bestNode % cols;
        const value = gridState[row][col];
        const discounted = value / Math.pow(1.01, elapsed);

        plan.push({
            row: row,
            col: col,
            value: value,
            time: elapsed,
            discountedValue: discounted
        });

        for (const child of children[bestNode]) {
            remainingParents[child]--;
            if (remainingParents[child] === 0 && !mined.has(child)) {
                available.add(child);
            }
        }
    }

    while (plan.length > 0 && plan[plan.length - 1].value < 0) {
        plan.pop();
    }

    return plan;
}

function beamSchedule(
    gridState,
    selected,
    elapsedSeconds = 0.0,
    beamWidth = 300,
    branchLimit = 6,
    clickIntervalSeconds = 0.5625
) {
    const remainingClicks = Math.max(0, Math.floor((90 - elapsedSeconds) / clickIntervalSeconds));
    const selectedNodes = Array.from(selected).sort((a, b) => a - b);
    const values = {};
    for (const node of selectedNodes) {
        const r = Math.floor(node / cols);
        const c = node % cols;
        values[node] = gridState[r][c];
    }

    // Pre-compute node BigInt bitmasks
    const nodeBits = new Array(rows * cols);
    for (let i = 0; i < rows * cols; i++) {
        nodeBits[i] = 1n << BigInt(i);
    }

    const parentMasks = {};
    for (const node of selectedNodes) {
        const row = Math.floor(node / cols);
        const col = node % cols;
        const needed = getParents(row, col);
        let mask = 0n;
        for (const p of needed) {
            if (selected.has(p)) {
                mask |= nodeBits[p];
            }
        }
        parentMasks[node] = mask;
    }

    const children = selectedChildren(selected);
    const lookaheadValues = threeRowLookaheadValues(gridState, selected);

    function getAvailableNodes(minedMask) {
        const avail = [];
        for (const node of selectedNodes) {
            const bit = nodeBits[node];
            if (!(minedMask & bit)) {
                if ((parentMasks[node] & ~minedMask) === 0n) {
                    avail.push(node);
                }
            }
        }
        return avail;
    }

    function getCandidatePriority(node, minedMask, elapsed) {
        const val = values[node];
        let unlocks = 0;
        for (const child of children[node]) {
            const bit = nodeBits[child];
            if (!(minedMask & bit)) unlocks++;
        }
        const immediate = val / Math.pow(1.01, elapsed);
        const lookahead = lookaheadValues[node] || 0;
        return immediate + lookahead + 0.25 * unlocks;
    }

    function getOptimisticRank(score, minedMask, depth) {
        const slots = remainingClicks - depth;
        if (slots <= 0) return score;

        const positives = [];
        for (const node of selectedNodes) {
            const val = values[node];
            if (val > 0) {
                const bit = nodeBits[node];
                if (!(minedMask & bit)) {
                    positives.push(val);
                }
            }
        }
        positives.sort((a, b) => b - a);

        let future = 0.0;
        const limit = Math.min(slots, positives.length);
        for (let i = 0; i < limit; i++) {
            const elapsed = elapsedSeconds + (depth + i) * clickIntervalSeconds;
            future += positives[i] / Math.pow(1.01, elapsed);
        }
        return score + future;
    }

    let beam = [[0.0, 0n, []]];
    let bestScore = 0.0;
    let bestPlan = [];

    const selectedMask = selectedNodes.reduce((mask, node) => mask | nodeBits[node], 0n);

    for (let depth = 0; depth < remainingClicks; depth++) {
        const nextByMask = new Map();
        let anyExtended = false;

        const elapsed = elapsedSeconds + depth * clickIntervalSeconds;

        for (const [score, minedMask, nodePlan] of beam) {
            const candidates = getAvailableNodes(minedMask);
            if (candidates.length === 0) continue;

            candidates.sort((a, b) => {
                return getCandidatePriority(b, minedMask, elapsed) - getCandidatePriority(a, minedMask, elapsed);
            });

            const limit = Math.min(branchLimit, candidates.length);
            for (let i = 0; i < limit; i++) {
                anyExtended = true;
                const node = candidates[i];
                const nextMask = minedMask | nodeBits[node];
                const nextScore = score + values[node] / Math.pow(1.01, elapsed);
                const nextPlan = [...nodePlan, node];

                const existing = nextByMask.get(nextMask);
                if (!existing || nextScore > existing[0]) {
                    nextByMask.set(nextMask, [nextScore, nextMask, nextPlan]);
                }

                if (nextScore > bestScore) {
                    bestScore = nextScore;
                    bestPlan = nextPlan;
                }
            }
        }

        if (!anyExtended) break;

        const nextStates = Array.from(nextByMask.values());

        // Schwartzian transform: precompute optimistic rank for each state before sorting
        const statesWithRank = nextStates.map(state => {
            return {
                state: state,
                rank: getOptimisticRank(state[0], state[1], state[2].length)
            };
        });

        statesWithRank.sort((a, b) => b.rank - a.rank);
        beam = statesWithRank.slice(0, beamWidth).map(item => item.state);

        if (beam.length > 0 && beam[0][1] === selectedMask) {
            break;
        }
    }

    const plan = [];
    for (let i = 0; i < bestPlan.length; i++) {
        const node = bestPlan[i];
        const row = Math.floor(node / cols);
        const col = node % cols;
        const elapsed = elapsedSeconds + i * clickIntervalSeconds;
        const val = values[node];
        plan.push({
            row: row,
            col: col,
            value: val,
            time: elapsed,
            discountedValue: val / Math.pow(1.01, elapsed)
        });
    }

    while (plan.length > 0 && plan[plan.length - 1].value < 0) {
        plan.pop();
    }

    return plan;
}

function calculateCapex(clicks) {
    if (clicks < 120) return -200;
    return -(200 + (200 / 120) * (clicks - 120));
}

function buildCashFlows(clicksCount, minedList) {
    const cashFlows = new Array(16).fill(0);
    cashFlows[0] = calculateCapex(clicksCount);
    for (const block of minedList) {
        let year = Math.ceil(block.time / 6);
        if (year < 1) year = 1;
        if (year > 15) year = 15;
        cashFlows[year] += block.value;
    }

    // Log built cash flows for verification
    console.log("--- IRR Cash Flows ---");
    console.log(`Clicks count: ${clicksCount}, Capex (Year 0): $${cashFlows[0].toFixed(2)}`);
    for (let y = 1; y <= 15; y++) {
        console.log(`  Year ${y} (seconds ${(y - 1) * 6} to ${y * 6}): $${cashFlows[y].toFixed(2)}`);
    }
    return cashFlows;
}

function calculateIRR(cashFlows) {
    const npv = (r) => {
        let sum = cashFlows[0];
        for (let k = 1; k < cashFlows.length; k++) {
            sum += cashFlows[k] / Math.pow(1 + r, k);
        }
        return sum;
    };

    // If all future cash flows are non-positive, IRR is -100%
    const positiveFuture = cashFlows.slice(1).some(cf => cf > 0);
    if (!positiveFuture) {
        console.log("IRR Solver: No positive future cash flows found. IRR is automatically -100.00%");
        return -1.0;
    }

    // Bracketing Search: Find a discount rate 'low' where NPV(low) > 0.
    // At very high discount rates (like 100.0), NPV is almost always negative (approaching Year 0 Capex).
    let low = null;
    let high = 100.0;

    // 1. Try r = 0 first (standard case for positive IRR)
    if (npv(0.0) > 0) {
        low = 0.0;
    } else {
        // 2. If npv(0) <= 0, search negative rates where NPV might be positive (negative IRR).
        // Scan downwards from -0.01 to -0.95
        const scanRates = [
            -0.01, -0.02, -0.05, -0.1, -0.15, -0.2, -0.3, -0.4, -0.5, -0.6, -0.7, -0.8, -0.9, -0.95
        ];
        for (const r of scanRates) {
            if (npv(r) > 0) {
                low = r;
                high = 0.0; // The root lies between r and 0
                break;
            }
        }
    }

    // 3. If no rate yields NPV > 0, the project is a total loss (no break-even possible)
    if (low === null) {
        console.log("IRR Solver: No bracket found where NPV > 0. IRR is capped at -100.00%");
        return -1.0;
    }

    console.log("IRR Solver (Bisection Method) Start:");
    console.log(`  Initial Verified Range: [${(low * 100).toFixed(1)}%, ${(high * 100).toFixed(1)}%]`);

    let mid = 0;
    for (let i = 0; i < 60; i++) {
        mid = (low + high) / 2;
        const fMid = npv(mid);

        console.log(`  Iteration ${i}: r = ${(mid * 100).toFixed(4)}%, NPV = $${fMid.toFixed(6)}`);

        if (Math.abs(fMid) < 1e-6 || (high - low) < 1e-12) {
            console.log(`  Converged on iteration ${i}. Final IRR = ${(mid * 100).toFixed(4)}%`);
            return mid;
        }

        if (fMid > 0) {
            low = mid;
        } else {
            high = mid;
        }
    }

    console.log(`  Bisection finished. Final IRR = ${(mid * 100).toFixed(4)}%`);
    return mid;
}

function runAiStep() {
    if (gameOver || !isAiMode) {
        clearInterval(aiTimerId);
        return;
    }
    if (aiPlanIndex >= aiPlan.length) {
        clearInterval(aiTimerId);
        clearInterval(timer);
        gameOver = true;
        finishGame();
        return;
    }

    const step = aiPlan[aiPlanIndex++];

    // Simulate mining the block
    const blockValue = grid[step.row][step.col];
    grid[step.row][step.col] = 0;
    blocksMined++;

    fadingBlocks.push(new FadingBlock(step.row, step.col, blockValue));

    // Update score using the pre-computed discounted value from the plan
    score += step.discountedValue;
    document.getElementById('score').textContent = `$${score.toFixed(2)}`;
}

// AI Event Listeners
document.getElementById('watchAiBtn').addEventListener('click', () => {
    try {
        startGame(false, true); // isResuming = false, isAi = true
    } catch (err) {
        alert("AI Solver Error: " + err.message + "\nStack: " + err.stack);
    }
});

document.getElementById('abortAiBtn').addEventListener('click', () => {
    if (isAiMode) {
        clearInterval(aiTimerId);
        clearInterval(timer);
        isAiMode = false;
        gameOver = true;
        document.getElementById('aiControls').style.display = 'none';
        showScreen('leaderboardScreen');
    }
});

document.getElementById('closeAiModalBtn').addEventListener('click', () => {
    document.getElementById('aiResultModal').style.display = 'none';
});

// --- Email Reminder Signup ---
const reminderEmailInput = document.getElementById('reminderEmailInput');
const submitReminderBtn = document.getElementById('submitReminderBtn');
const reminderMessage = document.getElementById('reminderMessage');

if (submitReminderBtn) {
    submitReminderBtn.addEventListener('click', async () => {
        const email = reminderEmailInput.value.trim();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            alert("Please enter a valid email address!");
            return;
        }

        submitReminderBtn.disabled = true;
        submitReminderBtn.textContent = "Saving...";
        reminderMessage.style.display = 'none';

        try {
            const { error } = await supabaseClient
                .from('subscribers')
                .insert([{ email: email }]);

            if (error) {
                if (error.code === '23505') { // Postgres duplicate key error code
                    reminderMessage.style.color = 'var(--success)';
                    reminderMessage.textContent = "✓ You are already subscribed!";
                } else {
                    console.error("Database subscription error:", error);
                    throw new Error(error.message);
                }
            } else {
                reminderMessage.style.color = 'var(--success)';
                reminderMessage.textContent = "✓ Subscribed successfully!";
            }
            
            reminderMessage.style.display = 'block';
            reminderEmailInput.value = '';
        } catch (err) {
            console.error("Mailing list signup failed:", err);
            reminderMessage.style.color = 'var(--danger)';
            reminderMessage.textContent = "⚠ Subscription failed. Please try again.";
            reminderMessage.style.display = 'block';
        } finally {
            submitReminderBtn.disabled = false;
            submitReminderBtn.textContent = "Notify Me";
        }
    });
}

// --- Email Reminder Signup (End Screen) ---
const reminderEmailInputEnd = document.getElementById('reminderEmailInputEnd');
const submitReminderBtnEnd = document.getElementById('submitReminderBtnEnd');
const reminderMessageEnd = document.getElementById('reminderMessageEnd');

if (submitReminderBtnEnd) {
    submitReminderBtnEnd.addEventListener('click', async () => {
        const email = reminderEmailInputEnd.value.trim();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            alert("Please enter a valid email address!");
            return;
        }

        submitReminderBtnEnd.disabled = true;
        submitReminderBtnEnd.textContent = "Saving...";
        reminderMessageEnd.style.display = 'none';

        try {
            const { error } = await supabaseClient
                .from('subscribers')
                .insert([{ email: email }]);

            if (error) {
                if (error.code === '23505') { // Postgres duplicate key error code
                    reminderMessageEnd.style.color = 'var(--success)';
                    reminderMessageEnd.textContent = "✓ You are already subscribed!";
                } else {
                    console.error("Database subscription error:", error);
                    throw new Error(error.message);
                }
            } else {
                reminderMessageEnd.style.color = 'var(--success)';
                reminderMessageEnd.textContent = "✓ Subscribed successfully!";
            }
            
            reminderMessageEnd.style.display = 'block';
            reminderEmailInputEnd.value = '';
        } catch (err) {
            console.error("Mailing list signup failed:", err);
            reminderMessageEnd.style.color = 'var(--danger)';
            reminderMessageEnd.textContent = "⚠ Subscription failed. Please try again.";
            reminderMessageEnd.style.display = 'block';
        } finally {
            submitReminderBtnEnd.disabled = false;
            submitReminderBtnEnd.textContent = "Notify Me";
        }
    });
}

// Initial Load
setupSortControls();
checkIfPlayedToday();
loadLeaderboard();
