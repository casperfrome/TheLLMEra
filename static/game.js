// --- 配置部分 ---
const MODELS = [
    { id: 0, name: "GPT",     img: "assets/gpt.png",     base: { hp: 120, atk: 25, def: 10 } },
    { id: 1, name: "Claude",  img: "assets/claude.png",  base: { hp: 100, atk: 20, def: 15 } },
    { id: 2, name: "Gemini",  img: "assets/gemini.png",  base: { hp: 140, atk: 18, def: 8  } },
    { id: 3, name: "Llama",   img: "assets/llama.png",   base: { hp: 90,  atk: 22, def: 5  } },
    { id: 4, name: "Mistral", img: "assets/mistral.png", base: { hp: 80,  atk: 28, def: 3  } },
    { id: 5, name: "Grok",    img: "assets/grok.png",    base: { hp: 110, atk: 20, def: 10 } }
];

const PACK_PRICE = 100;

// --- 全局状态 ---
let gameData = {
    gold: 1000,
    inventory: [],
    selectedCardId: null,
    autoFuse: false
};

// --- 初始化 ---
window.onload = async () => {
    await loadGame();
    if(document.getElementById('auto-fuse-check')) {
        document.getElementById('auto-fuse-check').checked = !!gameData.autoFuse;
    }
    renderUI();
};

// --- API ---
async function loadGame() {
    try {
        const res = await fetch('/api/load');
        if (res.ok) {
            gameData = await res.json();
            if (!gameData.inventory) gameData.inventory = [];
            document.getElementById('loading').classList.add('hidden');
            document.getElementById('inventory-grid').classList.remove('hidden');
        }
    } catch (e) { console.error(e); }
}

async function saveGame() {
    await fetch('/api/save', { method: 'POST', body: JSON.stringify(gameData) });
}

// --- 玩法逻辑 ---

// 1. 抽卡
async function buyPack() {
    if (gameData.gold < PACK_PRICE) {
        alert("算力(金币)不足！需要 " + PACK_PRICE + "G");
        return;
    }
    gameData.gold -= PACK_PRICE;
    
    // 抽卡
    for (let i = 0; i < 5; i++) {
        gameData.inventory.push(generateRandomCard());
    }

    // 视觉反馈
    const btn = document.querySelector('.btn-primary');
    showFloatingText(btn, "+5 NEW MODELS", "float-text");

    // 自动合成检查
    if (gameData.autoFuse) {
        // 短暂延迟，保证+5动画先出来，且让玩家意识到“买”了这个动作
        await new Promise(r => setTimeout(r, 50)); 
        const fused = executeFusionLogic(true); 
        if (fused > 0) {
            // 再给个小延迟显示升级文字，避免重叠
            setTimeout(() => {
                showFloatingText(btn, `⚡ SCALING LAW: ${fused} UPGRADED`, "float-text-gold");
            }, 200);
        }
    }

    await saveGame();
    renderUI();
}

function generateRandomCard(level = 0) {
    const typeIdx = Math.floor(Math.random() * MODELS.length);
    const model = MODELS[typeIdx];
    const variance = () => 0.8 + Math.random() * 0.4;
    const multiplier = Math.pow(2.5, level);

    return {
        uuid: crypto.randomUUID(),
        type: typeIdx,
        level: level,
        hp: Math.floor(model.base.hp * multiplier * variance()),
        atk: Math.floor(model.base.atk * multiplier * variance()),
        def: Math.floor(model.base.def * multiplier * variance())
    };
}

// 2. 合成逻辑
function manualFuse() {
    const fused = executeFusionLogic(false);
    if (fused > 0) {
        saveGame();
        renderUI();
    }
}

function executeFusionLogic(isAuto) {
    if (gameData.inventory.length < 5) {
        if (!isAuto) alert("卡牌数量不足");
        return 0;
    }

    let fusedCount = 0;
    const MAX_LEVEL = 10;
    
    // 桶排序
    let buckets = Array.from({ length: MAX_LEVEL + 1 }, () => 
        Array.from({ length: MODELS.length }, () => [])
    );

    gameData.inventory.forEach(card => {
        const lvl = Math.min(card.level, MAX_LEVEL);
        buckets[lvl][card.type].push(card);
    });

    // 级联处理
    for (let lvl = 0; lvl < MAX_LEVEL; lvl++) {
        for (let type = 0; type < MODELS.length; type++) {
            let cards = buckets[lvl][type];
            while (cards.length >= 5) {
                const materials = cards.splice(0, 5);
                let sumHp = 0, sumAtk = 0, sumDef = 0;
                materials.forEach(m => { sumHp += m.hp; sumAtk += m.atk; sumDef += m.def; });

                const newCard = {
                    uuid: crypto.randomUUID(),
                    type: type,
                    level: lvl + 1,
                    hp: Math.floor(sumHp / 2),
                    atk: Math.floor(sumAtk / 2),
                    def: Math.floor(sumDef / 2)
                };

                buckets[lvl + 1][type].push(newCard);
                fusedCount++;
                
                materials.forEach(m => {
                    if(m.uuid === gameData.selectedCardId) gameData.selectedCardId = null;
                });
            }
        }
    }

    if (fusedCount > 0) {
        let newInventory = [];
        buckets.forEach(levelBucket => levelBucket.forEach(typeBucket => newInventory.push(...typeBucket)));
        gameData.inventory = newInventory;

        if (!isAuto) alert(`⚡ Scaling Law 生效！升级了 ${fusedCount} 个模型。`);
    } else {
        if (!isAuto) alert("没有可合成的卡牌 (需5张同名同级)");
    }
    
    return fusedCount;
}

function toggleAutoFuse() {
    const checkbox = document.getElementById('auto-fuse-check');
    gameData.autoFuse = checkbox.checked;
    saveGame();
}

// 3. 装备系统
function selectCard(uuid) {
    gameData.selectedCardId = (gameData.selectedCardId === uuid) ? null : uuid;
    renderUI();
}

// 4. 战斗系统
async function startBattle() {
    const playerCard = gameData.inventory.find(c => c.uuid === gameData.selectedCardId);
    if (!playerCard) {
        alert("请先在库存中点击一张卡牌进行【装备】！");
        return;
    }

    let enemyLevel = Math.max(0, playerCard.level + (Math.random() > 0.6 ? 1 : 0)); 
    if(Math.random() > 0.8 && enemyLevel > 0) enemyLevel--; 
    const enemyCard = generateRandomCard(enemyLevel);

    const modal = document.getElementById('battle-modal');
    modal.classList.remove('hidden');
    document.getElementById('close-battle-btn').classList.add('hidden');
    
    const pModel = MODELS[playerCard.type];
    const eModel = MODELS[enemyCard.type];
    
    document.getElementById('p-img').src = pModel.img;
    document.getElementById('p-name').innerText = `${pModel.name} (+${playerCard.level})`;
    document.getElementById('e-img').src = eModel.img;
    document.getElementById('e-name').innerText = `${eModel.name} (+${enemyCard.level})`;

    const logEl = document.getElementById('battle-log');
    logEl.innerHTML = `<div class="log-sys">> Connection established. Context Window initialized.</div>`;

    await runBattleLoop(playerCard, enemyCard, logEl);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runBattleLoop(pCard, eCard, logEl) {
    let p = { ...pCard, maxHp: pCard.hp, currentHp: pCard.hp, heat: 0 };
    let e = { ...eCard, maxHp: eCard.hp, currentHp: eCard.hp, heat: 0 };
    let round = 1;
    let isWin = false;

    const updateBars = () => {
        document.getElementById('p-hp-bar').style.width = (Math.max(0, p.currentHp) / p.maxHp * 100) + "%";
        document.getElementById('p-hp-text').innerText = `${Math.max(0, p.currentHp)}/${p.maxHp}`;
        document.getElementById('p-heat').innerText = (p.heat / 100).toFixed(1);

        document.getElementById('e-hp-bar').style.width = (Math.max(0, e.currentHp) / e.maxHp * 100) + "%";
        document.getElementById('e-hp-text').innerText = `${Math.max(0, e.currentHp)}/${e.maxHp}`;
        document.getElementById('e-heat').innerText = (e.heat / 100).toFixed(1);
    };
    
    const log = (msg, type="") => {
        const div = document.createElement('div');
        div.className = "log-entry " + type;
        div.innerHTML = `[T${round}] ${msg}`;
        logEl.appendChild(div);
        logEl.scrollTop = logEl.scrollHeight;
    };

    updateBars();
    await sleep(1000);

    while (p.currentHp > 0 && e.currentHp > 0) {
        // Player
        log(`${MODELS[p.type].name} is generating tokens...`);
        await sleep(500);
        p.heat = Math.min(100, p.heat + 10 + Math.random() * 10);
        
        let dmg = Math.max(1, p.atk - e.def);
        if (Math.random() * 100 < (p.heat / 3)) {
            const selfDmg = Math.floor(p.maxHp * 0.1);
            p.currentHp -= selfDmg;
            log(`⚠ OOM Error! Self-harm ${selfDmg}.`, "log-crit");
        } else {
            if (Math.random() * 100 < p.heat) {
                dmg = Math.floor(dmg * 1.5);
                log(`⚡ Hallucination Hit! Crit ${dmg}!`, "log-crit");
            } else {
                log(`Output generated. Dmg ${dmg}.`);
            }
            e.currentHp -= dmg;
        }
        updateBars();
        if (e.currentHp <= 0 || p.currentHp <= 0) break;
        await sleep(700);

        // Enemy
        log(`${MODELS[e.type].name} is responding...`);
        await sleep(500);
        e.heat = Math.min(100, e.heat + 10 + Math.random() * 10);

        let eDmg = Math.max(1, e.atk - p.def);
        if (Math.random() * 100 < (e.heat / 3)) {
            const selfDmg = Math.floor(e.maxHp * 0.1);
            e.currentHp -= selfDmg;
            log(`⚠ Enemy OOM! Self-harm ${selfDmg}.`, "log-sys");
        } else {
            if (Math.random() * 100 < e.heat) {
                eDmg = Math.floor(eDmg * 1.5);
                log(`⚡ Enemy Hallucination! Crit ${eDmg}!`, "log-crit");
            } else {
                log(`Response received. Took ${eDmg} dmg.`);
            }
            p.currentHp -= eDmg;
        }
        updateBars();
        await sleep(700);
        round++;
    }

    if (p.currentHp > 0) {
        log(`🏆 WINNER: PLAYER! +50 Gold`, "log-sys");
        gameData.gold += 50;
        isWin = true;
    } else {
        log(`💀 SYSTEM FAILURE. +10 Gold`, "log-crit");
        gameData.gold += 10;
    }

    saveGame();
    renderUI();
    const closeBtn = document.getElementById('close-battle-btn');
    closeBtn.classList.remove('hidden');
    closeBtn.innerText = isWin ? "战斗胜利 (点击关闭)" : "战斗失败 (点击关闭)";
}

function closeBattle() {
    document.getElementById('battle-modal').classList.add('hidden');
}

// 5. UI 渲染与排序优化
function renderUI() {
    document.getElementById('gold-display').innerText = gameData.gold;
    const grid = document.getElementById('inventory-grid');
    grid.innerHTML = '';

    // 排序：总属性 > 等级 > 类型
    const sortedInv = [...gameData.inventory].sort((a, b) => {
        const totalA = a.hp + a.atk + a.def;
        const totalB = b.hp + b.atk + b.def;
        if (totalB !== totalA) return totalB - totalA;
        if (b.level !== a.level) return b.level - a.level;
        return a.type - b.type;
    });

    sortedInv.forEach(card => {
        grid.appendChild(createCardElement(card));
    });
}

function createCardElement(card) {
    const model = MODELS[card.type];
    const div = document.createElement('div');
    
    let classes = `card lvl-${card.level}`;
    if (gameData.selectedCardId === card.uuid) classes += " equipped";
    div.className = classes;
    div.onclick = () => selectCard(card.uuid);

    const total = card.hp + card.atk + card.def;

    div.innerHTML = `
        <div class="card-title">${model.name} (+${card.level})</div>
        <img src="${model.img}" class="card-img" onerror="this.src='assets/card_back.png'">
        <div class="card-stats">
            <div class="stat-row"><span>HP</span> <span class="stat-val">${card.hp}</span></div>
            <div class="stat-row"><span>ATK</span> <span class="stat-val">${card.atk}</span></div>
            <div class="stat-row"><span>DEF</span> <span class="stat-val">${card.def}</span></div>
            <div class="stat-row" style="margin-top:4px; border-top:1px solid #444; padding-top:2px;">
                <span>Total</span> <span style="color:#fff">${total}</span>
            </div>
        </div>
    `;
    return div;
}

// 辅助：显示飘字
function showFloatingText(element, text, className) {
    const rect = element.getBoundingClientRect();
    const span = document.createElement('span');
    span.innerText = text;
    span.className = className;
    // 使用 fixed 定位（相对于视口），避免因绝对定位元素被加入到文档流而触发水平滚动条
    span.style.position = 'fixed';
    const x = rect.left + (rect.width / 2);
    const y = rect.top;

    span.style.left = `${x}px`;
    span.style.top = `${y}px`;

    document.body.appendChild(span);
    setTimeout(() => span.remove(), 1200);
}