const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const foodIcons = require('./food-icons.js');

const products = [
  { id: 'woodPickaxe', name: '木镐', icon: 'pickaxes.png', price: 150 },
  { id: 'cocoa', name: '可可果', icon: 'cocoa.png', price: 200 },
  { id: 'chicken', name: '炸鸡腿', icon: foodIcons.chicken, animation: '吃炸鸡腿', price: 500 },
  { id: 'cake', name: '蛋糕', icon: foodIcons.cake, animation: '吃蛋糕', price: 900 },
];

function walletFile() {
  return path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'dsh-pet', 'wallet.json');
}

function readWallet() {
  const file = walletFile();
  const saved = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  return Object.fromEntries(['emeralds', ...products.map(({id}) => id), 'miningBoost'].map((key) => {
    const value = saved[key] === undefined ? 0 : saved[key];
    if (!Number.isSafeInteger(value) || value < 0 ||
        (key === 'miningBoost' && value !== 0 && (value < 115 || value > 150))) throw new Error('背包数据无效');
    return [key, value];
  }));
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
    wallet[id] += quantity;
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
    } else if (item === 'chicken' || item === 'cake') {
      if (!wallet[item]) throw new Error('背包里没有这件食物');
      wallet[item]--;
      saveWallet(wallet);
    } else throw new Error('未知动作');
    return { ok: true, played: true, boost: wallet.miningBoost };
  }
  return { ok: true, wallet, products };
}

module.exports = { rewardEmeralds, claimMiningBoost, restoreMiningBoost, shopRequest };
