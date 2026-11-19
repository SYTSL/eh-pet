const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const foodIcons = require('./food-icons.js');

const products = [
  { id: 'woodPickaxe', name: '木镐', icon: 'pickaxes.png', price: 150 },
  { id: 'cocoa', name: '可可果', icon: 'cocoa.png', price: 200 },
  { id: 'chicken', name: '炸鸡腿', icon: foodIcons.chicken, animation: '吃炸鸡腿', price: 500 },
  { id: 'catTicket', name: '猫咖券', icon: require('./cat-ticket-icon.js'), animation: '撸猫', price: 1000 },
  { id: 'cake', name: '蛋糕', icon: foodIcons.cake, animation: '吃蛋糕', price: 900 },
];

function walletFile() {
  return path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'dsh-pet', 'wallet.json');
}

function readWallet() {
  const file = walletFile();
  const saved = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const wallet = Object.fromEntries(['emeralds', ...products.map(({id}) => id), 'miningBoost'].map((key) => {
    const value = saved[key] === undefined ? 0 : saved[key];
    if (!Number.isSafeInteger(value) || value < 0 ||
        (key === 'miningBoost' && value !== 0 && (value < 115 || value > 150))) throw new Error('背包数据无效');
    return [key, value];
  }));
  if (saved.portfolio !== undefined) wallet.portfolio = saved.portfolio;
  return wallet;
}

function saveWallet(wallet) {
  const file = walletFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(wallet, null, 2));
  fs.renameSync(file + '.tmp', file);
}

function rewardEmeralds(count) {
  const wallet = readWallet();
  wallet.emeralds += count;
  saveWallet(wallet);
  return wallet;
}

function claimMiningBoost() {
  const wallet = readWallet();
  const boost = wallet.miningBoost;
  if (boost) { wallet.miningBoost = 0; saveWallet(wallet); }
  return boost || 100;
}

function restoreMiningBoost(boost) {
  if (boost <= 100) return;
  const wallet = readWallet();
  wallet.miningBoost = Math.max(wallet.miningBoost, boost);
  saveWallet(wallet);
}

function shopRequest(action, item) {
  const wallet = readWallet();
  if (action === 'shop-buy') {
    const { id, quantity } = typeof item === 'string' ? { id: item, quantity: 1 } : (item || {});
    const product = products.find((entry) => entry.id === id);
    if (!product || product.price === null) throw new Error('这件商品尚未定价');
    if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('请输入有效的购买数量');
    if (id === 'woodPickaxe' && (wallet.woodPickaxe || quantity !== 1)) throw new Error('木镐只能购买一把');
    if (quantity > Math.floor(wallet.emeralds / product.price)) throw new Error('绿宝石不够');
    wallet.emeralds -= product.price * quantity;
    wallet[id] += quantity * (id === 'catTicket' ? 3 : 1);
    saveWallet(wallet);
  }
  if (action === 'pet-item-action') {
    if (item === 'mine') {
      if (!wallet.woodPickaxe) throw new Error('需要先有一把木镐');
    } else if (item === 'feed' || item === 'steal') {
      if (!wallet.cocoa) {
        if (item === 'steal') return { ok: true, played: false };
        throw new Error('背包里没有可可果');
      }
      wallet.cocoa--;
      wallet.miningBoost = Math.max(wallet.miningBoost, require('node:crypto').randomInt(115, 151));
      saveWallet(wallet);
    } else if (item === 'chicken' || item === 'cake' || item === 'catTicket') {
      if (!wallet[item]) throw new Error('背包里没有这件食物');
      wallet[item]--;
      saveWallet(wallet);
    } else throw new Error('未知动作');
    return { ok: true, played: true, boost: wallet.miningBoost };
  }
  return { ok: true, wallet, products };
}

const stocks = [
  { id: 'cocoa', name: '可可果园', base: 24 },
  { id: 'mine', name: '绿晶矿业', base: 36 },
  { id: 'cake', name: '云朵甜品', base: 18 },
];

function stockRequest(action, input) {
  const wallet = readWallet();
  const positions = wallet.portfolio ?? {};
  const tick = Math.floor(Date.now() / 15000);
  const market = stocks.map((stock, index) => {
    const priceAt = time => {
      const swing = Math.sin(time / (4 + index) + index) * 0.22;
      const ripple = Math.sin(time * (1.19 + index / 10)) * 0.07;
      return Math.round(stock.base * (1 + swing + ripple));
    };
    const history = Array.from({ length: 24 }, (_, offset) => {
      const time = tick - 23 + offset;
      const samples = [0, 0.25, 0.5, 0.75, 1].map(fraction => priceAt(time - 1 + fraction));
      return { time: time * 15000, open: samples[0], high: Math.max(...samples),
        low: Math.min(...samples), close: samples.at(-1) };
    });
    return { ...stock, price: history.at(-1).close, history };
  });
  let receipt;
  if (action === 'stock-trade') {
    const { id, side, quantity, price } = input || {};
    const stock = market.find(entry => entry.id === id);
    if (!stock || !['buy', 'sell'].includes(side) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 9999)
      throw new Error('请选择股票并输入 1–9999 股');
    if (price !== stock.price) throw new Error('价格已变动，请刷新后重试');
    const position = positions[id] ?? { shares: 0, cost: 0 };
    const amount = quantity * stock.price;
    if (side === 'buy') {
      if (amount > wallet.emeralds) throw new Error('绿宝石不够');
      wallet.emeralds -= amount;
      positions[id] = { shares: position.shares + quantity, cost: position.cost + amount };
    } else {
      if (quantity > position.shares) throw new Error('持仓股数不够');
      const balance = wallet.emeralds + amount;
      if (!Number.isSafeInteger(balance)) throw new Error('余额超出上限');
      const cost = quantity === position.shares ? position.cost
        : Math.round(position.cost * (quantity / position.shares));
      receipt = { name: stock.name, quantity, price: stock.price, revenue: amount, cost, profit: amount - cost };
      wallet.emeralds = balance;
      if (quantity === position.shares) delete positions[id];
      else positions[id] = { shares: position.shares - quantity, cost: position.cost - cost };
    }
    wallet.portfolio = positions;
    saveWallet(wallet);
  }
  return {
    ok: true, emeralds: wallet.emeralds, receipt,
    stocks: market.map(stock => ({ ...stock, shares: 0, cost: 0, ...positions[stock.id] })),
  };
}

module.exports = { stockRequest, rewardEmeralds, claimMiningBoost, restoreMiningBoost, shopRequest };
